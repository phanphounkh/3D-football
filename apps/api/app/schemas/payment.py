import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict


class PayIn(BaseModel):
    provider: Literal["mock", "pay_at_venue"]


class RefundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    amount_minor: int
    failure_reason: str | None = None


class PaymentOut(BaseModel):
    id: uuid.UUID
    provider: str
    status: str
    amount_minor: int
    currency: str
    action: dict | None = None  # e.g. {"type": "qr", "payload": "...", "expires_at": "...", "demo": true}
    refund: RefundOut | None = None


class SimulateIn(BaseModel):
    outcome: Literal["succeed", "fail", "expire"]


IDEMPOTENCY_KEY_PATTERN = r"^[A-Za-z0-9_\-]{8,64}$"
