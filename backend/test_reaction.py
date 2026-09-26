import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from app.models.orm import Message, User
from sqlalchemy.orm.attributes import flag_modified
import ssl

async def test():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        msg = await db.execute(select(Message).limit(1))
        msg = msg.scalars().first()
        if msg:
            print("Found message:", msg.id, msg.reactions)
            new_reactions = dict(msg.reactions or {})
            new_reactions["test_user"] = "REACT"
            msg.reactions = new_reactions
            flag_modified(msg, "reactions")
            await db.commit()
            print("Updated reactions successfully")
        else:
            print("No messages found")
            
    async with async_session() as db:
        msg2 = await db.execute(select(Message).filter(Message.id == msg.id))
        msg2 = msg2.scalars().first()
        print("Re-fetched message:", msg2.id, msg2.reactions)

    await engine.dispose()

asyncio.run(test())
