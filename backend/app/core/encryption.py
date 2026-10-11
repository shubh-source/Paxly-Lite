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
    Rejects arbitrary passwords or invalid lengths.
    """
    if not key_str or not isinstance(key_str, str) or not key_str.strip():
        raise EncryptionConfigurationError(f"{key_name} cannot be empty.")
    
    key_bytes = key_str.strip().encode("utf-8")
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

    try:
        Fernet(key_bytes)
    except Exception as e:
        raise EncryptionConfigurationError(f"{key_name} is not a valid Fernet cipher key: {type(e).__name__}")

    return key_bytes

def is_fernet_ciphertext(data: str) -> bool:
    """
    Checks if a given string matches the standard Fernet token structure.
    Used to distinguish between legacy unencrypted plaintext and encrypted ciphertext.
    """
    if not data or not isinstance(data, str):
        return False
    stripped = data.strip()
    return bool(FERNET_PREFIX_PATTERN.match(stripped))

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
            logger.error("ENCRYPTION_KEY is required in production environment.")
            raise EncryptionConfigurationError("ENCRYPTION_KEY must be configured in production environment.")

        if current_key_setting == LEGACY_FERNET_KEY or current_key_setting.encode("utf-8") == LEGACY_FALLBACK_KEY_RAW:
            logger.error("Legacy fallback key cannot be used as primary encryption key in production.")
            raise EncryptionConfigurationError("Insecure legacy encryption key is forbidden in production.")

        # Strict Fernet validation in production: NO arbitrary passphrases allowed
        primary_key_bytes = _validate_strict_fernet_key(current_key_setting, "ENCRYPTION_KEY")
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

def decrypt_data(data: str, strict: bool = False) -> str:
    """
    Decrypts ciphertext using the primary key or rotated previous keys (MultiFernet).
    If MultiFernet fails, falls back to legacy cipher for historical records.

    If data is NOT ciphertext (legacy unencrypted plaintext):
      - Safely returns plaintext so historical chat history is preserved.
    If data IS ciphertext (matches Fernet token pattern) but fails all keys:
      - In strict=True or production environment, raises DecryptionError instead of masking error by returning corrupted ciphertext.
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
        except (InvalidToken, Exception):
            pass

    # Try legacy cipher (historical records encrypted before key management)
    if _legacy_cipher is not None:
        try:
            return _legacy_cipher.decrypt(data.encode("utf-8")).decode("utf-8")
        except (InvalidToken, Exception):
            pass

    # If it matches the Fernet ciphertext pattern, decryption genuinely failed
    is_cipher = is_fernet_ciphertext(data)
    is_production = (getattr(settings, "ENVIRONMENT", "development") or "development").strip().lower() in ("production", "prod")

    if is_cipher:
        logger.error("Ciphertext decryption failed across all configured keys.")
        if strict or is_production:
            raise DecryptionError("Ciphertext payload could not be decrypted with configured keys.")

    # Return legacy unencrypted plaintext safely
    return data
