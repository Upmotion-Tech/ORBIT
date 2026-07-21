"""
Employee lookup helpers for ID-based system.

When the frontend sends an employee name (for display purposes) or ID,
these helpers resolve it to the actual employee ID for database operations.
"""

from typing import Optional
from app.repositories.employee_repository import EmployeeRepository


async def resolve_employee_id(
    repo: Optional[EmployeeRepository],
    identifier: Optional[str],
) -> Optional[str]:
    """
    Resolve an employee identifier (name or ID) to an employee ID.

    Args:
        repo: EmployeeRepository instance
        identifier: Employee name, email, or ID

    Returns:
        Employee ID if found, otherwise None
    """
    if not identifier or not repo:
        return None

    # If it looks like a UUID, assume it's already an ID
    if len(identifier) == 36 and identifier.count('-') == 4:
        return identifier

    # Try to find by name (case-insensitive)
    matches = await repo.find_by_name(identifier)
    if matches:
        # Exact match preferred, otherwise use first result
        exact = next(
            (e for e in matches if e.name.strip().lower() == identifier.strip().lower()),
            matches[0]
        )
        return exact.id

    return None


async def resolve_employee_ids_array(
    repo: Optional[EmployeeRepository],
    identifiers: Optional[list[str]],
) -> list[str]:
    """
    Resolve an array of employee identifiers to IDs.

    Args:
        repo: EmployeeRepository instance
        identifiers: List of employee names/emails/IDs

    Returns:
        List of valid employee IDs
    """
    if not identifiers or not repo:
        return []

    result_ids = []
    for identifier in identifiers:
        emp_id = await resolve_employee_id(repo, identifier)
        if emp_id:
            result_ids.append(emp_id)

    return result_ids


def is_employee_id(identifier: str) -> bool:
    """Check if an identifier looks like an employee UUID"""
    if not identifier:
        return False
    return len(identifier) == 36 and identifier.count('-') == 4
