from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.orm import User, Anniversary, Notification
from app.websocket.manager import manager
from app.core.security import get_current_user
from app.core.database import get_db
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/dates", tags=["Dates"])

async def _sync_anniversary_reminders(user_id: str, anniversaries: list, db: AsyncSession):
    today = datetime.utcnow().date()
    today_str = today.isoformat()

    recent_res = await db.execute(
        select(Notification).filter(
            Notification.user_id == user_id,
            Notification.type == "anniversary_reminder"
        ).order_by(Notification.created_at.desc()).limit(60)
    )
    existing_notifs = recent_res.scalars().all()
    sent_keys = set()
    for n in existing_notifs:
        if isinstance(n.data, dict):
            ann_id = n.data.get("anniversary_id")
            m_days = n.data.get("milestone_days")
            m_date = n.data.get("date")
            if ann_id is not None and m_days is not None and m_date == today_str:
                sent_keys.add((ann_id, m_days))

    added_any = False
    for ann in anniversaries:
        if not ann.date:
            continue
        try:
            ann_date = datetime.strptime(ann.date, "%Y-%m-%d").date()
        except ValueError:
            continue

        target = ann_date.replace(year=today.year)
        if target < today:
            target = ann_date.replace(year=today.year + 1)
        days_left = (target - today).days

        # Milestone triggers: 30, 21, 14 (weekly in 1-month window) or 0..7 (daily in last week)
        is_weekly_month = days_left in (30, 21, 14)
        is_daily_week = 0 <= days_left <= 7

        if not (is_weekly_month or is_daily_week):
            continue

        if (ann.id, days_left) in sent_keys:
            continue

        import re
        raw_clean = (ann.title or "Special Occasion").split(" — ")[0].strip()
        clean_title = re.sub(r'^[\U00010000-\U0010ffff\u2600-\u27bf\u2b50\ufe0f\s]+', '', raw_clean).strip() or raw_clean

        if days_left == 0:
            notif_title = f"Happy {clean_title}!"
            notif_body = f"Today is the big day: {clean_title}! Wishing you both a wonderful celebration."
        elif days_left == 1:
            notif_title = f"Tomorrow is {clean_title}!"
            notif_body = f"Just 1 day left until {clean_title}! Almost time to celebrate."
        elif 2 <= days_left <= 7:
            notif_title = f"{days_left} Days until {clean_title}!"
            notif_body = f"Final week countdown: only {days_left} days left until {clean_title}."
        elif days_left == 14:
            notif_title = f"2 Weeks until {clean_title}"
            notif_body = f"Only 14 days remaining until {clean_title}! Time to prepare."
        elif days_left == 21:
            notif_title = f"3 Weeks until {clean_title}"
            notif_body = f"3 weeks left until {clean_title}. Need ideas for a surprise?"
        elif days_left == 30:
            notif_title = f"1 Month until {clean_title}"
            notif_body = f"Just 30 days left until {clean_title}! Start brainstorming something special."
        else:
            continue

        db.add(Notification(
            user_id=user_id,
            type="anniversary_reminder",
            title=notif_title,
            body=notif_body,
            data={
                "anniversary_id": ann.id,
                "milestone_days": days_left,
                "date": today_str
            }
        ))
        sent_keys.add((ann.id, days_left))
        added_any = True

        # Send instant WebSocket alert to active user
        try:
            await manager.send_to_user(user_id, {
                "type": "anniversary_reminder",
                "title": notif_title,
                "body": notif_body,
                "anniversary_id": ann.id,
                "days_left": days_left,
                "date": today_str
            })
        except Exception:
            pass

    if added_any:
        await db.commit()

class AnniversaryCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD
    type: Optional[str] = "anniversary" # anniversary | birthday | first_date

@router.post("/")
async def create_anniversary(data: AnniversaryCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    new_ann = Anniversary(
        couple_space_id=space_id,
        title=data.title.strip(),
        date=data.date.strip(),
        type=(data.type or "custom").strip().lower(),
    )
    db.add(new_ann)
    await db.commit()
    await db.refresh(new_ann)
    return new_ann

@router.get("/")
async def get_anniversaries(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    result = await db.execute(
        select(Anniversary)
        .filter(Anniversary.couple_space_id == space_id)
        .order_by(Anniversary.date.asc())
    )
    anniversaries = result.scalars().all()

    # Sync milestone in-app reminders
    try:
        await _sync_anniversary_reminders(cu.id, anniversaries, db)
        if cu.partner_id:
            await _sync_anniversary_reminders(cu.partner_id, anniversaries, db)
    except Exception as e:
        print(f"Warning: could not sync anniversary reminders: {e}")

    return anniversaries

@router.post("/check-milestones")
async def check_milestones(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    result = await db.execute(
        select(Anniversary)
        .filter(Anniversary.couple_space_id == space_id)
        .order_by(Anniversary.date.asc())
    )
    anniversaries = result.scalars().all()

    try:
        await _sync_anniversary_reminders(cu.id, anniversaries, db)
        if cu.partner_id:
            await _sync_anniversary_reminders(cu.partner_id, anniversaries, db)
    except Exception as e:
        print(f"Warning: could not sync anniversary reminders: {e}")

    return {"ok": True, "count": len(anniversaries)}

@router.delete("/{id}")
async def delete_anniversary(id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
    try:
        ann_id = int(id)
    except ValueError:
        raise HTTPException(400, "Invalid date id.")
    await db.execute(
        delete(Anniversary).filter(
            Anniversary.id == ann_id,
            Anniversary.couple_space_id == space_id
        )
    )
    await db.commit()
    return {"ok": True}
