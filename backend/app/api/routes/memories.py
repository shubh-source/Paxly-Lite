from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.schemas import MemoryOut
from app.models.orm import User, Memory, CoupleSpace, Message
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.core.encryption import decrypt_data
import os, uuid, re
from app.core.storage import storage

router = APIRouter(prefix="/memories", tags=["Memories"])

def ensure_space(cu: User):
    if not cu.couple_space_id:
        raise HTTPException(403, "No couple space. Connect with partner first.")
    return cu.couple_space_id

@router.get("/", response_model=list[MemoryOut])
async def get_memories(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    result = await db.execute(
        select(Memory)
        .filter(Memory.couple_space_id == space_id)
        .order_by(Memory.date.desc())
    )
    mems = result.scalars().all()
    
    # Fetch privacy setting
    space_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == space_id))
    space = space_res.scalars().first()
    allow_download = space.allow_media_save if space else True

    users_cache = {}
    res_list = []
    for m in mems:
        if m.created_by not in users_cache:
            u_res = await db.execute(select(User).filter(User.id == m.created_by))
            u = u_res.scalars().first()
            users_cache[m.created_by] = u.name if u else "Unknown"
            
        res_list.append(MemoryOut(
            id=str(m.id),
            title=m.title,
            description=m.description,
            image_url=m.image_url,
            date=m.date,
            created_by=m.created_by,
            created_by_name=users_cache[m.created_by],
            allow_download=allow_download,
            created_at=m.created_at
        ))
    return res_list

MAX_MEMORY_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

@router.post("/", response_model=MemoryOut)
async def create_memory(
    title: str = Form(...),
    description: str = Form(""),
    date: str = Form(...), # YYYY-MM-DD
    image: UploadFile = File(None),
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    space_id = ensure_space(cu)
    
    # Validate title
    clean_title = (title or "").strip()
    if not clean_title:
        raise HTTPException(status_code=400, detail="Memory title is required and cannot be blank.")

    # Validate date format (must be non-empty, strictly zero-padded YYYY-MM-DD, and a valid calendar date)
    clean_date = (date or "").strip()
    if not clean_date:
        raise HTTPException(status_code=400, detail="Memory date is required and cannot be blank.")
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$", clean_date):
        raise HTTPException(
            status_code=400,
            detail="Invalid date format for memory. Expected strictly zero-padded YYYY-MM-DD format."
        )
    try:
        datetime.strptime(clean_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid date format for memory. Expected a valid calendar date in YYYY-MM-DD format."
        )

    image_url = None
    if image and image.filename:
        ext = image.filename.split(".")[-1].lower() if "." in image.filename else ""
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Invalid image format '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}")
        
        if image.content_type and image.content_type.lower() not in ALLOWED_IMAGE_MIMES:
            raise HTTPException(status_code=400, detail=f"Unsupported image MIME type: {image.content_type}")

        chunk_size = 512 * 1024  # 512 KB
        chunks = []
        total_size = 0
        while True:
            chunk = await image.read(chunk_size)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_MEMORY_IMAGE_SIZE:
                raise HTTPException(status_code=413, detail="Memory image exceeds maximum allowed size of 10MB.")
            chunks.append(chunk)

        if total_size > 0:
            content = b"".join(chunks)
            filename = f"{uuid.uuid4()}.{ext}"
            image_url = await storage.upload_file(content, filename, "memories")

    new_mem = Memory(
        couple_space_id=space_id,
        title=clean_title,
        description=description,
        date=clean_date,
        image_url=image_url,
        created_by=cu.id
    )
    db.add(new_mem)
    await db.commit()
    await db.refresh(new_mem)
    
    return MemoryOut(
        id=str(new_mem.id),
        title=new_mem.title,
        description=new_mem.description,
        image_url=new_mem.image_url,
        date=new_mem.date,
        created_by=new_mem.created_by,
        created_by_name=cu.name or "Unknown",
        created_at=new_mem.created_at
    )

@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    await db.execute(delete(Memory).filter(Memory.id == memory_id, Memory.couple_space_id == space_id))
    await db.commit()
    return {"ok": True}

from pydantic import BaseModel

class SaveMessageRequest(BaseModel):
    message_id: str

@router.post("/save-message", response_model=MemoryOut)
async def save_message_to_vault(req: SaveMessageRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    # Fetch message
    msg_res = await db.execute(select(Message).filter(Message.id == req.message_id, Message.couple_space_id == space_id))
    msg = msg_res.scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found")
        
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    clean_desc = decrypt_data(msg.text) if msg.text else ""
    
    new_mem = Memory(
        couple_space_id=space_id,
        title="Saved Message",
        description=clean_desc,
        date=date_str,
        image_url=msg.media_url,
        created_by=cu.id
    )
    db.add(new_mem)
    await db.commit()
    await db.refresh(new_mem)
    
    return MemoryOut(
        id=str(new_mem.id),
        title=new_mem.title,
        description=new_mem.description,
        image_url=new_mem.image_url,
        date=new_mem.date,
        created_by=new_mem.created_by,
        created_by_name=cu.name or "Unknown",
        created_at=new_mem.created_at
    )

@router.get("/media", response_model=list[MemoryOut])
async def get_chat_media(type: str = "image", cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    # Query messages with matching type and media_url not null
    # message_type is 'image' or 'video'
    result = await db.execute(
        select(Message)
        .filter(Message.couple_space_id == space_id)
        .filter(Message.message_type == type)
        .filter(Message.media_url.isnot(None))
        .filter(Message.is_once_view == False)
        .order_by(Message.timestamp.desc())
    )
    mems = result.scalars().all()
    
    # Fetch privacy setting
    space_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == space_id))
    space = space_res.scalars().first()
    allow_download = space.allow_media_save if space else True

    users_cache = {}
    res_list = []
    for m in mems:
        if m.sender_id not in users_cache:
            u_res = await db.execute(select(User).filter(User.id == m.sender_id))
            u = u_res.scalars().first()
            users_cache[m.sender_id] = u.name if u else "Unknown"
            
        res_list.append(MemoryOut(
            id=str(m.id),
            title="Chat Media",
            description=decrypt_data(m.text) if m.text else "",
            image_url=m.media_url,
            date=m.timestamp.strftime("%Y-%m-%d"),
            created_by=m.sender_id,
            created_by_name=users_cache[m.sender_id],
            allow_download=allow_download,
            created_at=m.timestamp
        ))
    return res_list
