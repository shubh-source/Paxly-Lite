import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.models.orm import Base
import os
from dotenv import load_dotenv

load_dotenv('.env')
DATABASE_URL = os.getenv('DATABASE_URL')

engine = create_async_engine(DATABASE_URL, echo=True, connect_args={'statement_cache_size': 0})

async def reset_db():
    async with engine.begin() as conn:
        print('Dropping all tables...')
        await conn.run_sync(Base.metadata.drop_all)
        print('Creating all tables...')
        await conn.run_sync(Base.metadata.create_all)
    print('Database wiped and reset successfully!')

if __name__ == '__main__':
    asyncio.run(reset_db())
