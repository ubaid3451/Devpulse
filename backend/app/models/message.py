import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sender_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # For Signal Protocol-encrypted conversations, `content` holds the base64
    # ciphertext body of a Signal message envelope. `msg_type` distinguishes
    # the type Signal Protocol assigns: 3 = PreKeyWhisperMessage (the first
    # message establishing a session), 1 = WhisperMessage (every message
    # after that, once the Double Ratchet is running). The server never
    # inspects either value — it just stores and relays them.
    # Nullable now: multi-device conversations store per-recipient-device
    # ciphertexts in the separate `message_ciphertexts` table instead (see
    # MessageCiphertext) — a single shared `content` can't be decrypted by
    # more than one device's session. Kept for backward compat with rows
    # written before multi-device support / any code path still using the
    # legacy single-ciphertext fallback.
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    msg_type: Mapped[int | None] = mapped_column(Integer, nullable=True)

    image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="messages_sent")
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Message id={self.id!r} conversation_id={self.conversation_id!r} sender={self.sender_id!r}>"