"""
Milestone 4 admin panel router.
Destination: backend/app/routers/admin.py

All endpoints require an authenticated admin (AdminUser dependency).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import AdminUser
from app.models.user import User
from app.models.post import Post, Comment, Like
from app.schemas.admin import (
    AdminStatsResponse,
    DailyCount,
    AdminUserOut,
    AdminUserRoleUpdate,
    AdminUserListResponse,
    AdminPostOut,
    AdminPostListResponse,
    AdminPostUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Stats dashboard ───────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(admin: AdminUser, db: Session = Depends(get_db)):
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

    # Signups per day, last 30 days
    signup_rows = (
        db.query(func.date(User.created_at).label("day"), func.count(User.id).label("count"))
        .filter(User.created_at >= since_30d)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )
    signups_per_day = [DailyCount(date=str(row.day), count=row.count) for row in signup_rows]

    # Posts per day, last 30 days
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
    admin: AdminUser,
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
        items=[AdminUserOut.model_validate(u) for u in users],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/users/{user_id}/block", response_model=AdminUserOut)
def block_user(user_id: str, admin: AdminUser, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot block your own account")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Admins cannot block other admins")

    user.is_active = False
    db.commit()
    db.refresh(user)
    return AdminUserOut.model_validate(user)


@router.patch("/users/{user_id}/unblock", response_model=AdminUserOut)
def unblock_user(user_id: str, admin: AdminUser, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return AdminUserOut.model_validate(user)


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def update_user_role(user_id: str, payload: AdminUserRoleUpdate, admin: AdminUser, db: Session = Depends(get_db)):
    if payload.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'user' or 'admin'")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    user.role = payload.role
    db.commit()
    db.refresh(user)
    return AdminUserOut.model_validate(user)


# ── Post management ───────────────────────────────────────────────────────────

@router.get("/posts", response_model=AdminPostListResponse)
def list_posts(
    admin: AdminUser,
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
def edit_post(post_id: str, payload: AdminPostUpdate, admin: AdminUser, db: Session = Depends(get_db)):
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
def delete_post(post_id: str, admin: AdminUser, db: Session = Depends(get_db)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    db.delete(post)
    db.commit()
    return {"ok": True, "deleted_post_id": post_id}