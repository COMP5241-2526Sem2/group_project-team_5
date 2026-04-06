import ssl
from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def async_engine_connect_args() -> dict:
    """asyncpg (e.g. Supabase) needs TLS; enable with DATABASE_SSL=true or supabase host."""
    url = settings.database_url
    if "+asyncpg" not in url:
        return {}

    connect_args: dict = {}

    if settings.database_ssl or ".supabase.co" in url:
        if settings.database_ssl_insecure:
            proto = getattr(ssl, "PROTOCOL_TLS_CLIENT", ssl.PROTOCOL_TLS)
            ctx = ssl.SSLContext(proto)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = ctx
        else:
            connect_args["ssl"] = True

    if ".pooler.supabase.com" in url:
        # Supabase Pooler uses PgBouncer and may clash on fixed prepared stmt names.
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid4()}__"

    return connect_args


engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args=async_engine_connect_args(),
)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
