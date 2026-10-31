from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime
from typing import Optional, List, Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update, func, or_
from app.models.schemas import ReactionAdd, MessageOut, MessageEdit
from app.models.orm import User, Message, CoupleSpace
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.core.encryption import encrypt_data, decrypt_data
import os, uuid, shutil, json
from app.core.storage import storage
from app.core.media_lifecycle import cleanup_message_media_if_unshared

router = APIRouter(prefix="/chat", tags=["Chat"])

def _to_iso_utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    s = dt.isoformat()
    if s.endswith("+00:00"):
        return s[:-6] + "Z"
    return s if s.endswith("Z") else s + "Z"

def safe_decrypt_msg(text: Optional[str]) -> str:
    if not text:
        return ""
    try:
        return decrypt_data(text, strict=False)
    except Exception:
        return text

def ensure_space(cu: User) -> str:
    return cu.couple_space_id or f"space_{cu.id}"

async def resolve_and_sync_space(cu: User, db: AsyncSession) -> Tuple[CoupleSpace, Optional[User]]:
    """
    Self-healing space and partner resolver:
    1. Identifies partner through direct link (cu.partner_id), inverse link (User.partner_id == cu.id),
       CoupleSpace co-membership, or pending invitation.
    2. Identifies all candidate CoupleSpaces and selects the canonical space (preferring spaces with messages).
    3. Auto-aligns both users to the canonical space and establishes bidirectional partner_id links.
    4. Guarantees that users never get orphaned into an empty space while messages exist in another.
    """
    partner: Optional[User] = None

    # 1. Direct partner lookup
    if cu.partner_id:
        p_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        partner = p_res.scalars().first()

    # 2. Inverse partner lookup (partner points to cu)
    if not partner:
        inv_res = await db.execute(select(User).filter(User.partner_id == cu.id))
        partner = inv_res.scalars().first()
        if partner:
            cu.partner_id = partner.id

    # 3. Check any CoupleSpace containing cu.id with another user
    if not partner:
        spaces_with_cu = (await db.execute(
            select(CoupleSpace).filter(
                or_(CoupleSpace.user1_id == cu.id, CoupleSpace.user2_id == cu.id)
            )
        )).scalars().all()
        for sp_cand in spaces_with_cu:
            other_id = sp_cand.user2_id if sp_cand.user1_id == cu.id else sp_cand.user1_id
            if other_id and other_id != cu.id:
                p_cand_res = await db.execute(select(User).filter(User.id == other_id))
                p_cand = p_cand_res.scalars().first()
                if p_cand:
                    partner = p_cand
                    cu.partner_id = partner.id
                    break

    # 4. Check pending link
    if not partner and cu.pending_link and isinstance(cu.pending_link, dict) and cu.pending_link.get("target_id"):
        target_id = cu.pending_link.get("target_id")
        p_cand_res = await db.execute(select(User).filter(User.id == target_id))
        p_cand = p_cand_res.scalars().first()
        if p_cand:
            partner = p_cand
            cu.partner_id = partner.id

    # 5. Gather candidate spaces
    candidate_space_ids = set()
    if cu.couple_space_id:
        candidate_space_ids.add(cu.couple_space_id)
    if partner and partner.couple_space_id:
        candidate_space_ids.add(partner.couple_space_id)

    user_ids = [cu.id]
    if partner:
        user_ids.append(partner.id)

    known_spaces_res = await db.execute(
        select(CoupleSpace).filter(
            or_(CoupleSpace.user1_id.in_(user_ids), CoupleSpace.user2_id.in_(user_ids))
        )
    )
    for sp in known_spaces_res.scalars().all():
        candidate_space_ids.add(sp.id)

    best_space: Optional[CoupleSpace] = None
    best_score = -1

    for s_id in candidate_space_ids:
        sp_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == s_id))
        sp_obj = sp_res.scalars().first()
        if not sp_obj:
            continue

        cnt_res = await db.execute(select(func.count(Message.id)).filter(Message.couple_space_id == s_id))
        msg_count = cnt_res.scalar() or 0

        # Score space: each message is 100 points, both users linked is 10 points
        is_both = bool(partner and {sp_obj.user1_id, sp_obj.user2_id} == {cu.id, partner.id})
        score = msg_count * 100 + (10 if is_both else 0)

        if score > best_score:
            best_score = score
            best_space = sp_obj

    # 6. Fallback if no candidate space exists
    if not best_space:
        new_space_id = cu.couple_space_id or (partner.couple_space_id if partner else None) or str(uuid.uuid4())
        best_space = CoupleSpace(
            id=new_space_id,
            user1_id=cu.id,
            user2_id=partner.id if partner else None,
            created_at=datetime.utcnow(),
            theme_id="classic",
            allow_media_save=True
        )
        db.add(best_space)
        await db.flush()

    # 7. Auto-heal DB state
    db_changed = False

    if cu.couple_space_id != best_space.id:
        cu.couple_space_id = best_space.id
        db_changed = True

    if partner:
        if partner.couple_space_id != best_space.id:
            partner.couple_space_id = best_space.id
            db_changed = True
        if partner.partner_id != cu.id:
            partner.partner_id = cu.id
            db_changed = True
        if cu.partner_id != partner.id:
            cu.partner_id = partner.id
            db_changed = True

        if best_space.user1_id != cu.id and best_space.user2_id != cu.id:
            if not best_space.user1_id:
                best_space.user1_id = cu.id
                db_changed = True
            elif not best_space.user2_id:
                best_space.user2_id = cu.id
                db_changed = True

        if best_space.user1_id != partner.id and best_space.user2_id != partner.id:
            if not best_space.user2_id:
                best_space.user2_id = partner.id
                db_changed = True
            elif not best_space.user1_id:
                best_space.user1_id = partner.id
                db_changed = True

    if db_changed:
        await db.commit()
        await db.refresh(cu)
        if partner:
            await db.refresh(partner)

    return best_space, partner

