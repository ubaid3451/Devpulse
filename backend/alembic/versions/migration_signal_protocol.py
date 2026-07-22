"""Add Signal Protocol key bundle tables (identity key, signed prekey, one-time prekeys)

Revision ID: REPLACE_WITH_NEW_ID
Revises: REPLACE_WITH_YOUR_CURRENT_HEAD
Create Date: 2026-07-21 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "signal_protocol_001"
down_revision: Union[str, None] = "archived_posts_001"  # must match the revision id you set in step 2
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Identity key + registration id live directly on the user — every device
    # would normally get its own, but this project treats "one browser" as
    # the whole identity (see the E2EE limitations note).
    op.add_column("users", sa.Column("identity_public_key", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("registration_id", sa.Integer(), nullable=True))

    # Signed pre-key: one active at a time, rotated periodically in a full
    # implementation. We store just the current one.
    op.create_table(
        "signed_prekeys",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("key_id", sa.Integer(), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # One-time pre-keys: a batch is generated and uploaded; each is consumed
    # (deleted) the first time someone starts a session using it.
    op.create_table(
        "one_time_prekeys",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("key_id", sa.Integer(), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "key_id", name="uix_user_prekey"),
    )

    # Messages now carry a Signal Protocol envelope: `content` becomes the
    # base64 ciphertext body, `msg_type` distinguishes the first message in a
    # session (PreKeyWhisperMessage, type 3) from subsequent ones
    # (WhisperMessage, type 1). The old `iv` column from the simpler ECDH
    # scheme is no longer used by Signal Protocol — the ratchet handles this
    # internally — so we drop it.
    op.add_column("messages", sa.Column("msg_type", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "msg_type")

    op.drop_table("one_time_prekeys")
    op.drop_table("signed_prekeys")

    op.drop_column("users", "registration_id")
    op.drop_column("users", "identity_public_key")