from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.api.routes import auth, couple, chat, mood, memories, explore, ai, notes, dates, bucket, shop, notifications, voice_notes, security, theatre, surprise, admin, payment, place_partner, calls, website
import os

from app.core.database import connect_db, engine, Base
from app.models.orm import BannedIP
from app.websocket.handler import router as ws_router
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await connect_db()
    os.makedirs("./media", exist_ok=True)
    yield
    await engine.dispose()

app = FastAPI(title="Paxly Fortress API", version="1.1.0", lifespan=lifespan)

# ── CORS MUST BE FIRST ─────────────────────────────────────────────────────
# In FastAPI, add_middleware runs in LIFO order.
# Adding CORS first means it executes LAST in the middleware chain,
# but it correctly wraps all other middleware and handles OPTIONS preflights.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://paxly-lite.vercel.app",
]

# Also include FRONTEND_URL env var if set (for custom domains)
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url and _frontend_url not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
# This runs BEFORE CORS in Starlette's chain (decorator = added last = runs first on request)
# But we check for OPTIONS and pass through immediately to let CORS handle it.
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    # Let OPTIONS (preflight) pass through immediately — CORS middleware handles it
    if request.method == "OPTIONS":
        return await call_next(request)
    
    response = await call_next(request)
    
    # Add security headers to non-preflight responses
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Debug log
    origin = request.headers.get("origin", "none")
    if "/api" in str(request.url.path):
        print(f"📡 {request.method} {request.url.path} | Origin: {origin} | Status: {response.status_code}")
    
    return response

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

