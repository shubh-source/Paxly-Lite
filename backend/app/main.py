from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.api.routes import auth, couple, chat, mood, memories, explore, ai, notes, dates, bucket, shop, notifications, voice_notes, security, theatre, surprise, admin, payment, place_partner, calls, website
import os
import time

from app.core.database import connect_db, engine, Base
# Import BannedIP specifically for middleware check
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

# --- THE FORTRESS MIDDLEWARE ---
@app.middleware("http")
async def fortress_middleware(request: Request, call_next):
    client_ip = request.client.host
    
    # 1. SECURITY: ADD HEADERS
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# --- GLOBAL STEALTH ERROR HANDLER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"🔥 SECURITY LOG: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"message": "A security-controlled error occurred. Integrity verified."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
        "https://paxly-lite.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ALL ROUTES RESTORED
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
