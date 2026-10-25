import uuid
from datetime import timedelta

import pytest

from app.models import Booking, Notification, Payment, Refund
from app.services.timeutil import local_wall, now_utc, to_local
from tests.conftest import future_day, iso, slot


def day(offset: int):
    return to_local(now_utc()).date() + timedelta(days=offset)


async def add_booking(sessionmaker, field, customer, d, hhmm, minutes, status, total, commission):
    h, m = map(int, hhmm.split(":"))
    start = local_wall(d, h * 60 + m)
    async with sessionmaker() as s:
        b = Booking(reference=uuid.uuid4().hex[:8].upper(), field_id=field.id, customer_id=customer.id, start_at=start, end_at=start + timedelta(minutes=minutes),
                    status=status, total_minor=total, commission_minor=commission)
        s.add(b)
        await s.commit()
        return b


@pytest.fixture
async def seeded(open_field, make_user, sessionmaker):
    owner, venue, field = await open_field()
    cust = await make_user("customer")
    sm = sessionmaker
    await add_booking(sm, field, cust, day(-2), "18:00", 60, "completed", 5000, 500)
    await add_booking(sm, field, cust, day(-2), "19:00", 90, "confirmed", 7500, 750)
    await add_booking(sm, field, cust, day(-3), "06:30", 60, "confirmed", 4000, 400)  # 23:30Z the day before: must bucket by LOCAL day
    await add_booking(sm, field, cust, day(-3), "12:00", 60, "cancelled", 4000, 400)
    await add_booking(sm, field, cust, day(-4), "12:00", 60, "refunded", 9999, 999)
    await add_booking(sm, field, cust, day(0), "15:00", 60, "awaiting_payment", 3000, 300)
    await add_booking(sm, field, cust, day(0), "20:00", 60, "confirmed", 6000, 600)
    await add_booking(sm, field, cust, day(-20), "10:00", 60, "confirmed", 1111, 111)  # outside a 7-day window
    return owner, venue, field, cust


async def test_owner_analytics_numbers_are_exact(client, seeded, token_for):
    owner, *_ = seeded
    r = await client.get("/api/v1/owner/analytics", headers=token_for(owner), params={"days": 7})
    assert r.status_code == 200, r.text
    a = r.json()
    assert (a["gross_minor"], a["commission_minor"], a["net_minor"]) == (5000 + 7500 + 4000 + 6000, 500 + 750 + 400 + 600, 22500 - 2250)
    assert a["bookings"] == 4 and a["cancelled"] == 1  # refunded/awaiting/old ones are not revenue
    assert len(a["daily"]) == 7 and a["daily"][-1]["date"] == day(0).isoformat() and a["daily"][0]["date"] == day(-6).isoformat()
    by_date = {d["date"]: d for d in a["daily"]}
    assert by_date[day(-2).isoformat()] == {"date": day(-2).isoformat(), "bookings": 2, "gross_minor": 12500}
    assert by_date[day(-3).isoformat()]["bookings"] == 1 and by_date[day(-3).isoformat()]["gross_minor"] == 4000  # local-day bucketing
    assert by_date[day(-1).isoformat()]["bookings"] == 0
    hours = {h["hour"]: h["bookings"] for h in a["popular_hours"]}
    assert len(hours) == 24 and hours[18] == hours[19] == hours[20] == hours[6] == 1 and sum(hours.values()) == 4
    f = a["fields"][0]
    assert f["booked_minutes"] == 60 + 90 + 60 + 60 and f["available_minutes"] == 7 * 1020
    assert f["occupancy"] == pytest.approx(270 / 7140, abs=1e-4) and a["occupancy"] == f["occupancy"]
    assert [t["status"] for t in a["today"]] == ["awaiting_payment", "confirmed"]  # chronological, includes unpaid holds
    assert a["today"][0]["customer_name"] == "Test customer"


async def test_window_length_changes_totals(client, seeded, token_for):
    owner = seeded[0]
    a = (await client.get("/api/v1/owner/analytics", headers=token_for(owner), params={"days": 30})).json()
    assert a["gross_minor"] == 22500 + 1111 and a["bookings"] == 5 and len(a["daily"]) == 30
    for bad in (3, 100):
        assert (await client.get("/api/v1/owner/analytics", headers=token_for(owner), params={"days": bad})).status_code == 422


