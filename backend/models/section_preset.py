from typing import Optional
from sqlmodel import SQLModel, Field


class SectionPreset(SQLModel, table=True):
    __tablename__ = "section_presets"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    color: str = Field(default="#8b5cf6", max_length=7)
    choir_id: Optional[str] = Field(default=None, foreign_key="choirs.id", index=True)
    sort_order: int = Field(default=0)
