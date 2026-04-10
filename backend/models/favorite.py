from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)  # Cache fuer Anzeige/Suche
    file_name: str = Field(max_length=255)
    # Phase 4: stabile Anker — pro Favorit ist genau einer der drei Werte gesetzt.
    # entry_type='song'     → song_id
    # entry_type='document' → document_id
    # entry_type='audio'    → audio_file_id (Dropbox-File-ID einer Mediendatei)
    # entry_type='file'/'folder' (legacy) wird vom Code beim Lesen auf den
    # neuen Typ gemappt.
    song_id: Optional[int] = Field(default=None, foreign_key="songs.id", index=True)
    document_id: Optional[int] = Field(default=None, foreign_key="documents.id", index=True)
    audio_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    entry_type: str = Field(default="file", max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)
