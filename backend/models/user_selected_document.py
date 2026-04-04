"""UserSelectedDocument model — one selected document per user per song folder."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, UniqueConstraint


class UserSelectedDocument(SQLModel, table=True):
    __tablename__ = "user_selected_documents"
    __table_args__ = (
        UniqueConstraint("user_id", "folder_path", name="uq_user_folder_selection"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    folder_path: str = Field(max_length=1000)
    document_id: int = Field(foreign_key="documents.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
