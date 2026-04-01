import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    username: str = Field(max_length=100, unique=True)
    display_name: str = Field(max_length=100)
    role: str = Field(default="member", max_length=50)  # guest, member, pro-member, chorleiter, admin
    voice_part: str = Field(max_length=20)  # "Sopran", "Alt", "Tenor", "Bass"
    password_hash: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    choir_id: Optional[str] = Field(default=None, foreign_key="choirs.id", index=True)
    must_change_password: bool = Field(default=False)
    last_login_at: Optional[datetime] = Field(default=None)
