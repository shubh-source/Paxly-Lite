from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, or_, and_
from app.models.orm import User, VoiceNote
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from pydantic import BaseModel
import os, uuid
from app.core.storage import storage

router = APIRouter(prefix="/voice-notes", tags=["VoiceNotes"])

class VoiceRename(BaseModel):
    custom_name: str

@router.post("/upload")
async def upload_voice(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected to a couple space.")
    
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "webm"
    filename = f"{uuid.uuid4()}.{ext}"
    content = await file.read()
    size = len(content)
    url = await storage.upload_file(content, filename, "voice")
    
    new_note = VoiceNote(
        couple_space_id=cu.couple_space_id,
        sender_id=cu.id,
        url=url,
        filename=filename,
        size=size
    )
    db.add(new_note)
    await db.commit()
    await db.refresh(new_note)
    return new_note

@router.get("/")
async def get_voice_notes(
    query: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None), # YYYY-MM-DD
    to_date: Optional[str] = Query(None),   # YYYY-MM-DD
    cu: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
    
    stmt = select(VoiceNote).filter(VoiceNote.couple_space_id == cu.couple_space_id)
    
    if query:
        stmt = stmt.filter(or_(
            VoiceNote.custom_name.ilike(f"%{query}%"),
            VoiceNote.filename.ilike(f"%{query}%")
        ))
    
    if from_date:
        try:
            start = datetime.strptime(from_date, "%Y-%m-%d")
            stmt = stmt.filter(VoiceNote.created_at >= start)
        except: pass
        
    if to_date:
        try:
            end = datetime.strptime(to_date, "%Y-%m-%d")
            stmt = stmt.filter(VoiceNote.created_at <= end)
        except: pass
        
    result = await db.execute(stmt.order_by(VoiceNote.created_at.desc()))
    return result.scalars().all()

@router.patch("/{note_id}/rename")
async def rename_voice_note(note_id: str, data: VoiceRename, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(VoiceNote).filter(VoiceNote.id == note_id, VoiceNote.couple_space_id == cu.couple_space_id))
    note = res.scalars().first()
    if not note:
        raise HTTPException(404, "Voice note not found.")
    
    note.custom_name = data.custom_name
    await db.commit()
    return note

@router.delete("/{note_id}")
async def delete_voice_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(VoiceNote).filter(VoiceNote.id == note_id, VoiceNote.couple_space_id == cu.couple_space_id))
    note = res.scalars().first()
    if note:
        await storage.delete_file(note.filename, "voice")
        await db.delete(note)
        await db.commit()
    return {"ok": True}
