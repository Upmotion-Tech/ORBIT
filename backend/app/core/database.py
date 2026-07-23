from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


engine = create_async_engine(
    settings.db_url,
    echo=settings.debug,
    future=True,
    # Neon closes idle server-side connections well under an hour apart, so
    # a connection sitting in the pool between runs of the hourly
    # `_run_notification_cleanup` scheduled job (main.py) is often already
    # dead by the time asyncpg reuses it, raising
    # `InterfaceError: connection is closed`. pool_pre_ping makes SQLAlchemy
    # liveness-check (and transparently replace) a pooled connection before
    # handing it out; pool_recycle proactively retires connections older
    # than Neon's own idle-close window so pre_ping rarely even has to catch it.
    pool_pre_ping=True,
    pool_recycle=280,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
