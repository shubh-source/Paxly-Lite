import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    db_url = os.getenv("DATABASE_URL").replace("postgresql+asyncpg", "postgresql")
    conn = await asyncpg.connect(db_url)
    
    try:
        await conn.execute('ALTER TABLE users ADD COLUMN public_key VARCHAR;')
        print("Added public_key to users table")
    except Exception as e: 
        print(f"Error adding public_key: {e}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
