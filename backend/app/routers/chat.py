from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, or_, and_, delete, func
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


class KeyBundleUpload(BaseModel):
    device_id: int | None = None          # None => "register a new device, assign me an id"
    device_name: str | None = None
    identity_key: str
    registration_id: int
    signed_prekey: dict
    one_time_prekeys: list[dict]


@router.post("/keys")
def upload_key_bundle(bundle: KeyBundleUpload, current_user: CurrentUser, db: Session = Depends(get_db)):
    """
    Upload/refresh a Signal E2EE public key bundle for ONE DEVICE of the
    current user. Each browser/device calls this with its own identity —
    multiple devices for the same user can coexist.
    """
    from app.models.device import Device, DeviceSignedPreKey, DeviceOneTimePreKey

    device: Device | None = None
    if bundle.device_id is not None:
        device = db.execute(
            select(Device).where(
                Device.user_id == current_user.id,
                Device.device_id == bundle.device_id,
            )
        ).scalar_one_or_none()

    if device is None:
        # Assign the next free device_id for this user (starts at 1)
        max_id = db.execute(
            select(Device.device_id).where(Device.user_id == current_user.id).order_by(Device.device_id.desc()).limit(1)
        ).scalar_one_or_none()
        next_id = (max_id or 0) + 1
        device = Device(
            user_id=current_user.id,
            device_id=next_id,
            device_name=bundle.device_name,
            identity_public_key=bundle.identity_key,
            registration_id=bundle.registration_id,
        )
        db.add(device)
        db.flush()
    else:
        device.identity_public_key = bundle.identity_key
        device.device_name = bundle.device_name or device.device_name

    # Upsert this device's signed pre-key (one per device)
    existing_spk = db.execute(
        select(DeviceSignedPreKey).where(DeviceSignedPreKey.device_id == device.id)
    ).scalar_one_or_none()
    if existing_spk:
        existing_spk.key_id = bundle.signed_prekey["keyId"]
        existing_spk.public_key = bundle.signed_prekey["publicKey"]
        existing_spk.signature = bundle.signed_prekey["signature"]
    else:
        db.add(DeviceSignedPreKey(
            device_id=device.id,
            key_id=bundle.signed_prekey["keyId"],
            public_key=bundle.signed_prekey["publicKey"],
            signature=bundle.signed_prekey["signature"],
        ))

    # Add new one-time pre-keys for this device (avoid duplicates)
    existing_key_ids = set(db.execute(
        select(DeviceOneTimePreKey.key_id).where(DeviceOneTimePreKey.device_id == device.id)
    ).scalars().all())
    for otk in bundle.one_time_prekeys:
        if otk["keyId"] not in existing_key_ids:
            db.add(DeviceOneTimePreKey(
                device_id=device.id,
                key_id=otk["keyId"],
                public_key=otk["publicKey"],
            ))

    db.commit()
    return {"message": "Key bundle uploaded successfully", "device_id": device.device_id}


