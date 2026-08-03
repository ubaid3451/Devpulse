"""
Milestone 4 admin panel router — with RBAC permission gating.

Roles:
  superadmin  — full access to everything, can manage roles & permissions
  admin       — limited to what superadmin grants via admin_permissions table
  user        — no admin access

Endpoint permission map:
  GET  /admin/stats                  → CanViewStats
  GET  /admin/users                  → CanViewUsers
  PATCH /admin/users/{id}/block      → CanManageUsers
  PATCH /admin/users/{id}/unblock    → CanManageUsers
  PATCH /admin/users/{id}/role       → SuperAdminUser only
  GET  /admin/users/{id}/permissions → SuperAdminUser only
  PUT  /admin/users/{id}/permissions → SuperAdminUser only
  GET  /admin/posts                  → CanViewPosts
  PATCH /admin/posts/{id}            → CanEditPosts
  DELETE /admin/posts/{id}           → CanDeletePosts
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, delete as sa_delete
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import (
    AdminUser,
    SuperAdminUser,
    CanViewStats,
    CanViewUsers,
    CanManageUsers,
    CanViewPosts,
    CanEditPosts,
    CanDeletePosts,
)
from app.models.user import User
from app.models.post import Post, Comment, Like
from app.models.admin_permission import AdminPermission, VALID_PERMISSIONS
from app.schemas.admin import (
    AdminStatsResponse,
    DailyCount,
    AdminUserOut,
    AdminUserRoleUpdate,
    AdminUserListResponse,
    AdminPostOut,
    AdminPostListResponse,
    AdminPostUpdate,
    AdminPermissionOut,
    AdminPermissionUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"])
settings = get_settings()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_permissions(db: Session, user_id: str) -> list[str]:
    """Return all permission keys granted to an admin user."""
    rows = db.execute(
        select(AdminPermission.permission).where(AdminPermission.user_id == user_id)
    ).scalars().all()
    return list(rows)


def _build_user_out(u: User, db: Session) -> AdminUserOut:
    perms = _user_permissions(db, u.id) if u.role == "admin" else []
    return AdminUserOut(
        id=u.id,
        email=u.email,
        username=u.username,
        full_name=u.full_name,
        role=u.role,
        is_active=u.is_active,
        is_verified=u.is_verified,
        avatar_url=u.avatar_url,
        created_at=u.created_at,
        permissions=perms,
    )


def _is_protected(user: User) -> bool:
    """Return True if this account must not be demoted (superadmin protected accounts)."""
    return user.email.lower() in settings.admin_emails_list or user.role == "superadmin"


# ── Stats dashboard ───────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(admin: CanViewStats, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_posts = db.query(func.count(Post.id)).scalar() or 0
    active_posts = db.query(func.count(Post.id)).filter(Post.is_archived.is_(False)).scalar() or 0
    archived_posts = db.query(func.count(Post.id)).filter(Post.is_archived.is_(True)).scalar() or 0
    total_likes = db.query(func.count(Like.id)).scalar() or 0
    total_comments = db.query(func.count(Comment.id)).scalar() or 0

    new_signups_7d = db.query(func.count(User.id)).filter(User.created_at >= since_7d).scalar() or 0
    new_signups_30d = db.query(func.count(User.id)).filter(User.created_at >= since_30d).scalar() or 0

    signup_rows = (
        db.query(func.date(User.created_at).label("day"), func.count(User.id).label("count"))
        .filter(User.created_at >= since_30d)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )
    signups_per_day = [DailyCount(date=str(row.day), count=row.count) for row in signup_rows]

    post_rows = (
        db.query(func.date(Post.created_at).label("day"), func.count(Post.id).label("count"))
        .filter(Post.created_at >= since_30d)
        .group_by(func.date(Post.created_at))
        .order_by(func.date(Post.created_at))
        .all()
    )
    posts_per_day = [DailyCount(date=str(row.day), count=row.count) for row in post_rows]

    return AdminStatsResponse(
        total_users=total_users,
        total_posts=total_posts,
        active_posts=active_posts,
        archived_posts=archived_posts,
        total_likes=total_likes,
        total_comments=total_comments,
        new_signups_7d=new_signups_7d,
        new_signups_30d=new_signups_30d,
        signups_per_day=signups_per_day,
        posts_per_day=posts_per_day,
    )


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    admin: CanViewUsers,
    db: Session = Depends(get_db),
    search: str | None = Query(None, description="Match against email, username, or full name"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(User.email.ilike(like), User.username.ilike(like), User.full_name.ilike(like))
        )

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    return AdminUserListResponse(
        items=[_build_user_out(u, db) for u in users],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/users/{user_id}/block", response_model=AdminUserOut)
def block_user(user_id: str, admin: CanManageUsers, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot block your own account")
    if _is_protected(user):
        raise HTTPException(status_code=403, detail="This account is protected and cannot be blocked")

    user.is_active = False
    db.commit()
    db.refresh(user)
    return _build_user_out(user, db)


@router.patch("/users/{user_id}/unblock", response_model=AdminUserOut)
def unblock_user(user_id: str, admin: CanManageUsers, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return _build_user_out(user, db)


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def update_user_role(
    user_id: str,
    payload: AdminUserRoleUpdate,
    admin: SuperAdminUser,   # only superadmin can change roles
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    if _is_protected(user):
        raise HTTPException(status_code=403, detail="This account is protected and its role cannot be changed")

    user.role = payload.role
    # If demoted to user, wipe their admin permissions
    if payload.role == "user":
        db.execute(sa_delete(AdminPermission).where(AdminPermission.user_id == user_id))

    db.commit()
    db.refresh(user)
    return _build_user_out(user, db)


# ── Permission management ─────────────────────────────────────────────────────

@router.get("/users/{user_id}/permissions", response_model=AdminPermissionOut)
def get_user_permissions(user_id: str, admin: SuperAdminUser, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return AdminPermissionOut(user_id=user_id, permissions=_user_permissions(db, user_id))


@router.put("/users/{user_id}/permissions", response_model=AdminPermissionOut)
def set_user_permissions(
    user_id: str,
    payload: AdminPermissionUpdate,
    admin: SuperAdminUser,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=400, detail="Permissions can only be set for admin-role users")

    # Validate supplied keys
    invalid = set(payload.permissions) - VALID_PERMISSIONS
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unknown permissions: {invalid}")

    # Replace all permissions for this user
    db.execute(sa_delete(AdminPermission).where(AdminPermission.user_id == user_id))
    for perm in set(payload.permissions):
        db.add(AdminPermission(id=str(uuid.uuid4()), user_id=user_id, permission=perm))

    db.commit()
    return AdminPermissionOut(user_id=user_id, permissions=list(set(payload.permissions)))


# ── Post management ───────────────────────────────────────────────────────────

@router.get("/posts", response_model=AdminPostListResponse)
def list_posts(
    admin: CanViewPosts,
    db: Session = Depends(get_db),
    search: str | None = Query(None, description="Match against title, content, or author username"),
    include_archived: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    query = db.query(Post).join(User, Post.author_id == User.id)

    if not include_archived:
        query = query.filter(Post.is_archived.is_(False))

    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(Post.title.ilike(like), Post.content.ilike(like), User.username.ilike(like))
        )

    total = query.count()
    posts = (
        query.options(joinedload(Post.author), joinedload(Post.likes), joinedload(Post.comments))
        .order_by(Post.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = [
        AdminPostOut(
            id=p.id,
            title=p.title,
            content=p.content,
            image_url=p.image_url,
            author_id=p.author_id,
            author_username=p.author.username if p.author else "Unknown",
            is_archived=p.is_archived,
            likes_count=len(p.likes),
            comments_count=len(p.comments),
            created_at=p.created_at,
        )
        for p in posts
    ]

    return AdminPostListResponse(items=items, total=total, skip=skip, limit=limit)


@router.patch("/posts/{post_id}", response_model=AdminPostOut)
def edit_post(post_id: str, payload: AdminPostUpdate, admin: CanEditPosts, db: Session = Depends(get_db)):
    post = (
        db.query(Post)
        .options(joinedload(Post.author), joinedload(Post.likes), joinedload(Post.comments))
        .filter(Post.id == post_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if payload.title is not None:
        post.title = payload.title
    if payload.content is not None:
        post.content = payload.content
    if payload.is_archived is not None:
        post.is_archived = payload.is_archived

    db.commit()
    db.refresh(post)

    return AdminPostOut(
        id=post.id,
        title=post.title,
        content=post.content,
        image_url=post.image_url,
        author_id=post.author_id,
        author_username=post.author.username if post.author else "Unknown",
        is_archived=post.is_archived,
        likes_count=len(post.likes),
        comments_count=len(post.comments),
        created_at=post.created_at,
    )


@router.delete("/posts/{post_id}")
def delete_post(post_id: str, admin: CanDeletePosts, db: Session = Depends(get_db)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    db.delete(post)
    db.commit()
    return {"ok": True, "deleted_post_id": post_id}