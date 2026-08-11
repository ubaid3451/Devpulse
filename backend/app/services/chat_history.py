"""
Read-side queries for conversations and chat history (group-chat capable, E2EE-aware, block-aware, read-receipt-aware).
"""

from typing import List, Optional

from sqlalchemy import select, desc, or_, and_, func
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.message import Message
from app.models.conversation import Conversation
from app.models.conversation_participant import ConversationParticipant
from app.models.block import Block
from app.services.connection_manager import manager


def get_online_user_ids() -> List[str]:
    # active_connections is now keyed by (user_id, device_id) — deduplicate
    return list({uid for (uid, _did) in manager.active_connections})


def _conversation_ids_for_user(db: Session, user_id: str) -> List[str]:
    rows = db.execute(
        select(ConversationParticipant.conversation_id).where(
            ConversationParticipant.user_id == user_id
        )
    ).scalars().all()
    return list(rows)


def _is_blocked_either_direction(db: Session, user_a_id: str, user_b_id: str) -> bool:
    existing = db.execute(
        select(Block).where(
            or_(
                and_(Block.blocker_id == user_a_id, Block.blocked_id == user_b_id),
                and_(Block.blocker_id == user_b_id, Block.blocked_id == user_a_id),
            )
        )
    ).scalar_one_or_none()
    return existing is not None


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

        is_blocked = False
        if not convo.is_group and other_participants:
            is_blocked = _is_blocked_either_direction(db, current_user.id, other_participants[0].id)

        # Unread count: messages in this conversation NOT sent by the
        # current user, that they haven't marked as read yet.
        unread_count = db.scalar(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == convo.id,
                Message.sender_id != current_user.id,
                Message.is_read.is_(False),
            )
        ) or 0

        last_message_content = last_message.content if last_message else None
        last_message_msg_type = last_message.msg_type if last_message else None
        last_message_sender_id = last_message.sender_id if last_message else None
        is_encrypted = bool(last_message and last_message.msg_type)

        if last_message and not is_encrypted:
            # Check if multi-device MessageCiphertext exists for this last message
            from app.models.message_ciphertext import MessageCiphertext
            ct = db.execute(
                select(MessageCiphertext).where(
                    MessageCiphertext.message_id == last_message.id,
                    MessageCiphertext.recipient_user_id == current_user.id,
                ).limit(1)
            ).scalar_one_or_none()

            if ct:
                last_message_content = ct.content
                last_message_msg_type = ct.msg_type
                is_encrypted = True
            else:
                has_any_ct = db.execute(
                    select(MessageCiphertext.id).where(
                        MessageCiphertext.message_id == last_message.id
                    ).limit(1)
                ).scalar_one_or_none()
                if has_any_ct:
                    is_encrypted = True
                    last_message_msg_type = 1

        result.append({
            "conversation_id": convo.id,
            "is_group": convo.is_group,
            "name": convo.name,
            "participants": [
                {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "avatar_url": u.avatar_url,
                }
                for u in other_participants
            ],
            "is_blocked": is_blocked,
            "unread_count": unread_count,
            "last_message": last_message_content,
            "last_message_id": last_message.id if last_message else None,
            "last_message_sender_id": last_message_sender_id,
            "last_message_msg_type": last_message_msg_type,
            "last_message_encrypted": is_encrypted,
            "last_message_at": last_message.created_at if last_message else convo.created_at,
        })

    result.sort(key=lambda x: x["last_message_at"], reverse=True)
    return result


def get_chat_history(
    db: Session,
    current_user: User,
    conversation_id: str,
    device_id: int = 1,
) -> Optional[List[dict]]:
    """Returns None if the conversation doesn't exist or the user isn't a participant.

    For multi-device E2EE messages (those with rows in message_ciphertexts),
    returns the ciphertext row addressed to the requesting device so the client
    can decrypt it. Legacy single-ciphertext messages fall back to Message.content.
    """
    from app.models.message_ciphertext import MessageCiphertext

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

    result = []
    for msg in messages:
        # Look for a per-device ciphertext addressed to THIS user + device.
        ct = db.execute(
            select(MessageCiphertext).where(
                MessageCiphertext.message_id == msg.id,
                MessageCiphertext.recipient_user_id == current_user.id,
                MessageCiphertext.recipient_device_id == device_id,
            )
        ).scalar_one_or_none()

        # For messages the current user SENT, try to get the sync copy (their
        # own device's ciphertext). If there isn't one, content is None —
        # the frontend already shows "[Sent message — not available on this device]".
        if ct is None and msg.sender_id == current_user.id:
            ct = db.execute(
                select(MessageCiphertext).where(
                    MessageCiphertext.message_id == msg.id,
                    MessageCiphertext.recipient_user_id == current_user.id,
                ).limit(1)
            ).scalar_one_or_none()

        # Determine which ciphertext/sender_device_id to serve.
        if ct is not None:
            # Multi-device path: use the per-device ciphertext.
            content = ct.content
            msg_type = ct.msg_type
            # sender_device_id isn't stored on Message; recover from any
            # ciphertext row NOT addressed to the current user (the sender's copy).
            sender_ct = db.execute(
                select(MessageCiphertext).where(
                    MessageCiphertext.message_id == msg.id,
                    MessageCiphertext.recipient_user_id != current_user.id,
                ).limit(1)
            ).scalar_one_or_none()
            # We don't persist sender_device_id on Message yet; default to 1.
            sender_device_id = 1
        else:
            # Legacy path: single ciphertext stored in Message.content.
            content = msg.content
            msg_type = msg.msg_type
            sender_device_id = 1

        result.append({
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "sender_device_id": sender_device_id,
            "content": content,
            "msg_type": msg_type,
            "image_url": msg.image_url,
            "is_read": msg.is_read,
            "created_at": msg.created_at,
            "reactions": [{"user_id": r.user_id, "emoji": r.emoji} for r in msg.reactions],
        })

    return result


def mark_conversation_read(db: Session, current_user: User, conversation_id: str) -> List[str]:
    """
    Marks every unread message in this conversation (sent by someone else)
    as read. Returns the list of message IDs that were actually updated, so
    the caller can broadcast a read-receipt event for exactly those.
    """
    is_participant = db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not is_participant:
        return []

    unread_messages = db.execute(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.is_read.is_(False),
        )
    ).scalars().all()

    updated_ids = [m.id for m in unread_messages]
    for msg in unread_messages:
        msg.is_read = True
    db.commit()

    return updated_ids


def create_group_conversation(
    db: Session, creator_id: str, member_ids: List[str], name: str
) -> Conversation:
    """Creates a new group conversation with the creator plus the given member ids."""
    all_member_ids = set(member_ids) | {creator_id}

    new_convo = Conversation(is_group=True, name=name)
    db.add(new_convo)
    db.flush()

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
    db.flush()

    db.add(ConversationParticipant(conversation_id=new_convo.id, user_id=user_a_id))
    db.add(ConversationParticipant(conversation_id=new_convo.id, user_id=user_b_id))
    db.commit()
    db.refresh(new_convo)
    return new_convo