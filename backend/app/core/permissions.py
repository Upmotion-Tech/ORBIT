from typing import Optional


def has_role(roles: Optional[list], *allowed: str) -> bool:
    return any(r in allowed for r in (roles or []))


def is_project_editor(roles: Optional[list], department: Optional[str]) -> bool:
    # Holding the "dev" access level normally grants Owner-parity for
    # Projects (create/edit/delete, see budget) — same pattern as
    # finance/crm access levels granting parity for their own modules.
    # Dev Member department is the one deliberate exception: an employee
    # whose actual job is doing the engineering work should be able to view
    # (only their assigned projects) and comment, but not edit project
    # details, see price, or create new projects — those stay Owner-only
    # for them even though they hold the "dev" access level. Anyone else
    # (Employee/Finance/Owner department) who's been granted "dev" access
    # still gets full parity, e.g. a PM/coordinator who isn't an engineer.
    if has_role(roles, "owner"):
        return True
    return has_role(roles, "dev") and department != "Dev Member"
