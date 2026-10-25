import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from app.audit import audit
from app.config import get_settings
from app.deps import CurrentUser, Session
from app.models import Booking, Field, User, Venue
from app.ratelimit import rate_limit
from app.schemas.booking import (
    AvailabilityOut,
    BookingCreate,
    BookingOut,
    BookingPage,
    CancelIn,
    SlotOut,
)
from app.services import bookings as svc
from app.services import payments as pay_svc
from app.services.availability import day_slots
from app.services.timeutil import now_utc

router = APIRouter(tags=["bookings"])
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


@router.get("/fields/{field_id}/availability", response_model=AvailabilityOut)
async def availability(field_id: uuid.UUID, session: Session, date: date,
                       duration: Annotated[int, Query(ge=30, le=1440)] = 60) -> AvailabilityOut:
    s = get_settings()
    if duration % s.slot_minutes or not (s.min_duration_minutes <= duration <= s.max_duration_minutes):
        raise svc.err(422, "INVALID_DURATION", f"Duration must be {s.min_duration_minutes}-{s.max_duration_minutes} minutes in {s.slot_minutes}-minute steps")
    field = await session.scalar(select(Field).join(Venue).where(
        Field.id == field_id, Field.deleted_at.is_(None), Venue.deleted_at.is_(None), Venue.status == "approved"))
    if not field:
        raise svc.err(404, "FIELD_NOT_FOUND", "Field not found")
    slots = await day_slots(session, field.id, field.base_price_minor, date, duration)
    return AvailabilityOut(field_id=field.id, date=date, timezone=s.business_timezone, duration_minutes=duration,
                           slots=[SlotOut(**vars(x)) for x in slots])


def _out(b: Booking, field: Field, venue: Venue, user: User, customer: User | None = None, payment=None) -> BookingOut:
    ok, _ = svc.cancellable_by(user, b, venue.owner_id)
    privileged = user.role == "admin" or user.id == venue.owner_id
    return BookingOut(
        id=b.id, reference=b.reference, status=b.status, start_at=b.start_at, end_at=b.end_at, total_minor=b.total_minor,
        currency=b.currency, hold_expires_at=b.hold_expires_at, created_at=b.created_at, cancelled_at=b.cancelled_at,
        field=field, venue=venue, cancellable=ok, customer_name=customer.full_name if privileged and customer else None, payment=payment)


async def _load(session: Session, booking_id: uuid.UUID, user: User) -> tuple[Booking, Field, Venue]:
    row = (await session.execute(select(Booking, Field, Venue).join(Field, Booking.field_id == Field.id).join(Venue, Field.venue_id == Venue.id)
                                 .where(Booking.id == booking_id).with_for_update(of=Booking).execution_options(populate_existing=True))).first()
    if row and not (user.role == "admin" or row[0].customer_id == user.id or row[2].owner_id == user.id):
        row = None
    if not row:
        raise svc.err(404, "BOOKING_NOT_FOUND", "Booking not found")  # same answer for "missing" and "not yours"
    return row


@router.post("/bookings", response_model=BookingOut, status_code=201, dependencies=[Depends(rate_limit("hold", 20, 60))])
async def create_booking(body: BookingCreate, user: CurrentUser, session: Session, request: Request) -> BookingOut:
    b = await svc.create_hold(session, user, body.field_id, body.start_at, body.duration_minutes)
    audit(session, user.id, "booking.hold", "booking", b.id, {"field_id": str(b.field_id), "start_at": b.start_at.isoformat()}, request)
    await session.commit()
    field = await session.get(Field, b.field_id)
    venue = await session.get(Venue, field.venue_id)
    return _out(b, field, venue, user)


@router.get("/bookings", response_model=BookingPage)
async def my_bookings(user: CurrentUser, session: Session, status: str | None = None, upcoming: bool | None = None,
                      page: Page = 1, page_size: PageSize = 20) -> BookingPage:
    await svc.expire_stale_holds(session)
    where = [Booking.customer_id == user.id]
    if status:
        where.append(Booking.status == status)
    if upcoming is not None:
        where.append(Booking.end_at > now_utc() if upcoming else Booking.end_at <= now_utc())
    total = await session.scalar(select(func.count()).select_from(Booking).where(*where))
    rows = (await session.execute(
        select(Booking, Field, Venue).join(Field, Booking.field_id == Field.id).join(Venue, Field.venue_id == Venue.id).where(*where)
        .order_by(Booking.start_at.desc() if upcoming is not True else Booking.start_at.asc()).offset((page - 1) * page_size).limit(page_size))).all()
    await session.commit()
    return BookingPage(items=[_out(b, f, v, user) for b, f, v in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/bookings/{booking_id}", response_model=BookingOut)
async def get_booking(booking_id: uuid.UUID, user: CurrentUser, session: Session) -> BookingOut:
    b, field, venue = await _load(session, booking_id, user)
    if b.status in ("pending", "awaiting_payment") and b.hold_expires_at and b.hold_expires_at <= now_utc():
        svc.transition(b, "expired")  # lazy expiry: correct even if the sweeper hasn't run yet
        await session.commit()
    customer = await session.get(User, b.customer_id)
    return _out(b, field, venue, user, customer, await pay_svc.latest_payment_out(session, b.id))


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(booking_id: uuid.UUID, body: CancelIn, user: CurrentUser, session: Session, request: Request) -> BookingOut:
    b, field, venue = await _load(session, booking_id, user)
    if b.status in ("pending", "awaiting_payment") and b.hold_expires_at and b.hold_expires_at <= now_utc():
        svc.transition(b, "expired")
    else:
        prev = b.status
        await svc.cancel(session, user, b, venue, body.reason)
        await pay_svc.after_cancel(session, b, prev == "confirmed", user.id)  # releases pending charges / refunds paid ones
        audit(session, user.id, "booking.cancel", "booking", b.id, {"from": prev, "reason": body.reason}, request)
    await session.commit()
    customer = await session.get(User, b.customer_id)
    return _out(b, field, venue, user, customer, await pay_svc.latest_payment_out(session, b.id))


