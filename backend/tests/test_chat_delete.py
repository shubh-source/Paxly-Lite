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
async def test_delete_own_message_for_everyone(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_del_1", name="Alice", email="alice@del.com", password="hash", partner_id="u_del_2", couple_space_id="space_del")
        u2 = User(id="u_del_2", name="Bob", email="bob@del.com", password="hash", partner_id="u_del_1", couple_space_id="space_del")
        space = CoupleSpace(id="space_del", user1_id="u_del_1", user2_id="u_del_2", allow_media_save=True)
        m1 = Message(
            id="msg_del_all_1",
            couple_space_id="space_del",
            sender_id="u_del_1",
            text=encrypt_data("Secret message to delete for everyone"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, m1])
        await session.commit()

    token_alice = create_access_token({"sub": "u_del_1"})
    headers_alice = {"Authorization": f"Bearer {token_alice}"}
    token_bob = create_access_token({"sub": "u_del_2"})
    headers_bob = {"Authorization": f"Bearer {token_bob}"}

    # Alice deletes her own message for everyone
    res = await client.delete("/api/chat/messages/msg_del_all_1?for_everyone=true", headers=headers_alice)
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}

    # Verify message is permanently deleted from database
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_del_all_1"))
        persisted = db_res.scalars().first()
        assert persisted is None

    # Neither Alice nor Bob can see it in messages
    res_a = await client.get("/api/chat/messages", headers=headers_alice)
    assert res_a.status_code == 200
    assert len(res_a.json()) == 0

    res_b = await client.get("/api/chat/messages", headers=headers_bob)
    assert res_b.status_code == 200
    assert len(res_b.json()) == 0


@pytest.mark.asyncio
async def test_delete_own_message_for_me(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_del_1", name="Alice", email="alice@del.com", password="hash", partner_id="u_del_2", couple_space_id="space_del")
        u2 = User(id="u_del_2", name="Bob", email="bob@del.com", password="hash", partner_id="u_del_1", couple_space_id="space_del")
        space = CoupleSpace(id="space_del", user1_id="u_del_1", user2_id="u_del_2", allow_media_save=True)
        m1 = Message(
            id="msg_del_me_1",
            couple_space_id="space_del",
            sender_id="u_del_1",
            text=encrypt_data("Alice note delete for me only"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, m1])
        await session.commit()

    token_alice = create_access_token({"sub": "u_del_1"})
    headers_alice = {"Authorization": f"Bearer {token_alice}"}
    token_bob = create_access_token({"sub": "u_del_2"})
    headers_bob = {"Authorization": f"Bearer {token_bob}"}

    # Alice deletes her own message for herself only
    res = await client.delete("/api/chat/messages/msg_del_me_1?for_everyone=false", headers=headers_alice)
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}

    # Verify message row remains in database with Alice's id in deleted_for
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_del_me_1"))
        persisted = db_res.scalars().first()
        assert persisted is not None
        assert "u_del_1" in (persisted.deleted_for or [])
        assert "u_del_2" not in (persisted.deleted_for or [])

    # Alice should NOT see this message
    res_a = await client.get("/api/chat/messages", headers=headers_alice)
    assert res_a.status_code == 200
    assert len(res_a.json()) == 0

    # Bob STILL sees this message
    res_b = await client.get("/api/chat/messages", headers=headers_bob)
    assert res_b.status_code == 200
    msgs_b = res_b.json()
    assert len(msgs_b) == 1
    assert msgs_b[0]["id"] == "msg_del_me_1"
    assert msgs_b[0]["text"] == "Alice note delete for me only"


@pytest.mark.asyncio
async def test_delete_partner_message_for_me(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_del_1", name="Alice", email="alice@del.com", password="hash", partner_id="u_del_2", couple_space_id="space_del")
        u2 = User(id="u_del_2", name="Bob", email="bob@del.com", password="hash", partner_id="u_del_1", couple_space_id="space_del")
        space = CoupleSpace(id="space_del", user1_id="u_del_1", user2_id="u_del_2", allow_media_save=True)
        m1 = Message(
            id="msg_del_partner_1",
            couple_space_id="space_del",
            sender_id="u_del_1", # Message sent by Alice
            text=encrypt_data("Alice's message that Bob deletes for himself"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, m1])
        await session.commit()

    token_alice = create_access_token({"sub": "u_del_1"})
    headers_alice = {"Authorization": f"Bearer {token_alice}"}
    token_bob = create_access_token({"sub": "u_del_2"})
    headers_bob = {"Authorization": f"Bearer {token_bob}"}

    # Bob deletes partner Alice's message for himself only
    res = await client.delete("/api/chat/messages/msg_del_partner_1?for_everyone=false", headers=headers_bob)
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}

    # Verify message persists in DB, deleted_for includes Bob's ID
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_del_partner_1"))
        persisted = db_res.scalars().first()
        assert persisted is not None
        assert "u_del_2" in (persisted.deleted_for or [])
        assert "u_del_1" not in (persisted.deleted_for or [])

    # Bob does NOT see the message anymore
    res_b = await client.get("/api/chat/messages", headers=headers_bob)
    assert res_b.status_code == 200
    assert len(res_b.json()) == 0

    # Alice STILL sees her message
    res_a = await client.get("/api/chat/messages", headers=headers_alice)
    assert res_a.status_code == 200
    msgs_a = res_a.json()
    assert len(msgs_a) == 1
    assert msgs_a[0]["id"] == "msg_del_partner_1"