def safe_parse_reactions(val) -> dict:
    if not val:
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}

def fmt_msg(m: Message, sender_name: str, allow_download: bool = True) -> dict:
    # Security check: if once_view and views exhausted, hide media_url
    show_media = True
    if m.is_once_view and m.views_used >= m.view_limit:
        show_media = False
    
    return {
        "id": str(m.id),
        "temp_id": getattr(m, "temp_id", None),
        "sender_id": m.sender_id,
        "sender_name": sender_name,
        "message_type": m.message_type or "text",
        "text": safe_decrypt_msg(m.text or ""),
        "media_url": m.media_url if show_media else None,
        "reactions": safe_parse_reactions(m.reactions),
        "is_once_view": m.is_once_view,
        "view_limit": m.view_limit,
        "views_used": m.views_used,
        "is_compromised": m.is_compromised,
        "reply_to_id": m.reply_to_id,
        "allow_download": allow_download if not m.is_once_view else False,
        "timestamp": _to_iso_utc(m.timestamp),
        "is_edited": bool(getattr(m, "is_edited", False)),
        "edited_at": _to_iso_utc(getattr(m, "edited_at", None)),
    }

from pydantic import BaseModel
from typing import Optional, List

class MessageCreate(BaseModel):
    text: Optional[str] = None
    message_type: str = "text"
    media_url: Optional[str] = None
    is_once_view: bool = False
    view_limit: int = 1
    reply_to_id: Optional[str] = None
    temp_id: Optional[str] = None

