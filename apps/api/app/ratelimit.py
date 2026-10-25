import logging

import redis.asyncio as redis
from fastapi import HTTPException, Request

from app.config import get_settings

log = logging.getLogger(__name__)
_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url)
    return _client


def rate_limit(name: str, limit: int, window_seconds: int):
    """Fixed-window per-IP limiter. Fails open (with a warning) if Redis is unreachable."""

    async def dep(request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        ip = request.client.host if request.client else "unknown"
        key = f"rl:{name}:{ip}"
        try:
            r = _redis()
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, window_seconds)
        except Exception:  # noqa: BLE001 - availability over strictness for the limiter itself
            log.warning("rate limiter unavailable; allowing request")
            return
        if count > limit:
            raise HTTPException(429, detail={"code": "RATE_LIMITED", "message": "Too many attempts. Try again later."},
                                headers={"Retry-After": str(window_seconds)})

    return dep
