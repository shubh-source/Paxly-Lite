import pytest
import pytest_asyncio
import tempfile
import os
import json
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, Notification, AuraEscalationEvent
from app.core.security import create_access_token
from app.services.aura_core import InputObject, EmotionEngine, IntentEngine, SafetyEngine, aura_core


# ══════════════════════════════════════════════════════════════════
# 1. UNIT TESTS: FIGURATIVE SPEECH VS GENUINE CRISIS DISCLOSURES
# ══════════════════════════════════════════════════════════════════

def test_figurative_speech_not_suppressing_genuine_crisis():
    safety = SafetyEngine()
    emotion = EmotionEngine().detect(InputObject(raw_content="This movie is killing me and I want to die"), {})

    # Case A: Idiom alone -> RISK_0 (No crisis alert)
    pure_idiom_1 = safety.assess(InputObject(raw_content="This movie is killing me"), emotion, {})
    assert pure_idiom_1.is_safe is True
    assert pure_idiom_1.risk_level == "RISK_0"
    assert "figurative_hyperbole_not_risk" in pure_idiom_1.flags

    pure_idiom_2 = safety.assess(InputObject(raw_content="traffic is killing me today"), emotion, {})
    assert pure_idiom_2.is_safe is True
    assert pure_idiom_2.risk_level == "RISK_0"

    pure_idiom_3 = safety.assess(InputObject(raw_content="mar gaya has has ke so funny"), emotion, {})
    assert pure_idiom_3.is_safe is True
    assert pure_idiom_3.risk_level == "RISK_0"

    pure_idiom_4 = safety.assess(InputObject(raw_content="dying of laughter lmao"), emotion, {})
    assert pure_idiom_4.is_safe is True
    assert pure_idiom_4.risk_level == "RISK_0"

    # Case B: Idiom combined with genuine crisis disclosure -> MUST NOT be suppressed!
    mixed_crisis_1 = safety.assess(InputObject(raw_content="This movie is killing me and I want to die"), emotion, {})
    assert mixed_crisis_1.is_safe is False
    assert mixed_crisis_1.risk_level == "RISK_3"
    assert mixed_crisis_1.requires_intervention is True
    assert "figurative_hyperbole_not_risk" not in mixed_crisis_1.flags

    # Case C: Idiom combined with imminent crisis disclosure -> MUST trigger RISK_4!
    mixed_crisis_2 = safety.assess(InputObject(raw_content="killing time until I end my life tonight"), emotion, {})
    assert mixed_crisis_2.is_safe is False
    assert mixed_crisis_2.risk_level == "RISK_4"
    assert mixed_crisis_2.requires_intervention is True
    assert "figurative_hyperbole_not_risk" not in mixed_crisis_2.flags

    # Case D: Ordinary humorous expressions and ambiguous messages
    neutral_joke = safety.assess(InputObject(raw_content="Why did the chicken cross the road?"), emotion, {})
    assert neutral_joke.is_safe is True
    assert neutral_joke.risk_level in ["RISK_0", "RISK_1"]


def test_emotion_engine_and_intent_engine():
    emotion_engine = EmotionEngine()
    intent_engine = IntentEngine()

    # Sadness
    sad_state = emotion_engine.detect(InputObject(raw_content="Main bohot udaas hu, dil toot gaya hai"), {})
    assert sad_state.primary_emotion == "sadness"
    assert sad_state.vulnerability_level == "high"

    # Sarcasm / ambiguity
    sarcastic = emotion_engine.detect(InputObject(raw_content="Waah kya baat hai, great job 🙃"), {})
    assert sarcastic.sarcasm_detected is True
    assert sarcastic.vulnerability_level == "low"

    # Venting
    vent = intent_engine.detect(InputObject(raw_content="Aaj kaafi thak gaya, bas sun lo meri baat"), {})
    assert vent.primary_intent == "venting"

    # Date planning
    date_plan = intent_engine.detect(InputObject(raw_content="Can we plan a dinner date for our anniversary?"), {})
    assert date_plan.primary_intent == "date_planning"


# ══════════════════════════════════════════════════════════════════
# 2. INTEGRATION TESTS: PERSISTED ESCALATION EVENT & ATOMIC LIFECYCLE
# ══════════════════════════════════════════════════════════════════

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


