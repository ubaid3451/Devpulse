"""Add blocks table

Revision ID: REPLACE_WITH_NEW_ID
Revises: REPLACE_WITH_YOUR_CURRENT_HEAD
Create Date: 2026-07-23 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "blocks_001"
down_revision: Union[str, None] = "follow_requests_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "blocks",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("blocker_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("blocked_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uix_blocker_blocked"),
    )


def downgrade() -> None:
    op.drop_table("blocks")