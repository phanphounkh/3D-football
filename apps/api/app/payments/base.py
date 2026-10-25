"""Provider adapter contract. KHQR/Bakong and card gateways each implement this; the booking code never talks to a provider directly.

Rules every adapter must follow:
- `verify_webhook` authenticates the request (signature + freshness) and raises `InvalidSignature` otherwise.
- A webhook is only a *hint*: the service re-checks the outcome with `fetch_status` before it confirms anything.
- Calls that create money movement take an idempotency key so retries can never charge or refund twice.
"""
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

RemoteState = Literal["pending", "succeeded", "failed", "expired"]


class ProviderError(Exception):
    """The provider rejected or couldn't process a request."""


class InvalidSignature(Exception):
    """Webhook failed authentication."""


@dataclass
class Intent:
    provider_ref: str
    action: dict = field(default_factory=dict)  # what the client must do next (show a QR, redirect, ...)


@dataclass
class WebhookEvent:
    event_id: str
    type: str  # payment.succeeded | payment.failed | payment.expired
    provider_ref: str
    amount_minor: int
    currency: str


@dataclass
class RemoteStatus:
    state: RemoteState
    amount_minor: int
    currency: str


class PaymentProvider(ABC):
    name: str

    @abstractmethod
    async def create_intent(self, session: AsyncSession, *, amount_minor: int, currency: str, reference: str, idempotency_key: str) -> Intent: ...

    @abstractmethod
    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> WebhookEvent: ...

    @abstractmethod
    async def fetch_status(self, session: AsyncSession, provider_ref: str) -> RemoteStatus: ...

    @abstractmethod
    async def refund(self, session: AsyncSession, *, provider_ref: str, amount_minor: int, reason: str, idempotency_key: str) -> str: ...
