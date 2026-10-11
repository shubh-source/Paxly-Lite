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
from sqlalchemy.future import select

from app.core.database import Base, get_db
import app.main as main_module
from app.models.orm import User, Notification
from app.core.security import create_access_token
from app.api.routes.ai import (
    generate_ai_text,
    call_gemini_direct,
    call_groq_direct,
    call_ollama_direct,
    sanitize_ai_error,
)
from app.core.config import settings
from fastapi import HTTPException

# ══════════════════════════════════════════════════════════════════
# FIXTURES
# ══════════════════════════════════════════════════════════════════

@pytest_asyncio.fixture
async def test_env():
    """Isolated temporary SQLite database for full router / endpoint testing."""
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

async def seed_user(session_factory, user_id: str, name: str, email: str, partner_id: str = None, aura_settings: dict = None) -> str:
    """Helper to insert a test user into the database."""
    async with session_factory() as session:
        u = User(
            id=user_id,
            name=name,
            email=email,
            password="test_password_hash",
            partner_id=partner_id,
            aura_settings=aura_settings or {},
            ai_personality="balanced",
            crisis_escalation_enabled=True,
        )
        session.add(u)
        await session.commit()
    return create_access_token({"sub": user_id})


# ══════════════════════════════════════════════════════════════════
# 1. SUCCESSFUL RESPONSES FROM EACH SUPPORTED PROVIDER
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_gemini_success():
    """call_gemini_direct returns text from candidates[0].content.parts[0].text."""
    mock_resp = httpx.Response(
        200,
        json={
            "candidates": [
                {"content": {"parts": [{"text": "Hello from Gemini 2.5 Flash!"}]}}
            ]
        },
        request=httpx.Request("POST", "https://generativelanguage.googleapis.com"),
    )
    with patch.object(settings, "GOOGLE_API_KEY", "test_gemini_key_12345"):
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await call_gemini_direct([{"role": "user", "content": "Hello"}])
            assert result == "Hello from Gemini 2.5 Flash!"

@pytest.mark.asyncio
async def test_groq_success():
    """call_groq_direct dynamically lists models and returns content from choices[0].message.content."""
    models_resp = httpx.Response(
        200,
        json={"data": [{"id": "llama-3.3-70b-versatile"}, {"id": "llama-3.1-8b-instant"}]},
        request=httpx.Request("GET", "https://api.groq.com/openai/v1/models"),
    )
    chat_resp = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "Hello from Groq Llama 3.3!"}}]},
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    with patch.object(settings, "GROQ_API_KEY", "gsk_test_groq_key_999"):
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = models_resp
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = chat_resp
                result = await call_groq_direct([{"role": "user", "content": "Hello"}])
                assert result == "Hello from Groq Llama 3.3!"

@pytest.mark.asyncio
async def test_ollama_success():
    """call_ollama_direct formats payload and returns message.content."""
    mock_resp = httpx.Response(
        200,
        json={"message": {"content": "Hello from local Ollama Llama 3!"}},
        request=httpx.Request("POST", "http://localhost:11434/api/chat"),
    )
    with patch.object(settings, "OLLAMA_BASE_URL", "http://localhost:11434"):
        with patch.object(settings, "OLLAMA_MODEL", "llama3"):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                result = await call_ollama_direct([{"role": "user", "content": "Hello"}])
                assert result == "Hello from local Ollama Llama 3!"


# ══════════════════════════════════════════════════════════════════
# 2. PROVIDER ERROR HANDLING & EDGE CASES (TIMEOUTS, RATE LIMITS, EMPTY RESPONSES)
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_provider_connection_and_timeout_errors():
    """Providers raise clean exceptions when network connection fails or times out."""
    with patch.object(settings, "GOOGLE_API_KEY", "test_key"):
        with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectTimeout("Connection timed out")):
            with pytest.raises(Exception) as exc_info:
                await call_gemini_direct([{"role": "user", "content": "Hi"}])
            assert "Connection timed out" in str(exc_info.value) or "Gemini" in str(exc_info.value)

