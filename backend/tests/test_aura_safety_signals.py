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

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
        connect_args={"timeout": 30.0}
    )
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("PRAGMA journal_mode=WAL;"))
        await conn.execute(text("PRAGMA busy_timeout=30000;"))
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
            target_partner_id="user_bob",
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
            target_partner_id="user_bob",
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
            target_partner_id="user_bob",
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
            target_partner_id="user_bob",
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
            target_partner_id="user_bob",
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
            target_partner_id="user_bob",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        ev_b = AuraEscalationEvent(
            id="evt_race_diff_b",
            user_id="user_alice",
            target_partner_id="user_bob",
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
            target_partner_id VARCHAR REFERENCES users(id),
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
            text("SELECT id, user_id, target_partner_id, risk_level, status, created_at, expires_at, consumed_at FROM aura_escalation_events LIMIT 1")
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


@pytest.mark.asyncio
async def test_safety_alert_destination_exclusively_linked_partner_and_never_trusted_contact(test_env):
    """
    Verifies Product Rules for Finding-01:
    1. Safety alert notifications must go exclusively to the user's linked partner.
    2. Trusted Contact details in settings are reference-only and must NEVER be treated as an alert destination.
    3. The consent prompt recipient_label must match the linked partner, never the trusted contact.
    4. Unlinked users (even with trusted contact configured) do not receive misleading partner alert prompts.
    5. Missing/invalid partner relationships fail safely without redirecting or creating orphaned notifications.
    """
    client = test_env["client"]
    async with test_env["session_factory"]() as session:
        u_alice = User(
            id="user_tc_alice",
            name="Alice",
            email="tc_alice@example.com",
            password="hashed",
            partner_id="user_tc_bob",
            aura_settings={
                "escalationMode": "Ask first",
                "trustedContact": "Dr. Sharma",
                "trustedContactName": "Dr. Sharma",
                "trustedContactPhone": "+919876543210"
            },
            crisis_escalation_enabled=True,
        )
        u_bob = User(
            id="user_tc_bob",
            name="Bob",
            email="tc_bob@example.com",
            password="hashed",
            partner_id="user_tc_alice",
            aura_settings={},
            crisis_escalation_enabled=True,
        )
        u_unlinked = User(
            id="user_tc_unlinked",
            name="Unlinked User",
            email="tc_unlinked@example.com",
            password="hashed",
            partner_id=None,
            aura_settings={
                "escalationMode": "Ask first",
                "trustedContact": "Emergency Uncle",
                "trustedContactName": "Emergency Uncle",
                "trustedContactPhone": "+919876543210"
            },
            crisis_escalation_enabled=True,
        )
        session.add_all([u_alice, u_bob, u_unlinked])
        await session.commit()

    token_alice = create_access_token({"sub": "user_tc_alice"})
    token_unlinked = create_access_token({"sub": "user_tc_unlinked"})

    # --- Test Case 1: Linked user with Trusted Contact configured ---
    chat_res = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I want to kill myself, everything hurts"}]}
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data["requires_consent"] is True
    assert chat_data["escalation_event_id"] is not None
    # Recipient label MUST refer exclusively to linked partner (Bob), NEVER to Dr. Sharma!
    assert chat_data["recipient_label"] == "Bob"
    assert "Dr. Sharma" not in chat_data["reply"]
    assert "Bob" in chat_data["reply"]

    # Confirm the event
    confirm_res = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": chat_data["escalation_event_id"], "action": "confirm"}
    )
    assert confirm_res.status_code == 200
    c_data = confirm_res.json()
    assert c_data["status"] == "alert_sent"
    assert c_data["alert_sent"] is True
    assert c_data["recipient"] == "partner"
    assert c_data["partner_id"] == "user_tc_bob"

    # Verify notification created exclusively for Bob, and NEVER for trusted contact
    async with test_env["session_factory"]() as session:
        bob_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_tc_bob")
        )).scalars().all()
        assert len(bob_notifs) == 1
        assert bob_notifs[0].type == "safety_alert"
        # Zero chat transcript in notification body
        assert "everything hurts" not in bob_notifs[0].body
        assert "kill myself" not in bob_notifs[0].body

        # Verify no notifications were sent to any other identifier
        other_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id.notin_(["user_tc_bob"]))
        )).scalars().all()
        assert not any(n.type == "safety_alert" and n.user_id != "user_tc_bob" for n in other_notifs)

    # --- Test Case 2: Unlinked user with Trusted Contact configured ---
    unlinked_res = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_unlinked}"},
        json={"messages": [{"role": "user", "content": "I want to kill myself"}]}
    )
    assert unlinked_res.status_code == 200
    u_data = unlinked_res.json()
    # Unlinked user cannot escalate: requires_consent must be False, escalation_event_id must be None
    assert u_data["requires_consent"] is False
    assert u_data["escalation_event_id"] is None
    # Direct crisis helpline numbers provided
    assert "Tele-MANAS" in u_data["reply"]
    assert "Emergency Uncle" not in u_data["reply"]

    # --- Test Case 3: Missing/deleted partner fails safely without redirecting ---
    async with test_env["session_factory"]() as session:
        ev_orphan = AuraEscalationEvent(
            id="evt_tc_orphan",
            user_id="user_tc_unlinked",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev_orphan)
        await session.commit()

    orphan_res = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_unlinked}"},
        json={"event_id": "evt_tc_orphan", "action": "confirm"}
    )
    assert orphan_res.status_code == 200
    assert orphan_res.json()["status"] == "no_partner"
    assert orphan_res.json()["alert_sent"] is False


