import pytest
import pytest_asyncio
import tempfile
import os
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, PasswordResetToken
from app.core.security import hash_password, verify_password


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
async def test_forgot_password_unregistered_email(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Security: should return success message without revealing email doesn't exist
    res = await client.post("/api/auth/forgot-password", json={"email": "nonexistent@test.com"})
    assert res.status_code == 200
    assert "recovery link has been sent" in res.json()["message"]

    # No token should be created
    async with session_factory() as session:
        tokens = await session.execute(select(PasswordResetToken))
        assert len(tokens.scalars().all()) == 0


@pytest.mark.asyncio
async def test_forgot_and_reset_password_full_cycle(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Seed user
    async with session_factory() as session:
        u = User(
            id="u_pwd_1",
            name="Alice",
            email="alice_reset@test.com",
            password=hash_password("OldPassword123"),
            couple_space_id="space_pwd_1"
        )
        session.add(u)
        await session.commit()

    # Step 1: Request recovery
    res_forgot = await client.post("/api/auth/forgot-password", json={"email": "alice_reset@test.com"})
    assert res_forgot.status_code == 200
    assert "Recovery link sent" in res_forgot.json()["message"]

    # Retrieve generated token from DB
    async with session_factory() as session:
        tokens_res = await session.execute(select(PasswordResetToken).filter(PasswordResetToken.user_id == "u_pwd_1"))
        token_obj = tokens_res.scalars().first()
        assert token_obj is not None
        assert token_obj.token is not None
        assert token_obj.expires_at > datetime.utcnow()
        reset_token = token_obj.token

    # Step 2: Reset password using the token
    res_reset = await client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewSecretPassword789!"
    })
    assert res_reset.status_code == 200
    assert "Password updated successfully" in res_reset.json()["message"]

    # Verify token was consumed/deleted
    async with session_factory() as session:
        consumed_res = await session.execute(select(PasswordResetToken).filter(PasswordResetToken.token == reset_token))
        assert consumed_res.scalars().first() is None

    # Step 3: Verify old password fails to login
    res_login_old = await client.post("/api/auth/login", json={
        "email": "alice_reset@test.com",
        "password": "OldPassword123"
    })
    assert res_login_old.status_code == 401

    # Step 4: Verify new password successfully logs in
    res_login_new = await client.post("/api/auth/login", json={
        "email": "alice_reset@test.com",
        "password": "NewSecretPassword789!"
    })
    assert res_login_new.status_code == 200
    body = res_login_new.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_reset_password_expired_token(test_env):
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Seed user with expired token
    async with session_factory() as session:
        u = User(
            id="u_pwd_exp",
            name="Bob",
            email="bob_exp@test.com",
            password=hash_password("OldPassword123"),
            couple_space_id="space_pwd_exp"
        )
        t_exp = PasswordResetToken(
            user_id="u_pwd_exp",
            token="expired_token_abc",
            expires_at=datetime.utcnow() - timedelta(minutes=5)
        )
        session.add_all([u, t_exp])
        await session.commit()

    res = await client.post("/api/auth/reset-password", json={
        "token": "expired_token_abc",
        "new_password": "AnotherNewPassword!"
    })
    assert res.status_code == 400
    assert "Invalid or expired recovery token" in res.json()["detail"]


@pytest.mark.asyncio
async def test_reset_password_invalid_token(test_env):
    client = test_env["client"]

    res = await client.post("/api/auth/reset-password", json={
        "token": "completely_fake_token",
        "new_password": "AnotherNewPassword!"
    })
    assert res.status_code == 400
    assert "Invalid or expired recovery token" in res.json()["detail"]
