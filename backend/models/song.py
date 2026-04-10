"""Song model — stabiler Anker fuer einen .song-Ordner.

Dropbox-Ordner haben (genau wie Dateien) eine stabile id im Format
"id:<base64>", die ueber Rename und Move hinweg gleich bleibt. Diese Tabelle
speichert pro choir-relativem .song-Ordner:

- die Dropbox-File-ID (stabiler Schluessel)
- den aktuellen folder_path (Cache, wird beim Sync aktualisiert)
- einen status: 'active' (Ordner existiert in Dropbox) oder 'orphan' (Ordner
  weg, aber User-Daten zeigen noch hin — Admin entscheidet ueber Aufraeumen)

Sections und Documents zeigen per song_id auf diese Tabelle, damit sie einen
Folder-Rename in Dropbox absorbieren koennen, ohne ihre Inhalte zu verlieren.
"""

from typing import Optional
from datetime import datetime

from sqlmodel import SQLModel, Field


class Song(SQLModel, table=True):
    __tablename__ = "songs"

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_path: str = Field(max_length=1000, index=True)
    name: str = Field(max_length=500)
    dropbox_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    status: str = Field(default="active", max_length=10)  # 'active' | 'orphan'
    updated_at: datetime = Field(default_factory=datetime.utcnow)
