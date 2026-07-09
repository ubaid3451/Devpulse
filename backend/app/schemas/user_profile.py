from pydantic import BaseModel

class UserProfileUpdate(BaseModel):
    bio: str | None = None
    avatar_url: str | None = None
    full_name: str | None = None
