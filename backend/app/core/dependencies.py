from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.repositories.employee_repository import EmployeeRepository

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
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

    # Re-checked fresh on every request (not just at login) — if the Owner
    # deactivates this account while its session is still live, this is what
    # forces it out on the very next authenticated call rather than waiting
    # for the JWT to naturally expire. Every other get_* dependency in this
    # file depends on get_current_user, so this check applies everywhere for
    # free rather than needing to be repeated per-router.
    employee = await EmployeeRepository(db).find_by_id(payload.get("user_id", ""))
    if not employee or not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your account has been deactivated by the Owner. Contact Admin.",
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
    # (persona == "dev", "persona != 'owner'", etc.) and expect exactly one
    # string. This used to just be roles[0] — the *first* access level ever
    # ticked for that employee, in whatever order they happen to be stored.
    # A real bug this caused: an employee whose access_levels were e.g.
    # ["employee", "dev", "finance", "owner"] (owner ticked, but not first)
    # had roles[0] == "employee", so every projects.py/tasks.py check keyed
    # on persona == "owner" silently failed for them even though they really
    # are an owner — they couldn't create a project or task at all. Mirrors
    # the frontend's own derivePersonaFlavor() priority order (owner > hr >
    # finance > dev > employee) so "owner" always wins if held, regardless
    # of array order.
    roles = current_user.get("roles") or ["employee"]
    for role in ("owner", "hr", "finance", "dev"):
        if role in roles:
            return role
    return roles[0] if roles else "employee"


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
    if not any(r in ("owner", "hr") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. HR permissions required.",
        )
    return current_user


async def get_finance_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Invoices/expenses/payroll/milestones can be created/edited/deleted
    # only by Owner or someone with the "finance" access level — even if
    # another employee has been granted view access to the Finance screen
    # via a different access level (e.g. ticked "Invoices & Expenses" while
    # their derived persona flavor is "hr"), they can only ever read it.
    roles = current_user.get("roles") or []
    if not any(r in ("owner", "finance") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner or Finance can perform this action.",
        )
    return current_user


async def get_crm_editor_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Leads can be created/edited/deleted only by Owner or someone with the
    # "crm" access level — mirrors get_finance_user's exact pattern. Anyone
    # else granted only view access to the CRM screen (a different access
    # level that also happens to expose Leads) stays read-only.
    roles = current_user.get("roles") or []
    if not any(r in ("owner", "crm") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner or CRM can perform this action.",
        )
    return current_user


async def get_dev_editor_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Same pattern for Projects/Tasks — Owner or "dev" access level gets full
    # create/edit/delete rights, matching get_finance_user/get_crm_editor_user.
    roles = current_user.get("roles") or []
    if not any(r in ("owner", "dev") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner or Dev can perform this action.",
        )
    return current_user


async def get_audit_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # "permissions" is one of the real screen-key access levels (see
    # ACCESS_LEVELS in app/schemas/employee.py) — it's what gates the whole
    # Setup screen (where Audit Trail lives) on the frontend, so it's the
    # matching backend check for who may read the audit log.
    roles = current_user.get("roles") or []
    if not any(r in ("owner", "permissions") for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Audit trail requires Setup access.",
        )
    return current_user
