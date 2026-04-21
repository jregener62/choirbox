"""Document service — store and retrieve folder-level documents (PDF, Video, TXT).

PDFs are NOT stored on the server. They are fetched from Dropbox on demand,
rendered in memory via PyMuPDF, and cached in RAM (bytes + rendered JPEGs).
"""

import time
import threading
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Optional

import fitz  # PyMuPDF
import httpx
from sqlmodel import Session, select

from backend.models.document import Document
from backend.models.user import User
from backend.models.user_chord_preference import UserChordPreference
from backend.models.user_hidden_document import UserHiddenDocument
from backend.models.user_selected_document import UserSelectedDocument
from backend.utils.dropbox_paths import dropbox_folder_path

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TXT_SIZE = 2 * 1024 * 1024   # 2 MB
PAGE_RENDER_DPI = 200

DOCUMENT_EXTENSIONS = {
    "pdf": (".pdf",),
    "video": (".webm", ".mov"),
    "txt": (".txt",),
    "cho": (".cho",),
    "rtf": (".rtf",),
}

ALL_DOC_EXTENSIONS = tuple(
    ext for exts in DOCUMENT_EXTENSIONS.values() for ext in exts
)

# --- PDF Bytes Cache (TTL-based) ---
# Caches raw PDF bytes fetched from Dropbox, keyed by document ID.
# Avoids re-downloading the same PDF for every page request.
_pdf_cache: dict[int, tuple[bytes, float]] = {}
_pdf_cache_lock = threading.Lock()
_PDF_CACHE_TTL = 30 * 60  # 30 minutes
_PDF_CACHE_MAX = 20        # max documents in cache


def _get_cached_pdf(doc_id: int) -> bytes | None:
    with _pdf_cache_lock:
        entry = _pdf_cache.get(doc_id)
        if entry and time.time() - entry[1] < _PDF_CACHE_TTL:
            return entry[0]
        if entry:
            del _pdf_cache[doc_id]
    return None


def _put_cached_pdf(doc_id: int, data: bytes) -> None:
    with _pdf_cache_lock:
        # Evict oldest entries if at capacity
        while len(_pdf_cache) >= _PDF_CACHE_MAX:
            oldest_key = min(_pdf_cache, key=lambda k: _pdf_cache[k][1])
            del _pdf_cache[oldest_key]
        _pdf_cache[doc_id] = (data, time.time())


def _clear_cached_pdf(doc_id: int) -> None:
    with _pdf_cache_lock:
        _pdf_cache.pop(doc_id, None)


# --- Text Cache (txt, cho) ---
# Keyed by (doc_id, content_hash). Hash-based invalidation means a stale
# entry simply never matches once the folder-sync writes the new hash to
# the Document row — no TTL needed.
_text_cache: dict[int, tuple[str, str, float]] = {}
_text_cache_lock = threading.Lock()
_TEXT_CACHE_MAX = 100


def _get_cached_text(doc_id: int, content_hash: str | None) -> str | None:
    if not content_hash:
        return None
    with _text_cache_lock:
        entry = _text_cache.get(doc_id)
        if entry and entry[1] == content_hash:
            return entry[0]
    return None


def _put_cached_text(doc_id: int, content: str, content_hash: str | None) -> None:
    if not content_hash:
        return
    with _text_cache_lock:
        while len(_text_cache) >= _TEXT_CACHE_MAX:
            oldest_key = min(_text_cache, key=lambda k: _text_cache[k][2])
            del _text_cache[oldest_key]
        _text_cache[doc_id] = (content, content_hash, time.time())


def _clear_cached_text(doc_id: int) -> None:
    with _text_cache_lock:
        _text_cache.pop(doc_id, None)


# --- Rendered JPEG Page Cache (LRU) ---
@lru_cache(maxsize=128)
def _render_page_from_bytes(doc_id: int, page: int, pdf_hash: str) -> bytes | None:
    """Render a single PDF page from cached bytes. The pdf_hash parameter
    ensures the LRU cache invalidates when the PDF content changes."""
    pdf_bytes = _get_cached_pdf(doc_id)
    if not pdf_bytes:
        return None
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if page < 1 or page > len(doc):
        doc.close()
        return None
    zoom = PAGE_RENDER_DPI / 72
    pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    data = pix.tobytes(output="jpeg", jpg_quality=85)
    doc.close()
    return data


