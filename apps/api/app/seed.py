"""Development seed data (fictional venues). Idempotent: does nothing if venues exist.

`python -m app.seed --history` additionally generates ~6 weeks of past bookings so the dashboards have something to show.
"""
import asyncio
import random
import sys
import uuid
from datetime import timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Booking, Payment, Refund, User
from app.models.venue import Facility, Field, OperatingHour, PricingRule, Venue
from app.security import hash_password

FACILITIES = {
    "parking": "Parking", "showers": "Showers", "lockers": "Lockers", "cafe": "Café",
    "floodlights": "Floodlights", "wifi": "Wi-Fi", "seating": "Spectator seating", "shop": "Pro shop",
}

# slug, name, city, address, lat, lng, facilities, fields[(name, type, surface, indoor, usd_cents)], description
VENUES = [
    ("olympia-arena", "Olympia Arena", "Phnom Penh", "St 2004, Tuol Kork", 11.5780, 104.8920,
     ["parking", "showers", "lockers", "cafe", "floodlights", "seating"],
     [("Pitch A", "11v11", "natural", False, 12000), ("Pitch B", "7v7", "artificial", False, 4500), ("Pitch C", "5v5", "artificial", False, 2500)],
     "Full-size natural grass pitch with stadium seating, plus two floodlit artificial fields."),
    ("riverside-futsal", "Riverside Futsal Club", "Phnom Penh", "Sisowath Quay 211", 11.5670, 104.9320,
     ["showers", "lockers", "cafe", "wifi"],
     [("Court 1", "5v5", "futsal", True, 3000), ("Court 2", "5v5", "futsal", True, 3000)],
     "Air-conditioned indoor futsal courts a short walk from the riverfront."),
    ("bassac-sports-park", "Bassac Sports Park", "Phnom Penh", "Norodom Blvd 90", 11.5540, 104.9290,
     ["parking", "floodlights", "cafe", "shop"],
     [("Field 1", "7v7", "artificial", False, 4000), ("Field 2", "7v7", "artificial", False, 4000), ("Field 3", "5v5", "artificial", False, 2200)],
     "Three artificial-turf fields with evening lighting and a pro shop."),
    ("kampuchea-krom-ground", "Kampuchea Krom Ground", "Phnom Penh", "Kampuchea Krom Blvd 1180", 11.5410, 104.8820,
     ["parking", "floodlights", "lockers"],
     [("Main", "11v11", "artificial", False, 9000)],
     "Full-size 3G pitch for leagues and training."),
    ("angkor-green", "Angkor Green Football", "Siem Reap", "Charles de Gaulle Rd", 13.3670, 103.8560,
     ["parking", "showers", "cafe", "floodlights", "wifi"],
     [("Pitch 1", "7v7", "artificial", False, 3500), ("Pitch 2", "5v5", "artificial", False, 2000)],
     "Relaxed neighbourhood venue near the temples, great for tourist groups."),
    ("siem-reap-arena", "Siem Reap Arena", "Siem Reap", "Route 6, Sala Kamreuk", 13.3790, 103.8700,
     ["parking", "seating", "floodlights", "lockers", "showers"],
     [("Stadium", "11v11", "natural", False, 10000), ("Side Pitch", "7v7", "artificial", False, 3800)],
     "Natural grass stadium pitch used by local league teams."),
    ("battambang-kick", "Battambang Kick Zone", "Battambang", "NR5, Svay Pao", 13.0950, 103.2000,
     ["parking", "cafe", "floodlights"],
     [("Field A", "7v7", "artificial", False, 3000), ("Field B", "5v5", "artificial", False, 1800)],
     "Friendly venue with a café and lit evening pitches."),
    ("sihanoukville-beach-pitch", "Sihanoukville Beach Pitch", "Sihanoukville", "Ochheuteal Rd", 10.6090, 103.5290,
     ["showers", "cafe", "floodlights"],
     [("Beach Pitch", "5v5", "artificial", False, 2400), ("Covered Court", "5v5", "futsal", True, 2800)],
     "A few minutes from the beach, with one covered court for rainy afternoons."),
]


# Local development accounts only. Never run the seed against a production database.
DEV_PASSWORD = "Pitchside!dev1"
DEV_USERS = [
    ("admin@example.com", "Platform Admin", "admin"),
    ("owner@example.com", "Sokha Owner", "owner"),
    ("customer@example.com", "Dara Customer", "customer"),
]


