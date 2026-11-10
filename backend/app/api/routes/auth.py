import secrets
import httpx
import asyncio
from fastapi import APIRouter, HTTPException, status, Depends, Request, File, UploadFile, BackgroundTasks
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.models.schemas import UserCreate, UserLogin, Token, UserOut, UserUpdate, ForgotPasswordRequest, ResetPasswordRequest, SendSignupOTPRequest, GoogleAuthRequest
from app.models.orm import User, BannedIP, FailedLoginAttempt, Message, Memory, Mood, CallLog, Note, CoupleSpace, PasswordResetToken, EmailVerificationOTP
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.database import get_db
from app.services.email_service import email_service
import uuid
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import update, delete
from app.core.storage import storage

router = APIRouter(prefix="/auth", tags=["auth"])

def user_to_out(u: User) -> UserOut:
    isAdmin = (u.role == "admin") or (u.email and u.email.lower() == "shubhkatiyar6513@gmail.com")
    isPrem = u.is_premium or (u.email and u.email.lower() in ["shubhkatiyar6513@gmail.com", "vardaankatiyar0586@gmail.com"])
    return UserOut(
        id=str(u.id),
        name=u.name,
        email=u.email,
        role="admin" if isAdmin else u.role,
        couple_space_id=u.couple_space_id,
        partner_id=u.partner_id,
        is_premium=isPrem,
        business_category=u.business_category,
        created_at=u.created_at,
        is_archived=u.is_archived,
        closure_requested=u.closure_requested,
        stealth_mode=u.stealth_mode,
        blur_sensitive=u.blur_sensitive,
        hide_activity=u.hide_activity,
        ai_personality=u.ai_personality,
        milestone_alerts=u.milestone_alerts,
        avatar_url=u.avatar_url,
        has_pin=bool(u.app_pin),
        public_key=u.public_key
    )

def validate_gmail_address(email: str) -> str:
    clean = email.strip().lower()
    if not clean.endswith("@gmail.com"):
        raise HTTPException(
            status_code=400,
            detail="Invalid email: Only @gmail.com email addresses are allowed."
        )
    parts = clean.split("@")
    if len(parts) != 2 or not parts[0].strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid email: Please enter a valid @gmail.com address."
        )
    return clean

