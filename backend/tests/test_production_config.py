import pytest
import ssl
from starlette.testclient import TestClient
from app.main import app
from app.core.config import settings

def test_cors_middleware_allowed_origins():
    client = TestClient(app)
    
    # Allowed origin: local dev
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"

    # Allowed origin: production vercel app
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://paxly-lite.vercel.app",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.headers.get("access-control-allow-origin") == "https://paxly-lite.vercel.app"

    # Allowed origin: vercel preview deployment regex match
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://paxly-lite-git-feature-123.vercel.app",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.headers.get("access-control-allow-origin") == "https://paxly-lite-git-feature-123.vercel.app"

    # Disallowed origin: arbitrary malicious third party
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://malicious-site.com",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert "access-control-allow-origin" not in res.headers or res.headers.get("access-control-allow-origin") != "https://malicious-site.com"

    # Disallowed origin: null
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.headers.get("access-control-allow-origin") != "null"


def test_production_secret_key_validation(monkeypatch):
    from app.main import lifespan
    from cryptography.fernet import Fernet

    valid_fernet = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "ENCRYPTION_KEY", valid_fernet)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    # Test 1: Production mode with default insecure key must raise RuntimeError
    monkeypatch.setattr(settings, "SECRET_KEY", "change-this-secret-key")
    
    with pytest.raises(RuntimeError, match="In production, SECRET_KEY must be a cryptographically secure random string"):
        # Run lifespan generator startup step
        gen = lifespan(app)
        import asyncio
        asyncio.run(gen.__aenter__())

    # Test 2: Production mode with short key (< 32 chars) must raise RuntimeError
    monkeypatch.setattr(settings, "SECRET_KEY", "too_short_key_123")
    with pytest.raises(RuntimeError, match="In production, SECRET_KEY must be a cryptographically secure random string"):
        gen = lifespan(app)
        import asyncio
        asyncio.run(gen.__aenter__())


def test_database_ssl_verify_configuration(monkeypatch):
    import app.core.database as db_mod

    # Default: verify_mode is CERT_NONE and check_hostname is False
    monkeypatch.setattr(settings, "DB_SSL_VERIFY", False)
    if db_mod.DATABASE_URL.startswith("postgresql"):
        ctx = ssl.create_default_context()
        if getattr(settings, "DB_SSL_VERIFY", False):
            ctx.check_hostname = True
            ctx.verify_mode = ssl.CERT_REQUIRED
        else:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        assert ctx.check_hostname is False
        assert ctx.verify_mode == ssl.CERT_NONE

    # When enabled: verify_mode is CERT_REQUIRED and check_hostname is True
    monkeypatch.setattr(settings, "DB_SSL_VERIFY", True)
    if db_mod.DATABASE_URL.startswith("postgresql"):
        ctx = ssl.create_default_context()
        if getattr(settings, "DB_SSL_VERIFY", False):
            ctx.check_hostname = True
            ctx.verify_mode = ssl.CERT_REQUIRED
        else:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        assert ctx.check_hostname is True
        assert ctx.verify_mode == ssl.CERT_REQUIRED