@router.post("/messages")
async def send_message_rest(data: MessageCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    partner_id = partner.id if partner else cu.partner_id

    # Deduplication: If already processed via WebSocket, return existing cached record
    if data.temp_id:
        from app.websocket.manager import manager
        cached = manager.get_processed_message(space_id, data.temp_id)
        if cached:
            if isinstance(cached, dict) and "temp_id" not in cached:
                cached = {**cached, "temp_id": data.temp_id}
            return cached

        # Durable DB Deduplication: check database for existing message with this temp_id
        existing_res = await db.execute(
            select(Message).filter(
                Message.couple_space_id == space_id,
                Message.temp_id == data.temp_id
            )
        )
        existing = existing_res.scalars().first()
        if existing:
            sender_name = cu.name if existing.sender_id == cu.id else (partner.name if partner else "Partner")
            existing_dict = fmt_msg(existing, sender_name, True)
            if "temp_id" not in existing_dict or not existing_dict["temp_id"]:
                existing_dict["temp_id"] = data.temp_id
            manager.record_processed_message(space_id, data.temp_id, existing_dict)
            return existing_dict

    # Validate reply reference belongs strictly to this couple space
    valid_reply_id = None
    if data.reply_to_id:
        reply_res = await db.execute(
            select(Message.id).filter(
                Message.id == data.reply_to_id,
                Message.couple_space_id == space_id
            )
        )
        if not reply_res.scalar():
            raise HTTPException(404, "Message not found in your couple space.")
        valid_reply_id = data.reply_to_id

    raw_text = data.text or ""
    encrypted_text = encrypt_data(raw_text)
    
    msg = Message(
        id=str(uuid.uuid4()),
        couple_space_id=space_id,
        sender_id=cu.id,
        sender_name=cu.name,
        message_type=data.message_type or "text",
        text=encrypted_text,
        media_url=data.media_url,
        is_once_view=data.is_once_view,
        view_limit=data.view_limit,
        timestamp=datetime.utcnow(),
        reply_to_id=valid_reply_id,
        temp_id=data.temp_id
    )
    
    # Auto-save audio to voice notes
    if msg.media_url and not msg.is_once_view and msg.message_type == "audio":
        from app.models.orm import VoiceNote
        vn = VoiceNote(
            id=str(uuid.uuid4()),
            couple_space_id=space_id,
            sender_id=cu.id,
            url=msg.media_url,
            filename="voice_note.webm",
            custom_name="Chat Whisper",
            size=0,
            created_at=msg.timestamp
        )
        db.add(vn)

    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    
    broadcast_data = {
        "type": "chat_message",
        "id": msg.id,
        "temp_id": data.temp_id,
        "sender_id": cu.id,
        "sender_name": cu.name,
        "message_type": msg.message_type,
        "text": raw_text,
        "media_url": msg.media_url,
        "reactions": msg.reactions or {},
        "is_once_view": msg.is_once_view,
        "view_limit": msg.view_limit,
        "views_used": msg.views_used,
        "reply_to_id": msg.reply_to_id,
        "timestamp": _to_iso_utc(msg.timestamp)
    }
    
    # Broadcast to couple space and to partner (if not already in space)
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, broadcast_data)
        partner_sockets_in_space = manager.spaces.get(space_id, {}).get(partner_id)
        if partner_id and not partner_sockets_in_space:
            await manager.send_to_user(partner_id, broadcast_data)
    except Exception as e:
        print(f"WS Broadcast error: {e}")
        
    res = fmt_msg(msg, cu.name, True)
    res["temp_id"] = data.temp_id

    if data.temp_id:
        try:
            from app.websocket.manager import manager
            manager.record_processed_message(space_id, data.temp_id, res)
        except Exception:
            pass

    return res

