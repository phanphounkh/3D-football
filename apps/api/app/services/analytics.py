"""Dashboard numbers. Everything is a database query over real bookings; dates are business-timezone days."""
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Booking, Field, OperatingHour, PlatformSetting, Refund, User, Venue
from app.schemas.dashboard import (
    AdminAnalytics,
    DayPoint,
    FieldUtil,
    HourPoint,
    OwnerAnalytics,
    TodayBooking,
    TopVenue,
)
from app.services.timeutil import local_wall, now_utc, to_local

REVENUE = ("confirmed", "completed")  # statuses that count as booked revenue


def _local(col):
    return func.timezone(get_settings().business_timezone, col)


def _range(days: int) -> tuple[date, date, datetime, datetime]:
    end = to_local(now_utc()).date()
    start = end - timedelta(days=days - 1)
    return start, end, local_wall(start, 0), local_wall(end + timedelta(days=1), 0)


def _fill(rows: dict[date, tuple[int, int]], start: date, end: date) -> list[DayPoint]:
    out, d = [], start
    while d <= end:
        n, g = rows.get(d, (0, 0))
        out.append(DayPoint(date=d, bookings=n, gross_minor=g))
        d += timedelta(days=1)
    return out


async def get_default_commission_bps(session: AsyncSession) -> int:
    row = await session.get(PlatformSetting, "default_commission_bps")
    return int(row.value["bps"]) if row else get_settings().default_commission_bps


async def owner_analytics(session: AsyncSession, owner_id: uuid.UUID | None, venue_id: uuid.UUID | None, days: int) -> OwnerAnalytics:
    """owner_id=None means "every venue" (admin view)."""
    start, end, t0, t1 = _range(days)
    fq = select(Field.id, Field.name, Venue.name).join(Venue, Field.venue_id == Venue.id).where(Field.deleted_at.is_(None), Venue.deleted_at.is_(None))
    if owner_id:
        fq = fq.where(Venue.owner_id == owner_id)
    if venue_id:
        fq = fq.where(Venue.id == venue_id)
    fields = (await session.execute(fq.order_by(Venue.name, Field.name))).all()
    ids = [f[0] for f in fields]
    in_scope = Booking.field_id.in_(ids) if ids else Booking.field_id.is_(None)
    window = (Booking.start_at >= t0, Booking.start_at < t1)

    day = func.date(_local(Booking.start_at))
    daily_rows = {r[0]: (r[1], r[2]) for r in (await session.execute(
        select(day, func.count(), func.coalesce(func.sum(Booking.total_minor), 0)).where(in_scope, Booking.status.in_(REVENUE), *window).group_by(day))).all()}
    gross, comm, n = (await session.execute(select(func.coalesce(func.sum(Booking.total_minor), 0), func.coalesce(func.sum(Booking.commission_minor), 0), func.count())
                                            .where(in_scope, Booking.status.in_(REVENUE), *window))).one()
    cancelled = await session.scalar(select(func.count()).where(in_scope, Booking.status == "cancelled", *window))

    hour = func.extract("hour", _local(Booking.start_at))
    hours = {int(h): c for h, c in (await session.execute(select(hour, func.count()).where(in_scope, Booking.status.in_(REVENUE), *window).group_by(hour))).all()}

    minutes = func.extract("epoch", Booking.end_at - Booking.start_at) / 60
    booked = {fid: int(m) for fid, m in (await session.execute(
        select(Booking.field_id, func.coalesce(func.sum(minutes), 0)).where(in_scope, Booking.status.in_(REVENUE), *window).group_by(Booking.field_id))).all()}

    open_minutes: dict[uuid.UUID, dict[int, int]] = {i: {} for i in ids}
    if ids:
        for h in await session.scalars(select(OperatingHour).where(OperatingHour.field_id.in_(ids))):
            open_minutes[h.field_id][h.weekday] = h.close_minute - h.open_minute
    util: list[FieldUtil] = []
    for fid, fname, vname in fields:
        avail = sum(open_minutes[fid].get((start + timedelta(days=i)).weekday(), 0) for i in range(days))
        b = booked.get(fid, 0)
        util.append(FieldUtil(field_id=fid, field_name=fname, venue_name=vname, booked_minutes=b, available_minutes=avail, occupancy=round(b / avail, 4) if avail else 0.0))
    tot_avail, tot_booked = sum(u.available_minutes for u in util), sum(u.booked_minutes for u in util)

    today_start, today_end = local_wall(end, 0), local_wall(end + timedelta(days=1), 0)
    today_rows = (await session.execute(
        select(Booking, Field.name, Venue.name, User.full_name).join(Field, Booking.field_id == Field.id).join(Venue, Field.venue_id == Venue.id)
        .join(User, Booking.customer_id == User.id)
        .where(in_scope, Booking.status.in_(("confirmed", "completed", "awaiting_payment")), Booking.start_at >= today_start, Booking.start_at < today_end)
        .order_by(Booking.start_at))).all()
    return OwnerAnalytics(
        days=days, start=start, end=end, gross_minor=int(gross), commission_minor=int(comm), net_minor=int(gross - comm), bookings=n, cancelled=cancelled or 0,
        occupancy=round(tot_booked / tot_avail, 4) if tot_avail else 0.0, daily=_fill(daily_rows, start, end),
        popular_hours=[HourPoint(hour=h, bookings=hours.get(h, 0)) for h in range(24)], fields=util,
        today=[TodayBooking(id=b.id, reference=b.reference, status=b.status, start_at=b.start_at, end_at=b.end_at, field_name=fn, venue_name=vn, customer_name=cn, total_minor=b.total_minor)
               for b, fn, vn, cn in today_rows])