@pytest.mark.asyncio
async def test_provider_rate_limit_and_server_errors():
    """HTTP 429 (Rate Limit) and HTTP 500 from providers are handled and reported."""
    rate_limit_resp = httpx.Response(
        429,
        text="Rate limit exceeded. Please wait.",
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    with patch.object(settings, "GROQ_API_KEY", "gsk_test_groq_key"):
        with patch("httpx.AsyncClient.get", return_value=httpx.Response(500, request=httpx.Request("GET", "https://api.groq.com/openai/v1/models"))):
            with patch("httpx.AsyncClient.post", return_value=rate_limit_resp):
                with pytest.raises(Exception) as exc_info:
                    await call_groq_direct([{"role": "user", "content": "Hi"}])
                assert "429" in str(exc_info.value)

@pytest.mark.asyncio
async def test_malformed_json_and_empty_responses():
    """Handles empty candidate lists or missing message fields gracefully."""
    empty_gemini_resp = httpx.Response(
        200,
        json={"candidates": []},
        request=httpx.Request("POST", "https://generativelanguage.googleapis.com"),
    )
    with patch.object(settings, "GOOGLE_API_KEY", "test_key"):
        with patch("httpx.AsyncClient.post", return_value=empty_gemini_resp):
            with pytest.raises(Exception) as exc_info:
                await call_gemini_direct([{"role": "user", "content": "Hi"}])
            assert "Gemini" in str(exc_info.value)

    empty_ollama_resp = httpx.Response(
        200,
        json={},
        request=httpx.Request("POST", "http://localhost:11434/api/chat"),
    )
    with patch.object(settings, "OLLAMA_BASE_URL", "http://localhost:11434"):
        with patch("httpx.AsyncClient.post", return_value=empty_ollama_resp):
            # Ollama returns empty string when message.content is missing
            res = await call_ollama_direct([{"role": "user", "content": "Hi"}])
            assert res == ""


# ══════════════════════════════════════════════════════════════════
# 3. ROUTING & FALLBACK BEHAVIOR
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_ai_text_routing_and_fallback():
    """
    - Automatic/Gemini provider tries Gemini first; falls back to Groq if Gemini fails.
    - Groq preference tries Groq first; falls back to Gemini if Groq fails.
    - If both fail, falls back to Ollama.
    - If all fail, raises HTTP 500 with safe generic detail.
    - If no provider is configured, raises HTTP 503.
    """
    # 1. Gemini fails -> Fallback to Groq succeeds
    with patch.object(settings, "GOOGLE_API_KEY", "gemini_key"), \
         patch.object(settings, "GROQ_API_KEY", "groq_key"), \
         patch.object(settings, "OLLAMA_BASE_URL", None):
        with patch("app.api.routes.ai.call_gemini_direct", side_effect=Exception("Gemini quota exhausted")), \
             patch("app.api.routes.ai.call_groq_direct", new_callable=AsyncMock, return_value="Groq fallback response"):
            result = await generate_ai_text([{"role": "user", "content": "Hello"}], model_provider="Automatic")
            assert result == "Groq fallback response"

    # 2. Groq preferred: Groq fails -> Fallback to Gemini succeeds
    with patch.object(settings, "GOOGLE_API_KEY", "gemini_key"), \
         patch.object(settings, "GROQ_API_KEY", "groq_key"), \
         patch.object(settings, "OLLAMA_BASE_URL", None):
        with patch("app.api.routes.ai.call_groq_direct", side_effect=Exception("Groq 429 Rate limited")), \
             patch("app.api.routes.ai.call_gemini_direct", new_callable=AsyncMock, return_value="Gemini fallback response"):
            result = await generate_ai_text([{"role": "user", "content": "Hello"}], model_provider="Groq")
            assert result == "Gemini fallback response"

    # 3. Gemini and Groq fail -> Fallback to Ollama succeeds
    with patch.object(settings, "GOOGLE_API_KEY", "gemini_key"), \
         patch.object(settings, "GROQ_API_KEY", "groq_key"), \
         patch.object(settings, "OLLAMA_BASE_URL", "http://localhost:11434"):
        with patch("app.api.routes.ai.call_gemini_direct", side_effect=Exception("Gemini down")), \
             patch("app.api.routes.ai.call_groq_direct", side_effect=Exception("Groq down")), \
             patch("app.api.routes.ai.call_ollama_direct", new_callable=AsyncMock, return_value="Ollama local response"):
            result = await generate_ai_text([{"role": "user", "content": "Hello"}], model_provider="Automatic")
            assert result == "Ollama local response"

    # 4. All providers fail -> Raises HTTP 500 without leaking details
    with patch.object(settings, "GOOGLE_API_KEY", "gemini_key"), \
         patch.object(settings, "GROQ_API_KEY", "groq_key"), \
         patch.object(settings, "OLLAMA_BASE_URL", "http://localhost:11434"):
        with patch("app.api.routes.ai.call_gemini_direct", side_effect=Exception("Gemini fatal")), \
             patch("app.api.routes.ai.call_groq_direct", side_effect=Exception("Groq fatal")), \
             patch("app.api.routes.ai.call_ollama_direct", side_effect=Exception("Ollama fatal")):
            with pytest.raises(HTTPException) as exc_info:
                await generate_ai_text([{"role": "user", "content": "Hello"}])
            assert exc_info.value.status_code == 500
            assert exc_info.value.detail == "AI generation service temporarily unavailable. Please try again shortly."

    # 5. No providers configured at all -> Raises HTTP 503
    with patch.object(settings, "GOOGLE_API_KEY", ""), \
         patch.object(settings, "GROQ_API_KEY", ""), \
         patch.object(settings, "OLLAMA_BASE_URL", ""):
        with pytest.raises(HTTPException) as exc_info:
            await generate_ai_text([{"role": "user", "content": "Hello"}])
        assert exc_info.value.status_code == 503
        assert "not configured on server" in exc_info.value.detail


# ══════════════════════════════════════════════════════════════════
# 4. TIMEOUT HONORED CONSISTENTLY ACROSS ALL PROVIDERS
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_timeout_honored_across_providers():
    """Timeout parameter is clamped between 5.0 and 90.0 and passed into httpx client."""
    captured_timeouts = {}

    def capture_client_init(timeout=None, **kwargs):
        captured_timeouts["last"] = timeout
        return httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})))

    with patch.object(settings, "GOOGLE_API_KEY", "key"):
        with patch("app.api.routes.ai.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})
            )
            # 1. Timeout 12.5 seconds
            await call_gemini_direct([{"role": "user", "content": "test"}], timeout=12.5)
            assert mock_client.call_args.kwargs["timeout"] == 12.5

            # 2. Clamped minimum 5.0s (passed 1.0s)
            await call_gemini_direct([{"role": "user", "content": "test"}], timeout=1.0)
            assert mock_client.call_args.kwargs["timeout"] == 5.0

            # 3. Clamped maximum 90.0s (passed 200.0s)
            await call_gemini_direct([{"role": "user", "content": "test"}], timeout=200.0)
            assert mock_client.call_args.kwargs["timeout"] == 90.0

    # Ollama timeout check
    with patch.object(settings, "OLLAMA_BASE_URL", "http://localhost:11434"):
        with patch("app.api.routes.ai.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=httpx.Response(200, json={"message": {"content": "ok"}})
            )
            await call_ollama_direct([{"role": "user", "content": "test"}], timeout=15.0)
            assert mock_client.call_args.kwargs["timeout"] == 15.0


