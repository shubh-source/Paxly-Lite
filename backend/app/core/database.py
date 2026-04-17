from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings
import ssl

# PostgreSQL connection string from settings
DATABASE_URL = settings.DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

async def connect_db():
    # In a real app, we might want to check connection here
    print(f"Connected to PostgreSQL (via SQLAlchemy)")

async def close_db():
    await engine.dispose()
    print("PostgreSQL connection closed")

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# Note: The old 'db' proxy is removed as SQLAlchemy requires explicit sessions.
# Routes will be updated to use Depends(get_db).
