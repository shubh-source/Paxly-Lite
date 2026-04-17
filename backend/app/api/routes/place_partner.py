from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete
from app.models.orm import User, Place, PlaceBooking
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List
import uuid
import os

router = APIRouter(prefix="/partner/places", tags=["place-partner"])

class PlaceManage(BaseModel):
    name: str
    category: str
    address: Optional[str] = ""
    description: Optional[str] = ""
    slots: List[str] = [] # Example: ["10:00 AM", "12:00 PM"]

@router.post("/register")
async def register_place(data: PlaceManage, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.role != "partner":
        raise HTTPException(403, "Only partners can register businesses")
    
    new_place = Place(
        name=data.name,
        category=data.category,
        address=data.address,
        description=data.description,
        slots=data.slots,
        owner_id=cu.id,
        is_approved=False # Requires admin approval
    )
    db.add(new_place)
    await db.commit()
    await db.refresh(new_place)
    return new_place

@router.get("/my")
async def get_my_place(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Place).filter(Place.owner_id == cu.id))
    return res.scalars().all()

@router.patch("/{place_id}")
async def update_place(place_id: int, data: PlaceManage, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Place).filter(Place.id == place_id, Place.owner_id == cu.id))
    place = res.scalar_one_or_none()
    if not place: raise HTTPException(404, "Place not found or ownership missing")
    
    await db.execute(update(Place).where(Place.id == place_id).values(
        name=data.name,
        category=data.category,
        address=data.address,
        description=data.description,
        slots=data.slots
    ))
    await db.commit()
    return {"ok": True}

@router.get("/bookings")
async def get_place_bookings(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Find all places owned by user
    res = await db.execute(select(Place.id).filter(Place.owner_id == cu.id))
    place_ids = res.scalars().all()
    
    res = await db.execute(select(PlaceBooking).filter(PlaceBooking.place_id.in_(place_ids)).order_by(PlaceBooking.created_at.desc()))
    return res.scalars().all()
