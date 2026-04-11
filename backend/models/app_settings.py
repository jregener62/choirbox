from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class AppSettings(SQLModel, table=True):
    __tablename__ = "app_settings"
    id: int = Field(default=1, primary_key=True)
    registration_code: Optional[str] = Field(default=None, max_length=100)
    dropbox_refresh_token: Optional[str] = Field(default=None)
    dropbox_account_id: Optional[str] = Field(default=None, max_length=200)
    dropbox_account_email: Optional[str] = Field(default=None, max_length=255)
    dropbox_connected_at: Optional[datetime] = Field(default=None)
    # Gast-Zugang: TTL eines frisch erzeugten Einmal-Codes in Minuten.
    # Bereich: 15 Minuten bis 24 Stunden. Default 60.
    guest_link_ttl_minutes: int = Field(default=60)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
