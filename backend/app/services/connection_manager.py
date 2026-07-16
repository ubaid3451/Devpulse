"""
Manages active WebSocket connections and online-presence broadcasting.
"""

from typing import Dict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        await self.broadcast_presence(user_id, True)

    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            await self.broadcast_presence(user_id, False)

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast_presence(self, user_id: str, is_online: bool):
        message = {
            "type": "presence",
            "user_id": user_id,
            "online": is_online,
        }
        for uid, conn in self.active_connections.items():
            if uid != user_id:
                try:
                    await conn.send_json(message)
                except Exception:
                    pass


# Single shared instance used across the app
manager = ConnectionManager()