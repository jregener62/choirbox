"""PDF service — store and retrieve PDF documents for audio files."""

from pathlib import Path
from uuid import uuid4
from typing import Optional

from sqlmodel import Session, select

from backend.models.pdf_file import PdfFile
from backend.models.file_settings import FileSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PDF_DIR = BASE_DIR / "data" / "pdfs"

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB


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
    if not content[:5].startswith(b"%PDF-"):
        raise ValueError("Ungueltige Datei — nur PDF erlaubt")

    # Delete existing PDF for this path
    existing = session.exec(
        select(PdfFile).where(PdfFile.dropbox_path == dropbox_path)
    ).first()
    if existing:
        old_path = PDF_DIR / existing.filename
        if old_path.exists():
            old_path.unlink()
        session.delete(existing)
        session.flush()

    filename = f"{uuid4().hex}.pdf"
    (PDF_DIR / filename).write_bytes(content)

    pdf_file = PdfFile(
        dropbox_path=dropbox_path,
        filename=filename,
        original_name=original_name,
        file_size=len(content),
        uploaded_by=user_id,
    )
    session.add(pdf_file)
    session.commit()
    session.refresh(pdf_file)
    return pdf_file


def get_pdf(dropbox_path: str, session: Session) -> Optional[PdfFile]:
    return session.exec(
        select(PdfFile).where(PdfFile.dropbox_path == dropbox_path)
    ).first()


def resolve_pdf(
    dropbox_path: str, session: Session
) -> tuple[Optional[PdfFile], bool]:
    """Resolve PDF with section_ref_path fallback.
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
    session.delete(pdf_file)
    session.commit()
    return True
