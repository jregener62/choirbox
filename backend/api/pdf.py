"""PDF API — upload, view and manage PDF documents for audio files."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import pdf_service

router = APIRouter(prefix="/pdf", tags=["pdf"])


@router.get("/info")
def pdf_info(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    pdf_file, is_ref = pdf_service.resolve_pdf(path, session)
    if not pdf_file:
        return {"has_pdf": False, "original_name": None, "file_size": None, "is_ref": False}
    return {
        "has_pdf": True,
        "original_name": pdf_file.original_name,
        "file_size": pdf_file.file_size,
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
    try:
        pdf_file = pdf_service.save_pdf(
            content=content,
            dropbox_path=dropbox_path,
            original_name=file.filename or "document.pdf",
            user_id=user.id,
            session=session,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return ActionResponse.success(data={
        "original_name": pdf_file.original_name,
        "file_size": pdf_file.file_size,
    })


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
def delete_pdf(
    path: str,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    deleted = pdf_service.delete_pdf(path, session)
    if not deleted:
        raise HTTPException(404, "Kein PDF vorhanden")
    return ActionResponse.success()
