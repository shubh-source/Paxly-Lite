import pytest
import pytest_asyncio
import tempfile
import os
import json
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, AIChatThread, AICounselingSession
from app.core.security import create_access_token
from app.api.routes.ai import DEFAULT_AURA_SETTINGS

@pytest_asyncio.fixture
async def test_env():
    """
    Creates a dedicated temporary SQLite database per test,
    initializes all ORM tables, patches AsyncSessionLocal and get_db,
    and cleanly tears down after the test.
    """
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

    # Prevent lifespan from attempting remote PostgreSQL connection
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

async def seed_user(session_factory, user_id: str, name: str, email: str, aura_settings: dict = None) -> str:
    """Helper to insert a user and return a signed JWT token."""
    async with session_factory() as session:
        u = User(
            id=user_id,
            name=name,
            email=email,
            password="hashed_test_password",
            aura_settings=aura_settings or {},
            ai_personality="balanced",
            crisis_escalation_enabled=True,
        )
        session.add(u)
        await session.commit()
    return create_access_token({"sub": user_id})


# ══════════════════════════════════════════════════════════════════
# 1. SETTINGS API INTEGRATION TESTS (GET, PUT, RESET)
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_settings_default_and_auth(test_env):
    """GET /api/ai/settings returns 401 unauthenticated and 200 with defaults when authenticated."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_1", "Alice", "alice@example.com")

    # 1. Unauthenticated request
    res_unauth = await client.get("/api/ai/settings")
    assert res_unauth.status_code == 401

    # 2. Authenticated request with no prior settings
    res = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["preset"] == "Balanced"
    assert data["language"] == "Hinglish"
    assert data["modelProvider"] == "Automatic"
    assert data["escalationMode"] == "Suggest"
    assert data["streaming"] is False
    assert data["theme"] == "Dark"
    assert data["requestTimeoutSec"] == 30

@pytest.mark.asyncio
async def test_update_and_reload_settings(test_env):
    """PUT /api/ai/settings updates settings, persists them in the DB, and affects compatibility flags."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]
    token = await seed_user(session_factory, "usr_1", "Alice", "alice@example.com")

    payload = {
        "preset": "Technical",
        "customInstructions": "Always provide clean, typed Python code.",
        "language": "English",
        "modelProvider": "Groq",
        "fastResponseMode": False,
        "escalationMode": "Ask first",
        "theme": "Light",
        "accentColor": "Ocean",
        "maxOutputTokens": 2048,
    }

    # 1. PUT update
    res = await client.put(
        "/api/ai/settings",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    updated_data = res.json()
    assert updated_data["preset"] == "Technical"
    assert updated_data["modelProvider"] == "Groq"
    assert updated_data["customInstructions"] == "Always provide clean, typed Python code."

    # 2. GET reload to verify persistence across sessions
    res_reload = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token}"})
    assert res_reload.status_code == 200
    reloaded = res_reload.json()
    assert reloaded["preset"] == "Technical"
    assert reloaded["modelProvider"] == "Groq"
    assert reloaded["language"] == "English"
    assert reloaded["escalationMode"] == "Ask first"
    assert reloaded["theme"] == "Light"
    assert reloaded["accentColor"] == "Ocean"
    assert reloaded["maxOutputTokens"] == 2048

    # 3. Direct DB inspection for compatibility columns
    async with session_factory() as session:
        result = await session.execute(select(User).filter(User.id == "usr_1"))
        user_in_db = result.scalars().first()
        assert user_in_db is not None
        assert user_in_db.ai_personality == "technical"
        assert user_in_db.crisis_escalation_enabled is True
        assert user_in_db.aura_settings["preset"] == "Technical"

