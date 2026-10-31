from fastapi import WebSocket
from typing import Dict, Set, List, Optional, Tuple, Any, Callable
import json
import time
import os
import uuid
import logging
from app.core.config import settings

logger = logging.getLogger("websocket.manager")


class EventBroker:
    """Abstract interface for cross-worker event pub/sub (CHAT-014)."""
    async def publish(self, channel: str, message: dict):
        raise NotImplementedError

    async def subscribe(self, channel: str, callback: Callable):
        raise NotImplementedError

    async def unsubscribe(self, channel: str, callback: Optional[Callable] = None):
        raise NotImplementedError

    async def close(self):
        pass


class InMemoryBroker(EventBroker):
    """
    In-memory pub/sub broker used for testing cross-worker synchronization
    and local topologies without requiring external infrastructure.
    """
    def __init__(self):
        self.subscribers: Dict[str, Set[Callable]] = {}
        self.is_healthy: bool = True

    async def publish(self, channel: str, message: dict):
        if not self.is_healthy:
            raise ConnectionError("InMemoryBroker is currently offline/unreachable")
        callbacks = list(self.subscribers.get(channel, set()))
        for cb in callbacks:
            try:
                await cb(channel, message)
            except Exception as e:
                logger.warning("Error in InMemoryBroker subscriber callback: %s", type(e).__name__)

    async def subscribe(self, channel: str, callback: Callable):
        if channel not in self.subscribers:
            self.subscribers[channel] = set()
        self.subscribers[channel].add(callback)

    async def unsubscribe(self, channel: str, callback: Optional[Callable] = None):
        if channel in self.subscribers:
            if callback:
                self.subscribers[channel].discard(callback)
            else:
                self.subscribers.pop(channel, None)

    async def close(self):
        self.subscribers.clear()


class ConnectionManager:
    def __init__(self, broker: Optional[EventBroker] = None):
        # space_id -> { user_id: Set[WebSocket] }
        self.spaces: Dict[str, Dict[str, Set[WebSocket]]] = {}
        # user_id -> space_id
        self.user_space: Dict[str, str] = {}
        # (space_id, temp_id) -> (processed_timestamp, message_dict)
        self.processed_temp_ids: Dict[Tuple[str, str], Tuple[float, dict]] = {}

        # Worker identity & broker integration (CHAT-014)
        self.worker_id: str = str(uuid.uuid4())[:8]
        self.broker: Optional[EventBroker] = broker
        self.subscribed_channels: Set[str] = set()

    def set_broker(self, broker: Optional[EventBroker]):
        self.broker = broker

    def get_processed_message(self, space_id: str, temp_id: str) -> Optional[dict]:
        if not space_id or not temp_id:
            return None
        self._prune_processed_temp_ids()
        entry = self.processed_temp_ids.get((space_id, temp_id))
        if entry:
            return entry[1]
        return None

    def record_processed_message(self, space_id: str, temp_id: str, message: dict):
        if not space_id or not temp_id:
            return
        self._prune_processed_temp_ids()
        self.processed_temp_ids[(space_id, temp_id)] = (time.time(), message)

    def _prune_processed_temp_ids(self, ttl_seconds: float = 120.0):
        now = time.time()
        if len(self.processed_temp_ids) > 50:
            expired = [k for k, (ts, _) in self.processed_temp_ids.items() if now - ts > ttl_seconds]
            for k in expired:
                self.processed_temp_ids.pop(k, None)

    async def connect(self, websocket: WebSocket, space_id: str, user_id: str):
        if space_id not in self.spaces:
            self.spaces[space_id] = {}
            if self.broker:
                channel = f"vlynxly:space:{space_id}"
                if channel not in self.subscribed_channels:
                    try:
                        await self.broker.subscribe(channel, self._handle_broker_space_message)
                        self.subscribed_channels.add(channel)
                    except Exception as e:
                        logger.warning("Failed to subscribe to broker channel for space %s: %s", space_id, type(e).__name__)

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

    async def send_to_space(self, space_id: str, message: dict, exclude_user: str = None, exclude_socket: WebSocket = None, from_broker: bool = False):
        """Send message to all devices/tabs of all users in a couple space."""
        # 1. Deliver to locally connected clients in this worker process
        await self._send_to_local_space(space_id, message, exclude_user, exclude_socket)

        # 2. If a cross-worker broker is configured, broadcast to sibling workers
        if self.broker and not from_broker:
            envelope = {
                "source_worker": self.worker_id,
                "space_id": space_id,
                "message": message,
                "exclude_user": exclude_user
            }
            channel = f"vlynxly:space:{space_id}"
            try:
                await self.broker.publish(channel, envelope)
            except Exception as e:
                # Operational diagnostic logging without exposing private message content (CHAT-014)
                logger.warning(
                    "Broker publish failed for space %s (falling back to local delivery): %s",
                    space_id,
                    type(e).__name__
                )

    async def _send_to_local_space(self, space_id: str, message: dict, exclude_user: str = None, exclude_socket: WebSocket = None):
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

    async def _handle_broker_space_message(self, channel: str, envelope: dict):
        """Processes cross-worker messages received from the event broker."""
        if not isinstance(envelope, dict):
            return
        source_worker = envelope.get("source_worker")
        if source_worker == self.worker_id:
            # Skip loopback to prevent duplicate local delivery
            return

        space_id = envelope.get("space_id")
        expected_channel = f"vlynxly:space:{space_id}"
        # Enforce couple space isolation: channel and envelope space_id must match exactly
        if channel != expected_channel:
            logger.warning("Rejected mismatched broker message: channel %s vs space %s", channel, space_id)
            return

        message = envelope.get("message")
        if not message or not isinstance(message, dict):
            return
        exclude_user = envelope.get("exclude_user")
        await self._send_to_local_space(space_id, message, exclude_user)

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to all active devices of a specific user across any space."""
        target_sockets = set()
        for s_id, users in list(self.spaces.items()):
            if user_id in users:
                target_sockets.update(users[user_id])

        dead = []
        for ws in list(target_sockets):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((user_id, ws))
        for uid, ws in dead:
            for s_id in list(self.spaces.keys()):
                self.disconnect(s_id, uid, ws)

    def is_partner_online(self, space_id: str, user_id: str) -> bool:
        users = self.spaces.get(space_id, {})
        return any(uid != user_id and len(sockets) > 0 for uid, sockets in users.items())

    @staticmethod
    def check_worker_topology() -> dict:
        """
        Validates the current hosting and worker topology (CHAT-014).
        Returns mode and safety status.
        """
        concurrency = int(os.environ.get("WEB_CONCURRENCY", 1))
        has_broker = bool(getattr(settings, "REDIS_URL", None))
        is_safe = (concurrency == 1) or has_broker
        mode = "multi_worker_broker" if has_broker else ("single_worker" if concurrency == 1 else "unsupported_multi_worker_partitioned")
        return {
            "concurrency": concurrency,
            "has_broker": has_broker,
            "is_safe": is_safe,
            "mode": mode
        }

manager = ConnectionManager()