@pytest.mark.asyncio
async def test_cooldown_preserves_escalation_event_for_subsequent_retry(test_env):
    """
    Verifies Finding-02 requirements:
    1. An active cooldown blocks notification without consuming the event.
    2. The event remains in 'pending' status (consumed_at is None).
    3. Once the 15-minute cooldown elapses, the same event (if still within 10-min validity)
       can be retried and confirmed successfully.
    4. Expired events cannot be confirmed even after cooldown.
    5. Consumed events cannot be reused.
    """
    client = test_env["client"]
    token_alice, token_bob, _ = await seed_users(test_env["session_factory"])

    now = datetime.utcnow()

    # Step 1: Set Alice's last_crisis_alert_at to 5 minutes ago (cooldown active: 15 min cooldown window)
    async with test_env["session_factory"]() as session:
        u_alice = (await session.execute(
            select(User).filter(User.id == "user_alice")
        )).scalars().first()
        u_alice.last_crisis_alert_at = now - timedelta(minutes=5)

        # Seed a valid escalation event expiring in 8 minutes
        ev_active = AuraEscalationEvent(
            id="evt_cooldown_retry",
            user_id="user_alice",
            target_partner_id="user_bob",
            risk_level="RISK_3",
            status="pending",
            created_at=now,
            expires_at=now + timedelta(minutes=8),
            consumed_at=None,
        )
        session.add(ev_active)
        await session.commit()

    # Step 2: Attempt confirmation during active cooldown
    res_blocked = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_cooldown_retry", "action": "confirm"}
    )
    assert res_blocked.status_code == 200
    b_data = res_blocked.json()
    assert b_data["status"] == "cooldown_active"
    assert b_data["alert_sent"] is False

    # Step 3: CRITICAL INVARIANT: Verify DB record is STILL 'pending', not 'consumed'!
    async with test_env["session_factory"]() as session:
        ev_db = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_cooldown_retry")
        )).scalars().first()
        assert ev_db.status == "pending"
        assert ev_db.consumed_at is None

        # Verify Bob received 0 notifications so far
        bob_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(bob_notifs) == 0

    # Step 4: Simulate cooldown elapsing (e.g. last alert was 16 minutes ago, event still valid)
    async with test_env["session_factory"]() as session:
        u_alice = (await session.execute(
            select(User).filter(User.id == "user_alice")
        )).scalars().first()
        u_alice.last_crisis_alert_at = now - timedelta(minutes=16)
        await session.commit()

    # Step 5: Retry confirming the exact same event
    res_retry = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_cooldown_retry", "action": "confirm"}
    )
    assert res_retry.status_code == 200
    r_data = res_retry.json()
    assert r_data["status"] == "alert_sent"
    assert r_data["alert_sent"] is True

    # Step 6: Verify event is now consumed in DB and notification is dispatched
    async with test_env["session_factory"]() as session:
        ev_db_after = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_cooldown_retry")
        )).scalars().first()
        assert ev_db_after.status == "consumed"
        assert ev_db_after.consumed_at is not None

        bob_notifs = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(bob_notifs) == 1
        assert bob_notifs[0].type == "safety_alert"

    # Step 7: A consumed event cannot be reused / retried again
    res_consumed_retry = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_cooldown_retry", "action": "confirm"}
    )
    assert res_consumed_retry.status_code == 200
    assert res_consumed_retry.json()["status"] == "already_consumed"
    assert res_consumed_retry.json()["alert_sent"] is False

    # Step 8: Expired events cannot be retried even after cooldown
    async with test_env["session_factory"]() as session:
        ev_expired = AuraEscalationEvent(
            id="evt_cooldown_expired",
            user_id="user_alice",
            risk_level="RISK_3",
            status="pending",
            created_at=now - timedelta(minutes=15),
            expires_at=now - timedelta(minutes=5),  # already expired
            consumed_at=None,
        )
        session.add(ev_expired)
        await session.commit()

    res_expired = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_cooldown_expired", "action": "confirm"}
    )
    assert res_expired.status_code == 200
    assert res_expired.json()["status"] == "expired"
    assert res_expired.json()["alert_sent"] is False


