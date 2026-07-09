from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile
import os
import uuid
from sqlalchemy import select, or_, and_, desc
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user_ws
from app.models.user import User
from app.models.message import Message
from app.models.message_reaction import MessageReaction

router = APIRouter(prefix="/chat", tags=["chat"])

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
            "online": is_online
        }
        for uid, conn in self.active_connections.items():
            if uid != user_id:
                try:
                    await conn.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

manager = ConnectionManager()

@router.post("/upload_image")
def upload_chat_image(
    current_user: CurrentUser,
    image: UploadFile = File(...)
):
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    ext = image.filename.split(".")[-1] if "." in image.filename else "jpg"
    filename = f"chat_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(uploads_dir, filename)
    
    with open(filepath, "wb") as buffer:
        import shutil
        shutil.copyfileobj(image.file, buffer)
        
    image_url = f"http://localhost:8000/uploads/{filename}"
    return {"image_url": image_url}

@router.get("/online")
def get_online_users(current_user: CurrentUser):
    return list(manager.active_connections.keys())

@router.get("/conversations")
def get_conversations(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    # Fetch all messages where current user is sender or receiver
    messages = db.execute(
        select(Message).where(
            or_(Message.sender_id == current_user.id, Message.receiver_id == current_user.id)
        ).order_by(desc(Message.created_at))
    ).scalars().all()
    
    # Get unique users
    conversations = {}
    for msg in messages:
        other_user_id = msg.receiver_id if msg.sender_id == current_user.id else msg.sender_id
        if other_user_id not in conversations:
            conversations[other_user_id] = {
                "last_message": msg.content,
                "created_at": msg.created_at
            }
            
    if not conversations:
        return []
        
    # Fetch user details
    users = db.execute(
        select(User).where(User.id.in_(list(conversations.keys())))
    ).scalars().all()
    
    result = []
    for user in users:
        result.append({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "last_message": conversations[user.id]["last_message"],
            "last_message_at": conversations[user.id]["created_at"]
        })
        
    # Sort by last message time
    result.sort(key=lambda x: x["last_message_at"], reverse=True)
    return result

@router.get("/{username}")
def get_chat_history(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    messages = db.execute(
        select(Message).where(
            or_(
                and_(Message.sender_id == current_user.id, Message.receiver_id == target_user.id),
                and_(Message.sender_id == target_user.id, Message.receiver_id == current_user.id)
            )
        ).order_by(Message.created_at)
    ).scalars().all()
    
    return [{
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "content": msg.content,
        "image_url": msg.image_url,
        "is_read": msg.is_read,
        "created_at": msg.created_at,
        "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg.reactions]
    } for msg in messages]

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=1008)
        return
        
    try:
        user = await get_current_user_ws(token, db)
    except Exception:
        await websocket.close(code=1008)
        return
        
    await manager.connect(websocket, user.id)
    try:
        while True:
            data = await websocket.receive_json()
            if "type" in data and data["type"] == "reaction":
                message_id = data.get("message_id")
                emoji = data.get("emoji")
                if message_id and emoji:
                    # Toggle or replace reaction
                    existing = db.execute(
                        select(MessageReaction)
                        .where(MessageReaction.message_id == message_id)
                        .where(MessageReaction.user_id == user.id)
                    ).scalar_one_or_none()
                    
                    if existing:
                        if existing.emoji == emoji:
                            db.delete(existing)
                        else:
                            existing.emoji = emoji
                    else:
                        new_reaction = MessageReaction(message_id=message_id, user_id=user.id, emoji=emoji)
                        db.add(new_reaction)
                    db.commit()
                    
                    msg_obj = db.execute(select(Message).where(Message.id == message_id)).scalar_one_or_none()
                    if msg_obj:
                        reaction_payload = {
                            "type": "reaction_update",
                            "message_id": message_id,
                            "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg_obj.reactions]
                        }
                        await manager.send_personal_message(reaction_payload, msg_obj.sender_id)
                        if msg_obj.sender_id != msg_obj.receiver_id:
                            await manager.send_personal_message(reaction_payload, msg_obj.receiver_id)
                            
            elif "receiver_username" in data:
                receiver = db.execute(select(User).where(User.username == data["receiver_username"])).scalar_one_or_none()
                if receiver:
                    new_msg = Message(
                        sender_id=user.id,
                        receiver_id=receiver.id,
                        content=data.get("content", ""),
                        image_url=data.get("image_url")
                    )
                    db.add(new_msg)
                    db.commit()
                    db.refresh(new_msg)
                    
                    msg_payload = {
                        "type": "chat_message",
                        "id": new_msg.id,
                        "sender_id": new_msg.sender_id,
                        "receiver_id": new_msg.receiver_id,
                        "content": new_msg.content,
                        "image_url": new_msg.image_url,
                        "is_read": new_msg.is_read,
                        "created_at": new_msg.created_at.isoformat(),
                        "reactions": []
                    }
                    
                    # Send back to sender for confirmation
                    await manager.send_personal_message(msg_payload, user.id)
                    # Send to receiver if online
                    if user.id != receiver.id:
                        await manager.send_personal_message(msg_payload, receiver.id)
    except WebSocketDisconnect:
        await manager.disconnect(user.id)
