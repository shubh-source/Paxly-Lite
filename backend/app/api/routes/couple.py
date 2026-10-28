from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, func
from pydantic import BaseModel
from app.models.schemas import InviteAccept
from app.models.orm import User, CoupleSpace, Invite, Message
from app.core.security import get_current_user
from app.core.database import get_db
import secrets, string, uuid

router = APIRouter(prefix="/couple", tags=["Couple"])

def gen_code():
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(6))

@router.post("/invite/generate")
async def generate_invite(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Check if user already has an active (unused) invite
    result = await db.execute(select(Invite).filter(Invite.created_by == cu.id, Invite.used == False))
    existing = result.scalars().first()
    if existing:
        return {"code": existing.id}
    
    # Otherwise generate new
    code = gen_code()
    while (await db.execute(select(Invite).filter(Invite.id == code))).scalars().first():
        code = gen_code()
    
    new_invite = Invite(id=code, created_by=cu.id, used=False, created_at=datetime.utcnow())
    db.add(new_invite)
    await db.commit()
    return {"code": code}

@router.post("/invite/send")
async def send_invite(data: InviteAccept, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.orm import Notification
    code = data.code.strip().upper()

    # If user already has an active partner who exists, block
    if cu.couple_space_id and cu.partner_id:
        p_check = await db.execute(select(User).filter(User.id == cu.partner_id))
        if p_check.scalars().first():
            raise HTTPException(400, "You are already connected with a partner.")
    
    result = await db.execute(select(Invite).filter(Invite.id == code))
    invite = result.scalars().first()
    if not invite:
        raise HTTPException(400, "Invalid invite code.")
    if invite.used:
        raise HTTPException(400, "This invite has already been used.")
    if invite.created_by == cu.id:
        raise HTTPException(400, "You cannot link with yourself.")
    
    result = await db.execute(select(User).filter(User.id == invite.created_by))
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(400, "User not found.")
    if target_user.couple_space_id and target_user.partner_id and target_user.partner_id != cu.id:
        p_check = await db.execute(select(User).filter(User.id == target_user.partner_id))
        if p_check.scalars().first():
            raise HTTPException(400, "This user is already connected with someone else.")

    # Check if either user already has a space with messages so we never lose conversation history
    target_space_id = None
    for u in [target_user, cu]:
        if u.couple_space_id:
            m_res = await db.execute(select(func.count(Message.id)).filter(Message.couple_space_id == u.couple_space_id))
            if (m_res.scalar() or 0) > 0:
                target_space_id = u.couple_space_id
                break
    if not target_space_id:
        target_space_id = target_user.couple_space_id or cu.couple_space_id or str(uuid.uuid4())

    # Ensure CoupleSpace exists
    sp_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == target_space_id))
    space = sp_res.scalars().first()
    if not space:
        space = CoupleSpace(id=target_space_id, user1_id=target_user.id, user2_id=cu.id, created_at=datetime.utcnow(), theme_id="classic")
        db.add(space)
    else:
        space.user1_id = target_user.id
        space.user2_id = cu.id

    for uid, pid in [(target_user.id, cu.id), (cu.id, target_user.id)]:
        await db.execute(update(User).filter(User.id == uid).values(couple_space_id=target_space_id, partner_id=pid, pending_link=None))

    await db.execute(update(Invite).filter(Invite.id == code).values(used=True))

    # Send Notification to target_user
    new_notif = Notification(
        user_id=target_user.id,
        type="link_success",
        title="Partners Linked! 🎉",
        body=f"You and {cu.name} are now successfully connected in your private space.",
        data={"couple_space_id": target_space_id}
    )
    db.add(new_notif)
    await db.commit()

    return {"status": "connected", "couple_space_id": target_space_id, "message": "Connected successfully!"}

class DirectLinkRequest(BaseModel):
    partner_email: Optional[str] = None
    partner_id: Optional[str] = None

@router.post("/link-direct")
async def link_direct(data: DirectLinkRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    target_user = None
    if data.partner_id:
        res = await db.execute(select(User).filter(User.id == data.partner_id))
        target_user = res.scalars().first()
    elif data.partner_email:
        res = await db.execute(select(User).filter(User.email == data.partner_email.lower().strip()))
        target_user = res.scalars().first()

    if not target_user:
        raise HTTPException(404, "Partner not found with provided details.")
    if target_user.id == cu.id:
        raise HTTPException(400, "Cannot link with yourself.")

    cu.partner_id = target_user.id
    target_user.partner_id = cu.id
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    return {"status": "connected", "couple_space_id": space.id, "partner_name": partner.name if partner else "Partner"}

@router.get("/link-status")
async def link_status(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    if partner:
        return {"status": "connected", "couple_space_id": space.id, "partner_name": partner.name}
    if cu.pending_link and isinstance(cu.pending_link, dict):
        return {"status": "waiting", "target_name": cu.pending_link.get("target_name", "your partner")}
    return {"status": "idle"}

@router.delete("/pending-link")
async def cancel_link(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).filter(User.id == cu.id).values(pending_link=None))
    await db.commit()
    return {"ok": True}

@router.get("/space")
async def get_space(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, partner = await resolve_and_sync_space(cu, db)
    return {
        "space_id": space.id,
        "created_at": space.created_at,
        "allow_media_save": space.allow_media_save,
        "partner": {"id": partner.id, "name": partner.name, "email": partner.email, "avatar_url": partner.avatar_url, "public_key": partner.public_key} if partner else None
    }

@router.patch("/privacy")
async def update_privacy(allow_media_save: bool, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.routes.chat import resolve_and_sync_space
    space, _ = await resolve_and_sync_space(cu, db)
    await db.execute(update(CoupleSpace).filter(CoupleSpace.id == space.id).values(allow_media_save=allow_media_save))
    await db.commit()
    return {"allow_media_save": allow_media_save}