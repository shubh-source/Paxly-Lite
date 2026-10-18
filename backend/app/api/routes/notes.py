from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, and_, or_
from app.models.orm import User, Note, Notification, CoupleSpace
from app.websocket.manager import manager
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.encryption import encrypt_data, decrypt_data
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/notes", tags=["Notes"])

def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def _to_iso_utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    s = dt.isoformat()
    return s if s.endswith("Z") else s + "Z"

async def _sync_unlocked_notes(db: AsyncSession, space_id: Optional[str] = None) -> int:
    now = datetime.utcnow()
    query = select(Note).filter(
        Note.unlock_at != None,
        Note.unlock_at <= now,
        or_(Note.unlock_notified == False, Note.unlock_notified == None)
    )
    if space_id:
        query = query.filter(Note.couple_space_id == space_id)

    res = await db.execute(query)
    notes = res.scalars().all()
    if not notes:
        return 0

    count = 0
    for note in notes:
        note.unlock_notified = True
        count += 1

        author_id = note.created_by
        partner_id = None
        author_name = "Your partner"
        partner_name = "Your partner"

        # Resolve author and partner
        if author_id:
            u_res = await db.execute(select(User).filter(User.id == author_id))
            author = u_res.scalars().first()
            if author:
                if author.name:
                    author_name = author.name
                if author.partner_id:
                    partner_id = author.partner_id

        if not partner_id and note.couple_space_id and not note.couple_space_id.startswith("solo_"):
            cs_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == note.couple_space_id))
            cs = cs_res.scalars().first()
            if cs:
                partner_id = cs.user2_id if cs.user1_id == author_id else cs.user1_id

        if partner_id:
            p_res = await db.execute(select(User).filter(User.id == partner_id))
            partner = p_res.scalars().first()
            if partner and partner.name:
                partner_name = partner.name

            # 1. Author Notification: "Aaj aapka love note open hoga"
            author_notif = Notification(
                user_id=author_id,
                type="love_note_author_unlocked",
                title="Love Note Opens Today! 💌",
                body=f"Aaj aapka love note open hoga — your special message for {partner_name} has unlocked!",
                data={"note_id": note.id, "partner_name": partner_name}
            )
            db.add(author_notif)

            # 2. Partner Notification: "Something Special For You 🎁"
            partner_notif = Notification(
                user_id=partner_id,
                type="love_note_gift",
                title="Something Special For You 🎁",
                body=f"{author_name} has unlocked a special surprise love note for you! Tap to open your gift.",
                data={"note_id": note.id, "has_gift_box": True, "author_name": author_name}
            )
            db.add(partner_notif)

            # Realtime WebSocket dispatches
            try:
                await manager.send_to_user(author_id, {
                    "type": "love_note_author_unlocked",
                    "note_id": note.id,
                    "title": "Love Note Opens Today! 💌",
                    "body": f"Aaj aapka love note open hoga — your special message for {partner_name} has unlocked!",
                    "partner_name": partner_name
                })
            except Exception:
                pass

            try:
                await manager.send_to_user(partner_id, {
                    "type": "love_note_gift",
                    "note_id": note.id,
                    "title": "Something Special For You 🎁",
                    "body": f"{author_name} has unlocked a special surprise love note for you! Tap to open your gift.",
                    "has_gift_box": True,
                    "author_name": author_name
                })
            except Exception:
                pass

    await db.commit()
    return count

class NoteCreate(BaseModel):
    title: str
    content: str
    color: Optional[str] = "#ffffff"
    unlock_at: Optional[datetime] = None
    share_with_partner: bool = True
    display_hours: Optional[int] = 24 # How long to show on partner's dashboard

