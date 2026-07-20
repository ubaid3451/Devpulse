from datetime import datetime
from pydantic import BaseModel, ConfigDict

# We need a basic user response for authors in posts/comments
class AuthorResponse(BaseModel):
    id: str
    username: str
    full_name: str
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CommentBase(BaseModel):
    content: str


class CommentCreate(CommentBase):
    pass


class CommentResponse(CommentBase):
    id: str
    post_id: str
    author_id: str
    created_at: datetime
    updated_at: datetime
    author: AuthorResponse

    model_config = ConfigDict(from_attributes=True)


class PostBase(BaseModel):
    title: str | None = None
    content: str | None = None
    image_url: str | None = None


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class LikeResponse(BaseModel):
    id: str
    user_id: str
    post_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostResponse(PostBase):
    id: str
    author_id: str
    created_at: datetime
    updated_at: datetime
    author: AuthorResponse
    likes_count: int = 0
    comments_count: int = 0
    is_liked: bool = False  # Resolved at runtime based on current user
    is_reposted: bool = False
    repost_id: str | None = None
    original_post: "PostResponse | None" = None
    is_archived: bool = False

    model_config = ConfigDict(from_attributes=True)


class PostDetailResponse(PostResponse):
    comments: list[CommentResponse] = []

PostResponse.model_rebuild()