import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine
from app.models.orm import Base
from sqlalchemy import text
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    
    try:
        async with engine.begin() as conn:
            alter_queries = [
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS views_used INTEGER DEFAULT 0",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_compromised BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS blur_sensitive BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_activity BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_personality VARCHAR DEFAULT 'compassionate'",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS milestone_alerts BOOLEAN DEFAULT TRUE",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS theme_id VARCHAR DEFAULT 'classic'",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS chat_wallpaper VARCHAR",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS allow_media_save BOOLEAN DEFAULT TRUE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS app_pin VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMP",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS intruder_trigger BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stealth_mode_app VARCHAR DEFAULT 'calculator'",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key VARCHAR",
            ]
            for q in alter_queries:
                print(f"Executing: {q}")
                await conn.execute(text(q))
                
        print("ALL SUCCEEDED")
    except Exception as e:
        print(f"FAILED: {e}")
        
    await engine.dispose()

asyncio.run(main())
