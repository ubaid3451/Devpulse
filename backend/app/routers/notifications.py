from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc, update, delete
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.notification import Notification
from app.models.post import Post, Comment
from app.schemas.notification import NotificationResponse, UnreadCountResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
def get_notifications(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    query = (
        select(Notification)
        .options(
            joinedload(Notification.actor),
            joinedload(Notification.post),
            joinedload(Notification.comment),
        )
        .where(Notification.recipient_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .offset(skip)
        .limit(limit)
    )
    results = db.execute(query).scalars().all()

    notifications_out = []
    for n in results:
        post_snippet = None
        if n.post:
            post_snippet = n.post.title or (n.post.content[:60] if n.post.content else None)

        comment_snippet = None
        if n.comment:
            comment_snippet = n.comment.content[:60] if n.comment.content else None

        notifications_out.append(
            NotificationResponse(
                id=n.id,
                recipient_id=n.recipient_id,
                actor_id=n.actor_id,
                actor={
                    "id": n.actor.id,
                    "username": n.actor.username,
                    "full_name": n.actor.full_name,
                    "avatar_url": n.actor.avatar_url,
                },
                type=n.type,
                post_id=n.post_id,
                comment_id=n.comment_id,
                post_snippet=post_snippet,
                comment_snippet=comment_snippet,
                is_read=n.is_read,
                created_at=n.created_at,
            )
        )

    return notifications_out


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.recipient_id == current_user.id, Notification.is_read.is_(False))
    ) or 0
    return {"unread_count": count}


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    notif = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    return {"status": "success", "id": notification_id, "is_read": True}


@router.post("/read-all")
def mark_all_notifications_read(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    db.execute(
        update(Notification)
        .where(Notification.recipient_id == current_user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    notif = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notif)
    db.commit()
    return {"status": "success", "message": "Notification deleted"}
