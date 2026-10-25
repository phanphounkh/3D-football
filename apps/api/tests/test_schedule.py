from tests.conftest import future_day, iso, slot

P = "/api/v1/owner/venues/{v}/fields/{f}"


async def test_hours_replace_validate_and_isolate(client, open_field, make_user, token_for):
    owner, v, f = await open_field()
    h, path = token_for(owner), P.format(v=v.id, f=f.id)
    assert len((await client.get(f"{path}/hours", headers=h)).json()) == 7
    r = await client.put(f"{path}/hours", headers=h, json={"hours": [{"weekday": 0, "open_minute": 480, "close_minute": 1200}]})
    assert r.status_code == 200 and len(r.json()) == 1
    assert len((await client.get(f"{path}/hours", headers=h)).json()) == 1  # replaced, other days now closed
    for bad in ([{"weekday": 0, "open_minute": 600, "close_minute": 600}], [{"weekday": 0, "open_minute": 610, "close_minute": 900}],
                [{"weekday": 7, "open_minute": 600, "close_minute": 900}],
                [{"weekday": 1, "open_minute": 600, "close_minute": 900}, {"weekday": 1, "open_minute": 700, "close_minute": 900}]):
        assert (await client.put(f"{path}/hours", headers=h, json={"hours": bad})).status_code == 422
    stranger = token_for(await make_user("owner"))
    assert (await client.get(f"{path}/hours", headers=stranger)).status_code == 404
    assert (await client.put(f"{path}/hours", headers=stranger, json={"hours": []})).status_code == 404
    assert (await client.get(f"{path}/hours", headers=token_for(await make_user("customer")))).status_code == 403


async def test_pricing_rule_crud_changes_what_customers_pay(client, open_field, make_user, token_for):
    owner, v, f = await open_field()
    h, path = token_for(owner), P.format(v=v.id, f=f.id)
    rule = {"name": "Night", "weekdays": [6, 6, 0, 1, 2, 3, 4, 5], "start_minute": 1080, "end_minute": 1320, "price_minor": 6000, "priority": 5}
    r = await client.post(f"{path}/pricing-rules", headers=h, json=rule)
    assert r.status_code == 201 and r.json()["weekdays"] == [0, 1, 2, 3, 4, 5, 6]
    d = future_day()
    cust = token_for(await make_user())
    b = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(f.id), "start_at": iso(slot(d, "19:00")), "duration_minutes": 60})).json()
    assert b["total_minor"] == 6000
    rid = r.json()["id"]
    upd = await client.put(f"{path}/pricing-rules/{rid}", headers=h, json={**rule, "price_minor": 7000})
    assert upd.json()["price_minor"] == 7000
    b2 = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(f.id), "start_at": iso(slot(d, "20:00")), "duration_minutes": 60})).json()
    assert b2["total_minor"] == 7000 and b["total_minor"] == 6000  # existing bookings keep their price
    assert (await client.delete(f"{path}/pricing-rules/{rid}", headers=h)).status_code == 204
    assert (await client.delete(f"{path}/pricing-rules/{rid}", headers=h)).status_code == 404
    for bad in ({"start_minute": 600, "end_minute": 600}, {"weekdays": []}, {"weekdays": [9]}, {"price_minor": -5}, {"start_minute": 605}):
        assert (await client.post(f"{path}/pricing-rules", headers=h, json={**rule, **bad})).status_code == 422


async def test_blocking_refuses_to_orphan_live_bookings(client, open_field, make_user, token_for):
    owner, v, f = await open_field()
    h, path = token_for(owner), P.format(v=v.id, f=f.id)
    d = future_day()
    cust = token_for(await make_user())
    b = (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(f.id), "start_at": iso(slot(d, "10:00")), "duration_minutes": 60})).json()
    block = {"start_at": iso(slot(d, "09:00")), "end_at": iso(slot(d, "12:00")), "reason": "tournament"}
    r = await client.post(f"{path}/exceptions", headers=h, json=block)
    assert r.status_code == 409 and r.json()["error"]["code"] == "BOOKINGS_CONFLICT" and r.json()["error"]["count"] == 1
    await client.post(f"/api/v1/bookings/{b['id']}/cancel", headers=h, json={"reason": "tournament"})
    r = await client.post(f"{path}/exceptions", headers=h, json=block)
    assert r.status_code == 201
    taken = await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(f.id), "start_at": iso(slot(d, "10:30")), "duration_minutes": 60})
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "SLOT_BLOCKED"
    assert len((await client.get(f"{path}/exceptions", headers=h)).json()) == 1
    assert (await client.delete(f"{path}/exceptions/{r.json()['id']}", headers=h)).status_code == 204
    assert (await client.post("/api/v1/bookings", headers=cust, json={"field_id": str(f.id), "start_at": iso(slot(d, "10:30")), "duration_minutes": 60})).status_code == 201
    bad = await client.post(f"{path}/exceptions", headers=h, json={"start_at": iso(slot(d, "12:00")), "end_at": iso(slot(d, "11:00"))})
    assert bad.status_code == 422


async def test_owner_booking_list_is_scoped_to_their_venues(client, open_field, make_user, token_for):
    owner, v, f = await open_field()
    _, _, f2 = await open_field(name="Other Arena")
    c = token_for(await make_user())
    d = future_day()
    await client.post("/api/v1/bookings", headers=c, json={"field_id": str(f.id), "start_at": iso(slot(d, "10:00")), "duration_minutes": 60})
    await client.post("/api/v1/bookings", headers=c, json={"field_id": str(f2.id), "start_at": iso(slot(d, "10:00")), "duration_minutes": 60})
    r = (await client.get("/api/v1/owner/bookings", headers=token_for(owner))).json()
    assert r["total"] == 1 and r["items"][0]["customer_name"] == "Test customer" and r["items"][0]["venue"]["id"] == str(v.id)
    assert (await client.get("/api/v1/owner/bookings", headers=c)).status_code == 403
    other = token_for(await make_user("owner"))
    assert (await client.get("/api/v1/owner/bookings", headers=other, params={"venue_id": str(v.id)})).status_code == 404


async def test_owner_booking_list_includes_payment_state(client, open_field, make_user, token_for):
    owner, v, f = await open_field()
    await client.patch(f"/api/v1/owner/venues/{v.id}", headers=token_for(owner), json={"pay_at_venue_enabled": True})
    c = token_for(await make_user())
    b = (await client.post("/api/v1/bookings", headers=c, json={"field_id": str(f.id), "start_at": iso(slot(future_day(), "10:00")), "duration_minutes": 60})).json()
    await client.post(f"/api/v1/bookings/{b['id']}/pay", headers={**c, "Idempotency-Key": "a" * 16}, json={"provider": "pay_at_venue"})
    item = (await client.get("/api/v1/owner/bookings", headers=token_for(owner))).json()["items"][0]
    assert item["status"] == "confirmed" and item["payment"]["provider"] == "pay_at_venue" and item["payment"]["status"] == "pending"
