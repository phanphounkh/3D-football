import uuid
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.security import decode_access_token

Session = Annotated[AsyncSession, Depends(get_session)]
_bearer = HTTPBearer(auto_error=False)


def _unauth(msg: str = "Authentication required") -> HTTPException:
    return HTTPException(401, detail={"code": "UNAUTHENTICATED", "message": msg}, headers={"WWW-Authenticate": "Bearer"})


async def current_user(session: Session, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> User:
    if not creds:
        raise _unauth()
    sub = decode_access_token(creds.credentials)
    if not sub:
        raise _unauth("Invalid or expired token")
    try:
        user = await session.get(User, uuid.UUID(sub))
    except ValueError:
        user = None
    if not user or user.deleted_at is not None or not user.is_active:
        raise _unauth("Invalid or expired token")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_roles(*roles: str):
    async def dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(403, detail={"code": "FORBIDDEN", "message": "You don't have access to this resource"})
        return user

    return dep


OwnerUser = Annotated[User, Depends(require_roles("owner", "admin"))]
AdminUser = Annotated[User, Depends(require_roles("admin"))]
