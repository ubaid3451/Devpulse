from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user_ws
from app.services.connection_manager import manager
from app.services import chat_history, chat_events, image_upload
from app.models.block import Block
from app.models.conversation_participant import ConversationParticipant

router = APIRouter(prefix="/chat", tags=["chat"])


class StartDirectConversationRequest(BaseModel):
    username: str


class CreateGroupConversationRequest(BaseModel):
    name: str
    usernames: list[str]


@router.post("/upload_image")
def upload_chat_image(
    current_user: CurrentUser,
    image: UploadFile = File(...)
):
    try:
        image_url = image_upload.save_chat_image(image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"image_url": image_url}


@router.get("/online")
def get_online_users(current_user: CurrentUser):
    return chat_history.get_online_user_ids()


@router.get("/conversations")
def get_conversations(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    return chat_history.get_conversations(db, current_user)


@router.post("/conversations/direct")
def start_direct_conversation(
    body: StartDirectConversationRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    from app.models.user import User

    other_user = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    if other_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot start a conversation with yourself")

    is_blocked = db.execute(
        select(Block).where(
            or_(
                and_(Block.blocker_id == current_user.id, Block.blocked_id == other_user.id),
                and_(Block.blocker_id == other_user.id, Block.blocked_id == current_user.id),
            )
        )
    ).scalar_one_or_none()
    if is_blocked:
        raise HTTPException(status_code=403, detail="You can't message this user")

    convo = chat_history.get_or_create_direct_conversation(db, current_user.id, other_user.id)
    return {"conversation_id": convo.id, "is_group": convo.is_group}


@router.post("/conversations/group")
def create_group_conversation(
    body: CreateGroupConversationRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    from app.models.user import User

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")
    if len(body.usernames) < 2:
        raise HTTPException(status_code=400, detail="A group needs at least 2 other members")

    members = db.execute(select(User).where(User.username.in_(body.usernames))).scalars().all()
    found_usernames = {u.username for u in members}
    missing = set(body.usernames) - found_usernames
    if missing:
        raise HTTPException(status_code=404, detail=f"Users not found: {', '.join(missing)}")

    member_ids = [u.id for u in members]
    convo = chat_history.create_group_conversation(db, current_user.id, member_ids, body.name.strip())
    return {"conversation_id": convo.id, "is_group": convo.is_group, "name": convo.name}


@router.get("/{conversation_id}")
def get_chat_history(
    conversation_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    history = chat_history.get_chat_history(db, current_user, conversation_id)
    if history is None:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")
    return history


@router.post("/{conversation_id}/read")
async def mark_conversation_read(
    conversation_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """
    Marks all unread messages in this conversation (sent by the other
    participant(s)) as read, then notifies THEM in real time so their UI
    can update sent-message checkmarks from "delivered" to "read".
    """
    updated_message_ids = chat_history.mark_conversation_read(db, current_user, conversation_id)

    if updated_message_ids:
        other_participant_ids = db.execute(
            select(ConversationParticipant.user_id).where(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id != current_user.id,
            )
        ).scalars().all()

        payload = {
            "type": "messages_read",
            "conversation_id": conversation_id,
            "message_ids": updated_message_ids,
            "read_by": current_user.id,
        }
        for participant_id in other_participant_ids:
            await manager.send_personal_message(payload, participant_id)

    return {"marked_read": len(updated_message_ids)}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
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
            if data.get("type") == "reaction":
                await chat_events.handle_reaction_event(db, user, data)
            elif "conversation_id" in data:
                await chat_events.handle_chat_message_event(db, user, data)
    except WebSocketDisconnect:
        await manager.disconnect(user.id)