import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.payment import PaymentOut


def _aware(v: datetime) -> datetime:
    if v.tzinfo is None:
        raise ValueError("must include a timezone offset, e.g. 2026-11-02T18:00:00+07:00")
    return v


class SlotOut(BaseModel):
    start_at: datetime
    end_at: datetime
    price_minor: int
    available: bool
    reason: Literal["booked", "blocked", "past"] | None = None


class AvailabilityOut(BaseModel):
    field_id: uuid.UUID
    date: date
    timezone: str
    duration_minutes: int
    currency: str = "USD"
    slots: list[SlotOut]


class BookingCreate(BaseModel):
    field_id: uuid.UUID
    start_at: datetime
    duration_minutes: int = Field(ge=30, le=1440)

    @field_validator("start_at")
    @classmethod
    def tz(cls, v: datetime) -> datetime:
        return _aware(v)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class BookingField(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    field_type: str


class BookingVenue(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    name: str
    city: str
    address: str
    pay_at_venue_enabled: bool


class BookingOut(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    start_at: datetime
    end_at: datetime
    total_minor: int
    currency: str
    hold_expires_at: datetime | None
    created_at: datetime
    cancelled_at: datetime | None
    field: BookingField
    venue: BookingVenue
    cancellable: bool
    customer_name: str | None = None  # only populated for venue owners / admins
    payment: PaymentOut | None = None


class BookingPage(BaseModel):
    items: list[BookingOut]
    total: int
    page: int
    page_size: int


class HourIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    open_minute: int = Field(ge=0, le=1440)
    close_minute: int = Field(ge=0, le=1440)

    @model_validator(mode="after")
    def check(self):
        if self.open_minute % 30 or self.close_minute % 30:
            raise ValueError("hours must be on 30-minute boundaries")
        if self.close_minute <= self.open_minute:
            raise ValueError("close_minute must be after open_minute")
        return self


class HoursIn(BaseModel):
    hours: list[HourIn] = Field(max_length=7)

    @model_validator(mode="after")
    def unique_days(self):
        days = [h.weekday for h in self.hours]
        if len(days) != len(set(days)):
            raise ValueError("each weekday may appear once")
        return self


class HourOut(HourIn):
    model_config = ConfigDict(from_attributes=True)


class PricingRuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    weekdays: list[int] = Field(min_length=1, max_length=14)  # duplicates are folded below
    start_minute: int = Field(ge=0, le=1440)
    end_minute: int = Field(ge=0, le=1440)
    price_minor: int = Field(ge=0, le=10_000_000)
    priority: int = Field(default=0, ge=0, le=1000)
    valid_from: date | None = None
    valid_to: date | None = None

    @model_validator(mode="after")
    def check(self):
        if any(not 0 <= d <= 6 for d in self.weekdays):
            raise ValueError("weekdays must be 0 (Monday) to 6 (Sunday)")
        if self.start_minute % 30 or self.end_minute % 30 or self.end_minute <= self.start_minute:
            raise ValueError("time range must be 30-minute aligned and end after start")
        if self.valid_from and self.valid_to and self.valid_to < self.valid_from:
            raise ValueError("valid_to must not be before valid_from")
        self.weekdays = sorted(set(self.weekdays))
        return self


class PricingRuleOut(PricingRuleIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ExceptionIn(BaseModel):
    start_at: datetime
    end_at: datetime
    reason: str = Field(default="", max_length=160)

    @field_validator("start_at", "end_at")
    @classmethod
    def tz(cls, v: datetime) -> datetime:
        return _aware(v)

    @model_validator(mode="after")
    def check(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class ExceptionOut(ExceptionIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
