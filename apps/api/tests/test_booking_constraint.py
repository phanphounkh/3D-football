"""The database itself must make double-booking impossible, regardless of application logic."""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Booking

T0 = datetime(2026, 11, 1, 10, 0, tzinfo=UTC)


def booking(field, customer, start, hours=1, status="confirmed", ref=None):
    return Booking(reference=ref or uuid.uuid4().hex[:10].upper(), field_id=field.id, customer_id=customer.id,
                   start_at=start, end_at=start + timedelta(hours=hours), status=status, total_minor=4000)


@pytest.fixture
async def setup(make_user, make_venue):
    owner, cust = await make_user("owner"), await make_user("customer")
    v = await make_venue(owner, fields=(("A", "7v7", "artificial", False, 4000), ("B", "7v7", "artificial", False, 4000)))
    return v.fields[0], v.fields[1], cust


async def test_overlap_is_rejected(sessionmaker, setup):
    a, _, c = setup
    async with sessionmaker() as s:
        s.add(booking(a, c, T0, 2))
        await s.commit()
    for start, hours in [(T0, 1), (T0 + timedelta(minutes=30), 2), (T0 - timedelta(minutes=30), 1), (T0 + timedelta(minutes=30), 1)]:
        async with sessionmaker() as s:
            s.add(booking(a, c, start, hours, status="awaiting_payment"))
            with pytest.raises(IntegrityError, match="ex_bookings_no_overlap"):
                await s.commit()


async def test_adjacent_other_field_and_inactive_do_not_conflict(sessionmaker, setup):
    a, b, c = setup
    async with sessionmaker() as s:
        s.add(booking(a, c, T0, 2))
        await s.commit()
    async with sessionmaker() as s:
        s.add_all([
            booking(a, c, T0 + timedelta(hours=2), 1),          # back-to-back is fine ([) ranges)
            booking(a, c, T0 - timedelta(hours=1), 1),          # ends exactly when the other starts
            booking(b, c, T0, 2),                               # same time, different field
            booking(a, c, T0, 2, status="cancelled"),           # inactive statuses never block
            booking(a, c, T0, 2, status="expired"),
        ])
        await s.commit()


async def test_concurrent_attempts_exactly_one_wins(sessionmaker, setup):
    a, _, c = setup

    async def attempt(i: int):
        async with sessionmaker() as s:
            s.add(booking(a, c, T0, 1, status="awaiting_payment", ref=f"CONC{i}"))
            try:
                await s.commit()
                return True
            except IntegrityError:
                return False

    results = await asyncio.gather(*(attempt(i) for i in range(12)))
    assert sum(results) == 1


async def test_invalid_range_rejected(sessionmaker, setup):
    a, _, c = setup
    async with sessionmaker() as s:
        bad = booking(a, c, T0, 1)
        bad.end_at = bad.start_at
        s.add(bad)
        with pytest.raises(IntegrityError, match="ck_bookings_range"):
            await s.commit()
