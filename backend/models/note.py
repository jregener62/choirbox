"""Note model — per-user notes for tracks and sections."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Note(SQLModel, table=True):
    __tablename__ = "notes"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)  # Cache fuer Anzeige
    # Phase 4: stabiler Anker — Dropbox-File-ID der Datei. Renames in Dropbox
    # werden absorbiert, weil die ID gleich bleibt.
    target_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    section_id: Optional[int] = Field(default=None, foreign_key="sections.id")
    text: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
