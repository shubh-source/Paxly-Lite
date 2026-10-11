import base64
import hashlib
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings

logger = logging.getLogger("aura.encryption")

# Legacy key previously hardcoded as default fallback in development
LEGACY_FALLBACK_KEY_RAW = b"paxly_fortress_master_key_32byte"
LEGACY_FERNET_KEY = base64.urlsafe_b64encode(LEGACY_FALLBACK_KEY_RAW).decode()

class EncryptionError(RuntimeError):
    """Raised when data encryption fails (fail-closed security)."""
    pass

class EncryptionConfigurationError(RuntimeError):
    """Raised when encryption key is missing or misconfigured in production."""
    pass

_primary_cipher: Optional[Fernet] = None
_legacy_cipher: Optional[Fernet] = None
_initialized_env_key: Optional[str] = None
_initialized_environment: Optional[str] = None

def _derive_fernet_key(key_material: str) -> bytes:
    """Safely derive a 32-byte url-safe base64 encoded Fernet key."""
    if not key_material:
        raise ValueError("Key material cannot be empty")
    
    # If key_material is already a valid 32-byte urlsafe-b64 string, check it
    raw_bytes = key_material.encode("utf-8") if isinstance(key_material, str) else key_material
    try:
        decoded = base64.urlsafe_b64decode(raw_bytes)
        if len(decoded) == 32:
            return raw_bytes
    except Exception:
        pass
    
    # Otherwise derive a deterministic 32-byte Fernet key via SHA-256
    digest = hashlib.sha256(raw_bytes).digest()
    return base64.urlsafe_b64encode(digest)

def get_cipher(force_reload: bool = False) -> Fernet:
    """
    Initializes and returns the primary Fernet cipher.
    In production (ENVIRONMENT='production' or 'prod'), a configured ENCRYPTION_KEY is strictly required.
    In development/test, if ENCRYPTION_KEY is empty, a deterministic fallback is used with an explicit warning.
    """
    global _primary_cipher, _legacy_cipher, _initialized_env_key, _initialized_environment
    
    current_key_setting = settings.ENCRYPTION_KEY or ""
    current_env = (getattr(settings, "ENVIRONMENT", "development") or "development").strip().lower()
    is_production = current_env in ("production", "prod")

    if not force_reload and _primary_cipher is not None and _initialized_env_key == current_key_setting and _initialized_environment == current_env:
        return _primary_cipher

    if is_production:
        if not current_key_setting or not current_key_setting.strip():
            logger.error("ENCRYPTION_KEY is required in production environment.")
            raise EncryptionConfigurationError("ENCRYPTION_KEY must be configured in production environment.")
        if current_key_setting.strip().encode("utf-8") == LEGACY_FALLBACK_KEY_RAW or current_key_setting.strip() == LEGACY_FERNET_KEY:
            logger.error("Legacy fallback key cannot be used as primary encryption key in production.")
            raise EncryptionConfigurationError("Insecure legacy encryption key is forbidden in production.")

    effective_key = current_key_setting.strip() if current_key_setting else ""
    if not effective_key:
        # Development / test fallback only (never production)
        logger.warning("ENCRYPTION_KEY is not set. Generating ephemeral key for development session.")
        effective_key = Fernet.generate_key().decode()

    try:
        fernet_key = _derive_fernet_key(effective_key)
        _primary_cipher = Fernet(fernet_key)
        _initialized_env_key = current_key_setting
        _initialized_environment = current_env
        
        # Always keep legacy cipher available for backward-compatible decryption
        try:
            _legacy_cipher = Fernet(base64.urlsafe_b64encode(LEGACY_FALLBACK_KEY_RAW))
        except Exception:
            _legacy_cipher = None
            
        return _primary_cipher
    except Exception as e:
        logger.error(f"Cipher initialization error: {type(e).__name__}")
        if is_production:
            raise EncryptionConfigurationError(f"Invalid encryption key configuration: {type(e).__name__}")
        raise EncryptionError(f"Cipher initialization failed: {type(e).__name__}")

def encrypt_data(data: str) -> str:
    """
    Encrypts string data using the active Fernet cipher.
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

def decrypt_data(data: str) -> str:
    """
    Decrypts ciphertext using the primary cipher, falling back to legacy cipher if necessary.
    If the data is legacy plaintext or already unencrypted, safely returns it as-is
    so existing chat history is not lost or corrupted.
    """
    if data is None or data == "":
        return data

    # Quick heuristic / attempt primary cipher
    try:
        cipher = get_cipher()
        return cipher.decrypt(data.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        # Try legacy cipher if different
        global _legacy_cipher
        if _legacy_cipher is not None:
            try:
                return _legacy_cipher.decrypt(data.encode("utf-8")).decode("utf-8")
            except (InvalidToken, Exception):
                pass
        
        # Return as-is if unencrypted or legacy plaintext
        return data
