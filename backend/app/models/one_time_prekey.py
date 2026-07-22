import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OneTimePreKey(Base):
    """
    A single-use pre-key. Consumed (deleted) the first time someone else
    starts a Signal Protocol session using it — this is what lets X3DH work
    even when the recipient is offline at handshake time.
    """
    __tablename__ = "one_time_prekeys"
    __table_args__ = (UniqueConstraint("user_id", "key_id", name="uix_user_prekey"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)  # base64

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<OneTimePreKey user_id={self.user_id!r} key_id={self.key_id!r}>"