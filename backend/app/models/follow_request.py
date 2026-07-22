import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FollowRequest(Base):
    """
    A pending/accepted/rejected request to follow a private account.
    Once accepted, a corresponding row is created in `follows` (the existing
    instant-follow table) — this table only tracks the request lifecycle
    itself, not the resulting relationship.
    """
    __tablename__ = "follow_requests"
    __table_args__ = (UniqueConstraint("requester_id", "target_id", name="uix_requester_target"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requester_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "rejected", name="follow_request_status_enum"),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    requester = relationship("User", foreign_keys=[requester_id])
    target = relationship("User", foreign_keys=[target_id])

    def __repr__(self) -> str:
        return f"<FollowRequest requester_id={self.requester_id!r} target_id={self.target_id!r} status={self.status!r}>"