"""Document model — folder-level documents (PDF, Video, TXT)."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_path: str = Field(max_length=1000, index=True)
    file_type: str = Field(max_length=10)  # 'pdf', 'video', 'txt'
    original_name: str = Field(max_length=500)
    file_size: int = Field(default=0)
    page_count: int = Field(default=0)
    content_hash: Optional[str] = Field(default=None, max_length=64)
    dropbox_path: Optional[str] = Field(default=None, max_length=1000)
    # Stabile Dropbox-File-ID (Format "id:<hash>"). Wird ueber Rename und Move
    # hinweg von Dropbox beibehalten und ist der primaere Anker fuer den Sync.
    dropbox_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    sort_order: int = Field(default=0)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
