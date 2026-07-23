import asyncio
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import jwt

from app.core.config import settings


def generate_temp_password(length: int = 10) -> str:
    """Random one-time password for newly-created employees, mailed to them
    and never chosen by a human. Guarantees at least one upper/lower/digit/
    symbol so it clears any reasonable complexity check downstream."""
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%*"),
    ]
    pool = string.ascii_letters + string.digits
    chars = required + [secrets.choice(pool) for _ in range(length - len(required))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _verify_password_sync(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def _hash_password_sync(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt is deliberately slow (~100-300ms per call) and, being a plain
    # synchronous C call, used to run directly on the event loop — blocking
    # every other concurrent request (an unrelated lead/project/task create,
    # someone else's login) for that whole duration. Off-loaded to a thread
    # so it costs this request time but nobody else's.
    return await asyncio.to_thread(_verify_password_sync, plain_password, hashed_password)


async def get_password_hash(password: str) -> str:
    return await asyncio.to_thread(_hash_password_sync, password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.JWTError:
        return None
