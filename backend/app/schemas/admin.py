"""
Pydantic response/request schemas for the Milestone 4 admin panel.
Destination: backend/app/schemas/admin.py  (new file)
"""

from datetime import datetime
from pydantic import BaseModel


# ── Stats dashboard ───────────────────────────────────────────────────────────

class DailyCount(BaseModel):
    date: str  # "YYYY-MM-DD"
    count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_posts: int
    active_posts: int
    archived_posts: int
    total_likes: int
    total_comments: int
    new_signups_7d: int
    new_signups_30d: int
    signups_per_day: list[DailyCount]   # last 30 days
    posts_per_day: list[DailyCount]     # last 30 days


# ── User management ───────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    avatar_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserListResponse(BaseModel):
    items: list[AdminUserOut]
    total: int
    skip: int
    limit: int


# ── Post management ───────────────────────────────────────────────────────────

class AdminPostOut(BaseModel):
    id: str
    title: str | None
    content: str | None
    image_url: str | None
    author_id: str
    author_username: str
    is_archived: bool
    likes_count: int
    comments_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class AdminPostListResponse(BaseModel):
    items: list[AdminPostOut]
    total: int
    skip: int
    limit: int


class AdminUserRoleUpdate(BaseModel):
    role: str  # "user" or "admin"


class AdminPostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    is_archived: bool | None = None