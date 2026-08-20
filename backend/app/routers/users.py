from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.user import User
from app.models.follow import Follow
from app.models.follow_request import FollowRequest
from app.models.block import Block
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


@router.get("/explore")
def explore_users(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    q: str | None = Query(None),
):
    blocked_subquery = select(Block.blocked_id).where(Block.blocker_id == current_user.id).union(
        select(Block.blocker_id).where(Block.blocked_id == current_user.id)
    )

    base_query = select(User).where(
        User.id != current_user.id,
        User.id.notin_(blocked_subquery),
    )
    if q and q.strip():
        search = f"%{q.strip()}%"
        base_query = base_query.where(
            or_(
                User.username.ilike(search),
                User.full_name.ilike(search),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = db.scalar(count_query) or 0

    users = db.execute(
        base_query.order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()

    if not users:
        return {"users": [], "total": total, "has_more": False}

    user_ids = [u.id for u in users]

    following_ids = set(
        db.execute(
            select(Follow.following_id).where(
                Follow.follower_id == current_user.id,
                Follow.following_id.in_(user_ids),
            )
        ).scalars().all()
    )

    pending_request_ids = set(
        db.execute(
            select(FollowRequest.target_id).where(
                FollowRequest.requester_id == current_user.id,
                FollowRequest.target_id.in_(user_ids),
                FollowRequest.status == "pending",
            )
        ).scalars().all()
    )

    result = [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "bio": u.bio,
            "is_private": u.is_private,
            "is_following": u.id in following_ids,
            "has_pending_request": u.id in pending_request_ids,
        }
        for u in users
    ]

    return {
        "users": result,
        "total": total,
        "has_more": skip + len(users) < total,
    }


@router.get("/me/blocked")
def get_blocked_users(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Lists users the current user has blocked."""
    blocks = db.execute(
        select(Block).where(Block.blocker_id == current_user.id).order_by(Block.created_at.desc())
    ).scalars().all()

    return [
        {
            "id": b.blocked.id,
            "username": b.blocked.username,
            "full_name": b.blocked.full_name,
            "avatar_url": b.blocked.avatar_url,
            "blocked_at": b.created_at,
        }
        for b in blocks
    ]


@router.post("/{username}/block")
def toggle_block(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """
    Toggles blocking a user. Blocking someone:
    - Removes any existing Follow relationship in EITHER direction
    - Removes any pending FollowRequest in EITHER direction
    - Prevents either user from seeing the other's posts (enforced in
      the posts router, not here)
    """
    if current_user.username == username:
        raise HTTPException(status_code=400, detail="You cannot block yourself")

    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_block = db.execute(
        select(Block).where(Block.blocker_id == current_user.id, Block.blocked_id == target_user.id)
    ).scalar_one_or_none()

    if existing_block:
        db.delete(existing_block)
        db.commit()
        return {"status": "unblocked"}

    # Remove any follow relationship in either direction.
    db.execute(
        delete(Follow).where(
            ((Follow.follower_id == current_user.id) & (Follow.following_id == target_user.id))
            | ((Follow.follower_id == target_user.id) & (Follow.following_id == current_user.id))
        )
    )
    # Remove any pending follow request in either direction.
    db.execute(
        delete(FollowRequest).where(
            ((FollowRequest.requester_id == current_user.id) & (FollowRequest.target_id == target_user.id))
            | ((FollowRequest.requester_id == target_user.id) & (FollowRequest.target_id == current_user.id))
        )
    )

    db.add(Block(blocker_id=current_user.id, blocked_id=target_user.id))
    db.commit()
    return {"status": "blocked"}


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
    is_blocked_by_me = False
    has_blocked_me = False

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

        is_blocked_by_me = db.execute(
            select(Block).where(Block.blocker_id == current_user.id, Block.blocked_id == user.id)
        ).scalar_one_or_none() is not None

        has_blocked_me = db.execute(
            select(Block).where(Block.blocker_id == user.id, Block.blocked_id == current_user.id)
        ).scalar_one_or_none() is not None

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
        "is_blocked_by_me": is_blocked_by_me,
        "has_blocked_me": has_blocked_me,
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
    if current_user.username == username:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    target_user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    is_blocked = db.execute(
        select(Block).where(
            ((Block.blocker_id == current_user.id) & (Block.blocked_id == target_user.id))
            | ((Block.blocker_id == target_user.id) & (Block.blocked_id == current_user.id))
        )
    ).scalar_one_or_none()
    if is_blocked:
        raise HTTPException(status_code=403, detail="Cannot follow this user")

    existing_follow = db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == target_user.id)
    ).scalar_one_or_none()

    if existing_follow:
        db.delete(existing_follow)
        db.commit()
        from app.services.notification_service import delete_notification_by_action
        delete_notification_by_action(
            db=db,
            recipient_id=target_user.id,
            actor_id=current_user.id,
            type="follow",
        )
        return {"status": "unfollowed"}

    if not target_user.is_private:
        new_follow = Follow(follower_id=current_user.id, following_id=target_user.id)
        db.add(new_follow)
        db.commit()
        from app.services.notification_service import create_notification
        create_notification(
            db=db,
            recipient_id=target_user.id,
            actor_id=current_user.id,
            type="follow",
        )
        return {"status": "followed"}

    existing_request = db.execute(
        select(FollowRequest).where(
            FollowRequest.requester_id == current_user.id,
            FollowRequest.target_id == target_user.id,
        )
    ).scalar_one_or_none()

    if existing_request and existing_request.status == "pending":
        db.delete(existing_request)
        db.commit()
        from app.services.notification_service import delete_notification_by_action
        delete_notification_by_action(
            db=db,
            recipient_id=target_user.id,
            actor_id=current_user.id,
            type="follow_request",
        )
        return {"status": "request_cancelled"}

    if existing_request:
        existing_request.status = "pending"
    else:
        db.add(FollowRequest(requester_id=current_user.id, target_id=target_user.id))

    db.commit()
    from app.services.notification_service import create_notification
    create_notification(
        db=db,
        recipient_id=target_user.id,
        actor_id=current_user.id,
        type="follow_request",
    )
    return {"status": "requested"}


@router.get("/me/follow-requests")
def get_incoming_follow_requests(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
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

    from app.services.notification_service import create_notification
    create_notification(
        db=db,
        recipient_id=req.requester_id,
        actor_id=current_user.id,
        type="follow",
    )
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