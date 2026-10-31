import pytest
import pytest_asyncio
import tempfile
import os
from datetime import datetime
from contextlib import asynccontextmanager
import httpx
from starlette.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select
from unittest.mock import patch

from app.core.database import Base, get_db
import app.main as main_module
import app.websocket.handler as ws_handler
from app.models.orm import User, CoupleSpace, Message
from app.websocket.manager import manager
from app.core.security import create_access_token
from app.core.encryption import encrypt_data, decrypt_data


@pytest.fixture
def chat_delivery_env():
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

    async def override_get_db():
        async with TestSession() as session:
            yield session

    main_module.app.dependency_overrides[get_db] = override_get_db

    async def seed():
        async with TestSession() as session:
            u1 = User(id="u_alice", name="Alice", email="alice@test.com", password="hash", partner_id="u_bob", couple_space_id="space_ab")
            u2 = User(id="u_bob", name="Bob", email="bob@test.com", password="hash", partner_id="u_alice", couple_space_id="space_ab")
            space = CoupleSpace(id="space_ab", user1_id="u_alice", user2_id="u_bob", allow_media_save=True)
            session.add_all([u1, u2, space])
            await session.commit()

    asyncio.run(seed())

    token_alice = create_access_token({"sub": "u_alice"})
    token_bob = create_access_token({"sub": "u_bob"})

    @asynccontextmanager
    async def mock_lifespan(app):
        yield
    main_module.app.router.lifespan_context = mock_lifespan

    yield {
        "session_factory": TestSession,
        "token_alice": token_alice,
        "token_bob": token_bob,
        "engine": engine,
        "db_path": db_path
    }

    main_module.app.dependency_overrides.clear()
    asyncio.run(engine.dispose())
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


def test_successful_commit_happens_before_partner_broadcast(chat_delivery_env):
    """Verify message is successfully committed to the database before partner broadcast."""
    token_alice = chat_delivery_env["token_alice"]
    token_bob = chat_delivery_env["token_bob"]
    session_factory = chat_delivery_env["session_factory"]

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws_bob:
            ws_bob.send_json({"type": "auth", "token": token_bob})

            with client.websocket_connect("/ws") as ws_alice:
                ws_alice.send_json({"type": "auth", "token": token_alice})

                # Clear initial presence broadcasts
                # Alice sends chat_message
                temp_id = "temp_msg_001"
                ws_alice.send_json({
                    "type": "chat_message",
                    "text": "Hello Bob from Alice",
                    "temp_id": temp_id
                })

                # Bob receives broadcast
                bob_received = None
                while True:
                    evt = ws_bob.receive_json()
                    if evt.get("type") == "chat_message":
                        bob_received = evt
                        break

                assert bob_received is not None
                assert bob_received["temp_id"] == temp_id
                assert bob_received["sender_id"] == "u_alice"
                assert bob_received["text"] == "Hello Bob from Alice"
                msg_id = bob_received["id"]

                # CRITICAL VERIFICATION: The message MUST already be committed in the database!
                import asyncio
                async def verify_db():
                    async with session_factory() as session:
                        res = await session.execute(select(Message).filter(Message.id == msg_id))
                        persisted = res.scalars().first()
                        assert persisted is not None
                        assert persisted.sender_id == "u_alice"
                        assert persisted.couple_space_id == "space_ab"
                        assert decrypt_data(persisted.text) == "Hello Bob from Alice"

                asyncio.run(verify_db())


