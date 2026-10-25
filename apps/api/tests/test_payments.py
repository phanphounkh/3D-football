import asyncio
import json
import time
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.config import get_settings
from app.models import (
    AuditLog,
    Booking,
    MockCharge,
    Notification,
    Payment,
    PaymentEvent,
    Refund,
)
from app.payments.base import ProviderError
from app.payments.mock import SIGNATURE_HEADER, MockProvider, sign
from app.services import payments as pay_svc
from app.services.timeutil import now_utc
from tests.conftest import future_day, iso, slot

HOOK = "/api/v1/payments/webhooks/mock"


def key() -> str:
    return uuid.uuid4().hex


@pytest.fixture
def flow(client, open_field, make_user, token_for, sessionmaker):
    """A customer with a live hold on a $40/h field; returns a small bag of helpers."""
    async def _make(day_offset: int = 7, **venue_kw):
        owner, venue, field = await open_field(**venue_kw)
        cust = await make_user()
        h = token_for(cust)
        r = await client.post("/api/v1/bookings", headers=h, json={"field_id": str(field.id), "start_at": iso(slot(future_day(day_offset), "10:00")), "duration_minutes": 60})
        assert r.status_code == 201, r.text

        class F:
            pass

        f = F()
        f.owner, f.venue, f.field, f.cust, f.h, f.oh = owner, venue, field, cust, h, token_for(owner)
        f.booking = r.json()
        f.id = r.json()["id"]
        return f

    return _make


async def pay(client, f, provider="mock", k=None, headers=None):
    return await client.post(f"/api/v1/bookings/{f.id}/pay", headers={**(headers or f.h), "Idempotency-Key": k or key()}, json={"provider": provider})


async def get(client, f, headers=None):
    return (await client.get(f"/api/v1/bookings/{f.id}", headers=headers or f.h)).json()


async def simulate(client, f, outcome="succeed"):
    return await client.post(f"/api/v1/bookings/{f.id}/payment/simulate", headers=f.h, json={"outcome": outcome})


async def hook(client, body: bytes, sig: str | None = None, headers=None):
    h = {SIGNATURE_HEADER: sig if sig is not None else sign(body), "content-type": "application/json"}
    h.update(headers or {})
    return await client.post(HOOK, content=body, headers=h)


async def charge_for(sessionmaker, booking_id) -> MockCharge:
    async with sessionmaker() as s:
        p = await s.scalar(select(Payment).where(Payment.booking_id == uuid.UUID(booking_id)).order_by(Payment.created_at.desc()))
        return await s.get(MockCharge, p.provider_ref)


def evt(c: MockCharge, type_="payment.succeeded", id_=None, amount=None) -> bytes:
    return json.dumps({"id": id_ or "evt_" + key()[:12], "type": type_, "charge": c.ref,
                       "amount_minor": c.amount_minor if amount is None else amount, "currency": c.currency}).encode()


async def settle_ledger(sessionmaker, ref, status):
    async with sessionmaker() as s:
        await s.execute(update(MockCharge).where(MockCharge.ref == ref).values(status=status))
        await s.commit()


# ------------------------------------------------------------------ happy path


async def test_full_payment_flow_confirms_booking(client, flow, sessionmaker):
    f = await flow()
    r = await pay(client, f)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["status"] == "pending" and p["amount_minor"] == 4000 and p["action"]["type"] == "qr" and p["action"]["demo"] is True
    assert (await get(client, f))["status"] == "awaiting_payment"  # NOT confirmed just because a payment was started

    b = (await simulate(client, f, "succeed")).json()
    assert b["status"] == "confirmed" and b["payment"]["status"] == "succeeded" and b["payment"]["action"] is None
    assert b["hold_expires_at"] is None

    async with sessionmaker() as s:
        notes = (await s.scalars(select(Notification))).all()
        actions = {a.action for a in (await s.scalars(select(AuditLog))).all()}
        bk = await s.scalar(select(Booking))
    kinds = sorted(n.kind for n in notes)
    assert kinds == ["booking_confirmed", "booking_new"]
    assert {n.user_id for n in notes} == {f.cust.id, f.owner.id}
    assert {"payment.start", "payment.succeeded"} <= actions
    assert bk.commission_minor == 400  # 10% of 4000, fixed when the hold was created


