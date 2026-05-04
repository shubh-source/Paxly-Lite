from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings
import ssl

# PostgreSQL connection string from settings (Must use 6543 for Render IPv4 compatibility)
DATABASE_URL = settings.DATABASE_URL

# Build SSL context for Supabase (required for pooler connections)
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

from sqlalchemy.pool import NullPool

# create_async_engine with Supabase-compatible settings:
# - statement_cache_size=0 required for Supabase transaction-mode pooler
# - NullPool prevents SQLAlchemy from pooling connections that PgBouncer is already pooling
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
    connect_args={
        "ssl": _ssl_ctx,
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

async def connect_db():
    print("PostgreSQL engine configured (Supabase Pooler mode)")

async def close_db():
    await engine.dispose()
    print("PostgreSQL connection closed")

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
