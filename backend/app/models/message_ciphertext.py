import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MessageCiphertext(Base):
    """
    One row per (message, recipient device). A single logical message sent
    to a user with 3 active devices produces 3 rows here — one ciphertext
    per device, because each device has its own independent Double Ratchet
    session with the sender.

    The parent `Message` row keeps shared metadata (sender, conversation,
    created_at, is_archived, etc.) but Message.content/msg_type become
    unused for E2EE conversations once this table is introduced — kept
    nullable for backward compat with old rows.
    """
    __tablename__ = "message_ciphertexts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_device_id: Mapped[int] = mapped_column(Integer, nullable=False)

    content: Mapped[str] = mapped_column(Text, nullable=False)  # base64 ciphertext, this device's session
    msg_type: Mapped[int] = mapped_column(Integer, nullable=False)  # 3 = PreKeyWhisperMessage, 1 = WhisperMessage

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    message: Mapped["Message"] = relationship("Message", backref="ciphertexts")
