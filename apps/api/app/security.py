import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher()
# Verified against when the account doesn't exist, so login timing doesn't reveal which emails are registered.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: str) -> tuple[str, int]:
    s = get_settings()
    ttl = s.access_token_minutes * 60
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": user_id, "type": "access", "iat": now, "exp": now + timedelta(seconds=ttl)},
        s.jwt_secret, algorithm="HS256",
    )
    return token, ttl


def decode_access_token(token: str) -> str | None:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    return claims["sub"] if claims.get("type") == "access" else None


def new_refresh_token() -> tuple[str, str]:
    """Returns (opaque token for the cookie, sha256 hash for the database)."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
