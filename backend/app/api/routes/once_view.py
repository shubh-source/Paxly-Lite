from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from datetime import datetime
import os, secrets, shutil
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.orm import User, OnceViewMessage, CoupleSpace
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/once-view", tags=["Once View"])

ONCE_VIEW_DIR = os.path.join(settings.MEDIA_DIR, "once_view")
os.makedirs(ONCE_VIEW_DIR, exist_ok=True)

class OnceViewTextRequest(BaseModel):
    content: str
    message_type: str = "text"

class CaptureAttemptRequest(BaseModel):
    message_id: str

@router.post("/send")
async def send_once_view(req: OnceViewTextRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Find partner
    res = await db.execute(select(User).filter(User.couple_space_id == current_user.couple_space_id, User.id != current_user.id))
    partner = res.scalars().first()
    if not partner: raise HTTPException(400, "No partner linked")

    message_id = secrets.token_hex(16)
    new_msg = OnceViewMessage(
        message_id=message_id,
        sender_id=current_user.id,
        sender_name=current_user.name or "Partner",
        receiver_id=partner.id,
        content=req.content,
        message_type=req.message_type
    )
    db.add(new_msg)
    await db.commit()

    from app.websocket.manager import manager
    await manager.send_to_user(partner.id, {
        "type": "once_view_incoming",
        "message_id": message_id,
        "sender_name": current_user.name or "Partner",
        "message": f"{current_user.name or 'Partner'} sent you a once-view message 👁️"
    })
    return {"status": "sent", "message_id": message_id}

@router.post("/send-image")
async def send_once_view_image(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(User).filter(User.couple_space_id == current_user.couple_space_id, User.id != current_user.id))
    partner = res.scalars().first()
    if not partner: raise HTTPException(400, "No partner linked")

    message_id = secrets.token_hex(16)
    filename = f"{message_id}.jpg"
    filepath = os.path.join(ONCE_VIEW_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    new_msg = OnceViewMessage(
        message_id=message_id,
        sender_id=current_user.id,
        sender_name=current_user.name or "Partner",
        receiver_id=partner.id,
        content=filename,
        message_type="image"
    )
    db.add(new_msg)
    await db.commit()

    from app.websocket.manager import manager
    await manager.send_to_user(partner.id, {
        "type": "once_view_incoming",
        "message_id": message_id,
        "sender_name": current_user.name or "Partner",
        "message": f"{current_user.name or 'Partner'} sent you a once-view photo 📸"
    })
    return {"status": "sent", "message_id": message_id}

@router.get("/view/{message_id}")
async def view_once_message(message_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(OnceViewMessage).filter(OnceViewMessage.message_id == message_id))
    msg = res.scalars().first()

    if not msg: raise HTTPException(404, "Not found")
    if msg.receiver_id != current_user.id: raise HTTPException(403, "Not yours")
    if msg.viewed: raise HTTPException(410, "Already viewed")

    msg.viewed = True
    msg.viewed_at = datetime.utcnow()
    
    content_to_return = msg.content
    msg.content = "[viewed]" # Wipe content

    if msg.message_type == "image":
        filepath = os.path.join(ONCE_VIEW_DIR, content_to_return)
        if os.path.exists(filepath): os.remove(filepath)

    from app.websocket.manager import manager
    await manager.send_to_user(msg.sender_id, {
        "type": "once_view_seen",
        "message_id": message_id,
        "message": f"{current_user.name or 'Partner'} viewed your once-view message 👁️"
    })
    
    await db.commit()
    return {
        "status": "ok",
        "content": content_to_return,
        "message_type": msg.message_type,
        "sender_name": msg.sender_name
    }

@router.post("/capture-attempt")
async def capture_attempt(req: CaptureAttemptRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(OnceViewMessage).filter(OnceViewMessage.message_id == req.message_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Not found")

    msg.capture_attempted = True
    msg.capture_attempted_at = datetime.utcnow()
    
    old_content = msg.content
    msg.content = "[capture attempted — deleted]"

    if msg.message_type == "image":
        filepath = os.path.join(ONCE_VIEW_DIR, old_content)
        if os.path.exists(filepath): os.remove(filepath)

    from app.websocket.manager import manager
    await manager.send_to_user(msg.sender_id, {
        "type": "capture_attempt_alert",
        "message_id": req.message_id,
        "message": f"⚠️ {current_user.name or 'Partner'} tried to capture your once-view message!"
    })
    
    await db.commit()
    return {"status": "deleted"}

@router.get("/pending")
async def get_pending(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(OnceViewMessage).filter(
        OnceViewMessage.receiver_id == current_user.id,
        OnceViewMessage.viewed == False,
        OnceViewMessage.capture_attempted == False
    ))
    msgs = res.scalars().all()
    return [{
        "message_id": m.message_id,
        "sender_name": m.sender_name,
        "message_type": m.message_type,
        "created_at": m.created_at
    } for m in msgs]