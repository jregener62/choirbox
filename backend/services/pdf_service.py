"""PDF service — store and retrieve PDF documents for audio files."""

from functools import lru_cache
from pathlib import Path
from uuid import uuid4
from typing import Optional

import fitz  # PyMuPDF
from sqlmodel import Session, select

from backend.models.pdf_file import PdfFile
from backend.models.file_settings import FileSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PDF_DIR = BASE_DIR / "data" / "pdfs"

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
PAGE_RENDER_DPI = 200


def ensure_pdf_dir() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)


def save_pdf(
    content: bytes,
    dropbox_path: str,
    original_name: str,
    user_id: int,
    session: Session,
) -> PdfFile:
    if len(content) > MAX_PDF_SIZE:
        raise ValueError("PDF zu gross (max. 10 MB)")
    header = content[:1024]
    if b"%PDF-" not in header:
        raise ValueError("Ungueltige Datei — nur PDF erlaubt")

    doc = fitz.open(stream=content, filetype="pdf")
    page_count = len(doc)
    doc.close()

    # Delete existing PDF for this path
    existing = session.exec(
        select(PdfFile).where(PdfFile.dropbox_path == dropbox_path)
    ).first()
    if existing:
        old_path = PDF_DIR / existing.filename
        if old_path.exists():
            old_path.unlink()
        # Invalidate render cache for old file
        render_page.cache_clear()
        session.delete(existing)
        session.flush()

    filename = f"{uuid4().hex}.pdf"
    (PDF_DIR / filename).write_bytes(content)

    pdf_file = PdfFile(
        dropbox_path=dropbox_path,
        filename=filename,
        original_name=original_name,
        file_size=len(content),
        page_count=page_count,
        uploaded_by=user_id,
    )
    session.add(pdf_file)
    session.commit()
    session.refresh(pdf_file)
    return pdf_file


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


def get_pdf(dropbox_path: str, session: Session) -> Optional[PdfFile]:
    return session.exec(
        select(PdfFile).where(PdfFile.dropbox_path == dropbox_path)
    ).first()


def resolve_pdf(
    dropbox_path: str, session: Session
) -> tuple[Optional[PdfFile], bool]:
    """Resolve PDF with pdf_ref_path fallback.
    Returns (PdfFile | None, is_ref: bool)."""
    direct = get_pdf(dropbox_path, session)
    if direct:
        return direct, False

    settings = session.get(FileSettings, dropbox_path)
    if settings and settings.pdf_ref_path:
        ref_pdf = get_pdf(settings.pdf_ref_path, session)
        if ref_pdf:
            return ref_pdf, True

    return None, False


def get_pdf_path(pdf_file: PdfFile) -> Path:
    return PDF_DIR / pdf_file.filename


def delete_pdf(dropbox_path: str, session: Session) -> bool:
    pdf_file = get_pdf(dropbox_path, session)
    if not pdf_file:
        return False
    file_path = PDF_DIR / pdf_file.filename
    if file_path.exists():
        file_path.unlink()
    render_page.cache_clear()
    session.delete(pdf_file)
    session.commit()
    return True
