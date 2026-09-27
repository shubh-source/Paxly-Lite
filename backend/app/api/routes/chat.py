from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from app.models.schemas import ReactionAdd, MessageOut
from app.models.orm import User, Message, CoupleSpace
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.core.encryption import encrypt_data, decrypt_data
import os, uuid, shutil
from app.core.storage import storage

router = APIRouter(prefix="/chat", tags=["Chat"])

def ensure_space(cu: User):
    if not cu.couple_space_id:
        raise HTTPException(403, "No couple space. Connect with partner first.")
    return cu.couple_space_id

def fmt_msg(m: Message, sender_name: str, allow_download: bool = True) -> dict:
    # Security check: if once_view and views exhausted, hide media_url
    show_media = True
    if m.is_once_view and m.views_used >= m.view_limit:
        show_media = False
    
    return {
        "id": str(m.id),
        "sender_id": m.sender_id,
        "sender_name": sender_name,
        "message_type": m.message_type or "text",
        "text": decrypt_data(m.text or ""),
        "media_url": m.media_url if show_media else None,
        "reactions": m.reactions or {},
        "is_once_view": m.is_once_view,
        "view_limit": m.view_limit,
        "views_used": m.views_used,
        "is_compromised": m.is_compromised,
        "reply_to_id": m.reply_to_id,
        "allow_download": allow_download if not m.is_once_view else False,
        "timestamp": m.timestamp.isoformat() + "Z",
    }

from pydantic import BaseModel
from typing import Optional, List

class MessageCreate(BaseModel):
    text: Optional[str] = None
    message_type: str = "text"
    media_url: Optional[str] = None
    is_once_view: bool = False
    view_limit: int = 1
    reply_to_id: Optional[str] = None
    temp_id: Optional[str] = None

@router.post("/messages")
async def send_message_rest(data: MessageCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    raw_text = data.text or ""
    encrypted_text = encrypt_data(raw_text)
    
    msg = Message(
        id=str(uuid.uuid4()),
        couple_space_id=space_id,
        sender_id=cu.id,
        message_type=data.message_type or "text",
        text=encrypted_text,
        media_url=data.media_url,
        is_once_view=data.is_once_view,
        view_limit=data.view_limit,
        timestamp=datetime.utcnow(),
        reply_to_id=data.reply_to_id
    )
    
    # Auto-save audio to voice notes
    if msg.media_url and not msg.is_once_view and msg.message_type == "audio":
        from app.models.orm import VoiceNote
        vn = VoiceNote(
            id=str(uuid.uuid4()),
            couple_space_id=space_id,
            sender_id=cu.id,
            url=msg.media_url,
            filename="voice_note.webm",
            custom_name="Chat Whisper",
            size=0,
            created_at=msg.timestamp
        )
        db.add(vn)

    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    
    broadcast_data = {
        "type": "chat_message",
        "id": msg.id,
        "temp_id": data.temp_id,
        "sender_id": cu.id,
        "sender_name": cu.name,
        "message_type": msg.message_type,
        "text": raw_text,
        "media_url": msg.media_url,
        "reactions": msg.reactions or {},
        "is_once_view": msg.is_once_view,
        "view_limit": msg.view_limit,
        "views_used": msg.views_used,
        "reply_to_id": msg.reply_to_id,
        "timestamp": msg.timestamp.isoformat() + "Z"
    }
    
    # Broadcast to couple space via WebSocket manager so partner receives instantly!
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, broadcast_data)
    except Exception as e:
        print(f"WS Broadcast error: {e}")
        
    res = fmt_msg(msg, cu.name, True)
    res["temp_id"] = data.temp_id
    return res

