import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.audit import audit
from app.deps import AdminUser, Session
from app.models import (
    AuditLog,
    Booking,
    Field,
    Notification,
    Payment,
    PlatformSetting,
    Refund,
    User,
    Venue,
)
from app.schemas.dashboard import (
    AdminAnalytics,
    AdminBookingPage,
    AdminBookingRow,
    AdminPaymentPage,
    AdminPaymentRow,
    AuditPage,
    AuditRow,
    CommissionIn,
    SettingsIn,
    SettingsOut,
)
from app.schemas.manage import (
    AdminUserOut,
    AdminUserUpdate,
    ManagedVenue,
    Reject,
    UserPage,
    VenuePageOut,
)
from app.schemas.payment import RefundOut
from app.services import payments as pay_svc
from app.services.analytics import admin_analytics, get_default_commission_bps

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=UserPage)
async def list_users(admin: AdminUser, session: Session, role: str | None = None, q: str | None = None,
                     page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20) -> UserPage:
    where = [User.deleted_at.is_(None)]
    if role:
        where.append(User.role == role)
    if q:
        where.append(User.email.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    total = await session.scalar(select(func.count()).select_from(User).where(*where))
    rows = await session.scalars(select(User).where(*where).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return UserPage(items=[AdminUserOut.model_validate(u) for u in rows], total=total or 0, page=page, page_size=page_size)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: uuid.UUID, body: AdminUserUpdate, admin: AdminUser, session: Session, request: Request) -> User:
    u = await session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})
    if u.id == admin.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(422, detail={"code": "SELF_LOCKOUT", "message": "You can't deactivate or demote your own account"})
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    before = {k: getattr(u, k) for k in changes}
    for k, v in changes.items():
        setattr(u, k, v)
    audit(session, admin.id, "user.update", "user", u.id, {"before": before, "after": changes}, request)
    await session.commit()
    return u


