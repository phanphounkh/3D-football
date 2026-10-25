"""Owner-managed schedule: operating hours, pricing rules, blocked periods, and the venue's booking list."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request
from sqlalchemy import delete, func, select

from app.api.v1.bookings import _out
from app.api.v1.owner import _owned_field, owned_venue
from app.audit import audit
from app.deps import OwnerUser, Session
from app.models import (
    AvailabilityException,
    Booking,
    Field,
    OperatingHour,
    PricingRule,
    User,
    Venue,
)
from app.models.booking import ACTIVE_STATUSES
from app.schemas.booking import (
    BookingPage,
    ExceptionIn,
    ExceptionOut,
    HourOut,
    HoursIn,
    PricingRuleIn,
    PricingRuleOut,
)
from app.schemas.dashboard import OwnerAnalytics
from app.services import bookings as svc
from app.services import payments as pay_svc
from app.services.analytics import owner_analytics
from app.services.timeutil import now_utc

router = APIRouter(prefix="/owner", tags=["owner-schedule"])
FieldPath = "/venues/{venue_id}/fields/{field_id}"


@router.get(FieldPath + "/hours", response_model=list[HourOut])
async def get_hours(venue_id: uuid.UUID, field_id: uuid.UUID, user: OwnerUser, session: Session):
    await _owned_field(session, user, venue_id, field_id)
    return (await session.scalars(select(OperatingHour).where(OperatingHour.field_id == field_id).order_by(OperatingHour.weekday))).all()


@router.put(FieldPath + "/hours", response_model=list[HourOut])
async def set_hours(venue_id: uuid.UUID, field_id: uuid.UUID, body: HoursIn, user: OwnerUser, session: Session, request: Request):
    """Replaces the whole week. Days that are omitted are closed."""
    await _owned_field(session, user, venue_id, field_id)
    await session.execute(delete(OperatingHour).where(OperatingHour.field_id == field_id))
    rows = [OperatingHour(field_id=field_id, **h.model_dump()) for h in body.hours]
    session.add_all(rows)
    audit(session, user.id, "hours.set", "field", field_id, {"days": [h.weekday for h in body.hours]}, request)
    await session.commit()
    return sorted(rows, key=lambda r: r.weekday)


@router.get(FieldPath + "/pricing-rules", response_model=list[PricingRuleOut])
async def list_rules(venue_id: uuid.UUID, field_id: uuid.UUID, user: OwnerUser, session: Session):
    await _owned_field(session, user, venue_id, field_id)
    return (await session.scalars(select(PricingRule).where(PricingRule.field_id == field_id).order_by(PricingRule.priority.desc()))).all()


@router.post(FieldPath + "/pricing-rules", response_model=PricingRuleOut, status_code=201)
async def add_rule(venue_id: uuid.UUID, field_id: uuid.UUID, body: PricingRuleIn, user: OwnerUser, session: Session, request: Request):
    await _owned_field(session, user, venue_id, field_id)
    r = PricingRule(field_id=field_id, **body.model_dump())
    session.add(r)
    await session.flush()
    audit(session, user.id, "pricing.create", "pricing_rule", r.id, {"field_id": str(field_id), "price_minor": r.price_minor}, request)
    await session.commit()
    return r


@router.put(FieldPath + "/pricing-rules/{rule_id}", response_model=PricingRuleOut)
async def update_rule(venue_id: uuid.UUID, field_id: uuid.UUID, rule_id: uuid.UUID, body: PricingRuleIn, user: OwnerUser, session: Session, request: Request):
    await _owned_field(session, user, venue_id, field_id)
    r = await session.scalar(select(PricingRule).where(PricingRule.id == rule_id, PricingRule.field_id == field_id))
    if not r:
        raise svc.err(404, "RULE_NOT_FOUND", "Pricing rule not found")
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    audit(session, user.id, "pricing.update", "pricing_rule", r.id, {"price_minor": r.price_minor}, request)
    await session.commit()
    return r


@router.delete(FieldPath + "/pricing-rules/{rule_id}", status_code=204)
async def delete_rule(venue_id: uuid.UUID, field_id: uuid.UUID, rule_id: uuid.UUID, user: OwnerUser, session: Session, request: Request):
    await _owned_field(session, user, venue_id, field_id)
    res = await session.execute(delete(PricingRule).where(PricingRule.id == rule_id, PricingRule.field_id == field_id))
    if not res.rowcount:
        raise svc.err(404, "RULE_NOT_FOUND", "Pricing rule not found")
    audit(session, user.id, "pricing.delete", "pricing_rule", rule_id, None, request)
    await session.commit()


@router.get(FieldPath + "/exceptions", response_model=list[ExceptionOut])
async def list_exceptions(venue_id: uuid.UUID, field_id: uuid.UUID, user: OwnerUser, session: Session):
    await _owned_field(session, user, venue_id, field_id)
    return (await session.scalars(select(AvailabilityException).where(AvailabilityException.field_id == field_id, AvailabilityException.end_at > now_utc())
                                  .order_by(AvailabilityException.start_at))).all()


@router.post(FieldPath + "/exceptions", response_model=ExceptionOut, status_code=201)
async def add_exception(venue_id: uuid.UUID, field_id: uuid.UUID, body: ExceptionIn, user: OwnerUser, session: Session, request: Request):
    """Blocks a period. Refused while live bookings sit inside it: cancel those first so no customer is silently dropped."""
    await _owned_field(session, user, venue_id, field_id)
    await svc.expire_stale_holds(session, field_id=field_id)
    clash = await session.scalar(select(func.count()).select_from(Booking).where(
        Booking.field_id == field_id, Booking.status.in_(ACTIVE_STATUSES), Booking.start_at < body.end_at, Booking.end_at > body.start_at))
    if clash:
        raise svc.err(409, "BOOKINGS_CONFLICT", f"{clash} active booking(s) fall in this period. Cancel them first.", count=clash)
    x = AvailabilityException(field_id=field_id, **body.model_dump())
    session.add(x)
    await session.flush()
    audit(session, user.id, "exception.create", "field", field_id, {"start_at": body.start_at.isoformat(), "end_at": body.end_at.isoformat()}, request)
    await session.commit()
    return x


@router.delete(FieldPath + "/exceptions/{exception_id}", status_code=204)
async def delete_exception(venue_id: uuid.UUID, field_id: uuid.UUID, exception_id: uuid.UUID, user: OwnerUser, session: Session, request: Request):
    await _owned_field(session, user, venue_id, field_id)
    res = await session.execute(delete(AvailabilityException).where(AvailabilityException.id == exception_id, AvailabilityException.field_id == field_id))
    if not res.rowcount:
        raise svc.err(404, "EXCEPTION_NOT_FOUND", "Blocked period not found")
    audit(session, user.id, "exception.delete", "field", field_id, None, request)
    await session.commit()


@router.get("/bookings", response_model=BookingPage)
async def venue_bookings(user: OwnerUser, session: Session, venue_id: uuid.UUID | None = None, status: str | None = None,
                         page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20) -> BookingPage:
    if venue_id:
        await owned_venue(session, user, venue_id)
    await svc.expire_stale_holds(session)
    where = [] if user.role == "admin" else [Venue.owner_id == user.id]
    if venue_id:
        where.append(Venue.id == venue_id)
    if status:
        where.append(Booking.status == status)
    base = select(Booking, Field, Venue, User).join(Field, Booking.field_id == Field.id).join(Venue, Field.venue_id == Venue.id).join(User, Booking.customer_id == User.id).where(*where)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await session.execute(base.order_by(Booking.start_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    await session.commit()
    pays = await pay_svc.payments_out_for(session, [b.id for b, *_ in rows])
    return BookingPage(items=[_out(b, f, v, user, c, pays.get(b.id)) for b, f, v, c in rows], total=total or 0, page=page, page_size=page_size)



@router.get("/analytics", response_model=OwnerAnalytics)
async def analytics(user: OwnerUser, session: Session, venue_id: uuid.UUID | None = None,
                    days: Annotated[int, Query(ge=7, le=90)] = 30) -> OwnerAnalytics:
    """Revenue, occupancy, popular hours, trends and field utilisation, computed from bookings. Admins see every venue."""
    if venue_id:
        await owned_venue(session, user, venue_id)
    return await owner_analytics(session, None if user.role == "admin" else user.id, venue_id, days)
