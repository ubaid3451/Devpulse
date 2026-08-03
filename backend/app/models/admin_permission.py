"""
AdminPermission model — stores granular permission grants for admin users.
Each row grants one named permission to one user.
"""

import uuid
from sqlalchemy import String, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User

# All valid permission keys
VALID_PERMISSIONS = {
    "view_users",
    "manage_users",
    "view_posts",
    "edit_posts",
    "delete_posts",
    "view_stats",
}


class AdminPermission(Base):
    """
    Grants a single permission to an admin user.
    Superadmins bypass this table entirely — they have all permissions implicitly.
    """

    __tablename__ = "admin_permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "permission", name="uq_admin_perm_user_perm"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission: Mapped[str] = mapped_column(String(50), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="admin_permissions")

    def __repr__(self) -> str:
        return f"<AdminPermission user_id={self.user_id!r} permission={self.permission!r}>"