@router.post("/")
async def create_note(data: NoteCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space_id = cu.couple_space_id or f"solo_{cu.id}"
        
    until = None
    if data.share_with_partner and data.display_hours:
        until = datetime.utcnow() + timedelta(hours=data.display_hours)

    clean_unlock_at = _to_naive_utc(data.unlock_at)
    is_future_capsule = bool(clean_unlock_at and clean_unlock_at > datetime.utcnow())

    encrypted_content = encrypt_data(data.content) if data.content else None
    note_id = str(uuid.uuid4())
    new_note = Note(
        id=note_id,
        couple_space_id=space_id,
        created_by=cu.id,
        title=data.title,
        content=encrypted_content,
        color=data.color or "#ffffff",
        unlock_at=clean_unlock_at,
        unlock_notified=not is_future_capsule, # False if locked so timer triggers it later
        is_newly_shared=bool(cu.partner_id and data.share_with_partner),
        shared_display_until=until
    )
    db.add(new_note)

    # Dispatch notification to partner if connected
    if cu.partner_id and data.share_with_partner:
        if is_future_capsule:
            notif_title = "Secret Time Capsule ⏳"
            notif_body = f"{cu.name or 'Your partner'} sealed a locked love note for you! It will unlock soon."
            notif_type = "love_note_capsule"
            has_gift_box = False
        else:
            notif_title = "Something Special For You 🎁"
            notif_body = f"{cu.name or 'Your partner'} left you a special note."
            notif_type = "love_note"
            has_gift_box = True

        db.add(Notification(
            user_id=cu.partner_id,
            type=notif_type,
            title=notif_title,
            body=notif_body,
            data={"note_id": note_id, "has_gift_box": has_gift_box}
        ))

    await db.commit()
    await db.refresh(new_note)

    if cu.partner_id and data.share_with_partner:
        try:
            await manager.send_to_user(cu.partner_id, {
                "type": notif_type,
                "title": notif_title,
                "body": notif_body,
                "note_id": note_id,
                "has_gift_box": has_gift_box
            })
        except Exception:
            pass

    return new_note

@router.get("/")
async def get_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await _sync_unlocked_notes(db, cu.couple_space_id)
    except Exception as e:
        print(f"Warning syncing unlocks: {e}")

    if cu.couple_space_id:
        result = await db.execute(
            select(Note)
            .filter(Note.couple_space_id == cu.couple_space_id)
            .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Note)
            .filter(Note.created_by == cu.id)
            .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        )

    notes = result.scalars().all()

    partner_name = "Partner"
    if cu.partner_id:
        p_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        partner = p_res.scalars().first()
        if partner and partner.name:
            partner_name = partner.name

    now = datetime.utcnow()
    out = []
    for note in notes:
        note_unlock = _to_naive_utc(note.unlock_at)
        is_locked = bool(note_unlock and note_unlock > now)
        out.append({
            "id": note.id,
            "couple_space_id": note.couple_space_id,
            "created_by": note.created_by,
            "sender_name": (cu.name or "You") if note.created_by == cu.id else partner_name,
            "title": note.title or "💌",
            "content": "" if is_locked else (decrypt_data(note.content) if note.content else ""),
            "color": note.color or "#ffffff",
            "is_pinned": bool(note.is_pinned),
            "is_opened": bool(note.is_opened),
            "unlock_at": _to_iso_utc(note_unlock),
            "created_at": _to_iso_utc(note.created_at) or _to_iso_utc(now),
            "updated_at": _to_iso_utc(note.updated_at) or _to_iso_utc(now),
        })

    return out

