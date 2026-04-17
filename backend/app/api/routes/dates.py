from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.orm import User, Anniversary
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/dates", tags=["Dates"])

class AnniversaryCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD
    type: Optional[str] = "anniversary" # anniversary | birthday | first_date

@router.post("/")
async def create_anniversary(data: AnniversaryCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    new_ann = Anniversary(
        couple_space_id=cu.couple_space_id,
        title=data.title,
        date=data.date,
        type=data.type,
    )
    db.add(new_ann)
    await db.commit()
    await db.refresh(new_ann)
    return new_ann

@router.get("/")
async def get_anniversaries(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
        
    result = await db.execute(
        select(Anniversary)
        .filter(Anniversary.couple_space_id == cu.couple_space_id)
        .order_by(Anniversary.date.asc())
    )
    return result.scalars().all()

@router.delete("/{id}")
async def delete_anniversary(id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Anniversary).filter(Anniversary.id == id))
    await db.commit()
    return {"ok": True}
