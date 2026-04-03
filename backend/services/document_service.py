"""Document service — store and retrieve folder-level documents (PDF, Video, TXT).

PDFs are NOT stored on the server. They are fetched from Dropbox on demand,
rendered in memory via PyMuPDF, and cached in RAM (bytes + rendered JPEGs).
"""

import time
import threading
from functools import lru_cache
from typing import Optional

import fitz  # PyMuPDF
from sqlmodel import Session, select

from backend.models.document import Document
from backend.models.user_hidden_document import UserHiddenDocument

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TXT_SIZE = 2 * 1024 * 1024   # 2 MB
PAGE_RENDER_DPI = 200

DOCUMENT_EXTENSIONS = {
    "pdf": (".pdf",),
    "video": (".webm", ".mov"),
    "txt": (".txt",),
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
) -> Document:
    """Register a non-PDF document (video/txt) — metadata only."""
    document = Document(
        folder_path=folder_path,
        file_type=file_type,
        original_name=original_name,
        file_size=file_size,
        content_hash=content_hash,
        dropbox_path=dropbox_path or build_dropbox_path(folder_path, original_name),
        uploaded_by=user_id,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


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
    clear_render_cache()


# --- Queries ---

def get_document(doc_id: int, session: Session) -> Optional[Document]:
    return session.get(Document, doc_id)


def list_documents(
    folder_path: str, user_id: str, session: Session
) -> list[dict]:
    """List all documents in a folder with hidden status per user."""
    docs = session.exec(
        select(Document)
        .where(Document.folder_path == folder_path)
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
    clear_render_cache()

    # Delete hidden document entries
    hidden = session.exec(
        select(UserHiddenDocument).where(
            UserHiddenDocument.document_id == doc_id
        )
    ).all()
    for h in hidden:
        session.delete(h)

    # Delete annotations for this document
    from backend.models.annotation import Annotation
    annotations = session.exec(
        select(Annotation).where(Annotation.document_id == doc_id)
    ).all()
    for a in annotations:
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
