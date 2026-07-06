import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OTPRecord(Base):
    """
    One-time password record.

    - One user can have multiple OTP records (each resend creates a new one).
    - Only the latest un-used, unexpired code is valid.
    - Rate limiting: count rows for a user in the last hour.
    """

    __tablename__ = "otp_records"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(6), nullable=False)

    # UTC expiry — 10 minutes after creation
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Marked True after the code is successfully used (one-time use)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Convenience back-reference (not strictly needed in M1 but useful later)
    user = relationship("User", lazy="noload")

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self.expires_at

    def __repr__(self) -> str:
        return f"<OTPRecord user={self.user_id!r} used={self.is_used}>"