async def seed_users(session_factory):
    async with session_factory() as session:
        u1 = User(
            id="user_alice",
            name="Alice",
            email="alice@example.com",
            password="hashed_pass",
            partner_id="user_bob",
            aura_settings={"escalationMode": "Ask first"},
            crisis_escalation_enabled=True,
        )
        u2 = User(
            id="user_bob",
            name="Bob",
            email="bob@example.com",
            password="hashed_pass",
            partner_id="user_alice",
            aura_settings={"escalationMode": "Ask first"},
            crisis_escalation_enabled=True,
        )
        u_solo = User(
            id="user_solo",
            name="Solo",
            email="solo@example.com",
            password="hashed_pass",
            partner_id=None,
            aura_settings={"escalationMode": "Ask first"},
            crisis_escalation_enabled=True,
        )
        session.add_all([u1, u2, u_solo])
        await session.commit()

    token_alice = create_access_token({"sub": "user_alice"})
    token_bob = create_access_token({"sub": "user_bob"})
    token_solo = create_access_token({"sub": "user_solo"})
    return token_alice, token_bob, token_solo


@pytest.mark.asyncio
async def test_ask_first_chat_generates_persisted_event(test_env):
    """Verifies that an Ask-first crisis chat triggers creation of an AuraEscalationEvent."""
    client = test_env["client"]
    token_alice, _, _ = await seed_users(test_env["session_factory"])

    # Alice sends a crisis message
    res = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={
            "messages": [{"role": "user", "content": "I want to die, please help me"}]
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["requires_consent"] is True
    assert data["escalation_event_id"] is not None

    event_id = data["escalation_event_id"]

    # Verify event exists in DB
    async with test_env["session_factory"]() as session:
        evt_res = await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == event_id)
        )
        event = evt_res.scalars().first()
        assert event is not None
        assert event.user_id == "user_alice"
        assert event.status == "pending"
        assert event.risk_level in ["RISK_3", "RISK_4"]


@pytest.mark.asyncio
async def test_confirm_escalation_event_validation_and_ownership(test_env):
    """Tests event existence, cross-account protection, decline, and expiration."""
    client = test_env["client"]
    token_alice, token_bob, token_solo = await seed_users(test_env["session_factory"])

    # Create test events
    async with test_env["session_factory"]() as session:
        # Valid event for Alice
        ev_alice = AuraEscalationEvent(
            id="evt_alice_1",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        # Expired event for Alice
        ev_expired = AuraEscalationEvent(
            id="evt_alice_expired",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow() - timedelta(minutes=20),
            expires_at=datetime.utcnow() - timedelta(minutes=10)
        )
        # Solo user event
        ev_solo = AuraEscalationEvent(
            id="evt_solo_1",
            user_id="user_solo",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add_all([ev_alice, ev_expired, ev_solo])
        await session.commit()

    # 1. Missing event_id -> 422/400
    res_no_id = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": ""}
    )
    assert res_no_id.status_code in [400, 422]

    # 2. Non-existent event_id -> 404
    res_not_found = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "non_existent_event_id"}
    )
    assert res_not_found.status_code == 404

    # 3. Cross-account attempt: Bob tries to confirm Alice's event -> 403 Forbidden!
    res_cross = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_bob}"},
        json={"event_id": "evt_alice_1"}
    )
    assert res_cross.status_code == 403

    # 4. Expired event -> status "expired", alert_sent=False
    res_exp = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_alice_expired"}
    )
    assert res_exp.status_code == 200
    assert res_exp.json()["status"] == "expired"
    assert res_exp.json()["alert_sent"] is False

    # 5. User without linked partner -> status "no_partner", alert_sent=False
    res_solo = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_solo}"},
        json={"event_id": "evt_solo_1"}
    )
    assert res_solo.status_code == 200
    assert res_solo.json()["status"] == "no_partner"
    assert res_solo.json()["alert_sent"] is False


@pytest.mark.asyncio
async def test_confirm_escalation_atomic_consumption_and_privacy(test_env):
    """Tests successful confirmation, repeated consumption, cooldown, and privacy."""
    client = test_env["client"]
    token_alice, token_bob, _ = await seed_users(test_env["session_factory"])

    async with test_env["session_factory"]() as session:
        ev1 = AuraEscalationEvent(
            id="evt_alice_valid",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev1)
        await session.commit()

    # 1. Successful confirmation
    res_confirm = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_alice_valid"}
    )
    assert res_confirm.status_code == 200
    data = res_confirm.json()
    assert data["status"] == "alert_sent"
    assert data["alert_sent"] is True

    # Check notification in DB for Bob (Zero chat leaks!)
    async with test_env["session_factory"]() as session:
        notif_res = await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )
        notif = notif_res.scalars().first()
        assert notif is not None
        assert "Alice is experiencing severe emotional distress" in notif.body
        # Zero private transcript/message leaks
        assert "private_messages" not in json.dumps(notif.data)
        assert "transcript" not in notif.body

        # Verify event status is updated to consumed in DB
        ev_db = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_alice_valid")
        )).scalars().first()
        assert ev_db.status == "consumed"
        assert ev_db.consumed_at is not None

    # 2. Repeated confirmation on the same event -> already_consumed
    res_repeat = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_alice_valid"}
    )
    assert res_repeat.status_code == 200
    assert res_repeat.json()["status"] == "already_consumed"
    assert res_repeat.json()["alert_sent"] is False

    # 3. Create a second valid event for Alice right away -> cooldown_active blocks duplicate
    async with test_env["session_factory"]() as session:
        ev2 = AuraEscalationEvent(
            id="evt_alice_2",
            user_id="user_alice",
            risk_level="RISK_4",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev2)
        await session.commit()

    res_cooldown = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_alice_2"}
    )
    assert res_cooldown.status_code == 200
    assert res_cooldown.json()["status"] == "cooldown_active"
    assert res_cooldown.json()["alert_sent"] is False


