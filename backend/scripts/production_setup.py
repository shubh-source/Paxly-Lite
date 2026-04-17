import asyncio
import sys
import os

# Add the app directory to path so we can import models
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine, Base
from app.models.orm import * # Import all models to ensure they are registered

async def init_production_db():
    print("Initializing Production Database...")
    print(f"Target DB: {engine.url.database} on {engine.url.host}")
    
    # Non-interactive for deployment speed
    print("Synchronizing tables...")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    print("Database initialized successfully!")

if __name__ == "__main__":
    asyncio.run(init_production_db())
