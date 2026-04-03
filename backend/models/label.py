from typing import Optional
from sqlmodel import SQLModel, Field


class Label(SQLModel, table=True):
    __tablename__ = "labels"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    color: str = Field(default="#6366f1", max_length=7)  # hex color
    category: Optional[str] = Field(default=None, max_length=50)  # e.g. "Stimme", "Status"
    choir_id: Optional[str] = Field(default=None, foreign_key="choirs.id", index=True)
    sort_order: int = Field(default=0)
    shortcode: Optional[str] = Field(default=None, max_length=10)  # Kuerzel fuer Dateinamen ("S", "A", "Git")
    aliases: Optional[str] = Field(default=None, max_length=200)  # Komma-getrennt ("soprano,sop")
