import pytest
import pytest_asyncio
import tempfile
import os
from datetime import datetime
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, CoupleSpace, Message
from app.core.security import create_access_token
from app.core.config import settings

@pytest_asyncio.fixture
async def media_test_env():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    test_media_dir = tempfile.mkdtemp()
    original_media_dir = settings.MEDIA_DIR
    settings.MEDIA_DIR = test_media_dir

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestSession = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    main_module.AsyncSessionLocal = TestSession

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
            "media_dir": test_media_dir
        }

    main_module.app.dependency_overrides.clear()
    settings.MEDIA_DIR = original_media_dir
    await engine.dispose()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_unauthenticated_media_access_rejected_with_401(media_test_env):
    """Unauthenticated users cannot retrieve private chat media."""
    client = media_test_env["client"]
    media_dir = media_test_env["media_dir"]

    # Place a dummy media file in chat folder
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    file_path = os.path.join(chat_dir, "private_photo.jpg")
    with open(file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"\x00" * 100)

    # Request without authentication
    res = await client.get("/media/chat/private_photo.jpg")
    assert res.status_code == 401
    assert "authentication required" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cross_space_media_access_rejected_with_404(media_test_env):
    """Users outside the authorized couple space cannot fetch another couple's media."""
    client = media_test_env["client"]
    session_factory = media_test_env["session_factory"]
    media_dir = media_test_env["media_dir"]

    # Seed Space A (Alice, Bob) and Space B (Charlie, Dana)
    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        u_b1 = User(id="u_b1", name="Charlie", email="charlie@test.com", password="hash", partner_id="u_b2", couple_space_id="space_b")
        u_b2 = User(id="u_b2", name="Dana", email="dana@test.com", password="hash", partner_id="u_b1", couple_space_id="space_b")

        sp_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
        sp_b = CoupleSpace(id="space_b", user1_id="u_b1", user2_id="u_b2")

        session.add_all([u_a1, u_a2, u_b1, u_b2, sp_a, sp_b])
        await session.commit()

    # Place file belonging to Space A
    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    filename = "space_a_secret.jpg"
    with open(os.path.join(chat_dir, filename), "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"\x00" * 100)

    token_charlie = create_access_token({"sub": "u_b1"})

    # Charlie (Space B) attempts to access Space A file
    res = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_charlie}"}
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_authorized_couple_space_media_access_succeeds(media_test_env):
    """Authorized partners can fetch media with Bearer header or query token."""
    client = media_test_env["client"]
    session_factory = media_test_env["session_factory"]
    media_dir = media_test_env["media_dir"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        sp_a = CoupleSpace(id="space_a", user1_id="u_a1", user2_id="u_a2")
        session.add_all([u_a1, u_a2, sp_a])
        await session.commit()

    chat_dir = os.path.join(media_dir, "chat")
    os.makedirs(chat_dir, exist_ok=True)
    filename = "space_a_photo.jpg"
    content = b"\xff\xd8\xff\xe0" + b"\x12\x34\x56" * 50
    with open(os.path.join(chat_dir, filename), "wb") as f:
        f.write(content)

    token_alice = create_access_token({"sub": "u_a1"})
    token_bob = create_access_token({"sub": "u_a2"})

    # 1. Alice fetches with Bearer header
    res_alice = await client.get(
        f"/media/chat/{filename}",
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    assert res_alice.status_code == 200
    assert res_alice.content == content

    # 2. Bob fetches with query parameter (?token=...)
    res_bob = await client.get(f"/media/chat/{filename}?token={token_bob}")
    assert res_bob.status_code == 200
    assert res_bob.content == content


@pytest.mark.asyncio
async def test_disguised_executable_upload_rejected(media_test_env):
    """Disguised binaries (Windows EXE, Linux ELF, scripts) disguised as media are rejected."""
    client = media_test_env["client"]
    session_factory = media_test_env["session_factory"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", couple_space_id="space1")
        sp = CoupleSpace(id="space1", user1_id="u1")
        session.add_all([u1, sp])
        await session.commit()

    token = create_access_token({"sub": "u1"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Windows PE executable disguised as .jpg
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 100
    res1 = await client.post(
        "/api/chat/upload-media",
        files={"file": ("malware.jpg", fake_exe, "image/jpeg")},
        headers=headers
    )
    assert res1.status_code == 400
    assert "dangerous file signature detected" in res1.json()["detail"].lower()

    # 2. Linux ELF executable disguised as .png
    fake_elf = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 100
    res2 = await client.post(
        "/api/chat/upload-media",
        files={"file": ("exploit.png", fake_elf, "image/png")},
        headers=headers
    )
    assert res2.status_code == 400
    assert "dangerous file signature detected" in res2.json()["detail"].lower()

    # 3. PHP script disguised as .jpg
    fake_php = b"<?php echo 'pwned'; ?>"
    res3 = await client.post(
        "/api/chat/upload-media",
        files={"file": ("shell.jpg", fake_php, "image/jpeg")},
        headers=headers
    )
    assert res3.status_code == 400
    assert "dangerous file signature detected" in res3.json()["detail"].lower()


@pytest.mark.asyncio
async def test_oversized_upload_rejected(media_test_env):
    """Uploads exceeding the byte limit are rejected with HTTP 413."""
    client = media_test_env["client"]
    session_factory = media_test_env["session_factory"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", couple_space_id="space1", is_premium=False)
        sp = CoupleSpace(id="space1", user1_id="u1")
        session.add_all([u1, sp])
        await session.commit()

    token = create_access_token({"sub": "u1"})
    headers = {"Authorization": f"Bearer {token}"}

    # Free limit is 5MB. Send 5.5MB file
    oversized = b"\xff\xd8\xff\xe0" + b"\x00" * (6 * 1024 * 1024)
    res = await client.post(
        "/api/chat/upload-media",
        files={"file": ("large_photo.jpg", oversized, "image/jpeg")},
        headers=headers
    )
    assert res.status_code == 413
    assert "file too large" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_valid_plain_and_encrypted_media_upload(media_test_env):
    """Valid plain images and client-side encrypted blobs are accepted and saved."""
    client = media_test_env["client"]
    session_factory = media_test_env["session_factory"]

    async with session_factory() as session:
        u1 = User(id="u1", name="Alice", email="alice@test.com", password="hash", couple_space_id="space1")
        sp = CoupleSpace(id="space1", user1_id="u1")
        session.add_all([u1, sp])
        await session.commit()

    token = create_access_token({"sub": "u1"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Valid JPEG image
    valid_jpg = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\xaa" * 200
    res_jpg = await client.post(
        "/api/chat/upload-media",
        files={"file": ("vacation.jpg", valid_jpg, "image/jpeg")},
        headers=headers
    )
    assert res_jpg.status_code == 200
    jpg_data = res_jpg.json()
    assert "media_url" in jpg_data
    assert jpg_data["filename"].startswith("space1_")

    # 2. Valid encrypted media blob (24-byte random nonce + ciphertext)
    encrypted_blob = os.urandom(24) + os.urandom(128)
    res_enc = await client.post(
        "/api/chat/upload-media",
        files={"file": ("media.enc", encrypted_blob, "application/octet-stream")},
        headers=headers
    )
    assert res_enc.status_code == 200
    enc_data = res_enc.json()
    assert "media_url" in enc_data
    assert enc_data["filename"].startswith("space1_")