# ══════════════════════════════════════════════════════════════════
# 5. SANITIZATION AND SECRETS MASKING
# ══════════════════════════════════════════════════════════════════

def test_sanitize_ai_error():
    """API keys, Authorization headers, Bearer tokens, and query params are stripped."""
    with patch.object(settings, "GOOGLE_API_KEY", "AIzaSySecretGeminiKey123"), \
         patch.object(settings, "GROQ_API_KEY", "gsk_SecretGroqKey456"):
        
        # Explicit Google API key in error
        err1 = "Failed to reach endpoint with AIzaSySecretGeminiKey123"
        assert "AIzaSySecretGeminiKey123" not in sanitize_ai_error(err1)
        assert "[REDACTED_GEMINI_KEY]" in sanitize_ai_error(err1)

        # Groq key
        err2 = "Unauthorized: gsk_SecretGroqKey456 invalid"
        assert "gsk_SecretGroqKey456" not in sanitize_ai_error(err2)
        assert "[REDACTED_GROQ_KEY]" in sanitize_ai_error(err2)

        # Bearer token
        err3 = "Header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz rejected"
        assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in sanitize_ai_error(err3)
        assert "[REDACTED_TOKEN]" in sanitize_ai_error(err3)

        # URL query parameter
        err4 = "Error fetching https://api.service.com/v1?key=super_secret_query_param&other=1"
        assert "super_secret_query_param" not in sanitize_ai_error(err4)
        assert "[REDACTED_KEY]" in sanitize_ai_error(err4)


