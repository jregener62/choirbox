from typing import Optional
from sqlmodel import SQLModel, Field


class UserLabel(SQLModel, table=True):
    __tablename__ = "user_labels"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)  # Cache fuer Anzeige
    # Phase 4: stabiler Anker — Dropbox-File-ID der Datei. Survives Renames.
    target_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    label_id: int = Field(foreign_key="labels.id", index=True)
