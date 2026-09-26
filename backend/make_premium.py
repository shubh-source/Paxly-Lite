import asyncio
import sys
import os

# Add the app directory to the sys path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal
from app.models.orm import User

async def make_premium_creator(email: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if not user:
            print(f"Error: User with email '{email}' not found.")
            return

        user.is_premium = True
        user.role = "admin" # Setting role as admin/creator for VIP access
        
        await db.commit()
        print(f"Success! Account '{email}' is now a Premium VIP (Admin/Creator).")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Please provide an email address.")
        sys.exit(1)
        
    email = sys.argv[1]
    asyncio.run(make_premium_creator(email))
