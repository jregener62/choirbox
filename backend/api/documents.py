"""Documents API — upload, view and manage folder-level documents."""

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.choir import Choir
from backend.models.document import Document
from backend.models.user import User
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import document_service
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/documents", tags=["documents"])


def _get_root_folder(user: User, session: Session) -> str:
    """Get the choir's Dropbox subfolder (relative to Dropbox App folder root)."""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            return (choir.dropbox_root_folder or "").strip("/")
    return ""


def _dropbox_doc_path(folder_path: str, doc_name: str, user: User, session: Session) -> str:
    """Build the full Dropbox path for a document.

    folder_path is the .tx folder path (e.g. '/Song.song/texte.tx').
    """
    root = _get_root_folder(user, session)
    parts = [p for p in [root, folder_path.strip("/"), doc_name] if p]
    return "/" + "/".join(parts)


def _full_dropbox_path(doc, user: User, session: Session) -> str:
    """Build full Dropbox path from document's stored dropbox_path field."""
    root = _get_root_folder(user, session)
    if doc.dropbox_path:
        parts = [p for p in [root, doc.dropbox_path.strip("/")] if p]
        return "/" + "/".join(parts)
    return _dropbox_doc_path(doc.folder_path, doc.original_name, user, session)


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
    tx_path = await _resolve_tx_folder(folder, user, session)
    if tx_path:
        await _sync_documents_from_dropbox(tx_path, user, session)
        docs = document_service.list_documents(tx_path, user.id, session)
    else:
        docs = []
    return {"documents": docs}


async def _resolve_tx_folder(
    folder_path: str, user: User, session: Session
) -> str | None:
    """Resolve the .tx folder path from any related path.

    - folder_path IS a .tx folder → return as-is
    - folder_path is .audio/.multitrack → go up to parent, find .tx sibling
    - folder_path is .song or plain → look for .tx child
    """
    from backend.services.folder_types import get_parent_folder_type, get_folder_type

    folder_type = get_parent_folder_type(folder_path)

    if folder_type == "tx":
        return folder_path

    if folder_type in ("audio", "multitrack"):
        parent = folder_path.rsplit("/", 1)[0] if "/" in folder_path else ""
        return await _find_tx_child(parent, user, session)

    # .song or plain container → look for .tx child
    return await _find_tx_child(folder_path, user, session)


async def _find_tx_child(
    parent_path: str, user: User, session: Session
) -> str | None:
    """Find a .tx subfolder inside the given Dropbox path."""
    from backend.services.folder_types import get_folder_type

    dbx = get_dropbox_service(session)
    if not dbx:
        return None

    dropbox_path = _dropbox_folder_path(parent_path, user, session)
    try:
        entries = await dbx.list_folder(dropbox_path)
        for e in entries:
            if e.get(".tag") == "folder" and get_folder_type(e.get("name", "")) == "tx":
                return parent_path.rstrip("/") + "/" + e.get("name", "")
    except Exception:
        pass
    return None