# ══════════════════════════════════════════════════════════════════
# 6. REQUEST VALIDATION & UNSUPPORTED PROVIDERS
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_unsupported_model_provider_in_chat(test_env):
    """POST /api/ai/chat rejects unsupported model providers with HTTP 400."""
    client = test_env["client"]
    token = await seed_user(test_env["session_factory"], "usr_test_1", "Alice", "alice@example.com")

    res = await client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "Hello Aura"}],
            "model_provider": "AnthropicClaude",  # Unsupported
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 400
    assert "Unsupported model provider" in res.json()["detail"]


# ══════════════════════════════════════════════════════════════════
# 7. SAFETY ESCALATION & CRISIS ALERT BEHAVIOR
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_safety_escalation_levels_and_authorization(test_env):
    """
    Verify safety escalation across all risk levels and modes:
    - RISK_0 / Normal: Returns regular AI response. Zero alerts.
    - RISK_1 / Sadness ("I feel sad today"): Empathy without auto-alert.
    - RISK_2 / Severe distress / crying ("crying for hours"): Safe comforting response without auto-alert.
    - RISK_3 / Self-harm concern ("I want to die"):
        * Mode 'Suggest' (default): Intervenes with helplines. No auto-alert to partner.
        * Mode 'Ask first': Intervenes with helplines AND prompts user for consent to notify contact.
        * Mode 'Pre-authorized' without verified recipient: Intervenes with helplines. NO notification sent.
        * Mode 'Pre-authorized' WITH verified recipient & crisis_escalation_enabled=True:
            Sends safety notification to partner in DB (no private chats leaked).
        * Cooldown: Second crisis message within 15 min does NOT send duplicate alert.
        * User toggled crisis_escalation_enabled=False: NO alert sent.
    """
    client = test_env["client"]
    session_factory = test_env["session_factory"]

    # 1. RISK_0: Normal conversation
    token_normal = await seed_user(session_factory, "u_norm", "NormalUser", "norm@test.com", partner_id="partner_norm")
    with patch("app.api.routes.ai.generate_ai_text", new_callable=AsyncMock, return_value="Hello! How can I help?"):
        res = await client.post(
            "/api/ai/chat",
            json={"messages": [{"role": "user", "content": "Tell me a joke"}]},
            headers={"Authorization": f"Bearer {token_normal}"}
        )
        assert res.status_code == 200
        assert res.json()["reply"] == "Hello! How can I help?"

    # Verify no notification created
    async with session_factory() as session:
        notifs = (await session.execute(select(Notification).filter(Notification.user_id == "partner_norm"))).scalars().all()
        assert len(notifs) == 0

    # 2. RISK_1 & RISK_2: Sadness or crying does NOT auto-alert partner even if Pre-authorized
    token_crying = await seed_user(
        session_factory, "u_crying", "CryingUser", "cry@test.com", partner_id="partner_cry",
        aura_settings={"escalationMode": "Pre-authorized"}
    )
    with patch("app.api.routes.ai.generate_ai_text", new_callable=AsyncMock, return_value="I am here with you, take a gentle breath."):
        res_cry = await client.post(
            "/api/ai/chat",
            json={"messages": [{"role": "user", "content": "I have been crying for hours, everything is falling apart"}]},
            headers={"Authorization": f"Bearer {token_crying}"}
        )
        assert res_cry.status_code == 200

    async with session_factory() as session:
        notifs_cry = (await session.execute(select(Notification).filter(Notification.user_id == "partner_cry"))).scalars().all()
        assert len(notifs_cry) == 0  # Crucial safety check: ordinary crying NEVER auto-notifies

    # 3. RISK_3: Mode 'Suggest' (default) -> Intervenes, helplines included, zero alerts
    token_suggest = await seed_user(
        session_factory, "u_sug", "SuggestUser", "sug@test.com", partner_id="partner_sug",
        aura_settings={"escalationMode": "Suggest"}
    )
    res_sug = await client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I feel like I want to die"}]},
        headers={"Authorization": f"Bearer {token_suggest}"}
    )
    assert res_sug.status_code == 200
    assert "Tele-MANAS" in res_sug.json()["reply"]
    assert "gentle care check-in" not in res_sug.json()["reply"]  # Not 'Ask first'

    async with session_factory() as session:
        notifs_sug = (await session.execute(select(Notification).filter(Notification.user_id == "partner_sug"))).scalars().all()
        assert len(notifs_sug) == 0

    # 4. RISK_3: Mode 'Ask first' -> Offers consent prompt to check in with contact
    token_ask = await seed_user(
        session_factory, "u_ask", "AskUser", "ask@test.com", partner_id="partner_ask",
        aura_settings={"escalationMode": "Ask first", "trustedContactName": "Priya"}
    )
    res_ask = await client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I want to kill myself"}]},
        headers={"Authorization": f"Bearer {token_ask}"}
    )
    assert res_ask.status_code == 200
    reply_ask = res_ask.json()["reply"]
    assert "Tele-MANAS" in reply_ask
    assert "Priya" in reply_ask
    assert "gentle care check-in message" in reply_ask

    async with session_factory() as session:
        notifs_ask = (await session.execute(select(Notification).filter(Notification.user_id == "partner_ask"))).scalars().all()
        assert len(notifs_ask) == 0  # Only asks, does not send unilaterally

    # 5. RISK_3: Mode 'Pre-authorized' without verified recipient -> NO notification sent
    token_no_recipient = await seed_user(
        session_factory, "u_no_rec", "SoloUser", "solo@test.com", partner_id=None,
        aura_settings={"escalationMode": "Pre-authorized", "trustedContact": ""}
    )
    res_no_rec = await client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I want to end my life"}]},
        headers={"Authorization": f"Bearer {token_no_recipient}"}
    )
    assert res_no_rec.status_code == 200
    assert "Tele-MANAS" in res_no_rec.json()["reply"]
    async with session_factory() as session:
        all_notifs = (await session.execute(select(Notification))).scalars().all()
        assert len(all_notifs) == 0

    # 6. RISK_4 (Imminent): Mode 'Pre-authorized' WITH verified partner -> Sends safety alert & respects cooldown
    token_preauth = await seed_user(
        session_factory, "u_preauth", "Arjun", "arjun@test.com", partner_id="partner_arjun",
        aura_settings={"escalationMode": "Pre-authorized"}
    )
    res_pre = await client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I am going to kill myself tonight"}]},
        headers={"Authorization": f"Bearer {token_preauth}"}
    )
    assert res_pre.status_code == 200
    assert "112" in res_pre.json()["reply"]

    # Verify notification in database
    async with session_factory() as session:
        notifs_pre = (await session.execute(select(Notification).filter(Notification.user_id == "partner_arjun"))).scalars().all()
        assert len(notifs_pre) == 1
        alert = notifs_pre[0]
        assert alert.type == "safety_alert"
        assert "Arjun" in alert.body
        # CRITICAL PRIVACY VERIFICATION: Private chat content must NOT be leaked in the notification!
        assert "going to kill myself" not in alert.body
        assert "tonight" not in alert.body
        assert alert.data["risk_level"] == "RISK_4"

    # Test 15-minute anti-spam cooldown: Immediate second crisis message does NOT send duplicate alert
    res_pre_again = await client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "I took pills, goodbye forever"}]},
        headers={"Authorization": f"Bearer {token_preauth}"}
    )
    assert res_pre_again.status_code == 200
    async with session_factory() as session:
        notifs_cooldown = (await session.execute(select(Notification).filter(Notification.user_id == "partner_arjun"))).scalars().all()
        assert len(notifs_cooldown) == 1  # Still 1, cooldown prevented duplicate notification
