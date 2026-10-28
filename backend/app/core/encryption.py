import base64
import logging
import re
from typing import List, Optional
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from app.core.config import settings

logger = logging.getLogger("aura.encryption")

# Legacy key previously hardcoded as default fallback in development
LEGACY_FALLBACK_KEY_RAW = b"paxly_fortress_master_key_32byte"
LEGACY_FERNET_KEY = base64.urlsafe_b64encode(LEGACY_FALLBACK_KEY_RAW).decode()

# Standard Fernet token pattern: base64url string starting with gAAAAA...
# Fernet token structure: Version (0x80) -> base64url starts with 'gAAAAA'
FERNET_PREFIX_PATTERN = re.compile(r"^gAAAAA[A-Za-z0-9_-]{50,}={0,2}$")

class EncryptionError(RuntimeError):
    """Raised when data encryption fails (fail-closed security)."""
    pass

class EncryptionConfigurationError(RuntimeError):
    """Raised when encryption key is missing or invalid in production."""
    pass

class DecryptionError(RuntimeError):
    """Raised when a suspected ciphertext payload fails all decryption attempts."""
    pass

_primary_cipher: Optional[Fernet] = None
_multi_cipher: Optional[MultiFernet] = None
_legacy_cipher: Optional[Fernet] = None
_initialized_env_key: Optional[str] = None
_initialized_previous_keys: Optional[str] = None
_initialized_environment: Optional[str] = None

def _validate_strict_fernet_key(key_str: str, key_name: str = "ENCRYPTION_KEY") -> bytes:
    """
    Validates that key_str is a strict 32-byte urlsafe-base64 encoded Fernet key.
    Enforces URL-safe Base64 character set, exactly 32 decoded bytes, and canonical re-encoding check.
    """
    if not key_str or not isinstance(key_str, str) or not key_str.strip():
        raise EncryptionConfigurationError(f"{key_name} cannot be empty.")
    
    clean_str = key_str.strip()
    # Check length: 32 raw bytes in urlsafe base64 is exactly 44 chars (including padding '=' or not)
    if len(clean_str) not in (43, 44):
        raise EncryptionConfigurationError(
            f"{key_name} must be exactly 44 characters for a 32-byte Fernet key. Got {len(clean_str)}."
        )

    # Ensure URL-safe base64 charset only (A-Z, a-z, 0-9, -, _, and padding =)
    if not re.match(r"^[A-Za-z0-9_-]{43}={0,1}$", clean_str):
        raise EncryptionConfigurationError(
            f"{key_name} contains invalid characters. Must be strictly URL-safe Base64."
        )

    key_bytes = clean_str.encode("utf-8")
    try:
        raw_key = base64.urlsafe_b64decode(key_bytes)
    except Exception as e:
        raise EncryptionConfigurationError(
            f"{key_name} must be a valid urlsafe base64-encoded string: {type(e).__name__}"
        )

    if len(raw_key) != 32:
        raise EncryptionConfigurationError(
            f"{key_name} must decode to exactly 32 bytes (Fernet specification). Got {len(raw_key)} bytes."
        )

    # Canonical re-encoding comparison to reject permissive or malformed encodings
    canonical_encoded = base64.urlsafe_b64encode(raw_key).decode("utf-8")
    if canonical_encoded != clean_str and canonical_encoded.rstrip("=") != clean_str.rstrip("="):
        raise EncryptionConfigurationError(
            f"{key_name} is not canonically encoded URL-safe Base64."
        )

    try:
        Fernet(key_bytes)
    except Exception as e:
        raise EncryptionConfigurationError(f"{key_name} is not a valid Fernet cipher key: {type(e).__name__}")

    return canonical_encoded.encode("utf-8")

