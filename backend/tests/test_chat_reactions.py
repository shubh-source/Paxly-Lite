import pytest
import pytest_asyncio
import tempfile
import os
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
import app.websocket.handler as ws_handler
from app.models.orm import User, CoupleSpace, Message
from app.core.security import create_access_token
from app.core.encryption import encrypt_data


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
async def test_reaction_add_both_partners(test_env):
    """Test both partners adding reactions to the same message without overwriting."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2", allow_media_save=True)
        msg = Message(
            id="msg_react_1",
            couple_space_id="space1",
            sender_id="u1",
            text=encrypt_data("Hello love"),
            message_type="text",
            reactions={},
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token1 = create_access_token({"sub": "u1"})
    token2 = create_access_token({"sub": "u2"})

    # 1. Alice reacts with ❤️
    res1 = await client.post(
        "/api/chat/messages/msg_react_1/react",
        json={"emoji": "❤️"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res1.status_code == 200, res1.text
    assert res1.json()["reactions"] == {"u1": "❤️"}

    # 2. Bob reacts with 😂 on the same message
    res2 = await client.post(
        "/api/chat/messages/msg_react_1/react",
        json={"emoji": "😂"},
        headers={"Authorization": f"Bearer {token2}"}
    )
    assert res2.status_code == 200, res2.text
    # BOTH reactions must exist simultaneously
    reactions = res2.json()["reactions"]
    assert reactions.get("u1") == "❤️"
    assert reactions.get("u2") == "😂"

    # Verify database persistence
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_react_1"))
        persisted = db_res.scalars().first()
        from app.api.routes.chat import safe_parse_reactions
        db_reactions = safe_parse_reactions(persisted.reactions)
        assert db_reactions == {"u1": "❤️", "u2": "😂"}


@pytest.mark.asyncio
async def test_reaction_change_and_remove(test_env):
    """Test modifying and removing reactions while preserving the partner's reaction."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2", allow_media_save=True)
        msg = Message(
            id="msg_react_2",
            couple_space_id="space1",
            sender_id="u1",
            text=encrypt_data("Change reaction test"),
            message_type="text",
            reactions={"u1": "❤️", "u2": "🔥"},
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token1 = create_access_token({"sub": "u1"})

    # 1. Alice changes reaction from ❤️ to 🥰
    res_change = await client.post(
        "/api/chat/messages/msg_react_2/react",
        json={"emoji": "🥰"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_change.status_code == 200
    reactions = res_change.json()["reactions"]
    assert reactions == {"u1": "🥰", "u2": "🔥"}

    # 2. Alice deletes her reaction
    res_del = await client.delete(
        "/api/chat/messages/msg_react_2/react",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_del.status_code == 200
    reactions_after_del = res_del.json()["reactions"]
    # Alice's reaction is removed, Bob's 🔥 is preserved
    assert "u1" not in reactions_after_del
    assert reactions_after_del.get("u2") == "🔥"


@pytest.mark.asyncio
async def test_cross_space_reaction_rejected(test_env):
    """Test that a stranger from another space cannot react to or rewrite space for a message."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        # Space A: Alice & Bob
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space_a")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space_a")
        space_a = CoupleSpace(id="space_a", user1_id="u1", user2_id="u2")
        msg_a = Message(
            id="msg_space_a",
            couple_space_id="space_a",
            sender_id="u1",
            text=encrypt_data("Alice secret"),
            message_type="text",
            reactions={},
            timestamp=datetime.utcnow()
        )

        # Space B: Charlie & Eve
        u3 = User(id="u3", name="Charlie", email="charlie@test.com", password="hash", partner_id="u4", couple_space_id="space_b")
        u4 = User(id="u4", name="Eve", email="eve@test.com", password="hash", partner_id="u3", couple_space_id="space_b")
        space_b = CoupleSpace(id="space_b", user1_id="u3", user2_id="u4")

        session.add_all([u1, u2, space_a, msg_a, u3, u4, space_b])
        await session.commit()

    token_charlie = create_access_token({"sub": "u3"})

    # Charlie attempts to react to Alice's message in space_a
    res = await client.post(
        "/api/chat/messages/msg_space_a/react",
        json={"emoji": "😈"},
        headers={"Authorization": f"Bearer {token_charlie}"}
    )
    # Must be rejected with 404 Not Found
    assert res.status_code == 404
    assert "Message not found in your couple space" in res.json()["detail"]

    # Charlie attempts to delete reaction on space_a message
    res_del = await client.delete(
        "/api/chat/messages/msg_space_a/react",
        headers={"Authorization": f"Bearer {token_charlie}"}
    )
    assert res_del.status_code == 404

    # Verify that the message in DB has NOT been altered (couple_space_id remains space_a, reactions empty)
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_space_a"))
        persisted = db_res.scalars().first()
        assert persisted.couple_space_id == "space_a"
        from app.api.routes.chat import safe_parse_reactions
        assert safe_parse_reactions(persisted.reactions) == {}


@pytest.mark.asyncio
async def test_simultaneous_concurrent_reactions(test_env):
    """Test simulated concurrent reaction requests from both partners."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2", allow_media_save=True)
        msg = Message(
            id="msg_simultaneous",
            couple_space_id="space1",
            sender_id="u1",
            text=encrypt_data("Concurrency test"),
            message_type="text",
            reactions={},
            timestamp=datetime.utcnow()
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token1 = create_access_token({"sub": "u1"})
    token2 = create_access_token({"sub": "u2"})

    # Launch both requests simultaneously via asyncio.gather
    async def react_alice():
        return await client.post(
            "/api/chat/messages/msg_simultaneous/react",
            json={"emoji": "🎉"},
            headers={"Authorization": f"Bearer {token1}"}
        )

    async def react_bob():
        return await client.post(
            "/api/chat/messages/msg_simultaneous/react",
            json={"emoji": "👏"},
            headers={"Authorization": f"Bearer {token2}"}
        )

    res_alice, res_bob = await asyncio.gather(react_alice(), react_bob())
    assert res_alice.status_code == 200
    assert res_bob.status_code == 200

    # Final database state must contain both reactions
    async with session_factory() as session:
        db_res = await session.execute(select(Message).filter(Message.id == "msg_simultaneous"))
        persisted = db_res.scalars().first()
        from app.api.routes.chat import safe_parse_reactions
        final_reactions = safe_parse_reactions(persisted.reactions)
        assert final_reactions.get("u1") == "🎉"
        assert final_reactions.get("u2") == "👏"
