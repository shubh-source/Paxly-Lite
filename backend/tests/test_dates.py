import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.security import get_current_user
from app.core.database import Base, get_db
from app.models.orm import User, Anniversary

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def dates_db_session():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    import app.main as main_module
    main_module.AsyncSessionLocal = session_factory
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


from contextlib import asynccontextmanager

@pytest_asyncio.fixture
async def dates_client(dates_db_session):
    @asynccontextmanager
    async def mock_lifespan(app):
        yield

    app.router.lifespan_context = mock_lifespan
    async def override_get_db():
        yield dates_db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_and_get_dates_with_custom_occasion(dates_client, dates_db_session):
    user = User(
        id="user_coupled_1",
        email="couple1@example.com",
        couple_space_id="space_couple_1",
        name="Partner A"
    )
    dates_db_session.add(user)
    await dates_db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: user

    # 1. Create standard anniversary
    resp1 = await dates_client.post("/api/dates/", json={
        "title": "💍 1st Anniversary",
        "date": "2024-06-15",
        "type": "anniversary"
    })
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["title"] == "💍 1st Anniversary"
    assert data1["type"] == "anniversary"

    # 2. Create custom occasion
    resp2 = await dates_client.post("/api/dates/", json={
        "title": "☕ Our First Chai Date at Tapri",
        "date": "2024-01-20",
        "type": "custom"
    })
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["title"] == "☕ Our First Chai Date at Tapri"
    assert data2["type"] == "custom"

    # 3. Get all dates
    get_resp = await dates_client.get("/api/dates/")
    assert get_resp.status_code == 200
    all_dates = get_resp.json()
    assert len(all_dates) == 2

    # 4. Delete one date
    del_resp = await dates_client.delete(f"/api/dates/{data1['id']}")
    assert del_resp.status_code == 200
    assert del_resp.json() == {"ok": True}

    # Verify only custom occasion remains
    get_resp_after = await dates_client.get("/api/dates/")
    remaining = get_resp_after.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == data2["id"]


@pytest.mark.asyncio
async def test_dates_solo_user_support(dates_client, dates_db_session):
    solo_user = User(
        id="user_solo_123",
        email="solo@example.com",
        couple_space_id=None,
        name="Solo Explorer"
    )
    dates_db_session.add(solo_user)
    await dates_db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: solo_user

    # Solo user can save their milestones
    resp = await dates_client.post("/api/dates/", json={
        "title": "🎓 Master's Graduation Day",
        "date": "2025-05-10",
        "type": "milestone"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["couple_space_id"] == "solo_user_solo_123"

    # Fetch
    get_resp = await dates_client.get("/api/dates/")
    assert get_resp.status_code == 200
    assert len(get_resp.json()) == 1


@pytest.mark.asyncio
async def test_anniversary_reminder_milestones(dates_client, dates_db_session):
    from datetime import timedelta
    from app.models.orm import Notification
    from sqlalchemy.future import select

    today = datetime.utcnow().date()

    user = User(
        id="user_notif_1",
        email="notif@example.com",
        couple_space_id="space_notif_1",
        partner_id="partner_notif_2",
        name="User One"
    )
    partner = User(
        id="partner_notif_2",
        email="partner@example.com",
        couple_space_id="space_notif_1",
        partner_id="user_notif_1",
        name="User Two"
    )
    dates_db_session.add_all([user, partner])
    await dates_db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: user

    # 1. Date 5 days from now (within the last week daily window)
    d5 = (today + timedelta(days=5)).isoformat()
    await dates_client.post("/api/dates/", json={
        "title": "🎂 Partner Birthday",
        "date": d5,
        "type": "birthday"
    })

    # 2. Date 21 days from now (weekly milestone in 1-month window)
    d21 = (today + timedelta(days=21)).isoformat()
    await dates_client.post("/api/dates/", json={
        "title": "💍 Silver Anniversary",
        "date": d21,
        "type": "anniversary"
    })

    # Trigger GET /api/dates/
    get_resp = await dates_client.get("/api/dates/")
    assert get_resp.status_code == 200

    # Verify notifications were created for both user and partner
    notifs_u = (await dates_db_session.execute(
        select(Notification).filter(Notification.user_id == "user_notif_1")
    )).scalars().all()
    assert len(notifs_u) == 2
    titles = [n.title for n in notifs_u]
    assert any("5 Days until" in t for t in titles)
    assert any("3 Weeks until" in t for t in titles)

    notifs_p = (await dates_db_session.execute(
        select(Notification).filter(Notification.user_id == "partner_notif_2")
    )).scalars().all()
    assert len(notifs_p) == 2

