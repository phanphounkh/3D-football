import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    AvailabilityException,
    Booking,
    Field,
    Notification,
    OperatingHour,
    PricingRule,
    User,
    Venue,
)
from app.models.booking import ACTIVE_STATUSES
from app.services.analytics import get_default_commission_bps
from app.services.pricing import price_for_range
from app.services.timeutil import now_utc, to_local

_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I

TRANSITIONS: dict[str, set[str]] = {
    "pending": {"awaiting_payment", "confirmed", "cancelled", "expired"},
    "awaiting_payment": {"confirmed", "cancelled", "expired"},
    "confirmed": {"cancelled", "completed", "refunded"},
    "cancelled": {"refunded"},
    "completed": {"refunded"},
    "expired": set(),
    "refunded": set(),
}


def err(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message, **extra})


def transition(b: Booking, new: str, *, reason: str | None = None, now: datetime | None = None) -> None:
    """The only place a booking's status changes. Illegal moves are a 409, never silently applied."""
    if new not in TRANSITIONS.get(b.status, set()):
        raise err(409, "INVALID_TRANSITION", f"Booking is {b.status.replace('_', ' ')} and can't become {new.replace('_', ' ')}")
    b.status = new
    now = now or now_utc()
    if new == "cancelled":
        b.cancelled_at, b.cancel_reason = now, reason
    if new in ("confirmed", "cancelled", "expired", "completed"):
        b.hold_expires_at = None


def new_reference() -> str:
    return "".join(secrets.choice(_REF_ALPHABET) for _ in range(8))


async def expire_stale_holds(session: AsyncSession, now: datetime | None = None, field_id: uuid.UUID | None = None) -> int:
    """Marks timed-out holds `expired` so the exclusion constraint releases their slot."""
    q = update(Booking).where(Booking.status.in_(("pending", "awaiting_payment")), Booking.hold_expires_at <= (now or now_utc()))
    if field_id:
        q = q.where(Booking.field_id == field_id)
    res = await session.execute(q.values(status="expired", hold_expires_at=None))
    return res.rowcount or 0


async def complete_finished(session: AsyncSession, now: datetime | None = None) -> int:
    res = await session.execute(update(Booking).where(Booking.status == "confirmed", Booking.end_at <= (now or now_utc())).values(status="completed"))
    return res.rowcount or 0


async def create_hold(session: AsyncSession, user: User, field_id: uuid.UUID, start_at: datetime, duration_minutes: int) -> Booking:
    s = get_settings()
    now = now_utc()
    start = start_at.astimezone(UTC)
    end = start + timedelta(minutes=duration_minutes)

    if duration_minutes % s.slot_minutes or not (s.min_duration_minutes <= duration_minutes <= s.max_duration_minutes):
        raise err(422, "INVALID_DURATION", f"Duration must be {s.min_duration_minutes}-{s.max_duration_minutes} minutes in {s.slot_minutes}-minute steps")
    ls = to_local(start)
    if (ls.minute % s.slot_minutes) or ls.second or ls.microsecond:
        raise err(422, "INVALID_START", f"Start time must be on a {s.slot_minutes}-minute boundary")
    if start <= now:
        raise err(422, "IN_THE_PAST", "That time has already passed")
    if start > now + timedelta(days=s.max_booking_days_ahead):
        raise err(422, "TOO_FAR_AHEAD", f"Bookings open up to {s.max_booking_days_ahead} days ahead")

    field = await session.scalar(
        select(Field).join(Venue).where(Field.id == field_id, Field.deleted_at.is_(None), Venue.deleted_at.is_(None), Venue.status == "approved")
        .with_for_update(of=Field))
    if not field:
        raise err(404, "FIELD_NOT_FOUND", "Field not found")
    venue = await session.get(Venue, field.venue_id)

    # the entire range must sit inside one local day's operating window (close_minute <= 1440 also rules out crossing midnight)
    local_start = to_local(start)
    hours = await session.scalar(select(OperatingHour).where(OperatingHour.field_id == field_id, OperatingHour.weekday == local_start.weekday()))
    start_min = local_start.hour * 60 + local_start.minute
    end_min = start_min + duration_minutes
    if not hours or start_min < hours.open_minute or end_min > hours.close_minute:
        raise err(422, "OUTSIDE_HOURS", "The field is closed at that time")

    if await session.scalar(select(func.count()).select_from(AvailabilityException).where(
            AvailabilityException.field_id == field_id, AvailabilityException.start_at < end, AvailabilityException.end_at > start)):
        raise err(409, "SLOT_BLOCKED", "The venue isn't available at that time")

    held = await session.scalar(select(func.count()).select_from(Booking).where(
        Booking.customer_id == user.id, Booking.status.in_(("pending", "awaiting_payment")), Booking.hold_expires_at > now))
    if (held or 0) >= s.max_active_holds_per_user:
        raise err(429, "TOO_MANY_HOLDS", "Finish or cancel your pending reservations first")

    rules = (await session.scalars(select(PricingRule).where(PricingRule.field_id == field_id))).all()
    total = price_for_range(rules, field.base_price_minor, start, end)  # never taken from the client
    bps = venue.commission_bps if venue.commission_bps is not None else await get_default_commission_bps(session)

    await expire_stale_holds(session, now, field_id)  # free any timed-out holds the sweeper hasn't reached yet
    for _ in range(4):
        b = Booking(reference=new_reference(), field_id=field_id, customer_id=user.id, start_at=start, end_at=end, status="awaiting_payment",
                    total_minor=total, commission_minor=total * bps // 10000, currency="USD",
                    hold_expires_at=now + timedelta(minutes=s.booking_hold_minutes))
        try:
            async with session.begin_nested():
                session.add(b)
                await session.flush()
            return b
        except IntegrityError as e:
            msg = str(e.orig)
            if "ex_bookings_no_overlap" in msg:
                raise err(409, "SLOT_TAKEN", "Sorry, that slot was just taken. Please pick another time.") from None
            if "reference" not in msg:
                raise
    raise err(500, "REFERENCE_COLLISION", "Could not allocate a booking reference")


def cancellable_by(user: User, b: Booking, venue_owner_id: uuid.UUID, now: datetime | None = None) -> tuple[bool, str | None]:
    now = now or now_utc()
    if b.status not in ACTIVE_STATUSES:
        return False, "NOT_CANCELLABLE"
    if user.role == "admin" or user.id == venue_owner_id:
        return True, None
    if user.id != b.customer_id:
        return False, "FORBIDDEN"
    if b.status == "confirmed" and b.start_at - now < timedelta(hours=get_settings().cancel_free_hours):
        return False, "CANCEL_WINDOW_PASSED"
    return True, None


async def cancel(session: AsyncSession, user: User, b: Booking, venue: Venue, reason: str | None) -> Booking:
    ok, code = cancellable_by(user, b, venue.owner_id)
    if not ok:
        msgs = {"CANCEL_WINDOW_PASSED": f"Free cancellation ends {get_settings().cancel_free_hours} hours before kick-off. Contact the venue.",
                "NOT_CANCELLABLE": "This booking can't be cancelled."}
        raise err(409 if code != "FORBIDDEN" else 403, code or "FORBIDDEN", msgs.get(code or "", "You can't cancel this booking"))
    transition(b, "cancelled", reason=reason)
    if user.id != b.customer_id:  # tell the customer when someone else cancels
        session.add(Notification(user_id=b.customer_id, kind="booking_cancelled", title=f"Booking {b.reference} was cancelled",
                                 body=reason or "The venue cancelled your booking."))
    return b

