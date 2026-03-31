from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, UniqueConstraint


class Annotation(SQLModel, table=True):
    __tablename__ = "annotations"
    __table_args__ = (
        UniqueConstraint("user_id", "dropbox_path", "page_number"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000, index=True)
    page_number: int
    strokes_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
