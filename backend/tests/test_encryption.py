import base64
import pytest
from cryptography.fernet import Fernet
from app.core.config import settings
from app.core.encryption import (
    encrypt_data,
    decrypt_data,
    get_cipher,
    EncryptionError,
    EncryptionConfigurationError,
    LEGACY_FERNET_KEY,
    LEGACY_FALLBACK_KEY_RAW,
)

@pytest.fixture(autouse=True)
def reset_encryption_state():
    """Ensure clean encryption settings and cipher state before and after each test."""
    orig_key = settings.ENCRYPTION_KEY
    orig_env = settings.ENVIRONMENT
    yield
    settings.ENCRYPTION_KEY = orig_key
    settings.ENVIRONMENT = orig_env
    get_cipher(force_reload=True)

def test_encryption_roundtrip_with_valid_key():
    key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = key
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    secret_message = "Confidential user journal entry and sensitive thoughts."
    encrypted = encrypt_data(secret_message)
    
    assert encrypted != secret_message
    assert isinstance(encrypted, str)
    assert len(encrypted) > len(secret_message)

    decrypted = decrypt_data(encrypted)
    assert decrypted == secret_message

def test_encryption_roundtrip_with_derived_passphrase():
    settings.ENCRYPTION_KEY = "my_custom_super_secure_passphrase_for_testing"
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    secret = "Test with derived SHA-256 key"
    encrypted = encrypt_data(secret)
    assert encrypted != secret

    decrypted = decrypt_data(encrypted)
    assert decrypted == secret

def test_production_environment_missing_key_fails_closed():
    settings.ENCRYPTION_KEY = ""
    settings.ENVIRONMENT = "production"

    with pytest.raises(EncryptionConfigurationError) as exc_info:
        get_cipher(force_reload=True)

    assert "ENCRYPTION_KEY must be configured in production" in str(exc_info.value)

def test_production_encrypt_data_raises_when_key_missing():
    settings.ENCRYPTION_KEY = ""
    settings.ENVIRONMENT = "production"

    with pytest.raises(EncryptionConfigurationError):
        encrypt_data("Sensitive data cannot be written without valid key")

def test_development_fallback_key_behavior():
    settings.ENCRYPTION_KEY = ""
    settings.ENVIRONMENT = "development"
    cipher = get_cipher(force_reload=True)
    assert cipher is not None

    data = "Dev environment test"
    encrypted = encrypt_data(data)
    assert encrypted != data
    assert decrypt_data(encrypted) == data

def test_legacy_ciphertext_decryption_compatibility():
    # Encrypt data using the legacy default Fernet key
    legacy_cipher = Fernet(base64.urlsafe_b64encode(LEGACY_FALLBACK_KEY_RAW))
    legacy_ciphertext = legacy_cipher.encrypt(b"Historical chat thread from legacy system").decode()

    # Configure a new modern key for the application
    new_key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = new_key
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    # Decrypt should fall back to legacy cipher and succeed
    recovered = decrypt_data(legacy_ciphertext)
    assert recovered == "Historical chat thread from legacy system"

def test_legacy_plaintext_compatibility():
    new_key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = new_key
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    plaintext = "Unencrypted legacy chat record before encryption was introduced"
    assert decrypt_data(plaintext) == plaintext

def test_empty_and_none_data_handling():
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    settings.ENVIRONMENT = "development"
    get_cipher(force_reload=True)

    assert encrypt_data("") == ""
    assert encrypt_data(None) is None
    assert decrypt_data("") == ""
    assert decrypt_data(None) is None

def test_fail_closed_never_returns_plaintext_on_encryption_failure(monkeypatch):
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    settings.ENVIRONMENT = "development"
    cipher = get_cipher(force_reload=True)

    # Simulate an unexpected cipher failure during encrypt
    def broken_encrypt(*args, **kwargs):
        raise RuntimeError("Low-level hardware/crypto error")

    monkeypatch.setattr(cipher, "encrypt", broken_encrypt)

    sensitive_text = "Highly private psychiatric assessment notes"
    with pytest.raises(EncryptionError) as exc_info:
        encrypt_data(sensitive_text)

    # Ensure error message never contains sensitive plaintext or keys
    error_msg = str(exc_info.value)
    assert sensitive_text not in error_msg
    assert "paxly" not in error_msg.lower()
    assert "Refusing to persist unencrypted plaintext" in error_msg

def test_error_and_exceptions_do_not_leak_secrets(monkeypatch):
    settings.ENCRYPTION_KEY = "super_secret_master_key_123"
    settings.ENVIRONMENT = "production"

    secret_input = "password123_sensitive_token"
    # Even on configuration or encryption errors, neither input nor secret key should be in the exception text
    with pytest.raises(Exception) as exc:
        def bad_cipher(*args, **kwargs):
            raise Exception("Underlying crypto failure")
        monkeypatch.setattr("cryptography.fernet.Fernet.encrypt", bad_cipher)
        get_cipher(force_reload=True)
        encrypt_data(secret_input)

    assert "super_secret_master_key_123" not in str(exc.value)
    assert secret_input not in str(exc.value)