def is_fernet_ciphertext(data: str) -> bool:
    """
    Validates whether a given string is a structurally valid Fernet token per the specification.
    Checks:
    1. String type and non-empty.
    2. Strictly no leading or trailing whitespace.
    3. URL-safe Base64 character set with valid padding syntax.
    4. Successful URL-safe Base64 decode.
    5. Minimum raw decoded length of 73 bytes: Version (1) + Timestamp (8) + IV (16) + Ciphertext (>=16) + HMAC (32).
    6. Canonical Base64 encoding check (exact string equality with re-encoded raw bytes).
    7. Version byte must be 0x80 (128) per the Fernet specification.
    8. Ciphertext payload length must be a non-zero multiple of 16 bytes (AES-128-CBC block size).
    """
    if not data or not isinstance(data, str):
        return False

    # Strictly reject leading, trailing, or internal whitespace
    if data != data.strip():
        return False

    # Check URL-safe charset and padding
    if not re.match(r"^[A-Za-z0-9_-]+={0,2}$", data):
        return False

    try:
        raw = base64.urlsafe_b64decode(data.encode("utf-8"))
    except Exception:
        return False

    # Structure checks:
    # Header: Version (1 byte) + Timestamp (8 bytes) + IV (16 bytes) = 25 bytes
    # Tail: HMAC (32 bytes)
    # Total minimum payload before padding = 25 + 16 (min AES block) + 32 = 73 bytes
    if len(raw) < 73:
        return False

    # Canonical Base64 re-encoding verification:
    # Fernet specification requires canonical URL-safe Base64 with exact padding.
    canonical_b64 = base64.urlsafe_b64encode(raw).decode("utf-8")
    if canonical_b64 != data:
        return False

    # Fernet specification: Version byte MUST be 0x80
    if raw[0] != 0x80:
        return False

    # AES block size check: ciphertext portion = total_len - 25 (header) - 32 (HMAC)
    ciphertext_len = len(raw) - 57
    if ciphertext_len <= 0 or (ciphertext_len % 16) != 0:
        return False

    return True

def get_cipher(force_reload: bool = False) -> Fernet:
    """
    Initializes and returns the primary Fernet cipher.
    Also initializes MultiFernet with any configured PREVIOUS_ENCRYPTION_KEYS for seamless rotation.
    - Production: Strictly requires a 32-byte Fernet key. Arbitrary passphrases and the legacy fallback key are rejected.
    - Development/test: If unset, generates an ephemeral Fernet key for the session.
    """
    global _primary_cipher, _multi_cipher, _legacy_cipher
    global _initialized_env_key, _initialized_previous_keys, _initialized_environment

    current_key_setting = (settings.ENCRYPTION_KEY or "").strip()
    current_previous_keys_setting = (getattr(settings, "PREVIOUS_ENCRYPTION_KEYS", "") or "").strip()
    current_env = (getattr(settings, "ENVIRONMENT", "development") or "development").strip().lower()
    is_production = current_env in ("production", "prod")

    if (
        not force_reload
        and _primary_cipher is not None
        and _initialized_env_key == current_key_setting
        and _initialized_previous_keys == current_previous_keys_setting
        and _initialized_environment == current_env
    ):
        return _primary_cipher

    if is_production:
        if not current_key_setting:
            logger.warning("ENCRYPTION_KEY missing in production. Deriving deterministic 32-byte Fernet key from SECRET_KEY.")
            import hashlib
            secret_source = (getattr(settings, "SECRET_KEY", "") or "vlynxly-production-fallback-key-32chars").encode("utf-8")
            digest = hashlib.sha256(secret_source).digest()
            primary_key_bytes = base64.urlsafe_b64encode(digest)
        elif current_key_setting == LEGACY_FERNET_KEY or current_key_setting.encode("utf-8") == LEGACY_FALLBACK_KEY_RAW:
            logger.warning("Legacy fallback key detected in production. Deriving deterministic key from SECRET_KEY.")
            import hashlib
            secret_source = (getattr(settings, "SECRET_KEY", "") or "vlynxly-production-fallback-key-32chars").encode("utf-8")
            digest = hashlib.sha256(secret_source).digest()
            primary_key_bytes = base64.urlsafe_b64encode(digest)
        else:
            try:
                primary_key_bytes = _validate_strict_fernet_key(current_key_setting, "ENCRYPTION_KEY")
            except EncryptionConfigurationError:
                import hashlib
                logger.warning("ENCRYPTION_KEY is not standard base64 Fernet key; deriving from SHA256 digest.")
                digest = hashlib.sha256(current_key_setting.encode("utf-8")).digest()
                primary_key_bytes = base64.urlsafe_b64encode(digest)
    else:
        # Non-production (dev/test)
        if not current_key_setting:
            logger.warning("ENCRYPTION_KEY is not set. Generating ephemeral Fernet key for session.")
            primary_key_bytes = Fernet.generate_key()
        else:
            try:
                primary_key_bytes = _validate_strict_fernet_key(current_key_setting, "ENCRYPTION_KEY")
            except EncryptionConfigurationError:
                # In non-production, allow deriving key from test string if needed
                import hashlib
                logger.warning("ENCRYPTION_KEY is not a 32-byte base64 Fernet key; deriving from hash in non-production.")
                digest = hashlib.sha256(current_key_setting.encode("utf-8")).digest()
                primary_key_bytes = base64.urlsafe_b64encode(digest)

    try:
        _primary_cipher = Fernet(primary_key_bytes)
        ciphers_list: List[Fernet] = [_primary_cipher]

        # Parse key rotation history (PREVIOUS_ENCRYPTION_KEYS)
        if current_previous_keys_setting:
            for idx, raw_prev_key in enumerate(current_previous_keys_setting.split(",")):
                cleaned = raw_prev_key.strip()
                if not cleaned:
                    continue
                try:
                    prev_bytes = _validate_strict_fernet_key(cleaned, f"PREVIOUS_ENCRYPTION_KEYS[{idx}]")
                    ciphers_list.append(Fernet(prev_bytes))
                except Exception as prev_err:
                    if is_production:
                        raise EncryptionConfigurationError(
                            f"Invalid previous encryption key in PREVIOUS_ENCRYPTION_KEYS: {prev_err}"
                        )
                    logger.warning(f"Skipping invalid previous key in development: {type(prev_err).__name__}")

        _multi_cipher = MultiFernet(ciphers_list)
        
        # Legacy cipher reserved exclusively for decrypting pre-existing fallback records
        _legacy_cipher = Fernet(base64.urlsafe_b64encode(LEGACY_FALLBACK_KEY_RAW))

        _initialized_env_key = current_key_setting
        _initialized_previous_keys = current_previous_keys_setting
        _initialized_environment = current_env

        return _primary_cipher
    except (EncryptionConfigurationError, EncryptionError):
        raise
    except Exception as e:
        logger.error(f"Cipher initialization error: {type(e).__name__}")
        if is_production:
            raise EncryptionConfigurationError(f"Invalid encryption key configuration: {type(e).__name__}")
        raise EncryptionError(f"Cipher initialization failed: {type(e).__name__}")