async def seed() -> None:
    async with SessionLocal() as s:
        if await s.scalar(select(func.count()).select_from(Venue)):
            print("venues already present; skipping")
            return
        pw = hash_password(DEV_PASSWORD)
        users = {role: User(email=e, full_name=n, role=role, password_hash=pw) for e, n, role in DEV_USERS}
        s.add_all(users.values())
        await s.flush()
        fac = {c: Facility(code=c, name=n) for c, n in FACILITIES.items()}
        s.add_all(fac.values())
        for slug, name, city, addr, lat, lng, facs, fields, desc in VENUES:
            s.add(Venue(
                owner_id=users["owner"].id, slug=slug, name=name, city=city, address=addr, latitude=lat, longitude=lng,
                description=desc, status="approved", facilities=[fac[c] for c in facs],
                fields=[Field(name=n, field_type=t, surface=sf, indoor=i, base_price_minor=p) for n, t, sf, i, p in fields],
            ))
        await s.flush()
        for f in await s.scalars(select(Field)):
            # open 06:00-23:00 every day; evenings and weekends cost more
            s.add_all(OperatingHour(field_id=f.id, weekday=d, open_minute=360, close_minute=1380) for d in range(7))
            s.add(PricingRule(field_id=f.id, name="Evening peak", weekdays=list(range(7)), start_minute=1020, end_minute=1320,
                              price_minor=f.base_price_minor * 5 // 4, priority=10))
            s.add(PricingRule(field_id=f.id, name="Weekend", weekdays=[5, 6], start_minute=360, end_minute=1020,
                              price_minor=f.base_price_minor * 6 // 5, priority=5))
        await s.commit()
        print(f"seeded {len(VENUES)} venues; dev logins: {', '.join(e for e, _, _ in DEV_USERS)} / {DEV_PASSWORD}")


async def seed_history() -> None:
    """Deterministic demo history. Evenings and weekends are busier; a few cancellations and refunds are mixed in."""
    from app.services.pricing import price_for_range
    from app.services.timeutil import local_wall, now_utc, to_local

    rng = random.Random(42)
    async with SessionLocal() as s:
        if await s.scalar(select(func.count()).select_from(Booking)):
            print("bookings already present; skipping history")
            return
        pw = hash_password(DEV_PASSWORD)
        customers = [User(email=f"player{i}@example.com", full_name=n, role="customer", password_hash=pw)
                     for i, n in enumerate(["Sophea Lim", "Vannak Chea", "Dara Sok", "Bopha Meas", "Rithy Heng", "Chanthy Pov"], 1)]
        s.add_all(customers)
        await s.flush()
        fields = (await s.scalars(select(Field))).all()
        rules: dict = {}
        for r in await s.scalars(select(PricingRule)):
            rules.setdefault(r.field_id, []).append(r)
        today, taken, n = to_local(now_utc()).date(), set(), 0
        weights = {6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 2, 15: 2, 16: 3, 17: 5, 18: 8, 19: 9, 20: 8, 21: 4}
        for back in range(42, 0, -1):
            d = today - timedelta(days=back)
            for f in fields:
                busy = (0.7 if d.weekday() >= 5 else 0.45) * (1.3 if f.field_type != "11v11" else 0.5)
                for _ in range(rng.choice([1, 2, 3, 4]) if rng.random() < busy else 0):
                    hour = rng.choices(list(weights), list(weights.values()))[0]
                    start = local_wall(d, hour * 60 + rng.choice([0, 30]))
                    end = start + timedelta(minutes=rng.choice([60, 60, 90, 120]))
                    if any(k[0] == f.id and start < k[2] and k[1] < end for k in taken):
                        continue
                    taken.add((f.id, start, end))
                    total = price_for_range(rules.get(f.id, []), f.base_price_minor, start, end)
                    roll = rng.random()
                    status = "completed" if roll < 0.82 else "cancelled" if roll < 0.92 else "refunded"
                    b = Booking(reference=uuid.UUID(int=rng.getrandbits(128)).hex[:8].upper(), field_id=f.id, customer_id=rng.choice(customers).id, start_at=start, end_at=end,
                                status=status, total_minor=total, commission_minor=total * 1000 // 10000)
                    s.add(b)
                    await s.flush()
                    if status != "cancelled":
                        n += 1
                        p = Payment(booking_id=b.id, provider="mock", provider_ref=f"hist_{n}", status="refunded" if status == "refunded" else "succeeded",
                                    amount_minor=total, currency="USD", idempotency_key=uuid.UUID(int=rng.getrandbits(128)).hex + uuid.UUID(int=rng.getrandbits(128)).hex)
                        s.add(p)
                        await s.flush()
                        if status == "refunded":
                            s.add(Refund(payment_id=p.id, amount_minor=total, status="succeeded", reason="Booking cancelled", provider_ref=f"hist_re_{n}"))
        await s.commit()
        print(f"seeded {len(taken)} historical bookings")


async def main() -> None:
    await seed()
    if "--history" in sys.argv:
        await seed_history()


if __name__ == "__main__":
    asyncio.run(main())
