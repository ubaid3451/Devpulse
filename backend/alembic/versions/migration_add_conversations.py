"""Add conversations and migrate messages to conversation-based chats.

Revision ID: c44ab2f9dc3a
Revises: 837d7bc28bd8
Create Date: 2026-07-16 00:00:00.000000
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c44ab2f9dc3a"
down_revision: Union[str, None] = "837d7bc28bd8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("is_group", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "conversation_participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("conversation_id", "user_id", name="uix_conversation_user"),
    )
    op.create_index(op.f("ix_conversation_participants_conversation_id"), "conversation_participants", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_conversation_participants_user_id"), "conversation_participants", ["user_id"], unique=False)

    op.add_column("messages", sa.Column("conversation_id", sa.String(length=36), nullable=True))

    conn = op.get_bind()
    messages_t = sa.table(
        "messages",
        sa.column("id", sa.String),
        sa.column("sender_id", sa.String),
        sa.column("receiver_id", sa.String),
        sa.column("conversation_id", sa.String),
    )
    conversations_t = sa.table(
        "conversations",
        sa.column("id", sa.String),
        sa.column("is_group", sa.Boolean),
        sa.column("name", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    participants_t = sa.table(
        "conversation_participants",
        sa.column("id", sa.String),
        sa.column("conversation_id", sa.String),
        sa.column("user_id", sa.String),
        sa.column("joined_at", sa.DateTime),
    )

    rows = conn.execute(sa.text("SELECT DISTINCT sender_id, receiver_id FROM messages")).fetchall()
    pair_to_conversation_id: dict[tuple[str, str], str] = {}
    now = datetime.now(timezone.utc)

    for sender_id, receiver_id in rows:
        key = tuple(sorted((sender_id, receiver_id)))
        if key in pair_to_conversation_id:
            continue

        conversation_id = str(uuid.uuid4())
        pair_to_conversation_id[key] = conversation_id

        conn.execute(
            conversations_t.insert().values(
                id=conversation_id,
                is_group=False,
                name=None,
                created_at=now,
            )
        )

        for uid in {sender_id, receiver_id}:
            conn.execute(
                participants_t.insert().values(
                    id=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=uid,
                    joined_at=now,
                )
            )

    for (a, b), conversation_id in pair_to_conversation_id.items():
        conn.execute(
            messages_t.update()
            .where(
                sa.or_(
                    sa.and_(messages_t.c.sender_id == a, messages_t.c.receiver_id == b),
                    sa.and_(messages_t.c.sender_id == b, messages_t.c.receiver_id == a),
                )
            )
            .values(conversation_id=conversation_id)
        )

    # NOTE: no need to drop the receiver_id foreign key constraint by name here —
    # its name was auto-generated back in migration 548ee9c48c31 and we don't
    # know it. op.drop_column() below drops the column AND any constraints that
    # depend on it (Postgres does this automatically), so this is safe.
    op.drop_index(op.f("ix_messages_receiver_id"), table_name="messages")
    op.alter_column("messages", "conversation_id", nullable=False)
    op.create_foreign_key(
        "fk_messages_conversation_id",
        "messages",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_messages_conversation_id"), "messages", ["conversation_id"], unique=False)
    op.drop_column("messages", "receiver_id")


def downgrade() -> None:
    op.add_column("messages", sa.Column("receiver_id", sa.String(length=36), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE messages m
            SET receiver_id = (
                SELECT cp.user_id
                FROM conversation_participants cp
                WHERE cp.conversation_id = m.conversation_id
                  AND cp.user_id != m.sender_id
                LIMIT 1
            )
            """
        )
    )

    op.alter_column("messages", "receiver_id", nullable=False)
    op.create_foreign_key(
        "fk_messages_receiver_id",
        "messages",
        "users",
        ["receiver_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_messages_receiver_id"), "messages", ["receiver_id"], unique=False)

    # Same reasoning as upgrade(): drop_column takes the dependent FK constraint
    # with it, so we don't need to name fk_messages_conversation_id here even
    # though we know its name — dropping the index first, then the column, is enough.
    op.drop_index(op.f("ix_messages_conversation_id"), table_name="messages")
    op.drop_column("messages", "conversation_id")

    op.drop_table("conversation_participants")
    op.drop_table("conversations")