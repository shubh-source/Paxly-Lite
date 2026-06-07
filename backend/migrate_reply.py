import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres.yyippptvcjxtabjuuwki:katiyar0109@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
    
    # Add reply_to_id
    try:
        await conn.execute('ALTER TABLE messages ADD COLUMN reply_to_id VARCHAR;')
        print("Added reply_to_id to messages")
    except Exception as e:
        print(f"reply_to_id error: {e}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
