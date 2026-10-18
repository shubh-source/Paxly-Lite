import pytest
import tempfile
import os
import json
from datetime import datetime
from starlette.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, Message
from app.core.security import create_access_token

def test_websocket_reaction_couple_space_isolation():
    """Verifies that WebSocket reactions cannot modify messages belonging to another couple space."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    
    import asyncio
    async def init_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init_tables())

    TestSession = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    main_module.AsyncSessionLocal = TestSession
    import app.websocket.handler as ws_handler
    ws_handler.AsyncSessionLocal = TestSession

    async def seed():
        async with TestSession() as session:
            u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
            u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
            u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
            u_b2 = User(id="u_b2", name="Dana", email="dana@test.com", password="hash", partner_id="u_b1", couple_space_id="space_b")
            
            # Message 1 in Space A
            m1 = Message(id="msg_space_a", couple_space_id="space_a", sender_id="u_a2", text="Hello from Bob", reactions={}, timestamp=datetime.utcnow())
            # Message 2 in Space B
            m2 = Message(id="msg_space_b", couple_space_id="space_b", sender_id="u_b2", text="Hello from Dana", reactions={}, timestamp=datetime.utcnow())

            session.add_all([u_a1, u_a2, u_b1, u_b2, m1, m2])
            await session.commit()

    asyncio.run(seed())

    token_a1 = create_access_token({"sub": "u_a1"})

    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    # Test with starlette TestClient
    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws:
            # 1. Send auth
            ws.send_json({"type": "auth", "token": token_a1})

            # 2. Try to react to Message 2 belonging to Space B
            ws.send_json({
                "type": "reaction",
                "message_id": "msg_space_b",
                "emoji": "😈"
            })

            # Check response
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "not found in your couple space" in resp["message"].lower()

            # 3. React to Message 1 belonging to own Space A
            ws.send_json({
                "type": "reaction",
                "message_id": "msg_space_a",
                "emoji": "❤️"
            })

            resp2 = ws.receive_json()
            assert resp2["type"] == "reaction"
            assert resp2["message_id"] == "msg_space_a"
            assert resp2["reactions"].get("u_a1") == "❤️"

    # Verify database persistence
    async def verify_db():
        async with TestSession() as session:
            # Message in Space B must NOT have been touched
            res_m2 = await session.execute(select(Message).filter(Message.id == "msg_space_b"))
            m2_db = res_m2.scalars().first()
            assert m2_db.reactions == {}

            # Message in Space A must have Alice's reaction
            res_m1 = await session.execute(select(Message).filter(Message.id == "msg_space_a"))
            m1_db = res_m1.scalars().first()
            assert m1_db.reactions.get("u_a1") == "❤️"

    asyncio.run(verify_db())
    asyncio.run(engine.dispose())

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
