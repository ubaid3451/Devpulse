import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Device(Base):
    """
    One row per browser/device that has ever set up a Signal Protocol
    identity for a given user. Replaces the old "one identity per user"
    model (previously identity_public_key/registration_id lived directly
    on User).

    device_id is a small integer, unique PER USER (not globally) — mirrors
    how SignalProtocolAddress(name, deviceId) addressing works. Starts at 1
    and increments per new device the user registers.
    """
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id: Mapped[int] = mapped_column(Integer, nullable=False)  # unique per user_id
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)  # e.g. "Chrome on macOS"

    identity_public_key: Mapped[str] = mapped_column(Text, nullable=False)
    registration_id: Mapped[int] = mapped_column(Integer, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    signed_prekey: Mapped["DeviceSignedPreKey"] = relationship(
        "DeviceSignedPreKey", back_populates="device", uselist=False, cascade="all, delete-orphan"
    )
    one_time_prekeys: Mapped[list["DeviceOneTimePreKey"]] = relationship(
        "DeviceOneTimePreKey", back_populates="device", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # a given device_id number is unique within a user's set of devices
        # (enforced in app code + a composite unique constraint)
    )

    def __repr__(self) -> str:
        return f"<Device user_id={self.user_id!r} device_id={self.device_id!r}>"


class DeviceSignedPreKey(Base):
    __tablename__ = "device_signed_prekeys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    signature: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    device: Mapped["Device"] = relationship("Device", back_populates="signed_prekey")


class DeviceOneTimePreKey(Base):
    __tablename__ = "device_one_time_prekeys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    device: Mapped["Device"] = relationship("Device", back_populates="one_time_prekeys")
