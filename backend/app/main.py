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
    try:
        # async with engine.begin() as conn:
        #     await conn.run_sync(Base.metadata.create_all)
        print("✅ Database connection initialized.")
    except Exception as e:
        print(f"⚠️ DB startup warning (non-fatal): {e}")
    await connect_db()
    os.makedirs("./media", exist_ok=True)
    yield
    await engine.dispose()

app = FastAPI(title="Vlynxly Fortress API", version="1.1.1", lifespan=lifespan)

# --- THE FORTRESS MIDDLEWARE ---
@app.middleware("http")
async def fortress_middleware(request: Request, call_next):
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

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
origins = [
    frontend_url,
    "http://localhost",
    "capacitor://localhost",
    "http://localhost:8080"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

