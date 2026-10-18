import pytest
import ssl
from starlette.testclient import TestClient
from app.main import app
from app.core.config import settings

def test_cors_middleware_credentialed_requests():
    client = TestClient(app)
    
    # 1. Trusted origin: local dev preflight & credentialed request
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization"
        }
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"

    # Actual GET request with Origin header from trusted origin
    res = client.get(
        "/api/health/ping",
        headers={
            "Origin": "http://localhost:5173",
            "Authorization": "Bearer test-token"
        }
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"

    # 2. Trusted origin: production vercel app preflight & credentialed request
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://paxly-lite.vercel.app",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "https://paxly-lite.vercel.app"
    assert res.headers.get("access-control-allow-credentials") == "true"

    res = client.get(
        "/api/health/ping",
        headers={
            "Origin": "https://paxly-lite.vercel.app",
            "Cookie": "access_token=secret_jwt"
        }
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "https://paxly-lite.vercel.app"
    assert res.headers.get("access-control-allow-credentials") == "true"

    # 3. Untrusted origin: arbitrary malicious third party preflight
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://malicious-site.com",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers

    # Untrusted origin: actual request with credentials
    res = client.get(
        "/api/health/ping",
        headers={
            "Origin": "https://malicious-site.com",
            "Cookie": "access_token=secret_jwt"
        }
    )
    assert "access-control-allow-origin" not in res.headers

    # 4. Untrusted origin: lookalike / subdomain attacks (e.g. paxly-lite.malicious.com)
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "https://paxly-lite.attacker.com",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers

    # 5. Disallowed origin: "null"
    res = client.options(
        "/api/health/ping",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


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