def test_simulated_db_commit_failure_sends_error_to_sender_no_broadcast(chat_delivery_env):
    """Verify simulated DB commit failure sends chat_message_error to sender and does NOT broadcast to partner."""
    token_alice = chat_delivery_env["token_alice"]
    token_bob = chat_delivery_env["token_bob"]
    session_factory = chat_delivery_env["session_factory"]

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws_alice:
            ws_alice.send_json({"type": "auth", "token": token_alice})

            # Handshake ping/pong ensures auth and resolve_and_sync_space completed successfully
            ws_alice.send_json({"type": "ping"})
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "pong":
                    break

            temp_id = "temp_fail_999"

            # Simulate an asynchronous database commit failure strictly for message persistence
            async def mock_commit_failure(*args, **kwargs):
                raise RuntimeError("Simulated disk I/O failure")

            with patch.object(AsyncSession, "commit", side_effect=mock_commit_failure):
                ws_alice.send_json({
                    "type": "chat_message",
                    "text": "Ghost message that fails commit",
                    "temp_id": temp_id
                })

                evt = ws_alice.receive_json()
                assert evt.get("type") == "chat_message_error"
                assert evt.get("temp_id") == temp_id
                assert "failed" in evt.get("message", "").lower()

        # Verify Bob receives NO chat_message event
        with client.websocket_connect("/ws") as ws_bob:
            ws_bob.send_json({"type": "auth", "token": token_bob})
            ws_bob.send_json({"type": "ping"})
            bob_got_chat = False
            while True:
                evt = ws_bob.receive_json()
                if evt.get("type") == "chat_message":
                    bob_got_chat = True
                    break
                elif evt.get("type") == "pong":
                    break

            assert not bob_got_chat, "Bob received a broadcast for a message that failed DB commit!"

        # Verify nothing was persisted to database
        import asyncio
        async def check_empty():
            async with session_factory() as session:
                res = await session.execute(select(Message).filter(Message.couple_space_id == "space_ab"))
                all_msgs = res.scalars().all()
                assert len(all_msgs) == 0

        asyncio.run(check_empty())


def test_websocket_and_rest_fallback_deduplication(chat_delivery_env):
    """Verify that concurrent or repeated sends with the same temp_id do not create duplicate messages."""
    token_alice = chat_delivery_env["token_alice"]
    session_factory = chat_delivery_env["session_factory"]
    temp_id = "temp_race_12345"

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws_alice:
            ws_alice.send_json({"type": "auth", "token": token_alice})

            # Send via WebSocket
            ws_alice.send_json({
                "type": "chat_message",
                "text": "Message with potential REST fallback race",
                "temp_id": temp_id
            })

            # Read confirmation
            ws_msg = None
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "chat_message":
                    ws_msg = evt
                    break

            assert ws_msg is not None
            assert ws_msg["temp_id"] == temp_id
            permanent_id = ws_msg["id"]

            # Now simulate REST fallback firing with the same temp_id
            res = client.post(
                "/api/chat/messages",
                json={
                    "text": "Message with potential REST fallback race",
                    "temp_id": temp_id,
                    "message_type": "text"
                },
                headers={"Authorization": f"Bearer {token_alice}"}
            )
            assert res.status_code == 200
            rest_data = res.json()
            assert rest_data["id"] == permanent_id
            assert rest_data["temp_id"] == temp_id

            # Verify only ONE message exists in the database
            import asyncio
            async def verify_single_record():
                async with session_factory() as session:
                    res = await session.execute(select(Message).filter(Message.couple_space_id == "space_ab"))
                    msgs = res.scalars().all()
                    assert len(msgs) == 1
                    assert msgs[0].id == permanent_id

            asyncio.run(verify_single_record())


