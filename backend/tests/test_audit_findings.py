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
from app.models.orm import User, Note, Anniversary, Message, AIChatThread, AICounselingSession
from app.core.security import create_access_token
from app.core.encryption import is_fernet_ciphertext, encrypt_data

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
async def test_dates_calendar_validation(test_env):
    """Verify that dates.py strictly rejects invalid calendar dates (e.g. 2024-02-30) and empty titles."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        user = User(id="user_dates", email="dates@vlynxly.com", name="Date User")
        session.add(user)
        await session.commit()

    token = create_access_token({"sub": "user_dates"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Invalid calendar date (February 30 does not exist)
    res_inv1 = await client.post(
        "/api/dates/",
        json={"title": "Anniversary", "date": "2024-02-30", "type": "anniversary"},
        headers=headers
    )
    assert res_inv1.status_code == 400
    assert "Invalid date format" in res_inv1.json()["detail"]

    # 2. Non-date string
    res_inv2 = await client.post(
        "/api/dates/",
        json={"title": "Anniversary", "date": "not-a-date", "type": "anniversary"},
        headers=headers
    )
    assert res_inv2.status_code == 400

    # 3. Empty title
    res_inv3 = await client.post(
        "/api/dates/",
        json={"title": "   ", "date": "2024-02-28", "type": "anniversary"},
        headers=headers
    )
    assert res_inv3.status_code == 400
    assert "Title cannot be empty" in res_inv3.json()["detail"]

    # 4. Valid calendar date succeeds
    res_valid = await client.post(
        "/api/dates/",
        json={"title": "Our First Date", "date": "2024-02-29", "type": "first_date"},
        headers=headers
    )
    assert res_valid.status_code == 200
    assert res_valid.json()["date"] == "2024-02-29"


@pytest.mark.asyncio
async def test_love_notes_encryption_at_rest(test_env):
    """Verify that note content is encrypted at rest in the DB and decrypted when fetched."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        user = User(id="user_enc_a", email="enca@vlynxly.com", name="Alice", couple_space_id="space_notes_enc")
        session.add(user)
        await session.commit()

    token = create_access_token({"sub": "user_enc_a"})
    headers = {"Authorization": f"Bearer {token}"}

    secret_message = "My deepest secret thoughts for Alice and Bob"
    res = await client.post(
        "/api/notes/",
        json={"title": "Secret Note", "content": secret_message, "share_with_partner": False},
        headers=headers
    )
    assert res.status_code == 200
    note_id = res.json()["id"]

    # Check raw DB content: MUST be encrypted ciphertext (starts with gAAAAA...), not plaintext
    async with session_factory() as session:
        raw_note = (await session.execute(select(Note).filter(Note.id == note_id))).scalars().first()
        assert raw_note is not None
        assert raw_note.content != secret_message
        assert is_fernet_ciphertext(raw_note.content)

    # Check API GET: Returns transparently decrypted content
    res_get = await client.get("/api/notes/", headers=headers)
    assert res_get.status_code == 200
    notes_list = res_get.json()
    matched = [n for n in notes_list if n["id"] == note_id]
    assert len(matched) == 1
    assert matched[0]["content"] == secret_message


