from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.user import User
from app.models.follow import Follow
from app.models.follow_request import FollowRequest
from app.models.signed_prekey import SignedPreKey
from app.models.one_time_prekey import OneTimePreKey
from app.schemas.user_profile import UserProfileUpdate
from app.services import cloudinary_service

router = APIRouter(prefix="/users", tags=["users"])


class OneTimePreKeyIn(BaseModel):
    key_id: int
    public_key: str


class SignedPreKeyIn(BaseModel):
    key_id: int
    public_key: str
    signature: str


class KeyBundleUpload(BaseModel):
    identity_public_key: str
    registration_id: int
    signed_prekey: SignedPreKeyIn
    one_time_prekeys: list[OneTimePreKeyIn]


class PrivacyUpdate(BaseModel):
    is_private: bool


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
    has_pending_request = False
    if current_user:
        follow_record = db.execute(
            select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == user.id)
        ).scalar_one_or_none()
        is_following = follow_record is not None

        if not is_following:
            pending = db.execute(
                select(FollowRequest).where(
                    FollowRequest.requester_id == current_user.id,
                    FollowRequest.target_id == user.id,
                    FollowRequest.status == "pending",
                )
            ).scalar_one_or_none()
            has_pending_request = pending is not None

    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "created_at": user.created_at,
        "followers_count": followers_count,
        "following_count": following_count,
        "is_following": is_following,
        "is_private": user.is_private,
        "has_pending_request": has_pending_request,
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


@router.patch("/me/privacy")
def update_privacy(
    body: PrivacyUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Toggles between public (instant follow) and private (follow requests required)."""
    current_user.is_private = body.is_private
    db.commit()
    return {"is_private": current_user.is_private}


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
        raise HTTPException(status_code=502, detail="Avatar upload failed. Please try again.")

    current_user.avatar_url = image_url
    db.commit()
    db.refresh(current_user)

    return {
        "avatar_url": image_url
    }


@router.put("/me/key-bundle")
def upload_key_bundle(
    body: KeyBundleUpload,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    current_user.identity_public_key = body.identity_public_key
    current_user.registration_id = body.registration_id

    existing_spk = db.execute(
        select(SignedPreKey).where(SignedPreKey.user_id == current_user.id)
    ).scalar_one_or_none()
    if existing_spk:
        existing_spk.key_id = body.signed_prekey.key_id
        existing_spk.public_key = body.signed_prekey.public_key
        existing_spk.signature = body.signed_prekey.signature
    else:
        db.add(SignedPreKey(
            user_id=current_user.id,
            key_id=body.signed_prekey.key_id,
            public_key=body.signed_prekey.public_key,
            signature=body.signed_prekey.signature,
        ))

    db.execute(delete(OneTimePreKey).where(OneTimePreKey.user_id == current_user.id))
    for otpk in body.one_time_prekeys:
        db.add(OneTimePreKey(user_id=current_user.id, key_id=otpk.key_id, public_key=otpk.public_key))

    db.commit()
    return {"status": "ok", "one_time_prekeys_uploaded": len(body.one_time_prekeys)}


@router.get("/{username}/key-bundle")
def get_key_bundle(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.identity_public_key or not user.registration_id:
        raise HTTPException(status_code=404, detail="This user hasn't set up encryption yet")

    signed_prekey = db.execute(
        select(SignedPreKey).where(SignedPreKey.user_id == user.id)
    ).scalar_one_or_none()
    if not signed_prekey:
        raise HTTPException(status_code=404, detail="This user hasn't set up encryption yet")

    one_time_prekey = db.execute(
        select(OneTimePreKey).where(OneTimePreKey.user_id == user.id).limit(1)
    ).scalar_one_or_none()

    bundle = {
        "identity_key": user.identity_public_key,
        "registration_id": user.registration_id,
        "signed_prekey": {
            "key_id": signed_prekey.key_id,
            "public_key": signed_prekey.public_key,
            "signature": signed_prekey.signature,
        },
        "one_time_prekey": None,
    }

    if one_time_prekey:
        bundle["one_time_prekey"] = {
            "key_id": one_time_prekey.key_id,
            "public_key": one_time_prekey.public_key,
        }
        db.delete(one_time_prekey)
        db.commit()

    return bundle


@router.post("/{username}/follow")
def toggle_follow(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """
    Public accounts: instant follow/unfollow (unchanged behavior).
    Private accounts: creates/cancels a FollowRequest instead of following
    directly. The target must separately accept it via the
    /follow-requests/{id}/accept endpoint before a Follow row is created.
    """
    if current_user.username == username:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_follow = db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == target_user.id)
    ).scalar_one_or_none()

    # Already following — unfollow works the same regardless of privacy.
    if existing_follow:
        db.delete(existing_follow)
        db.commit()
        return {"status": "unfollowed"}

    if not target_user.is_private:
        new_follow = Follow(follower_id=current_user.id, following_id=target_user.id)
        db.add(new_follow)
        db.commit()
        return {"status": "followed"}

    # Private account: toggle a pending request instead of following directly.
    existing_request = db.execute(
        select(FollowRequest).where(
            FollowRequest.requester_id == current_user.id,
            FollowRequest.target_id == target_user.id,
        )
    ).scalar_one_or_none()

    if existing_request and existing_request.status == "pending":
        # Cancel the pending request.
        db.delete(existing_request)
        db.commit()
        return {"status": "request_cancelled"}

    if existing_request:
        # A previous request was rejected/accepted-then-unfollowed — reset it to pending.
        existing_request.status = "pending"
    else:
        db.add(FollowRequest(requester_id=current_user.id, target_id=target_user.id))

    db.commit()
    return {"status": "requested"}


@router.get("/me/follow-requests")
def get_incoming_follow_requests(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Lists pending requests to follow the current user."""
    requests = db.execute(
        select(FollowRequest)
        .where(FollowRequest.target_id == current_user.id, FollowRequest.status == "pending")
        .order_by(FollowRequest.created_at.desc())
    ).scalars().all()

    return [
        {
            "id": r.id,
            "requester": {
                "id": r.requester.id,
                "username": r.requester.username,
                "full_name": r.requester.full_name,
                "avatar_url": r.requester.avatar_url,
            },
            "created_at": r.created_at,
        }
        for r in requests
    ]


@router.post("/follow-requests/{request_id}/accept")
def accept_follow_request(
    request_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    req = db.execute(select(FollowRequest).where(FollowRequest.id == request_id)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Follow request not found")
    if req.target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to respond to this request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="This request has already been responded to")

    req.status = "accepted"

    existing_follow = db.execute(
        select(Follow).where(Follow.follower_id == req.requester_id, Follow.following_id == current_user.id)
    ).scalar_one_or_none()
    if not existing_follow:
        db.add(Follow(follower_id=req.requester_id, following_id=current_user.id))

    db.commit()
    return {"status": "accepted"}


@router.post("/follow-requests/{request_id}/reject")
def reject_follow_request(
    request_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    req = db.execute(select(FollowRequest).where(FollowRequest.id == request_id)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Follow request not found")
    if req.target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to respond to this request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="This request has already been responded to")

    req.status = "rejected"
    db.commit()
    return {"status": "rejected"}


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