@pytest.mark.asyncio
async def test_reset_settings(test_env):
    """POST /api/ai/settings/reset restores default configuration in DB and responses."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]
    token = await seed_user(session_factory, "usr_1", "Alice", "alice@example.com")

    # First update to non-default values
    await client.put(
        "/api/ai/settings",
        json={"preset": "Teacher", "escalationMode": "Off", "theme": "Paper"},
        headers={"Authorization": f"Bearer {token}"}
    )

    # Call reset
    res = await client.post("/api/ai/settings/reset", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    reset_data = res.json()
    assert reset_data["preset"] == "Balanced"
    assert reset_data["escalationMode"] == "Suggest"

    # Verify reload returns default
    reload_res = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token}"})
    assert reload_res.json()["preset"] == "Balanced"

    # Verify DB user flags reset
    async with session_factory() as session:
        result = await session.execute(select(User).filter(User.id == "usr_1"))
        u = result.scalars().first()
        assert u.ai_personality == "balanced"
        assert u.crisis_escalation_enabled is True

@pytest.mark.asyncio
async def test_settings_validation_errors(test_env):
    """PUT /api/ai/settings validates inputs and rejects invalid/excessive values with safe HTTP errors."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_1", "Alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Custom instructions exceeds 2500 characters -> 400
    too_long = "a" * 2501
    res = await client.put("/api/ai/settings", json={"customInstructions": too_long}, headers=headers)
    assert res.status_code == 400
    assert "Custom instructions cannot exceed 2500 characters" in res.json()["detail"]

    # 2. Invalid preset -> 400
    res = await client.put("/api/ai/settings", json={"preset": "InvalidPreset123"}, headers=headers)
    assert res.status_code == 400
    assert "Invalid personality preset" in res.json()["detail"]

    # 3. Invalid escalationMode -> 400
    res = await client.put("/api/ai/settings", json={"escalationMode": "InvalidEscalation"}, headers=headers)
    assert res.status_code == 400
    assert "Invalid escalation mode" in res.json()["detail"]

    # 4. Invalid modelProvider -> 400
    res = await client.put("/api/ai/settings", json={"modelProvider": "UnsupportedProvider"}, headers=headers)
    assert res.status_code == 400
    assert "Invalid model provider" in res.json()["detail"]


