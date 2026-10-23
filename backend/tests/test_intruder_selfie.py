import pytest
import pytest_asyncio
import tempfile
import os
import io
import hashlib
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, IntruderLog, Notification
from app.core.security import hash_password, create_access_token
from app.core.config import settings


@pytest_asyncio.fixture
async def test_env():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

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
async def test_3_wrong_pins_trigger_intruder_selfie(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Seed user with PIN "4321"
    async with session_factory() as session:
        u = User(
            id="u_pin_fail",
            name="Diana",
            email="diana@test.com",
            password=hash_password("Password123!"),
            app_pin=hashlib.sha256("4321".encode()).hexdigest(),
            pin_failed_attempts=0,
            intruder_trigger=False
        )
        session.add(u)
        await session.commit()

    token = create_access_token({"sub": "u_pin_fail"})
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt 1: wrong PIN
    r1 = await client.post("/api/security/pin/verify", json={"pin": "0000"}, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["status"] == "wrong"
    assert r1.json()["attempts_left"] == 2
    assert "trigger_selfie" not in r1.json()

    # Attempt 2: wrong PIN
    r2 = await client.post("/api/security/pin/verify", json={"pin": "1111"}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "wrong"
    assert r2.json()["attempts_left"] == 1
    assert "trigger_selfie" not in r2.json()

    # Attempt 3: wrong PIN triggers selfie
    r3 = await client.post("/api/security/pin/verify", json={"pin": "2222"}, headers=headers)
    assert r3.status_code == 200
    data3 = r3.json()
    assert data3["status"] == "wrong"
    assert data3.get("trigger_selfie") is True

    # Database flag check
    async with session_factory() as session:
        db_u = (await session.execute(select(User).filter(User.id == "u_pin_fail"))).scalars().first()
        assert db_u.intruder_trigger is True
        assert db_u.pin_failed_attempts == 0


@pytest.mark.asyncio
async def test_intruder_selfie_upload_notification_and_logs(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Seed Alice and Bob as partners
    async with session_factory() as session:
        alice = User(
            id="u_alice",
            name="Alice",
            email="alice@test.com",
            password=hash_password("Pass123!"),
            partner_id="u_bob",
            couple_space_id="space_ab"
        )
        bob = User(
            id="u_bob",
            name="Bob",
            email="bob@test.com",
            password=hash_password("Pass123!"),
            partner_id="u_alice",
            couple_space_id="space_ab"
        )
        session.add_all([alice, bob])
        await session.commit()

    token_alice = create_access_token({"sub": "u_alice"})
    headers_alice = {"Authorization": f"Bearer {token_alice}"}
    token_bob = create_access_token({"sub": "u_bob"})
    headers_bob = {"Authorization": f"Bearer {token_bob}"}

    # Alice uploads an intruder selfie
    dummy_image = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00"
    files = {"file": ("intruder.jpg", io.BytesIO(dummy_image), "image/jpeg")}
    
    res_upload = await client.post("/api/security/intruder/upload", files=files, headers=headers_alice)
    assert res_upload.status_code == 200
    upload_data = res_upload.json()
    assert upload_data["status"] == "ok"
    assert "/api/security/intruder/photo/" in upload_data["photo_url"]
    filename = upload_data["photo_url"].split("/")[-1]

    # Verify physical file was written to disk
    photo_path = os.path.join(settings.MEDIA_DIR, "intruder", filename)
    assert os.path.exists(photo_path)
    with open(photo_path, "rb") as f:
        assert f.read() == dummy_image

    # Verify notification created for Bob (the partner)
    async with session_factory() as session:
        notif = (await session.execute(
            select(Notification).filter(Notification.user_id == "u_bob", Notification.type == "intruder_alert")
        )).scalars().first()
        assert notif is not None
        assert "Intruder Alert" in notif.title
        assert "Alice" in notif.body
        assert notif.data["filename"] == filename

    # Verify photo retrieval endpoint
    res_photo = await client.get(f"/api/security/intruder/photo/{filename}")
    assert res_photo.status_code == 200
    assert res_photo.content == dummy_image

    # Non-existent photo returns 404
    res_404 = await client.get("/api/security/intruder/photo/does_not_exist.jpg")
    assert res_404.status_code == 404

    # Verify GET /api/security/intruder/logs for Alice
    res_logs_alice = await client.get("/api/security/intruder/logs", headers=headers_alice)
    assert res_logs_alice.status_code == 200
    logs_a = res_logs_alice.json()
    assert len(logs_a) >= 1
    assert logs_a[0]["filename"] == filename
    log_id = logs_a[0]["id"]

    # Verify GET /api/security/intruder/logs for Bob (partner sees it too)
    res_logs_bob = await client.get("/api/security/intruder/logs", headers=headers_bob)
    assert res_logs_bob.status_code == 200
    logs_b = res_logs_bob.json()
    assert len(logs_b) >= 1
    assert any(l["id"] == log_id for l in logs_b)

    # Test deleting the log
    res_del = await client.delete(f"/api/security/intruder/logs/{log_id}", headers=headers_alice)
    assert res_del.status_code == 200
    assert res_del.json()["ok"] is True

    # Verify log is removed from DB
    async with session_factory() as session:
        db_log = (await session.execute(select(IntruderLog).filter(IntruderLog.id == log_id))).scalars().first()
        assert db_log is None

    # Verify file is deleted from disk
    assert not os.path.exists(photo_path)

    # Attempting to delete non-existent log returns 404
    res_del_404 = await client.delete(f"/api/security/intruder/logs/{log_id}", headers=headers_alice)
    assert res_del_404.status_code == 404
