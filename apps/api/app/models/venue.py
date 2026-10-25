import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin, uuid_pk

venue_facilities = Table(
    "venue_facilities",
    Base.metadata,
    Column("venue_id", UUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), primary_key=True),
    Column("facility_id", UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), primary_key=True),
)


class Facility(Base):
    __tablename__ = "facilities"
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(64))


class Venue(Base, TimestampMixin):
    __tablename__ = "venues"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected','suspended')", name="ck_venues_status"),
        CheckConstraint("commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000", name="ck_venues_commission"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    city: Mapped[str] = mapped_column(String(64), index=True)
    address: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float] = mapped_column(Numeric(9, 6))
    # pending | approved | rejected | suspended — only approved venues are public
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    pay_at_venue_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    commission_bps: Mapped[int | None] = mapped_column(Integer)  # per-venue override of the platform default
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    fields: Mapped[list["Field"]] = relationship(back_populates="venue", order_by="Field.name")
    facilities: Mapped[list[Facility]] = relationship(secondary=venue_facilities, order_by=Facility.name)
    images: Mapped[list["FieldImage"]] = relationship(order_by="FieldImage.sort_order")


class Field(Base, TimestampMixin):
    __tablename__ = "fields"
    __table_args__ = (
        Index("ix_fields_venue_type", "venue_id", "field_type"),
        CheckConstraint("field_type IN ('5v5','7v7','11v11')", name="ck_fields_type"),
        CheckConstraint("surface IN ('artificial','natural','futsal')", name="ck_fields_surface"),
        CheckConstraint("base_price_minor >= 0", name="ck_fields_price"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    field_type: Mapped[str] = mapped_column(String(8))
    surface: Mapped[str] = mapped_column(String(16))
    indoor: Mapped[bool] = mapped_column(Boolean, default=False)
    # Fallback rate (USD cents/hour) used when no pricing rule matches.
    base_price_minor: Mapped[int] = mapped_column(Integer)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    venue: Mapped[Venue] = relationship(back_populates="fields")


class FieldImage(Base):
    __tablename__ = "field_images"
    id: Mapped[uuid.UUID] = uuid_pk()
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(String(255))
    alt: Mapped[str] = mapped_column(String(160), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False)


class Field3DModel(Base):
    __tablename__ = "field_3d_models"
    __table_args__ = (CheckConstraint("format IN ('glb','gltf')", name="ck_models_format"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), unique=True)
    storage_key: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(8), default="glb")
    size_bytes: Mapped[int] = mapped_column(Integer)


class OperatingHour(Base):
    """Weekly opening window for a field. Minutes since local (business-timezone) midnight."""

    __tablename__ = "operating_hours"
    __table_args__ = (
        UniqueConstraint("field_id", "weekday", name="uq_hours_field_weekday"),
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_hours_weekday"),
        CheckConstraint("open_minute >= 0 AND close_minute <= 1440 AND close_minute > open_minute", name="ck_hours_range"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = Monday
    open_minute: Mapped[int] = mapped_column(Integer)
    close_minute: Mapped[int] = mapped_column(Integer)


class PricingRule(Base, TimestampMixin):
    __tablename__ = "pricing_rules"
    __table_args__ = (
        CheckConstraint("price_minor >= 0", name="ck_pricing_price"),
        CheckConstraint("start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute", name="ck_pricing_range"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    start_minute: Mapped[int] = mapped_column(Integer)
    end_minute: Mapped[int] = mapped_column(Integer)
    price_minor: Mapped[int] = mapped_column(Integer)  # per hour
    priority: Mapped[int] = mapped_column(Integer, default=0)  # highest wins on overlap
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)


class AvailabilityException(Base):
    __tablename__ = "availability_exceptions"
    __table_args__ = (CheckConstraint("end_at > start_at", name="ck_exceptions_range"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(String(160), default="")
