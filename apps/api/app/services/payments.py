"""Payment orchestration. Lock order everywhere is booking → payment, so concurrent pay / webhook / cancel can't deadlock."""
import hashlib
import logging
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.config import get_settings
from app.models import Booking, Field, Notification, Payment, PaymentEvent, Refund, User, Venue
from app.payments.base import InvalidSignature, ProviderError, WebhookEvent
from app.payments.registry import get_provider
from app.schemas.payment import PaymentOut, RefundOut
from app.services import bookings as bk
from app.services.timeutil import now_utc

log = logging.getLogger(__name__)
PAY_AT_VENUE = "pay_at_venue"
CLAIM_TO_STATE = {"payment.succeeded": "succeeded", "payment.failed": "failed", "payment.expired": "expired"}


def _notify(session: AsyncSession, user_id: uuid.UUID, kind: str, title: str, body: str = "") -> None:
    session.add(Notification(user_id=user_id, kind=kind, title=title, body=body))


async def _lock_booking(session: AsyncSession, booking_id: uuid.UUID) -> Booking:
    return await session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())


async def _context(session: AsyncSession, b: Booking) -> tuple[Field, Venue]:
    f = await session.get(Field, b.field_id)
    return f, await session.get(Venue, f.venue_id)


def _confirm(session: AsyncSession, b: Booking, venue: Venue, how: str) -> None:
    bk.transition(b, "confirmed")
    _notify(session, b.customer_id, "booking_confirmed", f"Booking {b.reference} confirmed", how)
    _notify(session, venue.owner_id, "booking_new", f"New booking {b.reference}", f"{venue.name} · {b.start_at:%Y-%m-%d %H:%M} UTC")


# --------------------------------------------------------------------------- start


async def start_payment(session: AsyncSession, user: User, booking_id: uuid.UUID, provider_name: str, idem_key: str) -> Payment:
    s = get_settings()
    now = now_utc()
    b = await _lock_booking(session, booking_id)
    if not b or b.customer_id != user.id:
        raise bk.err(404, "BOOKING_NOT_FOUND", "Booking not found")
    key_hash = hashlib.sha256(f"{user.id}:{idem_key}".encode()).hexdigest()  # keys are per user, never compared raw

    replay = await session.scalar(select(Payment).where(Payment.idempotency_key == key_hash))
    if replay:
        if replay.booking_id != b.id:
            raise bk.err(409, "IDEMPOTENCY_CONFLICT", "That Idempotency-Key was already used for a different booking")
        return replay

    if b.status not in ("pending", "awaiting_payment"):
        raise bk.err(409, "NOT_PAYABLE", f"This booking is {b.status.replace('_', ' ')} and can't be paid")
    if b.hold_expires_at and b.hold_expires_at <= now:
        raise bk.err(409, "HOLD_EXPIRED", "Your hold expired. Please pick the slot again.")
    _, venue = await _context(session, b)

    pending = await session.scalar(select(Payment).where(Payment.booking_id == b.id, Payment.status == "pending").with_for_update())
    if pending:
        if pending.provider == provider_name:
            return pending  # same method: keep one in-flight charge (a retry with a fresh key must not create a second)
        pending.status = "cancelled"
        await session.flush()

    p = Payment(booking_id=b.id, provider=provider_name, status="pending", amount_minor=b.total_minor, currency=b.currency, idempotency_key=key_hash)
    if provider_name == PAY_AT_VENUE:
        if not venue.pay_at_venue_enabled:
            raise bk.err(422, "PROVIDER_UNAVAILABLE", "This venue doesn't accept pay-at-venue bookings")
        session.add(p)
        await session.flush()
        _confirm(session, b, venue, "Pay at the venue when you arrive.")
        audit(session, user.id, "payment.pay_at_venue", "payment", p.id, {"booking_id": str(b.id)})
        return p

    provider = get_provider(provider_name)
    session.add(p)
    await session.flush()
    try:
        intent = await provider.create_intent(session, amount_minor=p.amount_minor, currency=p.currency, reference=b.reference, idempotency_key=key_hash)
    except ProviderError as e:
        raise bk.err(502, "PROVIDER_ERROR", f"The payment provider couldn't start the payment: {e}") from None
    p.provider_ref, p.raw = intent.provider_ref, {"action": intent.action}
    if b.hold_expires_at:  # give the payer time to finish, but never hold a slot indefinitely
        grown = min(max(b.hold_expires_at, now + timedelta(minutes=s.payment_hold_grace_minutes)), b.created_at + timedelta(minutes=s.max_hold_total_minutes))
        b.hold_expires_at = max(b.hold_expires_at, grown)
    audit(session, user.id, "payment.start", "payment", p.id, {"booking_id": str(b.id), "provider": provider_name, "amount_minor": p.amount_minor})
    return p


