from sqlalchemy import select

from app.models import AuditLog, Notification

VENUE = {"name": "Lakeside Pitch", "city": "Phnom Penh", "address": "12 Lake Rd", "latitude": 11.55, "longitude": 104.92,
         "description": "Nice", "facility_codes": ["parking"]}
FIELD = {"name": "Pitch 1", "field_type": "7v7", "surface": "artificial", "base_price_minor": 4000}


async def test_roles_are_enforced(client, make_user, auth):
    cust = await auth(await make_user("customer"))
    owner = await auth(await make_user("owner"))
    assert (await client.get("/api/v1/owner/venues", headers=cust)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=cust)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=owner)).status_code == 403
    assert (await client.get("/api/v1/owner/venues", headers=owner)).status_code == 200


async def test_listing_lifecycle_pending_to_public(client, make_user, auth, facilities):
    owner_h = await auth(await make_user("owner"))
    admin_h = await auth(await make_user("admin"))

    r = await client.post("/api/v1/owner/venues", json=VENUE, headers=owner_h)
    assert r.status_code == 201
    v = r.json()
    assert v["status"] == "pending" and [f["code"] for f in v["facilities"]] == ["parking"]
    r = await client.post(f"/api/v1/owner/venues/{v['id']}/fields", json=FIELD, headers=owner_h)
    assert r.status_code == 201

    # not visible to the public until approved
    assert (await client.get(f"/api/v1/venues/{v['slug']}")).status_code == 404
    assert (await client.get("/api/v1/venues")).json()["total"] == 0

    r = await client.post(f"/api/v1/admin/venues/{v['id']}/approve", headers=admin_h)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert (await client.get(f"/api/v1/venues/{v['slug']}")).status_code == 200
    assert (await client.get("/api/v1/venues")).json()["total"] == 1


async def test_owner_cannot_touch_another_owners_venue(client, make_user, make_venue, auth):
    a, b = await make_user("owner"), await make_user("owner")
    venue = await make_venue(a)
    hb = await auth(b)
    assert (await client.get(f"/api/v1/owner/venues/{venue.id}", headers=hb)).status_code == 404
    assert (await client.patch(f"/api/v1/owner/venues/{venue.id}", json={"name": "Hijacked"}, headers=hb)).status_code == 404
    assert (await client.delete(f"/api/v1/owner/venues/{venue.id}", headers=hb)).status_code == 404
    r = await client.post(f"/api/v1/owner/venues/{venue.id}/fields", json=FIELD, headers=hb)
    assert r.status_code == 404
    fid = venue.fields[0].id
    assert (await client.patch(f"/api/v1/owner/venues/{venue.id}/fields/{fid}", json={"name": "x"}, headers=hb)).status_code == 404
    assert (await client.get("/api/v1/owner/venues", headers=hb)).json() == []


async def test_field_crud_and_soft_delete(client, make_user, make_venue, auth):
    owner = await make_user("owner")
    venue = await make_venue(owner)
    h = await auth(owner)
    fid = venue.fields[0].id
    r = await client.patch(f"/api/v1/owner/venues/{venue.id}/fields/{fid}", json={"base_price_minor": 5500}, headers=h)
    assert r.json()["base_price_minor"] == 5500
    assert (await client.delete(f"/api/v1/owner/venues/{venue.id}/fields/{fid}", headers=h)).status_code == 204
    mine = (await client.get(f"/api/v1/owner/venues/{venue.id}", headers=h)).json()
    assert mine["fields"] == []
    # soft deleted venue disappears everywhere
    assert (await client.delete(f"/api/v1/owner/venues/{venue.id}", headers=h)).status_code == 204
    assert (await client.get(f"/api/v1/venues/{venue.slug}")).status_code == 404


async def test_invalid_input_is_rejected(client, make_user, auth, facilities):
    h = await auth(await make_user("owner"))
    assert (await client.post("/api/v1/owner/venues", json={**VENUE, "latitude": 999}, headers=h)).status_code == 422
    r = await client.post("/api/v1/owner/venues", json={**VENUE, "facility_codes": ["jacuzzi"]}, headers=h)
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_FACILITY"
    v = (await client.post("/api/v1/owner/venues", json=VENUE, headers=h)).json()
    bad = await client.post(f"/api/v1/owner/venues/{v['id']}/fields", json={**FIELD, "base_price_minor": -1}, headers=h)
    assert bad.status_code == 422
    bad = await client.post(f"/api/v1/owner/venues/{v['id']}/fields", json={**FIELD, "field_type": "9v9"}, headers=h)
    assert bad.status_code == 422


async def test_admin_decisions_notify_owner_and_are_audited(client, make_user, make_venue, auth, sessionmaker):
    owner = await make_user("owner")
    admin = await make_user("admin")
    venue = await make_venue(owner, status="pending")
    h = await auth(admin)
    assert (await client.post(f"/api/v1/admin/venues/{venue.id}/reject", json={"reason": "x"}, headers=h)).status_code == 422
    r = await client.post(f"/api/v1/admin/venues/{venue.id}/reject", json={"reason": "Photos are missing"}, headers=h)
    assert r.json()["status"] == "rejected" and r.json()["rejection_reason"] == "Photos are missing"
    async with sessionmaker() as s:
        n = (await s.scalars(select(Notification).where(Notification.user_id == owner.id))).all()
        log = (await s.scalars(select(AuditLog).where(AuditLog.action == "venue.rejected"))).all()
    assert len(n) == 1 and "rejected" in n[0].title
    assert len(log) == 1 and log[0].actor_id == admin.id and log[0].data["reason"] == "Photos are missing"


async def test_admin_user_management_guards(client, make_user, auth):
    admin = await make_user("admin")
    other = await make_user("customer")
    h = await auth(admin)
    r = await client.patch(f"/api/v1/admin/users/{other.id}", json={"is_active": False}, headers=h)
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = await client.patch(f"/api/v1/admin/users/{admin.id}", json={"role": "customer"}, headers=h)
    assert r.status_code == 422 and r.json()["error"]["code"] == "SELF_LOCKOUT"
    listing = (await client.get("/api/v1/admin/users?role=customer", headers=h)).json()
    assert listing["total"] == 1 and "password_hash" not in str(listing)
