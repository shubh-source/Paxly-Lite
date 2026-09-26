from fastapi import WebSocket
from typing import Dict, Set
import json

class ConnectionManager:
    def __init__(self):
        # space_id -> set of (user_id, websocket)
        self.spaces: Dict[str, Dict[str, WebSocket]] = {}
        # user_id -> space_id (for quick lookup)
        self.user_space: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, space_id: str, user_id: str):
        await websocket.accept()
        if space_id not in self.spaces:
            self.spaces[space_id] = {}
        self.spaces[space_id][user_id] = websocket
        self.user_space[user_id] = space_id

    def disconnect(self, space_id: str, user_id: str):
        if space_id in self.spaces:
            self.spaces[space_id].pop(user_id, None)
            if not self.spaces[space_id]:
                del self.spaces[space_id]
        self.user_space.pop(user_id, None)

    async def send_to_space(self, space_id: str, message: dict, exclude_user: str = None):
        """Send message to all users in a couple space."""
        if space_id not in self.spaces:
            return
        dead = []
        for uid, ws in self.spaces[space_id].items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.spaces[space_id].pop(uid, None)

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to a specific user."""
        space_id = self.user_space.get(user_id)
        if not space_id:
            return
        ws = self.spaces.get(space_id, {}).get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(space_id, user_id)

    def is_partner_online(self, space_id: str, user_id: str) -> bool:
        users = self.spaces.get(space_id, {})
        return any(uid != user_id for uid in users)

manager = ConnectionManager()
