"""Customer-side endpoints: dashboard summary, favorites, notifications."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

from app.api.v1.bookings import _out
from app.api.v1.venues import _summary
from app.deps import CurrentUser, Session
from app.models import Booking, Favorite, Field, Notification, Venue
from app.schemas.dashboard import CustomerDashboard, NotificationOut, NotificationPage
from app.schemas.venue import VenueSummary
from app.services import bookings as bk
from app.services.analytics import REVENUE
from app.services.timeutil import now_utc

router = APIRouter(tags=["me"])


@router.get("/me/dashboard", response_model=CustomerDashboard)
async def my_dashboard(user: CurrentUser, session: Session) -> CustomerDashboard:
    await bk.expire_stale_holds(session)
    now = now_utc()
    mine = Booking.customer_id == user.id
    live = ("confirmed", "awaiting_payment", "pending")
    upcoming = await session.scalar(select(func.count()).where(mine, Booking.status.in_(live), Booking.end_at > now))
    past = await session.scalar(select(func.count()).where(mine, Booking.status == "completed"))
    spent = await session.scalar(select(func.coalesce(func.sum(Booking.total_minor), 0)).where(mine, Booking.status.in_(REVENUE)))
    favs = await session.scalar(select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id))
    unread = await session.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    rows = (await session.execute(
        select(Booking, Field, Venue).join(Field, Booking.field_id == Field.id).join(Venue, Field.venue_id == Venue.id)
        .where(mine, Booking.status.in_(live), Booking.end_at > now).order_by(Booking.start_at).limit(3))).all()
    await session.commit()
    return CustomerDashboard(upcoming_count=upcoming or 0, past_count=past or 0, total_spent_minor=int(spent or 0), favorites_count=favs or 0,
                             unread_notifications=unread or 0, next_bookings=[_out(b, f, v, user) for b, f, v in rows])


# ---- favorites --------------------------------------------------------------


@router.get("/favorites", response_model=list[VenueSummary])
async def list_favorites(user: CurrentUser, session: Session) -> list[dict]:
    venues = await session.scalars(
        select(Venue).join(Favorite, Favorite.venue_id == Venue.id)
        .where(Favorite.user_id == user.id, Venue.status == "approved", Venue.deleted_at.is_(None))
        .options(selectinload(Venue.fields), selectinload(Venue.facilities)).order_by(Favorite.created_at.desc()))
    return [_summary(v) for v in venues]


@router.put("/favorites/{venue_id}", status_code=204)
async def add_favorite(venue_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    ok = await session.scalar(select(Venue.id).where(Venue.id == venue_id, Venue.status == "approved", Venue.deleted_at.is_(None)))
    if not ok:
        raise bk.err(404, "VENUE_NOT_FOUND", "Venue not found")
    await session.execute(pg_insert(Favorite).values(user_id=user.id, venue_id=venue_id).on_conflict_do_nothing())  # idempotent
    await session.commit()


@router.delete("/favorites/{venue_id}", status_code=204)
async def remove_favorite(venue_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    await session.execute(Favorite.__table__.delete().where(Favorite.user_id == user.id, Favorite.venue_id == venue_id))
    await session.commit()


# ---- notifications ----------------------------------------------------------


@router.get("/notifications", response_model=NotificationPage)
async def list_notifications(user: CurrentUser, session: Session, unread_only: bool = False,
                             limit: Annotated[int, Query(ge=1, le=100)] = 30) -> NotificationPage:
    where = [Notification.user_id == user.id]
    total = await session.scalar(select(func.count()).select_from(Notification).where(*where))
    unread = await session.scalar(select(func.count()).select_from(Notification).where(*where, Notification.read_at.is_(None)))
    if unread_only:
        where.append(Notification.read_at.is_(None))
    rows = await session.scalars(select(Notification).where(*where).order_by(Notification.created_at.desc()).limit(limit))
    return NotificationPage(items=[NotificationOut.model_validate(n) for n in rows], total=total or 0, unread=unread or 0)


@router.post("/notifications/read-all", status_code=204)
async def read_all(user: CurrentUser, session: Session) -> None:
    await session.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=now_utc()))
    await session.commit()


@router.post("/notifications/{notification_id}/read", status_code=204)
async def read_one(notification_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    res = await session.execute(update(Notification).where(Notification.id == notification_id, Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=now_utc()))
    if not res.rowcount and not await session.scalar(select(Notification.id).where(Notification.id == notification_id, Notification.user_id == user.id)):
        raise bk.err(404, "NOTIFICATION_NOT_FOUND", "Notification not found")  # someone else's id looks the same as a missing one
    await session.commit()
