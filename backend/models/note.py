"""Note model — per-user notes for tracks and sections."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Note(SQLModel, table=True):
    __tablename__ = "notes"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)
    section_id: Optional[int] = Field(default=None, foreign_key="sections.id")
    text: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
