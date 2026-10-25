import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select

from app.api.v1.bookings import _load, _out
from app.audit import audit
from app.config import get_settings
from app.deps import CurrentUser, OwnerUser, Session
from app.models import Booking, Field, Payment, User, Venue
from app.payments.base import ProviderError
from app.payments.mock import SIGNATURE_HEADER, MockProvider, sign
from app.payments.registry import get_provider
from app.ratelimit import rate_limit
from app.schemas.booking import BookingOut
from app.schemas.payment import IDEMPOTENCY_KEY_PATTERN, PayIn, PaymentOut, SimulateIn
from app.services import bookings as bk
from app.services import payments as svc

router = APIRouter(tags=["payments"])
MAX_WEBHOOK_BYTES = 64 * 1024


async def _booking_out(session: Session, booking_id: uuid.UUID, user: User) -> BookingOut:
    b, field, venue = await _load(session, booking_id, user)
    customer = await session.get(User, b.customer_id)
    return _out(b, field, venue, user, customer, await svc.latest_payment_out(session, b.id))


@router.post("/bookings/{booking_id}/pay", response_model=PaymentOut, dependencies=[Depends(rate_limit("pay", 30, 60))])
async def pay(booking_id: uuid.UUID, body: PayIn, user: CurrentUser, session: Session, request: Request, response: Response,
              idempotency_key: Annotated[str, Header(alias="Idempotency-Key", pattern=IDEMPOTENCY_KEY_PATTERN)]) -> PaymentOut:
    """Starts (or replays) a payment. Repeating the call with the same Idempotency-Key returns the same payment."""
    p = await svc.start_payment(session, user, booking_id, body.provider, idempotency_key)
    await session.commit()
    out = await svc.latest_payment_out(session, booking_id)
    assert out and out.id == p.id
    return out


@router.post("/payments/webhooks/{provider}")
async def webhook(provider: str, request: Request, session: Session) -> dict[str, str]:
    """Called by the payment provider. Authenticated by signature, never by session."""
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BYTES:
        raise bk.err(413, "PAYLOAD_TOO_LARGE", "Webhook body too large")
    outcome = await svc.process_webhook(session, provider, request.headers, body)
    await session.commit()
    return {"status": outcome}


@router.post("/bookings/{booking_id}/payment/simulate", response_model=BookingOut)
async def simulate(booking_id: uuid.UUID, body: SimulateIn, user: CurrentUser, session: Session, request: Request) -> BookingOut:
    """Demo only: plays the part of the payer's bank app. It settles the mock charge, then delivers a *signed webhook* to the
    real webhook endpoint, so the application exercises exactly the path a production provider would use."""
    s = get_settings()
    if not s.mock_payments_enabled or s.env == "production":
        raise bk.err(404, "NOT_FOUND", "Not found")
    b, _, _ = await _load(session, booking_id, user)
    if b.customer_id != user.id and user.role != "admin":
        raise bk.err(404, "BOOKING_NOT_FOUND", "Booking not found")
    p = await session.scalar(select(Payment).where(Payment.booking_id == b.id, Payment.provider == "mock", Payment.status == "pending"))
    if not p or not p.provider_ref:
        raise bk.err(409, "NO_PENDING_PAYMENT", "There's no pending demo payment to settle")
    provider = get_provider("mock")
    assert isinstance(provider, MockProvider)
    try:
        webhook_body = await provider.simulate(session, p.provider_ref, body.outcome)
    except ProviderError as e:
        raise bk.err(409, "SIMULATION_FAILED", str(e)) from None
    await session.commit()  # the "bank" has settled; now it notifies us over HTTP like a real provider
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=request.app), base_url="http://internal") as c:
        r = await c.post("/api/v1/payments/webhooks/mock", content=webhook_body, headers={SIGNATURE_HEADER: sign(webhook_body)})
    if r.status_code >= 400:
        raise bk.err(502, "WEBHOOK_REJECTED", f"Webhook delivery failed: {r.text[:200]}")
    return await _booking_out(session, booking_id, user)


@router.post("/owner/bookings/{booking_id}/mark-paid", response_model=PaymentOut, tags=["owner"])
async def mark_paid(booking_id: uuid.UUID, user: OwnerUser, session: Session, request: Request) -> PaymentOut:
    """Owner records cash/card collected at the venue for a pay-at-venue booking."""
    b = await session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
    venue = await session.scalar(select(Venue).join(Field, Field.venue_id == Venue.id).where(Field.id == b.field_id)) if b else None
    if not b or not venue or (user.role != "admin" and venue.owner_id != user.id):
        raise bk.err(404, "BOOKING_NOT_FOUND", "Booking not found")
    p = await session.scalar(select(Payment).where(Payment.booking_id == b.id, Payment.provider == svc.PAY_AT_VENUE).with_for_update())
    if not p or b.status not in ("confirmed", "completed"):
        raise bk.err(409, "NOT_PAYABLE_AT_VENUE", "This booking has no outstanding pay-at-venue payment")
    if p.status == "pending":
        p.status = "succeeded"
        audit(session, user.id, "payment.collected", "payment", p.id, {"booking_id": str(b.id)}, request)
    await session.commit()
    out = await svc.latest_payment_out(session, b.id)
    assert out
    return out
