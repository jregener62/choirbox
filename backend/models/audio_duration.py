"""AudioDuration model — cached audio durations discovered by the frontend."""

from datetime import datetime
from sqlmodel import SQLModel, Field


class AudioDuration(SQLModel, table=True):
    __tablename__ = "audio_durations"
    dropbox_path: str = Field(primary_key=True, max_length=1000)
    duration_seconds: float
    updated_at: datetime = Field(default_factory=datetime.utcnow)
