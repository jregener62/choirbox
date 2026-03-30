"""FileSettings model — per-file metadata like section reference."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class FileSettings(SQLModel, table=True):
    __tablename__ = "file_settings"
    dropbox_path: str = Field(primary_key=True, max_length=1000)
    section_ref_path: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