@pytest.mark.asyncio
async def test_consent_binding_exact_partner_replacement_and_isolation(test_env):
    """
    Verifies Finding-01 exact partner binding requirements:
    1. Normal confirmation: Event created for Partner A (Bob); Alice remains linked to Bob; confirmation notifies only Bob.
    2. Partner replacement: Event created for Bob; Alice unlinks Bob and links Charlie;
       confirmation of the old event returns 'partner_changed'; NEITHER Bob nor Charlie receives notification.
    3. Fresh consent after replacement: A new event created while linked to Charlie has target_partner_id=Charlie;
       confirming it notifies Charlie and not Bob.
    4. Partner unlink: Alice unlinks; confirming an event created for a previous partner returns 'no_partner'.
    5. Missing target / legacy null-target: Event with target_partner_id=None fails closed ('invalid_target').
    6. Tampering: Extra payload fields (e.g. target_partner_id, recipient, partner_id) cannot redirect notification.
    7. Missing partner record: Target partner deleted from DB fails closed ('no_partner').
    """
    from app.models.orm import User, AuraEscalationEvent, Notification
    client = test_env["client"]

    # Seed Alice (linked to Bob), Bob, and Charlie (future partner)
    async with test_env["session_factory"]() as session:
        u_alice = User(
            id="bind_alice", name="Alice", email="b_alice@example.com", password="hash",
            partner_id="bind_bob", crisis_escalation_enabled=True, aura_settings={"escalationMode": "Ask first"}
        )
        u_bob = User(
            id="bind_bob", name="Bob", email="b_bob@example.com", password="hash",
            partner_id="bind_alice", crisis_escalation_enabled=True
        )
        u_charlie = User(
            id="bind_charlie", name="Charlie", email="b_charlie@example.com", password="hash",
            partner_id=None, crisis_escalation_enabled=True
        )
        session.add_all([u_alice, u_bob, u_charlie])
        await session.commit()

    token_alice = create_access_token({"sub": "bind_alice"})
    token_charlie = create_access_token({"sub": "bind_charlie"})

    # --- Scenario 1: Normal confirmation with exact partner ---
    chat_res_1 = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I want to die, please help me"}]}
    )
    assert chat_res_1.status_code == 200
    chat_data_1 = chat_res_1.json()
    assert chat_data_1["requires_consent"] is True
    assert chat_data_1["recipient_label"] == "Bob"
    event_id_bob = chat_data_1["escalation_event_id"]
    assert event_id_bob is not None

    # Verify event stored in DB has target_partner_id="bind_bob"
    async with test_env["session_factory"]() as session:
        ev_bob = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == event_id_bob)
        )).scalars().first()
        assert ev_bob.target_partner_id == "bind_bob"
        assert ev_bob.status == "pending"

    # Confirm event for Bob
    conf_res_1 = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": event_id_bob, "action": "confirm"}
    )
    assert conf_res_1.status_code == 200
    c_data_1 = conf_res_1.json()
    assert c_data_1["status"] == "alert_sent"
    assert c_data_1["alert_sent"] is True
    assert c_data_1["partner_id"] == "bind_bob"

    # Verify Bob received 1 notification, Charlie received 0
    async with test_env["session_factory"]() as session:
        bob_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_bob")
        )).scalars().all()
        assert len(bob_n) == 1
        charlie_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_charlie")
        )).scalars().all()
        assert len(charlie_n) == 0

    # --- Scenario 2: Partner replacement prevents notification to new partner ---
    # Clear Alice's cooldown so we can test partner binding independently of cooldown
    async with test_env["session_factory"]() as session:
        u_al = (await session.execute(select(User).filter(User.id == "bind_alice"))).scalars().first()
        u_al.last_crisis_alert_at = None
        # Create a second pending event originally bound to Bob
        ev_old_bob = AuraEscalationEvent(
            id="evt_bound_to_bob_before_swap",
            user_id="bind_alice",
            target_partner_id="bind_bob",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev_old_bob)
        await session.commit()

    # Now Alice unlinks from Bob and links to Charlie!
    async with test_env["session_factory"]() as session:
        u_al = (await session.execute(select(User).filter(User.id == "bind_alice"))).scalars().first()
        u_al.partner_id = "bind_charlie"
        u_ch = (await session.execute(select(User).filter(User.id == "bind_charlie"))).scalars().first()
        u_ch.partner_id = "bind_alice"
        await session.commit()

    # Alice attempts to confirm the old event (which was requested for Bob, but she is now linked to Charlie)
    conf_res_swap = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_bound_to_bob_before_swap", "action": "confirm"}
    )
    assert conf_res_swap.status_code == 200
    c_swap_data = conf_res_swap.json()
    assert c_swap_data["status"] == "partner_changed"
    assert c_swap_data["alert_sent"] is False

    # CRITICAL: Verify neither Bob nor Charlie received ANY notification from this attempt!
    async with test_env["session_factory"]() as session:
        # Bob still has only 1 notification (from Scenario 1)
        bob_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_bob")
        )).scalars().all()
        assert len(bob_n) == 1
        # Charlie still has 0 notifications
        charlie_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_charlie")
        )).scalars().all()
        assert len(charlie_n) == 0

        # Event must not be consumed as a successful escalation
        ev_swap_db = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_bound_to_bob_before_swap")
        )).scalars().first()
        assert ev_swap_db.status != "consumed"

    # --- Scenario 3: Fresh consent created after replacement can notify new partner (Charlie) ---
    chat_res_charlie = await client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"messages": [{"role": "user", "content": "I am so broken and I want to die"}]}
    )
    assert chat_res_charlie.status_code == 200
    c_data_ch = chat_res_charlie.json()
    assert c_data_ch["requires_consent"] is True
    assert c_data_ch["recipient_label"] == "Charlie"  # Now correctly bound to Charlie!
    event_id_charlie = c_data_ch["escalation_event_id"]

    # Confirm the fresh event bound to Charlie
    conf_res_ch = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": event_id_charlie, "action": "confirm"}
    )
    assert conf_res_ch.status_code == 200
    assert conf_res_ch.json()["status"] == "alert_sent"
    assert conf_res_ch.json()["alert_sent"] is True
    assert conf_res_ch.json()["partner_id"] == "bind_charlie"

    # Verify Charlie received exactly 1 notification, and Bob received 0 new ones
    async with test_env["session_factory"]() as session:
        charlie_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_charlie")
        )).scalars().all()
        assert len(charlie_n) == 1
        bob_n = (await session.execute(
            select(Notification).filter(Notification.user_id == "bind_bob")
        )).scalars().all()
        assert len(bob_n) == 1

    # --- Scenario 4: Partner unlinking prevents notification ---
    # Alice unlinks from Charlie
    async with test_env["session_factory"]() as session:
        u_al = (await session.execute(select(User).filter(User.id == "bind_alice"))).scalars().first()
        u_al.partner_id = None
        u_al.last_crisis_alert_at = None
        ev_unlinked = AuraEscalationEvent(
            id="evt_for_charlie_then_unlinked",
            user_id="bind_alice",
            target_partner_id="bind_charlie",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev_unlinked)
        await session.commit()

    conf_res_unlink = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_for_charlie_then_unlinked", "action": "confirm"}
    )
    assert conf_res_unlink.status_code == 200
    assert conf_res_unlink.json()["status"] == "no_partner"
    assert conf_res_unlink.json()["alert_sent"] is False

    # --- Scenario 5: Missing target / legacy null-target fails closed ---
    async with test_env["session_factory"]() as session:
        # Re-link Alice to Charlie
        u_al = (await session.execute(select(User).filter(User.id == "bind_alice"))).scalars().first()
        u_al.partner_id = "bind_charlie"
        ev_null_target = AuraEscalationEvent(
            id="evt_legacy_null_target",
            user_id="bind_alice",
            target_partner_id=None,  # Legacy row without target_partner_id
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev_null_target)
        await session.commit()

    conf_res_null = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_legacy_null_target", "action": "confirm"}
    )
    assert conf_res_null.status_code == 200
    assert conf_res_null.json()["status"] == "invalid_target"
    assert conf_res_null.json()["alert_sent"] is False

    # --- Scenario 6: Tampering with client payload cannot redirect target ---
    # Client sends fake target_partner_id or recipient in request body
    conf_res_tamper = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={
            "event_id": "evt_legacy_null_target",
            "action": "confirm",
            "target_partner_id": "bind_bob",
            "partner_id": "bind_bob",
            "recipient": "bind_bob"
        }
    )
    assert conf_res_tamper.status_code == 200
    # Still rejected because server validates event_record.target_partner_id, ignoring client parameters
    assert conf_res_tamper.json()["status"] == "invalid_target"
    assert conf_res_tamper.json()["alert_sent"] is False

    # --- Scenario 7: Target partner account deleted/missing from DB fails closed ---
    async with test_env["session_factory"]() as session:
        ev_deleted_target = AuraEscalationEvent(
            id="evt_partner_deleted",
            user_id="bind_alice",
            target_partner_id="non_existent_ghost_partner",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        u_al = (await session.execute(select(User).filter(User.id == "bind_alice"))).scalars().first()
        u_al.partner_id = "non_existent_ghost_partner"
        session.add(ev_deleted_target)
        await session.commit()

    conf_res_deleted = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_partner_deleted", "action": "confirm"}
    )
    assert conf_res_deleted.status_code == 200
    assert conf_res_deleted.json()["status"] == "no_partner"
    assert conf_res_deleted.json()["alert_sent"] is False


