from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+asyncpg://pitchside:pitchside@localhost:5432/pitchside"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    cors_origins: list[str] = ["http://localhost:3000"]
    business_timezone: str = "Asia/Phnom_Penh"
    booking_hold_minutes: int = 10
    slot_minutes: int = 30
    min_duration_minutes: int = 60
    max_duration_minutes: int = 240
    cancel_free_hours: int = 24
    max_active_holds_per_user: int = 3
    max_booking_days_ahead: int = 90
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    cookie_secure: bool = False  # must be True behind HTTPS in production
    rate_limit_enabled: bool = True
    default_commission_bps: int = 1000  # 10%
    mock_payments_enabled: bool = True  # demo provider; refused in production
    mock_webhook_secret: str = "dev-mock-webhook-secret-dev-mock-webhook-secret"
    mock_charge_ttl_minutes: int = 15
    payment_hold_grace_minutes: int = 5  # starting a payment extends the hold to at least this long ...
    max_hold_total_minutes: int = 15  # ... but never beyond this from the moment the hold was created
    webhook_tolerance_seconds: int = 300
    reconcile_after_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.env == "production" and (s.jwt_secret.startswith("dev-only-change-me") or len(s.jwt_secret) < 32 or not s.cookie_secure):
        raise RuntimeError("Refusing to start in production with a default/short JWT_SECRET or insecure cookies")
    if s.env == "production" and s.mock_payments_enabled:
        raise RuntimeError("The mock payment provider must be disabled in production (MOCK_PAYMENTS_ENABLED=false)")
    return s
