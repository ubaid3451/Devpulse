from datetime import datetime
from pydantic import BaseModel


class NotificationActor(BaseModel):
    id: str
    username: str
    full_name: str | None = None
    avatar_url: str | None = None


class NotificationResponse(BaseModel):
    id: str
    recipient_id: str
    actor_id: str
    actor: NotificationActor
    type: str  # like, comment, follow, follow_request, message
    post_id: str | None = None
    comment_id: str | None = None
    post_snippet: str | None = None
    comment_snippet: str | None = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UnreadCountResponse(BaseModel):
    unread_count: int
