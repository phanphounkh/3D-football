from sqlalchemy import select

from app.models import AuditLog, RefreshToken
from tests.conftest import PASSWORD

REG = {"email": "Dara@Example.com", "password": PASSWORD, "full_name": "Dara"}


async def test_register_login_me(client):
    r = await client.post("/api/v1/auth/register", json=REG)
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "dara@example.com"  # normalised
    assert r.json()["user"]["role"] == "customer"
    assert "httponly" in r.headers["set-cookie"].lower()
    assert "password" not in r.text

    r = await client.post("/api/v1/auth/login", json={"email": "DARA@example.com", "password": PASSWORD})
    assert r.status_code == 200
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["full_name"] == "Dara"


async def test_duplicate_email_conflicts(client):
    await client.post("/api/v1/auth/register", json=REG)
    r = await client.post("/api/v1/auth/register", json={**REG, "email": "dara@example.com"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "EMAIL_TAKEN"


async def test_cannot_self_register_as_admin(client):
    r = await client.post("/api/v1/auth/register", json={**REG, "role": "admin"})
    assert r.status_code == 422


async def test_wrong_password_and_unknown_email_look_identical(client, make_user):
    u = await make_user()
    a = await client.post("/api/v1/auth/login", json={"email": u.email, "password": "wrong-password-1"})
    b = await client.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


async def test_protected_routes_reject_missing_or_bad_tokens(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401
    r = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


async def test_deactivated_user_is_locked_out(client, make_user, auth, sessionmaker):
    u = await make_user()
    h = await auth(u)
    async with sessionmaker() as s:
        db_u = await s.get(type(u), u.id)
        db_u.is_active = False
        await s.commit()
    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD})
    assert r.status_code == 401


async def test_refresh_rotates_and_reuse_revokes_everything(client, make_user, sessionmaker):
    u = await make_user()
    await client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD})
    old = client.cookies.get("refresh_token", path="/api/v1/auth")
    assert old

    r2 = await client.post("/api/v1/auth/refresh")
    assert r2.status_code == 200
    new = client.cookies.get("refresh_token", path="/api/v1/auth")
    assert new and new != old

    # replaying the rotated-out token is treated as theft
    client.cookies.set("refresh_token", old, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set("refresh_token", new, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401  # the new one was revoked too

    async with sessionmaker() as s:
        rows = (await s.scalars(select(RefreshToken))).all()
        assert rows and all(t.revoked_at for t in rows)
        assert all(len(t.token_hash) == 64 for t in rows)  # only hashes are stored


async def test_logout_revokes_refresh_token(client, make_user):
    u = await make_user()
    await client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD})
    tok = client.cookies.get("refresh_token", path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    client.cookies.set("refresh_token", tok, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_auth_events_are_audited(client, sessionmaker):
    await client.post("/api/v1/auth/register", json=REG)
    async with sessionmaker() as s:
        actions = {a.action for a in (await s.scalars(select(AuditLog))).all()}
    assert "user.register" in actions


async def test_profile_update(client, make_user, auth):
    h = await auth(await make_user())
    r = await client.patch("/api/v1/users/me", headers=h, json={"full_name": "New Name", "locale": "km", "full_name_x": 1})
    assert r.status_code == 200 and r.json()["locale"] == "km"
    r = await client.patch("/api/v1/users/me", headers=h, json={"locale": "fr"})
    assert r.status_code == 422


async def test_rate_limiter_blocks_after_limit(client, make_user, monkeypatch):
    import redis.asyncio as redis

    from app.config import get_settings

    r = redis.from_url(get_settings().redis_url)
    try:
        await r.ping()
    except Exception:  # noqa: BLE001
        import pytest
        pytest.skip("redis unavailable")
    keys = [k async for k in r.scan_iter("rl:login:*")]
    if keys:
        await r.delete(*keys)
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    codes = [(await client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "nope-nope-1"})).status_code for _ in range(12)]
    keys = [k async for k in r.scan_iter("rl:login:*")]
    if keys:
        await r.delete(*keys)
    await r.aclose()
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]
