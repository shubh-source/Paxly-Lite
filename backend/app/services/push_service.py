import json
import asyncio
import os
from typing import Optional
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.orm import PushSubscription
from sqlalchemy.future import select

class PushService:
    @property
    def vapid_public_key(self) -> str:
        return os.environ.get("VAPID_PUBLIC_KEY") or getattr(
            settings,
            "VAPID_PUBLIC_KEY",
            "BOPwU4iK-z_GCX26vyqgcU6EkAlPadtfEQfaEfuwdioUhCkaySHMtrE-GYueIuVwvbQ_sfwYl1VWe-p1MbKrhh4"
        )

    @property
    def vapid_private_key(self) -> str:
        return os.environ.get("VAPID_PRIVATE_KEY") or getattr(
            settings,
            "VAPID_PRIVATE_KEY",
            "3W6Yu9Tm7WV1pd2DBAgwEI14b_zvrF7U4foD8CO85Y0"
        )

    @property
    def vapid_claims(self) -> dict:
        email = os.environ.get("SENDER_EMAIL") or getattr(settings, "SENDER_EMAIL", "vlynxlyofficial@gmail.com")
        if not email.startswith("mailto:"):
            email = f"mailto:{email}"
        return {"sub": email}

    async def send_push_to_user(self, user_id: str, title: str, body: str, url: str = "/chat"):
        """Sends a secure Web Push notification to user's registered browser/PWA subscriptions."""
        if not user_id:
            return

        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(PushSubscription).filter(PushSubscription.user_id == str(user_id))
                )
                subs = result.scalars().all()

            if not subs:
                return

            payload = json.dumps({
                "title": title,
                "body": body,
                "data": {"url": url}
            })

            def _sync_send(sub_info):
                try:
                    from pywebpush import webpush
                    webpush(
                        subscription_info=sub_info,
                        data=payload,
                        vapid_private_key=self.vapid_private_key,
                        vapid_claims=self.vapid_claims,
                        timeout=5
                    )
                except Exception as e:
                    # Don't throw if subscription expired or endpoint unreachable
                    print(f"[PushService] Delivery note: {e}", flush=True)

            for s in subs:
                sub_info = {
                    "endpoint": s.endpoint,
                    "keys": s.keys
                }
                await asyncio.to_thread(_sync_send, sub_info)

        except Exception as ex:
            print(f"[PushService] Failed to dispatch push to user {user_id}: {ex}", flush=True)

push_service = PushService()
