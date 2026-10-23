import pytest
import pytest_asyncio
import tempfile
import os
import hashlib
from datetime import datetime
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, Anniversary
from app.core.security import hash_password, create_access_token


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
async def test_set_and_verify_pin_lifecycle(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Seed user
    async with session_factory() as session:
        u = User(
            id="u_pin_1",
            name="Alice",
            email="alice_pin@test.com",
            password=hash_password("MyAccountPassword123!"),
            couple_space_id="space_pin_1"
        )
        session.add(u)
        await session.commit()

    token = create_access_token({"sub": "u_pin_1"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Set PIN to 1234
    res_set = await client.post("/api/security/pin/set", json={"pin": "1234"}, headers=headers)
    assert res_set.status_code == 200
    assert res_set.json()["status"] == "ok"

    # Verify PIN hash stored in database
    async with session_factory() as session:
        db_u = (await session.execute(select(User).filter(User.id == "u_pin_1"))).scalars().first()
        assert db_u.app_pin == hashlib.sha256("1234".encode()).hexdigest()

    # 2. Verify with correct PIN
    res_verify_ok = await client.post("/api/security/pin/verify", json={"pin": "1234"}, headers=headers)
    assert res_verify_ok.status_code == 200
    assert res_verify_ok.json()["status"] == "ok"

    # 3. Verify with wrong PIN
    res_verify_wrong = await client.post("/api/security/pin/verify", json={"pin": "9999"}, headers=headers)
    assert res_verify_wrong.status_code == 200
    assert res_verify_wrong.json()["status"] == "wrong"
    assert res_verify_wrong.json()["attempts_left"] == 2


@pytest.mark.asyncio
async def test_verify_pin_reset_with_password(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        u = User(
            id="u_pin_pwd",
            name="Bob",
            email="bob_pin@test.com",
            password=hash_password("SecretAccountPassword99!"),
            app_pin=hashlib.sha256("5555".encode()).hexdigest(),
            pin_failed_attempts=2,
            intruder_trigger=True,
            couple_space_id="space_pin_pwd"
        )
        session.add(u)
        await session.commit()

    token = create_access_token({"sub": "u_pin_pwd"})
    headers = {"Authorization": f"Bearer {token}"}

    # Wrong password fails
    res_wrong_pwd = await client.post("/api/security/pin/verify-reset", json={
        "method": "password",
        "password": "WrongPassword!"
    }, headers=headers)
    assert res_wrong_pwd.status_code == 400
    assert "Incorrect account password" in res_wrong_pwd.json()["detail"]

    # Correct password succeeds and resets failed attempts / intruder trigger
    res_ok_pwd = await client.post("/api/security/pin/verify-reset", json={
        "method": "password",
        "password": "SecretAccountPassword99!"
    }, headers=headers)
    assert res_ok_pwd.status_code == 200
    assert res_ok_pwd.json()["status"] == "ok"

    async with session_factory() as session:
        db_u = (await session.execute(select(User).filter(User.id == "u_pin_pwd"))).scalars().first()
        assert db_u.pin_failed_attempts == 0
        assert db_u.intruder_trigger is False


@pytest.mark.asyncio
async def test_verify_pin_reset_with_anniversary_date(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        u = User(
            id="u_pin_ann",
            name="Charlie",
            email="charlie_pin@test.com",
            password=hash_password("AnyPassword123!"),
            app_pin=hashlib.sha256("1111".encode()).hexdigest(),
            couple_space_id="space_ann_test"
        )
        ann = Anniversary(
            couple_space_id="space_ann_test",
            title="Our Special Day",
            date="2023-06-15",
            type="anniversary"
        )
        session.add_all([u, ann])
        await session.commit()

    token = create_access_token({"sub": "u_pin_ann"})
    headers = {"Authorization": f"Bearer {token}"}

    # Wrong anniversary date
    res_wrong_date = await client.post("/api/security/pin/verify-reset", json={
        "method": "anniversary",
        "date": "2023-01-01"
    }, headers=headers)
    assert res_wrong_date.status_code == 400
    assert "Incorrect anniversary date" in res_wrong_date.json()["detail"]

    # Correct anniversary date
    res_ok_date = await client.post("/api/security/pin/verify-reset", json={
        "method": "anniversary",
        "date": "2023-06-15"
    }, headers=headers)
    assert res_ok_date.status_code == 200
    assert res_ok_date.json()["status"] == "ok"