# ══════════════════════════════════════════════════════════════════
# 2. THREAD PERSISTENCE, DECRYPTION & LIFECYCLE TESTS
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_thread_sync_and_retrieval(test_env):
    """POST /api/ai/threads/sync encrypts messages, and GET /api/ai/threads decrypts them correctly."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]
    token = await seed_user(session_factory, "usr_1", "Alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    sample_msgs = [
        {"role": "user", "content": "How do I optimize my daily schedule?"},
        {"role": "assistant", "content": "Here is a structured morning routine..."}
    ]

    # 1. Sync new thread
    sync_res = await client.post(
        "/api/ai/threads/sync",
        json={"id": "th_101", "title": "Daily Routine Plan", "messages": sample_msgs},
        headers=headers
    )
    assert sync_res.status_code == 200
    assert sync_res.json()["status"] == "synced"

    # 2. Verify encrypted persistence in DB
    async with session_factory() as session:
        result = await session.execute(select(AIChatThread).filter(AIChatThread.id == "th_101"))
        thread_in_db = result.scalars().first()
        assert thread_in_db is not None
        assert thread_in_db.title == "Daily Routine Plan"
        # Must be encrypted ciphertext, NOT raw plaintext JSON
        assert thread_in_db.encrypted_messages != json.dumps(sample_msgs)
        assert "How do I optimize" not in thread_in_db.encrypted_messages

    # 3. Retrieve and decrypt through GET /api/ai/threads
    list_res = await client.get("/api/ai/threads", headers=headers)
    assert list_res.status_code == 200
    threads = list_res.json()
    assert len(threads) == 1
    assert threads[0]["id"] == "th_101"
    assert threads[0]["title"] == "Daily Routine Plan"
    assert len(threads[0]["messages"]) == 2
    assert threads[0]["messages"][0]["content"] == "How do I optimize my daily schedule?"

    # 4. Update existing thread
    updated_msgs = sample_msgs + [{"role": "user", "content": "Can we shorten it?"}]
    update_res = await client.post(
        "/api/ai/threads/sync",
        json={"id": "th_101", "title": "Daily Routine Plan (Short)", "messages": updated_msgs},
        headers=headers
    )
    assert update_res.status_code == 200

    # 5. Verify update
    list_res2 = await client.get("/api/ai/threads", headers=headers)
    assert len(list_res2.json()[0]["messages"]) == 3
    assert list_res2.json()[0]["title"] == "Daily Routine Plan (Short)"

@pytest.mark.asyncio
async def test_delete_individual_thread(test_env):
    """DELETE /api/ai/threads/{id} removes the thread, and subsequent deletion returns 404."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_1", "Alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create thread
    await client.post(
        "/api/ai/threads/sync",
        json={"id": "th_to_delete", "title": "Temporary Chat", "messages": []},
        headers=headers
    )

    # Delete thread
    del_res = await client.delete("/api/ai/threads/th_to_delete", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Thread should no longer appear
    list_res = await client.get("/api/ai/threads", headers=headers)
    assert len(list_res.json()) == 0

    # Deleting again returns 404
    del_res_again = await client.delete("/api/ai/threads/th_to_delete", headers=headers)
    assert del_res_again.status_code == 404
    assert del_res_again.json()["detail"] == "Thread not found"

@pytest.mark.asyncio
async def test_delete_all_threads(test_env):
    """DELETE /api/ai/threads removes all threads for the calling user."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_1", "Alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create 3 threads
    for i in range(3):
        await client.post(
            "/api/ai/threads/sync",
            json={"id": f"th_batch_{i}", "title": f"Chat {i}", "messages": []},
            headers=headers
        )

    list_res = await client.get("/api/ai/threads", headers=headers)
    assert len(list_res.json()) == 3

    # Delete all
    del_all_res = await client.delete("/api/ai/threads", headers=headers)
    assert del_all_res.status_code == 200
    assert del_all_res.json()["status"] == "all_threads_deleted"

    # Confirm empty
    list_res2 = await client.get("/api/ai/threads", headers=headers)
    assert len(list_res2.json()) == 0


# ══════════════════════════════════════════════════════════════════
# 3. TWO-ACCOUNT MULTI-TENANT ISOLATION TESTS
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_two_account_settings_isolation(test_env):
    """User A's settings customizations never leak into or alter User B's settings."""
    client = test_env["client"]
    session_factory = test_env["session_factory"]
    token_a = await seed_user(session_factory, "usr_a", "Alice", "alice@test.com")
    token_b = await seed_user(session_factory, "usr_b", "Bob", "bob@test.com")

    # User A sets Teacher preset and Hinglish
    await client.put(
        "/api/ai/settings",
        json={"preset": "Teacher", "defaultLanguage": "Hindi"},
        headers={"Authorization": f"Bearer {token_a}"}
    )

    # User B sets Technical preset and English
    await client.put(
        "/api/ai/settings",
        json={"preset": "Technical", "defaultLanguage": "English"},
        headers={"Authorization": f"Bearer {token_b}"}
    )

    # Verify User A sees Teacher and Hindi
    res_a = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.json()["preset"] == "Teacher"
    assert res_a.json()["defaultLanguage"] == "Hindi"

    # Verify User B sees Technical and English
    res_b = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.json()["preset"] == "Technical"
    assert res_b.json()["defaultLanguage"] == "English"

    # User A resets settings: User B remains unaffected
    await client.post("/api/ai/settings/reset", headers={"Authorization": f"Bearer {token_a}"})

    res_a_after = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a_after.json()["preset"] == "Balanced"

    res_b_after = await client.get("/api/ai/settings", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b_after.json()["preset"] == "Technical"
    assert res_b_after.json()["defaultLanguage"] == "English"

@pytest.mark.asyncio
async def test_two_account_thread_isolation_and_hijack_prevention(test_env):
    """
    Strict isolation between User A and User B:
    - User B cannot see User A's threads.
    - User B cannot hijack/overwrite User A's existing thread (HTTP 403).
    - User B cannot delete User A's thread (HTTP 404).
    - User A batch deleting threads does not affect User B's threads.
    """
    client = test_env["client"]
    session_factory = test_env["session_factory"]
    token_a = await seed_user(session_factory, "usr_a", "Alice", "alice@test.com")
    token_b = await seed_user(session_factory, "usr_b", "Bob", "bob@test.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User A creates threads A1 and A2
    await client.post(
        "/api/ai/threads/sync",
        json={"id": "thread_a1", "title": "Alice Secret 1", "messages": [{"role": "user", "content": "Msg A1"}]},
        headers=headers_a
    )
    await client.post(
        "/api/ai/threads/sync",
        json={"id": "thread_a2", "title": "Alice Secret 2", "messages": [{"role": "user", "content": "Msg A2"}]},
        headers=headers_a
    )

    # 2. User B creates thread B1
    await client.post(
        "/api/ai/threads/sync",
        json={"id": "thread_b1", "title": "Bob Secret 1", "messages": [{"role": "user", "content": "Msg B1"}]},
        headers=headers_b
    )

    # 3. Verify listing isolation
    threads_a = (await client.get("/api/ai/threads", headers=headers_a)).json()
    assert len(threads_a) == 2
    assert {t["id"] for t in threads_a} == {"thread_a1", "thread_a2"}

    threads_b = (await client.get("/api/ai/threads", headers=headers_b)).json()
    assert len(threads_b) == 1
    assert threads_b[0]["id"] == "thread_b1"

    # 4. User B attempts to hijack/overwrite User A's thread -> MUST return 403 Forbidden
    hijack_res = await client.post(
        "/api/ai/threads/sync",
        json={"id": "thread_a1", "title": "Bob Hijack Attempt", "messages": [{"role": "user", "content": "Hacked"}]},
        headers=headers_b
    )
    assert hijack_res.status_code == 403
    assert hijack_res.json()["detail"] == "Unauthorized"

    # Verify User A's thread is unaltered
    threads_a_check = (await client.get("/api/ai/threads", headers=headers_a)).json()
    a1 = next(t for t in threads_a_check if t["id"] == "thread_a1")
    assert a1["title"] == "Alice Secret 1"
    assert a1["messages"][0]["content"] == "Msg A1"

    # 5. User B attempts to delete User A's thread -> MUST return 404 Not Found
    cross_delete_res = await client.delete("/api/ai/threads/thread_a1", headers=headers_b)
    assert cross_delete_res.status_code == 404
    assert cross_delete_res.json()["detail"] == "Thread not found"

    # Confirm thread_a1 still exists for User A
    assert any(t["id"] == "thread_a1" for t in (await client.get("/api/ai/threads", headers=headers_a)).json())

    # 6. User A calls batch delete -> ONLY User A's threads are deleted
    await client.delete("/api/ai/threads", headers=headers_a)

    assert len((await client.get("/api/ai/threads", headers=headers_a)).json()) == 0
    threads_b_after = (await client.get("/api/ai/threads", headers=headers_b)).json()
    assert len(threads_b_after) == 1
    assert threads_b_after[0]["id"] == "thread_b1"
    assert threads_b_after[0]["title"] == "Bob Secret 1"


# ══════════════════════════════════════════════════════════════════
# 4. UNAUTHORIZED REQUESTS & MALFORMED PAYLOADS
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_unauthorized_token_variants(test_env):
    """Unauthorized, invalid or forged tokens are safely rejected with 401."""
    client = test_env["client"]

    # 1. No Authorization header
    assert (await client.get("/api/ai/settings")).status_code == 401
    assert (await client.get("/api/ai/threads")).status_code == 401
    assert (await client.delete("/api/ai/threads")).status_code == 401

    # 2. Malformed token
    bad_headers = {"Authorization": "Bearer not-a-valid-jwt-token"}
    assert (await client.get("/api/ai/settings", headers=bad_headers)).status_code == 401
    assert (await client.get("/api/ai/threads", headers=bad_headers)).status_code == 401

    # 3. Token for non-existent user
    ghost_token = create_access_token({"sub": "non_existent_user_id"})
    ghost_headers = {"Authorization": f"Bearer {ghost_token}"}
    assert (await client.get("/api/ai/settings", headers=ghost_headers)).status_code == 401

@pytest.mark.asyncio
async def test_malformed_payloads(test_env):
    """Malformed or invalid payloads return 422 Unprocessable Entity."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_1", "Alice", "alice@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Thread sync with missing required field 'title'
    res1 = await client.post(
        "/api/ai/threads/sync",
        json={"id": "th_bad_1", "messages": []},
        headers=headers
    )
    assert res1.status_code == 422

    # 2. Thread sync with missing required field 'id'
    res2 = await client.post(
        "/api/ai/threads/sync",
        json={"title": "No ID", "messages": []},
        headers=headers
    )
    assert res2.status_code == 422

    # 3. Thread sync with invalid messages type (string instead of list)
    res3 = await client.post(
        "/api/ai/threads/sync",
        json={"id": "th_bad_3", "title": "Wrong type", "messages": "not a list"},
        headers=headers
    )
    assert res3.status_code == 422

@pytest.mark.asyncio
async def test_counseling_session_participant_authorization(test_env):
    """Verifies that nonparticipants cannot interview or submit POVs to another couple's counseling session."""
    session_factory = test_env["session_factory"]
    client = test_env["client"]

    async with session_factory() as session:
        u_a1 = User(id="u_a1", name="Alice", email="alice@test.com", password="hash", partner_id="u_a2", couple_space_id="space_a")
        u_a2 = User(id="u_a2", name="Bob", email="bob@test.com", password="hash", partner_id="u_a1", couple_space_id="space_a")
        u_c = User(id="u_c", name="Eve", email="eve@test.com", password="hash", partner_id=None, couple_space_id="space_c")
        
        c_session = AICounselingSession(
            id="session_alpha_123",
            couple_space_id="space_a",
            partner_a_id="u_a1",
            partner_b_id="u_a2",
            status="interviewing",
            history_synopsis="Alice and Bob had an argument about communication."
        )
        session.add_all([u_a1, u_a2, u_c, c_session])
        await session.commit()

    token_a1 = create_access_token({"sub": "u_a1"})
    token_c = create_access_token({"sub": "u_c"})

    # 1. Attacker User C tries to join Alice & Bob's interview -> 403 Forbidden
    res_interview_c = await client.post(
        "/api/ai/session/interview",
        json={"session_id": "session_alpha_123", "message": "Tell me what happened"},
        headers={"Authorization": f"Bearer {token_c}"}
    )
    assert res_interview_c.status_code == 403
    assert "not authorized" in res_interview_c.json()["detail"].lower()

    # 2. Attacker User C tries to finish / submit POV to Alice & Bob's session -> 403 Forbidden
    res_finish_c = await client.post(
        "/api/ai/session/finish-interview",
        params={"session_id": "session_alpha_123", "pov": "Malicious spoofed point of view"},
        headers={"Authorization": f"Bearer {token_c}"}
    )
    assert res_finish_c.status_code == 403
    assert "not authorized" in res_finish_c.json()["detail"].lower()

    # 3. Legitimate participant Alice submits her POV -> 200 OK, waiting for Bob
    res_finish_a1 = await client.post(
        "/api/ai/session/finish-interview",
        params={"session_id": "session_alpha_123", "pov": "My real perspective on our relationship"},
        headers={"Authorization": f"Bearer {token_a1}"}
    )
    assert res_finish_a1.status_code == 200
    assert res_finish_a1.json()["status"] == "waiting_for_partner"

    # 4. Verify in DB that partner_a_pov was set and partner_b_pov is still None
    async with session_factory() as session:
        s_db = (await session.execute(select(AICounselingSession).filter(AICounselingSession.id == "session_alpha_123"))).scalars().first()
        assert s_db.partner_a_pov == "My real perspective on our relationship"
        assert s_db.partner_b_pov is None

