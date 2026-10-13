from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, and_
from app.models.orm import User, Note, Notification
from app.websocket.manager import manager
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
    share_with_partner: bool = True
    display_hours: Optional[int] = 24 # How long to show on partner's dashboard

@router.post("/")
async def create_note(data: NoteCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
        
    until = None
    if data.share_with_partner and data.display_hours:
        until = datetime.utcnow() + timedelta(hours=data.display_hours)

    new_note = Note(
        couple_space_id=space_id,
        created_by=cu.id,
        title=data.title,
        content=data.content,
        color=data.color or "#ffffff",
        unlock_at=data.unlock_at,
        is_newly_shared=bool(cu.partner_id and data.share_with_partner),
        shared_display_until=until
    )
    db.add(new_note)

    # Dispatch notification to partner if connected
    if cu.partner_id and data.share_with_partner:
        db.add(Notification(
            user_id=cu.partner_id,
            type="love_note",
            title="New Love Note 💌",
            body=f"{cu.name or 'Your partner'} left you a special note.",
            data={"note_id": new_note.id}
        ))

    await db.commit()
    await db.refresh(new_note)

    if cu.partner_id and data.share_with_partner:
        try:
            await manager.send_to_user(cu.partner_id, {
                "type": "love_note",
                "title": "New Love Note 💌",
                "body": f"{cu.name or 'Your partner'} left you a special note.",
                "note_id": new_note.id
            })
        except Exception:
            pass

    return new_note

@router.get("/")
async def get_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.couple_space_id:
        result = await db.execute(
            select(Note)
            .filter(Note.couple_space_id == cu.couple_space_id)
            .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Note)
            .filter(Note.created_by == cu.id)
            .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        )

    notes = result.scalars().all()

    partner_name = "Partner"
    if cu.partner_id:
        p_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        partner = p_res.scalars().first()
        if partner and partner.name:
            partner_name = partner.name

    now = datetime.utcnow()
    out = []
    for note in notes:
        is_locked = bool(note.unlock_at and note.unlock_at > now)
        out.append({
            "id": note.id,
            "couple_space_id": note.couple_space_id,
            "created_by": note.created_by,
            "sender_name": (cu.name or "You") if note.created_by == cu.id else partner_name,
            "title": note.title or "💌",
            "content": "" if is_locked else (note.content or ""),
            "color": note.color or "#ffffff",
            "is_pinned": bool(note.is_pinned),
            "is_opened": bool(note.is_opened),
            "unlock_at": note.unlock_at.isoformat() if note.unlock_at else None,
            "created_at": note.created_at.isoformat() if note.created_at else now.isoformat(),
            "updated_at": note.updated_at.isoformat() if note.updated_at else now.isoformat(),
        })

    return out

@router.get("/dashboard-alerts")
async def get_dashboard_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch notes shared by partner that are still in their visibility window."""
    if not cu.couple_space_id:
        return []
    
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