@router.get("/messages")
async def get_messages(skip: int = 0, limit: int = 50, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    space_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == space_id))
    space = space_res.scalars().first()
    allow_download = space.allow_media_save if space else True

    result = await db.execute(
        select(Message)
        .filter(Message.couple_space_id == space_id)
        .order_by(Message.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )
    msgs = result.scalars().all()
    msgs = list(msgs)
    msgs.reverse()

    users_cache = {}
    result_list = []
    for m in msgs:
        if cu.id in (m.deleted_for or []):
            continue
        sid = m.sender_id
        if sid not in users_cache:
            u_res = await db.execute(select(User).filter(User.id == sid))
            u = u_res.scalars().first()
            users_cache[sid] = u.name if u else "Unknown"
        result_list.append(fmt_msg(m, users_cache[sid], allow_download))
    return result_list

@router.post("/upload-media")
async def upload_media(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_space(cu)
    filename_str = file.filename if file.filename else "upload.jpg"
    ext = filename_str.split(".")[-1].lower() if "." in filename_str else "jpg"
    if ext not in ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mp3", "m4a", "ogg", "webm", "heic", "mov"]:
        raise HTTPException(400, f"File type {ext} not allowed.")
    
    content = await file.read()
    size = len(content)
    
    limit_mb = settings.MAX_FILE_SIZE_MB if cu.is_premium else 5
    if size > limit_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large. Free users limit: 5MB, Premium limit: {settings.MAX_FILE_SIZE_MB}MB.")
    
    filename = f"{uuid.uuid4()}.{ext}"
    url = await storage.upload_file(content, filename, "chat")
    return {"media_url": url, "filename": filename}

@router.post("/messages/{message_id}/secure-event")
async def secure_event(message_id: str, action: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Handles secure media events:
    - 'view': Increments views_used. Deletes media if limit reached.
    - 'compromise': Marks as compromised (AI detected phone).
    """
    space_id = ensure_space(cu)
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found.")

    if action == "view":
        # Only increment if the viewer is NOT the sender
        if msg.sender_id != cu.id:
            msg.views_used += 1
            if msg.views_used >= msg.view_limit:
                # Delete from storage
                if msg.media_url:
                    try:
                        filename = msg.media_url.split("/")[-1]
                        await storage.delete_file(filename, "chat")
                    except Exception as e:
                        print(f"Failed to delete {msg.media_url}: {e}")
                # True Server-Side Ephemeral: Wipe content from database
                msg.text = None
                msg.media_url = None

    elif action == "compromise":
        msg.is_compromised = True
        # Immediately delete from storage
        if msg.media_url:
            try:
                filename = msg.media_url.split("/")[-1]
                await storage.delete_file(filename, "chat")
            except Exception as e:
                print(f"Failed to delete {msg.media_url}: {e}")
        # Wipe content from database
        msg.text = None
        msg.media_url = None

    await db.commit()
    return {"ok": True, "views_used": msg.views_used}

@router.post("/messages/{message_id}/react")
async def react(message_id: str, data: ReactionAdd, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found.")
    
    new_reactions = dict(msg.reactions or {})
    new_reactions[cu.id] = data.emoji
    msg.reactions = new_reactions
    await db.commit()
    return {"ok": True}

@router.delete("/messages/{message_id}/react")
async def remove_reaction(message_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found.")
    
    new_reactions = dict(msg.reactions or {})
    if cu.id in new_reactions:
        del new_reactions[cu.id]
        msg.reactions = new_reactions
        await db.commit()
    return {"ok": True}

@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, for_everyone: bool = True, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found.")
    
    if for_everyone:
        if msg.sender_id != cu.id: raise HTTPException(403, "You can only delete your own messages for everyone.")
        await db.delete(msg)
        await db.commit()
        
        # Send WebSocket event to partner to remove message
        from app.websocket.manager import manager
        await manager.send_to_user(msg.couple_space_id.replace(cu.id, ''), {
            "type": "message_deleted",
            "message_id": message_id
        })
    else:
        # Delete for me only
        deleted_list = list(msg.deleted_for or [])
        if cu.id not in deleted_list:
            deleted_list.append(cu.id)
            msg.deleted_for = deleted_list
            await db.commit()
            
    return {"ok": True}

@router.get("/space")
async def get_chat_space(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == space_id))
    space = res.scalars().first()
    if not space:
        raise HTTPException(404, "Space not found")
        
    partner_id = space.user1_id if space.user1_id != cu.id else space.user2_id
    pres = await db.execute(select(User).filter(User.id == partner_id))
    partner = pres.scalars().first()
    
    return {
        "space": {
            "id": space.id,
            "theme_id": getattr(space, "theme_id", "classic"),
            "chat_wallpaper": getattr(space, "chat_wallpaper", None),
            "allow_media_save": space.allow_media_save
        },
        "partner": {
            "id": partner.id if partner else None,
            "name": partner.name if partner else "Unknown",
            "avatar_url": getattr(partner, "avatar_url", None),
            "public_key": getattr(partner, "public_key", None)
        }
    }

@router.patch("/space/theme")
async def update_theme(data: dict, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    theme_id = data.get("theme_id", "classic")
    await db.execute(update(CoupleSpace).where(CoupleSpace.id == space_id).values(theme_id=theme_id))
    await db.commit()
    return {"theme_id": theme_id}

@router.post("/space/wallpaper")
async def update_wallpaper(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.is_premium:
        raise HTTPException(402, "Custom backgrounds require a Vlynxly Premium subscription.")
    
    space_id = ensure_space(cu)
    ext = file.filename.split(".")[-1].lower()
    filename = f"wp_{space_id}.{ext}" # Reuse per space
    path = os.path.join(settings.MEDIA_DIR, "chat", filename)
    
    content = await file.read()
    url = await storage.upload_file(content, filename, "chat")
    await db.execute(update(CoupleSpace).where(CoupleSpace.id == space_id).values(chat_wallpaper=url))
    await db.commit()
    return {"chat_wallpaper": url}
