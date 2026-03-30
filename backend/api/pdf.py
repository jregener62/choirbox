"""PDF API — upload, view and manage PDF documents for audio files."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import pdf_service
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/pdf", tags=["pdf"])


def _dropbox_pdf_path(audio_path: str, pdf_name: str, session: Session) -> str | None:
    """Build the Dropbox path for a PDF in the same folder as the audio file."""
    settings = session.get(AppSettings, 1)
    root_folder = (settings.dropbox_root_folder or "").strip("/") if settings else ""
    folder = audio_path.rsplit("/", 1)[0] if "/" in audio_path else ""
    parts = [p for p in [root_folder, folder.strip("/"), pdf_name] if p]
    return "/" + "/".join(parts) if parts else None


@router.get("/info")
def pdf_info(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    pdf_file, is_ref = pdf_service.resolve_pdf(path, session)
    if not pdf_file:
        return {"has_pdf": False, "original_name": None, "file_size": None, "page_count": 0, "is_ref": False}
    return {
        "has_pdf": True,
        "original_name": pdf_file.original_name,
        "file_size": pdf_file.file_size,
        "page_count": pdf_file.page_count,
        "is_ref": is_ref,
    }


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    dropbox_path: str = Form(...),
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    content = await file.read()
    original_name = file.filename or "document.pdf"

    try:
        pdf_file = pdf_service.save_pdf(
            content=content,
            dropbox_path=dropbox_path,
            original_name=original_name,
            user_id=user.id,
            session=session,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Also upload to Dropbox for backup
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_pdf_path(dropbox_path, original_name, session)
            if dbx_path:
                await dbx.upload_file(content, dbx_path)
    except Exception:
        pass  # Local upload succeeded — Dropbox backup is best-effort

    return ActionResponse.success(data={
        "original_name": pdf_file.original_name,
        "file_size": pdf_file.file_size,
    })


@router.get("/page/{page}")
def pdf_page(
    page: int,
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Serve a rendered PDF page as JPEG image (1-indexed)."""
    pdf_file, _ = pdf_service.resolve_pdf(path, session)
    if not pdf_file:
        raise HTTPException(404, "Kein PDF vorhanden")

    page_path = pdf_service.get_page_path(pdf_file, page)
    if not page_path:
        raise HTTPException(404, f"Seite {page} nicht gefunden")

    return FileResponse(
        path=str(page_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/download")
def download_pdf(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    pdf_file, _ = pdf_service.resolve_pdf(path, session)
    if not pdf_file:
        raise HTTPException(404, "Kein PDF vorhanden")

    file_path = pdf_service.get_pdf_path(pdf_file)
    if not file_path.exists():
        raise HTTPException(404, "PDF-Datei nicht gefunden")

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=pdf_file.original_name,
        content_disposition_type="inline",
    )


@router.delete("")
async def delete_pdf(
    path: str,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    pdf_file = pdf_service.get_pdf(path, session)
    if not pdf_file:
        raise HTTPException(404, "Kein PDF vorhanden")

    original_name = pdf_file.original_name

    # Delete local file + DB record
    pdf_service.delete_pdf(path, session)

    # Also delete from Dropbox
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_pdf_path(path, original_name, session)
            if dbx_path:
                await dbx.delete_file(dbx_path)
    except Exception:
        pass  # Dropbox file may not exist — that's fine

    return ActionResponse.success()
