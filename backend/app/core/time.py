"""Application-wide time handling.

ORBIT standardizes on Pakistan Standard Time (Asia/Karachi, a fixed UTC+05:00
offset with no DST) for every timestamp the backend creates or returns.
Nothing in this app should generate a UTC/"Z" timestamp — use `now_pkt()` in
place of `datetime.now(timezone.utc)`, and `to_pkt()` when normalizing a
datetime read back from the database before it's serialized to a client.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

PKT = ZoneInfo("Asia/Karachi")


def now_pkt() -> datetime:
    return datetime.now(PKT)


def to_pkt(value: datetime | None) -> datetime | None:
    """Normalize any datetime (naive, UTC, or otherwise) to PKT for display."""
    if value is None:
        return None
    if value.tzinfo is None:
        # Naive values in this codebase are always PKT wall-clock already.
        return value.replace(tzinfo=PKT)
    return value.astimezone(PKT)
