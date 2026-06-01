import asyncio
from app.core.database import engine, Base
from app.models.orm import User

async def test():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print('DB OK')
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
