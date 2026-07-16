from typing import Optional


def has_role(roles: Optional[list], *allowed: str) -> bool:
    return any(r in allowed for r in (roles or []))
