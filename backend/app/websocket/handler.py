from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from datetime import datetime, timedelta
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.orm import User, Message, CallLog, Note
from app.websocket.manager import manager
from app.core.encryption import encrypt_data, decrypt_data
import json, uuid

router = APIRouter(tags=["WebSocket"])

async def get_user_from_token(token: str, db: AsyncSession):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: return None
        result = await db.execute(select(User).filter(User.id == user_id))
        return result.scalars().first()
    except Exception: return None

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    user_id = None
    space_id = None
    try:
        async with AsyncSessionLocal() as db:
            user = await get_user_from_token(token, db)
            if not user or not user.couple_space_id:
                await websocket.close(code=4001, reason="Unauthorized")
                return

            space_id = user.couple_space_id
            user_id = user.id
            user_name = user.name
            partner_id = user.partner_id

            await manager.connect(websocket, space_id, user_id)

            await manager.send_to_space(space_id, {
                "type": "presence", "user_id": user_id, "online": True, "user_name": user_name
            }, exclude_user=user_id)

            while True:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                except Exception:
                    continue
                
                if not isinstance(payload, dict):
                    continue
                    
                p_type = payload.get("type")
                
                if p_type == "chat_message":
                    raw_text = payload.get("text", "")
                    encrypted_text = encrypt_data(raw_text)
                    msg = Message(
                        id=str(uuid.uuid4()), couple_space_id=space_id, sender_id=user_id,
                        message_type=payload.get("message_type", "text"), text=encrypted_text,
                        media_url=payload.get("media_url"), is_once_view=payload.get("is_once_view", False),
                        view_limit=payload.get("view_limit", 1), timestamp=datetime.utcnow()
                    )
                    
                    # Auto-save image to memory vault if not once-view
                    if msg.media_url and not msg.is_once_view and msg.message_type == "image":
                        from app.models.orm import Memory
                        mem = Memory(
                            id=str(uuid.uuid4()),
                            couple_space_id=space_id,
                            title="Chat Memory",
                            description="Automatically saved from chat",
                            date=msg.timestamp.strftime("%Y-%m-%d"),
                            image_url=msg.media_url,
                            created_by=user_id,
                            created_at=msg.timestamp
                        )
                        db.add(mem)
                    
                    broadcast_data = {
                        "type": "chat_message", "id": msg.id, "sender_id": user_id, "sender_name": user_name,
                        "message_type": msg.message_type, "text": raw_text, "media_url": msg.media_url,
                        "is_once_view": msg.is_once_view, "view_limit": msg.view_limit, 
                        "timestamp": msg.timestamp.isoformat() + "Z"
                    }
                    
                    db.add(msg)
                    await db.commit()
                    
                    await manager.send_to_space(space_id, broadcast_data)

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

                elif p_type == "mood_update":
                    await manager.send_to_space(space_id, {
                        "type": "mood_update", "user_id": user_id, 
                        "mood_type": payload.get("mood_type"), "note": payload.get("note")
                    }, exclude_user=user_id)

                elif p_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice", "webrtc_reject", "webrtc_end"]:
                    # Relay to partner
                    payload["from_id"] = user_id
                    payload["from_name"] = user_name
                    await manager.send_to_user(partner_id, payload)

                elif p_type == "webrtc_log":
                    # Save call history
                    new_log = CallLog(
                        couple_space_id=space_id,
                        caller_id=payload.get("caller_id"),
                        recipient_id=payload.get("recipient_id"),
                        call_type=payload.get("call_type", "video"),
                        duration=payload.get("duration", 0)
                    )
                    db.add(new_log)
                    await db.commit()

    except WebSocketDisconnect:
        if space_id and user_id:
            manager.disconnect(space_id, user_id)
            await manager.send_to_space(space_id, {"type": "presence", "user_id": user_id, "online": False})
    except Exception as e:
        from app.main import last_error
        import traceback
        last_error["error"] = str(e)
        last_error["trace"] = traceback.format_exc()
        if space_id and user_id:
            manager.disconnect(space_id, user_id)
            await manager.send_to_space(space_id, {"type": "presence", "user_id": user_id, "online": False})
