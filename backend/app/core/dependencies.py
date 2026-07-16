from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )
    return payload


async def get_owner_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    if "owner" not in (current_user.get("roles") or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can perform this action.",
        )
    return current_user


async def get_persona_role(
    current_user: dict = Depends(get_current_user),
) -> str:
    # Single "primary" role — kept for the project/task routers, which
    # still run on the pre-multi-role mock-persona permission checks
    # (persona == "devmember", etc.) and expect exactly one string.
    roles = current_user.get("roles") or ["employee"]
    return roles[0]


async def get_persona_roles(
    current_user: dict = Depends(get_current_user),
) -> list:
    # Full set of access levels — an employee can hold more than one, so
    # HR-scope permission checks (has_role()) test against this list
    # rather than a single role string.
    return current_user.get("roles") or ["employee"]


async def get_hr_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    roles = current_user.get("roles") or []
    if not any(r in ("owner", "hr_admin") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. HR permissions required.",
        )
    return current_user
