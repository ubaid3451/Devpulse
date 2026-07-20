"""Add is_archived to posts

Revision ID: REPLACE_WITH_NEW_ID
Revises: c44ab2f9dc3a
Create Date: 2026-07-17 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "REPLACE_WITH_NEW_ID"
down_revision: Union[str, None] = "c44ab2f9dc3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index(op.f("ix_posts_is_archived"), "posts", ["is_archived"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_posts_is_archived"), table_name="posts")
    op.drop_column("posts", "is_archived")