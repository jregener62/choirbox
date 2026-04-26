"""Document model — folder-level documents (PDF, Video, TXT)."""

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    # FK auf songs.id — verweist auf den .song-Ordner, zu dem dieses Dokument
    # gehoert. Nullable, weil Backfill und Loose-Documents (ausserhalb von
    # .song-Ordnern) noch unterstuetzt werden.
    song_id: Optional[int] = Field(default=None, foreign_key="songs.id", index=True)
    folder_path: str = Field(max_length=1000, index=True)
    file_type: str = Field(max_length=10)  # 'pdf', 'video', 'txt', 'cho', 'rtf'
    original_name: str = Field(max_length=500)
    file_size: int = Field(default=0)
    page_count: int = Field(default=0)
    content_hash: Optional[str] = Field(default=None, max_length=64)
    dropbox_path: Optional[str] = Field(default=None, max_length=1000)
    # Stabile Dropbox-File-ID (Format "id:<hash>"). Wird ueber Rename und Move
    # hinweg von Dropbox beibehalten und ist der primaere Anker fuer den Sync.
    dropbox_file_id: Optional[str] = Field(default=None, max_length=128, index=True)
    sort_order: int = Field(default=0)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Companion-PDF-System (RTF -> Auto-PDF):
    # source_doc_id zeigt vom generierten PDF auf das Quell-RTF.
    # pdf_status wird am Quell-RTF gepflegt: 'pending' waehrend Hintergrund-
    # Generierung, 'ready' wenn Companion-PDF in Dropbox liegt, 'failed' bei
    # Fehler. Companion-Documents werden in Browse-Listings ausgefiltert.
    source_doc_id: Optional[int] = Field(default=None, foreign_key="documents.id", index=True)
    pdf_status: Optional[str] = Field(default=None, max_length=10)
    annotations_stale: bool = Field(default=False)
