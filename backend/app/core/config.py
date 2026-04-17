from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/paxly"

    # Security
    SECRET_KEY: str = "change-this-secret-key"
    ENCRYPTION_KEY: str = "" # Fernet key for field encryption
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    # OpenAI & AI
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_ACCOUNT_NO: str = ""

    # Email (SMTP)
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # App
    APP_NAME: str = "Paxly"
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    # Media & Storage
    MEDIA_DIR: str = "./media"
    MAX_FILE_SIZE_MB: int = 10
    STORAGE_MODE: str = "local" # 'local' or 'supabase'
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "paxly-media"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()