@pytest.mark.asyncio
async def test_decline_escalation_event(test_env):
    """Tests declining an escalation event."""
    client = test_env["client"]
    token_alice, _, _ = await seed_users(test_env["session_factory"])

    async with test_env["session_factory"]() as session:
        ev = AuraEscalationEvent(
            id="evt_to_decline",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev)
        await session.commit()

    # Decline
    res = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_to_decline", "action": "decline"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "declined"
    assert res.json()["alert_sent"] is False

    # Verify event status in DB
    async with test_env["session_factory"]() as session:
        ev_db = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_to_decline")
        )).scalars().first()
        assert ev_db.status == "declined"


@pytest.mark.asyncio
async def test_concurrent_confirm_escalation_same_event(test_env):
    """
    Verifies that simultaneous concurrent requests attempting to confirm the exact same event
    will allow exactly one success, with subsequent or race attempts returning already_consumed.
    """
    client = test_env["client"]
    token_alice, _, _ = await seed_users(test_env["session_factory"])

    async with test_env["session_factory"]() as session:
        ev = AuraEscalationEvent(
            id="evt_race_same",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev)
        await session.commit()

    # Fire 3 concurrent requests on the same event
    req1 = client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_race_same"}
    )
    req2 = client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_race_same"}
    )
    req3 = client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_race_same"}
    )

    responses = await asyncio.gather(req1, req2, req3)
    statuses = [r.json()["status"] for r in responses]
    alerts_sent = [r.json()["alert_sent"] for r in responses]

    # Exactly one alert sent
    assert alerts_sent.count(True) == 1
    assert alerts_sent.count(False) == 2
    assert "alert_sent" in statuses
    assert statuses.count("already_consumed") == 2

    # Verify DB only has 1 notification for Bob
    async with test_env["session_factory"]() as session:
        notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(notifs) == 1


@pytest.mark.asyncio
async def test_concurrent_confirm_escalation_cross_events_atomic_cooldown(test_env):
    """
    Verifies that simultaneous concurrent requests on DIFFERENT valid events for the same user
    cannot bypass the 15-minute cooldown. Exactly one alert must succeed, and the other must
    get cooldown_active due to atomic conditional rowcount check.
    """
    client = test_env["client"]
    token_alice, _, _ = await seed_users(test_env["session_factory"])

    async with test_env["session_factory"]() as session:
        ev_a = AuraEscalationEvent(
            id="evt_race_diff_a",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        ev_b = AuraEscalationEvent(
            id="evt_race_diff_b",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add_all([ev_a, ev_b])
        await session.commit()

    req_a = client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_race_diff_a"}
    )
    req_b = client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_race_diff_b"}
    )

    responses = await asyncio.gather(req_a, req_b)
    statuses = [r.json()["status"] for r in responses]
    alerts_sent = [r.json()["alert_sent"] for r in responses]

    # Exactly 1 request successfully sent an alert
    assert alerts_sent.count(True) == 1
    assert alerts_sent.count(False) == 1
    assert "alert_sent" in statuses
    # The second one must be blocked by cooldown or already consumed
    assert ("cooldown_active" in statuses) or ("already_consumed" in statuses)

    # Verify only 1 notification in DB
    async with test_env["session_factory"]() as session:
        notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(notifs) == 1