@pytest.mark.asyncio
async def test_partner_cannot_delete_for_everyone(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_del_1", name="Alice", email="alice@del.com", password="hash", partner_id="u_del_2", couple_space_id="space_del")
        u2 = User(id="u_del_2", name="Bob", email="bob@del.com", password="hash", partner_id="u_del_1", couple_space_id="space_del")
        space = CoupleSpace(id="space_del", user1_id="u_del_1", user2_id="u_del_2", allow_media_save=True)
        m1 = Message(
            id="msg_partner_protected",
            couple_space_id="space_del",
            sender_id="u_del_1", # Alice sent this
            text=encrypt_data("Protected note"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, m1])
        await session.commit()

    token_bob = create_access_token({"sub": "u_del_2"})
    headers_bob = {"Authorization": f"Bearer {token_bob}"}

    # Bob attempts to delete Alice's message for everyone
    res = await client.delete("/api/chat/messages/msg_partner_protected?for_everyone=true", headers=headers_bob)
    assert res.status_code == 403
    assert "You can only delete your own messages for everyone" in res.json()["detail"]

    # Message must remain in DB
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_partner_protected"))
        persisted = db_res.scalars().first()
        assert persisted is not None


@pytest.mark.asyncio
async def test_stranger_cannot_delete_across_spaces(test_env):
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_del_1", name="Alice", email="alice@del.com", password="hash", partner_id="u_del_2", couple_space_id="space_del_a")
        u3 = User(id="u_del_3", name="Charlie", email="charlie@del.com", password="hash", partner_id="u_del_4", couple_space_id="space_del_b")
        space_a = CoupleSpace(id="space_del_a", user1_id="u_del_1", user2_id="u_del_2")
        space_b = CoupleSpace(id="space_del_b", user1_id="u_del_3", user2_id="u_del_4")
        m1 = Message(
            id="msg_cross_space",
            couple_space_id="space_del_a",
            sender_id="u_del_1",
            text=encrypt_data("Private space A note"),
            message_type="text",
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u3, space_a, space_b, m1])
        await session.commit()

    token_charlie = create_access_token({"sub": "u_del_3"})
    headers_charlie = {"Authorization": f"Bearer {token_charlie}"}

    # Charlie attempts to delete Space A message
    res1 = await client.delete("/api/chat/messages/msg_cross_space?for_everyone=true", headers=headers_charlie)
    assert res1.status_code == 404

    res2 = await client.delete("/api/chat/messages/msg_cross_space?for_everyone=false", headers=headers_charlie)
    assert res2.status_code == 404


def test_websocket_message_delete_flow():
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
            u_a1 = User(id="u_ws_d1", name="Alice", email="alice_wsd@test.com", password="hash", partner_id="u_ws_d2", couple_space_id="space_ws_d")
            u_a2 = User(id="u_ws_d2", name="Bob", email="bob_wsd@test.com", password="hash", partner_id="u_ws_d1", couple_space_id="space_ws_d")
            m1 = Message(id="msg_ws_del_1", couple_space_id="space_ws_d", sender_id="u_ws_d1", text=encrypt_data("WS text to delete"), timestamp=datetime.utcnow())
            session.add_all([u_a1, u_a2, m1])
            await session.commit()

    asyncio.run(seed())

    token_a1 = create_access_token({"sub": "u_ws_d1"})

    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "auth", "token": token_a1})
            # Send message_delete for everyone
            ws.send_json({"type": "message_delete", "message_id": "msg_ws_del_1", "for_everyone": True})
            resp = ws.receive_json()
            assert resp["type"] == "message_deleted"
            assert resp["message_id"] == "msg_ws_del_1"

    # Verify message in database was removed
    async def verify_db():
        async with TestSession() as session:
            res = await session.execute(select(Message).filter(Message.id == "msg_ws_del_1"))
            msg = res.scalars().first()
            assert msg is None

    asyncio.run(verify_db())
    asyncio.run(engine.dispose())
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
