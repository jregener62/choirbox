"""Documents API — upload, view and manage folder-level documents."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.choir import Choir
from backend.models.user import User
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import document_service
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/documents", tags=["documents"])


def _dropbox_doc_path(folder_path: str, doc_name: str, user: User, session: Session) -> str | None:
    """Build the Dropbox path for a document in the given folder."""
    settings = session.get(AppSettings, 1)
    app_root = (settings.dropbox_root_folder or "").strip("/") if settings else ""
    choir_root = ""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            choir_root = (choir.dropbox_root_folder or "").strip("/")
    root_parts = [p for p in [app_root, choir_root] if p]
    root_folder = "/".join(root_parts)
    parts = [p for p in [root_folder, folder_path.strip("/"), doc_name] if p]
    return "/" + "/".join(parts) if parts else None


@router.get("/list")
async def list_documents(
    folder: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    # Auto-sync: register Dropbox documents not yet in DB
    await _sync_documents_from_dropbox(folder, user, session)

    docs = document_service.list_documents(folder, user.id, session)
    return {"documents": docs}


async def _sync_documents_from_dropbox(
    folder_path: str, user: User, session: Session
) -> None:
    """Check Dropbox for document files and register any missing ones in the DB."""
    try:
        dbx = get_dropbox_service(session)
        if not dbx:
            return

        settings = session.get(AppSettings, 1)
        app_root = (settings.dropbox_root_folder or "").strip("/") if settings else ""
        choir_root = ""
        if user.choir_id:
            choir = session.get(Choir, user.choir_id)
            if choir:
                choir_root = (choir.dropbox_root_folder or "").strip("/")
        root_parts = [p for p in [app_root, choir_root] if p]
        root_folder = "/".join(root_parts)
        dbx_folder = "/" + "/".join(p for p in [root_folder, folder_path.strip("/")] if p)

        entries = await dbx.list_folder(dbx_folder)

        # Get already registered document names for this folder
        from backend.models.document import Document
        existing_names = {
            d.original_name
            for d in session.exec(
                select(Document).where(Document.folder_path == folder_path)
            ).all()
        }

        for entry in entries:
            if entry.get(".tag") != "file":
                continue
            name = entry.get("name", "")
            file_type = document_service.detect_file_type(name)
            if not file_type or name in existing_names:
                continue

            # Register missing document
            if file_type == "pdf":
                # Download PDF to store locally and count pages
                try:
                    link = await dbx.get_temporary_link(
                        dbx_folder.rstrip("/") + "/" + name
                    )
                    import httpx
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(link)
                        resp.raise_for_status()
                        document_service.save_pdf(
                            content=resp.content,
                            folder_path=folder_path,
                            original_name=name,
                            user_id=user.id,
                            session=session,
                        )
                except Exception:
                    pass  # Skip PDFs that can't be downloaded
            else:
                # Video/TXT — just register, no local storage needed
                document_service.save_document(
                    folder_path=folder_path,
                    file_type=file_type,
                    original_name=name,
                    file_size=entry.get("size", 0),
                    user_id=user.id,
                    session=session,
                )
    except Exception:
        pass  # Sync failure should never block document listing


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder_path: str = Form(...),
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    original_name = file.filename or "document"
    file_type = document_service.detect_file_type(original_name)
    if not file_type:
        raise HTTPException(400, "Nicht unterstuetztes Dateiformat")

    content = await file.read()

    if file_type == "pdf":
        try:
            doc = document_service.save_pdf(
                content=content,
                folder_path=folder_path,
                original_name=original_name,
                user_id=user.id,
                session=session,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif file_type == "txt":
        if len(content) > document_service.MAX_TXT_SIZE:
            raise HTTPException(400, "Textdatei zu gross (max. 2 MB)")
        doc = document_service.save_document(
            folder_path=folder_path,
            file_type=file_type,
            original_name=original_name,
            file_size=len(content),
            user_id=user.id,
            session=session,
        )
    else:
        # Video — just register, file stays in Dropbox
        doc = document_service.save_document(
            folder_path=folder_path,
            file_type=file_type,
            original_name=original_name,
            file_size=len(content),
            user_id=user.id,
            session=session,
        )

    # Upload to Dropbox
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_doc_path(folder_path, original_name, user, session)
            if dbx_path:
                await dbx.upload_file(content, dbx_path)
    except Exception:
        pass  # Dropbox backup is best-effort

    return ActionResponse.success(data={
        "id": doc.id,
        "original_name": doc.original_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
    })


@router.get("/{doc_id}/page/{page}")
def document_page(
    doc_id: int,
    page: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Render and serve a PDF page as JPEG image (1-indexed)."""
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "pdf":
        raise HTTPException(404, "Kein PDF vorhanden")

    data = document_service.render_page(doc.filename, page)
    if not data:
        raise HTTPException(404, f"Seite {page} nicht gefunden")

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    if doc.file_type == "pdf" and doc.filename:
        file_path = document_service.get_pdf_path(doc)
        if not file_path.exists():
            raise HTTPException(404, "PDF-Datei nicht gefunden")
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=doc.original_name,
            content_disposition_type="inline",
        )

    raise HTTPException(400, "Download nur fuer PDFs verfuegbar. Videos/TXT ueber Dropbox streamen.")


@router.get("/{doc_id}/stream")
async def stream_document(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Get a temporary Dropbox link for streaming video/txt content."""
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = _dropbox_doc_path(doc.folder_path, doc.original_name, user, session)
    if not dbx_path:
        raise HTTPException(500, "Dropbox-Pfad konnte nicht ermittelt werden")

    try:
        link = await dbx.get_temporary_link(dbx_path)
        return {"link": link}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.get("/{doc_id}/content")
async def get_text_content(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Get the text content of a TXT document via Dropbox."""
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "txt":
        raise HTTPException(404, "Kein Textdokument")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = _dropbox_doc_path(doc.folder_path, doc.original_name, user, session)
    if not dbx_path:
        raise HTTPException(500, "Dropbox-Pfad konnte nicht ermittelt werden")

    try:
        link = await dbx.get_temporary_link(dbx_path)
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(link)
            resp.raise_for_status()
            return {"content": resp.text}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: int,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    original_name = doc.original_name
    folder_path = doc.folder_path

    document_service.delete_document(doc_id, session)

    # Also delete from Dropbox
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_doc_path(folder_path, original_name, user, session)
            if dbx_path:
                await dbx.delete_file(dbx_path)
    except Exception:
        pass

    return ActionResponse.success()


@router.post("/{doc_id}/hide")
def hide_document(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    document_service.hide_document(user.id, doc_id, session)
    return ActionResponse.success()


@router.delete("/{doc_id}/hide")
def unhide_document(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    document_service.unhide_document(user.id, doc_id, session)
    return ActionResponse.success()
