import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    message_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("messages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uix_message_user_emoji"),
    )

    # Relationships
    message = relationship("Message", back_populates="reactions")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<MessageReaction id={self.id!r} emoji={self.emoji!r}>"
