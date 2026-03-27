import secrets
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class SessionToken(SQLModel, table=True):
    __tablename__ = "session_tokens"
    token: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        primary_key=True,
        max_length=64,
    )
    user_id: str = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
