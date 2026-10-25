"""All business-day logic lives in Asia/Phnom_Penh; everything stored or compared is UTC."""
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.config import get_settings


def biz_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().business_timezone)


def now_utc() -> datetime:
    return datetime.now(UTC)


def to_local(dt: datetime) -> datetime:
    return dt.astimezone(biz_tz())


def local_wall(d: date, minute: int) -> datetime:
    """UTC instant of the given wall-clock minute-of-day on local date `d` (1440 = next local midnight)."""
    base = datetime.combine(d, time(0, 0), tzinfo=biz_tz())
    if minute >= 1440:
        base = datetime.combine(d + timedelta(days=1), time(0, 0), tzinfo=biz_tz())
        minute -= 1440
    return (base.replace(hour=minute // 60, minute=minute % 60)).astimezone(UTC)


def local_day_bounds(d: date) -> tuple[datetime, datetime]:
    return local_wall(d, 0), local_wall(d, 1440)
