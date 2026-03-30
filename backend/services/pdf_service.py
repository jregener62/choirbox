"""PDF service — store and retrieve PDF documents for audio files."""

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
PAGE_RENDER_DPI = 200  # Good quality for mobile pinch-to-zoom


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

    # Count pages
    doc = fitz.open(stream=content, filetype="pdf")
    page_count = len(doc)
    doc.close()

    # Delete existing PDF for this path
    existing = session.exec(
        select(PdfFile).where(PdfFile.dropbox_path == dropbox_path)
    ).first()
    if existing:
        _delete_files(existing.filename)
        session.delete(existing)
        session.flush()

    filename = f"{uuid4().hex}.pdf"
    (PDF_DIR / filename).write_bytes(content)

    # Pre-render pages as JPEG
    _render_pages(filename, content)

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


def _render_pages(filename: str, content: bytes) -> None:
    """Render all PDF pages as JPEG images."""
    stem = filename.rsplit(".", 1)[0]
    doc = fitz.open(stream=content, filetype="pdf")
    zoom = PAGE_RENDER_DPI / 72
    matrix = fitz.Matrix(zoom, zoom)
    for i in range(len(doc)):
        pix = doc[i].get_pixmap(matrix=matrix)
        pix.save(str(PDF_DIR / f"{stem}_p{i + 1}.jpg"))
    doc.close()


def _delete_files(filename: str) -> None:
    """Delete PDF file and all rendered page images."""
    stem = filename.rsplit(".", 1)[0]
    pdf_path = PDF_DIR / filename
    if pdf_path.exists():
        pdf_path.unlink()
    for img in PDF_DIR.glob(f"{stem}_p*.jpg"):
        img.unlink()


def get_page_path(pdf_file: PdfFile, page: int) -> Path | None:
    """Get the path to a rendered page image (1-indexed)."""
    stem = pdf_file.filename.rsplit(".", 1)[0]
    path = PDF_DIR / f"{stem}_p{page}.jpg"
    return path if path.exists() else None


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
    _delete_files(pdf_file.filename)
    session.delete(pdf_file)
    session.commit()
    return True
