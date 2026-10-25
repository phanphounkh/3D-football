import asyncio
import itertools
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.models import AuditLog, Booking, Notification
from app.services import bookings as svc
from app.services.timeutil import now_utc
from tests.conftest import future_day, iso, slot

URL = "/api/v1/bookings"


def body(field, d, hhmm="10:00", minutes=60, **kw):
    return {"field_id": str(field.id), "start_at": iso(slot(d, hhmm)), "duration_minutes": minutes, **kw}


async def hold(client, h, field, d, hhmm="10:00", minutes=60):
    return await client.post(URL, headers=h, json=body(field, d, hhmm, minutes))


async def test_hold_is_priced_by_the_server_and_expires_later(client, open_field, make_user, token_for):
    _, _, f = await open_field([dict(name="Peak", weekdays=list(range(7)), start_minute=1020, end_minute=1320, price_minor=5000, priority=1)])
    c = await make_user()
    d = future_day()
    r = await client.post(URL, headers=token_for(c), json={**body(f, d, "16:30", 90), "total_minor": 1, "price_minor": 1, "status": "confirmed"})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "awaiting_payment"  # client-supplied status is ignored
    assert b["total_minor"] == (4000 + 5000 + 5000) * 30 // 60  # client-supplied price is ignored
    assert len(b["reference"]) == 8 and b["cancellable"] is True
    ttl = (await client.get(f"{URL}/{b['id']}", headers=token_for(c))).json()["hold_expires_at"]
    assert ttl is not None


@pytest.mark.parametrize("hhmm,minutes,code", [
    ("10:15", 60, "INVALID_START"), ("10:00", 45, "INVALID_DURATION"), ("10:00", 30, "INVALID_DURATION"),
    ("05:00", 60, "OUTSIDE_HOURS"), ("22:30", 60, "OUTSIDE_HOURS"), ("23:00", 60, "OUTSIDE_HOURS"),
])
async def test_invalid_requests_are_rejected(client, open_field, make_user, token_for, hhmm, minutes, code):
    _, _, f = await open_field()
    r = await hold(client, token_for(await make_user()), f, future_day(), hhmm, minutes)
    assert r.status_code == 422 and r.json()["error"]["code"] == code


async def test_past_far_future_naive_and_unknown(client, open_field, make_user, make_venue, token_for):
    _, _, f = await open_field()
    h = token_for(await make_user())
    past = (await hold(client, h, f, future_day(-2)))
    assert past.json()["error"]["code"] == "IN_THE_PAST"
    assert (await hold(client, h, f, future_day(200))).json()["error"]["code"] == "TOO_FAR_AHEAD"
    naive = await client.post(URL, headers=h, json={"field_id": str(f.id), "start_at": "2030-01-01T10:00:00", "duration_minutes": 60})
    assert naive.status_code == 422
    ghost = await client.post(URL, headers=h, json={"field_id": "00000000-0000-0000-0000-000000000000", "start_at": iso(slot(future_day(), "10:00")), "duration_minutes": 60})
    assert ghost.status_code == 404
    hidden = await make_venue(await make_user("owner"), status="pending")
    assert (await hold(client, h, hidden.fields[0], future_day())).status_code == 404
    assert (await client.post(URL, json=body(f, future_day()))).status_code == 401


async def test_overlap_rules(client, open_field, make_user, token_for):
    _, _, f = await open_field()
    a, b = token_for(await make_user()), token_for(await make_user())
    d = future_day()
    assert (await hold(client, a, f, d, "10:00", 120)).status_code == 201  # 10:00-12:00
    for hhmm, mins in [("10:00", 60), ("11:00", 60), ("09:30", 60), ("11:30", 60), ("10:30", 60)]:
        r = await hold(client, b, f, d, hhmm, mins)
        assert r.status_code == 409 and r.json()["error"]["code"] == "SLOT_TAKEN", (hhmm, r.text)
    assert (await hold(client, b, f, d, "12:00")).status_code == 201  # adjacent is fine
    assert (await hold(client, b, f, d, "09:00")).status_code == 201


