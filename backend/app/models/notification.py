import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(
        Enum("like", "comment", "follow", "follow_request", "message", name="notification_type_enum"),
        nullable=False,
        index=True
    )
    post_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("posts.id", ondelete="CASCADE"), nullable=True
    )
    comment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    recipient = relationship("User", foreign_keys=[recipient_id])
    actor = relationship("User", foreign_keys=[actor_id])
    post = relationship("Post", foreign_keys=[post_id])
    comment = relationship("Comment", foreign_keys=[comment_id])

    def __repr__(self) -> str:
        return f"<Notification id={self.id!r} type={self.type!r} recipient_id={self.recipient_id!r} actor_id={self.actor_id!r}>"
