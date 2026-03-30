"""PdfFile model — PDF documents attached to audio files."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class PdfFile(SQLModel, table=True):
    __tablename__ = "pdf_files"

    id: Optional[int] = Field(default=None, primary_key=True)
    dropbox_path: str = Field(max_length=1000, unique=True, index=True)
    filename: str = Field(max_length=500)
    original_name: str = Field(max_length=500)
    file_size: int = Field(default=0)
    page_count: int = Field(default=1)
    uploaded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
