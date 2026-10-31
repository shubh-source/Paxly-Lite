import pytest
import pytest_asyncio
import tempfile
import os
import shutil
from datetime import datetime, timezone
import httpx
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
import app.websocket.handler as ws_handler
from app.models.orm import User, CoupleSpace, Message, Memory, MediaCleanupQueue
from app.core.security import create_access_token
from app.core.encryption import encrypt_data
from app.core.config import settings
from app.core.media_lifecycle import retry_failed_cleanups


@pytest_asyncio.fixture
async def lifecycle_env():
    # Dedicated temp database
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    # Dedicated temp media directory
    temp_media_dir = tempfile.mkdtemp(prefix="test_lifecycle_media_")
    old_media_dir = settings.MEDIA_DIR
    settings.MEDIA_DIR = temp_media_dir

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

    transport = httpx.ASGITransport(app=main_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield {
            "session_factory": TestSession,
            "client": client,
            "engine": engine,
            "db_path": db_path,
            "media_dir": temp_media_dir
        }

    main_module.app.dependency_overrides.clear()
    await engine.dispose()
    settings.MEDIA_DIR = old_media_dir

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass

    if os.path.exists(temp_media_dir):
        shutil.rmtree(temp_media_dir, ignore_errors=True)


@pytest.mark.asyncio
async def test_delete_for_everyone_removes_unshared_media(lifecycle_env):
    """Delete for everyone removes message from DB and deletes unshared media from disk."""
    client = lifecycle_env["client"]
    session_factory = lifecycle_env["session_factory"]
    media_dir = lifecycle_env["media_dir"]

    # 1. Seed space and message with media
    filename = "space1_photo_delete_everyone.jpg"
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, filename)
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"image_payload_xyz")

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2")
        msg = Message(
            id="msg_del_1",
            couple_space_id="space1",
            sender_id="u1",
            text="Check out this photo",
            media_url=f"/media/chat/{filename}",
            message_type="image",
            timestamp=datetime.now(timezone.utc)
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token_alice = create_access_token({"sub": "u1"})

    # 2. Before deletion, Alice can access the file
    res_before = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert res_before.status_code == 200
    assert os.path.exists(file_path)

    # 3. Alice deletes message for everyone
    del_res = await client.delete(
        "/api/chat/messages/msg_del_1?for_everyone=true",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert del_res.status_code == 200

    # 4. Message must be deleted from DB
    async with session_factory() as session:
        msg_in_db = await session.get(Message, "msg_del_1")
        assert msg_in_db is None

    # 5. Media file must be deleted from physical storage
    assert not os.path.exists(file_path)

    # 6. Subsequent media access must return 404
    res_after = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert res_after.status_code == 404


@pytest.mark.asyncio
async def test_delete_for_me_preserves_partner_media_access(lifecycle_env):
    """Delete for me hides media from caller but preserves it for partner; purges when both delete."""
    client = lifecycle_env["client"]
    session_factory = lifecycle_env["session_factory"]
    media_dir = lifecycle_env["media_dir"]

    filename = "space1_photo_delete_forme.jpg"
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, filename)
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"partner_shared_photo")

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2")
        msg = Message(
            id="msg_del_forme",
            couple_space_id="space1",
            sender_id="u1",
            text="Shared moment",
            media_url=f"/media/chat/{filename}",
            message_type="image",
            timestamp=datetime.now(timezone.utc)
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token_alice = create_access_token({"sub": "u1"})
    token_bob = create_access_token({"sub": "u2"})

    # 1. Alice deletes for me only
    del_res = await client.delete(
        "/api/chat/messages/msg_del_forme?for_everyone=false",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert del_res.status_code == 200

    # 2. File must still exist on disk because Bob still has it
    assert os.path.exists(file_path)

    # 3. Alice gets 404 (deleted for her)
    res_alice = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert res_alice.status_code == 404

    # 4. Bob still gets 200 OK (accessible for partner)
    res_bob = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert res_bob.status_code == 200

    # 5. Bob now also deletes for me
    del_bob_res = await client.delete(
        "/api/chat/messages/msg_del_forme?for_everyone=false",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert del_bob_res.status_code == 200

    # 6. Both partners deleted -> message purged and file deleted from storage
    async with session_factory() as session:
        assert await session.get(Message, "msg_del_forme") is None
    assert not os.path.exists(file_path)


@pytest.mark.asyncio
async def test_shared_referenced_media_not_accidentally_deleted(lifecycle_env):
    """Media referenced by another message or saved memory is not deleted when one message is deleted."""
    client = lifecycle_env["client"]
    session_factory = lifecycle_env["session_factory"]
    media_dir = lifecycle_env["media_dir"]

    filename = "space1_shared_vault_photo.jpg"
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, filename)
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"memory_vault_photo_data")

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2")
        msg1 = Message(
            id="msg_shared_1",
            couple_space_id="space1",
            sender_id="u1",
            text="First message with photo",
            media_url=f"/media/chat/{filename}",
            message_type="image",
            timestamp=datetime.now(timezone.utc)
        )
        # Saved in Memory Vault referencing the same photo
        mem = Memory(
            id="mem_saved_1",
            couple_space_id="space1",
            title="Saved Vault Memory",
            image_url=f"/media/chat/{filename}",
            created_by="u2",
            date="2026-10-29",
            created_at=datetime.now(timezone.utc)
        )
        session.add_all([u1, u2, space, msg1, mem])
        await session.commit()

    token_alice = create_access_token({"sub": "u1"})

    # Alice deletes message 1 for everyone
    del_res = await client.delete(
        "/api/chat/messages/msg_shared_1?for_everyone=true",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert del_res.status_code == 200

    # Message 1 deleted
    async with session_factory() as session:
        assert await session.get(Message, "msg_shared_1") is None

    # Crucial: Physical file remains on disk because Memory Vault references it!
    assert os.path.exists(file_path)

    # Bob can still access the memory image
    token_bob = create_access_token({"sub": "u2"})
    res_mem = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert res_mem.status_code == 200


@pytest.mark.asyncio
async def test_storage_failure_recorded_in_queue_and_safely_retried(lifecycle_env):
    """Storage deletion failures are recorded in MediaCleanupQueue and retried safely."""
    client = lifecycle_env["client"]
    session_factory = lifecycle_env["session_factory"]
    media_dir = lifecycle_env["media_dir"]

    filename = "space1_photo_retry_test.jpg"
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, filename)
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"retry_test_data")

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2")
        msg = Message(
            id="msg_retry_1",
            couple_space_id="space1",
            sender_id="u1",
            text="To be retried",
            media_url=f"/media/chat/{filename}",
            message_type="image",
            timestamp=datetime.now(timezone.utc)
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token_alice = create_access_token({"sub": "u1"})

    # Simulate storage error on delete_file
    from app.core.storage import storage
    with patch.object(storage, "delete_file", side_effect=IOError("Storage disk temporarily unavailable")):
        del_res = await client.delete(
            "/api/chat/messages/msg_retry_1?for_everyone=true",
            headers={"Authorization": f"Bearer {token_alice}"}
        )
        assert del_res.status_code == 200

    # Message deleted from DB
    async with session_factory() as session:
        assert await session.get(Message, "msg_retry_1") is None
        # Queue record must exist with status='failed' and recorded error
        q_res = await session.execute(
            select(MediaCleanupQueue).filter(MediaCleanupQueue.filename == filename)
        )
        queue_job = q_res.scalars().first()
        assert queue_job is not None
        assert queue_job.status == "failed"
        assert queue_job.attempts >= 1
        assert "Storage disk temporarily unavailable" in queue_job.last_error

    # Now simulate recovery and run retry_failed_cleanups
    async with session_factory() as session:
        cleaned = await retry_failed_cleanups(session)
        assert cleaned == 1

        # Check job updated to completed
        q_res_after = await session.execute(
            select(MediaCleanupQueue).filter(MediaCleanupQueue.filename == filename)
        )
        job_after = q_res_after.scalars().first()
        assert job_after.status == "completed"

    # File is now deleted
    assert not os.path.exists(file_path)


@pytest.mark.asyncio
async def test_view_once_media_deleted_when_consumed(lifecycle_env):
    """View-once message deletes media file and wipes DB content when view limit is reached."""
    client = lifecycle_env["client"]
    session_factory = lifecycle_env["session_factory"]
    media_dir = lifecycle_env["media_dir"]

    filename = "space1_photo_view_once.jpg"
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, filename)
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"view_once_secret_data")

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", partner_id="u2", couple_space_id="space1")
        u2 = User(id="u2", name="Bob", email="bob@test.com", password="hash", partner_id="u1", couple_space_id="space1")
        space = CoupleSpace(id="space1", user1_id="u1", user2_id="u2")
        msg = Message(
            id="msg_view_once_1",
            couple_space_id="space1",
            sender_id="u1",
            text="Secret photo",
            media_url=f"/media/chat/{filename}",
            message_type="image",
            is_once_view=True,
            view_limit=1,
            views_used=0,
            timestamp=datetime.now(timezone.utc)
        )
        session.add_all([u1, u2, space, msg])
        await session.commit()

    token_bob = create_access_token({"sub": "u2"})

    # Bob views the view-once message
    view_res = await client.post(
        "/api/chat/messages/msg_view_once_1/status",
        json={"action": "view"},
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert view_res.status_code == 200
    assert view_res.json()["views_used"] == 1

    # Verify DB content wiped
    async with session_factory() as session:
        updated_msg = await session.get(Message, "msg_view_once_1")
        assert updated_msg.views_used == 1
        assert updated_msg.media_url is None
        assert updated_msg.text is None

    # Verify physical file deleted from storage
    assert not os.path.exists(file_path)

    # Bob can no longer access the file
    get_res = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert get_res.status_code == 404
