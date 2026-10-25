import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    literal_column,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin, uuid_pk

BOOKING_STATUSES = ("pending", "awaiting_payment", "confirmed", "cancelled", "completed", "expired", "refunded")
# Statuses that occupy the field. The exclusion constraint below only considers these.
ACTIVE_STATUSES = ("pending", "awaiting_payment", "confirmed")


class Booking(Base, TimestampMixin):
    """A reservation. `awaiting_payment` rows with `hold_expires_at` are the temporary holds."""

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_bookings_range"),
        CheckConstraint("total_minor >= 0", name="ck_bookings_total"),
        CheckConstraint(
            "status IN ('pending','awaiting_payment','confirmed','cancelled','completed','expired','refunded')",
            name="ck_bookings_status",
        ),
        # The double-booking guard: no two active bookings of one field may overlap in time.
        ExcludeConstraint(
            ("field_id", "="),
            (literal_column("tstzrange(start_at, end_at, '[)')"), "&&"),
            where=literal_column("status IN ('pending','awaiting_payment','confirmed')"),
            using="gist",
            name="ex_bookings_no_overlap",
        ),
        Index("ix_bookings_field_start", "field_id", "start_at"),
        Index("ix_bookings_customer", "customer_id", "start_at"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(String(12), unique=True)
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="RESTRICT"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    total_minor: Mapped[int] = mapped_column(Integer)
    commission_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_payments_amount"),
        CheckConstraint("status IN ('pending','succeeded','failed','cancelled','refunded')", name="ck_payments_status"),
        # at most one in-flight payment per booking; concurrent "pay" calls can't create two charges
        Index("uq_payments_one_pending", "booking_id", unique=True, postgresql_where=text("status = 'pending'")),
        Index("uq_payments_provider_ref", "provider", "provider_ref", unique=True, postgresql_where=text("provider_ref IS NOT NULL")),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    provider_ref: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    raw: Mapped[dict | None] = mapped_column(JSONB)


class Refund(Base, TimestampMixin):
    __tablename__ = "refunds"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_refunds_amount"),
        CheckConstraint("status IN ('pending','succeeded','failed')", name="ck_refunds_status"),
        UniqueConstraint("payment_id", name="uq_refunds_payment"),  # full refunds only: one per payment, so retries are idempotent
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"))
    amount_minor: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    reason: Mapped[str] = mapped_column(Text, default="")
    provider_ref: Mapped[str | None] = mapped_column(String(128))
    failure_reason: Mapped[str | None] = mapped_column(Text)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
        UniqueConstraint("booking_id", name="uq_reviews_booking"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"))
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Favorite(Base):
    __tablename__ = "favorites"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"), Index("ix_audit_created", "created_at"))
    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))  # no FK: logs must outlive users
    action: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlatformSetting(Base):
    __tablename__ = "platform_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentEvent(Base):
    """Every webhook event id we have accepted. The composite key is what makes webhook handling idempotent."""

    __tablename__ = "payment_events"
    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(48))
    payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MockCharge(Base):
    """The mock provider's own ledger. It stands in for the bank / KHQR network, which is a separate system:
    the application only ever learns a charge's outcome through signed webhooks or `fetch_status`."""

    __tablename__ = "mock_provider_charges"
    ref: Mapped[str] = mapped_column(String(64), primary_key=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|succeeded|failed|expired
    refunded_minor: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
