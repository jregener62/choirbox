import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Choir(SQLModel, table=True):
    __tablename__ = "choirs"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(max_length=200)
    invite_code: str = Field(max_length=100, unique=True)
    dropbox_root_folder: Optional[str] = Field(default=None, max_length=500)
    # Default-Ansichtsmodus fuer neue Mitglieder: "songs" (Vollzugriff) oder
    # "texts" (nur Texte/Noten). Admin kann pro Chor setzen — z.B. "texts"
    # waehrend einer Jam-Session-Phase, spaeter umstellen auf "songs".
    default_view_mode: str = Field(default="songs", max_length=10)
    # Anzeige-Modus fuer .cho-Dateien:
    #   "vocal"        — nur Text + Anweisungen, keine Akkorde, Akkord-Tools aus
    #   "instrumental" — volle Anzeige inkl. Akkorde (bisheriges Verhalten)
    #   "gemischt"     — User kann pro Song umschalten, alle Tools verfuegbar
    display_mode: str = Field(default="instrumental", max_length=15)
    created_at: datetime = Field(default_factory=datetime.utcnow)
