from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.user import User
from app.models.follow import Follow
from app.schemas.user_profile import UserProfileUpdate
from app.services import cloudinary_service

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/search")
def search_users(
    q: str,
    db: Session = Depends(get_db)
):
    if not q or len(q.strip()) < 1:
        return []

    term = f"%{q.strip().lower()}%"
    users = db.execute(
        select(User).where(
            func.lower(User.username).like(term) | func.lower(User.full_name).like(term)
        ).limit(10)
    ).scalars().all()

    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
        }
        for u in users
    ]

@router.get("/{username}")
def get_user_profile(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    followers_count = db.scalar(select(func.count()).select_from(Follow).where(Follow.following_id == user.id)) or 0
    following_count = db.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)) or 0

    is_following = False
    if current_user:
        follow_record = db.execute(
            select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == user.id)
        ).scalar_one_or_none()
        is_following = follow_record is not None

    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "created_at": user.created_at,
        "followers_count": followers_count,
        "following_count": following_count,
        "is_following": is_following
    }


@router.patch("/me/profile")
def update_profile(
    profile_in: UserProfileUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    if profile_in.bio is not None:
        current_user.bio = profile_in.bio
    if profile_in.avatar_url is not None:
        current_user.avatar_url = profile_in.avatar_url
    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name

    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
        "bio": current_user.bio,
        "created_at": current_user.created_at
    }


@router.post("/me/avatar")
def upload_avatar(
    current_user: CurrentUser,
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        image_url = cloudinary_service.upload_avatar_image(image, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        # Cloudinary/network error — don't leak internal details to the client
        raise HTTPException(status_code=502, detail="Avatar upload failed. Please try again.")

    current_user.avatar_url = image_url
    db.commit()
    db.refresh(current_user)

    return {
        "avatar_url": image_url
    }

@router.post("/{username}/follow")
def toggle_follow(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    if current_user.username == username:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_follow = db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == target_user.id)
    ).scalar_one_or_none()

    if existing_follow:
        db.delete(existing_follow)
        db.commit()
        return {"status": "unfollowed"}
    else:
        new_follow = Follow(follower_id=current_user.id, following_id=target_user.id)
        db.add(new_follow)
        db.commit()
        return {"status": "followed"}

@router.get("/{username}/followers")
def get_followers(
    username: str,
    db: Session = Depends(get_db)
):
    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    followers = db.execute(
        select(User).join(Follow, Follow.follower_id == User.id).where(Follow.following_id == target_user.id)
    ).scalars().all()

    return [{"id": u.id, "username": u.username, "full_name": u.full_name, "avatar_url": u.avatar_url} for u in followers]

@router.get("/{username}/following")
def get_following(
    username: str,
    db: Session = Depends(get_db)
):
    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    following = db.execute(
        select(User).join(Follow, Follow.following_id == User.id).where(Follow.follower_id == target_user.id)
    ).scalars().all()

    return [{"id": u.id, "username": u.username, "full_name": u.full_name, "avatar_url": u.avatar_url} for u in following]