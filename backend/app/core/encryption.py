from cryptography.fernet import Fernet
from app.core.config import settings
import base64

# A Fernet key must be a base64-encoded 32-byte string.
_cipher = None

def get_cipher():
    global _cipher
    if _cipher is None:
        key = settings.ENCRYPTION_KEY
        if not key:
            # Fallback for development if no key is in .env
            key = "L3B4X2ZvcnRyZXNzX21hc3Rlcl9rZXlfOTkxMg=="
        try:
            _cipher = Fernet(key.encode())
        except Exception as e:
            print(f"⚠️ Encryption initialization error: {e}")
            return None
    return _cipher

def encrypt_data(data: str) -> str:
    if not data: return data
    cipher = get_cipher()
    if not cipher: return data
    try:
        return cipher.encrypt(data.encode()).decode()
    except Exception:
        return data

def decrypt_data(data: str) -> str:
    if not data: return data
    cipher = get_cipher()
    if not cipher: return data
    try:
        return cipher.decrypt(data.encode()).decode()
    except Exception:
        # Return as-is if decryption fails (e.g., already decrypted or plain text)
        return data
