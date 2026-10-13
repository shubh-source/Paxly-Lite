import pytest
import pytest_asyncio
import tempfile
import os
import json
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from unittest.mock import patch, AsyncMock
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, Message, CoupleSpace, Anniversary, AIChatThread
from app.core.security import create_access_token

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
        }

    main_module.app.dependency_overrides.clear()
    await engine.dispose()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass

@pytest.mark.asyncio
async def test_analytics_enabled_for_non_premium_coupled_user(test_env):
    """Verifies that non-premium coupled users can access analytics with communication balance."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    # Seed users and couple space
    async with session_factory() as session:
        u1 = User(
            id="u_coupled_1",
            name="Rahul",
            email="rahul@example.com",
            password="hash",
            is_premium=False,
            partner_id="u_coupled_2",
            couple_space_id="space_rahul_priya",
        )
        u2 = User(
            id="u_coupled_2",
            name="Priya",
            email="priya@example.com",
            password="hash",
            is_premium=False,
            partner_id="u_coupled_1",
            couple_space_id="space_rahul_priya",
        )
        session.add_all([u1, u2])

        # Seed sample messages in couple space
        now = datetime.utcnow()
        m1 = Message(couple_space_id="space_rahul_priya", sender_id="u_coupled_1", text="Hey Priya!", timestamp=now - timedelta(days=2))
        m2 = Message(couple_space_id="space_rahul_priya", sender_id="u_coupled_2", text="Hey Rahul!", timestamp=now - timedelta(days=1))
        session.add_all([m1, m2])
        await session.commit()

    token = create_access_token({"sub": "u_coupled_1"})

    # Test without external AI: verify fallback calculation works reliably
    res = await client.get("/api/ai/analytics", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "engagement_score" in data
    assert "analysis" in data
    assert "proactive_suggestion" in data
    assert isinstance(data["engagement_score"], int)
    assert data["engagement_score"] >= 50

@pytest.mark.asyncio
async def test_analytics_enabled_for_solo_user(test_env):
    """Verifies that solo users without couple_space_id receive a personal readiness analytics report instead of 400 error."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_solo = User(
            id="u_solo_1",
            name="Aarav",
            email="aarav@example.com",
            password="hash",
            is_premium=False,
            partner_id=None,
            couple_space_id=None,
        )
        session.add(u_solo)
        await session.commit()

    token = create_access_token({"sub": "u_solo_1"})

    res = await client.get("/api/ai/analytics", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "engagement_score" in data
    assert "analysis" in data
    assert "proactive_suggestion" in data
    assert isinstance(data["engagement_score"], int)

@pytest.mark.asyncio
async def test_analytics_markdown_json_parsing(test_env):
    """Verifies that JSON responses wrapped in markdown code blocks are parsed cleanly."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u = User(
            id="u_ai_test",
            name="Karan",
            email="karan@example.com",
            password="hash",
            is_premium=False,
            partner_id=None,
            couple_space_id=None,
        )
        session.add(u)
        await session.commit()

    token = create_access_token({"sub": "u_ai_test"})

    mock_ai_output = """Here is your relationship analytics report:
```json
{
  "engagement_score": 88,
  "analysis": "Great emotional resonance observed.",
  "proactive_suggestion": "Schedule a weekend getaway together."
}
```
Hope this is helpful!"""

    with patch("app.api.routes.ai.generate_ai_text", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_ai_output

        res = await client.get("/api/ai/analytics", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["engagement_score"] == 88
        assert "Great emotional resonance" in data["analysis"]
        assert "weekend getaway" in data["proactive_suggestion"]