@router.get("/venues", response_model=VenuePageOut)
async def list_venues(admin: AdminUser, session: Session, status: str | None = None,
                      page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20) -> VenuePageOut:
    where = [Venue.deleted_at.is_(None)]
    if status:
        where.append(Venue.status == status)
    total = await session.scalar(select(func.count()).select_from(Venue).where(*where))
    rows = list(await session.scalars(
        select(Venue).where(*where).options(selectinload(Venue.fields), selectinload(Venue.facilities))
        .order_by(Venue.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
    for v in rows:
        v.fields = [f for f in v.fields if f.deleted_at is None]
    return VenuePageOut(items=[ManagedVenue.model_validate(v) for v in rows], total=total or 0, page=page, page_size=page_size)


async def _decide(venue_id: uuid.UUID, status: str, reason: str | None, admin: User, session: Session, request: Request) -> Venue:
    v = await session.scalar(select(Venue).where(Venue.id == venue_id, Venue.deleted_at.is_(None))
                             .options(selectinload(Venue.fields), selectinload(Venue.facilities)).with_for_update())
    if not v:
        raise HTTPException(404, detail={"code": "VENUE_NOT_FOUND", "message": "Venue not found"})
    prev = v.status
    v.status, v.rejection_reason = status, reason
    audit(session, admin.id, f"venue.{status}", "venue", v.id, {"from": prev, "reason": reason}, request)
    session.add(Notification(
        user_id=v.owner_id, kind=f"venue_{status}",
        title=f"{v.name} was {status}", body=reason or "Your venue is now live." if status == "approved" else (reason or ""),
    ))
    await session.commit()
    v.fields = [f for f in v.fields if f.deleted_at is None]
    return v


@router.post("/venues/{venue_id}/approve", response_model=ManagedVenue)
async def approve(venue_id: uuid.UUID, admin: AdminUser, session: Session, request: Request) -> Venue:
    return await _decide(venue_id, "approved", None, admin, session, request)


@router.post("/venues/{venue_id}/reject", response_model=ManagedVenue)
async def reject(venue_id: uuid.UUID, body: Reject, admin: AdminUser, session: Session, request: Request) -> Venue:
    return await _decide(venue_id, "rejected", body.reason, admin, session, request)


@router.post("/refunds/{refund_id}/retry", response_model=RefundOut)
async def retry_refund(refund_id: uuid.UUID, admin: AdminUser, session: Session, request: Request) -> Refund:
    """Re-attempts a refund the provider rejected earlier. Safe to repeat: one refund row per payment, idempotent upstream."""
    r0 = await session.get(Refund, refund_id)
    if not r0:
        raise HTTPException(404, detail={"code": "REFUND_NOT_FOUND", "message": "Refund not found"})
    p0 = await session.get(Payment, r0.payment_id)
    b = await session.scalar(select(Booking).where(Booking.id == p0.booking_id).with_for_update())
    p = await session.scalar(select(Payment).where(Payment.id == p0.id).with_for_update())
    r = await pay_svc.refund_payment(session, p, b, r0.reason or "Refund retry", admin.id)
    audit(session, admin.id, "refund.retry", "refund", refund_id, {"result": r.status if r else None}, request)
    await session.commit()
    return r


@router.get("/analytics", response_model=AdminAnalytics)
async def analytics(admin: AdminUser, session: Session, days: Annotated[int, Query(ge=7, le=90)] = 30) -> AdminAnalytics:
    return await admin_analytics(session, days)


@router.get("/bookings", response_model=AdminBookingPage)
async def all_bookings(admin: AdminUser, session: Session, status: str | None = None, q: str | None = None,
                       page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20) -> AdminBookingPage:
    where = []
    if status:
        where.append(Booking.status == status)
    if q:
        like = f"%{q}%"
        where.append(Booking.reference.ilike(like) | User.email.ilike(like) | User.full_name.ilike(like) | Venue.name.ilike(like))
    base = (select(Booking, Field.name, Venue.name, User.full_name, User.email).join(Field, Booking.field_id == Field.id)
            .join(Venue, Field.venue_id == Venue.id).join(User, Booking.customer_id == User.id).where(*where))
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await session.execute(base.order_by(Booking.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    pays: dict = {}
    if rows:
        for p in await session.scalars(select(Payment).where(Payment.booking_id.in_([r[0].id for r in rows])).order_by(Payment.created_at)):
            pays[p.booking_id] = p  # latest wins
    return AdminBookingPage(page=page, page_size=page_size, total=total or 0, items=[
        AdminBookingRow(id=b.id, reference=b.reference, status=b.status, start_at=b.start_at, end_at=b.end_at, total_minor=b.total_minor, commission_minor=b.commission_minor,
                        venue_name=vn, field_name=fn, customer_name=cn, customer_email=ce,
                        payment_status=pays[b.id].status if b.id in pays else None, payment_provider=pays[b.id].provider if b.id in pays else None)
        for b, fn, vn, cn, ce in rows])


@router.get("/payments", response_model=AdminPaymentPage)
async def all_payments(admin: AdminUser, session: Session, status: str | None = None, refund_status: str | None = None,
                       page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20) -> AdminPaymentPage:
    where = []
    if status:
        where.append(Payment.status == status)
    if refund_status:
        where.append(Refund.status == refund_status)
    base = select(Payment, Booking.reference, Refund).join(Booking, Payment.booking_id == Booking.id).outerjoin(Refund, Refund.payment_id == Payment.id).where(*where)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await session.execute(base.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return AdminPaymentPage(page=page, page_size=page_size, total=total or 0, items=[
        AdminPaymentRow(id=p.id, booking_reference=ref, provider=p.provider, status=p.status, amount_minor=p.amount_minor, currency=p.currency, created_at=p.created_at,
                        refund_id=r.id if r else None, refund_status=r.status if r else None, refund_failure=r.failure_reason if r else None)
        for p, ref, r in rows])


@router.get("/settings", response_model=SettingsOut)
async def get_settings_(admin: AdminUser, session: Session) -> SettingsOut:
    return SettingsOut(default_commission_bps=await get_default_commission_bps(session))


@router.put("/settings", response_model=SettingsOut)
async def put_settings(body: SettingsIn, admin: AdminUser, session: Session, request: Request) -> SettingsOut:
    """Applies to bookings made from now on; existing bookings keep the commission they were created with."""
    before = await get_default_commission_bps(session)
    row = await session.get(PlatformSetting, "default_commission_bps")
    if row:
        row.value = {"bps": body.default_commission_bps}
    else:
        session.add(PlatformSetting(key="default_commission_bps", value={"bps": body.default_commission_bps}))
    audit(session, admin.id, "settings.commission", "settings", "default_commission_bps", {"from": before, "to": body.default_commission_bps}, request)
    await session.commit()
    return SettingsOut(default_commission_bps=body.default_commission_bps)


@router.put("/venues/{venue_id}/commission")
async def venue_commission(venue_id: uuid.UUID, body: CommissionIn, admin: AdminUser, session: Session, request: Request) -> dict:
    v = await session.get(Venue, venue_id)
    if not v or v.deleted_at:
        raise HTTPException(404, detail={"code": "VENUE_NOT_FOUND", "message": "Venue not found"})
    audit(session, admin.id, "venue.commission", "venue", v.id, {"from": v.commission_bps, "to": body.commission_bps}, request)
    v.commission_bps = body.commission_bps
    await session.commit()
    return {"venue_id": str(v.id), "commission_bps": v.commission_bps}


@router.get("/audit-logs", response_model=AuditPage)
async def audit_logs(admin: AdminUser, session: Session, action: str | None = None, entity_type: str | None = None,
                     page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25) -> AuditPage:
    where = []
    if action:
        where.append(AuditLog.action.ilike(f"{action}%"))
    if entity_type:
        where.append(AuditLog.entity_type == entity_type)
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*where))
    rows = await session.scalars(select(AuditLog).where(*where).order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return AuditPage(items=[AuditRow.model_validate(r) for r in rows], total=total or 0, page=page, page_size=page_size)
