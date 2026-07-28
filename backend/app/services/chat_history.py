"""
Read-side queries for conversations and chat history (group-chat capable).
"""

from typing import List, Optional

from sqlalchemy import select, desc, or_, and_
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.message import Message
from app.models.conversation import Conversation
from app.models.conversation_participant import ConversationParticipant
from app.models.block import Block
from app.services.connection_manager import manager


def _is_blocked_with_any(db: Session, user_id: str, other_ids: List[str]) -> bool:
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


def get_online_user_ids() -> List[str]:
    return list(manager.active_connections.keys())


def _conversation_ids_for_user(db: Session, user_id: str) -> List[str]:
    rows = db.execute(
        select(ConversationParticipant.conversation_id).where(
            ConversationParticipant.user_id == user_id
        )
    ).scalars().all()
    return list(rows)


def get_conversations(db: Session, current_user: User) -> List[dict]:
    conversation_ids = _conversation_ids_for_user(db, current_user.id)
    if not conversation_ids:
        return []

    conversations = db.execute(
        select(Conversation).where(Conversation.id.in_(conversation_ids))
    ).scalars().all()

    result = []
    for convo in conversations:
        last_message = db.execute(
            select(Message)
            .where(Message.conversation_id == convo.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        ).scalar_one_or_none()

        other_participants = db.execute(
            select(User)
            .join(ConversationParticipant, ConversationParticipant.user_id == User.id)
            .where(
                ConversationParticipant.conversation_id == convo.id,
                User.id != current_user.id,
            )
        ).scalars().all()

        other_ids = [u.id for u in other_participants]
        is_blocked_by_me = False
        has_blocked_me = False
        if other_ids:
            is_blocked_by_me = db.execute(
                select(Block).where(
                    Block.blocker_id == current_user.id,
                    Block.blocked_id.in_(other_ids),
                )
            ).scalar_one_or_none() is not None

            has_blocked_me = db.execute(
                select(Block).where(
                    Block.blocked_id == current_user.id,
                    Block.blocker_id.in_(other_ids),
                )
            ).scalar_one_or_none() is not None

        is_blocked = is_blocked_by_me or has_blocked_me

        result.append({
            "conversation_id": convo.id,
            "is_group": convo.is_group,
            "name": convo.name,  # group name, or None for 1-on-1
            "participants": [
                {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "avatar_url": u.avatar_url,
                }
                for u in other_participants
            ],
            "last_message": last_message.content if last_message else None,
            "last_message_id": last_message.id if last_message else None,
            "last_message_msg_type": last_message.msg_type if last_message else None,
            "last_message_encrypted": bool(last_message and last_message.msg_type),
            "last_message_at": last_message.created_at if last_message else convo.created_at,
            "is_blocked": is_blocked,
            "is_blocked_by_me": is_blocked_by_me,
            "has_blocked_me": has_blocked_me,
        })

    result.sort(key=lambda x: x["last_message_at"], reverse=True)
    return result


def get_chat_history(db: Session, current_user: User, conversation_id: str) -> Optional[List[dict]]:
    """Returns None if the conversation doesn't exist or the user isn't a participant."""
    is_participant = db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not is_participant:
        return None

    messages = db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    ).scalars().all()

    return [{
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "msg_type": msg.msg_type,
        "image_url": msg.image_url,
        "is_read": msg.is_read,
        "created_at": msg.created_at,
        "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg.reactions],
    } for msg in messages]


def create_group_conversation(
    db: Session, creator_id: str, member_ids: List[str], name: str
) -> Conversation:
    """Creates a new group conversation with the creator plus the given member ids."""
    all_member_ids = set(member_ids) | {creator_id}

    new_convo = Conversation(is_group=True, name=name)
    db.add(new_convo)
    db.flush()  # get new_convo.id without committing yet

    for uid in all_member_ids:
        db.add(ConversationParticipant(conversation_id=new_convo.id, user_id=uid))

    db.commit()
    db.refresh(new_convo)
    return new_convo


def get_or_create_direct_conversation(db: Session, user_a_id: str, user_b_id: str) -> Conversation:
    """Finds an existing 1-on-1 conversation between two users, or creates one."""
    a_conversation_ids = set(_conversation_ids_for_user(db, user_a_id))
    b_conversation_ids = set(_conversation_ids_for_user(db, user_b_id))
    shared_ids = a_conversation_ids & b_conversation_ids

    if shared_ids:
        candidates = db.execute(
            select(Conversation).where(
                Conversation.id.in_(shared_ids), Conversation.is_group.is_(False)
            )
        ).scalars().all()
        for convo in candidates:
            participant_count = db.execute(
                select(ConversationParticipant).where(
                    ConversationParticipant.conversation_id == convo.id
                )
            ).scalars().all()
            if len(participant_count) == 2:
                return convo

    new_convo = Conversation(is_group=False)
    db.add(new_convo)
    db.flush()  # get new_convo.id without committing yet

    db.add(ConversationParticipant(conversation_id=new_convo.id, user_id=user_a_id))
    db.add(ConversationParticipant(conversation_id=new_convo.id, user_id=user_b_id))
    db.commit()
    db.refresh(new_convo)
    return new_convo