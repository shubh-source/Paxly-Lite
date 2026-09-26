import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine
from app.models.orm import Base
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("create_all SUCCEEDED")
    except Exception as e:
        print(f"create_all FAILED: {e}")
    await engine.dispose()

asyncio.run(main())
