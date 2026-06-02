from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.schemas import MemoryOut
from app.models.orm import User, Memory, CoupleSpace
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
import os, uuid
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
    image_url = None
    if image:
        ext = image.filename.split(".")[-1].lower()
        filename = f"{uuid.uuid4()}.{ext}"
        content = await image.read()
        image_url = await storage.upload_file(content, filename, "memories")

    new_mem = Memory(
        couple_space_id=space_id,
        title=title,
        description=description,
        date=date,
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
        created_by_name=cu.name,
        created_at=new_mem.created_at
    )

@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    await db.execute(delete(Memory).filter(Memory.id == memory_id, Memory.couple_space_id == space_id))
    await db.commit()
    return {"ok": True}
