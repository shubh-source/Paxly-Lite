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
from app.models.orm import User, Note, Notification, Anniversary
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
async def test_love_note_timer_expiry_notifications_and_gift(test_env):
    """
    Tests that:
    1. When love note timer finishes, notification goes to user (author) saying
       'Aaj aapka love note open hoga' and to partner with 'Something Special For You 🎁'.
    2. Partner detects pending gift on app open.
    3. Partner unboxes note, marking it opened.
    """
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_sender", name="Aarav", email="aarav@test.com", password="hash", partner_id="u_receiver", couple_space_id="space_couple")
        u2 = User(id="u_receiver", name="Priya", email="priya@test.com", password="hash", partner_id="u_sender", couple_space_id="space_couple")
        session.add_all([u1, u2])
        await session.commit()

    token1 = create_access_token({"sub": "u_sender"})
    token2 = create_access_token({"sub": "u_receiver"})

    # Sender creates a time capsule love note that unlocks in 1 second
    future_unlock = (datetime.utcnow() + timedelta(seconds=1)).isoformat()
    res_create = await client.post(
        "/api/notes/",
        json={
            "title": "❤️",
            "content": "My heartbeat belongs to you forever.",
            "unlock_at": future_unlock,
            "share_with_partner": True
        },
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_create.status_code == 200
    created_id = res_create.json()["id"]

    # Before timer expiration, receiver should NOT have pending gift
    res_gift_before = await client.get("/api/notes/pending-gift", headers={"Authorization": f"Bearer {token2}"})
    assert res_gift_before.status_code == 200
    assert res_gift_before.json()["has_gift"] is False

    # Wait for the 1-second timer to expire
    import asyncio
    await asyncio.sleep(1.2)

    # Receiver checks pending gift (simulating app open)
    res_gift = await client.get("/api/notes/pending-gift", headers={"Authorization": f"Bearer {token2}"})
    assert res_gift.status_code == 200
    gift_data = res_gift.json()
    assert gift_data["has_gift"] is True
    assert gift_data["note"]["id"] == created_id
    assert gift_data["note"]["content"] == "My heartbeat belongs to you forever."
    assert gift_data["note"]["sender_name"] == "Aarav"

    # Verify both notifications were generated:
    # 1. Author got notification with "Aaj aapka love note open hoga"
    # 2. Partner got notification with "Something Special For You"
    async with session_factory() as session:
        sender_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "u_sender")
        )).scalars().all()
        assert any("Aaj aapka love note open hoga" in n.body for n in sender_notifs)

        partner_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "u_receiver")
        )).scalars().all()
        assert any("Something Special" in n.title for n in partner_notifs)

    # Receiver opens / unboxes the gift
    res_open = await client.post(f"/api/notes/{created_id}/open", headers={"Authorization": f"Bearer {token2}"})
    assert res_open.status_code == 200

    # Next check to pending-gift should be False
    res_gift_after = await client.get("/api/notes/pending-gift", headers={"Authorization": f"Bearer {token2}"})
    assert res_gift_after.status_code == 200
    assert res_gift_after.json()["has_gift"] is False

@pytest.mark.asyncio
async def test_dates_milestone_check_and_notifications(test_env):
    """
    Tests that POST /dates/check-milestones triggers anniversary notification for today.
    """
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    today_str = datetime.utcnow().date().isoformat()
    async with session_factory() as session:
        u1 = User(id="u_d1", name="Dev", email="dev@test.com", password="hash", partner_id="u_d2", couple_space_id="space_d")
        u2 = User(id="u_d2", name="Riya", email="riya@test.com", password="hash", partner_id="u_d1", couple_space_id="space_d")
        session.add_all([u1, u2])

        ann = Anniversary(couple_space_id="space_d", title="Proposal Day", date=today_str, type="proposal")
        session.add(ann)
        await session.commit()

    token1 = create_access_token({"sub": "u_d1"})
    token2 = create_access_token({"sub": "u_d2"})

    res_check = await client.post("/api/dates/check-milestones", headers={"Authorization": f"Bearer {token1}"})
    assert res_check.status_code == 200
    assert res_check.json()["ok"] is True

    # Both user and partner receive milestone notification for today
    async with session_factory() as session:
        notifs_u1 = (await session.execute(
            select(Notification).filter(Notification.user_id == "u_d1", Notification.type == "anniversary_reminder")
        )).scalars().all()
        assert len(notifs_u1) >= 1
        assert "Happy Proposal Day!" in notifs_u1[0].title

        notifs_u2 = (await session.execute(
            select(Notification).filter(Notification.user_id == "u_d2", Notification.type == "anniversary_reminder")
        )).scalars().all()
        assert len(notifs_u2) >= 1
        assert "Happy Proposal Day!" in notifs_u2[0].title
