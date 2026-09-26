import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine("postgresql+asyncpg://postgres.yyippptvcjxtabjuuwki:katiyar0109@aws-1-ap-south-1.pooler.supabase.com:6543/postgres", connect_args={'ssl': ctx})
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT name, created_at FROM users"))
        print(res.fetchall())
    await engine.dispose()

asyncio.run(main())
