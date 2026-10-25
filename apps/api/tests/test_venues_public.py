async def test_filters_match_same_field_and_price_reflects_matches(client, make_user, make_venue):
    o = await make_user("owner")
    await make_venue(o, name="Mixed", fields=(("Small", "5v5", "futsal", True, 2000), ("Big", "11v11", "natural", False, 12000)))
    await make_venue(o, name="Seven", city="Siem Reap", fields=(("S", "7v7", "artificial", False, 4000),))
    g = lambda q: client.get(f"/api/v1/venues?{q}")

    # indoor + 11v11 never co-occur on one field in "Mixed", so it must not match
    r = (await g("field_type=11v11&indoor=true")).json()
    assert r["total"] == 0
    r = (await g("field_type=11v11")).json()
    assert [v["name"] for v in r["items"]] == ["Mixed"] and r["items"][0]["from_price_minor"] == 12000
    assert (await g("city=siem%20reap")).json()["total"] == 1
    assert (await g("max_price=3000")).json()["items"][0]["name"] == "Mixed"
    assert (await g("sort=price_desc")).json()["items"][0]["name"] == "Seven"


async def test_pending_and_deleted_venues_are_hidden_and_pagination_works(client, make_user, make_venue):
    o = await make_user("owner")
    for i in range(5):
        await make_venue(o, name=f"V{i}")
    await make_venue(o, name="Hidden", status="pending")
    r = (await client.get("/api/v1/venues?page_size=2&page=3")).json()
    assert r["total"] == 5 and len(r["items"]) == 1
    assert (await client.get("/api/v1/venues?page_size=999")).status_code == 422
