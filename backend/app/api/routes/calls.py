from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.orm import User, CallLog
from app.core.security import get_current_user
from app.core.database import get_db
from typing import List

router = APIRouter(prefix="/calls", tags=["Calls"])

@router.get("/history")
async def get_call_history(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    result = await db.execute(
        select(CallLog)
        .filter(CallLog.couple_space_id == cu.couple_space_id)
        .order_by(CallLog.timestamp.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    
    # Get user names for display
    users_cache = {cu.id: "You"}
    if cu.partner_id:
        u_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        u = u_res.scalars().first()
        if u: users_cache[u.id] = u.name

    res_list = []
    for l in logs:
        res_list.append({
            "id": l.id,
            "caller_id": l.caller_id,
            "caller_name": users_cache.get(l.caller_id, "Unknown"),
            "recipient_id": l.recipient_id,
            "recipient_name": users_cache.get(l.recipient_id, "Unknown"),
            "call_type": l.call_type,
            "duration": l.duration,
            "recording_url": l.recording_url,
            "timestamp": l.timestamp.isoformat()
        })
    
    return res_list
