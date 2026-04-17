from cryptography.fernet import Fernet
from app.core.config import settings
import base64

# Use ENCRYPTION_KEY from settings.
# If not set, this will fail, which is good for safety.
# A key can be generated with Fernet.generate_key()

_cipher = None

def get_cipher():
    global _cipher
    if _cipher is None:
        if not settings.ENCRYPTION_KEY:
            # Fallback for dev only - in prod we want this to error if missing
            return None
        _cipher = Fernet(settings.ENCRYPTION_KEY.encode())
    return _cipher

def encrypt_data(data: str) -> str:
    if not data: return data
    cipher = get_cipher()
    if not cipher: return data # Fallback if no key
    return cipher.encrypt(data.encode()).decode()

def decrypt_data(data: str) -> str:
    if not data: return data
    cipher = get_cipher()
    if not cipher: return data
    try:
        return cipher.decrypt(data.encode()).decode()
    except Exception:
        # If decryption fails (e.g. data was not encrypted), return as is
        return data