@router.get("/keys/{user_id_or_username}")
def get_key_bundles(user_id_or_username: str, current_user: CurrentUser, db: Session = Depends(get_db)):
    """
    Retrieve Signal E2EE public key bundles for EVERY active device belonging
    to a given user. The sender must build one session + one ciphertext per
    device returned here (that's how multi-device fan-out works).
    """
    from app.models.user import User
    from app.models.device import Device, DeviceSignedPreKey, DeviceOneTimePreKey

    user = db.execute(
        select(User).where(or_(User.id == user_id_or_username, User.username == user_id_or_username))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    devices = db.execute(
        select(Device).where(Device.user_id == user.id, Device.is_active == True)  # noqa: E712
    ).scalars().all()

    if not devices:
        # Backward compatibility fallback for existing users who haven't uploaded
        # to the new `devices` table yet (legacy single-device model).
        from app.models.signed_prekey import SignedPreKey
        from app.models.one_time_prekey import OneTimePreKey

        if user.identity_public_key:
            spk = db.execute(
                select(SignedPreKey).where(SignedPreKey.user_id == user.id)
            ).scalar_one_or_none()
            if spk:
                otk = db.execute(
                    select(OneTimePreKey).where(OneTimePreKey.user_id == user.id).limit(1)
                ).scalar_one_or_none()
                one_time_prekey = None
                if otk:
                    one_time_prekey = {"key_id": otk.key_id, "public_key": otk.public_key}
                    db.delete(otk)
                    db.commit()
                return {
                    "devices": [{
                        "device_id": 1,
                        "identity_key": user.identity_public_key,
                        "registration_id": user.registration_id or 1,
                        "signed_prekey": {
                            "key_id": spk.key_id,
                            "public_key": spk.public_key,
                            "signature": spk.signature,
                        },
                        "one_time_prekey": one_time_prekey,
                    }]
                }

        raise HTTPException(status_code=404, detail="No key bundles found for this user")

    bundles = []
    for device in devices:
        spk = db.execute(
            select(DeviceSignedPreKey).where(DeviceSignedPreKey.device_id == device.id)
        ).scalar_one_or_none()
        if not spk:
            continue  # device registered its identity but never finished uploading prekeys — skip

        otk = db.execute(
            select(DeviceOneTimePreKey).where(DeviceOneTimePreKey.device_id == device.id).limit(1)
        ).scalar_one_or_none()
        one_time_prekey = None
        if otk:
            one_time_prekey = {"key_id": otk.key_id, "public_key": otk.public_key}
            db.delete(otk)  # consumed — X3DH one-time use

        bundles.append({
            "device_id": device.device_id,
            "identity_key": device.identity_public_key,
            "registration_id": device.registration_id,
            "signed_prekey": {
                "key_id": spk.key_id,
                "public_key": spk.public_key,
                "signature": spk.signature,
            },
            "one_time_prekey": one_time_prekey,
        })

    db.commit()

    if not bundles:
        raise HTTPException(status_code=404, detail="No key bundles found for this user")

    return {"user_id": user.id, "devices": bundles}



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
    return {
        "conversation_id": convo.id,
        "is_group": convo.is_group,
        "participants": [
            {
                "id": other_user.id,
                "username": other_user.username,
                "full_name": other_user.full_name,
                "avatar_url": other_user.avatar_url,
            }
        ],
        "is_blocked": False,
        "unread_count": 0,
        "last_message": None,
        "last_message_id": None,
        "last_message_msg_type": None,
        "last_message_encrypted": False,
        "last_message_at": convo.created_at.isoformat(),
    }


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


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    from app.models.conversation import Conversation
    from app.models.message import Message
    from app.models.message_ciphertext import MessageCiphertext

    participant = db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id
        )
    ).scalar_one_or_none()

    if not participant:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete participant entry for current user
    db.delete(participant)

    # Delete MessageCiphertext rows sent to this user for this conversation
    msg_ids = db.execute(
        select(Message.id).where(Message.conversation_id == conversation_id)
    ).scalars().all()
    if msg_ids:
        db.execute(
            delete(MessageCiphertext).where(
                MessageCiphertext.recipient_user_id == current_user.id,
                MessageCiphertext.message_id.in_(msg_ids)
            )
        )

    # Check if there are any remaining participants in this conversation
    remaining_participants = db.execute(
        select(func.count(ConversationParticipant.id)).where(
            ConversationParticipant.conversation_id == conversation_id
        )
    ).scalar_one()

    # If no participants left, delete the conversation (cascades and deletes all messages)
    if remaining_participants == 0:
        convo = db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        ).scalar_one_or_none()
        if convo:
            db.delete(convo)

    db.commit()
    return {"message": "Conversation deleted successfully"}


@router.get("/{conversation_id}")
def get_chat_history(
    conversation_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    device_id: int = 1,
):
    history = chat_history.get_chat_history(db, current_user, conversation_id, device_id=device_id)
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


@router.post("/{conversation_id}/session-reset")
async def session_reset_notify(
    conversation_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Notify the other participant(s) in a conversation to reset their Signal
    Protocol session state. Called when decryption fails (Bad MAC) so that
    BOTH parties purge the stale session and automatically re-establish a
    fresh X3DH handshake on the next message — rather than only the recipient
    resetting while the sender keeps encrypting with the now-invalid session.
    """
    other_participant_ids = db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != current_user.id,
        )
    ).scalars().all()

    payload = {
        "type": "session_reset",
        "conversation_id": conversation_id,
        "from_user_id": current_user.id,
    }
    for participant_id in other_participant_ids:
        await manager.send_personal_message(payload, participant_id)

    return {"message": "Session reset notification sent"}


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

    # device_id identifies WHICH of this user's devices/browsers this socket
    # belongs to — required so per-device Signal ciphertexts can be routed to
    # the correct connection instead of just "a" connection for this user.
    device_id_raw = websocket.query_params.get("device_id")
    try:
        device_id = int(device_id_raw) if device_id_raw is not None else 1
    except ValueError:
        device_id = 1

    await manager.connect(websocket, user.id, device_id)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "reaction":
                await chat_events.handle_reaction_event(db, user, data)
            elif "conversation_id" in data:
                await chat_events.handle_chat_message_event(db, user, data, sender_device_id=device_id)
    except WebSocketDisconnect:
        await manager.disconnect(user.id, device_id)