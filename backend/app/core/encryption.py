from cryptography.fernet import Fernet
from app.core.config import settings
import base64

# Use the encryption key from settings. If not set, this will fail safely.
# A Fernet key must be a base64-encoded 32-byte string.
_key = settings.ENCRYPTION_KEY.encode() if settings.ENCRYPTION_KEY else b"L3B4X2ZvcnRyZXNzX21hc3Rlcl9rZXlfOTkxMg==" # Fallback placeholder

cipher_suite = Fernet(_key)

def encrypt_data(data: str) -> str:
    if not data: return None
    return cipher_suite.encrypt(data.encode()).decode()

def decrypt_data(data: str) -> str:
    if not data: return None
    try:
        return cipher_suite.decrypt(data.encode()).decode()
    except Exception:
        # If decryption fails (e.g. data wasn't encrypted), return as is
        return data
