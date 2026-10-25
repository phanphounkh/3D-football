import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AvailabilityException, Booking, OperatingHour, PricingRule
from app.models.booking import ACTIVE_STATUSES
from app.services.pricing import price_for_range
from app.services.timeutil import local_day_bounds, local_wall, now_utc


@dataclass
class Slot:
    start_at: datetime
    end_at: datetime
    price_minor: int
    available: bool
    reason: str | None = None  # "booked" | "blocked" | "past"


def _blocking_booking_filter(now: datetime):
    """Active bookings, except holds whose time ran out (they're logically free even before the sweeper runs)."""
    return and_(
        Booking.status.in_(ACTIVE_STATUSES),
        or_(Booking.hold_expires_at.is_(None), Booking.hold_expires_at > now, Booking.status == "confirmed"),
    )


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


async def field_schedule(session: AsyncSession, field_id: uuid.UUID, d: date):
    day_start, day_end = local_day_bounds(d)
    hours = await session.scalar(select(OperatingHour).where(OperatingHour.field_id == field_id, OperatingHour.weekday == d.weekday()))
    bookings = (await session.scalars(select(Booking).where(
        Booking.field_id == field_id, Booking.start_at < day_end, Booking.end_at > day_start, _blocking_booking_filter(now_utc())))).all()
    blocks = (await session.scalars(select(AvailabilityException).where(
        AvailabilityException.field_id == field_id, AvailabilityException.start_at < day_end, AvailabilityException.end_at > day_start))).all()
    rules = (await session.scalars(select(PricingRule).where(PricingRule.field_id == field_id))).all()
    return hours, bookings, blocks, rules


async def day_slots(session: AsyncSession, field_id: uuid.UUID, base_price_minor: int, d: date, duration_minutes: int) -> list[Slot]:
    s = get_settings()
    hours, bookings, blocks, rules = await field_schedule(session, field_id, d)
    if hours is None:
        return []
    now = now_utc()
    out: list[Slot] = []
    for minute in range(hours.open_minute, hours.close_minute - duration_minutes + 1, s.slot_minutes):
        start = local_wall(d, minute)
        end = start + timedelta(minutes=duration_minutes)
        reason = None
        if start <= now:
            reason = "past"
        elif any(_overlaps(start, end, b.start_at, b.end_at) for b in bookings):
            reason = "booked"
        elif any(_overlaps(start, end, x.start_at, x.end_at) for x in blocks):
            reason = "blocked"
        out.append(Slot(start, end, price_for_range(rules, base_price_minor, start, end), reason is None, reason))
    return out
