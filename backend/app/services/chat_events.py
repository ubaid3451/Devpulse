"""
Handlers for inbound WebSocket events (reactions, new chat messages) — group-chat capable, E2EE-aware.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.message import Message
from app.models.message_reaction import MessageReaction
from app.models.conversation_participant import ConversationParticipant
from app.services.connection_manager import manager


def _participant_ids(db: Session, conversation_id: str) -> list[str]:
    rows = db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id
        )
    ).scalars().all()
    return list(rows)


async def handle_reaction_event(db: Session, user: User, data: dict) -> None:
    message_id = data.get("message_id")
    emoji = data.get("emoji")
    if not (message_id and emoji):
        return

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
        db.add(MessageReaction(message_id=message_id, user_id=user.id, emoji=emoji))
    db.commit()

    msg_obj = db.execute(select(Message).where(Message.id == message_id)).scalar_one_or_none()
    if not msg_obj:
        return

    reaction_payload = {
        "type": "reaction_update",
        "message_id": message_id,
        "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg_obj.reactions],
    }

    for participant_id in _participant_ids(db, msg_obj.conversation_id):
        await manager.send_personal_message(reaction_payload, participant_id)


async def handle_chat_message_event(db: Session, user: User, data: dict) -> None:
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    is_participant = db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not is_participant:
        return

    # content is base64 ciphertext for E2EE conversations, plaintext otherwise.
    # The server never distinguishes or inspects which — it just stores and
    # relays whatever the client sends, plus the iv needed to decrypt it.
    new_msg = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        content=data.get("content", ""),
        msg_type=data.get("msg_type"),
        image_url=data.get("image_url"),
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    msg_payload = {
        "type": "chat_message",
        "id": new_msg.id,
        "conversation_id": new_msg.conversation_id,
        "sender_id": new_msg.sender_id,
        "content": new_msg.content,
        "msg_type": new_msg.msg_type,
        "image_url": new_msg.image_url,
        "is_read": new_msg.is_read,
        "created_at": new_msg.created_at.isoformat(),
        "reactions": [],
    }

    for participant_id in _participant_ids(db, conversation_id):
        await manager.send_personal_message(msg_payload, participant_id)