async def _sync_documents_from_dropbox(
    folder_path: str, user: User, session: Session
) -> None:
    """Sync Dropbox .tx folder with documents DB.

    folder_path is the .tx folder path (e.g. '/Song.song/texte.tx').
    """
    try:
        dbx = get_dropbox_service(session)
        if not dbx:
            return

        # Scan the .tx folder directly
        tx_folder = _dropbox_folder_path(folder_path, user, session)
        texte_entries = []
        try:
            texte_entries = await dbx.list_folder(tx_folder)
        except Exception:
            pass  # Folder may not exist yet

        # Collect all document files from Texte folder
        entries = [
            e for e in texte_entries
            if e.get(".tag") == "file" and document_service.detect_file_type(e.get("name", ""))
        ]

        # Build lookup of existing documents by name
        existing = {
            d.original_name: d
            for d in session.exec(
                select(Document).where(Document.folder_path == folder_path)
            ).all()
        }

        for entry in entries:
            name = entry.get("name", "")
            file_type = document_service.detect_file_type(name)
            if not file_type:
                continue

            dbx_hash = entry.get("content_hash")
            dbx_size = entry.get("size", 0)
            doc = existing.get(name)

            rel_path = document_service.build_dropbox_path(folder_path, name)

            if doc and doc.content_hash == dbx_hash:
                # Backfill dropbox_path for existing rows
                if not doc.dropbox_path:
                    doc.dropbox_path = rel_path
                    session.add(doc)
                    session.commit()
                continue  # Unchanged

            if doc and doc.content_hash != dbx_hash:
                # --- File changed → update ---
                if file_type == "pdf":
                    try:
                        link = await dbx.get_temporary_link(tx_folder.rstrip("/") + "/" + name)
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
                if not doc.dropbox_path:
                    doc.dropbox_path = rel_path
                    session.add(doc)
                    session.commit()
                continue

            # --- New file → register ---
            if file_type == "pdf":
                try:
                    link = await dbx.get_temporary_link(tx_folder.rstrip("/") + "/" + name)
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
                        dropbox_path=rel_path,
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
                    dropbox_path=rel_path,
                )

        # --- Files removed from Dropbox → delete from DB ---
        dbx_doc_names = {e.get("name", "") for e in entries}
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

    # Resolve to .tx folder (e.g. if called from Player with .audio path)
    tx_path = await _resolve_tx_folder(folder_path, user, session)
    if not tx_path:
        raise HTTPException(400, "Kein Texte-Ordner (.tx) gefunden")
    folder_path = tx_path

    content = await file.read()

    # Upload to Dropbox (directly into the .tx folder)
    dbx_hash = None
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            dbx_path = _dropbox_doc_path(folder_path, original_name, user, session)
            result = await dbx.upload_file(content, dbx_path)
            dbx_hash = result.get("content_hash")
    except Exception:
        pass

    rel_path = document_service.build_dropbox_path(folder_path, original_name)

    if file_type == "pdf":
        try:
            doc = document_service.register_pdf(
                content=content,
                folder_path=folder_path,
                original_name=original_name,
                user_id=user.id,
                session=session,
                content_hash=dbx_hash,
                dropbox_path=rel_path,
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
            dropbox_path=rel_path,
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
        dbx_path = _full_dropbox_path(doc, user, session)
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

    dbx_path = _full_dropbox_path(doc, user, session)
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

    dbx_path = _full_dropbox_path(doc, user, session)
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

    dbx_path = _full_dropbox_path(doc, user, session)
    try:
        link = await dbx.get_temporary_link(dbx_path)
        async with httpx.AsyncClient() as client:
            resp = await client.get(link)
            resp.raise_for_status()
            return {"content": resp.text}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ---------------------------------------------------------------------------
# Rename
# ---------------------------------------------------------------------------

@router.post("/{doc_id}/rename")
async def rename_document(
    doc_id: int,
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "Name ist erforderlich")

    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    old_name = doc.original_name

    # Rename in Dropbox
    dbx = get_dropbox_service(session)
    if dbx:
        old_path = _dropbox_doc_path(doc.folder_path, old_name, user, session)
        new_path = _dropbox_doc_path(doc.folder_path, new_name, user, session)
        try:
            await dbx.move_file(old_path, new_path)
        except RuntimeError as e:
            if "conflict" in str(e):
                raise HTTPException(409, "Name bereits vergeben")
            raise HTTPException(502, str(e))

    # Update DB
    doc.original_name = new_name
    doc.dropbox_path = document_service.build_dropbox_path(doc.folder_path, new_name)
    session.add(doc)
    session.commit()

    # Invalidate caches
    document_service._clear_cached_pdf(doc_id)
    document_service.clear_render_cache()

    return ActionResponse.success()


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

    dbx_path = _full_dropbox_path(doc, user, session)
    document_service.delete_document(doc_id, session)

    try:
        dbx = get_dropbox_service(session)
        if dbx:
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
