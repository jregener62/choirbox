import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Choir(SQLModel, table=True):
    __tablename__ = "choirs"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(max_length=200)
    invite_code: str = Field(max_length=100, unique=True)
    dropbox_root_folder: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
