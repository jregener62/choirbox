from typing import Optional
from sqlmodel import SQLModel, Field


class UserLabel(SQLModel, table=True):
    __tablename__ = "user_labels"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    dropbox_path: str = Field(max_length=1000)
    label_id: int = Field(foreign_key="labels.id", index=True)
