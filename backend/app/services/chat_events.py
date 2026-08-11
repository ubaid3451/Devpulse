"""
Handlers for inbound WebSocket events (reactions, new chat messages) —
group-chat capable, E2EE-aware, block-aware, multi-device-aware.
"""

from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.message import Message
from app.models.message_ciphertext import MessageCiphertext
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


async def handle_chat_message_event(db: Session, user: User, data: dict, sender_device_id: int = 1) -> None:
    """
    Expects the NEW multi-device payload shape from the client:

        {
          "conversation_id": "...",
          "image_url": "..." | None,
          "ciphertexts": [
            {"recipient_user_id": "...", "recipient_device_id": 1, "content": "base64...", "msg_type": 3},
            {"recipient_user_id": "...", "recipient_device_id": 2, "content": "base64...", "msg_type": 3}
          ]
        }

    One ciphertext per recipient device is required because each device has
    an independent Double Ratchet session with the sender — there is no
    single ciphertext that all of a user's devices could jointly decrypt.
    The ciphertexts list should include entries for the sender's OWN other
    devices too (Signal Protocol "sync" copies), so a message sent from one
    browser also appears in the sender's other logged-in browsers.

    Backward compatibility: if "ciphertexts" is absent but legacy
    "content"/"msg_type" fields are present, falls back to the old
    single-ciphertext behavior (pre-multi-device clients).
    """
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

    other_participant_ids = [
        pid for pid in _participant_ids(db, conversation_id) if pid != user.id
    ]
    if _is_blocked_with_any(db, user.id, other_participant_ids):
        # Silently drop — the client normally prevents sending into a
        # blocked conversation, so reaching here means a direct API call
        # bypassed the UI.
        return

    ciphertexts_in = data.get("ciphertexts")

    # Legacy fallback: single ciphertext, no device fan-out (old client).
    if not ciphertexts_in:
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
        return

    # New multi-device path: one Message row (shared metadata) + N
    # MessageCiphertext rows (one per recipient device).
    new_msg = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        content="",          # unused for E2EE multi-device path
        msg_type=None,
        image_url=data.get("image_url"),
    )
    db.add(new_msg)
    db.flush()  # get new_msg.id without committing yet

    ciphertext_rows = []
    for ct in ciphertexts_in:
        row = MessageCiphertext(
            message_id=new_msg.id,
            recipient_user_id=ct["recipient_user_id"],
            recipient_device_id=ct["recipient_device_id"],
            content=ct["content"],
            msg_type=ct["msg_type"],
        )
        db.add(row)
        ciphertext_rows.append(row)

    db.commit()
    db.refresh(new_msg)

    # Fan out: each recipient device gets ONLY its own ciphertext, delivered
    # to that specific (user_id, device_id) socket if currently connected.
    # Offline devices fetch their ciphertext later via the REST chat-history
    # endpoint (which also needs to become device-aware — see
    # get_chat_history / chat_history.py).
    sent_to_sender = False
    for row in ciphertext_rows:
        payload = {
            "type": "chat_message",
            "id": new_msg.id,
            "conversation_id": new_msg.conversation_id,
            "sender_id": new_msg.sender_id,
            "sender_device_id": sender_device_id,
            "content": row.content,
            "msg_type": row.msg_type,
            "image_url": new_msg.image_url,
            "is_read": new_msg.is_read,
            "created_at": new_msg.created_at.isoformat(),
            "reactions": [],
        }
        await manager.send_to_device(payload, row.recipient_user_id, row.recipient_device_id)
        if row.recipient_user_id == user.id and row.recipient_device_id == sender_device_id:
            sent_to_sender = True

    # Always ensure the active sending device receives a confirmation WS event
    # so the sender UI appends the sent message cleanly.
    if not sent_to_sender:
        sender_payload = {
            "type": "chat_message",
            "id": new_msg.id,
            "conversation_id": new_msg.conversation_id,
            "sender_id": new_msg.sender_id,
            "sender_device_id": sender_device_id,
            "content": "",
            "msg_type": None,
            "image_url": new_msg.image_url,
            "is_read": new_msg.is_read,
            "created_at": new_msg.created_at.isoformat(),
            "reactions": [],
        }
        await manager.send_to_device(sender_payload, user.id, sender_device_id)
