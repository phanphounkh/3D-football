import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def audit(session: AsyncSession, actor_id: uuid.UUID | None, action: str, entity_type: str, entity_id: Any,
          data: dict | None = None, request: Request | None = None) -> None:
    """Adds an audit row to the caller's transaction, so the log commits (or rolls back) with the change itself."""
    session.add(AuditLog(
        actor_id=actor_id, action=action, entity_type=entity_type, entity_id=str(entity_id), data=data,
        ip=request.client.host if request and request.client else None,
    ))
