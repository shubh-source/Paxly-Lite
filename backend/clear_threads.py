import asyncio
from app.core.database import AsyncSessionLocal, engine
from app.models.orm import AIChatThread
from sqlalchemy import delete

async def clear():
    async with AsyncSessionLocal() as session:
        await session.execute(delete(AIChatThread))
        await session.commit()
        print('Cleared AIChatThread')

asyncio.run(clear())