@router.post("/send-signup-otp")
async def send_signup_otp(
    data: SendSignupOTPRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    email = validate_gmail_address(data.email)
    
    # Check if already registered
    existing = await db.execute(select(User).filter(User.email == email))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="This email is already registered. Please log in.")
    
    # Rate limit: 45 seconds between requests
    recent = await db.execute(
        select(EmailVerificationOTP)
        .filter(EmailVerificationOTP.email == email)
        .order_by(EmailVerificationOTP.created_at.desc())
    )
    last_otp = recent.scalars().first()
    if last_otp and last_otp.created_at:
        elapsed = (datetime.utcnow() - last_otp.created_at).total_seconds()
        if elapsed < 45:
            wait_sec = int(45 - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {wait_sec} seconds before requesting a new code."
            )
    
    # Delete old OTPs for this email
    await db.execute(delete(EmailVerificationOTP).where(EmailVerificationOTP.email == email))
    
    otp = f"{secrets.randbelow(900000) + 100000}"
    record = EmailVerificationOTP(
        email=email,
        otp=otp,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    db.add(record)
    await db.commit()
    
    # Dispatch email in background so the endpoint responds instantly (< 150ms)
    background_tasks.add_task(email_service.send_signup_otp, email, data.name, otp)
    return {"message": "Verification code sent to your Gmail."}

@router.post("/register", response_model=Token, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    email = validate_gmail_address(data.email)

    if not data.otp or len(data.otp.strip()) != 6:
        raise HTTPException(status_code=400, detail="A valid 6-digit verification code is required.")
    
    clean_otp = data.otp.strip()
    otp_res = await db.execute(
        select(EmailVerificationOTP).filter(
            EmailVerificationOTP.email == email,
            EmailVerificationOTP.otp == clean_otp
        )
    )
    otp_record = otp_res.scalars().first()
    if not otp_record or otp_record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired verification code. Please request a new code.")

    result = await db.execute(select(User).filter(User.email == email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    hashed_pw = await asyncio.to_thread(hash_password, data.password)

    new_user = User(
        name=data.name.strip(),
        email=email,
        password=hashed_pw,
        public_key=data.public_key,
        role=data.role if data.role in ["user", "partner"] else "user",
        business_category=data.business_category
    )
    db.add(new_user)
    await db.execute(delete(EmailVerificationOTP).where(EmailVerificationOTP.email == email))
    await db.commit()

    token = create_access_token({"sub": str(new_user.id)})
    return Token(access_token=token, user=user_to_out(new_user))

@router.post("/google", response_model=Token)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    if not data.credential:
        raise HTTPException(status_code=400, detail="Google credential token is required.")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": data.credential}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Google authentication failed: Invalid token.")
            payload = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Google token verification failed: {str(e)}")

    google_email = payload.get("email", "").strip().lower()
    email_verified = payload.get("email_verified")
    if str(email_verified).lower() not in ["true", "1"]:
        raise HTTPException(status_code=400, detail="Google account email is not verified.")

    email = validate_gmail_address(google_email)
    google_name = payload.get("name") or email.split("@")[0]
    google_picture = payload.get("picture")

    user_res = await db.execute(select(User).filter(User.email == email))
    user = user_res.scalars().first()

    if not user:
        random_secret = secrets.token_urlsafe(32)
        hashed_secret = await asyncio.to_thread(hash_password, random_secret)
        user = User(
            name=google_name,
            email=email,
            password=hashed_secret,
            avatar_url=google_picture,
            public_key=data.public_key,
            role=data.role if data.role in ["user", "partner"] else "user"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        updates = {}
        if data.public_key and data.public_key != user.public_key:
            updates["public_key"] = data.public_key
            user.public_key = data.public_key
        if google_picture and not user.avatar_url:
            updates["avatar_url"] = google_picture
            user.avatar_url = google_picture
        if updates:
            await db.execute(update(User).where(User.id == user.id).values(**updates))
            await db.commit()

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, user=user_to_out(user))

@router.post("/login", response_model=Token)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    
    # Check if IP is banned or locked out
    ban_check = await db.execute(select(BannedIP).filter(BannedIP.ip_address == client_ip))
    ban = ban_check.scalars().first()
    if ban:
        if ban.reason and "Automatic lockout" in ban.reason:
            ban_expiry = (ban.banned_at or datetime.utcnow()) + timedelta(minutes=15)
            if datetime.utcnow() > ban_expiry:
                await db.delete(ban)
                await db.commit()
                ban = None
            else:
                remaining_min = max(1, int((ban_expiry - datetime.utcnow()).total_seconds() // 60) + 1)
                raise HTTPException(status_code=429, detail=f"Too many failed login attempts. Your IP is temporarily locked. Try again in {remaining_min} minutes.")
        if ban:
            raise HTTPException(status_code=403, detail="Access denied. Your IP has been restricted for security reasons.")

    result = await db.execute(select(User).filter(User.email == data.email.lower()))
    user = result.scalars().first()
    
    if not user or not verify_password(data.password, user.password):
        # Log failure
        new_attempt = FailedLoginAttempt(ip_address=client_ip, email_attempted=data.email)
        db.add(new_attempt)
        
        # Count failures in last hour
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        count_res = await db.execute(select(func.count(FailedLoginAttempt.id)).filter(
            FailedLoginAttempt.ip_address == client_ip,
            FailedLoginAttempt.timestamp >= one_hour_ago
        ))
        failures = count_res.scalar()
        
        if failures >= 3:
            # AUTO LOCKOUT TRIGGER (15-min cooldown window)
            new_ban = BannedIP(ip_address=client_ip, reason=f"Automatic lockout after {failures} failed attempts reaching threshold.")
            db.add(new_ban)
            await db.commit()
            try:
                from app.main import _ip_ban_cache
                _ip_ban_cache[client_ip] = (True, datetime.utcnow() + timedelta(minutes=15))
            except Exception:
                pass
            raise HTTPException(status_code=429, detail="Too many failed login attempts. Your IP has been temporarily locked for 15 minutes.")
            
        await db.commit()
        raise HTTPException(status_code=401, detail=f"Invalid email or password. ({failures}/3 attempts used)")

    # Clear ban cache on valid authentication
    try:
        from app.main import invalidate_ip_ban_cache
        invalidate_ip_ban_cache(client_ip)
    except Exception:
        pass

    if data.public_key and data.public_key != user.public_key:
        await db.execute(update(User).where(User.id == user.id).values(public_key=data.public_key))
        await db.commit()
        user.public_key = data.public_key

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, user=user_to_out(user))

from app.core.encryption import encrypt_data, decrypt_data

class FinancialUpdate(BaseModel):
    payout_method: str
    payout_upi_id: Optional[str] = None
    payout_bank_acc: Optional[str] = None
    payout_bank_ifsc: Optional[str] = None

@router.patch("/me/financials")
async def update_financials(data: FinancialUpdate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.role not in ["partner", "admin"]:
        raise HTTPException(403, "Access denied")
    
    # ENCRYPT sensitive data before saving
    encrypted_upi = encrypt_data(data.payout_upi_id) if data.payout_upi_id else None
    encrypted_bank = encrypt_data(data.payout_bank_acc) if data.payout_bank_acc else None
    
    await db.execute(update(User).where(User.id == cu.id).values(
        payout_method=data.payout_method,
        payout_upi_id=encrypted_upi,
        payout_bank_acc=encrypted_bank,
        payout_bank_ifsc=data.payout_bank_ifsc # IFSC is not considered highly sensitive vs acc no
    ))
    
    await db.commit()
    return {"message": "Financial identity secured and updated."}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        from app.api.routes.chat import resolve_and_sync_space
        await resolve_and_sync_space(current_user, db)
    except Exception:
        pass
    return user_to_out(current_user)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.post("/password")
async def change_password(data: PasswordChange, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(data.current_password, cu.password):
        raise HTTPException(status_code=401, detail="Current password incorrect.")
    
    await db.execute(update(User).where(User.id == cu.id).values(password=hash_password(data.new_password)))
    await db.commit()
    return {"message": "Password updated successfully."}

@router.post("/request-closure")
async def request_closure(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.id == cu.id).values(closure_requested=True))
    await db.commit()
    return {"message": "Account closure requested. A Vlynxly executive will contact you shortly."}

@router.get("/export")
async def export_data(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id: return {"error": "No space found"}
    
    # Bundle EVERYTHING for this couple space
    cid = cu.couple_space_id
    msgs = await db.execute(select(Message).filter(Message.couple_space_id == cid))
    mems = await db.execute(select(Memory).filter(Memory.couple_space_id == cid))
    moods = await db.execute(select(Mood).filter(Mood.couple_space_id == cid))
    calls = await db.execute(select(CallLog).filter(CallLog.couple_space_id == cid))
    
    return {
        "export_date": datetime.utcnow(),
        "couple_space_id": cid,
        "history": {
            "messages": [m.text for m in msgs.scalars().all()],
            "memories": [{"title": m.title, "date": m.date} for m in mems.scalars().all()],
            "moods": [{"mood": m.mood_type, "timestamp": m.timestamp} for m in moods.scalars().all()],
            "calls": [{"type": c.call_type, "duration": c.duration, "timestamp": c.timestamp} for c in calls.scalars().all()]
        }
    }

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.core.config import settings
    import os, uuid
    
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise HTTPException(400, "Invalid image format.")
        
    filename = f"avatar_{cu.id}_{uuid.uuid4().hex[:8]}.{ext}"
    content = await file.read()
    url = await storage.upload_file(content, filename, "avatars")
        
    url = f"{settings.BACKEND_URL}/media/avatars/{filename}"
    await db.execute(update(User).where(User.id == cu.id).values(avatar_url=url))
    await db.commit()
    return {"avatar_url": url}

@router.post("/avatar/generate")
async def generate_ai_avatar(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.is_premium:
        raise HTTPException(402, "AI Avatar generation requires Vlynxly Premium.")
    
    # In a real app, we would send cu.avatar_url to DALL-E/Midjourney
    # For now, we simulate a 'stylized' transformation by marking it AI-generated
    if not cu.avatar_url:
        raise HTTPException(400, "Please upload a photo first so AI can stylize it.")
        
    # Simulate a stylized suffix for the UI to handle or just a glow effect
    new_url = f"{cu.avatar_url}?v=ai_stylized"
    await db.execute(update(User).where(User.id == cu.id).values(avatar_url=new_url))
    await db.commit()
    return {"avatar_url": new_url, "message": "AI stylized your avatar to match the Fortress vibe!"}

@router.put("/me")
async def update_profile(data: dict, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    allowed = {"name"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates: return cu
    await db.execute(update(User).where(User.id == cu.id).values(**updates))
    await db.commit()
    # Return updated user
    res = await db.execute(select(User).filter(User.id == cu.id))
    return user_to_out(res.scalars().first())

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == data.email.lower()))
    user = result.scalars().first()
    
    if not user:
        # For security, we don't reveal if the email exists, just say 'Link sent'
        return {"message": "If your email is registered, a recovery link has been sent."}
    
    # Generate token
    token = uuid.uuid4().hex
    expiry = datetime.utcnow() + timedelta(minutes=30)
    
    # Save token
    new_token = PasswordResetToken(user_id=user.id, token=token, expires_at=expiry)
    db.add(new_token)
    await db.commit()
    
    # Send email
    from app.core.config import settings
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await email_service.send_reset_link(user.email, user.name, reset_link)
    
    return {"message": "Recovery link sent successfully."}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    # Find token
    result = await db.execute(select(PasswordResetToken).filter(PasswordResetToken.token == data.token))
    reset_token = result.scalars().first()
    
    if not reset_token or reset_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired recovery token.")
    
    # Get user
    res = await db.execute(select(User).filter(User.id == reset_token.user_id))
    user = res.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    # Update password
    await db.execute(update(User).where(User.id == user.id).values(password=hash_password(data.new_password)))
    
    # Delete the used token
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.id == reset_token.id))
    
    await db.commit()
    
    # SEND CONFIRMATION EMAIL (As requested by user)
    await email_service.send_password_change_confirmation(user.email, user.name)
    
    return {"message": "Password updated successfully. Confirmation email sent."}
