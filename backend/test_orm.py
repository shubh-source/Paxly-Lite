import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, Boolean, Integer, DateTime
from sqlalchemy.future import select
from app.models.orm import User
from app.core.database import AsyncSessionLocal
import ssl

async def main():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).limit(1))
        user = res.scalars().first()
        print(f"User loaded: {user.name}, public_key: {user.public_key}, stealth_mode_app: {user.stealth_mode_app}")

asyncio.run(main())
