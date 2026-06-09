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
        "allow_download": allow_download if not m.is_once_view else False,
        "timestamp": m.timestamp.isoformat() + "Z",
    }

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
                filename = msg.media_url.split("/")[-1]
                await storage.delete_file(filename, "chat")
                # Note: We don't delete the DB record so the sender knows it was viewed.

    elif action == "compromise":
        msg.is_compromised = True
        # Immediately delete from storage
        filename = msg.media_url.split("/")[-1]
        await storage.delete_file(filename, "chat")

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
async def delete_message(message_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found.")
    if msg.sender_id != cu.id: raise HTTPException(403, "You can only delete your own messages.")
    
    # Delete from DB
    await db.delete(msg)
    await db.commit()
    
    # Send WebSocket event to partner to remove message
    from app.websocket.manager import manager
    await manager.send_to_user(msg.couple_space_id.replace(cu.id, ''), {
        "type": "message_deleted",
        "message_id": message_id
    })
    
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
            "avatar_url": getattr(partner, "avatar_url", None)
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
