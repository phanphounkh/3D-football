import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

FieldType = Literal["5v5", "7v7", "11v11"]


class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    name: str


class FieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    field_type: FieldType
    surface: str
    indoor: bool
    base_price_minor: int
    currency: str = "USD"


class VenueSummary(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    city: str
    address: str
    latitude: float
    longitude: float
    from_price_minor: int
    field_types: list[FieldType]
    facilities: list[FacilityOut]
    field_count: int


class VenueDetail(VenueSummary):
    description: str
    fields: list[FieldOut]


class Page(BaseModel):
    items: list[VenueSummary]
    total: int
    page: int
    page_size: int


class ErrorBody(BaseModel):
    code: str
    message: str
