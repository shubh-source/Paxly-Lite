from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings
import ssl

# PostgreSQL connection string from settings
DATABASE_URL = settings.DATABASE_URL

# Build SSL context for Supabase (required for pooler connections)
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

# create_async_engine with Supabase-compatible settings:
# - prepared_statement_cache_size=0 → required for Supabase transaction-mode pooler
# - pool_pre_ping → detect dead connections
# - connect_args ssl → force SSL for Supabase
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={
        "ssl": _ssl_ctx,
        "statement_cache_size": 0,  # Required for Supabase pgbouncer transaction mode
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
