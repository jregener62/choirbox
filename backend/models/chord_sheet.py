"""ChordSheet model — parsed chord-over-lyrics content for songs."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class ChordSheet(SQLModel, table=True):
    __tablename__ = "chord_sheets"

    id: Optional[int] = Field(default=None, primary_key=True)
    song_folder_path: str = Field(max_length=1000, index=True)
    title: str = Field(max_length=500)
    original_key: Optional[str] = Field(default=None, max_length=20)
    parsed_content: str = Field(default="{}")  # JSON: sections with chord-positioned lines
    source_filename: Optional[str] = Field(default=None, max_length=500)
    choir_id: Optional[str] = Field(default=None, max_length=36, index=True)
    created_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