async def test_analytics_are_scoped_to_the_owner(client, seeded, make_user, token_for):
    owner, venue, *_ = seeded
    other = token_for(await make_user("owner"))
    a = (await client.get("/api/v1/owner/analytics", headers=other)).json()
    assert a["gross_minor"] == 0 and a["bookings"] == 0 and a["fields"] == [] and a["today"] == []
    assert (await client.get("/api/v1/owner/analytics", headers=other, params={"venue_id": str(venue.id)})).status_code == 404
    assert (await client.get("/api/v1/owner/analytics", headers=token_for(await make_user("customer")))).status_code == 403
    assert (await client.get("/api/v1/owner/analytics")).status_code == 401
    admin = token_for(await make_user("admin"))
    assert (await client.get("/api/v1/owner/analytics", headers=admin, params={"days": 7})).json()["gross_minor"] == 22500  # admin sees all
    one = await client.get("/api/v1/owner/analytics", headers=token_for(owner), params={"venue_id": str(venue.id), "days": 7})
    assert one.json()["gross_minor"] == 22500


async def test_admin_analytics_and_lists(client, seeded, make_user, make_venue, token_for, sessionmaker):
    owner, _venue, _field, cust = seeded
    await make_venue(owner, status="pending", name="Pending Place")
    async with sessionmaker() as s:
        b = await s.scalar(__import__("sqlalchemy").select(Booking).where(Booking.status == "completed"))
        p = Payment(booking_id=b.id, provider="mock", provider_ref="x1", status="refunded", amount_minor=5000, currency="USD", idempotency_key="k" * 64)
        s.add(p)
        await s.flush()
        s.add(Refund(payment_id=p.id, amount_minor=5000, status="succeeded"))
        await s.commit()
    admin = token_for(await make_user("admin"))
    a = (await client.get("/api/v1/admin/analytics", headers=admin, params={"days": 7})).json()
    assert a["gross_minor"] == 22500 and a["commission_minor"] == 2250 and a["refunded_minor"] == 5000
    assert a["users"]["owner"] == 1 and a["users"]["customer"] == 1 and a["users"]["admin"] == 1 and a["total_users"] == 3
    assert a["venues"] == {"approved": 1, "pending": 1} and a["pending_venues"] == 1 and a["total_venues"] == 2
    assert a["bookings_by_status"]["confirmed"] == 4 and a["total_bookings"] == 8
    assert [t["name"] for t in a["top_venues"]] == ["Test Arena"] and a["top_venues"][0]["gross_minor"] == 22500
    assert sum(d["gross_minor"] for d in a["commission_daily"]) == 2250

    rows = (await client.get("/api/v1/admin/bookings", headers=admin, params={"status": "completed"})).json()
    assert rows["total"] == 1 and rows["items"][0]["payment_status"] == "refunded" and rows["items"][0]["customer_email"] == cust.email
    ref = rows["items"][0]["reference"]
    assert (await client.get("/api/v1/admin/bookings", headers=admin, params={"q": ref[:5].lower()})).json()["total"] >= 1
    pays = (await client.get("/api/v1/admin/payments", headers=admin, params={"refund_status": "succeeded"})).json()
    assert pays["total"] == 1 and pays["items"][0]["booking_reference"] == ref and pays["items"][0]["refund_status"] == "succeeded"
    for path in ("analytics", "bookings", "payments", "settings", "audit-logs"):
        assert (await client.get(f"/api/v1/admin/{path}", headers=token_for(owner))).status_code == 403
        assert (await client.get(f"/api/v1/admin/{path}")).status_code == 401


async def test_commission_settings_apply_to_new_bookings_only(client, open_field, make_user, token_for):
    admin = token_for(await make_user("admin"))
    _owner, venue, field = await open_field()
    cust = token_for(await make_user())
    cust2 = token_for(await make_user())  # the per-user hold limit is 3
    assert (await client.get("/api/v1/admin/settings", headers=admin)).json() == {"default_commission_bps": 1000}
    first = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(field.id), "start_at": iso(slot(future_day(), "10:00")), "duration_minutes": 60})).json()
    assert (await client.put("/api/v1/admin/settings", headers=admin, json={"default_commission_bps": 1500})).json()["default_commission_bps"] == 1500
    second = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(field.id), "start_at": iso(slot(future_day(), "12:00")), "duration_minutes": 60})).json()
    ov = await client.put(f"/api/v1/admin/venues/{venue.id}/commission", headers=admin, json={"commission_bps": 500})
    assert ov.json()["commission_bps"] == 500
    third = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(field.id), "start_at": iso(slot(future_day(), "14:00")), "duration_minutes": 60})).json()
    await client.put(f"/api/v1/admin/venues/{venue.id}/commission", headers=admin, json={"commission_bps": None})  # back to the default
    fourth = (await client.post("/api/v1/bookings", headers=cust2, json={"field_id": str(field.id), "start_at": iso(slot(future_day(), "16:00")), "duration_minutes": 60})).json()
    rows = {b["reference"]: b for b in (await client.get("/api/v1/admin/bookings", headers=admin)).json()["items"]}
    assert [rows[x["reference"]]["commission_minor"] for x in (first, second, third, fourth)] == [400, 600, 200, 600]
    for bad in (-1, 6000):
        assert (await client.put("/api/v1/admin/settings", headers=admin, json={"default_commission_bps": bad})).status_code == 422
    logs = (await client.get("/api/v1/admin/audit-logs", headers=admin, params={"action": "settings"})).json()
    assert logs["total"] == 1 and logs["items"][0]["data"] == {"from": 1000, "to": 1500}


