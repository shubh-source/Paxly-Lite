from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from app.models.schemas import InviteAccept
from app.models.orm import User, CoupleSpace, Invite
from app.core.security import get_current_user
from app.core.database import get_db
import random, string, uuid

router = APIRouter(prefix="/couple", tags=["Couple"])

def gen_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@router.post("/invite/generate")
async def generate_invite(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Invite).filter(Invite.created_by == cu.id, Invite.used == False))
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
    if cu.couple_space_id:
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
    if target_user.couple_space_id:
        raise HTTPException(400, "This user is already connected with someone.")

    # MUTUAL HANDSHAKE CHECK
    target_pending = target_user.pending_link
    if target_pending and target_pending.get("target_id") == cu.id:
        # User A (target_user) already entered User B's (cu) code.
        # Now User B has entered User A's code. SUCCESS!
        space_id = str(uuid.uuid4())
        new_space = CoupleSpace(id=space_id, user1_id=invite.created_by, user2_id=cu.id, created_at=datetime.utcnow())
        db.add(new_space)
        
        for uid, pid in [(invite.created_by, cu.id), (cu.id, invite.created_by)]:
            await db.execute(update(User).filter(User.id == uid).values(couple_space_id=space_id, partner_id=pid, pending_link=None))
        
        await db.execute(update(Invite).filter(Invite.id == code).values(used=True))
        
        # NOTIFICATION for User A (who was waiting)
        new_notif = Notification(
            user_id=invite.created_by,
            type="link_success",
            title="Partners Linked! 🎉",
            body=f"You and {cu.name} are now successfully connected in your private space.",
            data={"couple_space_id": space_id}
        )
        db.add(new_notif)
        
        await db.commit()
        return {"status": "connected", "couple_space_id": space_id, "message": "Connected successfully!"}
    else:
        # First one to enter the code. Go to waiting.
        await db.execute(update(User).filter(User.id == cu.id).values(pending_link={
            "code": code,
            "target_id": invite.created_by,
            "target_name": target_user.name,
            "sent_at": datetime.utcnow().isoformat(),
        }))
        await db.commit()
        return {"status": "waiting", "target_name": target_user.name, "message": f"Waiting for {target_user.name} to enter your code."}

@router.get("/link-status")
async def link_status(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.couple_space_id:
        result = await db.execute(select(User).filter(User.id == cu.partner_id))
        partner = result.scalars().first()
        return {"status": "connected", "couple_space_id": cu.couple_space_id, "partner_name": partner.name if partner else "Partner"}
    if cu.pending_link:
        return {"status": "waiting", "target_name": cu.pending_link.get("target_name", "your partner")}
    return {"status": "idle"}

@router.delete("/pending-link")
async def cancel_link(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).filter(User.id == cu.id).values(pending_link=None))
    await db.commit()
    return {"ok": True}

@router.get("/space")
async def get_space(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(404, "No couple space found.")
    result = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == cu.couple_space_id))
    space = result.scalars().first()
    result = await db.execute(select(User).filter(User.id == cu.partner_id))
    partner = result.scalars().first()
    return {
        "space_id": cu.couple_space_id,
        "created_at": space.created_at,
        "allow_media_save": space.allow_media_save,
        "partner": {"id": partner.id, "name": partner.name, "email": partner.email, "avatar_url": partner.avatar_url} if partner else None
    }

@router.patch("/privacy")
async def update_privacy(allow_media_save: bool, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id:
        raise HTTPException(403, "Not connected.")
    await db.execute(update(CoupleSpace).filter(CoupleSpace.id == cu.couple_space_id).values(allow_media_save=allow_media_save))
    await db.commit()
    return {"allow_media_save": allow_media_save}