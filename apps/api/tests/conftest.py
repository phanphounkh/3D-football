import os

# Must be set before the app (and its cached settings) is imported.
os.environ["RATE_LIMIT_ENABLED"] = "false"

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models
from app.db import Base, get_session
from app.main import app
from app.models import Facility, Field, User, Venue
from app.security import hash_password

TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://pitchside:pitchside@localhost:5432/pitchside_test")
PASSWORD = "Sup3r-secret-pw"


async def _ensure_database() -> None:
    u = make_url(TEST_URL)
    conn = await asyncpg.connect(user=u.username, password=u.password, host=u.host, port=u.port, database="postgres")
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", u.database):
            await conn.execute(f'CREATE DATABASE "{u.database}"')
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    await _ensure_database()
    eng = create_async_engine(TEST_URL)
    async with eng.begin() as c:
        await c.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await c.run_sync(Base.metadata.drop_all)
        await c.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def sessionmaker(engine):
    async with engine.begin() as c:
        names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
        await c.execute(text(f"TRUNCATE {names} CASCADE"))
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(sessionmaker):
    async def override():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(sessionmaker):
    async def _make(role="customer", email=None) -> User:
        async with sessionmaker() as s:
            u = User(email=email or f"{role}-{os.urandom(3).hex()}@example.com", full_name=f"Test {role}",
                     role=role, password_hash=hash_password(PASSWORD))
            s.add(u)
            await s.commit()
            return u

    return _make


@pytest.fixture
def auth(client):
    async def _auth(user: User) -> dict[str, str]:
        r = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _auth


@pytest.fixture
def make_venue(sessionmaker):
    async def _make(owner: User, *, status="approved", name="Test Arena", city="Phnom Penh", fields=(("A", "7v7", "artificial", False, 4000),)) -> Venue:
        async with sessionmaker() as s:
            v = Venue(owner_id=owner.id, slug=f"{name.lower().replace(' ', '-')}-{os.urandom(2).hex()}", name=name, city=city,
                      address="1 Test St", latitude=11.5, longitude=104.9, status=status,
                      fields=[Field(name=n, field_type=t, surface=sf, indoor=i, base_price_minor=p) for n, t, sf, i, p in fields])
            s.add(v)
            await s.commit()
            await s.refresh(v, ["fields", "facilities"])
            return v

    return _make


@pytest_asyncio.fixture
async def facilities(sessionmaker):
    async with sessionmaker() as s:
        s.add_all([Facility(code="parking", name="Parking"), Facility(code="showers", name="Showers")])
        await s.commit()


# ---- booking-engine helpers -------------------------------------------------
from datetime import date, datetime, timedelta

from app.models import OperatingHour, PricingRule
from app.security import create_access_token
from app.services.timeutil import local_wall, now_utc, to_local


def future_day(offset: int = 7) -> date:
    return to_local(now_utc() + timedelta(days=offset)).date()


def slot(d: date, hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return local_wall(d, h * 60 + m)


def iso(dt: datetime) -> str:
    return dt.isoformat()


@pytest.fixture
def token_for():
    """Fast bearer header for a user without paying for an argon2 login."""
    return lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))[0]}"}


@pytest.fixture
def open_field(sessionmaker, make_user, make_venue):
    """An approved venue whose single 7v7 field ($40/h) is open 06:00-23:00 every day, no pricing rules."""
    async def _make(rules: list[dict] | None = None, **venue_kw):
        owner = await make_user("owner")
        venue = await make_venue(owner, **venue_kw)
        field = venue.fields[0]
        async with sessionmaker() as s:
            s.add_all(OperatingHour(field_id=field.id, weekday=d, open_minute=360, close_minute=1380) for d in range(7))
            s.add_all(PricingRule(field_id=field.id, **r) for r in rules or [])
            await s.commit()
        return owner, venue, field

    return _make
