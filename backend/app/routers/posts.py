from fastapi import APIRouter, Depends, HTTPException, Query, status, File, Form, UploadFile
from sqlalchemy import select, desc, delete
import os
import uuid
import shutil
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.post import Post, Comment, Like
from app.models.user import User
from app.models.follow import Follow
from app.schemas.post import (
    PostCreate, PostUpdate, PostResponse,
    CommentCreate, CommentResponse, PostDetailResponse
)

router = APIRouter(prefix="/posts", tags=["posts"])


def _post_to_dict(post: Post, current_user_id: str) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "author_id": post.author_id,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author": post.author,
        "likes_count": len(post.likes),
        "comments_count": len(post.comments),
        "is_liked": any(like.user_id == current_user_id for like in post.likes),
        "is_reposted": any(repost.author_id == current_user_id for repost in post.reposts),
        "repost_id": post.repost_id,
        "original_post": post.original_post,
        "image_url": post.image_url,
        "is_archived": post.is_archived,
    }


@router.get("", response_model=list[PostResponse])
def get_posts(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    username: str | None = None,
    include_archived: bool = Query(False, description="Only relevant when username == current user; shows their archived posts too"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    query = (
        select(Post)
        .options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.comments),
            joinedload(Post.original_post).joinedload(Post.author),
            joinedload(Post.reposts)
        )
        .order_by(desc(Post.created_at))
    )

    if username:
        target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        is_own_profile = target_user.id == current_user.id
        if target_user.is_private and not is_own_profile:
            is_follower = db.execute(
                select(Follow).where(
                    Follow.follower_id == current_user.id,
                    Follow.following_id == target_user.id,
                )
            ).scalar_one_or_none()
            if not is_follower:
                # Private account, viewer doesn't follow them — return no
                # posts rather than a 403, so the profile page can still
                # render (bio, follower counts, the "Request to Follow"
                # button) while the post list itself stays empty.
                return []

        query = query.join(User, Post.author_id == User.id).where(User.username == username)

    # Archived posts are hidden from feeds by default. Only show them when
    # explicitly requested AND the requester is viewing their own profile —
    # nobody should see another user's archived posts.
    show_archived = include_archived and username is not None and username == current_user.username
    if not show_archived:
        query = query.where(Post.is_archived.is_(False))

    query = query.offset(skip).limit(limit)
    posts = db.execute(query).unique().scalars().all()

    response = []
    for post in posts:
        # Filter out orphaned reposts where the original post was deleted
        # but the database cascade didn't run (e.g. SQLite without PRAGMA foreign_keys=ON)
        if post.repost_id is not None and post.original_post is None:
            continue

        response.append(_post_to_dict(post, current_user.id))

    return response


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    title: str | None = Form(None),
    content: str | None = Form(None),
    image: UploadFile = File(None)
):
    image_url = None
    if image:
        # Save to local uploads directory (backend/uploads)
        uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        ext = os.path.splitext(image.filename)[1] if image.filename else ""
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(uploads_dir, filename)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"http://localhost:8000/uploads/{filename}"

    post = Post(
        title=title,
        content=content,
        image_url=image_url,
        author_id=current_user.id
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "image_url": post.image_url,
        "author_id": post.author_id,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author": post.author,
        "likes_count": 0,
        "comments_count": 0,
        "is_liked": False,
        "is_reposted": False,
        "repost_id": post.repost_id,
        "original_post": post.original_post,
        "is_archived": post.is_archived,
    }


@router.get("/{post_id}", response_model=PostDetailResponse)
def get_post(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    query = (
        select(Post)
        .options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.comments).joinedload(Comment.author),
            joinedload(Post.original_post).joinedload(Post.author),
            joinedload(Post.reposts)
        )
        .where(Post.id == post_id)
    )
    post = db.execute(query).unique().scalar_one_or_none()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Archived posts are only visible to their owner
    if post.is_archived and post.author_id != current_user.id:
        raise HTTPException(status_code=404, detail="Post not found")

    return {
        **_post_to_dict(post, current_user.id),
        "comments": sorted(post.comments, key=lambda c: c.created_at)
    }


@router.put("/{post_id}", response_model=PostResponse)
def update_post(
    post_id: str,
    post_in: PostUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(
        select(Post)
        .options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.comments),
            joinedload(Post.original_post).joinedload(Post.author),
            joinedload(Post.reposts)
        )
        .where(Post.id == post_id)
    ).unique().scalar_one_or_none()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this post")

    if post_in.title is not None:
        post.title = post_in.title
    if post_in.content is not None:
        post.content = post_in.content

    db.commit()
    db.refresh(post)

    return _post_to_dict(post, current_user.id)


@router.post("/{post_id}/archive", response_model=PostResponse)
def archive_post(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(
        select(Post)
        .options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.comments),
            joinedload(Post.original_post).joinedload(Post.author),
            joinedload(Post.reposts)
        )
        .where(Post.id == post_id)
    ).unique().scalar_one_or_none()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to archive this post")

    post.is_archived = True
    db.commit()
    db.refresh(post)

    return _post_to_dict(post, current_user.id)


@router.post("/{post_id}/unarchive", response_model=PostResponse)
def unarchive_post(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(
        select(Post)
        .options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.comments),
            joinedload(Post.original_post).joinedload(Post.author),
            joinedload(Post.reposts)
        )
        .where(Post.id == post_id)
    ).unique().scalar_one_or_none()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to unarchive this post")

    post.is_archived = False
    db.commit()
    db.refresh(post)

    return _post_to_dict(post, current_user.id)


@router.post("/{post_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(
    post_id: str,
    comment_in: CommentCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(select(Post).where(Post.id == post_id)).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = Comment(
        content=comment_in.content,
        author_id=current_user.id,
        post_id=post.id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return comment


@router.post("/{post_id}/like", status_code=status.HTTP_200_OK)
def toggle_like(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(select(Post).where(Post.id == post_id)).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing_like = db.execute(
        select(Like).where(Like.post_id == post_id, Like.user_id == current_user.id)
    ).scalar_one_or_none()

    if existing_like:
        db.delete(existing_like)
        db.commit()
        return {"liked": False}
    else:
        new_like = Like(post_id=post_id, user_id=current_user.id)
        db.add(new_like)
        db.commit()
        return {"liked": True}


@router.post("/{post_id}/repost", status_code=status.HTTP_200_OK)
def toggle_repost(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    original = db.execute(select(Post).where(Post.id == post_id)).scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Post not found")

    existing_repost = db.execute(
        select(Post).where(Post.repost_id == post_id, Post.author_id == current_user.id)
    ).scalar_one_or_none()

    if existing_repost:
        db.delete(existing_repost)
        db.commit()
        return {"reposted": False}
    else:
        post = Post(
            title=None,
            content=None,
            author_id=current_user.id,
            repost_id=post_id
        )
        db.add(post)
        db.commit()
        return {"reposted": True}


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    post = db.execute(select(Post).where(Post.id == post_id)).scalar_one_or_none()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    # Explicitly delete all reposts of this post
    # This ensures reposts are removed even if the database doesn't enforce ON DELETE CASCADE
    db.execute(delete(Post).where(Post.repost_id == post_id))

    db.delete(post)
    db.commit()