def render_page(doc_id: int, page: int, content_hash: str) -> bytes | None:
    """Render a PDF page as JPEG. Uses memory cache for both PDF bytes and rendered pages."""
    return _render_page_from_bytes(doc_id, page, content_hash or "")


def clear_render_cache() -> None:
    _render_page_from_bytes.cache_clear()


# --- File type detection ---

def detect_file_type(filename: str) -> Optional[str]:
    lower = filename.lower()
    for ftype, exts in DOCUMENT_EXTENSIONS.items():
        if lower.endswith(exts):
            return ftype
    return None


# --- PDF registration (no disk storage) ---

def build_dropbox_path(folder_path: str, name: str) -> str:
    """Build relative Dropbox path: folder_path/name.

    folder_path is the .tx folder path itself (e.g. '/Song.song/texte.tx').
    """
    return f"{folder_path.strip('/')}/{name}"


def register_pdf(
    content: bytes,
    folder_path: str,
    original_name: str,
    user_id: str,
    session: Session,
    content_hash: str | None = None,
    dropbox_path: str | None = None,
    dropbox_file_id: str | None = None,
    song_id: int | None = None,
) -> Document:
    """Validate a PDF, count pages, and register in DB. No local file storage."""
    if len(content) > MAX_PDF_SIZE:
        raise ValueError("PDF zu gross (max. 10 MB)")
    header = content[:1024]
    if b"%PDF-" not in header:
        raise ValueError("Ungueltige Datei — nur PDF erlaubt")

    doc = fitz.open(stream=content, filetype="pdf")
    page_count = len(doc)
    doc.close()

    document = Document(
        folder_path=folder_path,
        file_type="pdf",
        original_name=original_name,
        file_size=len(content),
        page_count=page_count,
        content_hash=content_hash,
        dropbox_path=dropbox_path or build_dropbox_path(folder_path, original_name),
        dropbox_file_id=dropbox_file_id,
        song_id=song_id,
        uploaded_by=user_id,
    )
    session.add(document)
    session.commit()
    session.refresh(document)

    # Pre-populate the bytes cache so first page render is fast
    _put_cached_pdf(document.id, content)

    return document