async def test_twelve_customers_race_for_one_slot_exactly_one_wins(client, open_field, make_user, token_for):
    _, _, f = await open_field()
    users = [await make_user() for _ in range(12)]
    d = future_day()
    rs = await asyncio.gather(*(hold(client, token_for(u), f, d) for u in users))
    codes = sorted(r.status_code for r in rs)
    assert codes == [201] + [409] * 11
    assert {r.json()["error"]["code"] for r in rs if r.status_code == 409} == {"SLOT_TAKEN"}


async def test_overlapping_races_never_double_book(client, open_field, make_user, token_for, sessionmaker):
    """Many staggered overlapping requests: whatever wins, the stored bookings must be pairwise disjoint."""
    _, _, f = await open_field()
    users = [await make_user() for _ in range(16)]
    d = future_day()
    starts = ["10:00", "10:30", "11:00", "11:30"] * 4
    await asyncio.gather(*(hold(client, token_for(u), f, d, s, 60) for u, s in zip(users, starts, strict=True)))
    async with sessionmaker() as s:
        rows = sorted((await s.scalars(select(Booking))).all(), key=lambda x: x.start_at)
    assert 1 <= len(rows) <= 2
    for x, y in itertools.pairwise(rows):
        assert x.end_at <= y.start_at


async def test_timed_out_hold_is_reclaimed_by_the_next_customer(client, open_field, make_user, token_for, sessionmaker):
    _, _, f = await open_field()
    a, b = await make_user(), await make_user()
    d = future_day()
    first = (await hold(client, token_for(a), f, d)).json()
    assert (await hold(client, token_for(b), f, d)).status_code == 409  # still held
    async with sessionmaker() as s:
        await s.execute(update(Booking).values(hold_expires_at=now_utc() - timedelta(seconds=1)))
        await s.commit()
    assert (await hold(client, token_for(b), f, d)).status_code == 201
    assert (await client.get(f"{URL}/{first['id']}", headers=token_for(a))).json()["status"] == "expired"


async def test_hold_limit_per_user(client, open_field, make_user, token_for):
    _, _, f = await open_field()
    h = token_for(await make_user())
    d = future_day()
    for t in ("08:00", "10:00", "12:00"):
        assert (await hold(client, h, f, d, t)).status_code == 201
    r = await hold(client, h, f, d, "14:00")
    assert r.status_code == 429 and r.json()["error"]["code"] == "TOO_MANY_HOLDS"


