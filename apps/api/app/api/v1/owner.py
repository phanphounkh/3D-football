import re
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.audit import audit
from app.deps import OwnerUser, Session
from app.models import Facility, Field, Venue
from app.schemas.manage import FieldIn, FieldUpdate, ManagedVenue, VenueIn, VenueUpdate
from app.schemas.venue import FieldOut

router = APIRouter(prefix="/owner", tags=["owner"])


def _not_found(what: str) -> HTTPException:
    return HTTPException(404, detail={"code": f"{what.upper()}_NOT_FOUND", "message": f"{what} not found"})


def slugify(name: str, city: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", f"{name} {city}".lower()).strip("-")[:100] or "venue"
    return f"{base}-{secrets.token_hex(2)}"


async def _facilities(session: Session, codes: list[str]) -> list[Facility]:
    codes = list(dict.fromkeys(codes))
    rows = list(await session.scalars(select(Facility).where(Facility.code.in_(codes)))) if codes else []
    unknown = set(codes) - {f.code for f in rows}
    if unknown:
        raise HTTPException(422, detail={"code": "UNKNOWN_FACILITY", "message": f"Unknown facilities: {', '.join(sorted(unknown))}"})
    return rows


async def owned_venue(session: Session, user, venue_id: uuid.UUID) -> Venue:
    """Admins may act on any venue; owners only on theirs. Others get 404 so ids can't be probed."""
    q = select(Venue).where(Venue.id == venue_id, Venue.deleted_at.is_(None)).options(selectinload(Venue.fields), selectinload(Venue.facilities))
    if user.role != "admin":
        q = q.where(Venue.owner_id == user.id)
    v = await session.scalar(q)
    if not v:
        raise _not_found("Venue")
    return v


@router.get("/venues", response_model=list[ManagedVenue])
async def my_venues(user: OwnerUser, session: Session) -> list[Venue]:
    rows = await session.scalars(
        select(Venue).where(Venue.owner_id == user.id, Venue.deleted_at.is_(None))
        .options(selectinload(Venue.fields), selectinload(Venue.facilities)).order_by(Venue.created_at.desc())
    )
    for v in (vs := list(rows)):
        v.fields = [f for f in v.fields if f.deleted_at is None]
    return vs


@router.post("/venues", response_model=ManagedVenue, status_code=201)
async def create_venue(body: VenueIn, user: OwnerUser, session: Session, request: Request) -> Venue:
    v = Venue(owner_id=user.id, slug=slugify(body.name, body.city), status="pending",
              **body.model_dump(exclude={"facility_codes"}))
    v.facilities = await _facilities(session, body.facility_codes)
    v.fields = []
    session.add(v)
    await session.flush()
    audit(session, user.id, "venue.create", "venue", v.id, {"name": v.name}, request)
    await session.commit()
    return v


@router.get("/venues/{venue_id}", response_model=ManagedVenue)
async def get_my_venue(venue_id: uuid.UUID, user: OwnerUser, session: Session) -> Venue:
    v = await owned_venue(session, user, venue_id)
    v.fields = [f for f in v.fields if f.deleted_at is None]
    return v


@router.patch("/venues/{venue_id}", response_model=ManagedVenue)
async def update_venue(venue_id: uuid.UUID, body: VenueUpdate, user: OwnerUser, session: Session, request: Request) -> Venue:
    v = await owned_venue(session, user, venue_id)
    data = body.model_dump(exclude_unset=True)
    codes = data.pop("facility_codes", None)
    for k, val in data.items():
        if val is not None:
            setattr(v, k, val)
    if codes is not None:
        v.facilities = await _facilities(session, codes)
    audit(session, user.id, "venue.update", "venue", v.id, {"fields": sorted(body.model_fields_set)}, request)
    await session.commit()
    v.fields = [f for f in v.fields if f.deleted_at is None]
    return v


@router.delete("/venues/{venue_id}", status_code=204)
async def delete_venue(venue_id: uuid.UUID, user: OwnerUser, session: Session, request: Request) -> None:
    v = await owned_venue(session, user, venue_id)
    v.deleted_at = datetime.now(UTC)  # soft delete
    audit(session, user.id, "venue.delete", "venue", v.id, None, request)
    await session.commit()


async def _owned_field(session: Session, user, venue_id: uuid.UUID, field_id: uuid.UUID) -> Field:
    await owned_venue(session, user, venue_id)
    f = await session.scalar(select(Field).where(Field.id == field_id, Field.venue_id == venue_id, Field.deleted_at.is_(None)))
    if not f:
        raise _not_found("Field")
    return f


@router.post("/venues/{venue_id}/fields", response_model=FieldOut, status_code=201)
async def add_field(venue_id: uuid.UUID, body: FieldIn, user: OwnerUser, session: Session, request: Request) -> Field:
    await owned_venue(session, user, venue_id)
    f = Field(venue_id=venue_id, **body.model_dump())
    session.add(f)
    await session.flush()
    audit(session, user.id, "field.create", "field", f.id, {"venue_id": str(venue_id)}, request)
    await session.commit()
    return f


@router.patch("/venues/{venue_id}/fields/{field_id}", response_model=FieldOut)
async def update_field(venue_id: uuid.UUID, field_id: uuid.UUID, body: FieldUpdate, user: OwnerUser, session: Session, request: Request) -> Field:
    f = await _owned_field(session, user, venue_id, field_id)
    for k, val in body.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(f, k, val)
    audit(session, user.id, "field.update", "field", f.id, {"fields": sorted(body.model_fields_set)}, request)
    await session.commit()
    return f


@router.delete("/venues/{venue_id}/fields/{field_id}", status_code=204)
async def delete_field(venue_id: uuid.UUID, field_id: uuid.UUID, user: OwnerUser, session: Session, request: Request) -> None:
    f = await _owned_field(session, user, venue_id, field_id)
    f.deleted_at = datetime.now(UTC)
    audit(session, user.id, "field.delete", "field", f.id, None, request)
    await session.commit()