@router.get("/pending-gift")
async def get_pending_gift(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Check if the user has an unopened, unlocked love note from their partner to display the jiggling gift box."""
    if not cu.couple_space_id:
        return {"has_gift": False, "note": None}

    try:
        await _sync_unlocked_notes(db, cu.couple_space_id)
    except Exception as e:
        print(f"Warning syncing unlocks: {e}")

    now = datetime.utcnow()
    # Unopened note created by partner, where unlock_at has passed (or was never set)
    result = await db.execute(
        select(Note)
        .filter(
            Note.couple_space_id == cu.couple_space_id,
            Note.created_by != cu.id,
            Note.is_opened == False,
            (Note.unlock_at == None) | (Note.unlock_at <= now)
        )
        .order_by(Note.created_at.desc())
        .limit(1)
    )
    note = result.scalars().first()
    if not note:
        return {"has_gift": False, "note": None}

    partner_name = "Your partner"
    if cu.partner_id:
        p_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        p = p_res.scalars().first()
        if p and p.name:
            partner_name = p.name

    return {
        "has_gift": True,
        "note": {
            "id": note.id,
            "title": note.title or "💌",
            "content": decrypt_data(note.content) if note.content else "",
            "color": note.color or "#ffffff",
            "sender_name": partner_name,
            "is_opened": False,
            "created_at": _to_iso_utc(note.created_at) or _to_iso_utc(now),
            "unlock_at": _to_iso_utc(note.unlock_at),
        }
    }

@router.post("/check-unlocks")
async def check_unlocks(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Explicitly evaluate unlock timers."""
    count = await _sync_unlocked_notes(db, cu.couple_space_id)
    return {"ok": True, "unlocked_count": count}

@router.get("/dashboard-alerts")
async def get_dashboard_notes(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch notes shared by partner that are still in their visibility window."""
    if not cu.couple_space_id:
        return []
    
    try:
        await _sync_unlocked_notes(db, cu.couple_space_id)
    except Exception:
        pass

    now = datetime.utcnow()
    result = await db.execute(
        select(Note)
        .filter(
            Note.couple_space_id == cu.couple_space_id,
            Note.created_by != cu.id,
            Note.is_newly_shared == True,
            and_(Note.shared_display_until > now)
        )
    )
    notes = result.scalars().all()
    out = []
    for note in notes:
        out.append({
            "id": note.id,
            "couple_space_id": note.couple_space_id,
            "created_by": note.created_by,
            "title": note.title or "💌",
            "content": decrypt_data(note.content) if note.content else "",
            "color": note.color or "#ffffff",
            "is_opened": bool(note.is_opened),
            "shared_display_until": _to_iso_utc(note.shared_display_until),
            "created_at": _to_iso_utc(note.created_at),
        })
    return out

@router.post("/{note_id}/open")
async def open_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).filter(Note.id == note_id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    is_owner = note.created_by == cu.id
    is_in_space = bool(cu.couple_space_id and note.couple_space_id == cu.couple_space_id)
    if not (is_owner or is_in_space):
        raise HTTPException(status_code=403, detail="Not authorized to open this note")

    note.is_opened = True
    await db.commit()

    if cu.couple_space_id and note.couple_space_id == cu.couple_space_id:
        try:
            await manager.send_to_space(cu.couple_space_id, {
                "type": "love_note_opened",
                "note_id": note_id,
                "opened_by": cu.name or "Your partner"
            }, exclude_user=cu.id)
        except Exception:
            pass

    return {"ok": True}

@router.post("/{note_id}/dismiss-alert")
async def dismiss_dashboard_alert(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).filter(Note.id == note_id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    is_owner = note.created_by == cu.id
    is_in_space = bool(cu.couple_space_id and note.couple_space_id == cu.couple_space_id)
    if not (is_owner or is_in_space):
        raise HTTPException(status_code=403, detail="Not authorized to dismiss this note")

    note.is_newly_shared = False
    await db.commit()
    return {"ok": True}

@router.put("/{note_id}")
async def update_note(note_id: str, data: dict, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).filter(Note.id == note_id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    is_owner = note.created_by == cu.id
    is_in_space = bool(cu.couple_space_id and note.couple_space_id == cu.couple_space_id)
    if not (is_owner or is_in_space):
        raise HTTPException(status_code=403, detail="Not authorized to modify this note")

    if not is_owner and any(k in data for k in ("title", "content", "color")):
        raise HTTPException(status_code=403, detail="Only the note author can modify note content")

    allowed = {"title", "content", "color", "is_pinned"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if "content" in updates and updates["content"]:
        updates["content"] = encrypt_data(updates["content"])
    updates["updated_at"] = datetime.utcnow()
    
    for key, val in updates.items():
        setattr(note, key, val)

    await db.commit()
    return {"ok": True}

@router.delete("/{note_id}")
async def delete_note(note_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).filter(Note.id == note_id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    is_owner = note.created_by == cu.id
    is_in_space = bool(cu.couple_space_id and note.couple_space_id == cu.couple_space_id)
    if not (is_owner or is_in_space):
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")

    await db.delete(note)
    await db.commit()
    return {"ok": True}
