"""Section model — named time ranges for tracks, with optional lyrics."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Section(SQLModel, table=True):
    __tablename__ = "sections"
    id: Optional[int] = Field(default=None, primary_key=True)
    dropbox_path: str = Field(max_length=1000, index=True)
    label: str = Field(max_length=50)
    color: str = Field(max_length=7)
    start_time: float
    end_time: float
    lyrics: Optional[str] = Field(default=None)
    sort_order: int = Field(default=0)
    created_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
