"""Add is_private to users and follow_requests table

Revision ID: REPLACE_WITH_NEW_ID
Revises: REPLACE_WITH_YOUR_CURRENT_HEAD
Create Date: 2026-07-21 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "follow_requests_001"
down_revision: Union[str, None] = "signal_protocol_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "follow_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("requester_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.Enum("pending", "accepted", "rejected", name="follow_request_status_enum"), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("requester_id", "target_id", name="uix_requester_target"),
    )


def downgrade() -> None:
    op.drop_table("follow_requests")
    op.execute("DROP TYPE IF EXISTS follow_request_status_enum")
    op.drop_column("users", "is_private")