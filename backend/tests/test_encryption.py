import base64
import pytest
from cryptography.fernet import Fernet
from app.core.config import settings
from app.core.encryption import (
    encrypt_data,
    decrypt_data,
    get_cipher,
    is_fernet_ciphertext,
    EncryptionError,
    EncryptionConfigurationError,
    DecryptionError,
    LEGACY_FERNET_KEY,
    LEGACY_FALLBACK_KEY_RAW,
)

@pytest.fixture(autouse=True)
def reset_encryption_state():
    """Ensure clean encryption settings and cipher state before and after each test."""
    orig_key = settings.ENCRYPTION_KEY
    orig_prev = settings.PREVIOUS_ENCRYPTION_KEYS
    orig_env = settings.ENVIRONMENT
    yield
    settings.ENCRYPTION_KEY = orig_key
    settings.PREVIOUS_ENCRYPTION_KEYS = orig_prev
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
    assert is_fernet_ciphertext(encrypted)

    decrypted = decrypt_data(encrypted)
    assert decrypted == secret_message

def test_production_rejects_arbitrary_passphrase():
    """Production must strictly require 32-byte Fernet key and reject arbitrary passwords."""
    settings.ENCRYPTION_KEY = "my_custom_super_secure_passphrase_for_testing"
    settings.ENVIRONMENT = "production"

    with pytest.raises(EncryptionConfigurationError) as exc_info:
        get_cipher(force_reload=True)

    err = str(exc_info.value)
    assert "must be exactly 44 characters" in err or "invalid characters" in err or "must decode to exactly 32 bytes" in err

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

def test_production_rejects_legacy_insecure_key():
    settings.ENCRYPTION_KEY = LEGACY_FERNET_KEY
    settings.ENVIRONMENT = "production"

    with pytest.raises(EncryptionConfigurationError) as exc_info:
        get_cipher(force_reload=True)
    assert "Insecure legacy encryption key is forbidden in production" in str(exc_info.value)

def test_key_rotation_with_previous_keys():
    """Test MultiFernet rotation: data encrypted with previous key can be decrypted with new key."""
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    # Step 1: Encrypt data using old_key
    settings.ENCRYPTION_KEY = old_key
    settings.PREVIOUS_ENCRYPTION_KEYS = ""
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)
    old_ciphertext = encrypt_data("Data encrypted prior to rotation")

    # Step 2: Rotate key to new_key, keeping old_key in PREVIOUS_ENCRYPTION_KEYS
    settings.ENCRYPTION_KEY = new_key
    settings.PREVIOUS_ENCRYPTION_KEYS = old_key
    get_cipher(force_reload=True)

    # Old ciphertext should still decrypt cleanly
    decrypted_old = decrypt_data(old_ciphertext)
    assert decrypted_old == "Data encrypted prior to rotation"

    # New data should be encrypted with new_key
    new_ciphertext = encrypt_data("Data encrypted after rotation")
    assert decrypt_data(new_ciphertext) == "Data encrypted after rotation"

def test_decryption_raises_on_invalid_ciphertext_in_production():
    """If input is ciphertext (starts with gAAAAA...) but cannot be decrypted, production must raise DecryptionError."""
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    settings.PREVIOUS_ENCRYPTION_KEYS = ""
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    # Fabricate ciphertext encrypted by an unknown, unrelated key
    unrelated_cipher = Fernet(Fernet.generate_key())
    unrelated_ciphertext = unrelated_cipher.encrypt(b"Unknown cipher text").decode()

    assert is_fernet_ciphertext(unrelated_ciphertext)
    with pytest.raises(DecryptionError):
        decrypt_data(unrelated_ciphertext)

def test_legacy_plaintext_compatibility_not_treated_as_ciphertext():
    """Unencrypted historical plaintext is detected and preserved without error."""
    new_key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = new_key
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    plaintext = "Hello, this is a plain text message from early version 1.0."
    assert not is_fernet_ciphertext(plaintext)
    assert decrypt_data(plaintext) == plaintext

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

def test_development_fallback_key_behavior():
    settings.ENCRYPTION_KEY = ""
    settings.ENVIRONMENT = "development"
    cipher = get_cipher(force_reload=True)
    assert cipher is not None

    data = "Dev environment test"
    encrypted = encrypt_data(data)
    assert encrypted != data
    assert decrypt_data(encrypted) == data

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
    valid_key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = valid_key
    settings.ENVIRONMENT = "production"

    secret_input = "password123_sensitive_token"
    with pytest.raises(Exception) as exc:
        def bad_cipher(*args, **kwargs):
            raise Exception("Underlying crypto failure")
        monkeypatch.setattr("cryptography.fernet.Fernet.encrypt", bad_cipher)
        get_cipher(force_reload=True)
        encrypt_data(secret_input)

    assert valid_key not in str(exc.value)
    assert secret_input not in str(exc.value)

