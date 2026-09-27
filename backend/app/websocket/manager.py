from fastapi import WebSocket
from typing import Dict, Set, List
import json

class ConnectionManager:
    def __init__(self):
        # space_id -> { user_id: Set[WebSocket] }
        self.spaces: Dict[str, Dict[str, Set[WebSocket]]] = {}
        # user_id -> space_id
        self.user_space: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, space_id: str, user_id: str):
        if space_id not in self.spaces:
            self.spaces[space_id] = {}
        if user_id not in self.spaces[space_id]:
            self.spaces[space_id][user_id] = set()
        self.spaces[space_id][user_id].add(websocket)
        self.user_space[user_id] = space_id

    def disconnect(self, space_id: str, user_id: str, websocket: WebSocket = None):
        if space_id in self.spaces:
            if user_id in self.spaces[space_id]:
                if websocket:
                    self.spaces[space_id][user_id].discard(websocket)
                else:
                    self.spaces[space_id].pop(user_id, None)
                
                # If no more connections for this user in this space
                if not self.spaces[space_id].get(user_id):
                    self.spaces[space_id].pop(user_id, None)
                    
            if not self.spaces[space_id]:
                self.spaces.pop(space_id, None)
                
        # Check if user has connections in any space before removing user_space
        is_still_connected = False
        for s_id, users in self.spaces.items():
            if user_id in users and users[user_id]:
                is_still_connected = True
                break
        if not is_still_connected:
            self.user_space.pop(user_id, None)

    async def send_to_space(self, space_id: str, message: dict, exclude_user: str = None, exclude_socket: WebSocket = None):
        """Send message to all devices/tabs of all users in a couple space."""
        if space_id not in self.spaces:
            return
        dead = []
        for uid, sockets in list(self.spaces[space_id].items()):
            if uid == exclude_user:
                continue
            for ws in list(sockets):
                if ws == exclude_socket:
                    continue
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append((uid, ws))
                    
        for uid, ws in dead:
            self.disconnect(space_id, uid, ws)

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to all active devices of a specific user."""
        space_id = self.user_space.get(user_id)
        if not space_id or space_id not in self.spaces:
            return
        sockets = self.spaces.get(space_id, {}).get(user_id, set())
        dead = []
        for ws in list(sockets):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((user_id, ws))
        for uid, ws in dead:
            self.disconnect(space_id, uid, ws)

    def is_partner_online(self, space_id: str, user_id: str) -> bool:
        users = self.spaces.get(space_id, {})
        return any(uid != user_id and len(sockets) > 0 for uid, sockets in users.items())

manager = ConnectionManager()
