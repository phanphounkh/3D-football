"""Mock provider: a stand-in for a KHQR/card network with realistic states (pending → succeeded/failed/expired), signed
webhooks, status lookups and refunds. Demo only; refused in production by config."""
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Mapping
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import MockCharge
from app.payments.base import (
    Intent,
    InvalidSignature,
    PaymentProvider,
    ProviderError,
    RemoteStatus,
    WebhookEvent,
)
from app.services.timeutil import now_utc

SIGNATURE_HEADER = "x-mock-signature"
TYPES = {"succeeded": "payment.succeeded", "failed": "payment.failed", "expired": "payment.expired"}


def sign(body: bytes, timestamp: int | None = None, secret: str | None = None) -> str:
    t = int(timestamp if timestamp is not None else time.time())
    key = (secret or get_settings().mock_webhook_secret).encode()
    mac = hmac.new(key, f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"


class MockProvider(PaymentProvider):
    name = "mock"

    async def create_intent(self, session: AsyncSession, *, amount_minor: int, currency: str, reference: str, idempotency_key: str) -> Intent:
        ref = "mock_ch_" + secrets.token_hex(10)
        expires = now_utc() + timedelta(minutes=get_settings().mock_charge_ttl_minutes)
        session.add(MockCharge(ref=ref, amount_minor=amount_minor, currency=currency, expires_at=expires))
        await session.flush()
        return Intent(ref, {"type": "qr", "payload": f"MOCKKHQR|{ref}|{amount_minor}|{currency}|{reference}", "expires_at": expires.isoformat(), "demo": True})

    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> WebhookEvent:
        header = headers.get(SIGNATURE_HEADER)
        if not header:
            raise InvalidSignature("missing signature")
        try:
            parts = dict(p.split("=", 1) for p in header.split(","))
            t, v1 = int(parts["t"]), parts["v1"]
        except (KeyError, ValueError):
            raise InvalidSignature("malformed signature") from None
        if abs(time.time() - t) > get_settings().webhook_tolerance_seconds:
            raise InvalidSignature("stale timestamp")  # blocks replay of captured requests
        expected = sign(body, t).split("v1=")[1]
        if not hmac.compare_digest(expected, v1):
            raise InvalidSignature("bad signature")
        try:
            d = json.loads(body)
            return WebhookEvent(str(d["id"]), str(d["type"]), str(d["charge"]), int(d["amount_minor"]), str(d["currency"]))
        except (KeyError, ValueError, TypeError):
            raise InvalidSignature("malformed payload") from None

    async def _charge(self, session: AsyncSession, ref: str, *, lock: bool = False) -> MockCharge | None:
        q = select(MockCharge).where(MockCharge.ref == ref)
        return await session.scalar(q.with_for_update() if lock else q)

    async def fetch_status(self, session: AsyncSession, provider_ref: str) -> RemoteStatus:
        c = await self._charge(session, provider_ref)
        if not c:
            raise ProviderError("unknown charge")
        state = c.status
        if state == "pending" and c.expires_at <= now_utc():
            state = "expired"
        return RemoteStatus(state, c.amount_minor, c.currency)  # type: ignore[arg-type]

    async def refund(self, session: AsyncSession, *, provider_ref: str, amount_minor: int, reason: str, idempotency_key: str) -> str:
        c = await self._charge(session, provider_ref, lock=True)
        if not c or c.status != "succeeded":
            raise ProviderError("charge is not refundable")
        if c.refunded_minor + amount_minor > c.amount_minor:
            raise ProviderError("refund exceeds charge")
        c.refunded_minor += amount_minor
        return "mock_re_" + hashlib.sha256(idempotency_key.encode()).hexdigest()[:16]

    # ---- simulation of the payer's side (the "bank app"); not part of the provider contract ----
    async def simulate(self, session: AsyncSession, provider_ref: str, outcome: str) -> bytes:
        """Settle the charge as the network would and return the signed webhook body it would send."""
        c = await self._charge(session, provider_ref, lock=True)
        if not c:
            raise ProviderError("unknown charge")
        if c.status == "pending":
            c.status = {"succeed": "succeeded", "fail": "failed", "expire": "expired"}[outcome]
        return self.webhook_body(c)

    @staticmethod
    def webhook_body(c: MockCharge, event_id: str | None = None) -> bytes:
        return json.dumps({"id": event_id or "evt_" + secrets.token_hex(8), "type": TYPES[c.status], "charge": c.ref,
                           "amount_minor": c.amount_minor, "currency": c.currency}).encode()