@pytest.mark.asyncio
async def test_app_lifespan_startup_fails_in_production_with_missing_key():
    from app.main import app, lifespan
    settings.ENCRYPTION_KEY = ""
    settings.ENVIRONMENT = "production"

    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(app):
            pass
    assert "Application startup rejected due to unsafe configuration" in str(exc_info.value)

@pytest.mark.asyncio
async def test_app_lifespan_startup_succeeds_with_valid_key():
    from app.main import app, lifespan
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    settings.ENVIRONMENT = "production"

    async with lifespan(app):
        # Startup completed successfully
        pass

def test_ciphertext_detection_structural_checks():
    """Verify is_fernet_ciphertext strictly evaluates length, version, Base64, and AES blocks."""
    # 1. Non-string or empty
    assert not is_fernet_ciphertext("")
    assert not is_fernet_ciphertext(None)
    assert not is_fernet_ciphertext(12345)

    # 2. Too short (< 100 characters in base64url)
    assert not is_fernet_ciphertext("not_a_fernet_token")
    assert not is_fernet_ciphertext("gAAAAA" + "A" * 50)

    # 3. Invalid Base64 charset
    assert not is_fernet_ciphertext("gAAAAA" + "!@#$%^&*()_+{}[]:;<>?,./" * 5)

    # 4. Valid Base64 and >= 100 chars, but decoded raw length < 73 bytes
    short_raw = bytes([0x80]) + bytes(40) # 41 bytes total
    # Pad to reach string length check if necessary
    assert not is_fernet_ciphertext(base64.urlsafe_b64encode(short_raw).decode())

    # 5. Non-canonical Base64 encoding (rejected)
    valid_key = Fernet.generate_key()
    valid_token = Fernet(valid_key).encrypt(b"Hello Paxly Fortress").decode()
    # Add whitespace or invalid canonical representation
    assert not is_fernet_ciphertext(valid_token + "==")

    # 6. Length >= 73 bytes (exactly 73 bytes: 25 header + 16 AES block + 32 HMAC), but version byte is 0x81 (not 0x80)
    invalid_version_raw = bytes([0x81]) + bytes(72) # 73 bytes total, raw[0] = 0x81
    invalid_version_token = base64.urlsafe_b64encode(invalid_version_raw).decode()
    assert len(invalid_version_raw) >= 73
    assert not is_fernet_ciphertext(invalid_version_token)

    # 7. Length >= 73 bytes and version 0x80, but ciphertext portion is NOT a multiple of 16 bytes
    # Total raw bytes = 25 (header) + 15 (bad ciphertext len) + 32 (HMAC) = 72 + 15 = 87 bytes
    bad_aes_raw = bytes([0x80]) + bytes(86) # 87 bytes total: ciphertext portion = 87 - 57 = 30 bytes (30 % 16 != 0)
    bad_aes_token = base64.urlsafe_b64encode(bad_aes_raw).decode()
    assert len(bad_aes_raw) >= 73
    assert bad_aes_raw[0] == 0x80
    assert not is_fernet_ciphertext(bad_aes_token)

    # 8. Valid genuine Fernet token
    assert is_fernet_ciphertext(valid_token)

def test_corrupted_ciphertext_raises_decryption_error_in_production():
    """Structurally valid Fernet token that was corrupted during transit/storage must raise DecryptionError in production."""
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    settings.ENVIRONMENT = "production"
    get_cipher(force_reload=True)

    secret = "Top Secret Journal Entry"
    valid_token = encrypt_data(secret)
    assert is_fernet_ciphertext(valid_token)

    # Corrupt the payload (flip characters in the HMAC/ciphertext body while maintaining structural validness)
    raw_token = bytearray(base64.urlsafe_b64decode(valid_token.encode()))
    raw_token[-1] ^= 0x01 # Flip last bit of HMAC
    corrupted_token = base64.urlsafe_b64encode(raw_token).decode()

    # The corrupted token is still structurally a Fernet token
    assert is_fernet_ciphertext(corrupted_token)

    # Decrypting must raise DecryptionError and NEVER return corrupted_token as plaintext
    with pytest.raises(DecryptionError):
        decrypt_data(corrupted_token)

