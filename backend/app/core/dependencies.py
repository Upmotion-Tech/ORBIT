from typing import Optional

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    if credentials is None:
        return {"sub": "anonymous", "role": "owner"}
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload


async def get_owner_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can perform this action.",
        )
    return current_user


async def get_persona_role(
    x_persona: Optional[str] = Header(None, alias="X-Persona"),
) -> str:
    if not x_persona:
        return "owner"
    return x_persona.lower()


async def get_hr_user(
    current_user: dict = Depends(get_current_user),
    persona: str = Depends(get_persona_role),
) -> tuple[dict, str]:
    if persona not in ("owner", "hr", "hr_admin", "financehead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. HR permissions required.",
        )
    return current_user, persona

