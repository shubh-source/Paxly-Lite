from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.models.schemas import MoodCreate, MoodOut
from app.models.orm import User, Mood
from app.core.security import get_current_user
from app.core.database import get_db
from typing import List

router = APIRouter(prefix="/mood", tags=["Mood"])

def ensure_space(cu: User):
    if not cu.couple_space_id:
        raise HTTPException(403, "No couple space. Connect with partner first.")
    return cu.couple_space_id

@router.post("/set", response_model=MoodOut)
async def set_mood(data: MoodCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    new_mood = Mood(
        user_id=cu.id,
        mood_type=data.mood_type,
        note=data.note
    )
    db.add(new_mood)
    await db.commit()
    await db.refresh(new_mood)
    
    return {
        "id": new_mood.id,
        "user_id": new_mood.user_id,
        "user_name": cu.name or "Partner",
        "mood_type": new_mood.mood_type,
        "note": new_mood.note,
        "date": new_mood.timestamp.strftime("%Y-%m-%d"),
        "timestamp": new_mood.timestamp
    }

@router.get("/today", response_model=List[MoodOut])
async def get_today_moods(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    # Get all users in this space
    u_res = await db.execute(select(User).filter(User.couple_space_id == space_id))
    space_users = u_res.scalars().all()
    user_ids = [u.id for u in space_users]
    user_map = {u.id: u.name for u in space_users}
    
    # Get moods for today
    today = datetime.utcnow().date()
    # Filter by created_at date
    result = await db.execute(
        select(Mood)
        .filter(Mood.user_id.in_(user_ids))
        .order_by(Mood.timestamp.desc())
        .limit(20)
    )
    moods = result.scalars().all()
    
    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "user_name": user_map.get(m.user_id, "Unknown"),
            "mood_type": m.mood_type,
            "note": m.note,
            "date": m.timestamp.strftime("%Y-%m-%d"),
            "timestamp": m.timestamp
        } for m in moods
    ]

@router.get("/history", response_model=List[MoodOut])
async def mood_history(limit: int = 30, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = ensure_space(cu)
    
    u_res = await db.execute(select(User).filter(User.couple_space_id == space_id))
    space_users = u_res.scalars().all()
    user_ids = [u.id for u in space_users]
    user_map = {u.id: u.name for u in space_users}

    result = await db.execute(
        select(Mood)
        .filter(Mood.user_id.in_(user_ids))
        .order_by(Mood.timestamp.desc())
        .limit(limit)
    )
    moods = result.scalars().all()
    
    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "user_name": user_map.get(m.user_id, "Unknown"),
            "mood_type": m.mood_type,
            "note": m.note,
            "date": m.timestamp.strftime("%Y-%m-%d"),
            "timestamp": m.timestamp
        } for m in moods
    ]
