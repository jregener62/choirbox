"""Documents API — upload, view and manage folder-level documents."""

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.choir import Choir
from backend.models.document import Document
from backend.models.user import User
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import document_service
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/documents", tags=["documents"])


def _get_root_folder(user: User, session: Session) -> str:
    """Build the Dropbox root folder from app settings + choir."""
    settings = session.get(AppSettings, 1)
    app_root = (settings.dropbox_root_folder or "").strip("/") if settings else ""
    choir_root = ""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            choir_root = (choir.dropbox_root_folder or "").strip("/")
    parts = [p for p in [app_root, choir_root] if p]
    return "/".join(parts)


def _dropbox_doc_path(folder_path: str, doc_name: str, user: User, session: Session) -> str:
    """Build the full Dropbox path for a document."""
    root = _get_root_folder(user, session)
    parts = [p for p in [root, folder_path.strip("/"), doc_name] if p]
    return "/" + "/".join(parts)


def _dropbox_folder_path(folder_path: str, user: User, session: Session) -> str:
    """Build the full Dropbox path for a folder."""
    root = _get_root_folder(user, session)
    parts = [p for p in [root, folder_path.strip("/")] if p]
    return "/" + "/".join(parts)


# ---------------------------------------------------------------------------
# List + Dropbox Sync
# ---------------------------------------------------------------------------

@router.get("/list")
async def list_documents(
    folder: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    await _sync_documents_from_dropbox(folder, user, session)
    docs = document_service.list_documents(folder, user.id, session)
    return {"documents": docs}


async def _sync_documents_from_dropbox(
    folder_path: str, user: User, session: Session
) -> None:
    """Sync Dropbox folder with documents DB: register new, update changed (by content_hash)."""
    try:
        dbx = get_dropbox_service(session)
        if not dbx:
            return

        dbx_folder = _dropbox_folder_path(folder_path, user, session)
        entries = await dbx.list_folder(dbx_folder)

        # Build lookup of existing documents by name
        existing = {
            d.original_name: d
            for d in session.exec(
                select(Document).where(Document.folder_path == folder_path)
            ).all()
        }

        for entry in entries:
            if entry.get(".tag") != "file":
                continue
            name = entry.get("name", "")
            file_type = document_service.detect_file_type(name)
            if not file_type:
                continue

            dbx_hash = entry.get("content_hash")
            dbx_size = entry.get("size", 0)
            doc = existing.get(name)

            if doc and doc.content_hash == dbx_hash:
                continue  # Unchanged

            if doc and doc.content_hash != dbx_hash:
                # --- File changed in Dropbox → update ---
                if file_type == "pdf":
                    try:
                        link = await dbx.get_temporary_link(dbx_folder.rstrip("/") + "/" + name)
                        async with httpx.AsyncClient() as client:
                            resp = await client.get(link)
                            resp.raise_for_status()
                        import fitz
                        pdf = fitz.open(stream=resp.content, filetype="pdf")
                        page_count = len(pdf)
                        pdf.close()
                        document_service.update_document_hash(
                            doc, dbx_hash, dbx_size, session, page_count=page_count,
                        )
                    except Exception:
                        pass
                else:
                    document_service.update_document_hash(doc, dbx_hash, dbx_size, session)
                continue

            # --- New file → register ---
            if file_type == "pdf":
                try:
                    link = await dbx.get_temporary_link(dbx_folder.rstrip("/") + "/" + name)
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(link)
                        resp.raise_for_status()
                    document_service.register_pdf(
                        content=resp.content,
                        folder_path=folder_path,
                        original_name=name,
                        user_id=user.id,
                        session=session,
                        content_hash=dbx_hash,
                    )
                except Exception:
                    pass
            else:
                document_service.register_document(
                    folder_path=folder_path,
                    file_type=file_type,
                    original_name=name,
                    file_size=dbx_size,
                    user_id=user.id,
                    session=session,
                    content_hash=dbx_hash,
                )

        # --- Files removed from Dropbox → delete from DB ---
        dbx_doc_names = {
            entry.get("name", "")
            for entry in entries
            if entry.get(".tag") == "file" and document_service.detect_file_type(entry.get("name", ""))
        }
        for name, doc in existing.items():
            if name not in dbx_doc_names:
                document_service.delete_document(doc.id, session)

    except Exception:
        pass  # Sync failure must never block listing


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

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

    # Upload to Dropbox first
    dbx_hash = None
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_doc_path(folder_path, original_name, user, session)
            result = await dbx.upload_file(content, dbx_path)
            dbx_hash = result.get("content_hash")
    except Exception:
        pass

    if file_type == "pdf":
        try:
            doc = document_service.register_pdf(
                content=content,
                folder_path=folder_path,
                original_name=original_name,
                user_id=user.id,
                session=session,
                content_hash=dbx_hash,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        if file_type == "txt" and len(content) > document_service.MAX_TXT_SIZE:
            raise HTTPException(400, "Textdatei zu gross (max. 2 MB)")
        doc = document_service.register_document(
            folder_path=folder_path,
            file_type=file_type,
            original_name=original_name,
            file_size=len(content),
            user_id=user.id,
            session=session,
            content_hash=dbx_hash,
        )

    return ActionResponse.success(data={
        "id": doc.id,
        "original_name": doc.original_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
    })


# ---------------------------------------------------------------------------
# PDF Page Rendering (from Dropbox → Memory → JPEG)
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/page/{page}")
async def document_page(
    doc_id: int,
    page: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Render a PDF page as JPEG. Fetches PDF from Dropbox on cache miss."""
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "pdf":
        raise HTTPException(404, "Kein PDF vorhanden")

    # Ensure PDF bytes are in memory cache
    if not document_service._get_cached_pdf(doc_id):
        dbx = get_dropbox_service(session)
        if not dbx:
            raise HTTPException(400, "Dropbox nicht verbunden")
        dbx_path = _dropbox_doc_path(doc.folder_path, doc.original_name, user, session)
        try:
            link = await dbx.get_temporary_link(dbx_path)
            async with httpx.AsyncClient() as client:
                resp = await client.get(link)
                resp.raise_for_status()
            document_service._put_cached_pdf(doc_id, resp.content)
        except Exception as e:
            raise HTTPException(502, f"PDF konnte nicht geladen werden: {e}")

    data = document_service.render_page(doc_id, page, doc.content_hash or "")
    if not data:
        raise HTTPException(404, f"Seite {page} nicht gefunden")

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Download / Stream / Content
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Redirect to Dropbox temporary link for download."""
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = _dropbox_doc_path(doc.folder_path, doc.original_name, user, session)
    try:
        link = await dbx.get_temporary_link(dbx_path)
        return RedirectResponse(url=link)
    except RuntimeError as e:
        raise HTTPException(502, str(e))


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
    try:
        link = await dbx.get_temporary_link(dbx_path)
        async with httpx.AsyncClient() as client:
            resp = await client.get(link)
            resp.raise_for_status()
            return {"content": resp.text}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ---------------------------------------------------------------------------
# Delete / Hide / Unhide
# ---------------------------------------------------------------------------

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

    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_doc_path(folder_path, original_name, user, session)
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