async def test_cancel_policy(client, open_field, make_user, token_for, sessionmaker):
    owner, _, f = await open_field()
    c = await make_user()
    h, oh = token_for(c), token_for(owner)

    far = (await hold(client, h, f, future_day(10))).json()
    near = (await hold(client, h, f, future_day(1), "10:00")).json()
    async with sessionmaker() as s:  # pretend both were paid
        await s.execute(update(Booking).values(status="confirmed", hold_expires_at=None))
        await s.commit()

    # make "near" definitely inside the 24h window, whatever time of day the test runs
    async with sessionmaker() as s:
        await s.execute(update(Booking).where(Booking.id == near["id"]).values(status="confirmed", start_at=now_utc() + timedelta(hours=5), end_at=now_utc() + timedelta(hours=6)))
        await s.commit()
    r = await client.post(f"{URL}/{near['id']}/cancel", headers=h, json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CANCEL_WINDOW_PASSED"

    r = await client.post(f"{URL}/{far['id']}/cancel", headers=h, json={"reason": "plans changed"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["cancellable"] is False
    assert (await client.post(f"{URL}/{far['id']}/cancel", headers=h, json={})).json()["error"]["code"] == "NOT_CANCELLABLE"

    # the venue owner can cancel inside the window; the customer is told
    r = await client.post(f"{URL}/{near['id']}/cancel", headers=oh, json={"reason": "pitch flooded"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    async with sessionmaker() as s:
        notes = (await s.scalars(select(Notification).where(Notification.user_id == c.id))).all()
        logs = (await s.scalars(select(AuditLog).where(AuditLog.action == "booking.cancel"))).all()
    assert len(notes) == 1 and "pitch flooded" in notes[0].body
    assert len(logs) == 2


async def test_cancelled_slot_can_be_rebooked(client, open_field, make_user, token_for):
    _, _, f = await open_field()
    a, b = token_for(await make_user()), token_for(await make_user())
    d = future_day()
    first = (await hold(client, a, f, d)).json()
    assert (await hold(client, b, f, d)).status_code == 409
    assert (await client.post(f"{URL}/{first['id']}/cancel", headers=a, json={})).status_code == 200
    assert (await hold(client, b, f, d)).status_code == 201


async def test_visibility_and_privacy(client, open_field, make_user, token_for):
    owner, _, f = await open_field()
    c, stranger, other_owner = await make_user(), await make_user(), await make_user("owner")
    admin = await make_user("admin")
    b = (await hold(client, token_for(c), f, future_day())).json()
    path = f"{URL}/{b['id']}"
    assert (await client.get(path, headers=token_for(stranger))).status_code == 404
    assert (await client.get(path, headers=token_for(other_owner))).status_code == 404
    assert (await client.post(f"{path}/cancel", headers=token_for(stranger), json={})).status_code == 404
    mine = (await client.get(path, headers=token_for(c))).json()
    assert mine["customer_name"] is None  # customers don't need their own name echoed
    seen = (await client.get(path, headers=token_for(owner))).json()
    assert seen["customer_name"] == "Test customer"
    assert (await client.get(path, headers=token_for(admin))).status_code == 200


async def test_my_bookings_listing(client, open_field, make_user, token_for):
    _, _, f = await open_field()
    h = token_for(await make_user())
    other = token_for(await make_user())
    d = future_day()
    for t in ("08:00", "10:00", "12:00"):
        await hold(client, h, f, d, t)
    await hold(client, other, f, d, "14:00")
    r = (await client.get(URL, headers=h, params={"page_size": 2})).json()
    assert r["total"] == 3 and len(r["items"]) == 2
    assert (await client.get(URL, headers=h, params={"status": "cancelled"})).json()["total"] == 0
    assert (await client.get(URL, headers=h, params={"upcoming": "true"})).json()["total"] == 3
    assert (await client.get(URL)).status_code == 401


async def test_sweeper_functions(sessionmaker, open_field, make_user):
    _, _, f = await open_field()
    c = await make_user()
    n = now_utc()
    async with sessionmaker() as s:
        s.add_all([
            Booking(reference="HOLDOLD1", field_id=f.id, customer_id=c.id, start_at=n + timedelta(days=2), end_at=n + timedelta(days=2, hours=1),
                    status="awaiting_payment", total_minor=1, hold_expires_at=n - timedelta(minutes=1)),
            Booking(reference="HOLDLIVE", field_id=f.id, customer_id=c.id, start_at=n + timedelta(days=3), end_at=n + timedelta(days=3, hours=1),
                    status="awaiting_payment", total_minor=1, hold_expires_at=n + timedelta(minutes=5)),
            Booking(reference="PLAYED01", field_id=f.id, customer_id=c.id, start_at=n - timedelta(days=1), end_at=n - timedelta(days=1) + timedelta(hours=1),
                    status="confirmed", total_minor=1),
            Booking(reference="UPCOMING", field_id=f.id, customer_id=c.id, start_at=n + timedelta(days=4), end_at=n + timedelta(days=4, hours=1),
                    status="confirmed", total_minor=1),
        ])
        await s.commit()
    async with sessionmaker() as s:
        assert await svc.expire_stale_holds(s) == 1
        assert await svc.complete_finished(s) == 1
        await s.commit()
        st = {b.reference: b.status for b in (await s.scalars(select(Booking))).all()}
    assert st == {"HOLDOLD1": "expired", "HOLDLIVE": "awaiting_payment", "PLAYED01": "completed", "UPCOMING": "confirmed"}
