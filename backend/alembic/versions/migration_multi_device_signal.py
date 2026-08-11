"""multi-device signal protocol support

Revision ID: multi_device_001
Revises: rbac_001
Create Date: 2026-08-11

Adds device-scoped identity/prekey tables (devices, device_signed_prekeys,
device_one_time_prekeys) and a per-recipient-device ciphertext table
(message_ciphertexts). The old user-scoped signed_prekeys/one_time_prekeys
tables and users.identity_public_key/registration_id columns are left in
place (unused going forward) for backward compatibility / rollback safety —
drop them in a later migration once the multi-device rollout is confirmed
stable.
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "multi_device_001"
down_revision: Union[str, None] = "rbac_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_id", sa.Integer, nullable=False),
        sa.Column("device_name", sa.String(120), nullable=True),
        sa.Column("identity_public_key", sa.Text, nullable=False),
        sa.Column("registration_id", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "device_id", name="uix_user_device"),
    )

    op.create_table(
        "device_signed_prekeys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("key_id", sa.Integer, nullable=False),
        sa.Column("public_key", sa.Text, nullable=False),
        sa.Column("signature", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "device_one_time_prekeys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("key_id", sa.Integer, nullable=False),
        sa.Column("public_key", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("device_id", "key_id", name="uix_device_prekey"),
    )

    op.create_table(
        "message_ciphertexts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("recipient_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("recipient_device_id", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("msg_type", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Messages.content/msg_type become optional now that multi-device
    # conversations store ciphertexts in message_ciphertexts instead.
    op.alter_column("messages", "content", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("messages", "content", existing_type=sa.Text(), nullable=False)
    op.drop_table("message_ciphertexts")
    op.drop_table("device_one_time_prekeys")
    op.drop_table("device_signed_prekeys")
    op.drop_table("devices")