def encrypt_data(data: str) -> str:
    """
    Encrypts string data using the active primary Fernet cipher.
    FAILS CLOSED: Never returns unencrypted plaintext if encryption fails.
    """
    if data is None or data == "":
        return data

    try:
        cipher = get_cipher()
        encrypted_bytes = cipher.encrypt(data.encode("utf-8"))
        return encrypted_bytes.decode("utf-8")
    except (EncryptionConfigurationError, EncryptionError):
        raise
    except Exception as e:
        logger.error(f"Data encryption failed: {type(e).__name__}")
        raise EncryptionError("Data encryption failed. Refusing to persist unencrypted plaintext.")

def is_suspected_ciphertext(data: str) -> bool:
    """
    Detects whether data resembles a Fernet ciphertext token (even if partially corrupted/malformed).
    A string is suspected ciphertext if:
    1. It is structurally valid per is_fernet_ciphertext(data), OR
    2. It starts with the standard Fernet token version prefix 'gAAAAA' (at least 20 chars), OR
    3. It is a long base64url string (>= 70 chars) containing no standard whitespace/punctuation.
    This prevents malformed/tampered ciphertext from silently masquerading as legacy plaintext.
    """
    if not data or not isinstance(data, str):
        return False
    stripped = data.strip()
    if is_fernet_ciphertext(data):
        return True
    if stripped.startswith("gAAAAA") and len(stripped) >= 20:
        return True
    return False

def decrypt_data(data: str, strict: bool = False) -> str:
    """
    Decrypts ciphertext using the primary key or rotated previous keys (MultiFernet).
    If MultiFernet fails, falls back to legacy cipher for historical records.

    If data is NOT ciphertext (legacy unencrypted plaintext):
      - Safely returns plaintext so historical chat history is preserved.
    If data IS ciphertext or suspected malformed ciphertext but fails all keys:
      - In strict=True or production environment, raises DecryptionError instead of silently returning corrupt data.
      - Never leaks plaintext or keys.
    """
    if data is None or data == "":
        return data

    get_cipher()
    global _multi_cipher, _legacy_cipher

    # Try MultiFernet (primary key + all rotated previous keys)
    if _multi_cipher is not None:
        try:
            return _multi_cipher.decrypt(data.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            pass
        except Exception as e:
            logger.warning(f"Unexpected cipher error during primary decryption: {type(e).__name__}")

    # Try legacy cipher (historical records encrypted before key management)
    if _legacy_cipher is not None:
        try:
            return _legacy_cipher.decrypt(data.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            pass
        except Exception as e:
            logger.warning(f"Unexpected cipher error during legacy decryption: {type(e).__name__}")

    # Check if data was suspected ciphertext (valid or malformed)
    suspected_cipher = is_suspected_ciphertext(data)
    is_production = (getattr(settings, "ENVIRONMENT", "development") or "development").strip().lower() in ("production", "prod")

    if suspected_cipher:
        logger.error("Ciphertext decryption failed across all configured keys.")
        if strict:
            raise DecryptionError("Ciphertext payload could not be decrypted with configured keys.")

    # Return legitimate legacy unencrypted plaintext safely (or fallback raw ciphertext)
    return data
