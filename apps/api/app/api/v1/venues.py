from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models.venue import Facility, Field, Venue, venue_facilities
from app.schemas.venue import FieldOut, FieldType, Page, VenueDetail

router = APIRouter(prefix="/venues", tags=["venues"])
Session = Annotated[AsyncSession, Depends(get_session)]


def _summary(v: Venue, match=lambda f: True) -> dict:
    fields = [f for f in v.fields if f.deleted_at is None]
    matching = [f for f in fields if match(f)] or fields
    return {
        "id": v.id, "slug": v.slug, "name": v.name, "city": v.city, "address": v.address,
        "latitude": float(v.latitude), "longitude": float(v.longitude),
        "from_price_minor": min((f.base_price_minor for f in matching), default=0),
        "field_types": sorted({f.field_type for f in fields}, key=lambda t: int(t.split("v")[0])),
        "facilities": v.facilities, "field_count": len(fields),
    }


@router.get("", response_model=Page)
async def list_venues(
    session: Session,
    q: str | None = None,
    city: str | None = None,
    field_type: FieldType | None = None,
    surface: str | None = None,
    indoor: bool | None = None,
    min_price: Annotated[int | None, Query(ge=0, description="USD cents/hour")] = None,
    max_price: Annotated[int | None, Query(ge=0)] = None,
    facility: Annotated[list[str] | None, Query()] = None,
    sort: Annotated[str, Query(pattern="^(name|price_asc|price_desc)$")] = "name",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 12,
) -> Page:
    # Field-level filters must all match the *same* field, so they live in one EXISTS.
    fcond = [Field.venue_id == Venue.id, Field.deleted_at.is_(None)]
    if field_type: fcond.append(Field.field_type == field_type)
    if surface: fcond.append(Field.surface == surface)
    if indoor is not None: fcond.append(Field.indoor == indoor)
    if min_price is not None: fcond.append(Field.base_price_minor >= min_price)
    if max_price is not None: fcond.append(Field.base_price_minor <= max_price)

    where = [Venue.status == "approved", Venue.deleted_at.is_(None), exists().where(*fcond)]
    if city: where.append(func.lower(Venue.city) == city.lower())
    if q:
        like = f"%{q.lower()}%"
        where.append(func.lower(Venue.name).like(like) | func.lower(Venue.address).like(like))
    for code in facility or []:
        where.append(
            exists().where(
                venue_facilities.c.venue_id == Venue.id,
                venue_facilities.c.facility_id == Facility.id,
                Facility.code == code,
            )
        )

    price = select(func.min(Field.base_price_minor)).where(
        Field.venue_id == Venue.id, Field.deleted_at.is_(None)
    ).scalar_subquery()
    order = {"name": Venue.name, "price_asc": price.asc(), "price_desc": price.desc()}[sort]

    def match(f: Field) -> bool:
        return (
            (not field_type or f.field_type == field_type)
            and (not surface or f.surface == surface)
            and (indoor is None or f.indoor == indoor)
            and (min_price is None or f.base_price_minor >= min_price)
            and (max_price is None or f.base_price_minor <= max_price)
        )

    total = await session.scalar(select(func.count()).select_from(Venue).where(*where))
    rows = await session.scalars(
        select(Venue).where(*where).order_by(order, Venue.id)
        .options(selectinload(Venue.fields), selectinload(Venue.facilities))
        .offset((page - 1) * page_size).limit(page_size)
    )
    return Page(items=[_summary(v, match) for v in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/{slug}", response_model=VenueDetail)
async def get_venue(slug: str, session: Session) -> VenueDetail:
    v = await session.scalar(
        select(Venue).where(Venue.slug == slug, Venue.status == "approved", Venue.deleted_at.is_(None))
        .options(selectinload(Venue.fields), selectinload(Venue.facilities))
    )
    if not v:
        raise HTTPException(404, detail={"code": "VENUE_NOT_FOUND", "message": "Venue not found"})
    return VenueDetail(
        **_summary(v), description=v.description,
        fields=[FieldOut.model_validate(f) for f in v.fields if f.deleted_at is None],
    )


@router.get("/meta/facilities", include_in_schema=True)
async def list_facilities(session: Session) -> list[dict[str, str]]:
    rows = await session.scalars(select(Facility).order_by(Facility.name))
    return [{"code": f.code, "name": f.name} for f in rows]
