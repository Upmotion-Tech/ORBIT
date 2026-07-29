from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import is_project_editor
from app.core.security import create_access_token, decode_access_token
from app.repositories.employee_repository import EmployeeRepository

security_scheme = HTTPBearer(auto_error=False)

# A token gets silently reissued (same claims, fresh full-length expiry from
# right now) once less than this much of its life remains, via the
# X-Refreshed-Token response header below — as long as someone opens the
# app at least this often, they're never forced to log back in; only
# genuine multi-day inactivity actually lets the session expire. A response
# header rather than each route's own JSON body, since this dependency runs
# ahead of every route regardless of what that route's own response shape
# is — see orbit-client.js for the frontend half (reads this header on every
# response, swaps the stored token if present).
REFRESH_THRESHOLD_SECONDS = 2 * 24 * 60 * 60  # 2 days


async def get_current_user(
    response: Response,
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

    # Department and roles aren't frozen to the old JWT values — attached fresh
    # here instead off the DB lookup already done for is_active, so access level
    # changes take effect immediately without requiring a re-login.
    payload["roles"] = employee.access_levels or ["employee"]
    payload["department"] = employee.department

    exp = payload.get("exp")
    if exp is not None and (exp - datetime.now(timezone.utc).timestamp()) < REFRESH_THRESHOLD_SECONDS:
        response.headers["X-Refreshed-Token"] = create_access_token(payload)

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
    # Owner, or "dev" access level held by someone outside the Dev Member
    # department (e.g. a PM/coordinator), gets full Projects create/edit/
    # delete rights. A Dev Member department engineer holding "dev" access
    # is deliberately excluded — see is_project_editor()'s own docstring.
    if not is_project_editor(current_user.get("roles"), current_user.get("department")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner or Dev (outside Dev Member department) can perform this action.",
        )
    return current_user


async def get_owner_department_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Company Policies management (add/edit/delete/upload) is gated on the
    # Owner *department* specifically, not the "owner" access-level token —
    # matches the same convention already used for HR employee access-level
    # auto-tick, CRM Past Leads, Dev Past Projects, and Setup's Employees tab.
    if current_user.get("department") != "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner department can manage company policies.",
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
