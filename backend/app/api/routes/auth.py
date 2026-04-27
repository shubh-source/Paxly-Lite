from fastapi import APIRouter, HTTPException, status, Depends, Request, File, UploadFile
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.models.schemas import UserCreate, UserLogin, Token, UserOut, UserUpdate
from app.models.orm import User, BannedIP, FailedLoginAttempt, Message, Memory, Mood, CallLog, Note, CoupleSpace
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import update, delete
from app.core.storage import storage

router = APIRouter(prefix="/auth", tags=["auth"])

def user_to_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        name=u.name,
        email=u.email,
        role=u.role,
        couple_space_id=u.couple_space_id,
        partner_id=u.partner_id,
        is_premium=u.is_premium,
        business_category=u.business_category,
        created_at=u.created_at,
        is_archived=u.is_archived,
        closure_requested=u.closure_requested,
        stealth_mode=u.stealth_mode,
        blur_sensitive=u.blur_sensitive,
        hide_activity=u.hide_activity,
        ai_personality=u.ai_personality,
        milestone_alerts=u.milestone_alerts,
        avatar_url=u.avatar_url
    )

@router.post("/register", response_model=Token, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == data.email.lower()))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        password=hash_password(data.password),
        role=data.role if data.role in ["user", "partner"] else "user",
        business_category=data.business_category
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id)})
    return Token(access_token=token, user=user_to_out(new_user))

@router.post("/login", response_model=Token)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host
    
    # Check if IP is banned
    ban_check = await db.execute(select(BannedIP).filter(BannedIP.ip_address == client_ip))
    if ban_check.scalars().first():
        raise HTTPException(status_code=403, detail="Access denied. Your IP is permanently banned due to multiple failed login attempts.")

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
            # AUTO BAN TRIGGER
            new_ban = BannedIP(ip_address=client_ip, reason=f"Automatic ban after {failures} failed attempts reaching threshold.")
            db.add(new_ban)
            await db.commit()
            raise HTTPException(status_code=403, detail="3 Strike Rule: Your IP has been permanently banned.")
            
        await db.commit()
        raise HTTPException(status_code=401, detail=f"Invalid email or password. ({failures}/3 attempts used)")

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
async def get_me(current_user: User = Depends(get_current_user)):
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
