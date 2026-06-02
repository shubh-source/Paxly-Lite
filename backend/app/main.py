# Deployment Trigger: Restore Gunicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.api.routes import auth, couple, chat, mood, memories, explore, ai, notes, dates, bucket, shop, notifications, voice_notes, security, theatre, surprise, admin, payment, place_partner, calls, website
import os

from app.core.database import connect_db, engine, Base, AsyncSessionLocal
from app.models.orm import BannedIP
from app.websocket.handler import router as ws_router
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try to create tables, but don't block startup forever
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            from sqlalchemy import text
            
            # Force add missing columns to existing tables
            alter_queries = [
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_once_view BOOLEAN DEFAULT FALSE",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS view_limit INTEGER DEFAULT 1",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS views_used INTEGER DEFAULT 0",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_compromised BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS blur_sensitive BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_activity BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_personality VARCHAR DEFAULT 'compassionate'",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS milestone_alerts BOOLEAN DEFAULT TRUE",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS theme_id VARCHAR DEFAULT 'classic'",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS chat_wallpaper VARCHAR",
                "ALTER TABLE couple_spaces ADD COLUMN IF NOT EXISTS allow_media_save BOOLEAN DEFAULT TRUE",
            ]
            for q in alter_queries:
                try:
                    await conn.execute(text(q))
                except Exception as e:
                    print(f"Skipping alter: {e}")
            
        print("✅ Database tables verified and migrated.")
    except Exception as e:
        print(f"⚠️ DB auto-init warning: {e}")
    
    await connect_db()
    os.makedirs("./media", exist_ok=True)
    yield
    await engine.dispose()

app = FastAPI(title="Vlynxly Fortress API", version="1.1.1", lifespan=lifespan)

# 1. SECURITY: CORS (Must be at the TOP)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- THE FORTRESS MIDDLEWARE ---
@app.middleware("http")
async def fortress_middleware(request: Request, call_next):
    # Bypass security check for OPTIONS (CORS preflight)
    if request.method == "OPTIONS":
        return await call_next(request)
        
    client_ip = request.client.host
    
    # 1. SECURITY: IP BAN CHECK (GLOBAL)
    async with AsyncSessionLocal() as db:
        ban_check = await db.execute(select(BannedIP).filter(BannedIP.ip_address == client_ip))
        if ban_check.scalars().first():
            return JSONResponse(
                status_code=403,
                content={"message": "Access Denied: Your IP is permanently banned for security reasons."}
            )

    # 2. SECURITY: ADD HEADERS
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# --- GLOBAL STEALTH ERROR HANDLER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    error_trace = traceback.format_exc()
    print(f"🔥 SECURITY LOG (CRITICAL ERROR):\n{error_trace}")
    
    # If it's a specific HTTPException, let FastAPI handle it or return its detail
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    return JSONResponse(
        status_code=500,
        content={"detail": "A security-controlled error occurred. Integrity verified."},
    )

from fastapi.exceptions import RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [f"{e['loc'][-1]}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error: " + ", ".join(errors)}
    )


# ── ROUTES ──────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api")
app.include_router(couple.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(mood.router, prefix="/api")
app.include_router(memories.router, prefix="/api")
app.include_router(explore.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(dates.router, prefix="/api")
app.include_router(bucket.router, prefix="/api")
app.include_router(shop.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(voice_notes.router, prefix="/api")
app.include_router(security.router, prefix="/api")
app.include_router(theatre.router, prefix="/api")
app.include_router(surprise.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(payment.router, prefix="/api")
app.include_router(place_partner.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
app.include_router(website.router, prefix="/api")
app.include_router(ws_router)

app.mount("/media", StaticFiles(directory="./media"), name="media")

@app.get("/")
async def root():
    return {"status": "Fortress Active", "integrity": "Verified"}

