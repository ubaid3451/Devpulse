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
from app.schemas.post import (
    PostCreate, PostUpdate, PostResponse, 
    CommentCreate, CommentResponse, PostDetailResponse
)

router = APIRouter(prefix="/posts", tags=["posts"])

@router.get("", response_model=list[PostResponse])
def get_posts(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    username: str | None = None,
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
        query = query.join(User, Post.author_id == User.id).where(User.username == username)
        
    query = query.offset(skip).limit(limit)
    posts = db.execute(query).unique().scalars().all()
    
    response = []
    for post in posts:
        # Filter out orphaned reposts where the original post was deleted
        # but the database cascade didn't run (e.g. SQLite without PRAGMA foreign_keys=ON)
        if post.repost_id is not None and post.original_post is None:
            continue
            
        post_dict = {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "author_id": post.author_id,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "author": post.author,
            "likes_count": len(post.likes),
            "comments_count": len(post.comments),
            "is_liked": any(like.user_id == current_user.id for like in post.likes),
            "is_reposted": any(repost.author_id == current_user.id for repost in post.reposts),
            "repost_id": post.repost_id,
            "original_post": post.original_post,
            "image_url": post.image_url
        }
        response.append(post_dict)
        
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
        "repost_id": post.repost_id,
        "original_post": post.original_post
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
        "is_liked": any(like.user_id == current_user.id for like in post.likes),
        "is_reposted": any(repost.author_id == current_user.id for repost in post.reposts),
        "repost_id": post.repost_id,
        "original_post": post.original_post,
        "image_url": post.image_url,
        "comments": sorted(post.comments, key=lambda c: c.created_at)
    }


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
