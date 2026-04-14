"""DraftEntry model — Pro-Member-verwaltete Draft-Markierungen.

Eintraege mit einem passenden DraftEntry sind fuer Rollen unterhalb
pro-member komplett unsichtbar (Listing, Suche, Counts). Ab Rolle
pro-member werden sie mit einem Draft-Flag annotiert und als "Entwurf"
gerendert.

kind + ref bilden einen zusammengesetzten, choir-scoped UNIQUE-Key:
  * kind="document" -> ref = Document.id (als string)
  * kind="path"     -> ref = normalisierter Dropbox-Pfad (lowercase,
                              fuehrender Slash, kein trailing Slash)
"""

from typing import Optional
from datetime import datetime

from sqlmodel import SQLModel, Field, UniqueConstraint


class DraftEntry(SQLModel, table=True):
    __tablename__ = "draft_entries"
    __table_args__ = (
        UniqueConstraint("choir_id", "kind", "ref", name="ux_draft_entries_choir_kind_ref"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    choir_id: Optional[str] = Field(default=None, foreign_key="choirs.id", index=True)
    kind: str = Field(max_length=16, index=True)
    ref: str = Field(max_length=1000, index=True)
    created_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
