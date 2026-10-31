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

    from app.models.orm import User, Message, CoupleSpace

    async def seed():
        async with TestSession() as session:
            u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
            u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
            u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
            u_b2 = User(id="u_b2", name="Dana", email="dana@test.com", password="hash", partner_id="u_b1", couple_space_id="space_b")

            sp_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
            sp_b = CoupleSpace(id="space_b", user1_id="u_b1", user2_id="u_b2")
            
            # Message 1 in Space A
            m1 = Message(id="msg_space_a", couple_space_id="space_a", sender_id="u_a2", text="Hello from Bob", reactions={}, timestamp=datetime.utcnow())
            # Message 2 in Space B
            m2 = Message(id="msg_space_b", couple_space_id="space_b", sender_id="u_b2", text="Hello from Dana", reactions={}, timestamp=datetime.utcnow())

            session.add_all([u_a1, u_a2, u_b1, u_b2, sp_a, sp_b, m1, m2])
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


def test_websocket_edit_delete_and_reply_couple_space_isolation():
    """Verifies that WebSocket edit, delete, and reply cannot cross couple spaces,
    and message couple_space_id remains strictly immutable."""
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

    from app.core.encryption import encrypt_data
    from app.models.orm import CoupleSpace

    async def seed():
        async with TestSession() as session:
            u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
            u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
            u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
            u_b2 = User(id="u_b2", name="Dana", email="dana@test.com", password="hash", partner_id="u_b1", couple_space_id="space_b")

            sp_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
            sp_b = CoupleSpace(id="space_b", user1_id="u_b1", user2_id="u_b2")
            sp_old = CoupleSpace(id="space_old", user1_id="u_a1")
            
            # Message 1 in Space A (sent by Bob)
            m1 = Message(id="msg_space_a", couple_space_id="space_a", sender_id="u_a2", text=encrypt_data("Hello from Bob"), message_type="text", reactions={}, timestamp=datetime.utcnow())
            # Message 2 in Space B (sent by Dana)
            m2 = Message(id="msg_space_b", couple_space_id="space_b", sender_id="u_b2", text=encrypt_data("Hello from Dana"), message_type="text", reactions={}, timestamp=datetime.utcnow())
            # Message sent by Alice in an old space
            m_old = Message(id="msg_alice_old", couple_space_id="space_old", sender_id="u_a1", text=encrypt_data("Alice old secret"), message_type="text", reactions={}, timestamp=datetime.utcnow())

            session.add_all([u_a1, u_a2, u_b1, u_b2, sp_a, sp_b, sp_old, m1, m2, m_old])
            await session.commit()

    asyncio.run(seed())

    token_a1 = create_access_token({"sub": "u_a1"})

    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": token_a1})

            # 1. Cross-space edit attempt on Space B message
            ws.send_json({
                "type": "message_edit",
                "message_id": "msg_space_b",
                "text": "Hijacked foreign message"
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "not found in your couple space" in resp["message"].lower()

            # 2. Cross-space edit attempt on old space message (even though Alice was original sender)
            ws.send_json({
                "type": "message_edit",
                "message_id": "msg_alice_old",
                "text": "Attempt to hijack old message into space_a"
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "not found in your couple space" in resp["message"].lower()

            # 3. Cross-space delete attempt on Space B message
            ws.send_json({
                "type": "message_delete",
                "message_id": "msg_space_b",
                "for_everyone": True
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "not found in your couple space" in resp["message"].lower()

            # 4. Cross-space delete attempt on old message
            ws.send_json({
                "type": "message_delete",
                "message_id": "msg_alice_old",
                "for_everyone": True
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "not found in your couple space" in resp["message"].lower()

            # 5. Cross-space reply attempt linking to Space B message
            ws.send_json({
                "type": "chat_message",
                "text": "Cross space reply",
                "temp_id": "temp_bad_reply",
                "reply_to_id": "msg_space_b"
            })
            resp = ws.receive_json()
            assert resp["type"] == "chat_message_error"
            assert resp["temp_id"] == "temp_bad_reply"
            assert "not found in your couple space" in resp["message"].lower()

            # 6. Cannot edit partner's message within same space
            ws.send_json({
                "type": "message_edit",
                "message_id": "msg_space_a",
                "text": "Alice trying to edit Bob's text"
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "only edit your own messages" in resp["message"].lower()

            # 7. Cannot delete partner's message for everyone within same space
            ws.send_json({
                "type": "message_delete",
                "message_id": "msg_space_a",
                "for_everyone": True
            })
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "only delete your own messages for everyone" in resp["message"].lower()

            # 8. Valid send, edit, react, and delete within Space A works
            ws.send_json({
                "type": "chat_message",
                "text": "Alice valid message",
                "temp_id": "temp_alice_1"
            })
            resp = ws.receive_json()
            assert resp["type"] == "chat_message"
            alice_msg_id = resp["id"]

            # Edit own message
            ws.send_json({
                "type": "message_edit",
                "message_id": alice_msg_id,
                "text": "Alice edited message"
            })
            resp = ws.receive_json()
            assert resp["type"] == "message_edited"
            assert resp["text"] == "Alice edited message"

            # React to own message
            ws.send_json({
                "type": "reaction",
                "message_id": alice_msg_id,
                "emoji": "💖"
            })
            resp = ws.receive_json()
            assert resp["type"] == "reaction"
            assert resp["reactions"].get("u_a1") == "💖"

            # Delete own message
            ws.send_json({
                "type": "message_delete",
                "message_id": alice_msg_id,
                "for_everyone": True
            })
            resp = ws.receive_json()
            assert resp["type"] == "message_deleted"
            assert resp["message_id"] == alice_msg_id

    # Verify database immutability
    async def verify_db():
        async with TestSession() as session:
            # Foreign message in Space B must remain completely untouched
            res_m2 = await session.execute(select(Message).filter(Message.id == "msg_space_b"))
            m2_db = res_m2.scalars().first()
            assert m2_db is not None
            assert m2_db.couple_space_id == "space_b"
            assert m2_db.reactions == {}

            # Old message must remain in space_old
            res_mold = await session.execute(select(Message).filter(Message.id == "msg_alice_old"))
            mold_db = res_mold.scalars().first()
            assert mold_db is not None
            assert mold_db.couple_space_id == "space_old"

            # Alice deleted her own message, so it is removed
            res_alice = await session.execute(select(Message).filter(Message.id == alice_msg_id))
            assert res_alice.scalars().first() is None

    asyncio.run(verify_db())
    asyncio.run(engine.dispose())

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


def test_rest_chat_endpoints_couple_space_isolation_and_immutability():
    """Verifies that REST endpoints reject cross-space message IDs (reactions, edits,
    deletes, replies) and keep couple_space_id immutable."""
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

    async def override_get_db():
        async with TestSession() as session:
            yield session

    main_module.app.dependency_overrides[get_db] = override_get_db

    from app.core.encryption import encrypt_data
    from app.models.orm import CoupleSpace

    async def seed():
        async with TestSession() as session:
            u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
            u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
            u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
            u_b2 = User(id="u_b2", name="Dana", email="dana@test.com", password="hash", partner_id="u_b1", couple_space_id="space_b")

            sp_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
            sp_b = CoupleSpace(id="space_b", user1_id="u_b1", user2_id="u_b2")
            sp_old = CoupleSpace(id="space_old", user1_id="u_a1")

            m1 = Message(id="msg_space_a", couple_space_id="space_a", sender_id="u_a2", text=encrypt_data("Bob space A text"), message_type="text", reactions={}, timestamp=datetime.utcnow())
            m2 = Message(id="msg_space_b", couple_space_id="space_b", sender_id="u_b2", text=encrypt_data("Dana space B text"), message_type="text", reactions={}, timestamp=datetime.utcnow())
            m_old = Message(id="msg_alice_old", couple_space_id="space_old", sender_id="u_a1", text=encrypt_data("Alice old text"), message_type="text", reactions={}, timestamp=datetime.utcnow())

            session.add_all([u_a1, u_a2, u_b1, u_b2, sp_a, sp_b, sp_old, m1, m2, m_old])
            await session.commit()

    asyncio.run(seed())

    token_a1 = create_access_token({"sub": "u_a1"})
    headers = {"Authorization": f"Bearer {token_a1}"}

    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    with TestClient(main_module.app) as client:
        # 1. Cross-space reaction add attempt -> 404
        r = client.post("/api/chat/messages/msg_space_b/react", json={"emoji": "🔥"}, headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 2. Cross-space reaction delete attempt -> 404
        r = client.delete("/api/chat/messages/msg_space_b/react", headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 3. Cross-space edit attempt -> 404
        r = client.patch("/api/chat/messages/msg_space_b", json={"text": "Hijack"}, headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 4. Cross-space delete attempt -> 404
        r = client.delete("/api/chat/messages/msg_space_b", headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 5. Cross-space reply attempt -> 404
        r = client.post("/api/chat/messages", json={"text": "Cross reply", "reply_to_id": "msg_space_b"}, headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 6. Old space message authored by Alice herself -> must still be 404 from space_a
        r = client.post("/api/chat/messages/msg_alice_old/react", json={"emoji": "✨"}, headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        r = client.patch("/api/chat/messages/msg_alice_old", json={"text": "Hijack old"}, headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        r = client.delete("/api/chat/messages/msg_alice_old", headers=headers)
        assert r.status_code == 404
        assert "not found in your couple space" in r.json()["detail"].lower()

        # 7. GET /messages should only list messages belonging strictly to space_a
        r = client.get("/api/chat/messages", headers=headers)
        assert r.status_code == 200
        msg_ids = [m["id"] for m in r.json()]
        assert "msg_space_a" in msg_ids
        assert "msg_space_b" not in msg_ids
        assert "msg_alice_old" not in msg_ids

        # 8. Valid same-space reaction, reply, and delete work
        # React to own space message
        r = client.post("/api/chat/messages/msg_space_a/react", json={"emoji": "❤️"}, headers=headers)
        assert r.status_code == 200
        assert r.json()["reactions"].get("u_a1") == "❤️"

        # Reply to own space message
        r = client.post("/api/chat/messages", json={"text": "Valid reply to Bob", "reply_to_id": "msg_space_a"}, headers=headers)
        assert r.status_code == 200
        reply_msg_id = r.json()["id"]

        # Edit own message
        r = client.patch(f"/api/chat/messages/{reply_msg_id}", json={"text": "Valid reply edited"}, headers=headers)
        assert r.status_code == 200
        assert r.json()["text"] == "Valid reply edited"

        # Delete own message
        r = client.delete(f"/api/chat/messages/{reply_msg_id}", headers=headers)
        assert r.status_code == 200

    # Verify database immutability
    async def verify_db():
        async with TestSession() as session:
            # Foreign message in Space B remains intact
            res_m2 = await session.execute(select(Message).filter(Message.id == "msg_space_b"))
            m2_db = res_m2.scalars().first()
            assert m2_db.couple_space_id == "space_b"
            assert m2_db.reactions == {}

            # Old message in Space Old remains intact with couple_space_id="space_old"
            res_mold = await session.execute(select(Message).filter(Message.id == "msg_alice_old"))
            mold_db = res_mold.scalars().first()
            assert mold_db.couple_space_id == "space_old"

            # Space A message reactions updated
            res_m1 = await session.execute(select(Message).filter(Message.id == "msg_space_a"))
            m1_db = res_m1.scalars().first()
            assert m1_db.couple_space_id == "space_a"
            assert m1_db.reactions.get("u_a1") == "❤️"

    asyncio.run(verify_db())
    main_module.app.dependency_overrides.clear()
    asyncio.run(engine.dispose())

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
