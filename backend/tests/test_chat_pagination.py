import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta
from app.main import app
from app.core.database import get_db, Base
from app.models.orm import User, Message, CoupleSpace
from app.core.security import create_access_token
from app.core.encryption import encrypt_data
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(test_db):
    async def override_get_db():
        yield test_db
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_chat_history_bounded_and_cursor_pagination(client: AsyncClient, test_db: AsyncSession):
    # 1. Setup couple space with Alice and Bob
    space_id = "space_pag_test_1"
    alice = User(id="usr_alice_pag", name="Alice", email="alice_pag@test.com", password="hash", partner_id="usr_bob_pag", couple_space_id=space_id)
    bob = User(id="usr_bob_pag", name="Bob", email="bob_pag@test.com", password="hash", partner_id="usr_alice_pag", couple_space_id=space_id)
    space = CoupleSpace(id=space_id, user1_id="usr_alice_pag", user2_id="usr_bob_pag", theme_id="classic", allow_media_save=True)
    test_db.add_all([space, alice, bob])
    await test_db.commit()

    # 2. Insert 120 historical messages with ascending timestamps (1 minute apart)
    base_time = datetime(2026, 1, 1, 10, 0, 0)
    for i in range(1, 121):
        msg = Message(
            id=f"msg_pag_{i:03d}",
            couple_space_id=space_id,
            sender_id=alice.id if i % 2 == 1 else bob.id,
            text=encrypt_data(f"Historical message number {i}"),
            message_type="text",
            timestamp=base_time + timedelta(minutes=i),
            reactions={}
        )
        test_db.add(msg)
    await test_db.commit()

    alice_token = create_access_token({"sub": alice.id})
    headers = {"Authorization": f"Bearer {alice_token}"}

    # 3. Initial page load: Default limit=50 returns newest 50 messages in chronological order
    r1 = await client.get("/api/chat/messages", headers=headers)
    assert r1.status_code == 200
    page1 = r1.json()
    assert len(page1) == 50, f"Initial page must be bounded to 50 items (got {len(page1)})"
    
    # Chronological order check: oldest in page 1 is msg 71, newest is msg 120
    assert page1[0]["id"] == "msg_pag_071", "Oldest message in page 1 must be msg_pag_071"
    assert page1[-1]["id"] == "msg_pag_120", "Newest message in page 1 must be msg_pag_120"
    for i in range(len(page1) - 1):
        assert page1[i]["timestamp"] <= page1[i+1]["timestamp"], "Messages must be in chronological order"

    # 4. Second page load: Pass before=msg_pag_071 (cursor of oldest message in page 1)
    oldest_id_p1 = page1[0]["id"]
    r2 = await client.get(f"/api/chat/messages?before={oldest_id_p1}&limit=50", headers=headers)
    assert r2.status_code == 200
    page2 = r2.json()
    assert len(page2) == 50
    assert page2[0]["id"] == "msg_pag_021", "Oldest message in page 2 must be msg_pag_021"
    assert page2[-1]["id"] == "msg_pag_070", "Newest message in page 2 must be msg_pag_070"

    # Zero duplicate check between page 1 and page 2
    p1_ids = {m["id"] for m in page1}
    p2_ids = {m["id"] for m in page2}
    assert len(p1_ids.intersection(p2_ids)) == 0, "Pages must not contain duplicate message IDs"

    # 5. Third page load: Pass before=msg_pag_021
    oldest_id_p2 = page2[0]["id"]
    r3 = await client.get(f"/api/chat/messages?before={oldest_id_p2}&limit=50", headers=headers)
    assert r3.status_code == 200
    page3 = r3.json()
    assert len(page3) == 20, "Final page has remaining 20 messages (msg 1 to 20)"
    assert page3[0]["id"] == "msg_pag_001"
    assert page3[-1]["id"] == "msg_pag_020"

    # 6. Fourth page load: Beyond oldest message returns empty list
    r4 = await client.get(f"/api/chat/messages?before={page3[0]['id']}&limit=50", headers=headers)
    assert r4.status_code == 200
    page4 = r4.json()
    assert page4 == [], "Beyond oldest message must return empty list"

    # 7. ISO timestamp cursor support: before with ISO string
    ts_cutoff = (base_time + timedelta(minutes=51)).isoformat()
    r_ts = await client.get(f"/api/chat/messages?before={ts_cutoff}&limit=10", headers=headers)
    assert r_ts.status_code == 200
    ts_msgs = r_ts.json()
    assert len(ts_msgs) == 10
    assert ts_msgs[-1]["id"] == "msg_pag_050"

    # 8. Limit capping: limit > 100 must be bounded to 100
    r_cap = await client.get("/api/chat/messages?limit=500", headers=headers)
    assert r_cap.status_code == 200
    assert len(r_cap.json()) == 100, "Limit must be capped at 100"

    # 9. Cross-space cursor isolation: passing an ID from another couple space is ignored safely
    stranger_space = CoupleSpace(id="space_other_stranger", theme_id="classic")
    stranger_msg = Message(
        id="msg_stranger_x",
        couple_space_id=stranger_space.id,
        sender_id="usr_stranger",
        text=encrypt_data("Secret stranger text"),
        timestamp=datetime.utcnow()
    )
    test_db.add_all([stranger_space, stranger_msg])
    await test_db.commit()

    r_iso = await client.get(f"/api/chat/messages?before={stranger_msg.id}&limit=50", headers=headers)
    assert r_iso.status_code == 200
    iso_msgs = r_iso.json()
    # Cross space ID is not found in Alice's space, falls back safely to default offset without error
    assert all(m["couple_space_id"] == space_id for m in iso_msgs if "couple_space_id" in m)
