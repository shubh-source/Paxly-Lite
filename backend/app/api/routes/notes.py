from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, and_
from app.models.orm import User, Note
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/notes", tags=["Notes"])

class NoteCreate(BaseModel):
    title: str
    content: str
    color: Optional[str] = "#ffffff"
    unlock_at: Optional[datetime] = None
    share_with_partner: bool = False
    display_hours: Optional[int] = 24 # How long to show on partner's dashboard

@router.post("/")
async def create_note(data: NoteCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    until = None
    if data.share_with_partner and data.display_hours:
        until = datetime.utcnow() + timedelta(hours=data.display_hours)

    new_note = Note(
        couple_space_id=cu.couple_space_id,
        created_by=cu.id,
        title=data.title,
        content=data.content,
        color=data.color,
        unlock_at=data.unlock_at,
        is_newly_shared=data.share_with_partner,
        shared_display_until=until
    )
    db.add(new_note)
    await db.commit()
    await db.refresh(new_note)
    return new_note

@router.get("/")
async def get_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    result = await db.execute(
        select(Note)
        .filter(Note.couple_space_id == cu.couple_space_id)
        .order_by(Note.is_pinned.desc(), Note.updated_at.desc())
    )
    notes = result.scalars().all()
    now = datetime.utcnow()
    # Strip content for locked notes to guarantee security
    for note in notes:
        if note.unlock_at and note.unlock_at > now:
            note.content = ""
            
    return notes

@router.get("/dashboard-alerts")
async def get_dashboard_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch notes shared by partner that are still in their visibility window."""
    if not cu.couple_space_id: return []
    
    now = datetime.utcnow()
    result = await db.execute(
        select(Note)
        .filter(
            Note.couple_space_id == cu.couple_space_id,
            Note.created_by != cu.id,
            Note.is_newly_shared == True,
            and_(Note.shared_display_until > now)
        )
    )
    return result.scalars().all()

    await db.commit()
    return {"ok": True}

@router.post("/{note_id}/open")
async def open_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Note).filter(Note.id == note_id).values(is_opened=True))
    await db.commit()
    return {"ok": True}

@router.put("/{note_id}")
async def update_note(note_id: str, data: dict, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    allowed = {"title", "content", "color", "is_pinned"}
    updates = {k: v for k, v in data.items() if k in allowed}
    updates["updated_at"] = datetime.utcnow()
    
    await db.execute(update(Note).filter(Note.id == note_id).values(**updates))
    await db.commit()
    return {"ok": True}

@router.delete("/{note_id}")
async def delete_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Note).filter(Note.id == note_id))
    await db.commit()
    return {"ok": True}
