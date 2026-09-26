import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def test_ws():
    import uuid
    # Start a mock server or just use the local uvicorn if it was running?
    # Actually, we can just instantiate the SQLAlchemy models and try to commit them.
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.models.orm import Message
    from datetime import datetime
    import ssl
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx, 'statement_cache_size': 0})
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        try:
            msg = Message(
                id=str(uuid.uuid4()), couple_space_id="test_space", sender_id="test_user",
                message_type="text", text="encrypted_text",
                media_url=None, is_once_view=False,
                view_limit=1, timestamp=datetime.utcnow(),
                reply_to_id=None
            )
            db.add(msg)
            await db.commit()
            print("Commit successful!")
            
            # Now let's try to access the properties BEFORE flushing
            print("views_used:", msg.views_used)
            print("reactions:", msg.reactions)
            
        except Exception as e:
            print(f"Exception: {e}")
            
    await engine.dispose()

asyncio.run(test_ws())