@pytest.mark.asyncio
async def test_voice_note_and_chat_upload_limits(test_env, monkeypatch):
    """Verify that oversized voice notes and invalid media formats are rejected with streaming limits."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        user = User(id="user_up", email="up@vlynxly.com", name="Uploader", is_premium=False)
        session.add(user)
        await session.commit()

    token = create_access_token({"sub": "user_up"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Voice Note: Invalid extension rejected with 400
    res_inv_ext = await client.post(
        "/api/voice-notes/upload",
        files={"file": ("malicious.exe", b"binary content", "application/x-msdownload")},
        headers=headers
    )
    assert res_inv_ext.status_code == 400
    assert "Invalid audio format" in res_inv_ext.json()["detail"]

    # 2. Voice Note: Exceeding 15MB limit rejected with 413
    import app.api.routes.voice_notes as vn_mod
    monkeypatch.setattr(vn_mod, "MAX_VOICE_NOTE_SIZE", 100) # mock 100 bytes max for fast testing

    oversized_data = b"0" * 200
    res_ov = await client.post(
        "/api/voice-notes/upload",
        files={"file": ("recording.webm", oversized_data, "audio/webm")},
        headers=headers
    )
    assert res_ov.status_code == 413
    assert "exceeds maximum allowed size" in res_ov.json()["detail"]


@pytest.mark.asyncio
async def test_ai_session_start_authoritative_history_and_thread_isolation(test_env, monkeypatch):
    """Verify that AI session start uses authentic DB messages and thread recovery does not overwrite other users."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # Mock AI summarizer to avoid calling external models
    import app.api.routes.ai as ai_mod
    async def mock_summarize(history: str, *args, **kwargs):
        return f"Summary of: {history[:30]}"
    monkeypatch.setattr(ai_mod, "summarize_history", mock_summarize)

    async with session_factory() as session:
        u1 = User(id="ai_u1", email="u1@test.com", name="Alice", partner_id="ai_u2", couple_space_id="space_ai_1")
        u2 = User(id="ai_u2", email="u2@test.com", name="Bob", partner_id="ai_u1", couple_space_id="space_ai_1")
        session.add_all([u1, u2])

        # Add genuine DB messages in couple space
        m1 = Message(id="msg_ai_1", couple_space_id="space_ai_1", sender_id="ai_u1", text=encrypt_data("Love you Bob"))
        session.add(m1)
        await session.commit()

    token = create_access_token({"sub": "ai_u1"})
    headers = {"Authorization": f"Bearer {token}"}

    # Start session: pass fake client history, but verify server prioritizes genuine DB messages
    res_start = await client.post(
        "/api/ai/session/start",
        json={"days": 7, "chat_history": "Fake client injected text"},
        headers=headers
    )
    assert res_start.status_code == 200
    res_data = res_start.json()
    synopsis = res_data["synopsis"]
    # The summary should be based on "Partner A: Love you Bob", NOT the fake client injected text!
    assert "Love you Bob" in synopsis
    assert res_data.get("history_source") == "database"

    # Now verify unverified client fallback when DB history is completely empty
    async with session_factory() as session:
        u3 = User(id="ai_u3", email="u3@test.com", name="Carol", partner_id="ai_u4", couple_space_id="space_ai_empty")
        u4 = User(id="ai_u4", email="u4@test.com", name="Dave", partner_id="ai_u3", couple_space_id="space_ai_empty")
        session.add_all([u3, u4])
        await session.commit()

    token3 = create_access_token({"sub": "ai_u3"})
    res_fallback = await client.post(
        "/api/ai/session/start",
        json={"days": 7, "chat_history": "Client sent message without DB records"},
        headers={"Authorization": f"Bearer {token3}"}
    )
    assert res_fallback.status_code == 200
    fallback_data = res_fallback.json()
    assert fallback_data.get("history_source") == "client_unverified"
    assert "[Unverified" in fallback_data["synopsis"]


