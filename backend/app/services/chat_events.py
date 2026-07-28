"""
Handlers for inbound WebSocket events (reactions, new chat messages) — group-chat capable, E2EE-aware, block-aware.
"""

from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.message import Message
from app.models.message_reaction import MessageReaction
from app.models.conversation_participant import ConversationParticipant
from app.models.block import Block
from app.services.connection_manager import manager


def _participant_ids(db: Session, conversation_id: str) -> list[str]:
    rows = db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id
        )
    ).scalars().all()
    return list(rows)


def _is_blocked_with_any(db: Session, user_id: str, other_ids: list[str]) -> bool:
    """True if a block exists (either direction) between user_id and ANY of other_ids."""
    if not other_ids:
        return False
    existing = db.execute(
        select(Block).where(
            or_(
                and_(Block.blocker_id == user_id, Block.blocked_id.in_(other_ids)),
                and_(Block.blocked_id == user_id, Block.blocker_id.in_(other_ids)),
            )
        )
    ).scalar_one_or_none()
    return existing is not None


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

    # Block check: don't let a message through if the sender is blocked by
    # (or has blocked) ANY other participant in this conversation. For 1-on-1
    # chats this is simply "the other person"; written generically so it
    # also covers group chats correctly if/when those support blocking too.
    other_participant_ids = [
        pid for pid in _participant_ids(db, conversation_id) if pid != user.id
    ]
    if _is_blocked_with_any(db, user.id, other_participant_ids):
        # Silently drop the message rather than raising an exception that
        # could crash the WebSocket connection — the sender's own client
        # already shouldn't be showing a send box for a blocked
        # conversation (see frontend), so reaching this path means someone
        # is calling the API directly rather than through the normal UI.
        return

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