async def test_starting_a_payment_extends_the_hold_but_only_within_the_cap(client, flow, sessionmaker):
    f = await flow()
    async with sessionmaker() as s:  # pretend the hold is nearly over
        await s.execute(update(Booking).values(hold_expires_at=now_utc() + timedelta(seconds=20)))
        await s.commit()
    await pay(client, f)
    async with sessionmaker() as s:
        b = await s.scalar(select(Booking))
    s_ = get_settings()
    assert b.hold_expires_at >= now_utc() + timedelta(minutes=s_.payment_hold_grace_minutes - 1)
    assert b.hold_expires_at <= b.created_at + timedelta(minutes=s_.max_hold_total_minutes)


# ------------------------------------------------------------------ idempotency


async def test_same_idempotency_key_returns_same_payment(client, flow, sessionmaker):
    f = await flow()
    k = key()
    a, b = await pay(client, f, k=k), await pay(client, f, k=k)
    assert a.json()["id"] == b.json()["id"]
    c = await pay(client, f)  # a *different* key while one is in flight must not create a second charge
    assert c.json()["id"] == a.json()["id"]
    async with sessionmaker() as s:
        assert len((await s.scalars(select(Payment))).all()) == 1
        assert len((await s.scalars(select(MockCharge))).all()) == 1


async def test_concurrent_pay_calls_make_one_charge(client, flow, sessionmaker):
    f = await flow()
    k = key()
    rs = await asyncio.gather(*(pay(client, f, k=k) for _ in range(8)), *(pay(client, f) for _ in range(4)))
    assert all(r.status_code == 200 for r in rs)
    assert len({r.json()["id"] for r in rs}) == 1
    async with sessionmaker() as s:
        assert len((await s.scalars(select(Payment))).all()) == 1
        assert len((await s.scalars(select(MockCharge))).all()) == 1


async def test_idempotency_key_cannot_cross_bookings_or_users(client, flow, make_user, token_for):
    f = await flow()
    k = key()
    assert (await pay(client, f, k=k)).status_code == 200
    g = await flow()
    assert (await pay(client, g, k=k)).status_code == 200  # same raw key, different user: independent namespaces
    # same user, second booking, reused key -> conflict
    r = await client.post("/api/v1/bookings", headers=f.h, json={"field_id": str(f.field.id), "start_at": iso(slot(future_day(8), "12:00")), "duration_minutes": 60})
    f2 = type("F2", (), {"id": r.json()["id"], "h": f.h})
    r2 = await pay(client, f2, k=k)
    assert r2.status_code == 409 and r2.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


async def test_pay_validation_and_access(client, flow, make_user, token_for):
    f = await flow()
    no_key = await client.post(f"/api/v1/bookings/{f.id}/pay", headers=f.h, json={"provider": "mock"})
    assert no_key.status_code == 422
    short = await pay(client, f, k="abc")
    assert short.status_code == 422
    assert (await client.post(f"/api/v1/bookings/{f.id}/pay", headers={**f.h, "Idempotency-Key": key()}, json={"provider": "paypal"})).status_code == 422
    stranger = token_for(await make_user())
    assert (await pay(client, f, headers=stranger)).status_code == 404
    assert (await pay(client, f, headers=f.oh)).status_code == 404  # the venue owner can't pay on the customer's behalf
    assert (await client.post(f"/api/v1/bookings/{f.id}/pay", headers={"Idempotency-Key": key()}, json={"provider": "mock"})).status_code == 401


async def test_cannot_pay_for_expired_or_finished_bookings(client, flow, sessionmaker):
    f = await flow()
    async with sessionmaker() as s:
        await s.execute(update(Booking).values(hold_expires_at=now_utc() - timedelta(seconds=1)))
        await s.commit()
    r = await pay(client, f)
    assert r.status_code == 409 and r.json()["error"]["code"] == "HOLD_EXPIRED"
    async with sessionmaker() as s:
        await s.execute(update(Booking).values(status="cancelled", hold_expires_at=None))
        await s.commit()
    assert (await pay(client, f)).json()["error"]["code"] == "NOT_PAYABLE"


# ------------------------------------------------------------------ webhook security