@pytest.mark.asyncio
async def test_vault_save_message_decrypts_text(test_env):
    """Verify that saving an encrypted chat message to Memory Vault decrypts description instead of saving raw cipher."""
    from app.models.orm import Memory
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        u = User(id="user_vault_1", email="v1@test.com", name="VaultUser", couple_space_id="space_vault")
        session.add(u)
        m = Message(
            id="msg_vault_1",
            couple_space_id="space_vault",
            sender_id="user_vault_1",
            text=encrypt_data("Secret vault message text"),
            media_url="https://storage.example.com/photo.jpg",
            message_type="image"
        )
        session.add(m)
        await session.commit()

    token = create_access_token({"sub": "user_vault_1"})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post("/api/memories/save-message", json={"message_id": "msg_vault_1"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["description"] == "Secret vault message text"


@pytest.mark.asyncio
async def test_voice_note_solo_user_rename_and_delete(test_env):
    """Verify that solo users can rename and delete their voice notes without couple_space_id."""
    from app.models.orm import VoiceNote
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        solo_user = User(id="user_solo_vn", email="solo@test.com", name="SoloUser", couple_space_id=None)
        session.add(solo_user)
        vn = VoiceNote(
            id="vn_solo_1",
            couple_space_id="solo_user_solo_vn",
            sender_id="user_solo_vn",
            url="https://storage.example.com/vn.webm",
            filename="vn_solo_1.webm",
            custom_name="Original Name"
        )
        session.add(vn)
        await session.commit()

    token = create_access_token({"sub": "user_solo_vn"})
    headers = {"Authorization": f"Bearer {token}"}

    # Rename
    res_ren = await client.patch("/api/voice-notes/vn_solo_1/rename", json={"custom_name": "New Solo Name"}, headers=headers)
    assert res_ren.status_code == 200
    assert res_ren.json()["custom_name"] == "New Solo Name"

    # Delete
    res_del = await client.delete("/api/voice-notes/vn_solo_1", headers=headers)
    assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_love_notes_dashboard_alerts_locked_content_and_owner_only_deletion(test_env):
    """Verify that dashboard-alerts never leak locked note content and only the author can delete a note."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        u1 = User(id="user_ln_1", email="ln1@test.com", name="Aman", partner_id="user_ln_2", couple_space_id="space_notes_alert")
        u2 = User(id="user_ln_2", email="ln2@test.com", name="Priya", partner_id="user_ln_1", couple_space_id="space_notes_alert")
        session.add_all([u1, u2])
        await session.commit()

    token1 = create_access_token({"sub": "user_ln_1"})
    token2 = create_access_token({"sub": "user_ln_2"})

    # 1. Aman creates a locked time-capsule note shared with Priya
    future_time = (datetime.utcnow() + timedelta(days=3)).isoformat()
    res_create = await client.post(
        "/api/notes/",
        json={
            "title": "Future Surprise",
            "content": "Secret love letter to open on Sunday!",
            "share_with_partner": True,
            "display_hours": 72,
            "unlock_at": future_time
        },
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res_create.status_code == 200
    note_id = res_create.json()["id"]

    # 2. Priya fetches dashboard alerts: Note MUST appear, but content MUST BE EMPTY (""), is_locked=True!
    res_alerts = await client.get("/api/notes/dashboard-alerts", headers={"Authorization": f"Bearer {token2}"})
    assert res_alerts.status_code == 200
    alerts = res_alerts.json()
    matched = [n for n in alerts if n["id"] == note_id]
    assert len(matched) == 1
    locked_note_alert = matched[0]
    assert locked_note_alert["title"] == "Future Surprise"
    assert locked_note_alert["content"] == ""  # STRICTLY BLANK BEFORE UNLOCK TIME
    assert locked_note_alert["is_locked"] is True
    assert locked_note_alert["unlock_at"] is not None

    # 3. Priya (partner) attempts to delete Aman's note -> 403 Forbidden (owner-only deletion)
    res_del_partner = await client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {token2}"})
    assert res_del_partner.status_code == 403
    assert "Only the note author can delete this note" in res_del_partner.json()["detail"]

    # 4. Aman (creator) deletes his own note -> 200 OK
    res_del_owner = await client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {token1}"})
    assert res_del_owner.status_code == 200


@pytest.mark.asyncio
async def test_memories_date_and_title_validation(test_env):
    """Verify memories endpoint rejects blank/invalid calendar dates and blank titles with 400."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    async with session_factory() as session:
        user = User(id="user_mem_val", email="memval@test.com", name="MemUser", couple_space_id="space_mem_val")
        session.add(user)
        await session.commit()

    token = create_access_token({"sub": "user_mem_val"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Blank title
    res_no_title = await client.post(
        "/api/memories/",
        data={"title": "   ", "date": "2024-05-15", "description": "Trip to Paris"},
        headers=headers
    )
    assert res_no_title.status_code == 400
    assert "Memory title is required" in res_no_title.json()["detail"]

    # 2. Blank date
    res_no_date = await client.post(
        "/api/memories/",
        data={"title": "Our First Meet", "date": "   ", "description": "Coffee shop"},
        headers=headers
    )
    assert res_no_date.status_code == 400
    assert "Memory date is required" in res_no_date.json()["detail"]

    # 3. Invalid date format (not YYYY-MM-DD)
    res_bad_format = await client.post(
        "/api/memories/",
        data={"title": "Beach Day", "date": "15-05-2024", "description": "Sunset"},
        headers=headers
    )
    assert res_bad_format.status_code == 400
    assert "Invalid date format for memory" in res_bad_format.json()["detail"]

    # 4. Impossible calendar date (Feb 31)
    res_bad_cal = await client.post(
        "/api/memories/",
        data={"title": "Special Day", "date": "2024-02-31", "description": "Fake date"},
        headers=headers
    )
    assert res_bad_cal.status_code == 400
    assert "Invalid date format for memory" in res_bad_cal.json()["detail"]

    # 5. Valid leap day date succeeds
    res_valid = await client.post(
        "/api/memories/",
        data={"title": "Leap Day Memory", "date": "2024-02-29", "description": "Once every 4 years"},
        headers=headers
    )
    assert res_valid.status_code == 200
    assert res_valid.json()["title"] == "Leap Day Memory"
    assert res_valid.json()["date"] == "2024-02-29"
