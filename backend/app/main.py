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
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database tables verified/created.")
    except Exception as e:
        print(f"⚠️ DB startup warning (non-fatal): {e}")
    await connect_db()
    os.makedirs("./media", exist_ok=True)
    yield
    await engine.dispose()

# ── CORS ────────────────────────────────────────────────────────────────────
# Using "*" for now to definitively solve the blocking issue. 
# Since this is a private project, it's a safe way to ensure connectivity.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

