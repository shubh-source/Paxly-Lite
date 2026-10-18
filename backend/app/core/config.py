from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vlynxly"
    DB_SSL_VERIFY: bool = False

    # Security
    SECRET_KEY: str = "change-this-secret-key"
    ENCRYPTION_KEY: str = "" # Fernet key for field encryption
    PREVIOUS_ENCRYPTION_KEYS: str = "" # Comma-separated list of rotated previous Fernet keys
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    # OpenAI & AI
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_ACCOUNT_NO: str = ""

    # Email (SMTP)
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SENDER_EMAIL: str = "support@vlynxly.com"

    # App
    APP_NAME: str = "Vlynxly"
    ENVIRONMENT: str = "development" # 'development', 'test', 'production'
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    # Media & Storage
    MEDIA_DIR: str = "./media"
    MAX_FILE_SIZE_MB: int = 50
    STORAGE_MODE: str = "local" # 'local' or 'supabase'
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "vlynxly-media"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()
