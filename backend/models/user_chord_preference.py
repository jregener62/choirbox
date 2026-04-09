"""UserChordPreference — per-user transposition preference for chord sheet documents."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class UserChordPreference(SQLModel, table=True):
    __tablename__ = "user_chord_preferences"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    document_id: int = Field(foreign_key="documents.id", index=True)
    transposition_semitones: int = Field(default=0)  # -12 to +12
    updated_at: datetime = Field(default_factory=datetime.utcnow)