# --------------------------------------------------------------------------- outcomes


async def apply_remote_result(session: AsyncSession, payment_id: uuid.UUID, remote_state: str) -> str:
    """Moves a payment (and its booking) to match what the provider says. Safe to call repeatedly and out of order."""
    p0 = await session.get(Payment, payment_id)
    b = await _lock_booking(session, p0.booking_id)
    p = await session.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    _, venue = await _context(session, b)

    if remote_state == "succeeded":
        if p.status in ("succeeded", "refunded"):
            return "already_applied"
        p.status = "succeeded"  # also allowed from failed/cancelled: the provider is the source of truth
        if b.status in ("pending", "awaiting_payment"):
            _confirm(session, b, venue, "Payment received.")  # even if the hold's clock ran out: the slot is still ours until it's marked expired
            audit(session, None, "payment.succeeded", "payment", p.id, {"booking_id": str(b.id)})
            return "confirmed"
        # Money arrived for a booking that is no longer live (expired / cancelled): give it straight back.
        audit(session, None, "payment.late_success", "payment", p.id, {"booking_id": str(b.id), "booking_status": b.status})
        await refund_payment(session, p, b, "Payment arrived after the reservation was released", None)
        _notify(session, b.customer_id, "payment_refunded", f"Payment for {b.reference} is being refunded",
                "Your reservation had already been released, so we returned the money.")
        return "late_refunded"
    if p.status != "pending":
        return "ignored_stale"  # e.g. a 'failed' event arriving after success
    p.status = "failed" if remote_state == "failed" else "cancelled"
    audit(session, None, f"payment.{remote_state}", "payment", p.id, {"booking_id": str(b.id)})
    return remote_state


async def refund_payment(session: AsyncSession, p: Payment, b: Booking, reason: str, actor_id: uuid.UUID | None) -> Refund | None:
    """Full refund via the original provider. Idempotent: at most one refund row per payment, retried safely."""
    if p.provider == PAY_AT_VENUE or p.status not in ("succeeded", "refunded"):
        return None
    r = await session.scalar(select(Refund).where(Refund.payment_id == p.id).with_for_update())
    if r and r.status == "succeeded":
        return r
    if not r:
        r = Refund(payment_id=p.id, amount_minor=p.amount_minor, reason=reason, status="pending")
        session.add(r)
        await session.flush()
    try:
        r.provider_ref = await get_provider(p.provider).refund(session, provider_ref=p.provider_ref or "", amount_minor=p.amount_minor,
                                                               reason=reason, idempotency_key=f"refund:{p.id}")
    except (ProviderError, HTTPException) as e:
        r.status, r.failure_reason = "failed", str(getattr(e, "detail", e))[:300]
        audit(session, actor_id, "refund.failed", "payment", p.id, {"booking_id": str(b.id), "error": r.failure_reason})
        return r
    r.status, r.failure_reason = "succeeded", None
    p.status = "refunded"
    if b.status in ("cancelled", "completed", "confirmed"):
        bk.transition(b, "refunded")
    _notify(session, b.customer_id, "booking_refunded", f"Refund issued for {b.reference}", f"{p.amount_minor / 100:.2f} {p.currency} returned to your original payment method.")
    audit(session, actor_id, "refund.succeeded", "payment", p.id, {"booking_id": str(b.id), "amount_minor": p.amount_minor})
    return r


async def after_cancel(session: AsyncSession, b: Booking, was_confirmed: bool, actor_id: uuid.UUID) -> None:
    """Called inside the cancel transaction (booking row already locked)."""
    for p in (await session.scalars(select(Payment).where(Payment.booking_id == b.id).with_for_update())).all():
        if p.status == "pending":
            p.status = "cancelled"  # a payer who still completes it later will be refunded automatically
        elif p.status == "succeeded" and was_confirmed:
            await refund_payment(session, p, b, "Booking cancelled", actor_id)


