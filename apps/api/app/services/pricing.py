from collections.abc import Sequence
from datetime import datetime, timedelta

from app.config import get_settings
from app.models import PricingRule
from app.services.timeutil import to_local


def _matches(rule: PricingRule, local: datetime) -> bool:
    minute = local.hour * 60 + local.minute
    return (
        local.weekday() in rule.weekdays
        and rule.start_minute <= minute < rule.end_minute
        and (rule.valid_from is None or local.date() >= rule.valid_from)
        and (rule.valid_to is None or local.date() <= rule.valid_to)
    )


def hourly_rate_at(rules: Sequence[PricingRule], base_minor: int, at: datetime) -> int:
    """Highest-priority matching rule wins (ties: the dearer one, so the result is deterministic)."""
    local = to_local(at)
    hits = [r for r in rules if _matches(r, local)]
    if not hits:
        return base_minor
    return max(hits, key=lambda r: (r.priority, r.price_minor)).price_minor


def price_for_range(rules: Sequence[PricingRule], base_minor: int, start: datetime, end: datetime) -> int:
    """Integrates the hourly rate over each slot of the range, so a booking spanning a price change is billed fairly."""
    slot = get_settings().slot_minutes
    total, t = 0, start
    while t < end:
        total += hourly_rate_at(rules, base_minor, t)
        t += timedelta(minutes=slot)
    return (total * slot + 30) // 60  # half-up rounding to the minor unit
