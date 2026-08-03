from typing import Annotated, Callable

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import ACCESS_COOKIE, decode_token
from app.models.user import User
from app.models.admin_permission import AdminPermission


def get_current_user(
    access_token: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: extracts JWT from httpOnly access_token cookie,
    validates it, and returns the authenticated User.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not access_token:
        raise credentials_exc

    try:
        payload = decode_token(access_token)
    except JWTError:
        raise credentials_exc

    if payload.get("type") != "access":
        raise credentials_exc

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    result = db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exc
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is blocked",
        )

    return user

async def get_current_user_ws(token: str, db: Session) -> User:
    """Authenticates a WebSocket connection using a JWT token string."""
    try:
        payload = decode_token(token)
    except JWTError:
        raise Exception("Invalid token")
        
    if payload.get("type") != "access":
        raise Exception("Invalid token type")
        
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise Exception("User ID not found in token")
        
    result = db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        raise Exception("User not found or inactive")
        
    return user


# ── Type aliases for cleaner route signatures ──────────────────────────────────
CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(current_user: CurrentUser) -> User:
    """Dependency that requires admin or superadmin role."""
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_superadmin(current_user: CurrentUser) -> User:
    """Dependency that requires superadmin role only."""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )
    return current_user


def require_permission(permission: str) -> Callable:
    """
    Factory that returns a FastAPI dependency checking for a specific permission.
    Superadmins always pass. Admins must have the permission in admin_permissions table.
    """
    def _check(
        current_user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> User:
        # Superadmin has all permissions implicitly
        if current_user.role == "superadmin":
            return current_user
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        # Check the admin_permissions table
        grant = db.execute(
            select(AdminPermission).where(
                AdminPermission.user_id == current_user.id,
                AdminPermission.permission == permission,
            )
        ).scalar_one_or_none()
        if not grant:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required",
            )
        return current_user

    return _check


AdminUser = Annotated[User, Depends(require_admin)]
SuperAdminUser = Annotated[User, Depends(require_superadmin)]

# Permission-gated dependency aliases
CanViewStats   = Annotated[User, Depends(require_permission("view_stats"))]
CanViewUsers   = Annotated[User, Depends(require_permission("view_users"))]
CanManageUsers = Annotated[User, Depends(require_permission("manage_users"))]
CanViewPosts   = Annotated[User, Depends(require_permission("view_posts"))]
CanEditPosts   = Annotated[User, Depends(require_permission("edit_posts"))]
CanDeletePosts = Annotated[User, Depends(require_permission("delete_posts"))]
