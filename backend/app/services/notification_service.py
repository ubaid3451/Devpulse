import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

from app.models.notification import Notification
from app.models.user import User
from app.models.post import Post, Comment
from app.services.connection_manager import manager


def create_notification(
    db: Session,
    recipient_id: str,
    actor_id: str,
    type: str,
    post_id: str | None = None,
    comment_id: str | None = None,
) -> Notification | None:
    # 1. Do not notify if actor is the same as recipient (e.g. self like / self comment)
    if recipient_id == actor_id:
        return None

    # 2. Prevent duplicate pending notifications for likes and follows
    if type in ("like", "follow", "follow_request"):
        query = select(Notification).where(
            Notification.recipient_id == recipient_id,
            Notification.actor_id == actor_id,
            Notification.type == type,
        )
        if post_id:
            query = query.where(Notification.post_id == post_id)
        
        existing = db.execute(query).scalar_one_or_none()
        if existing:
            # If already exists, return existing
            return existing

    # 3. Create notification record
    notif = Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=type,
        post_id=post_id,
        comment_id=comment_id,
        is_read=False,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # 4. Fetch actor and snippets for live broadcast
    actor = db.execute(select(User).where(User.id == actor_id)).scalar_one_or_none()
    actor_data = {
        "id": actor.id if actor else actor_id,
        "username": actor.username if actor else "User",
        "full_name": actor.full_name if actor else None,
        "avatar_url": actor.avatar_url if actor else None,
    }

    post_snippet = None
    if post_id:
        p = db.execute(select(Post).where(Post.id == post_id)).scalar_one_or_none()
        if p:
            post_snippet = p.title or (p.content[:60] if p.content else None)

    comment_snippet = None
    if comment_id:
        c = db.execute(select(Comment).where(Comment.id == comment_id)).scalar_one_or_none()
        if c:
            comment_snippet = c.content[:60] if c.content else None

    # 5. Broadcast real-time event to recipient devices via WebSocket
    payload = {
        "type": "notification",
        "notification": {
            "id": notif.id,
            "recipient_id": notif.recipient_id,
            "actor_id": notif.actor_id,
            "actor": actor_data,
            "type": notif.type,
            "post_id": notif.post_id,
            "comment_id": notif.comment_id,
            "post_snippet": post_snippet,
            "comment_snippet": comment_snippet,
            "is_read": notif.is_read,
            "created_at": notif.created_at.isoformat(),
        }
    }

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.send_personal_message(payload, recipient_id))
        else:
            asyncio.run(manager.send_personal_message(payload, recipient_id))
    except Exception:
        # Don't let websocket failure break the DB transaction
        pass

    return notif


def delete_notification_by_action(
    db: Session,
    recipient_id: str,
    actor_id: str,
    type: str,
    post_id: str | None = None,
):
    query = delete(Notification).where(
        Notification.recipient_id == recipient_id,
        Notification.actor_id == actor_id,
        Notification.type == type,
    )
    if post_id:
        query = query.where(Notification.post_id == post_id)
    db.execute(query)
    db.commit()
