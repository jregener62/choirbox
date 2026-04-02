"""Document service — store and retrieve folder-level documents (PDF, Video, TXT)."""

from functools import lru_cache
from pathlib import Path
from uuid import uuid4
from typing import Optional

import fitz  # PyMuPDF
from sqlmodel import Session, select

from backend.models.document import Document
from backend.models.user_hidden_document import UserHiddenDocument

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PDF_DIR = BASE_DIR / "data" / "pdfs"

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TXT_SIZE = 2 * 1024 * 1024   # 2 MB
PAGE_RENDER_DPI = 200

DOCUMENT_EXTENSIONS = {
    "pdf": (".pdf",),
    "video": (".mp4", ".webm", ".mov"),
    "txt": (".txt",),
}

ALL_DOC_EXTENSIONS = tuple(
    ext for exts in DOCUMENT_EXTENSIONS.values() for ext in exts
)


def ensure_pdf_dir() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)


def detect_file_type(filename: str) -> Optional[str]:
    lower = filename.lower()
    for ftype, exts in DOCUMENT_EXTENSIONS.items():
        if lower.endswith(exts):
            return ftype
    return None


def save_pdf(
    content: bytes,
    folder_path: str,
    original_name: str,
    user_id: str,
    session: Session,
) -> Document:
    if len(content) > MAX_PDF_SIZE:
        raise ValueError("PDF zu gross (max. 10 MB)")
    header = content[:1024]
    if b"%PDF-" not in header:
        raise ValueError("Ungueltige Datei — nur PDF erlaubt")

    doc = fitz.open(stream=content, filetype="pdf")
    page_count = len(doc)
    doc.close()

    filename = f"{uuid4().hex}.pdf"
    (PDF_DIR / filename).write_bytes(content)

    document = Document(
        folder_path=folder_path,
        file_type="pdf",
        filename=filename,
        original_name=original_name,
        file_size=len(content),
        page_count=page_count,
        uploaded_by=user_id,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def save_document(
    folder_path: str,
    file_type: str,
    original_name: str,
    file_size: int,
    user_id: str,
    session: Session,
) -> Document:
    """Save a non-PDF document (video/txt) — Dropbox-only, no local storage."""
    document = Document(
        folder_path=folder_path,
        file_type=file_type,
        filename=None,
        original_name=original_name,
        file_size=file_size,
        uploaded_by=user_id,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


@lru_cache(maxsize=64)
def render_page(filename: str, page: int) -> bytes | None:
    """Render a PDF page as JPEG on-the-fly. Cached in memory (LRU, 64 pages)."""
    pdf_path = PDF_DIR / filename
    if not pdf_path.exists():
        return None
    doc = fitz.open(str(pdf_path))
    if page < 1 or page > len(doc):
        doc.close()
        return None
    zoom = PAGE_RENDER_DPI / 72
    pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    data = pix.tobytes(output="jpeg", jpg_quality=85)
    doc.close()
    return data


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


def get_pdf_path(document: Document) -> Path:
    return PDF_DIR / document.filename


def delete_document(doc_id: int, session: Session) -> bool:
    document = session.get(Document, doc_id)
    if not document:
        return False

    # Delete local file for PDFs
    if document.file_type == "pdf" and document.filename:
        file_path = PDF_DIR / document.filename
        if file_path.exists():
            file_path.unlink()
        render_page.cache_clear()

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
