"""Guest-Link-Modell — Einmal-URL-Code fuer Gastzugaenge.

Ein GuestLink ist ein vom Admin/Chorleiter erzeugter Token, der einem
Unbekannten temporaeren Read-Only-Zugang zum Chor gibt. Der Klartext-
Token wird **nie** in der DB gespeichert — stattdessen der SHA256-Hash,
damit ein DB-Leak oder Log-Leak keine gueltigen Codes offenlegt.

Lifecycle:
    * created_at — beim POST /api/guest-links
    * expires_at — created_at + ttl_minutes (aus AppSettings oder Override)
    * consumed_at — beim POST /api/guest-links/redeem (one-time use!)
    * revoked_at — wenn Admin den Link manuell invalidiert

Ein Link ist "aktiv einloesbar", wenn:
    consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class GuestLink(SQLModel, table=True):
    __tablename__ = "guest_links"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Welchem Chor gibt dieser Link Zugang?
    choir_id: str = Field(foreign_key="choirs.id", index=True)

    # sha256(token) — Klartext ist NUR in der Create-Response sichtbar.
    token_hash: str = Field(unique=True, index=True, max_length=64)

    # Freies Label zur Identifikation in der Admin-UI
    # ("Probenbesuch Oktober 2026" o.ae.)
    label: Optional[str] = Field(default=None, max_length=200)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: str = Field(foreign_key="users.id", index=True)

    # Harte Deadline
    expires_at: datetime = Field(index=True)

    # Einmal-Einloesung
    consumed_at: Optional[datetime] = Field(default=None)
    consumed_by_ip: Optional[str] = Field(default=None, max_length=64)
    consumed_by_ua: Optional[str] = Field(default=None, max_length=255)

    # Manuelle Invalidierung durch Admin
    revoked_at: Optional[datetime] = Field(default=None)