def register_document(
    folder_path: str,
    file_type: str,
    original_name: str,
    file_size: int,
    user_id: str,
    session: Session,
    content_hash: str | None = None,
    dropbox_path: str | None = None,
    dropbox_file_id: str | None = None,
    song_id: int | None = None,
) -> Document:
    """Register a non-PDF document (video/txt) — metadata only."""
    document = Document(
        folder_path=folder_path,
        file_type=file_type,
        original_name=original_name,
        file_size=file_size,
        content_hash=content_hash,
        dropbox_path=dropbox_path or build_dropbox_path(folder_path, original_name),
        dropbox_file_id=dropbox_file_id,
        song_id=song_id,
        uploaded_by=user_id,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def auto_select_if_first_doc(
    doc: Document, texte_folder_path: str, user_id: str, session: Session
) -> None:
    """Set `doc` as the user's selected document for the parent song
    if it's the only document in the Texte folder and the user has no
    existing selection yet.

    Called after a successful upload/paste to ensure the first text/chord
    sheet uploaded to a song is automatically picked as the default view.
    """
    doc_count = len(session.exec(
        select(Document).where(Document.folder_path == texte_folder_path)
    ).all())
    if doc_count != 1:
        return
    song_path = texte_folder_path.rsplit("/", 1)[0]
    existing = session.exec(
        select(UserSelectedDocument).where(
            UserSelectedDocument.user_id == user_id,
            UserSelectedDocument.folder_path == song_path,
        )
    ).first()
    if existing:
        return
    session.add(UserSelectedDocument(
        user_id=user_id,
        folder_path=song_path,
        song_id=doc.song_id,
        document_id=doc.id,
    ))
    session.commit()


def update_document_hash(
    doc: Document, content_hash: str, file_size: int,
    session: Session, page_count: int | None = None,
) -> None:
    """Update a document's hash and metadata after a Dropbox change."""
    doc.content_hash = content_hash
    doc.file_size = file_size
    if page_count is not None:
        doc.page_count = page_count
    session.add(doc)
    session.commit()
    # Invalidate caches
    _clear_cached_pdf(doc.id)
    _clear_cached_text(doc.id)
    clear_render_cache()


# --- Queries ---

def get_document(doc_id: int, session: Session) -> Optional[Document]:
    return session.get(Document, doc_id)


def list_documents(
    folder_path: str, user_id: str, session: Session
) -> list[dict]:
    """List all documents in a folder with hidden status per user.

    Matches both path variants (with/without leading slash) to be robust
    against historic inconsistencies in how folder_path was stored — the
    Browse-endpoint uses the same OR-query pattern.
    """
    stripped = folder_path.lstrip("/")
    docs = session.exec(
        select(Document)
        .where(
            (Document.folder_path == folder_path) | (Document.folder_path == stripped)
        )
        .order_by(Document.sort_order, Document.original_name)
    ).all()

    hidden_ids = set()
    if docs:
        hidden = session.exec(
            select(UserHiddenDocument.document_id).where(
                UserHiddenDocument.user_id == user_id,
                UserHiddenDocument.document_id.in_([d.id for d in docs]),
            )
        ).all()
        hidden_ids = set(hidden)

    return [
        {
            "id": d.id,
            "file_type": d.file_type,
            "original_name": d.original_name,
            "file_size": d.file_size,
            "page_count": d.page_count,
            "sort_order": d.sort_order,
            "hidden": d.id in hidden_ids,
        }
        for d in docs
    ]


# --- Delete ---

def delete_document(doc_id: int, session: Session) -> bool:
    document = session.get(Document, doc_id)
    if not document:
        return False

    # Clear memory caches
    _clear_cached_pdf(doc_id)
    _clear_cached_text(doc_id)
    clear_render_cache()

    # FK-abhaengige User-Daten aufraeumen — bei aktivem PRAGMA foreign_keys=ON
    # wuerde session.delete(document) sonst mit FOREIGN KEY constraint failed
    # abbrechen. delete_document wird ab Phase 2 NICHT mehr bei Renames
    # aufgerufen (das ID-Matching im Sync absorbiert die), sondern nur noch bei
    # echten Datei-Loeschungen — daher ist das Mitloeschen aller User-Daten
    # hier semantisch korrekt.
    from backend.models.annotation import Annotation

    for h in session.exec(
        select(UserHiddenDocument).where(UserHiddenDocument.document_id == doc_id)
    ).all():
        session.delete(h)

    for s in session.exec(
        select(UserSelectedDocument).where(UserSelectedDocument.document_id == doc_id)
    ).all():
        session.delete(s)

    for c in session.exec(
        select(UserChordPreference).where(UserChordPreference.document_id == doc_id)
    ).all():
        session.delete(c)

    for a in session.exec(
        select(Annotation).where(Annotation.document_id == doc_id)
    ).all():
        session.delete(a)

    session.delete(document)
    session.commit()
    return True


def delete_documents_for_folder(folder_path: str, session: Session) -> int:
    """Delete all documents for a folder. Returns count of deleted docs."""
    docs = session.exec(
        select(Document).where(Document.folder_path == folder_path)
    ).all()
    count = 0
    for doc in docs:
        delete_document(doc.id, session)
        count += 1
    return count


# --- Hide/Unhide ---

def hide_document(user_id: str, doc_id: int, session: Session) -> None:
    existing = session.exec(
        select(UserHiddenDocument).where(
            UserHiddenDocument.user_id == user_id,
            UserHiddenDocument.document_id == doc_id,
        )
    ).first()
    if not existing:
        session.add(UserHiddenDocument(user_id=user_id, document_id=doc_id))
        session.commit()


def unhide_document(user_id: str, doc_id: int, session: Session) -> None:
    existing = session.exec(
        select(UserHiddenDocument).where(
            UserHiddenDocument.user_id == user_id,
            UserHiddenDocument.document_id == doc_id,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()


# ---------------------------------------------------------------------------
# Dropbox Sync + Folder Resolution
# ---------------------------------------------------------------------------

async def find_reserved_child(
    parent_path: str, reserved_type: str, user: User, session: Session
) -> str | None:
    """Find a reserved subfolder by type inside the given choir-relative path."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import get_reserved_type

    dbx = get_dropbox_service(session)
    if not dbx:
        return None

    dropbox_path = dropbox_folder_path(parent_path, user, session)
    try:
        entries = await dbx.list_folder(dropbox_path)
        for e in entries:
            if e.get(".tag") == "folder" and get_reserved_type(e.get("name", "")) == reserved_type:
                return parent_path.rstrip("/") + "/" + e.get("name", "")
    except Exception:
        pass
    return None


async def resolve_texte_folder(
    folder_path: str, user: User, session: Session
) -> str | None:
    """Resolve the Texte folder path from any related path.

    - folder_path IS the Texte folder -> return as-is
    - folder_path is Audio/Videos/Multitrack -> go up to parent, find Texte sibling
    - folder_path is .song or plain -> look for Texte child
    """
    from backend.services.folder_types import get_parent_folder_type

    folder_type = get_parent_folder_type(folder_path)

    if folder_type == "texte":
        return folder_path

    if folder_type in ("audio", "multitrack", "videos"):
        parent = folder_path.rsplit("/", 1)[0] if "/" in folder_path else ""
        return await find_reserved_child(parent, "texte", user, session)

    return await find_reserved_child(folder_path, "texte", user, session)


async def sync_documents_from_dropbox(
    folder_path: str, user: User, session: Session
) -> None:
    """Sync Dropbox .tx folder with documents DB.

    folder_path is the .tx folder path (e.g. '/Song.song/texte.tx').

    Matching erfolgt primaer ueber dropbox_file_id (stabil ueber Rename/Move),
    sekundaer ueber Name (Backfill-Pfad fuer Documents, die noch keine ID haben).
    """
    from backend.services import song_service
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import get_song_folder_path

    try:
        dbx = get_dropbox_service(session)
        if not dbx:
            return

        # --- songs-Tabelle pflegen: passender .song-Eltern-Ordner ---
        song_path = get_song_folder_path(folder_path)
        song_id_for_docs: int | None = None
        if song_path:
            song_dropbox_path = dropbox_folder_path(song_path, user, session)
            song_meta = await dbx.get_metadata(song_dropbox_path)
            song_file_id = song_meta.get("id") if song_meta else None
            song = song_service.upsert_song(session, song_path, song_file_id)
            song_id_for_docs = song.id

        # Scan the .tx folder directly
        tx_folder = dropbox_folder_path(folder_path, user, session)
        texte_entries = []
        try:
            texte_entries = await dbx.list_folder(tx_folder)
        except Exception:
            pass  # Folder may not exist yet

        entries = [
            e for e in texte_entries
            if e.get(".tag") == "file" and detect_file_type(e.get("name", ""))
        ]

        # Pfad-Variante mit/ohne leading slash beide akzeptieren — historische
        # Inkonsistenzen kommen vor; der Browse-Endpoint nutzt dasselbe Muster.
        folder_path_stripped = folder_path.lstrip("/")
        all_in_folder = session.exec(
            select(Document).where(
                (Document.folder_path == folder_path)
                | (Document.folder_path == folder_path_stripped)
            )
        ).all()
        by_id: dict[str, Document] = {
            d.dropbox_file_id: d for d in all_in_folder if d.dropbox_file_id
        }
        by_name: dict[str, Document] = {d.original_name: d for d in all_in_folder}

        matched_doc_ids: set[int] = set()
        matched_dbx_ids: set[str] = set()

        for entry in entries:
            name = entry.get("name", "")
            file_type = detect_file_type(name)
            if not file_type:
                continue

            dbx_hash = entry.get("content_hash")
            dbx_size = entry.get("size", 0)
            dbx_id = entry.get("id")
            rel_path = build_dropbox_path(folder_path, name)

            doc = by_id.get(dbx_id) if dbx_id else None

            # Fallback: Suche im gesamten Choir nach derselben file_id (Datei
            # wurde aus einem anderen Texte-Ordner per Move hierher verschoben)
            if not doc and dbx_id:
                doc = session.exec(
                    select(Document).where(Document.dropbox_file_id == dbx_id)
                ).first()

            # Letzter Fallback: Name-Match im selben Folder (Backfill: Document
            # existiert noch ohne file_id, weil Sync vor Phase 2 lief)
            if not doc:
                doc = by_name.get(name)
                if doc and doc.dropbox_file_id and doc.dropbox_file_id != dbx_id:
                    # Name-Kollision aber andere file_id -> kein Match, behandle wie neu
                    doc = None

            if doc:
                matched_doc_ids.add(doc.id)
                if dbx_id:
                    matched_dbx_ids.add(dbx_id)

                changed = False
                if not doc.dropbox_file_id and dbx_id:
                    doc.dropbox_file_id = dbx_id
                    changed = True
                if doc.original_name != name:
                    doc.original_name = name
                    changed = True
                if doc.folder_path != folder_path:
                    doc.folder_path = folder_path
                    changed = True
                if doc.dropbox_path != rel_path:
                    doc.dropbox_path = rel_path
                    changed = True
                if song_id_for_docs and doc.song_id != song_id_for_docs:
                    doc.song_id = song_id_for_docs
                    changed = True
                if changed:
                    session.add(doc)
                    session.commit()

                if doc.content_hash == dbx_hash:
                    continue

                if file_type == "pdf":
                    try:
                        link = await dbx.get_temporary_link(tx_folder.rstrip("/") + "/" + name)
                        async with httpx.AsyncClient() as client:
                            resp = await client.get(link)
                            resp.raise_for_status()
                        pdf = fitz.open(stream=resp.content, filetype="pdf")
                        page_count = len(pdf)
                        pdf.close()
                        update_document_hash(
                            doc, dbx_hash, dbx_size, session, page_count=page_count,
                        )
                    except Exception:
                        session.rollback()
                else:
                    update_document_hash(doc, dbx_hash, dbx_size, session)
                continue

            # --- New file -> register ---
            # Parallele Sync-Laeufe fuer denselben Folder koennen hier kollidieren
            # (UNIQUE constraint auf dropbox_file_id). Nach IntegrityError muss die
            # Session per rollback() wieder nutzbar gemacht werden, sonst kippt die
            # nachgelagerte list_documents-Query mit PendingRollbackError um.
            if file_type == "pdf":
                try:
                    link = await dbx.get_temporary_link(tx_folder.rstrip("/") + "/" + name)
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(link)
                        resp.raise_for_status()
                    new_doc = register_pdf(
                        content=resp.content,
                        folder_path=folder_path,
                        original_name=name,
                        user_id=user.id,
                        session=session,
                        content_hash=dbx_hash,
                        dropbox_path=rel_path,
                        dropbox_file_id=dbx_id,
                        song_id=song_id_for_docs,
                    )
                    matched_doc_ids.add(new_doc.id)
                    if dbx_id:
                        matched_dbx_ids.add(dbx_id)
                except Exception:
                    session.rollback()
            else:
                new_doc = register_document(
                    folder_path=folder_path,
                    file_type=file_type,
                    original_name=name,
                    file_size=dbx_size,
                    user_id=user.id,
                    session=session,
                    content_hash=dbx_hash,
                    dropbox_path=rel_path,
                    dropbox_file_id=dbx_id,
                    song_id=song_id_for_docs,
                )
                matched_doc_ids.add(new_doc.id)
                if dbx_id:
                    matched_dbx_ids.add(dbx_id)

        # --- Files removed from Dropbox -> delete from DB ---
        # Grace-Period: Frisch angelegte Documents (z.B. ueber paste-text/Upload)
        # haben ein Zeitfenster, in dem Dropbox' `list_folder` die neue Datei
        # noch nicht zurueckgibt (Eventual Consistency). Ohne Schutz wuerde der
        # gleich folgende Sync das Doc faelschlich loeschen.
        grace_cutoff = datetime.utcnow() - timedelta(seconds=60)
        for doc in all_in_folder:
            if doc.id in matched_doc_ids:
                continue
            if doc.dropbox_file_id and doc.dropbox_file_id in matched_dbx_ids:
                # Wenn die file_id noch irgendwo (auch in einem anderen Folder)
                # gematcht wurde, ist es ein Move — nicht loeschen.
                continue
            if doc.created_at > grace_cutoff:
                continue  # Zu frisch — Dropbox ist noch nicht konsistent.
            delete_document(doc.id, session)

    except Exception:
        session.rollback()  # Sync failure must never block listing
