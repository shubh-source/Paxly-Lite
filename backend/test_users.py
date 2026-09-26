import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    async with engine.begin() as conn:
        res = await conn.execute(text('SELECT * FROM users LIMIT 1'))
        print(res.fetchall())
    await engine.dispose()

asyncio.run(main())
