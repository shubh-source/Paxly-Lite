import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres.yyippptvcjxtabjuuwki:katiyar0109@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
    
    # 1. Add sender_name
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN sender_name VARCHAR;')
        print("Added sender_name")
    except Exception as e: print(f"sender_name: {e}")

    # 2. Add is_once_view
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN is_once_view BOOLEAN DEFAULT FALSE;')
        print("Added is_once_view")
    except Exception as e: print(f"is_once_view: {e}")

    # 3. Add view_limit
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN view_limit INTEGER DEFAULT 1;')
        print("Added view_limit")
    except Exception as e: print(f"view_limit: {e}")

    # 4. Add views_used
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN views_used INTEGER DEFAULT 0;')
        print("Added views_used")
    except Exception as e: print(f"views_used: {e}")

    # 5. Add is_compromised
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN is_compromised BOOLEAN DEFAULT FALSE;')
        print("Added is_compromised")
    except Exception as e: print(f"is_compromised: {e}")

    await conn.close()

asyncio.run(main())
