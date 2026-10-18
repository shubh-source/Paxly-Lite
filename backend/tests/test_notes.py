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
from app.models.orm import User, Note, Notification
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
async def test_notes_create_and_get_coupled(test_env):
    """Verifies that coupled users can send love notes, notify partner, and retrieve them."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u1 = User(id="u_notes_1", name="Arman", email="arman@test.com", password="hash", partner_id="u_notes_2", couple_space_id="space_notes")
        u2 = User(id="u_notes_2", name="Simran", email="simran@test.com", password="hash", partner_id="u_notes_1", couple_space_id="space_notes")
        session.add_all([u1, u2])
        await session.commit()

    token1 = create_access_token({"sub": "u_notes_1"})
    token2 = create_access_token({"sub": "u_notes_2"})

    # User 1 creates note
    res_create = await client.post(
        "/api/notes/",
        json={"title": "❤️", "content": "You mean the world to me!", "share_with_partner": True},
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_create.status_code == 200
    created_note = res_create.json()
    assert created_note["title"] == "❤️"

    # Verify partner notification was created
    async with session_factory() as session:
        notifs = (await session.execute(select(Notification).filter(Notification.user_id == "u_notes_2"))).scalars().all()
        assert len(notifs) == 1
        assert notifs[0].type == "love_note"
        assert "Arman" in notifs[0].body

    # Partner retrieves notes
    res_get = await client.get("/api/notes/", headers={"Authorization": f"Bearer {token2}"})
    assert res_get.status_code == 200
    notes = res_get.json()
    assert len(notes) == 1
    assert notes[0]["sender_name"] == "Arman"
    assert notes[0]["content"] == "You mean the world to me!"

@pytest.mark.asyncio
async def test_notes_solo_user_support(test_env):
    """Verifies that solo users can create and view notes without 403 error."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_solo = User(id="u_solo_note", name="Solo", email="solo@test.com", password="hash", partner_id=None, couple_space_id=None)
        session.add(u_solo)
        await session.commit()

    token = create_access_token({"sub": "u_solo_note"})

    # Solo user creates note
    res_create = await client.post(
        "/api/notes/",
        json={"title": "✨", "content": "Personal reflection note"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_create.status_code == 200

    # Solo user retrieves notes
    res_get = await client.get("/api/notes/", headers={"Authorization": f"Bearer {token}"})
    assert res_get.status_code == 200
    notes = res_get.json()
    assert len(notes) == 1
    assert notes[0]["content"] == "Personal reflection note"

@pytest.mark.asyncio
async def test_notes_time_capsule_locked(test_env):
    """Verifies that locked time-capsule notes hide content until unlocked."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    future_unlock = (datetime.utcnow() + timedelta(days=5)).isoformat()

    async with session_factory() as session:
        u = User(id="u_locked_test", name="Rishi", email="rishi@test.com", password="hash", partner_id=None, couple_space_id=None)
        session.add(u)
        await session.commit()

    token = create_access_token({"sub": "u_locked_test"})

    await client.post(
        "/api/notes/",
        json={"title": "🔒", "content": "Secret surprise message", "unlock_at": future_unlock},
        headers={"Authorization": f"Bearer {token}"}
    )

    res_get = await client.get("/api/notes/", headers={"Authorization": f"Bearer {token}"})
    assert res_get.status_code == 200
    notes = res_get.json()
    assert len(notes) == 1
    assert notes[0]["content"] == ""  # Stripped for locked note
    assert notes[0]["unlock_at"] is not None

@pytest.mark.asyncio
async def test_notes_idor_ownership_checks(test_env):
    """Verifies that foreign users cannot open, modify, or delete another couple's note."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        u_b = User(id="u_b", name="Eve", email="eve@test.com", password="hash", partner_id=None, couple_space_id="space_b")
        session.add_all([u_a1, u_a2, u_b])
        await session.commit()

    token_a1 = create_access_token({"sub": "u_a1"})
    token_a2 = create_access_token({"sub": "u_a2"})
    token_b = create_access_token({"sub": "u_b"})

    # Alice creates a private note in Space A
    res_create = await client.post(
        "/api/notes/",
        json={"title": "Private Love Note", "content": "Only for Bob", "share_with_partner": True},
        headers={"Authorization": f"Bearer {token_a1}"}
    )
    assert res_create.status_code == 200
    note_id = res_create.json()["id"]

    # 1. Attacker Eve tries to open Alice's note -> 403
    res_open_eve = await client.post(f"/api/notes/{note_id}/open", headers={"Authorization": f"Bearer {token_b}"})
    assert res_open_eve.status_code == 403

    # 2. Attacker Eve tries to edit Alice's note -> 403
    res_edit_eve = await client.put(f"/api/notes/{note_id}", json={"title": "Hacked"}, headers={"Authorization": f"Bearer {token_b}"})
    assert res_edit_eve.status_code == 403

    # 3. Attacker Eve tries to delete Alice's note -> 403
    res_del_eve = await client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res_del_eve.status_code == 403

    # 4. Legitimate partner Bob CAN open the note -> 200
    res_open_bob = await client.post(f"/api/notes/{note_id}/open", headers={"Authorization": f"Bearer {token_a2}"})
    assert res_open_bob.status_code == 200

    # 5. Legitimate author Alice CAN edit her note -> 200
    res_edit_alice = await client.put(f"/api/notes/{note_id}", json={"title": "Updated Love Note"}, headers={"Authorization": f"Bearer {token_a1}"})
    assert res_edit_alice.status_code == 200

    # 5b. Legitimate partner Bob CANNOT delete Alice's note (owner-only deletion) -> 403
    res_del_bob = await client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {token_a2}"})
    assert res_del_bob.status_code == 403
    assert "Only the note author can delete this note" in res_del_bob.json()["detail"]

    # 6. Legitimate author Alice CAN delete her note -> 200
    res_del_alice = await client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {token_a1}"})
    assert res_del_alice.status_code == 200