async def admin_analytics(session: AsyncSession, days: int) -> AdminAnalytics:
    start, end, t0, t1 = _range(days)
    window = (Booking.start_at >= t0, Booking.start_at < t1)
    users = dict((await session.execute(select(User.role, func.count()).where(User.deleted_at.is_(None)).group_by(User.role))).all())
    venues = dict((await session.execute(select(Venue.status, func.count()).where(Venue.deleted_at.is_(None)).group_by(Venue.status))).all())
    by_status = dict((await session.execute(select(Booking.status, func.count()).group_by(Booking.status))).all())
    gross, comm = (await session.execute(select(func.coalesce(func.sum(Booking.total_minor), 0), func.coalesce(func.sum(Booking.commission_minor), 0))
                                         .where(Booking.status.in_(REVENUE), *window))).one()
    refunded = await session.scalar(select(func.coalesce(func.sum(Refund.amount_minor), 0)).where(Refund.status == "succeeded", Refund.created_at >= t0, Refund.created_at < t1))
    day = func.date(_local(Booking.start_at))
    rows = (await session.execute(select(day, func.count(), func.coalesce(func.sum(Booking.total_minor), 0), func.coalesce(func.sum(Booking.commission_minor), 0))
                                  .where(Booking.status.in_(REVENUE), *window).group_by(day))).all()
    top = (await session.execute(
        select(Venue.id, Venue.name, func.count(), func.coalesce(func.sum(Booking.total_minor), 0)).join(Field, Field.venue_id == Venue.id).join(Booking, Booking.field_id == Field.id)
        .where(Booking.status.in_(REVENUE), *window).group_by(Venue.id, Venue.name).order_by(func.sum(Booking.total_minor).desc()).limit(5))).all()
    return AdminAnalytics(
        days=days, start=start, end=end, users=users, venues=venues, bookings_by_status=by_status, total_bookings=sum(by_status.values()), total_venues=sum(venues.values()),
        total_users=sum(users.values()), gross_minor=int(gross), commission_minor=int(comm), refunded_minor=int(refunded or 0), pending_venues=venues.get("pending", 0),
        daily=_fill({r[0]: (r[1], r[2]) for r in rows}, start, end), commission_daily=_fill({r[0]: (r[1], r[3]) for r in rows}, start, end),
        top_venues=[TopVenue(venue_id=v, name=n, bookings=c, gross_minor=int(g)) for v, n, c, g in top])
