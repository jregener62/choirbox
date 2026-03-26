from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)
    file_name: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
