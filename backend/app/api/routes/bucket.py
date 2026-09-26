from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from app.models.orm import User, BucketItem
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/bucket", tags=["Bucket"])

class BucketCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    emoji: Optional[str] = "🎯"
    category: Optional[str] = "adventure"

class BucketUpdate(BaseModel):
    completed: bool

@router.post("/")
async def create_item(data: BucketCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    new_item = BucketItem(
        couple_space_id=cu.couple_space_id,
        created_by=cu.id,
        created_by_name=cu.name,
        title=data.title,
        description=data.description,
        emoji=data.emoji,
        category=data.category,
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return new_item

@router.get("/")
async def get_items(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    result = await db.execute(
        select(BucketItem)
        .filter(BucketItem.couple_space_id == cu.couple_space_id)
        .order_by(BucketItem.created_at.desc())
    )
    return result.scalars().all()

@router.put("/{item_id}")
async def toggle_item(item_id: str, data: BucketUpdate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(BucketItem)
        .filter(BucketItem.id == item_id)
        .values(completed=data.completed, completed_at=datetime.utcnow() if data.completed else None)
    )
    await db.commit()
    return {"ok": True}

@router.delete("/{item_id}")
async def delete_item(item_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(BucketItem).filter(BucketItem.id == item_id))
    await db.commit()
    return {"ok": True}
