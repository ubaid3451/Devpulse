"""Add superadmin to user_role_enum and create admin_permissions table

Revision ID: rbac_001
Revises: blocks_001
Create Date: 2026-08-03 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "rbac_001"
down_revision: Union[str, None] = "blocks_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    # ── 1. Add 'superadmin' to the user_role_enum PostgreSQL enum ─────────────
    # PostgreSQL requires ALTER TYPE to add new enum values.
    op.execute("ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'superadmin'")

    # ── 2. Create admin_permissions table ─────────────────────────────────────
    op.create_table(
        "admin_permissions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("permission", sa.String(length=50), nullable=False),
        sa.UniqueConstraint("user_id", "permission", name="uq_admin_perm_user_perm"),
    )


def downgrade() -> None:
    op.drop_table("admin_permissions")
    # Note: PostgreSQL does not support removing enum values without recreating the type.
    # Downgrade leaves 'superadmin' in the enum but removes the table.
