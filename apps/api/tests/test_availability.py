from datetime import timedelta

from sqlalchemy import update

from app.models import Booking, OperatingHour
from tests.conftest import future_day, iso, slot

PEAK = dict(name="Peak", weekdays=list(range(7)), start_minute=1020, end_minute=1320, price_minor=5000, priority=10)


async def test_slots_follow_hours_prices_and_timezone(client, open_field):
    _, _, f = await open_field([PEAK])
    d = future_day()
    r = await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d.isoformat(), "duration": 60})
    assert r.status_code == 200
    body = r.json()
    slots = body["slots"]
    assert body["timezone"] == "Asia/Phnom_Penh"
    assert slots[0]["start_at"].startswith(slot(d, "06:00").strftime("%Y-%m-%dT%H:%M"))  # 06:00 local, stored/returned in UTC
    assert len(slots) == (1380 - 360 - 60) // 30 + 1  # last 60-min start is 22:00
    price = {s["start_at"]: s["price_minor"] for s in slots}
    assert price[iso(slot(d, "10:00")).replace("+00:00", "Z")] == 4000
    assert price[iso(slot(d, "18:00")).replace("+00:00", "Z")] == 5000
    assert all(s["available"] for s in slots)


async def test_closed_day_has_no_slots(client, open_field, sessionmaker):
    _, _, f = await open_field()
    d = future_day()
    async with sessionmaker() as s:
        await s.execute(OperatingHour.__table__.delete().where(OperatingHour.weekday == d.weekday()))
        await s.commit()
    r = await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d.isoformat()})
    assert r.json()["slots"] == []


async def test_booked_blocked_and_expired_holds(client, open_field, make_user, sessionmaker, token_for):
    owner, v, f = await open_field()
    d = future_day()
    cust = await make_user()
    r = await client.post("/api/v1/bookings", headers=token_for(cust), json={"field_id": str(f.id), "start_at": iso(slot(d, "10:00")), "duration_minutes": 60})
    assert r.status_code == 201
    r = await client.post(f"/api/v1/owner/venues/{v.id}/fields/{f.id}/exceptions", headers=token_for(owner),
                          json={"start_at": iso(slot(d, "14:00")), "end_at": iso(slot(d, "15:00")), "reason": "maintenance"})
    assert r.status_code == 201

    def by_start(body):
        return {s["start_at"][11:16]: s for s in body["slots"]}

    body = (await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d.isoformat(), "duration": 60})).json()
    local = {k: s for k, s in by_start(body).items()}
    t = lambda hhmm: slot(d, hhmm).strftime("%H:%M")
    assert local[t("10:00")]["reason"] == "booked" and local[t("09:30")]["reason"] == "booked"  # 09:30-10:30 overlaps
    assert local[t("09:00")]["available"] and local[t("11:00")]["available"]  # touching ends are free
    assert local[t("14:00")]["reason"] == "blocked" and local[t("13:30")]["reason"] == "blocked"

    async with sessionmaker() as s:  # the hold times out: the slot is free again even before any sweeper runs
        await s.execute(update(Booking).values(hold_expires_at=Booking.created_at - timedelta(minutes=1)))
        await s.commit()
    body = (await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d.isoformat(), "duration": 60})).json()
    assert by_start(body)[t("10:00")]["available"]


async def test_availability_input_validation(client, open_field, make_user, make_venue):
    _, _, f = await open_field()
    d = future_day().isoformat()
    assert (await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d, "duration": 45})).status_code == 422
    assert (await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": d, "duration": 600})).status_code == 422
    assert (await client.get(f"/api/v1/fields/{f.id}/availability", params={"date": "nope"})).status_code == 422
    assert (await client.get("/api/v1/fields/00000000-0000-0000-0000-000000000000/availability", params={"date": d})).status_code == 404
    hidden = await make_venue(await make_user("owner"), status="pending")
    assert (await client.get(f"/api/v1/fields/{hidden.fields[0].id}/availability", params={"date": d})).status_code == 404
