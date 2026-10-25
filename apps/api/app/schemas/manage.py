import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.venue import FacilityOut, FieldOut, FieldType

Surface = Literal["artificial", "natural", "futsal"]


class VenueIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=4000)
    city: str = Field(min_length=2, max_length=64)
    address: str = Field(min_length=3, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    facility_codes: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("name", "city", "address")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class VenueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    city: str | None = Field(default=None, min_length=2, max_length=64)
    address: str | None = Field(default=None, min_length=3, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    facility_codes: list[str] | None = Field(default=None, max_length=30)
    pay_at_venue_enabled: bool | None = None


class FieldIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    field_type: FieldType
    surface: Surface
    indoor: bool = False
    base_price_minor: int = Field(ge=0, le=10_000_000)


class FieldUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    field_type: FieldType | None = None
    surface: Surface | None = None
    indoor: bool | None = None
    base_price_minor: int | None = Field(default=None, ge=0, le=10_000_000)


class ManagedVenue(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    name: str
    description: str
    city: str
    address: str
    latitude: float
    longitude: float
    status: str
    rejection_reason: str | None
    pay_at_venue_enabled: bool
    owner_id: uuid.UUID
    facilities: list[FacilityOut]
    fields: list[FieldOut]
    created_at: datetime


class Reject(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    role: Literal["customer", "owner", "admin"] | None = None


class UserPage(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class VenuePageOut(BaseModel):
    items: list[ManagedVenue]
    total: int
    page: int
    page_size: int
