from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.models.schemas import MoodCreate, MoodOut
from app.models.orm import User, Mood
from app.core.security import get_current_user
from app.core.database import get_db
from typing import List

router = APIRouter(prefix="/mood", tags=["Mood"])

@router.post("/set", response_model=MoodOut)
async def set_mood(data: MoodCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = str(space.id) if space else (cu.couple_space_id or "default")
    
    new_mood = Mood(
        user_id=str(cu.id),
        mood_type=data.mood_type,
        note=data.note
    )
    db.add(new_mood)
    await db.commit()
    await db.refresh(new_mood)
    
    # Broadcast to couple space via WebSocket immediately for instant real-time sync (<50ms)
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, {
            "type": "mood_update",
            "user_id": str(cu.id),
            "user_name": cu.name or "Partner",
            "mood_type": new_mood.mood_type,
            "note": new_mood.note or "",
            "date": new_mood.timestamp.strftime("%Y-%m-%d"),
            "timestamp": new_mood.timestamp.isoformat()
        })
    except Exception:
        pass
    
    return {
        "id": str(new_mood.id),
        "user_id": str(new_mood.user_id),
        "user_name": cu.name or "Partner",
        "mood_type": new_mood.mood_type,
        "note": new_mood.note or "",
        "date": new_mood.timestamp.strftime("%Y-%m-%d"),
        "timestamp": new_mood.timestamp
    }

@router.get("/today", response_model=List[MoodOut])
async def get_today_moods(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    
    user_ids = [str(cu.id)]
    user_map = {str(cu.id): cu.name or "You"}
    if partner:
        user_ids.append(str(partner.id))
        user_map[str(partner.id)] = partner.name or "Partner"
    
    # Get moods ordered by most recent first
    result = await db.execute(
        select(Mood)
        .filter(Mood.user_id.in_(user_ids))
        .order_by(Mood.timestamp.desc())
        .limit(20)
    )
    moods = result.scalars().all()
    
    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "user_name": user_map.get(str(m.user_id), "Partner" if str(m.user_id) != str(cu.id) else (cu.name or "You")),
            "mood_type": m.mood_type,
            "note": m.note or "",
            "date": m.timestamp.strftime("%Y-%m-%d") if m.timestamp else datetime.utcnow().strftime("%Y-%m-%d"),
            "timestamp": m.timestamp or datetime.utcnow()
        } for m in moods
    ]

@router.get("/history", response_model=List[MoodOut])
async def mood_history(limit: int = 30, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    
    user_ids = [str(cu.id)]
    user_map = {str(cu.id): cu.name or "You"}
    if partner:
        user_ids.append(str(partner.id))
        user_map[str(partner.id)] = partner.name or "Partner"

    result = await db.execute(
        select(Mood)
        .filter(Mood.user_id.in_(user_ids))
        .order_by(Mood.timestamp.desc())
        .limit(limit)
    )
    moods = result.scalars().all()
    
    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "user_name": user_map.get(str(m.user_id), "Partner" if str(m.user_id) != str(cu.id) else (cu.name or "You")),
            "mood_type": m.mood_type,
            "note": m.note or "",
            "date": m.timestamp.strftime("%Y-%m-%d") if m.timestamp else datetime.utcnow().strftime("%Y-%m-%d"),
            "timestamp": m.timestamp or datetime.utcnow()
        } for m in moods
    ]
