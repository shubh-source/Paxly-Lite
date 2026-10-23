import pytest
import pytest_asyncio
import tempfile
import os
from datetime import datetime
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select
from starlette.testclient import TestClient

from app.core.database import Base, get_db
import app.main as main_module
import app.websocket.handler as ws_handler
from app.models.orm import User, CoupleSpace, Message
from app.core.security import create_access_token
from app.core.encryption import encrypt_data, decrypt_data


@pytest_asyncio.fixture
async def test_env():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestSession = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    main_module.AsyncSessionLocal = TestSession
    ws_handler.AsyncSessionLocal = TestSession

    async def override_get_db():
        async with TestSession() as session:
            yield session

    main_module.app.dependency_overrides[get_db] = override_get_db

    @asynccontextmanager
    async def mock_lifespan(app):
        yield

    main_module.app.router.lifespan_context = mock_lifespan

    transport = httpx.ASGITransport(app=main_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield {
            "session_factory": TestSession,
            "client": client,
            "engine": engine,
            "db_path": db_path,
        }

    main_module.app.dependency_overrides.clear()
    await engine.dispose()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_edit_message_success_and_at_rest_encryption(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        space = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2", allow_media_save=True)
        m1 = Message(
            id="msg_edit_1",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Original text message"),
            message_type="text",
            is_once_view=False,
            timestamp=datetime.utcnow()
        )
        session.add_all([u_a1, u_a2, space, m1])
        await session.commit()

    token_a1 = create_access_token({"sub": "u_a1"})
    headers = {"Authorization": f"Bearer {token_a1}"}

    # Author edits their own message
    res = await client.patch("/api/chat/messages/msg_edit_1", json={"text": "Edited text message"}, headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["text"] == "Edited text message"
    assert body["is_edited"] is True
    assert body["edited_at"] is not None

    # Check at-rest encryption in the database
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_edit_1"))
        persisted = db_res.scalars().first()
        assert persisted.is_edited is True
        assert persisted.edited_at is not None
        # Must not be stored as plaintext
        assert persisted.text != "Edited text message"
        # Decrypting matches edited text
        assert decrypt_data(persisted.text) == "Edited text message"

    # get_messages returns edited message with is_edited=True
    get_res = await client.get("/api/chat/messages", headers=headers)
    assert get_res.status_code == 200
    msgs = get_res.json()
    assert len(msgs) == 1
    assert msgs[0]["text"] == "Edited text message"
    assert msgs[0]["is_edited"] is True
    assert msgs[0]["edited_at"] is not None


@pytest.mark.asyncio
async def test_partner_cannot_edit_others_message(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        space = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
        m1 = Message(
            id="msg_edit_alice",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Alice's message"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u_a1, u_a2, space, m1])
        await session.commit()

    token_bob = create_access_token({"sub": "u_a2"})
    headers = {"Authorization": f"Bearer {token_bob}"}

    # Bob attempts to edit Alice's message
    res = await client.patch("/api/chat/messages/msg_edit_alice", json={"text": "Hacked message"}, headers=headers)
    assert res.status_code == 403
    assert "You can only edit your own messages" in res.json()["detail"]


@pytest.mark.asyncio
async def test_stranger_cannot_edit_message_across_spaces(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
        space_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
        space_b = CoupleSpace(id="space_b", user1_id="u_b1", user2_id="u_b2")
        m1 = Message(
            id="msg_space_a_1",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Private space A note"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u_a1, u_b1, space_a, space_b, m1])
        await session.commit()

    token_charlie = create_access_token({"sub": "u_b1"})
    headers = {"Authorization": f"Bearer {token_charlie}"}

    # Charlie from Space B attempts to edit Space A message
    res = await client.patch("/api/chat/messages/msg_space_a_1", json={"text": "Hijack attempt"}, headers=headers)
    assert res.status_code == 404
    assert "Message not found" in res.json()["detail"]


@pytest.mark.asyncio
async def test_cannot_edit_empty_text_or_view_once(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        space = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
        m_normal = Message(
            id="msg_normal",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Normal text"),
            message_type="text",
            is_once_view=False,
            timestamp=datetime.utcnow()
        )
        m_once = Message(
            id="msg_once",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Confidential once view"),
            message_type="text",
            is_once_view=True,
            timestamp=datetime.utcnow()
        )
        m_image = Message(
            id="msg_image",
            couple_space_id="space_a",
            sender_id="u_a1",
            text=encrypt_data("Photo caption"),
            media_url="/media/photo.jpg",
            message_type="image",
            is_once_view=False,
            timestamp=datetime.utcnow()
        )
        session.add_all([u_a1, space, m_normal, m_once, m_image])
        await session.commit()

    token_a1 = create_access_token({"sub": "u_a1"})
    headers = {"Authorization": f"Bearer {token_a1}"}

    # Empty text
    res1 = await client.patch("/api/chat/messages/msg_normal", json={"text": "   "}, headers=headers)
    assert res1.status_code == 400
    assert "empty" in res1.json()["detail"]

    # View once message
    res2 = await client.patch("/api/chat/messages/msg_once", json={"text": "Edited secret"}, headers=headers)
    assert res2.status_code == 400
    assert "View-once" in res2.json()["detail"]

    # Image message
    res3 = await client.patch("/api/chat/messages/msg_image", json={"text": "Edited caption"}, headers=headers)
    assert res3.status_code == 400
    assert "Only text messages" in res3.json()["detail"]


def test_websocket_message_edit_flow():
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
    ws_handler.AsyncSessionLocal = TestSession

    async def seed():
        async with TestSession() as session:
            u_a1 = User(id="u_ws_1", name="Alice", email="alice_ws@test.com", password="hash", partner_id="u_ws_2", couple_space_id="space_ws")
            u_a2 = User(id="u_ws_2", name="Bob", email="bob_ws@test.com", password="hash", partner_id="u_ws_1", couple_space_id="space_ws")
            m1 = Message(id="msg_ws_1", couple_space_id="space_ws", sender_id="u_ws_1", text=encrypt_data("Initial text"), timestamp=datetime.utcnow())
            session.add_all([u_a1, u_a2, m1])
            await session.commit()

    asyncio.run(seed())

    token_a1 = create_access_token({"sub": "u_ws_1"})

    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": token_a1})
            # Send message_edit
            ws.send_json({"type": "message_edit", "message_id": "msg_ws_1", "text": "WS Edited text"})
            resp = ws.receive_json()
            assert resp["type"] == "message_edited"
            assert resp["message_id"] == "msg_ws_1"
            assert resp["text"] == "WS Edited text"
            assert resp["is_edited"] is True

    # Verify message in database was updated
    async def verify_db():
        async with TestSession() as session:
            res = await session.execute(select(Message).filter(Message.id == "msg_ws_1"))
            msg = res.scalars().first()
            assert msg.is_edited is True
            assert decrypt_data(msg.text) == "WS Edited text"

    asyncio.run(verify_db())
    asyncio.run(engine.dispose())
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
