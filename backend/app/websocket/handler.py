from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.orm import User, Message, CallLog, Note
from app.websocket.manager import manager
from app.core.encryption import encrypt_data, decrypt_data
import json, uuid, logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

async def get_user_from_token(token: str, db: AsyncSession):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: return None
        result = await db.execute(select(User).filter(User.id == user_id))
        return result.scalars().first()
    except Exception: return None

last_presence_touch = {}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Wait for the first authentication payload
    try:
        auth_msg = await websocket.receive_text()
        auth_payload = json.loads(auth_msg)
        if auth_payload.get("type") != "auth":
            await websocket.close(code=4001, reason="Expected auth message first")
            return
            
        token = auth_payload.get("token")
        if not token:
            await websocket.close(code=4001, reason="Unauthorized")
            return
            
    except Exception as e:
        await websocket.close(code=4001, reason="Invalid auth format")
        return

    user_id = None
    space_id = None
    partner_name = "Your partner"
    try:
        async with AsyncSessionLocal() as db:
            user = await get_user_from_token(token, db)
            if not user:
                await websocket.close(code=4001, reason="Unauthorized")
                return

            from app.api.routes.chat import resolve_and_sync_space
            space, partner = await resolve_and_sync_space(user, db)
            space_id = space.id
            user_id = user.id
            user_name = user.name
            partner_id = partner.id if partner else user.partner_id
            if partner and partner.name:
                partner_name = partner.name
            elif partner_id:
                p_res = await db.execute(select(User).filter(User.id == partner_id))
                p_user = p_res.scalars().first()
                if p_user and p_user.name:
                    partner_name = p_user.name

        await manager.connect(websocket, space_id, user_id)
        last_presence_touch[user_id] = datetime.utcnow()

        # Notify partner immediately that this user entered the space!
        await manager.send_to_space(space_id, {
            "type": "presence", "user_id": user_id, "online": True, "user_name": user_name
        }, exclude_user=user_id)

        # Check if partner is already online and notify this connecting socket immediately!
        if partner_id and manager.is_partner_online(space_id, user_id):
            try:
                await websocket.send_json({
                    "type": "presence", "user_id": partner_id, "online": True, "user_name": partner_name
                })
            except Exception:
                pass

        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except Exception:
                continue
            
            if not isinstance(payload, dict):
                continue
                
            p_type = payload.get("type")
            
            try:
                if p_type == "chat_message":
                    raw_text = payload.get("text", "")
                    encrypted_text = encrypt_data(raw_text)
                    temp_id = payload.get("temp_id")
                    now_ts = datetime.utcnow()
                    msg_id = str(uuid.uuid4())
                    msg_type = payload.get("message_type", "text")
                    media_url = payload.get("media_url")
                    is_once = payload.get("is_once_view", False)
                    v_limit = payload.get("view_limit", 1)
                    reply_id = payload.get("reply_to_id")

                    # Fast in-memory deduplication: if already processed via WebSocket/REST, echo existing immediately
                    if temp_id:
                        cached_msg = manager.get_processed_message(space_id, temp_id)
                        if cached_msg:
                            try:
                                await websocket.send_json(cached_msg)
                            except Exception:
                                pass
                            continue

                    # Persist to database inside a single clean transaction and commit BEFORE broadcasting
                    try:
                        async with AsyncSessionLocal() as db:
                            # Scope reply reference strictly to current couple space if provided
                            if reply_id:
                                rep_res = await db.execute(
                                    select(Message.id).filter(
                                        Message.id == reply_id,
                                        Message.couple_space_id == space_id
                                    )
                                )
                                if not rep_res.scalar():
                                    try:
                                        await websocket.send_json({
                                            "type": "chat_message_error",
                                            "temp_id": temp_id,
                                            "message": "Message not found in your couple space."
                                        })
                                    except Exception:
                                        pass
                                    continue

                            msg = Message(
                                id=msg_id, couple_space_id=space_id, sender_id=user_id,
                                sender_name=user_name,
                                message_type=msg_type, text=encrypted_text,
                                media_url=media_url, is_once_view=is_once,
                                view_limit=v_limit, timestamp=now_ts,
                                reply_to_id=reply_id,
                                temp_id=temp_id
                            )
                            # Auto-save audio to voice notes
                            if msg.media_url and not msg.is_once_view and msg.message_type == "audio":
                                from app.models.orm import VoiceNote
                                vn = VoiceNote(
                                    id=str(uuid.uuid4()),
                                    couple_space_id=space_id,
                                    sender_id=user_id,
                                    url=msg.media_url,
                                    filename="voice_note.webm",
                                    custom_name="Chat Whisper",
                                    size=0,
                                    created_at=now_ts
                                )
                                db.add(vn)

                            db.add(msg)
                            await db.commit()
                    except Exception as db_err:
                        logger.error(f"Failed to persist chat message: {db_err}")
                        try:
                            await websocket.send_json({
                                "type": "chat_message_error",
                                "temp_id": temp_id,
                                "message": "Failed to persist message to database"
                            })
                        except Exception:
                            pass
                        continue

                    broadcast_data = {
                        "type": "chat_message", 
                        "id": msg_id, 
                        "temp_id": temp_id,
                        "sender_id": user_id, 
                        "sender_name": user_name,
                        "message_type": msg_type, 
                        "text": raw_text, 
                        "media_url": media_url, 
                        "reactions": {},
                        "is_once_view": is_once,
                        "view_limit": v_limit,
                        "views_used": 0,
                        "reply_to_id": reply_id,
                        "timestamp": now_ts.isoformat() + "Z"
                    }

                    if temp_id:
                        manager.record_processed_message(space_id, temp_id, broadcast_data)

                    # Immediate direct ACK to the sending websocket
                    try:
                        await websocket.send_json(broadcast_data)
                    except Exception:
                        pass

                    # Confirmed broadcast to partner & other space devices (exclude sender socket to avoid duplicate)
                    await manager.send_to_space(space_id, broadcast_data, exclude_socket=websocket)
                    partner_sockets_in_space = manager.spaces.get(space_id, {}).get(partner_id)
                    if partner_id and not partner_sockets_in_space:
                        await manager.send_to_user(partner_id, broadcast_data, exclude_socket=websocket)

                elif p_type == "ping":
                    try:
                        await websocket.send_json({"type": "pong"})
                    except Exception:
                        pass

                elif p_type == "presence_state":
                    await manager.send_to_space(space_id, {
                        "type": "presence_state", 
                        "user_id": user_id, 
                        "state": payload.get("state", "idle"), # peeking | typing | watching
                        "mood": payload.get("mood", "neutral") # happy | angry | loving | etc
                    }, exclude_user=user_id)

                elif p_type == "typing":
                    await manager.send_to_space(space_id, {
                        "type": "typing", "user_id": user_id, "is_typing": payload.get("is_typing", False)
                    }, exclude_user=user_id)

                elif p_type == "reaction":
                    message_id = payload.get("message_id")
                    emoji = payload.get("emoji")
                    new_reactions = {}
                    if message_id:
                        try:
                            async with AsyncSessionLocal() as db:
                                # Enforce couple space isolation & concurrency protection
                                stmt = (
                                    select(Message)
                                    .filter(
                                        Message.id == message_id,
                                        Message.couple_space_id == space_id
                                    )
                                )
                                res = await db.execute(stmt)
                                msg = res.scalars().first()
                                if msg:
                                    from sqlalchemy import text
                                    from app.api.routes.chat import safe_parse_reactions
                                    bind = db.get_bind()
                                    is_pg = bind and getattr(bind.dialect, "name", "").lower() in ("postgresql", "postgres")

                                    if emoji:
                                        if is_pg:
                                            patch_json = json.dumps({user_id: emoji})
                                            await db.execute(
                                                text("UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) || :patch::jsonb WHERE id = :msg_id AND couple_space_id = :space_id"),
                                                {"patch": patch_json, "space_id": space_id, "msg_id": message_id}
                                            )
                                        else:
                                            await db.execute(
                                                text(f"UPDATE messages SET reactions = json_set(COALESCE(reactions, '{{}}'), '$.\"{user_id}\"', :emoji) WHERE id = :msg_id AND couple_space_id = :space_id"),
                                                {"emoji": emoji, "space_id": space_id, "msg_id": message_id}
                                            )
                                    else:
                                        if is_pg:
                                            await db.execute(
                                                text("UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) - :uid WHERE id = :msg_id AND couple_space_id = :space_id"),
                                                {"uid": user_id, "msg_id": message_id, "space_id": space_id}
                                            )
                                        else:
                                            await db.execute(
                                                text(f"UPDATE messages SET reactions = json_remove(COALESCE(reactions, '{{}}'), '$.\"{user_id}\"') WHERE id = :msg_id AND couple_space_id = :space_id"),
                                                {"msg_id": message_id, "space_id": space_id}
                                            )
                                    await db.commit()

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
                                        "user_id": user_id,
                                        "emoji": emoji,
                                        "reactions": new_reactions
                                    }
                                    await manager.send_to_space(space_id, reaction_evt)
                                    partner_sockets_in_space = manager.spaces.get(space_id, {}).get(partner_id)
                                    if partner_id and not partner_sockets_in_space:
                                        await manager.send_to_user(partner_id, reaction_evt)
                                else:
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "Message not found in your couple space."
                                        })
                                    except Exception:
                                        pass
                        except Exception as e:
                            print(f"Reaction DB Error: {e}")
                            try:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "Failed to update reaction"
                                })
                            except Exception:
                                pass

                elif p_type in ["message_edit", "message_edited"]:
                    message_id = payload.get("message_id")
                    raw_text = (payload.get("text") or "").strip()
                    if message_id and raw_text:
                        try:
                            async with AsyncSessionLocal() as db:
                                res = await db.execute(
                                    select(Message).filter(
                                        Message.id == message_id,
                                        Message.couple_space_id == space_id
                                    )
                                )
                                msg = res.scalars().first()
                                if not msg:
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "Message not found in your couple space."
                                        })
                                    except Exception:
                                        pass
                                elif msg.sender_id != user_id:
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "You can only edit your own messages."
                                        })
                                    except Exception:
                                        pass
                                elif msg.is_once_view:
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "View-once messages cannot be edited."
                                        })
                                    except Exception:
                                        pass
                                elif msg.message_type and msg.message_type != "text":
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "Only text messages can be edited."
                                        })
                                    except Exception:
                                        pass
                                else:
                                    msg.text = encrypt_data(raw_text)
                                    msg.is_edited = True
                                    msg.edited_at = datetime.utcnow()
                                    await db.commit()
                                    await manager.send_to_space(space_id, {
                                        "type": "message_edited",
                                        "message_id": message_id,
                                        "sender_id": user_id,
                                        "text": raw_text,
                                        "is_edited": True,
                                        "edited_at": (msg.edited_at.isoformat() + "Z") if msg.edited_at else None
                                    })
                        except Exception as e:
                            print(f"WS Edit Error: {e}")

                elif p_type in ["message_delete", "delete_message"]:
                    message_id = payload.get("message_id")
                    for_everyone = payload.get("for_everyone", True)
                    if message_id:
                        try:
                            async with AsyncSessionLocal() as db:
                                res = await db.execute(
                                    select(Message).filter(
                                        Message.id == message_id,
                                        Message.couple_space_id == space_id
                                    )
                                )
                                msg = res.scalars().first()
                                if not msg:
                                    try:
                                        await websocket.send_json({
                                            "type": "error",
                                            "message": "Message not found in your couple space."
                                        })
                                    except Exception:
                                        pass
                                elif for_everyone:
                                    if msg.sender_id != user_id:
                                        try:
                                            await websocket.send_json({
                                                "type": "error",
                                                "message": "You can only delete your own messages for everyone."
                                            })
                                        except Exception:
                                            pass
                                    else:
                                        media_url_to_clean = msg.media_url
                                        await db.delete(msg)
                                        await db.commit()

                                        if media_url_to_clean:
                                            from app.core.media_lifecycle import cleanup_message_media_if_unshared
                                            await cleanup_message_media_if_unshared(
                                                db, media_url_to_clean, exclude_message_id=message_id, space_id=space_id
                                            )

                                        await manager.send_to_space(space_id, {
                                            "type": "message_deleted",
                                            "message_id": message_id
                                        })
                                else:
                                    from sqlalchemy.orm.attributes import flag_modified
                                    deleted_list = list(msg.deleted_for or [])
                                    if user_id not in deleted_list:
                                        deleted_list.append(user_id)
                                        msg.deleted_for = deleted_list
                                        flag_modified(msg, "deleted_for")

                                    all_participants = {user_id}
                                    if partner_id:
                                        all_participants.add(partner_id)

                                    if all_participants.issubset(set(deleted_list)):
                                        media_url_to_clean = msg.media_url
                                        await db.delete(msg)
                                        await db.commit()
                                        if media_url_to_clean:
                                            from app.core.media_lifecycle import cleanup_message_media_if_unshared
                                            await cleanup_message_media_if_unshared(
                                                db, media_url_to_clean, exclude_message_id=message_id, space_id=space_id
                                            )
                                    else:
                                        await db.commit()
                        except Exception as e:
                            print(f"WS Delete Error: {e}")

                elif p_type == "mood_update":
                    await manager.send_to_space(space_id, {
                        "type": "mood_update", "user_id": user_id, 
                        "mood_type": payload.get("mood_type"), "note": payload.get("note")
                    }, exclude_user=user_id)

                elif p_type == "media_save_request":
                    payload["from"] = user_name
                    payload["sender_id"] = user_id
                    await manager.send_to_user(partner_id, payload)

                elif p_type == "media_save_response":
                    allowed = payload.get("allowed", False)
                    request_id = payload.get("request_id")
                    msg_id = payload.get("message_id")
                    media_url = payload.get("media_url")
                
                    payload["partner_name"] = user_name

                    if allowed and msg_id:
                        async with AsyncSessionLocal() as db:
                            # Security: Scope media lookup strictly to the authenticated couple space
                            res = await db.execute(
                                select(Message).filter(Message.id == msg_id, Message.couple_space_id == space_id)
                            )
                            msg = res.scalars().first()
                            if msg and msg.media_url:
                                if not media_url:
                                    payload["media_url"] = msg.media_url
                                from app.models.orm import Memory
                                mem = Memory(
                                    id=str(uuid.uuid4()),
                                    couple_space_id=space_id,
                                    title="Saved from Secure Chat",
                                    description=f"Saved with permission from {user_name}",
                                    date=datetime.utcnow().strftime("%Y-%m-%d"),
                                    image_url=msg.media_url,
                                    created_by=request_id,
                                    created_at=datetime.utcnow()
                                )
                                db.add(mem)
                                await db.commit()

                    await manager.send_to_user(request_id, payload)

                elif p_type == "vault_download_request":
                    payload["from"] = user_name
                    payload["sender_id"] = user_id
                    await manager.send_to_user(partner_id, payload)

                elif p_type == "vault_download_response":
                    request_id = payload.get("request_id")
                    payload["partner_name"] = user_name
                    await manager.send_to_user(request_id, payload)

                elif p_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice", "webrtc_reject", "webrtc_end"]:
                    # Relay to partner
                    payload["from_id"] = user_id
                    payload["from_name"] = user_name
                    await manager.send_to_user(partner_id, payload)

                elif p_type == "webrtc_log":
                    # Save call history
                    async with AsyncSessionLocal() as db:
                        new_log = CallLog(
                            couple_space_id=space_id,
                            caller_id=payload.get("caller_id"),
                            recipient_id=payload.get("recipient_id"),
                            call_type=payload.get("call_type", "video"),
                            duration=payload.get("duration", 0)
                        )
                        db.add(new_log)
                        await db.commit()

                elif p_type == "capture_detected":
                    # Relay security breach alert to the partner
                    payload["from"] = user_name
                    payload["from_id"] = user_id
                    await manager.send_to_user(partner_id, payload)

                elif p_type == "presence_touch":
                    now_ts = datetime.utcnow()
                    last_time = last_presence_touch.get(user_id)
                    # Debounce: re-announce presence if at least 15s since last broadcast
                    if not last_time or (now_ts - last_time).total_seconds() > 15:
                        last_presence_touch[user_id] = now_ts
                        await manager.send_to_space(space_id, {
                            "type": "presence", "user_id": user_id, "online": True, "user_name": user_name
                        }, exclude_user=user_id)

            except Exception as e:
                print(f"WS Handler Error: {e}")
                import traceback
                traceback.print_exc()

    except WebSocketDisconnect:
        if space_id and user_id:
            last_presence_touch.pop(user_id, None)
            manager.disconnect(space_id, user_id, websocket)
            if not manager.spaces.get(space_id, {}).get(user_id):
                await manager.send_to_space(space_id, {"type": "presence", "user_id": user_id, "online": False})
    except Exception as e:
        from app.main import last_error
        import traceback
        last_error["error"] = str(e)
        last_error["trace"] = traceback.format_exc()
        if space_id and user_id:
            last_presence_touch.pop(user_id, None)
            manager.disconnect(space_id, user_id, websocket)
            if not manager.spaces.get(space_id, {}).get(user_id):
                await manager.send_to_space(space_id, {"type": "presence", "user_id": user_id, "online": False})
