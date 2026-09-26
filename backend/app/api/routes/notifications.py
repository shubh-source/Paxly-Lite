from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete
from app.models.orm import User, Notification, PushSubscription as PushSubscriptionModel
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict

@router.post("/subscribe")
async def subscribe(data: PushSubscription, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PushSubscriptionModel).where(PushSubscriptionModel.user_id == cu.id))
    sub = result.scalar_one_or_none()
    
    if sub:
        sub.endpoint = data.endpoint
        sub.keys = data.keys
        sub.updated_at = datetime.utcnow()
    else:
        new_sub = PushSubscriptionModel(
            user_id=cu.id,
            endpoint=data.endpoint,
            keys=data.keys,
            updated_at=datetime.utcnow()
        )
        db.add(new_sub)
    
    await db.commit()
    return {"ok": True}

@router.get("/")
async def get_notifications(cu=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notification).where(Notification.user_id == cu.id).order_by(Notification.created_at.desc()).limit(30)
    )
    return result.scalars().all()

@router.put("/{notif_id}/read")
async def mark_read(notif_id: int, cu=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification).where(Notification.id == notif_id, Notification.user_id == cu.id).values(read=True)
    )
    await db.commit()
    return {"ok": True}

@router.put("/read-all")
async def mark_all_read(cu=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification).where(Notification.user_id == cu.id, Notification.read == False).values(read=True)
    )
    await db.commit()
    return {"ok": True}
