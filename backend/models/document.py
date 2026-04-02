"""Document model — folder-level documents (PDF, Video, TXT)."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_path: str = Field(max_length=1000, index=True)
    file_type: str = Field(max_length=10)  # 'pdf', 'video', 'txt'
    filename: Optional[str] = Field(default=None, max_length=500)
    original_name: str = Field(max_length=500)
    file_size: int = Field(default=0)
    page_count: int = Field(default=0)
    sort_order: int = Field(default=0)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
