from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.orm import User, CoupleSpace, DeviceOTPRequest, IntruderLog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, delete, update
from pydantic import BaseModel
from datetime import datetime, timedelta
from app.core.config import settings
import pyotp, secrets, os, aiofiles, uuid, hashlib

router = APIRouter(prefix="/security", tags=["security"])

# ── MODELS ──────────────────────────────────────────────
class DeviceCheckRequest(BaseModel):
    device_id: str

class OTPVerifyRequest(BaseModel):
    device_id: str
    otp: str

class OTPRespondRequest(BaseModel):
    request_id: str
    action: str  # "allow" or "deny"

class PINSetRequest(BaseModel):
    pin: str

class PINVerifyRequest(BaseModel):
    pin: str

class SecurityQuestionSetRequest(BaseModel):
    question: str
    answer: str

class SecurityQuestionVerifyRequest(BaseModel):
    answer: str

class AutoLockRequest(BaseModel):
    seconds: int

class PreferencesUpdate(BaseModel):
    stealth_mode: Optional[bool] = None
    blur_sensitive: Optional[bool] = None
    hide_activity: Optional[bool] = None
    ai_personality: Optional[str] = None
    milestone_alerts: Optional[bool] = None

# ── DEVICE BINDING ───────────────────────────────────────

@router.post("/device/check")
async def check_device(req: DeviceCheckRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    device_id = req.device_id
    res = await db.execute(select(User).filter(User.device_id == device_id, User.id != cu.id))
    existing = res.scalars().first()
    if existing:
        raise HTTPException(status_code=403, detail="This device is already permanently linked to another account.")
    if not cu.device_id:
        await db.execute(update(User).filter(User.id == cu.id).values(device_id=device_id, device_bound_at=datetime.utcnow()))
        await db.commit()
        return {"status": "bound", "message": "Device successfully linked."}
    if cu.device_id == device_id:
        return {"status": "ok"}
    return {"status": "new_device", "message": "New device detected. Partner OTP required."}

@router.post("/device/request-otp")
async def request_otp(req: DeviceCheckRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    if not cu.partner_id: raise HTTPException(400, "No partner linked")
    otp = str(secrets.randbelow(900000) + 100000)
    request_id = secrets.token_hex(16)
    new_req = DeviceOTPRequest(
        request_id=request_id, requester_id=cu.id, requester_name=cu.name or "Partner",
        partner_id=cu.partner_id, device_id=req.device_id, otp=otp,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    db.add(new_req)
    await db.commit()
    from app.websocket.manager import manager
    await manager.send_to_user(cu.partner_id, {"type": "partner_guard", "request_id": request_id, "otp": otp})
    return {"status": "otp_sent", "request_id": request_id}

@router.post("/device/partner-respond")
async def partner_respond(req: OTPRespondRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    res = await db.execute(select(DeviceOTPRequest).filter(DeviceOTPRequest.request_id == req.request_id))
    otp_req = res.scalars().first()
    if not otp_req or cu.id != otp_req.partner_id: raise HTTPException(403)
    from app.websocket.manager import manager
    if req.action == "allow":
        await db.execute(update(User).filter(User.id == otp_req.requester_id).values(device_id=otp_req.device_id))
        await db.execute(update(DeviceOTPRequest).filter(DeviceOTPRequest.request_id == req.request_id).values(status="allowed"))
        await manager.send_to_user(otp_req.requester_id, {"type": "device_approved"})
    else:
        await db.execute(update(DeviceOTPRequest).filter(DeviceOTPRequest.request_id == req.request_id).values(status="denied"))
        await manager.send_to_user(otp_req.requester_id, {"type": "device_denied"})
    await db.commit()
    return {"status": req.action}

@router.post("/pin/verify")
async def verify_pin(req: PINVerifyRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    pin_hash = hashlib.sha256(req.pin.encode()).hexdigest()
    if cu.app_pin != pin_hash:
        failed = (cu.pin_failed_attempts or 0) + 1
        await db.execute(update(User).filter(User.id == cu.id).values(pin_failed_attempts=failed))
        if failed >= 3:
            await db.execute(update(User).filter(User.id == cu.id).values(pin_failed_attempts=0, intruder_trigger=True))
            await db.commit()
            return {"status": "wrong", "trigger_selfie": True}
        await db.commit()
        return {"status": "wrong", "attempts_left": 3 - failed}
    await db.execute(update(User).filter(User.id == cu.id).values(pin_failed_attempts=0, intruder_trigger=False))
    await db.commit()
    return {"status": "ok"}

@router.post("/intruder/upload")
async def upload_intruder_selfie(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    filename = f"{cu.id}_{int(datetime.utcnow().timestamp())}.jpg"
    path = os.path.join(settings.MEDIA_DIR, "intruder", filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    async with aiofiles.open(path, "wb") as f:
        while chunk := await file.read(1024 * 1024): await f.write(chunk)
    db.add(IntruderLog(user_id=cu.id, photo=filename))
    await db.commit()
    if cu.partner_id:
        from app.websocket.manager import manager
        await manager.send_to_user(cu.partner_id, {"type": "intruder_alert", "photo_url": f"/api/security/intruder/photo/{filename}"})
    return {"status": "ok"}

@router.get("/intruder/logs")
async def get_intruder_logs(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    user_ids = [cu.id]
    if cu.partner_id: user_ids.append(cu.partner_id)
    res = await db.execute(select(IntruderLog).filter(IntruderLog.user_id.in_(user_ids)).order_by(IntruderLog.timestamp.desc()).limit(20))
    logs = res.scalars().all()
    return [{"id": l.id, "photo_url": f"/api/security/intruder/photo/{l.photo}", "timestamp": l.timestamp} for l in logs]

@router.get("/intruder/photo/{filename}")
async def get_intruder_photo(filename: str):
    from fastapi.responses import FileResponse
    path = os.path.join(settings.MEDIA_DIR, "intruder", filename)
    if not os.path.exists(path): raise HTTPException(404)
    return FileResponse(path)
@router.post("/pin/set")
async def set_pin(req: PINSetRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    if not req.pin.isdigit() or len(req.pin) < 4:
        raise HTTPException(400, "PIN must be 4-6 digits.")
    pin_hash = hashlib.sha256(req.pin.encode()).hexdigest()
    await db.execute(update(User).where(User.id == cu.id).values(app_pin=pin_hash, pin_set_at=datetime.utcnow()))
    await db.commit()
    return {"status": "ok", "message": "App PIN updated."}

@router.post("/pin/question/set")
async def set_security_question(req: SecurityQuestionSetRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    if not req.question or not req.answer:
        raise HTTPException(400, "Question and answer are required.")
    ans_hash = hashlib.sha256(req.answer.lower().strip().encode()).hexdigest()
    await db.execute(update(User).where(User.id == cu.id).values(security_question=req.question, security_answer=ans_hash))
    await db.commit()
    return {"status": "ok", "message": "Security question saved."}

@router.post("/pin/question/verify")
async def verify_security_question(req: SecurityQuestionVerifyRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    if not cu.security_answer:
        raise HTTPException(400, "Security question not set.")
    ans_hash = hashlib.sha256(req.answer.lower().strip().encode()).hexdigest()
    if ans_hash == cu.security_answer:
        return {"status": "ok", "message": "Answer correct."}
    else:
        return {"status": "wrong", "message": "Incorrect answer."}

@router.patch("/preferences")
async def update_preferences(req: PreferencesUpdate, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    update_data = req.dict(exclude_unset=True)
    if not update_data: return {"status": "no_changes"}
    await db.execute(update(User).where(User.id == cu.id).values(**update_data))
    await db.commit()
    return {"status": "ok", "preferences": update_data}

@router.patch("/autolock")
async def update_autolock(req: AutoLockRequest, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    await db.execute(update(User).where(User.id == cu.id).values(auto_lock_seconds=req.seconds))
    await db.commit()
    return {"status": "ok", "seconds": req.seconds}