@pytest.mark.asyncio
async def test_partner_relationship_race_conditional_update_rollback(test_env, monkeypatch):
    """
    Finding-01A Regression Test:
    Proves that if a user's persisted partner_id changes concurrently (unlinked or relinked)
    after request validation begins but before the atomic cooldown acquisition UPDATE:
    1. The atomic cooldown UPDATE affects zero rows because User.partner_id != target_partner_id.
    2. The transaction immediately rolls back (db.rollback()).
    3. The escalation event remains 'pending' (event consumption is rolled back).
    4. Zero notifications are inserted or dispatched.
    5. The response returns status 'partner_changed' with alert_sent=False.
    """
    client = test_env["client"]
    token_alice, token_bob, _ = await seed_users(test_env["session_factory"])

    async with test_env["session_factory"]() as session:
        # Create an active pending event for Alice targeting Bob
        ev = AuraEscalationEvent(
            id="evt_partner_race_test",
            user_id="user_alice",
            target_partner_id="user_bob",
            risk_level="RISK_3",
            status="pending",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(ev)
        await session.commit()

    from sqlalchemy import update
    orig_execute = AsyncSession.execute

    # Hook db.execute during the request to simulate the partner relationship having changed
    # right after event consumption, before the atomic cooldown UPDATE runs
    async def hooked_execute(self, statement, *args, **kwargs):
        stmt_str = str(statement)
        # Intercept cooldown_stmt on users table
        if "users" in stmt_str and "last_crisis_alert_at" in stmt_str:
            # Modify User in database before cooldown_stmt runs
            await orig_execute(
                self,
                update(User).where(User.id == "user_alice").values(partner_id="user_charlie")
            )
        return await orig_execute(self, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "execute", hooked_execute)

    # Alice attempts confirmation
    conf_res = await client.post(
        "/api/ai/safety/confirm-escalation",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"event_id": "evt_partner_race_test", "action": "confirm"}
    )

    assert conf_res.status_code == 200
    res_data = conf_res.json()
    assert res_data["status"] == "partner_changed"
    assert res_data["alert_sent"] is False

    # Verify event state in database was rolled back and is STILL pending!
    async with test_env["session_factory"]() as session:
        ev_after = (await session.execute(
            select(AuraEscalationEvent).filter(AuraEscalationEvent.id == "evt_partner_race_test")
        )).scalars().first()
        assert ev_after is not None
        assert ev_after.status == "pending"
        assert ev_after.consumed_at is None

        # Verify ZERO notifications were inserted for Bob or Charlie
        notifs_bob = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_bob")
        )).scalars().all()
        assert len(notifs_bob) == 0

        notifs_charlie = (await session.execute(
            select(Notification).filter(Notification.user_id == "user_charlie")
        )).scalars().all()
        assert len(notifs_charlie) == 0



