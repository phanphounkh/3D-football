from fastapi import HTTPException

from app.config import get_settings
from app.payments.base import PaymentProvider
from app.payments.mock import MockProvider

_mock = MockProvider()


def get_provider(name: str) -> PaymentProvider:
    """Add real adapters (Bakong KHQR, card gateway) here; nothing else in the codebase needs to change."""
    if name == "mock" and get_settings().mock_payments_enabled:
        return _mock
    raise HTTPException(404, detail={"code": "UNKNOWN_PROVIDER", "message": f"Payment provider '{name}' isn't available"})