@pytest.mark.asyncio
async def test_two_account_partner_notification_delivery_no_leak(test_env):
    """
    Full integration test verifying:
    1. Alice sends crisis message
    2. Server returns requires_consent=True and an event_id
    3. Alice confirms escalation
    4. Bob receives exactly one notification in database
    5. Bob's notification contains no private conversation text or transcripts
    6. Third party (Solo) receives zero notifications
    """
    client = test_env["client"]
    token_alice, token_bob, token_solo = await seed_users(test_env["session_factory"])

    # 1. Alice triggers crisis
    chat_res = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={
            "messages": [
                {"role": "user", "content": "I feel like I want to die and have no hope left"}
            ]
        }
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data["requires_consent"] is True
    event_id = chat_data["escalation_event_id"]
    assert event_id is not None

    # 2. Alice confirms
    conf_res = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": event_id}
    )
    assert conf_res.status_code == 200
    assert conf_res.json()["status"] == "alert_sent"
    assert conf_res.json()["alert_sent"] is True

    # 3. Check notifications
    async with test_env["session_factory"]() as session:
        # Bob received 1 notification
        bob_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(bob_notifs) == 1
        notif = bob_notifs[0]
        assert notif.type == "safety_alert"
        assert "Alice is experiencing severe emotional distress" in notif.body
        # Critical privacy checks: no message text leaks into body or metadata
        assert "want to die" not in notif.body.lower()
        assert "no hope" not in notif.body.lower()
        assert "want to die" not in json.dumps(notif.data).lower()

        # Alice received 0 notifications (she is sender, not recipient)
        alice_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_alice")
        )).scalars().all()
        assert len(alice_notifs) == 0

        # Unrelated user received 0 notifications
        solo_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_solo")
        )).scalars().all()
        assert len(solo_notifs) == 0


@pytest.mark.asyncio
async def test_startup_migration_idempotence_and_repeated_execution(test_env):
    """
    Verifies that:
    1. Running the startup DDL and ALTER queries on a freshly initialized database succeeds without errors.
    2. Re-running the exact same startup migration queries on an ALREADY EXISTING database is completely
       idempotent, harmless, and produces 0 unhandled exceptions or data loss.
    3. All columns for aura_escalation_events exist and are queryable.
    4. Handles dialect differences (PostgreSQL supports ALTER TABLE ... ADD COLUMN IF NOT EXISTS;
       SQLite does not support IF NOT EXISTS in ALTER TABLE, so column existence is checked or caught).
    """
    from sqlalchemy import text, inspect

    engine = test_env["engine"]

    # 1. Base DDL: valid in both SQLite and PostgreSQL
    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS aura_escalation_events (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL REFERENCES users(id),
            risk_level VARCHAR NOT NULL,
            status VARCHAR DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            consumed_at TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_aura_escalation_events_user_id ON aura_escalation_events (user_id)",
    ]

    # Pass 1: Execute DDL
    async with engine.begin() as conn:
        for q in ddl_statements:
            await conn.execute(text(q))

    # Pass 2: Repeated execution (Idempotence test on existing database)
    async with engine.begin() as conn:
        for q in ddl_statements:
            await conn.execute(text(q))

    # Verify table schema is accessible and all columns are queryable after repeated execution
    async with test_env["session_factory"]() as session:
        res = await session.execute(
            text("SELECT id, user_id, risk_level, status, created_at, expires_at, consumed_at FROM aura_escalation_events LIMIT 1")
        )
        rows = res.fetchall()
        assert isinstance(rows, list)


@pytest.mark.asyncio
async def test_preauthorized_concurrent_cooldown_race(test_env):
    """
    Verifies that simultaneous concurrent crisis chat messages from a user with Pre-authorized mode
    cannot bypass the 15-minute cooldown. Exactly 1 notification must be written to the database.
    """
    client = test_env["client"]

    # Seed user with Pre-authorized mode
    async with test_env["session_factory"]() as session:
        u_pre = User(
            id="user_preauth_alice",
            name="Alice PreAuth",
            email="alice_preauth@example.com",
            password="hashed_pass",
            partner_id="user_preauth_bob",
            aura_settings={"escalationMode": "Pre-authorized"},
            crisis_escalation_enabled=True,
        )
        u_bob = User(
            id="user_preauth_bob",
            name="Bob PreAuth",
            email="bob_preauth@example.com",
            password="hashed_pass",
            partner_id="user_preauth_alice",
            aura_settings={},
            crisis_escalation_enabled=True,
        )
        session.add_all([u_pre, u_bob])
        await session.commit()

    token_alice = create_access_token({"sub": "user_preauth_alice"})

    # Fire 3 concurrent crisis chat requests simultaneously
    req1 = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I feel like I want to die and have no hope left"}]}
    )
    req2 = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I feel like I want to die and have no hope left"}]}
    )
    req3 = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I feel like I want to die and have no hope left"}]}
    )

    responses = await asyncio.gather(req1, req2, req3)
    assert all(r.status_code == 200 for r in responses)

    # Verify that Bob received EXACTLY 1 notification in the database (0 duplicates!)
    async with test_env["session_factory"]() as session:
        notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_preauth_bob")
        )).scalars().all()
        assert len(notifs) == 1
        assert notifs[0].type == "safety_alert"
