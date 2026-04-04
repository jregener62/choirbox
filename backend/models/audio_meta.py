from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class AudioMeta(SQLModel, table=True):
    __tablename__ = "audio_meta"
    dropbox_path: str = Field(primary_key=True, max_length=1000)
    voice_keys: Optional[str] = Field(default=None, max_length=100)
    section_keys: Optional[str] = Field(default=None, max_length=200)
    song_name: Optional[str] = Field(default=None, max_length=200)
    free_text: Optional[str] = Field(default=None, max_length=500)
    choir_id: Optional[str] = Field(default=None, foreign_key="choirs.id", index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
