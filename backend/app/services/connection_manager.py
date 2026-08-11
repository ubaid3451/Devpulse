"""
Manages active WebSocket connections and online-presence broadcasting.

Multi-device change: a user can now have MORE THAN ONE active socket at a
time (one per logged-in device/browser). Connections are keyed by
(user_id, device_id) so a message fan-out can push the correct per-device
Signal ciphertext to the right socket instead of just "the" connection for
that user.
"""

from typing import Dict, Tuple

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # (user_id, device_id) -> websocket
        self.active_connections: Dict[Tuple[str, int], WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str, device_id: int):
        await websocket.accept()
        was_already_online = any(uid == user_id for (uid, _did) in self.active_connections)
        self.active_connections[(user_id, device_id)] = websocket
        # Only announce "online" the first time this user has ANY device connected
        if not was_already_online:
            await self.broadcast_presence(user_id, True)

    async def disconnect(self, user_id: str, device_id: int):
        key = (user_id, device_id)
        if key in self.active_connections:
            del self.active_connections[key]
        # Only announce "offline" once ALL of this user's devices are gone
        still_online = any(uid == user_id for (uid, _did) in self.active_connections)
        if not still_online:
            await self.broadcast_presence(user_id, False)

    def device_ids_for_user(self, user_id: str) -> list[int]:
        return [did for (uid, did) in self.active_connections if uid == user_id]

    async def send_to_device(self, message: dict, user_id: str, device_id: int):
        conn = self.active_connections.get((user_id, device_id))
        if conn:
            try:
                await conn.send_json(message)
            except Exception:
                pass

    async def send_personal_message(self, message: dict, user_id: str):
        """Send the same payload to EVERY active device of this user.
        Used for non-E2EE-payload events (reactions, presence, read receipts,
        session-reset notices) where there's nothing per-device to pick."""
        for (uid, _did), conn in list(self.active_connections.items()):
            if uid == user_id:
                try:
                    await conn.send_json(message)
                except Exception:
                    pass

    async def broadcast_presence(self, user_id: str, is_online: bool):
        message = {
            "type": "presence",
            "user_id": user_id,
            "online": is_online,
        }
        for (uid, _did), conn in list(self.active_connections.items()):
            if uid != user_id:
                try:
                    await conn.send_json(message)
                except Exception:
                    pass


# Single shared instance used across the app
manager = ConnectionManager()
