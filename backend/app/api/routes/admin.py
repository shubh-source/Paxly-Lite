from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update, insert
from app.models.orm import User, Theatre, TheatreBooking, PlaceBooking, CoupleSpace, Notification, AppConfig, Product, Place, AdminAudit, PromoCode
from app.core.security import admin_only, get_current_user
from app.core.database import get_db
from typing import List
import uuid

router = APIRouter(prefix="/admin", tags=["Admin"])

async def log_admin_action(admin_id: str, action: str, details: dict, request: Request, db: AsyncSession):
    new_audit = AdminAudit(
        admin_id=admin_id,
        action=action,
        details=details,
        ip_address=request.client.host
    )
    db.add(new_audit)

@router.get("/stats")
async def get_stats(request: Request, cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    user_count = await db.execute(select(func.count(User.id)))
    theatre_count = await db.execute(select(func.count(Theatre.id)))
    place_count = await db.execute(select(func.count(Place.id)))
    booking_count = await db.execute(select(func.count(TheatreBooking.id)))
    space_count = await db.execute(select(func.count(CoupleSpace.id)))
    
    t_rev = await db.execute(select(func.sum(TheatreBooking.platform_fee), func.sum(TheatreBooking.commission_amount)).filter(TheatreBooking.status == "paid"))
    p_rev = await db.execute(select(func.sum(PlaceBooking.platform_fee), func.sum(PlaceBooking.commission_amount)).filter(PlaceBooking.status == "paid"))
    
    tr_fees, tr_comm = (t_rev.first() or (0, 0))
    pr_fees, pr_comm = (p_rev.first() or (0, 0))
    
    fees = (tr_fees or 0) + (pr_fees or 0)
    comm = (tr_comm or 0) + (pr_comm or 0)
    
    return {
        "stats": {
            "users": user_count.scalar(),
            "theatres": theatre_count.scalar(),
            "places": place_count.scalar(),
            "bookings": booking_count.scalar(),
            "spaces": space_count.scalar(),
            "revenue": { "platform_fees": fees, "commissions": comm, "total": fees + comm }
        }
    }

@router.post("/broadcast")
async def send_broadcast(title: str, body: str, request: Request, target: str = "all", cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    query = select(User)
    if target == "premium": query = query.filter(User.is_premium == True)
    elif target == "partners": query = query.filter(User.role == "partner")
    
    res = await db.execute(query)
    users = res.scalars().all()
    for u in users:
        db.add(Notification(user_id=u.id, type="broadcast", title=title, body=body))
    
    await log_admin_action(cu.id, "SEND_BROADCAST", {"title": title, "target": target, "count": len(users)}, request, db)
    await db.commit()
    return {"sent_to": len(users)}

@router.patch("/config")
async def update_config(key: str, value: str, request: Request, cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    # Standard insert/update config
    await db.execute(update(AppConfig).where(AppConfig.key == key).values(value=value))
    await log_admin_action(cu.id, "UPDATE_CONFIG", {"key": key, "value": value}, request, db)
    await db.commit()
    return {"ok": True}

@router.get("/users")
async def get_users_admin(cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()

@router.patch("/theatres/{theatre_id}/approve")
async def approve_theatre(theatre_id: str, request: Request, db: AsyncSession = Depends(get_db), admin: User = Depends(admin_only)):
    res = await db.execute(select(Theatre).filter(Theatre.id == theatre_id))
    theatre = res.scalars().first()
    if not theatre: raise HTTPException(404, "Theatre not found")
    theatre.is_approved = True
    await log_admin_action(admin.id, "APPROVE_THEATRE", {"theatre_id": theatre_id, "name": theatre.name}, request, db)
    await db.commit()
    return {"ok": True}

@router.get("/bookings")
async def list_all_bookings(db: AsyncSession = Depends(get_db), admin: User = Depends(admin_only)):
    result = await db.execute(select(TheatreBooking).order_by(TheatreBooking.created_at.desc()))
    return result.scalars().all()

@router.post("/users/{user_id}/finalize-closure")
async def finalize_closure(user_id: str, request: Request, cu: User = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).filter(User.id == user_id))
    u = res.scalars().first()
    if not u: raise HTTPException(404, "User not found")
    
    # 1. Scramble email/phone to free them up
    old_email = u.email
    new_email = f"archived_{uuid.uuid4().hex[:8]}_{old_email}"
    
    # 2. Update status
    await db.execute(update(User).where(User.id == user_id).values(
        email=new_email,
        is_archived=True,
        closure_requested=False,
        archived_at=datetime.utcnow()
    ))
    
    await log_admin_action(cu.id, "FINALIZE_CLOSURE", {"user_id": user_id, "old_email": old_email}, request, db)
    await db.commit()
    return {"status": "ok", "message": f"Account for {old_email} archived. Identity freed."}
