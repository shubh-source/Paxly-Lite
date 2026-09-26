from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, func, or_
from app.models.orm import User, Theatre, TheatreBooking
from app.models.schemas import TheatreCreate, TheatreUpdate, BookingStatusUpdate
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, List
import uuid, os, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

router = APIRouter(prefix="/theatre", tags=["Private Theatre"])

# ── PUBLIC ROUTES ─────────────────────────────────────────────
@router.get("/")
async def get_theatres(city: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Theatre).filter(Theatre.active == True, Theatre.is_approved == True)
    if city:
        query = query.filter(Theatre.city.ilike(f"%{city}%"))
    res = await db.execute(query)
    return res.scalars().all()

@router.get("/{theatre_id}")
async def get_theatre(theatre_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Theatre).filter(Theatre.id == theatre_id))
    t = res.scalars().first()
    if not t: raise HTTPException(404)
    return t

@router.get("/{theatre_id}/availability")
async def get_availability(theatre_id: str, date: str, db: AsyncSession = Depends(get_db)):
    """Return list of slots that are already booked (pending or confirmed)"""
    res = await db.execute(select(TheatreBooking).filter(
        TheatreBooking.theatre_id == theatre_id,
        TheatreBooking.date == date,
        TheatreBooking.status.in_(["pending", "confirmed"])
    ))
    bookings = res.scalars().all()
    occupied = [b.slot for b in bookings]
    return {"theatre_id": theatre_id, "date": date, "occupied_slots": occupied}

# ── BOOKING ───────────────────────────────────────────────────
class BookingCreate(BaseModel):
    theatre_id: str
    date: str
    slot: str
    movie_name: str
    guests: int = 2
    decoration: bool = False

@router.post("/book")
async def book_theatre(data: BookingCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Theatre).filter(Theatre.id == data.theatre_id))
    theatre = res.scalars().first()
    if not theatre or not theatre.is_approved: 
        raise HTTPException(404, "Theatre not found or not approved.")
    
    # Check if slot already taken
    res = await db.execute(select(TheatreBooking).filter(
        TheatreBooking.theatre_id == data.theatre_id,
        TheatreBooking.date == data.date,
        TheatreBooking.slot == data.slot,
        TheatreBooking.status.in_(["pending", "confirmed"])
    ))
    if res.scalars().first():
        raise HTTPException(400, "This slot is occupied. Please choose another.")
        
    booking_id = str(uuid.uuid4())[:8].upper()
    total = theatre.price_per_hour * 2 
    
    new_booking = TheatreBooking(
        booking_id=booking_id,
        theatre_id=theatre.id,
        theatre_name=theatre.name,
        user_id=cu.id,
        user_name=cu.name,
        date=data.date,
        slot=data.slot,
        movie_name=data.movie_name,
        guests=data.guests,
        decoration=data.decoration,
        total_amount=total,
        status="pending"
    )
    db.add(new_booking)
    await db.commit()
    return {"booking_id": booking_id, "status": "pending", "message": "Booking requested! Waiting for owner confirmation."}

# ── PARTNER PORTAL ROUTES ──────────────────────────────────────
def partner_only(cu: User = Depends(get_current_user)):
    if cu.role != "partner":
        raise HTTPException(401, "Partner access only.")
    return cu

@router.get("/partner/my")
async def partner_theatres(cu: User = Depends(partner_only), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Theatre).filter(Theatre.owner_id == cu.id))
    return res.scalars().all()

@router.post("/partner/add")
async def partner_add_theatre(data: TheatreCreate, cu: User = Depends(partner_only), db: AsyncSession = Depends(get_db)):
    new_t = Theatre(
        id=str(uuid.uuid4())[:12],
        owner_id=cu.id,
        is_approved=False, # Wait for admin
        **data.model_dump()
    )
    db.add(new_t)
    await db.commit()
    await db.refresh(new_t)
    return new_t

@router.get("/partner/bookings")
async def partner_bookings(cu: User = Depends(partner_only), db: AsyncSession = Depends(get_db)):
    # Join with Theatre to ensure we only see bookings for owned theatres
    res = await db.execute(
        select(TheatreBooking)
        .join(Theatre, Theatre.id == TheatreBooking.theatre_id)
        .filter(Theatre.owner_id == cu.id)
        .order_by(TheatreBooking.created_at.desc())
    )
    return res.scalars().all()

@router.patch("/partner/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, data: BookingStatusUpdate, cu: User = Depends(partner_only), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(TheatreBooking)
        .join(Theatre, Theatre.id == TheatreBooking.theatre_id)
        .filter(TheatreBooking.booking_id == booking_id, Theatre.owner_id == cu.id)
    )
    booking = res.scalars().first()
    if not booking: raise HTTPException(404)
    
    booking.status = data.status
    await db.commit()
    return {"booking_id": booking_id, "new_status": data.status}

# ── ADMIN ROUTES ─────────────────────────────────────────────
def admin_only(cu: User = Depends(get_current_user)):
    # You can set your role to 'admin' in the DB manually or via an initial setup
    if cu.role != "admin":
        raise HTTPException(401, "Admin only.")
    return cu

@router.get("/admin/pending")
async def list_pending_approvals(cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Theatre).filter(Theatre.is_approved == False))
    return res.scalars().all()

@router.patch("/admin/approve/{theatre_id}")
async def approve_theatre(theatre_id: str, cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Theatre).filter(Theatre.id == theatre_id))
    t = res.scalars().first()
    if not t: raise HTTPException(404)
    t.is_approved = True
    await db.commit()
    return {"message": f"Theatre {t.name} approved!"}
