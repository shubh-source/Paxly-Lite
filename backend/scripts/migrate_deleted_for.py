import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres.yyippptvcjxtabjuuwki:katiyar0109@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN deleted_for JSONB DEFAULT \'[]\'::jsonb;')
        print('Added deleted_for')
    except Exception as e: print(f'deleted_for: {e}')
    await conn.close()

asyncio.run(main())
