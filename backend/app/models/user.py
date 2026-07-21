import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import UUID
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.post import Post, Comment, Like
    from app.models.follow import Follow
    from app.models.message import Message


class User(Base):
    """
    Central user entity.
    - hashed_password is nullable so OAuth-only users don't need a password.
    - role is set now (Milestone 1) so admin routes in Milestone 4 just work.
    - is_verified gates login for email/password users (OTP flow).
    - is_active is toggled by admins to block/unblock users (Milestone 4).
    - public_key is the user's ECDH public key (base64 SPKI), used for E2E
      encrypted chat. The matching private key never leaves the user's browser.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    # Role-based access control (user | admin) — needed for Milestone 4 admin panel
    role: Mapped[str] = mapped_column(
        Enum("user", "admin", name="user_role_enum"),
        nullable=False,
        default="user",
        server_default="user",
    )

    # Email verification state (OTP flow)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Account active state (admin block/unblock)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # OAuth fields — non-null only for OAuth-registered accounts
    oauth_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)   # "google" | "github"
    oauth_provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Profile fields (used more fully in Milestone 2)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # E2E encryption (Signal Protocol) — identity key + registration id.
    # Public keys are NOT secret; matching private keys stay client-side.
    identity_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    registration_id: Mapped[int | None] = mapped_column(nullable=True)

    # Timestamps (stored as UTC)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="author", cascade="all, delete-orphan")
    likes: Mapped[list["Like"]] = relationship("Like", back_populates="user", cascade="all, delete-orphan")

    # Social Graph relationships
    following: Mapped[list["User"]] = relationship(
        "User",
        secondary="follows",
        primaryjoin="User.id == Follow.follower_id",
        secondaryjoin="User.id == Follow.following_id",
        back_populates="followers",
    )
    followers: Mapped[list["User"]] = relationship(
        "User",
        secondary="follows",
        primaryjoin="User.id == Follow.following_id",
        secondaryjoin="User.id == Follow.follower_id",
        back_populates="following",
    )

    # Messaging relationships
    messages_sent: Mapped[list["Message"]] = relationship(
        "Message",
        foreign_keys="[Message.sender_id]",
        back_populates="sender",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r} role={self.role!r}>"