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

MAX_VOICE_NOTE_SIZE = 15 * 1024 * 1024  # 15 MB
ALLOWED_AUDIO_EXTENSIONS = {"webm", "mp3", "wav", "ogg", "m4a", "aac", "mp4"}
ALLOWED_AUDIO_MIMES = {
    "audio/webm", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "video/webm"
}

@router.post("/upload")
async def upload_voice(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    
    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "webm"
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid audio format '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}")

    if file.content_type and file.content_type.lower() not in ALLOWED_AUDIO_MIMES:
        raise HTTPException(status_code=400, detail=f"Unsupported audio MIME type: {file.content_type}")

    # Read file chunk-by-chunk to prevent memory exhaustion
    chunk_size = 512 * 1024  # 512 KB
    chunks = []
    total_size = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_VOICE_NOTE_SIZE:
            raise HTTPException(status_code=413, detail="Voice note exceeds maximum allowed size of 15MB.")
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded voice file is empty.")

    content = b"".join(chunks)
    filename = f"{uuid.uuid4()}.{ext}"
    url = await storage.upload_file(content, filename, "voice")
    
    new_note = VoiceNote(
        couple_space_id=space_id,
        sender_id=cu.id,
        url=url,
        filename=filename,
        size=total_size
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
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    stmt = select(VoiceNote).filter(VoiceNote.couple_space_id == space_id)
    
    if query and query.strip():
        q_clean = query.strip()
        stmt = stmt.filter(or_(
            VoiceNote.custom_name.ilike(f"%{q_clean}%"),
            VoiceNote.filename.ilike(f"%{q_clean}%")
        ))
    
    if from_date:
        try:
            start = datetime.strptime(from_date, "%Y-%m-%d")
            stmt = stmt.filter(VoiceNote.created_at >= start)
        except Exception:
            pass
        
    if to_date:
        try:
            end = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            stmt = stmt.filter(VoiceNote.created_at <= end)
        except Exception:
            pass
        
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
    return {"id": note.id, "custom_name": note.custom_name}

@router.delete("/{note_id}")
async def delete_voice_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(VoiceNote).filter(VoiceNote.id == note_id, VoiceNote.couple_space_id == cu.couple_space_id))
    note = res.scalars().first()
    if note:
        await storage.delete_file(note.filename, "voice")
        await db.delete(note)
        await db.commit()
    return {"ok": True}
