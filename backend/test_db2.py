import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from app.models.orm import Message
import ssl

async def test():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        res = await db.execute(select(Message).order_by(Message.timestamp.desc()).limit(10))
        msgs = res.scalars().all()
        for m in msgs:
            print(m.timestamp, m.text, m.is_optimistic if hasattr(m, 'is_optimistic') else 'N/A')
            
    await engine.dispose()

asyncio.run(test())
