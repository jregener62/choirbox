from typing import Optional
from sqlmodel import SQLModel, Field


class Label(SQLModel, table=True):
    __tablename__ = "labels"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    color: str = Field(default="#6366f1", max_length=7)  # hex color
    category: Optional[str] = Field(default=None, max_length=50)  # e.g. "Stimme", "Status"
    sort_order: int = Field(default=0)