async def test_audit_log_filters_and_pagination(client, make_user, token_for, make_venue):
    admin = token_for(await make_user("admin"))
    owner = await make_user("owner")
    v = await make_venue(owner, status="pending")
    await client.post(f"/api/v1/admin/venues/{v.id}/approve", headers=admin)
    all_ = (await client.get("/api/v1/admin/audit-logs", headers=admin, params={"page_size": 1})).json()
    assert all_["total"] >= 1 and len(all_["items"]) == 1
    f = (await client.get("/api/v1/admin/audit-logs", headers=admin, params={"entity_type": "venue", "action": "venue.appr"})).json()
    assert f["total"] == 1 and f["items"][0]["entity_id"] == str(v.id)


async def test_customer_dashboard_favorites_and_notifications(client, open_field, make_user, token_for, sessionmaker):
    _owner, venue, field = await open_field()
    cust = await make_user()
    h = token_for(cust)
    d = (await client.get("/api/v1/me/dashboard", headers=h)).json()
    assert d["upcoming_count"] == d["past_count"] == d["total_spent_minor"] == d["favorites_count"] == 0 and d["next_bookings"] == []

    await add_booking(sessionmaker, field, cust, day(5), "10:00", 60, "confirmed", 4000, 400)
    await add_booking(sessionmaker, field, cust, day(6), "10:00", 60, "confirmed", 4500, 450)
    await add_booking(sessionmaker, field, cust, day(-5), "10:00", 60, "completed", 3000, 300)
    await add_booking(sessionmaker, field, cust, day(-6), "10:00", 60, "cancelled", 9000, 900)
    d = (await client.get("/api/v1/me/dashboard", headers=h)).json()
    assert d["upcoming_count"] == 2 and d["past_count"] == 1 and d["total_spent_minor"] == 4000 + 4500 + 3000  # cancelled isn't spend
    assert [b["total_minor"] for b in d["next_bookings"]] == [4000, 4500]  # soonest first

    assert (await client.put(f"/api/v1/favorites/{venue.id}", headers=h)).status_code == 204
    assert (await client.put(f"/api/v1/favorites/{venue.id}", headers=h)).status_code == 204  # idempotent
    favs = (await client.get("/api/v1/favorites", headers=h)).json()
    assert [f["id"] for f in favs] == [str(venue.id)] and favs[0]["from_price_minor"] == 4000
    assert (await client.get("/api/v1/me/dashboard", headers=h)).json()["favorites_count"] == 1
    assert (await client.put(f"/api/v1/favorites/{uuid.uuid4()}", headers=h)).status_code == 404
    assert (await client.get("/api/v1/favorites", headers=token_for(await make_user()))).json() == []  # per user
    assert (await client.delete(f"/api/v1/favorites/{venue.id}", headers=h)).status_code == 204
    assert (await client.get("/api/v1/favorites", headers=h)).json() == []

    async with sessionmaker() as s:
        s.add_all([Notification(user_id=cust.id, kind="x", title="one"), Notification(user_id=cust.id, kind="x", title="two")])
        await s.commit()
    n = (await client.get("/api/v1/notifications", headers=h)).json()
    assert n["total"] == 2 and n["unread"] == 2
    assert (await client.get("/api/v1/me/dashboard", headers=h)).json()["unread_notifications"] == 2
    nid = n["items"][0]["id"]
    assert (await client.post(f"/api/v1/notifications/{nid}/read", headers=h)).status_code == 204
    assert (await client.get("/api/v1/notifications", headers=h, params={"unread_only": "true"})).json()["total"] == 2  # total counts all
    assert len((await client.get("/api/v1/notifications", headers=h, params={"unread_only": "true"})).json()["items"]) == 1
    stranger = token_for(await make_user())
    assert (await client.post(f"/api/v1/notifications/{nid}/read", headers=stranger)).status_code == 404
    assert (await client.post("/api/v1/notifications/read-all", headers=h)).status_code == 204
    assert (await client.get("/api/v1/notifications", headers=h)).json()["unread"] == 0