def test_rest_fallback_persists_first_then_ws_reconnect_deduplicates_via_db(chat_delivery_env):
    """Verify that when REST persists first and memory cache is evicted, WS reconnect flushes deduplicate via DB."""
    token_alice = chat_delivery_env["token_alice"]
    session_factory = chat_delivery_env["session_factory"]
    temp_id = "temp_rest_first_998877"

    with TestClient(main_module.app) as client:
        # Step 1: Send via REST fallback first
        res = client.post(
            "/api/chat/messages",
            json={
                "text": "Message saved via REST while offline",
                "temp_id": temp_id,
                "message_type": "text"
            },
            headers={"Authorization": f"Bearer {token_alice}"}
        )
        assert res.status_code == 200
        rest_msg = res.json()
        assert rest_msg["temp_id"] == temp_id
        permanent_id = rest_msg["id"]

        # Step 2: Clear in-memory cache to simulate worker reboot or cache TTL expiry
        manager.processed_temp_ids.clear()

        # Step 3: WebSocket connects and flushes queued message with identical temp_id
        with client.websocket_connect("/ws") as ws_alice:
            ws_alice.send_json({"type": "auth", "token": token_alice})
            ws_alice.send_json({"type": "ping"})
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "pong":
                    break

            # Flush queued message over WS
            ws_alice.send_json({
                "type": "chat_message",
                "text": "Message saved via REST while offline",
                "temp_id": temp_id
            })

            # Read response
            ws_res = None
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "chat_message":
                    ws_res = evt
                    break

            assert ws_res is not None
            assert ws_res["id"] == permanent_id
            assert ws_res["temp_id"] == temp_id

        # Step 4: Verify strictly one row exists in database with temp_id
        import asyncio
        async def check_db_single():
            async with session_factory() as session:
                res = await session.execute(select(Message).filter(Message.couple_space_id == "space_ab", Message.temp_id == temp_id))
                rows = res.scalars().all()
                assert len(rows) == 1
                assert rows[0].id == permanent_id
                assert rows[0].temp_id == temp_id

        asyncio.run(check_db_single())


def test_voice_note_delivery_and_database_persistence_with_temp_id(chat_delivery_env):
    """Verify CHAT-004 voice-note persistence with temp_id and idempotency across WS and REST."""
    token_alice = chat_delivery_env["token_alice"]
    session_factory = chat_delivery_env["session_factory"]
    temp_id = "temp_voice_note_abc123"

    with TestClient(main_module.app) as client:
        with client.websocket_connect("/ws") as ws_alice:
            ws_alice.send_json({"type": "auth", "token": token_alice})
            ws_alice.send_json({"type": "ping"})
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "pong":
                    break

            # Send voice note
            ws_alice.send_json({
                "type": "chat_message",
                "message_type": "audio",
                "media_url": "/media/voice/sample_whisper.webm",
                "text": "E2EE_KEY:secretvoicekey",
                "temp_id": temp_id
            })

            ws_res = None
            while True:
                evt = ws_alice.receive_json()
                if evt.get("type") == "chat_message":
                    ws_res = evt
                    break

            assert ws_res is not None
            assert ws_res["temp_id"] == temp_id
            assert ws_res["message_type"] == "audio"
            assert ws_res["media_url"] == "/media/voice/sample_whisper.webm"
            msg_id = ws_res["id"]

            # REST request with same temp_id must return the existing voice note without duplicates
            res = client.post(
                "/api/chat/messages",
                json={
                    "text": "E2EE_KEY:secretvoicekey",
                    "media_url": "/media/voice/sample_whisper.webm",
                    "message_type": "audio",
                    "temp_id": temp_id
                },
                headers={"Authorization": f"Bearer {token_alice}"}
            )
            assert res.status_code == 200
            assert res.json()["id"] == msg_id

            # Verify database has exactly 1 Message and 1 VoiceNote whisper
            import asyncio
            from app.models.orm import VoiceNote
            async def verify_voice():
                async with session_factory() as session:
                    m_res = await session.execute(select(Message).filter(Message.couple_space_id == "space_ab", Message.temp_id == temp_id))
                    msgs = m_res.scalars().all()
                    assert len(msgs) == 1
                    assert msgs[0].id == msg_id
                    assert msgs[0].temp_id == temp_id

                    vn_res = await session.execute(select(VoiceNote).filter(VoiceNote.couple_space_id == "space_ab", VoiceNote.url == "/media/voice/sample_whisper.webm"))
                    vns = vn_res.scalars().all()
                    assert len(vns) == 1

            asyncio.run(verify_voice())

