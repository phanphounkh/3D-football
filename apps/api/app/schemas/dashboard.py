import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.booking import BookingOut


class DayPoint(BaseModel):
    date: date
    bookings: int
    gross_minor: int


class HourPoint(BaseModel):
    hour: int
    bookings: int


class FieldUtil(BaseModel):
    field_id: uuid.UUID
    field_name: str
    venue_name: str
    booked_minutes: int
    available_minutes: int
    occupancy: float  # 0..1


class TodayBooking(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    start_at: datetime
    end_at: datetime
    field_name: str
    venue_name: str
    customer_name: str
    total_minor: int


class OwnerAnalytics(BaseModel):
    days: int
    start: date
    end: date
    gross_minor: int  # booked value (confirmed + completed); includes pay-at-venue not yet collected
    commission_minor: int
    net_minor: int
    bookings: int
    cancelled: int
    occupancy: float
    daily: list[DayPoint]
    popular_hours: list[HourPoint]
    fields: list[FieldUtil]
    today: list[TodayBooking]


class TopVenue(BaseModel):
    venue_id: uuid.UUID
    name: str
    bookings: int
    gross_minor: int


class AdminAnalytics(BaseModel):
    days: int
    start: date
    end: date
    users: dict[str, int]
    venues: dict[str, int]
    bookings_by_status: dict[str, int]
    total_bookings: int
    total_venues: int
    total_users: int
    gross_minor: int  # within the range
    commission_minor: int
    refunded_minor: int
    pending_venues: int
    daily: list[DayPoint]
    commission_daily: list[DayPoint]
    top_venues: list[TopVenue]


class CustomerDashboard(BaseModel):
    upcoming_count: int
    past_count: int
    total_spent_minor: int
    favorites_count: int
    unread_notifications: int
    next_bookings: list[BookingOut]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int


class AdminBookingRow(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    start_at: datetime
    end_at: datetime
    total_minor: int
    commission_minor: int
    venue_name: str
    field_name: str
    customer_name: str
    customer_email: str
    payment_status: str | None
    payment_provider: str | None


class AdminBookingPage(BaseModel):
    items: list[AdminBookingRow]
    total: int
    page: int
    page_size: int


class AdminPaymentRow(BaseModel):
    id: uuid.UUID
    booking_reference: str
    provider: str
    status: str
    amount_minor: int
    currency: str
    created_at: datetime
    refund_id: uuid.UUID | None
    refund_status: str | None
    refund_failure: str | None


class AdminPaymentPage(BaseModel):
    items: list[AdminPaymentRow]
    total: int
    page: int
    page_size: int


class AuditRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: str
    data: dict | None
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditRow]
    total: int
    page: int
    page_size: int


class SettingsOut(BaseModel):
    default_commission_bps: int


class SettingsIn(BaseModel):
    default_commission_bps: int = Field(ge=0, le=5000)  # up to 50%


class CommissionIn(BaseModel):
    commission_bps: int | None = Field(default=None, ge=0, le=5000)  # null = fall back to the platform default
