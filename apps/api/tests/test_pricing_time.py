from datetime import UTC, date, datetime, timedelta

from app.models import PricingRule
from app.services import bookings as svc
from app.services.pricing import hourly_rate_at, price_for_range
from app.services.timeutil import local_day_bounds, local_wall, to_local

D = date(2026, 11, 2)  # a Monday


def rule(**kw):
    base = dict(name="r", weekdays=list(range(7)), start_minute=1020, end_minute=1320, price_minor=5000, priority=0, valid_from=None, valid_to=None)
    return PricingRule(**{**base, **kw})


def test_business_timezone_conversion():
    assert local_wall(D, 360) == datetime(2026, 11, 1, 23, 0, tzinfo=UTC)  # 06:00 Phnom Penh = 23:00Z the day before
    s, e = local_day_bounds(D)
    assert (e - s) == timedelta(hours=24) and s == datetime(2026, 11, 1, 17, 0, tzinfo=UTC)
    assert local_wall(D, 1440) == e
    assert to_local(datetime(2026, 11, 1, 20, 0, tzinfo=UTC)).date() == D  # late UTC evening is already "tomorrow" locally


def test_base_price_without_rules():
    s = local_wall(D, 600)
    assert price_for_range([], 4000, s, s + timedelta(hours=1)) == 4000
    assert price_for_range([], 4000, s, s + timedelta(minutes=90)) == 6000


def test_rule_applies_only_in_its_window_and_uses_local_time():
    r = [rule()]
    assert hourly_rate_at(r, 4000, local_wall(D, 16 * 60 + 30)) == 4000
    assert hourly_rate_at(r, 4000, local_wall(D, 17 * 60)) == 5000
    assert hourly_rate_at(r, 4000, local_wall(D, 21 * 60 + 30)) == 5000
    assert hourly_rate_at(r, 4000, local_wall(D, 22 * 60)) == 4000  # end is exclusive
    assert hourly_rate_at(r, 4000, datetime(2026, 11, 2, 10, 0, tzinfo=UTC)) == 5000  # 10:00Z is 17:00 local


def test_booking_straddling_a_price_change_is_prorated():
    r = [rule()]
    s = local_wall(D, 16 * 60 + 30)  # 16:30-18:00 = one base slot + two peak slots
    assert price_for_range(r, 4000, s, s + timedelta(minutes=90)) == (4000 + 5000 + 5000) * 30 // 60


def test_priority_weekday_and_validity():
    cheap_hi = rule(price_minor=3000, priority=20)
    dear_lo = rule(price_minor=9000, priority=1)
    assert hourly_rate_at([dear_lo, cheap_hi], 4000, local_wall(D, 18 * 60)) == 3000
    weekend_only = rule(weekdays=[5, 6])
    assert hourly_rate_at([weekend_only], 4000, local_wall(D, 18 * 60)) == 4000  # Monday
    assert hourly_rate_at([weekend_only], 4000, local_wall(date(2026, 11, 7), 18 * 60)) == 5000  # Saturday
    dated = rule(valid_from=date(2026, 12, 1))
    assert hourly_rate_at([dated], 4000, local_wall(D, 18 * 60)) == 4000
    assert hourly_rate_at([dated], 4000, local_wall(date(2026, 12, 1), 18 * 60)) == 5000
    expired = rule(valid_to=date(2026, 11, 1))
    assert hourly_rate_at([expired], 4000, local_wall(D, 18 * 60)) == 4000


def test_rounding_is_half_up_to_the_minor_unit():
    s = local_wall(D, 600)
    assert price_for_range([], 1001, s, s + timedelta(minutes=30)) == 501  # 500.5 -> 501
    assert price_for_range([], 1000, s, s + timedelta(minutes=30)) == 500


def test_state_machine_allows_only_declared_moves():
    from app.models import Booking

    def b(status):
        return Booking(status=status, hold_expires_at=datetime.now(UTC))

    ok = b("awaiting_payment")
    svc.transition(ok, "confirmed")
    assert ok.status == "confirmed" and ok.hold_expires_at is None
    for src, dst in [("expired", "confirmed"), ("cancelled", "confirmed"), ("confirmed", "awaiting_payment"), ("completed", "cancelled"), ("refunded", "confirmed")]:
        x = b(src)
        try:
            svc.transition(x, dst)
        except Exception as e:  # noqa: BLE001
            assert e.status_code == 409 and e.detail["code"] == "INVALID_TRANSITION"
        else:
            raise AssertionError(f"{src}->{dst} should be rejected")
        assert x.status == src
    c = b("confirmed")
    svc.transition(c, "cancelled", reason="rain")
    assert c.cancel_reason == "rain" and c.cancelled_at is not None
