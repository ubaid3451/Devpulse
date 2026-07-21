import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SignedPreKey(Base):
    """
    A user's current signed pre-key (Signal Protocol / X3DH). Rotated
    periodically in a full implementation — this project stores one active
    key per user and overwrites it on re-upload.
    """
    __tablename__ = "signed_prekeys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)  # base64
    signature: Mapped[str] = mapped_column(Text, nullable=False)  # base64, signed by identity key

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<SignedPreKey user_id={self.user_id!r} key_id={self.key_id!r}>"