async def test_webhook_rejects_bad_signatures_and_stale_timestamps(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    c = await charge_for(sessionmaker, f.id)
    await settle_ledger(sessionmaker, c.ref, "succeeded")
    body = evt(c)
    assert (await client.post(HOOK, content=body)).status_code == 401  # no signature
    assert (await hook(client, body, sig="t=1,v1=deadbeef")).status_code == 401  # forged
    assert (await hook(client, body, sig="garbage")).status_code == 401
    assert (await hook(client, body, sig=sign(body, secret="wrong-secret"))).status_code == 401
    assert (await hook(client, body, sig=sign(body, timestamp=int(time.time()) - 3600))).status_code == 401  # replayed old capture
    tampered = body.replace(b'"amount_minor": 4000', b'"amount_minor": 1')
    assert (await hook(client, tampered, sig=sign(body))).status_code == 401  # signature belongs to a different body
    assert (await get(client, f))["status"] == "awaiting_payment"  # none of that confirmed anything
    assert (await hook(client, body)).json() == {"status": "confirmed"}


async def test_webhook_is_idempotent_even_under_concurrent_duplicates(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    c = await charge_for(sessionmaker, f.id)
    await settle_ledger(sessionmaker, c.ref, "succeeded")
    body = evt(c, id_="evt_same")
    rs = await asyncio.gather(*(hook(client, body) for _ in range(6)))
    assert all(r.status_code == 200 for r in rs)
    outcomes = sorted(r.json()["status"] for r in rs)
    assert outcomes.count("confirmed") == 1 and outcomes.count("duplicate") == 5
    async with sessionmaker() as s:
        assert len((await s.scalars(select(PaymentEvent))).all()) == 1
        assert len((await s.scalars(select(Notification))).all()) == 2  # one customer + one owner, not 6x


async def test_webhook_does_not_trust_a_signed_claim_the_provider_cannot_confirm(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    c = await charge_for(sessionmaker, f.id)  # ledger still says pending
    r = await hook(client, evt(c, "payment.succeeded", id_="evt_early"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "UNVERIFIED"
    assert (await get(client, f))["status"] == "awaiting_payment"
    async with sessionmaker() as s:
        assert (await s.scalars(select(PaymentEvent))).all() == []  # not recorded, so the provider's retry is processed
    await settle_ledger(sessionmaker, c.ref, "succeeded")
    assert (await hook(client, evt(c, id_="evt_early"))).json() == {"status": "confirmed"}


async def test_webhook_amount_mismatch_and_unknown_inputs(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    c = await charge_for(sessionmaker, f.id)
    await settle_ledger(sessionmaker, c.ref, "succeeded")
    assert (await hook(client, evt(c, amount=100))).json() == {"status": "ignored_mismatch"}
    assert (await get(client, f))["status"] == "awaiting_payment"
    async with sessionmaker() as s:
        assert "payment.amount_mismatch" in {a.action for a in (await s.scalars(select(AuditLog))).all()}
    ghost = json.dumps({"id": "e1", "type": "payment.succeeded", "charge": "mock_ch_nope", "amount_minor": 1, "currency": "USD"}).encode()
    assert (await hook(client, ghost)).json() == {"status": "unknown_payment"}
    other = json.dumps({"id": "e2", "type": "customer.created", "charge": "x", "amount_minor": 1, "currency": "USD"}).encode()
    assert (await hook(client, other)).json() == {"status": "ignored_type"}
    assert (await client.post("/api/v1/payments/webhooks/stripe", content=b"{}")).status_code == 404
    assert (await hook(client, b"x" * 70_000)).status_code == 413


# ------------------------------------------------------------------ failure / expiry / ordering


async def test_failed_payment_keeps_the_hold_and_allows_retry(client, flow):
    f = await flow()
    first = (await pay(client, f)).json()
    b = (await simulate(client, f, "fail")).json()
    assert b["status"] == "awaiting_payment" and b["payment"]["status"] == "failed"
    second = (await pay(client, f)).json()  # fresh key: a new attempt
    assert second["id"] != first["id"] and second["status"] == "pending"
    assert (await simulate(client, f, "succeed")).json()["status"] == "confirmed"


async def test_expired_charge_is_cancelled_not_confirmed(client, flow):
    f = await flow()
    await pay(client, f)
    b = (await simulate(client, f, "expire")).json()
    assert b["status"] == "awaiting_payment" and b["payment"]["status"] == "cancelled"


async def test_stale_failure_cannot_undo_a_success(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    await simulate(client, f, "succeed")
    c = await charge_for(sessionmaker, f.id)
    await settle_ledger(sessionmaker, c.ref, "failed")  # nonsense, but let's see that it's not applied
    r = await hook(client, evt(c, "payment.failed"))
    assert r.status_code == 200 and r.json() == {"status": "ignored_stale"}
    assert (await get(client, f))["status"] == "confirmed"


async def test_payment_after_hold_expired_is_refunded_automatically(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    async with sessionmaker() as s:  # the sweeper released the slot while the payer was still in their bank app
        await s.execute(update(Booking).values(status="expired", hold_expires_at=None))
        await s.commit()
    b = (await simulate(client, f, "succeed")).json()
    assert b["status"] == "expired"  # never resurrected: the slot may already belong to someone else
    assert b["payment"]["status"] == "refunded" and b["payment"]["refund"]["status"] == "succeeded"
    c = await charge_for(sessionmaker, f.id)
    assert c.refunded_minor == 4000
    async with sessionmaker() as s:
        assert {n.kind for n in (await s.scalars(select(Notification).where(Notification.user_id == f.cust.id))).all()} >= {"payment_refunded"}


async def test_payment_completed_after_cancellation_is_refunded(client, flow, sessionmaker):
    f = await flow()
    await pay(client, f)
    assert (await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={})).json()["status"] == "cancelled"
    c = await charge_for(sessionmaker, f.id)
    await settle_ledger(sessionmaker, c.ref, "succeeded")
    assert (await hook(client, evt(c))).json() == {"status": "late_refunded"}
    assert (await charge_for(sessionmaker, f.id)).refunded_minor == 4000


async def test_reconciliation_recovers_lost_webhooks(client, flow, sessionmaker, monkeypatch):
    f = await flow()
    g = await flow()
    await pay(client, f)
    await pay(client, g)
    cf, cg = await charge_for(sessionmaker, f.id), await charge_for(sessionmaker, g.id)
    await settle_ledger(sessionmaker, cf.ref, "succeeded")  # the bank settled, but its webhook never reached us
    await settle_ledger(sessionmaker, cg.ref, "expired")
    assert await pay_svc.reconcile_pending(sessionmaker) == 0  # too recent: respects the grace period
    monkeypatch.setattr(get_settings(), "reconcile_after_seconds", 0)
    assert await pay_svc.reconcile_pending(sessionmaker) == 2
    assert (await get(client, f))["status"] == "confirmed"
    assert (await get(client, g))["payment"]["status"] == "cancelled"
    assert await pay_svc.reconcile_pending(sessionmaker) == 0  # idempotent


# ------------------------------------------------------------------ refunds


async def test_cancel_confirmed_booking_refunds_to_original_payment(client, flow, sessionmaker):
    f = await flow(day_offset=10)
    await pay(client, f)
    await simulate(client, f, "succeed")
    r = await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={"reason": "can't make it"})
    b = r.json()
    assert r.status_code == 200 and b["status"] == "refunded"
    assert b["payment"]["status"] == "refunded" and b["payment"]["refund"] == {"status": "succeeded", "amount_minor": 4000, "failure_reason": None}
    assert (await charge_for(sessionmaker, f.id)).refunded_minor == 4000
    async with sessionmaker() as s:
        assert len((await s.scalars(select(Refund))).all()) == 1
        assert "refund.succeeded" in {a.action for a in (await s.scalars(select(AuditLog))).all()}


async def test_refund_window_applies_to_customers_but_not_owners(client, flow, sessionmaker):
    f = await flow(day_offset=10)
    await pay(client, f)
    await simulate(client, f, "succeed")
    async with sessionmaker() as s:  # kick-off in 5 hours
        await s.execute(update(Booking).values(start_at=now_utc() + timedelta(hours=5), end_at=now_utc() + timedelta(hours=6)))
        await s.commit()
    denied = await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={})
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "CANCEL_WINDOW_PASSED"
    assert (await get(client, f))["payment"]["status"] == "succeeded"  # nothing was refunded by the failed attempt
    ok = await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.oh, json={"reason": "pitch flooded"})
    assert ok.json()["status"] == "refunded"


async def test_provider_refund_failure_is_recorded_and_admin_can_retry(client, flow, make_user, token_for, sessionmaker, monkeypatch):
    f = await flow(day_offset=10)
    await pay(client, f)
    await simulate(client, f, "succeed")

    real = MockProvider.refund

    async def down(self, *a, **k):
        raise ProviderError("provider unavailable")

    monkeypatch.setattr(MockProvider, "refund", down)
    b = (await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={})).json()
    assert b["status"] == "cancelled"  # the cancellation itself stands
    assert b["payment"]["status"] == "succeeded" and b["payment"]["refund"]["status"] == "failed"
    assert "provider unavailable" in b["payment"]["refund"]["failure_reason"]

    monkeypatch.setattr(MockProvider, "refund", real)
    admin_h = token_for(await make_user("admin"))
    async with sessionmaker() as s:
        rid = (await s.scalar(select(Refund))).id
    assert (await client.post(f"/api/v1/admin/refunds/{rid}/retry", headers=token_for(f.cust))).status_code == 403
    r = await client.post(f"/api/v1/admin/refunds/{rid}/retry", headers=admin_h)
    assert r.status_code == 200 and r.json()["status"] == "succeeded"
    assert (await client.post(f"/api/v1/admin/refunds/{rid}/retry", headers=admin_h)).json()["status"] == "succeeded"  # repeat is harmless
    assert (await charge_for(sessionmaker, f.id)).refunded_minor == 4000  # refunded exactly once
    assert (await get(client, f))["status"] == "refunded"


async def test_cancelling_an_unpaid_hold_cancels_its_pending_payment(client, flow):
    f = await flow()
    await pay(client, f)
    b = (await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={})).json()
    assert b["status"] == "cancelled" and b["payment"]["status"] == "cancelled" and b["payment"]["refund"] is None


# ------------------------------------------------------------------ pay at venue


async def test_pay_at_venue_requires_opt_in_and_confirms_immediately(client, flow, sessionmaker):
    f = await flow()
    r = await pay(client, f, provider="pay_at_venue")
    assert r.status_code == 422 and r.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert (await client.patch(f"/api/v1/owner/venues/{f.venue.id}", headers=f.oh, json={"pay_at_venue_enabled": True})).json()["pay_at_venue_enabled"] is True
    r = await pay(client, f, provider="pay_at_venue")
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert (await get(client, f))["status"] == "confirmed"  # slot is committed, cash is collected later

    assert (await client.post(f"/api/v1/owner/bookings/{f.id}/mark-paid", headers=f.h)).status_code == 403  # customers can't self-certify
    ok = await client.post(f"/api/v1/owner/bookings/{f.id}/mark-paid", headers=f.oh)
    assert ok.status_code == 200 and ok.json()["status"] == "succeeded"
    assert (await client.post(f"/api/v1/owner/bookings/{f.id}/mark-paid", headers=f.oh)).status_code == 200  # idempotent


async def test_cancelling_pay_at_venue_booking_has_nothing_to_refund(client, flow):
    f = await flow(day_offset=10)
    await client.patch(f"/api/v1/owner/venues/{f.venue.id}", headers=f.oh, json={"pay_at_venue_enabled": True})
    await pay(client, f, provider="pay_at_venue")
    b = (await client.post(f"/api/v1/bookings/{f.id}/cancel", headers=f.h, json={})).json()
    assert b["status"] == "cancelled" and b["payment"]["status"] == "cancelled" and b["payment"]["refund"] is None


# ------------------------------------------------------------------ simulation guard rails


async def test_simulation_is_owner_only_and_disabled_in_production(client, flow, make_user, token_for, monkeypatch):
    f = await flow()
    await pay(client, f)
    stranger = token_for(await make_user())
    assert (await client.post(f"/api/v1/bookings/{f.id}/payment/simulate", headers=stranger, json={"outcome": "succeed"})).status_code == 404
    monkeypatch.setattr(get_settings(), "env", "production")
    assert (await client.post(f"/api/v1/bookings/{f.id}/payment/simulate", headers=f.h, json={"outcome": "succeed"})).status_code == 404
    monkeypatch.setattr(get_settings(), "env", "development")
    monkeypatch.setattr(get_settings(), "mock_payments_enabled", False)
    assert (await pay(client, f)).status_code == 200  # the in-flight payment is still returned
    g = await flow()
    r = await pay(client, g)  # but a brand-new mock payment is refused while the provider is disabled
    assert r.status_code == 404 and r.json()["error"]["code"] == "UNKNOWN_PROVIDER"


async def test_production_refuses_to_boot_with_mock_payments(monkeypatch):
    from app.config import Settings
    from app.config import get_settings as gs

    gs.cache_clear()
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("MOCK_PAYMENTS_ENABLED", "true")
    with pytest.raises(RuntimeError, match="mock payment"):
        gs()
    gs.cache_clear()
    assert Settings().env == "production"
    monkeypatch.undo()
    gs.cache_clear()

