from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.audit import audit
from app.config import get_settings
from app.deps import CurrentUser, Session
from app.models import RefreshToken, User
from app.ratelimit import rate_limit
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut, UserUpdate
from app.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

router = APIRouter(tags=["auth"])
COOKIE = "refresh_token"
COOKIE_PATH = "/api/v1/auth"


async def _issue(session: Session, response: Response, user: User) -> TokenOut:
    s = get_settings()
    raw, hashed = new_refresh_token()
    session.add(RefreshToken(user_id=user.id, token_hash=hashed, expires_at=datetime.now(UTC) + timedelta(days=s.refresh_token_days)))
    response.set_cookie(
        COOKIE, raw, max_age=s.refresh_token_days * 86400, httponly=True, secure=s.cookie_secure,
        samesite="lax", path=COOKIE_PATH,
    )
    access, ttl = create_access_token(str(user.id))
    return TokenOut(access_token=access, expires_in=ttl, user=UserOut.model_validate(user))


@router.post("/auth/register", response_model=TokenOut, status_code=201,
             dependencies=[Depends(rate_limit("register", 10, 3600))])
async def register(body: RegisterIn, session: Session, response: Response, request: Request) -> TokenOut:
    user = User(email=body.email, password_hash=hash_password(body.password), full_name=body.full_name,
                phone=body.phone, role=body.role)
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, detail={"code": "EMAIL_TAKEN", "message": "An account with this email already exists"}) from None
    audit(session, user.id, "user.register", "user", user.id, {"role": user.role}, request)
    out = await _issue(session, response, user)
    await session.commit()
    return out


@router.post("/auth/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login", 10, 300))])
async def login(body: LoginIn, session: Session, response: Response, request: Request) -> TokenOut:
    user = await session.scalar(select(User).where(User.email == body.email, User.deleted_at.is_(None)))
    ok = verify_password(body.password, user.password_hash if user else None)
    if not user or not ok or not user.is_active:
        raise HTTPException(401, detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"})
    audit(session, user.id, "user.login", "user", user.id, None, request)
    out = await _issue(session, response, user)
    await session.commit()
    return out


@router.post("/auth/refresh", response_model=TokenOut, dependencies=[Depends(rate_limit("refresh", 60, 300))])
async def refresh(session: Session, response: Response,
                  refresh_token: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> TokenOut:
    invalid = HTTPException(401, detail={"code": "INVALID_REFRESH", "message": "Session expired. Please log in again."})
    if not refresh_token:
        raise invalid
    row = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token)).with_for_update())
    if not row:
        raise invalid
    now = datetime.now(UTC)
    if row.revoked_at is not None:
        # A rotated-out token was presented again: assume theft and kill every session of that user.
        await session.execute(update(RefreshToken).where(RefreshToken.user_id == row.user_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
        await session.commit()
        response.delete_cookie(COOKIE, path=COOKIE_PATH)
        raise invalid
    user = await session.get(User, row.user_id)
    if row.expires_at <= now or not user or not user.is_active or user.deleted_at is not None:
        raise invalid
    row.revoked_at = now
    out = await _issue(session, response, user)
    await session.commit()
    return out


@router.post("/auth/logout", status_code=204)
async def logout(session: Session, response: Response, refresh_token: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> None:
    if refresh_token:
        await session.execute(update(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token), RefreshToken.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
        await session.commit()
    response.delete_cookie(COOKIE, path=COOKIE_PATH)


@router.get("/users/me", response_model=UserOut, tags=["users"])
async def me(user: CurrentUser) -> User:
    return user


@router.patch("/users/me", response_model=UserOut, tags=["users"])
async def update_me(body: UserUpdate, user: CurrentUser, session: Session) -> User:
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k != "phone":
            continue  # full_name/locale are NOT NULL; only phone can be cleared
        setattr(user, k, v)
    await session.commit()
    return user