@router.get("/messages")
async def get_messages(
    skip: int = 0,
    limit: int = 50,
    before: Optional[str] = None,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    allow_download = space.allow_media_save if space else True

    # Limit capped between 1 and 100 to prevent unbounded memory allocation (CHAT-012)
    limit = max(1, min(limit, 100))

    query = select(Message).filter(Message.couple_space_id == space_id)

    if before:
        before_dt = None
        # Check if 'before' is an existing message ID within the user's couple space
        cursor_res = await db.execute(
            select(Message).filter(Message.id == before, Message.couple_space_id == space_id)
        )
        cursor_msg = cursor_res.scalars().first()
        if cursor_msg and cursor_msg.timestamp:
            before_dt = cursor_msg.timestamp
        else:
            try:
                # Try parsing as ISO 8601 string
                clean_before = before.replace("Z", "+00:00")
                before_dt = datetime.fromisoformat(clean_before)
            except Exception:
                before_dt = None

        if before_dt:
            query = query.filter(Message.timestamp < before_dt)
        else:
            query = query.offset(skip)
    else:
        query = query.offset(skip)

    query = query.order_by(Message.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    msgs = list(result.scalars().all())
    msgs.reverse()

    users_cache = {}
    result_list = []
    for m in msgs:
        if cu.id in (m.deleted_for or []):
            continue
        sid = m.sender_id
        if sid not in users_cache:
            u_res = await db.execute(select(User).filter(User.id == sid))
            u = u_res.scalars().first()
            users_cache[sid] = u.name if u else "Unknown"
        result_list.append(fmt_msg(m, users_cache[sid], allow_download))
    return result_list

@router.post("/upload-media")
async def upload_media(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, _ = await resolve_and_sync_space(cu, db)
    space_id = space.id if space else (cu.couple_space_id or f"solo_{cu.id}")
    
    limit_mb = settings.MAX_FILE_SIZE_MB if cu.is_premium else 5
    max_bytes = limit_mb * 1024 * 1024
    target_dir = os.path.join(settings.MEDIA_DIR, "chat")

    from app.core.file_security import stream_and_validate_upload
    filename, _ = await stream_and_validate_upload(
        file=file,
        space_id=space_id,
        max_bytes=max_bytes,
        target_dir=target_dir
    )

    url = f"{settings.BACKEND_URL}/media/chat/{filename}"
    return {"media_url": url, "filename": filename}

@router.post("/messages/{message_id}/secure-event")
async def secure_event(message_id: str, action: str = "view", cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Handles secure media events:
    - 'view': Increments views_used. Deletes media if limit reached.
    - 'compromise': Marks as compromised (AI detected phone or capture attempt).
    """
    space, _ = await resolve_and_sync_space(cu, db)
    space_id = space.id
    res = await db.execute(select(Message).filter(Message.id == message_id, Message.couple_space_id == space_id))
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found in your couple space.")

    media_url_to_clean = None
    if action == "view":
        # Only increment if the viewer is NOT the sender
        if msg.sender_id != cu.id:
            msg.views_used += 1
            if msg.views_used >= msg.view_limit:
                media_url_to_clean = msg.media_url
                # True Server-Side Ephemeral: Wipe content from database
                msg.text = None
                msg.media_url = None

    elif action == "compromise":
        msg.is_compromised = True
        media_url_to_clean = msg.media_url
        # Wipe content from database
        msg.text = None
        msg.media_url = None

    await db.commit()

    if media_url_to_clean:
        await cleanup_message_media_if_unshared(
            db, media_url_to_clean, exclude_message_id=message_id, space_id=space_id
        )

    return {"ok": True, "views_used": msg.views_used, "is_compromised": msg.is_compromised}

@router.post("/messages/{message_id}/status")
async def secure_message_status(
    message_id: str,
    action: Optional[str] = None,
    payload: Optional[dict] = None,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    act = action or (payload.get("action") if payload else None) or "view"
    return await secure_event(message_id=message_id, action=act, cu=cu, db=db)

@router.post("/messages/{message_id}/react")
async def react(message_id: str, data: ReactionAdd, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    partner_id = partner.id if partner else cu.partner_id

    user_ids = [cu.id]
    if partner:
        user_ids.append(partner.id)
    elif cu.partner_id:
        user_ids.append(cu.partner_id)

    # Enforce couple space isolation
    stmt = (
        select(Message)
        .filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    res = await db.execute(stmt)
    msg = res.scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found in your couple space.")
    
    # Atomic database-level JSON update
    from sqlalchemy import text
    bind = db.get_bind()
    is_pg = bind and getattr(bind.dialect, "name", "").lower() in ("postgresql", "postgres")

    if is_pg:
        patch_json = json.dumps({cu.id: data.emoji})
        await db.execute(
            text("UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) || :patch::jsonb WHERE id = :msg_id AND couple_space_id = :space_id"),
            {"patch": patch_json, "space_id": space_id, "msg_id": message_id}
        )
    else:
        await db.execute(
            text(f"UPDATE messages SET reactions = json_set(COALESCE(reactions, '{{}}'), '$.\"{cu.id}\"', :emoji) WHERE id = :msg_id AND couple_space_id = :space_id"),
            {"emoji": data.emoji, "space_id": space_id, "msg_id": message_id}
        )
    await db.commit()

    # Re-fetch confirmed persisted reactions directly from DB
    r_res = await db.execute(
        select(Message.reactions).filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    new_reactions = safe_parse_reactions(r_res.scalar())

    reaction_evt = {
        "type": "reaction",
        "message_id": message_id,
        "user_id": cu.id,
        "emoji": data.emoji,
        "reactions": new_reactions
    }
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, reaction_evt)
        partner_sockets_in_space = manager.spaces.get(space_id, {}).get(partner_id)
        if partner_id and not partner_sockets_in_space:
            await manager.send_to_user(partner_id, reaction_evt)
    except Exception as e:
        print(f"WS Broadcast error: {e}")

    return {"ok": True, "reactions": new_reactions}

@router.delete("/messages/{message_id}/react")
async def remove_reaction(message_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    partner_id = partner.id if partner else cu.partner_id

    user_ids = [cu.id]
    if partner:
        user_ids.append(partner.id)
    elif cu.partner_id:
        user_ids.append(cu.partner_id)

    # Enforce couple space isolation
    stmt = (
        select(Message)
        .filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    res = await db.execute(stmt)
    msg = res.scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found in your couple space.")
    
    # Atomic database-level JSON key removal
    from sqlalchemy import text
    bind = db.get_bind()
    is_pg = bind and getattr(bind.dialect, "name", "").lower() in ("postgresql", "postgres")

    if is_pg:
        await db.execute(
            text("UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) - :uid WHERE id = :msg_id AND couple_space_id = :space_id"),
            {"uid": cu.id, "msg_id": message_id, "space_id": space_id}
        )
    else:
        await db.execute(
            text(f"UPDATE messages SET reactions = json_remove(COALESCE(reactions, '{{}}'), '$.\"{cu.id}\"') WHERE id = :msg_id AND couple_space_id = :space_id"),
            {"msg_id": message_id, "space_id": space_id}
        )
    await db.commit()

    # Re-fetch confirmed persisted reactions directly from DB
    r_res = await db.execute(
        select(Message.reactions).filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    new_reactions = safe_parse_reactions(r_res.scalar())

    reaction_evt = {
        "type": "reaction",
        "message_id": message_id,
        "user_id": cu.id,
        "emoji": None,
        "reactions": new_reactions
    }
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, reaction_evt)
        partner_sockets_in_space = manager.spaces.get(space_id, {}).get(partner_id)
        if partner_id and not partner_sockets_in_space:
            await manager.send_to_user(partner_id, reaction_evt)
    except Exception as e:
        print(f"WS Broadcast error: {e}")

    return {"ok": True, "reactions": new_reactions}

@router.patch("/messages/{message_id}")
async def edit_message(
    message_id: str,
    data: MessageEdit,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    user_ids = [cu.id]
    if partner:
        user_ids.append(partner.id)
    elif cu.partner_id:
        user_ids.append(cu.partner_id)

    res = await db.execute(
        select(Message).filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    msg = res.scalars().first()
    if not msg:
        raise HTTPException(404, "Message not found in your couple space.")
    
    if msg.sender_id != cu.id:
        raise HTTPException(403, "You can only edit your own messages.")
    
    if msg.is_once_view:
        raise HTTPException(400, "View-once messages cannot be edited.")
    
    if msg.message_type and msg.message_type != "text":
        raise HTTPException(400, "Only text messages can be edited.")
    
    clean_text = (data.text or "").strip()
    if not clean_text:
        raise HTTPException(400, "Message text cannot be empty.")
    
    msg.text = encrypt_data(clean_text)
    msg.is_edited = True
    msg.edited_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(msg)
    
    try:
        from app.websocket.manager import manager
        await manager.send_to_space(space_id, {
            "type": "message_edited",
            "message_id": message_id,
            "sender_id": cu.id,
            "text": clean_text,
            "is_edited": True,
            "edited_at": _to_iso_utc(msg.edited_at)
        })
    except Exception as e:
        print(f"WS Broadcast error on message_edited: {e}")
        
    space_res = await db.execute(select(CoupleSpace).filter(CoupleSpace.id == space_id))
    space = space_res.scalars().first()
    allow_download = space.allow_media_save if space else True
    
    return fmt_msg(msg, cu.name, allow_download)

@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, for_everyone: bool = True, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, partner = await resolve_and_sync_space(cu, db)
    space_id = space.id
    user_ids = [cu.id]
    if partner:
        user_ids.append(partner.id)
    elif cu.partner_id:
        user_ids.append(cu.partner_id)

    res = await db.execute(
        select(Message).filter(
            Message.id == message_id,
            Message.couple_space_id == space_id
        )
    )
    msg = res.scalars().first()
    if not msg: raise HTTPException(404, "Message not found in your couple space.")
    
    if for_everyone:
        if msg.sender_id != cu.id: raise HTTPException(403, "You can only delete your own messages for everyone.")
        media_url_to_clean = msg.media_url
        await db.delete(msg)
        await db.commit()

        # Clean up underlying media only if no other entity references it
        if media_url_to_clean:
            await cleanup_message_media_if_unshared(
                db, media_url_to_clean, exclude_message_id=message_id, space_id=space_id
            )

        # Send WebSocket event to space so all active tabs/devices remove message
        try:
            from app.websocket.manager import manager
            await manager.send_to_space(space_id, {
                "type": "message_deleted",
                "message_id": message_id
            })
        except Exception as e:
            print(f"WS Broadcast error on message_deleted: {e}")
    else:
        # Delete for me only (preserves partner copy and partner media)
        from sqlalchemy.orm.attributes import flag_modified
        deleted_list = list(msg.deleted_for or [])
        if cu.id not in deleted_list:
            deleted_list.append(cu.id)
            msg.deleted_for = deleted_list
            flag_modified(msg, "deleted_for")

        # Check if all participants in the couple space have deleted this message
        all_participants = {cu.id}
        if partner:
            all_participants.add(partner.id)
        elif cu.partner_id:
            all_participants.add(cu.partner_id)

        if all_participants.issubset(set(deleted_list)):
            # Both partners deleted the message -> purge message and clean up unreferenced media
            media_url_to_clean = msg.media_url
            await db.delete(msg)
            await db.commit()
            if media_url_to_clean:
                await cleanup_message_media_if_unshared(
                    db, media_url_to_clean, exclude_message_id=message_id, space_id=space_id
                )
        else:
            await db.commit()
            
    return {"ok": True}

@router.get("/space")
async def get_chat_space(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, partner = await resolve_and_sync_space(cu, db)
    
    return {
        "space": {
            "id": space.id,
            "theme_id": getattr(space, "theme_id", "classic") or "classic",
            "chat_wallpaper": getattr(space, "chat_wallpaper", None),
            "allow_media_save": space.allow_media_save
        },
        "partner": {
            "id": partner.id if partner else None,
            "name": partner.name if partner else "Partner",
            "avatar_url": getattr(partner, "avatar_url", None),
            "public_key": getattr(partner, "public_key", None)
        }
    }

@router.patch("/space/theme")
async def update_theme(data: dict, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    space, _ = await resolve_and_sync_space(cu, db)
    space_id = space.id
    theme_id = data.get("theme_id", "classic")
    await db.execute(update(CoupleSpace).where(CoupleSpace.id == space_id).values(theme_id=theme_id, chat_wallpaper=None))
    await db.commit()
    return {"theme_id": theme_id}

@router.post("/space/wallpaper")
async def update_wallpaper(file: UploadFile = File(...), cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.is_premium:
        raise HTTPException(402, "Custom backgrounds require a Vlynxly Premium subscription.")
    
    space, _ = await resolve_and_sync_space(cu, db)
    space_id = space.id
    ext = file.filename.split(".")[-1].lower()
    import uuid
    filename = f"wp_{space_id}_{uuid.uuid4().hex[:8]}.{ext}"
    path = os.path.join(settings.MEDIA_DIR, "chat", filename)
    
    content = await file.read()
    url = await storage.upload_file(content, filename, "chat")
    await db.execute(update(CoupleSpace).where(CoupleSpace.id == space_id).values(chat_wallpaper=url, theme_id="custom"))
    await db.commit()
    return {"chat_wallpaper": url}
