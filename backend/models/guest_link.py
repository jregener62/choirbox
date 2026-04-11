"""Guest-Link-Modell — mehrfach einloesbarer URL-Code fuer Gastzugaenge.

Ein GuestLink ist ein vom Admin/Chorleiter erzeugter Token, der unbekannten
Gaesten temporaeren Read-Only-Zugang zum Chor gibt. Der Klartext-Token wird
**nie** in der DB gespeichert — stattdessen der SHA256-Hash, damit ein
DB-Leak oder Log-Leak keine gueltigen Codes offenlegt.

Standardmaessig ist ein Link **mehrfach einloesbar** bis zum ``expires_at``
(Liederabend-Szenario: ein Link fuer alle). Ueber ``max_uses`` kann der
Admin ein Maximum setzen; ``max_uses=1`` ergibt einen klassischen
Einmal-Code (aktuell nicht aus der UI ausloesbar, aber im Service
verfuegbar — spaeter z.B. fuer Demo-Versionen mit Login als Member).

Lifecycle:
    * created_at   — beim POST /api/guest-links
    * expires_at   — created_at + ttl_minutes (aus AppSettings oder Override)
    * first_used_at — gesetzt bei der ersten erfolgreichen Einloesung
    * last_used_at — bei jeder Einloesung aktualisiert
    * revoked_at   — wenn Admin den Link manuell invalidiert

Ein Link ist "aktiv einloesbar", wenn:
    revoked_at IS NULL
    AND expires_at > NOW()
    AND (max_uses IS NULL OR uses_count < max_uses)
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

    # Freies Label zur Identifikation in der Admin-UI.
    label: Optional[str] = Field(default=None, max_length=200)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: str = Field(foreign_key="users.id", index=True)

    # Harte Deadline
    expires_at: datetime = Field(index=True)

    # Nutzungs-Modus:
    #   None   -> unbegrenzt einloesbar (Multi-Use, Default)
    #   1      -> Einmal-Code (Legacy-Modus)
    #   N > 1  -> bis zu N Einloesungen
    max_uses: Optional[int] = Field(default=None)
    uses_count: int = Field(default=0)

    # Erste und letzte Einloesung (fuer Admin-Ansicht). Nach der ersten
    # Einloesung wird first_used_at nicht mehr ueberschrieben; last_used_*
    # wird bei jeder Einloesung aktualisiert.
    first_used_at: Optional[datetime] = Field(default=None)
    last_used_at: Optional[datetime] = Field(default=None)
    last_used_ip: Optional[str] = Field(default=None, max_length=64)
    last_used_ua: Optional[str] = Field(default=None, max_length=255)

    # Manuelle Invalidierung durch Admin — stoppt alle weiteren
    # Einloesungen, laesst aber bereits ausgestellte Gast-Sessions bis
    # zum Ablauf ihrer 2h-TTL weiterlaufen.
    revoked_at: Optional[datetime] = Field(default=None)
