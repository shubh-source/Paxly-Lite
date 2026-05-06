import asyncio
import sys
import os

# Add the current directory to sys.path to find 'app'
sys.path.append(os.getcwd())

from app.core.database import engine
from app.models.orm import Base

async def init_db():
    print("Connecting to database and creating tables...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("SUCCESS: Tables created successfully!")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(init_db())