# --------------------------------------------------------------------------- webhooks


async def process_webhook(session: AsyncSession, provider_name: str, headers, body: bytes) -> str:
    provider = get_provider(provider_name)
    try:
        event: WebhookEvent = provider.verify_webhook(headers, body)
    except InvalidSignature:
        raise bk.err(401, "INVALID_SIGNATURE", "Webhook signature check failed") from None
    if event.type not in CLAIM_TO_STATE:
        return "ignored_type"

    payment = await session.scalar(select(Payment).where(Payment.provider == provider_name, Payment.provider_ref == event.provider_ref))
    try:  # idempotency: an event id is accepted exactly once
        async with session.begin_nested():
            session.add(PaymentEvent(provider=provider_name, event_id=event.event_id, event_type=event.type, payment_id=payment.id if payment else None))
            await session.flush()
    except IntegrityError:
        return "duplicate"
    if not payment:
        return "unknown_payment"
    if event.amount_minor != payment.amount_minor or event.currency != payment.currency:
        audit(session, None, "payment.amount_mismatch", "payment", payment.id, {"claimed": event.amount_minor, "expected": payment.amount_minor})
        return "ignored_mismatch"

    remote = await provider.fetch_status(session, event.provider_ref)  # never trust the webhook alone
    if remote.state != CLAIM_TO_STATE[event.type] or remote.amount_minor != payment.amount_minor:
        await session.rollback()  # forget the event so the provider's retry is processed
        raise bk.err(409, "UNVERIFIED", "Event doesn't match the provider's records yet; retry later")
    return await apply_remote_result(session, payment.id, remote.state)


async def reconcile_pending(session_factory) -> int:
    """Catches lost webhooks: asks the provider about payments that have been pending for a while."""
    cutoff = now_utc() - timedelta(seconds=get_settings().reconcile_after_seconds)
    async with session_factory() as s:
        rows = (await s.execute(select(Payment.id, Payment.provider, Payment.provider_ref).where(
            Payment.status == "pending", Payment.provider != PAY_AT_VENUE, Payment.provider_ref.is_not(None), Payment.created_at < cutoff))).all()
    changed = 0
    for pid, provider_name, ref in rows:
        try:
            async with session_factory() as s:
                remote = await get_provider(provider_name).fetch_status(s, ref)
                if remote.state != "pending":
                    await apply_remote_result(s, pid, remote.state)
                    await s.commit()
                    changed += 1
        except Exception:
            log.exception("reconcile failed for payment %s", pid)
    return changed


# --------------------------------------------------------------------------- read model


async def latest_payment_out(session: AsyncSession, booking_id: uuid.UUID) -> PaymentOut | None:
    p = await session.scalar(select(Payment).where(Payment.booking_id == booking_id).order_by(Payment.created_at.desc()).limit(1).execution_options(populate_existing=True))
    if not p:
        return None
    r = await session.scalar(select(Refund).where(Refund.payment_id == p.id).execution_options(populate_existing=True))
    return PaymentOut(id=p.id, provider=p.provider, status=p.status, amount_minor=p.amount_minor, currency=p.currency,
                      action=(p.raw or {}).get("action") if p.status == "pending" else None, refund=RefundOut.model_validate(r) if r else None)


async def payments_out_for(session: AsyncSession, booking_ids: list[uuid.UUID]) -> dict[uuid.UUID, PaymentOut]:
    """Latest payment per booking for a page of bookings, in two queries."""
    if not booking_ids:
        return {}
    latest: dict[uuid.UUID, Payment] = {}
    for p in await session.scalars(select(Payment).where(Payment.booking_id.in_(booking_ids)).order_by(Payment.created_at)):
        latest[p.booking_id] = p
    refunds = {r.payment_id: r for r in await session.scalars(select(Refund).where(Refund.payment_id.in_([p.id for p in latest.values()])))} if latest else {}
    return {bid: PaymentOut(id=p.id, provider=p.provider, status=p.status, amount_minor=p.amount_minor, currency=p.currency, action=None,
                            refund=RefundOut.model_validate(refunds[p.id]) if p.id in refunds else None) for bid, p in latest.items()}
