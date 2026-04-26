"""Documents API — upload, view and manage folder-level documents."""

import json
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.annotation import Annotation
from backend.models.document import Document
from backend.models.user import User
from backend.models.user_chord_preference import UserChordPreference
from backend.policy import require_permission, require_permission_query
from backend.schemas import ActionResponse
from backend.services import document_service, pdf_service
from backend.services.dropbox_service import get_dropbox_service
from backend.services.print_token_service import (
    PRINT_TOKEN_TTL_SECONDS,
    issue_print_token,
    verify_print_token,
)
from backend.utils.dropbox_paths import (
    dropbox_doc_path,
    dropbox_folder_path,
    full_doc_path,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


# ---------------------------------------------------------------------------
# List + Dropbox Sync
# ---------------------------------------------------------------------------

@router.get("/list")
async def list_documents(
    folder: str,
    user: User = Depends(require_permission("documents.list")),
    session: Session = Depends(get_session),
):
    from backend.services import draft_service

    texte_path = await document_service.resolve_texte_folder(folder, user, session)
    if texte_path:
        await document_service.sync_documents_from_dropbox(texte_path, user, session)
        docs = document_service.list_documents(texte_path, user.id, session)
    else:
        docs = []

    drafts = draft_service.load_drafts(session, user.choir_id)
    if not drafts.is_empty():
        can_see = draft_service.can_see_drafts(user.role)
        # Documents in dieser Liste duerfen sowohl per doc_id als auch per
        # dropbox_path als Draft markiert sein. Beides pruefen.
        out: list[dict] = []
        for d in docs:
            is_draft = drafts.has_document(d.get("id"))
            if not is_draft:
                doc_row = session.get(Document, d.get("id")) if d.get("id") else None
                if doc_row and doc_row.dropbox_path:
                    is_draft = drafts.has_path("/" + doc_row.dropbox_path.lstrip("/"))
            if is_draft and not can_see:
                continue
            if is_draft:
                d = {**d, "is_draft": True}
            out.append(d)
        docs = out

    return {"documents": docs}



# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder_path: str = Form(...),
    song_folder_name: str | None = Form(None),
    user: User = Depends(require_permission("documents.upload")),
    session: Session = Depends(get_session),
):
    import logging
    _log = logging.getLogger(__name__)

    original_name = file.filename or "document"
    file_type = document_service.detect_file_type(original_name)
    if not file_type:
        raise HTTPException(400, "Nicht unterstuetztes Dateiformat")

    # Auto-create .song folder if requested (root-level upload)
    if song_folder_name:
        song_path = f"{folder_path.rstrip('/')}/{song_folder_name}.song"
        dbx = get_dropbox_service(session)
        if dbx:
            song_dbx = dropbox_folder_path(song_path, user, session)
            try:
                await dbx.create_folder(song_dbx)
            except RuntimeError:
                pass  # Already exists
        folder_path = song_path

    content = await file.read()

    # --- Document upload (Texte/ folder) ---
    from backend.services.folder_types import get_parent_folder_type
    texte_path = await document_service.resolve_texte_folder(folder_path, user, session)
    if not texte_path:
        parent_type = get_parent_folder_type(folder_path)
        if parent_type == "song":
            texte_path = folder_path.rstrip("/") + "/Texte"
        else:
            raise HTTPException(400, "Kein Texte-Ordner gefunden")
    folder_path = texte_path

    # Upload to Dropbox (into the Texte folder, auto-create if needed).
    # Dropbox kann bei Konflikt auto-renamen — path_display + id aus der
    # Response uebernehmen, damit DB und Dropbox uebereinstimmen.
    dbx_hash = None
    dbx_file_id: str | None = None
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            texte_dbx = dropbox_folder_path(folder_path, user, session)
            try:
                await dbx.create_folder(texte_dbx)
            except RuntimeError:
                pass  # Already exists
            dbx_path = dropbox_doc_path(folder_path, original_name, user, session)
            result = await dbx.upload_file(content, dbx_path)
            dbx_hash = result.get("content_hash")
            dbx_file_id = result.get("id")
            actual_path = result.get("path_display")
            if actual_path:
                actual_name = actual_path.rsplit("/", 1)[-1]
                if actual_name and actual_name != original_name:
                    original_name = actual_name
    except Exception:
        logger.exception("upload_document: Dropbox upload failed for %s", original_name)

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
                dropbox_file_id=dbx_file_id,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        if file_type in ("txt", "cho", "rtf") and len(content) > document_service.MAX_TXT_SIZE:
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
            dropbox_file_id=dbx_file_id,
        )

    # Auto-select first document in folder
    document_service.auto_select_if_first_doc(doc, folder_path, user.id, session)

    return ActionResponse.success(data={
        "id": doc.id,
        "original_name": doc.original_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
    })


class PasteTextBody(BaseModel):
    folder_path: str
    title: str
    text: str
    file_type: str  # "txt", "cho", or "rtf"
    song_folder_name: str | None = None  # Optional: create a new .song folder


@router.post("/paste-text")
async def paste_text(
    body: PasteTextBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_permission("documents.upload")),
    session: Session = Depends(get_session),
):
    """Create a text-based document (.txt or .cho) from pasted content.

    Stores the file in the song's Texte/ folder on Dropbox and registers it
    as a Document. Used by the "Text einfuegen" / "Chordsheet einfuegen"
    upload options.

    If `song_folder_name` is set, a new `<song_folder_name>.song` folder is
    created under `folder_path` first (root-upload mode).
    """
    if body.file_type not in ("txt", "cho", "rtf"):
        raise HTTPException(400, "file_type muss 'txt', 'cho' oder 'rtf' sein")

    # RTF und CHO duerfen leer angelegt werden (Editor-First-Workflow) — fuer
    # RTF wrappen wir einen Default-Header, fuer CHO schreiben wir einen
    # minimalen `{title:}`-ChordPro-Header mit Anlage-Datum. Das verhindert
    # 0-Byte-Files (die beim Dropbox-Sync evtl. als verwaist erkannt werden)
    # und gibt dem Editor sofort sinnvollen Start-Inhalt.
    text = body.text if body.file_type in ("rtf", "cho") else body.text.strip()
    if not text:
        if body.file_type == "rtf":
            text = (
                "{\\rtf1\\ansi\\ansicpg1252\\deff0\n"
                "{\\fonttbl{\\f0\\fnil Helvetica;}}\n"
                "\\fs24\n}"
            )
        elif body.file_type == "cho":
            from datetime import date
            safe_title = body.title.strip() or "Untitled"
            text = f"{{title: {safe_title}}}\n# Angelegt {date.today().isoformat()}\n"
        else:
            raise HTTPException(400, "Kein Text uebergeben")

    content_bytes = text.encode("utf-8")
    if len(content_bytes) > document_service.MAX_TXT_SIZE:
        raise HTTPException(400, "Text zu gross (max. 2 MB)")

    # Build a safe filename from the title
    default_title = {"cho": "Akkorde", "rtf": "Text", "txt": "Text"}[body.file_type]
    safe_title = _safe_filename(body.title) or default_title
    filename = f"{safe_title}.{body.file_type}"

    folder_path = body.folder_path

    # Root-upload mode: create a new <song_folder_name>.song folder under folder_path
    if body.song_folder_name:
        safe_song = _safe_filename(body.song_folder_name)
        if not safe_song:
            raise HTTPException(400, "Ungueltiger Songname")
        song_path = f"{folder_path.rstrip('/')}/{safe_song}.song"
        dbx = get_dropbox_service(session)
        if dbx:
            song_dbx = dropbox_folder_path(song_path, user, session)
            try:
                await dbx.create_folder(song_dbx)
            except RuntimeError:
                pass  # Already exists
        folder_path = song_path

    # Resolve / create the Texte folder
    texte_path = await document_service.resolve_texte_folder(folder_path, user, session)
    if not texte_path:
        from backend.services.folder_types import get_parent_folder_type
        parent_type = get_parent_folder_type(folder_path)
        if parent_type == "song":
            texte_path = folder_path.rstrip("/") + "/Texte"
        else:
            raise HTTPException(400, "Kein Texte-Ordner gefunden")

    # Upload to Dropbox (auto-create Texte/ if needed). Dropbox kann den
    # Filename bei Konflikt automatisch umbenennen (autorename=True), und das
    # Upload-Response enthaelt den tatsaechlichen `path_display` sowie die
    # stabile `id` — beide uebernehmen wir, damit register_document mit den
    # korrekten Werten angelegt wird und der nachfolgende Sync die Row nicht
    # faelschlich als verwaist loescht.
    dbx_hash = None
    dbx_file_id: str | None = None
    try:
        dbx = get_dropbox_service(session)
        if dbx:
            texte_dbx = dropbox_folder_path(texte_path, user, session)
            try:
                await dbx.create_folder(texte_dbx)
            except RuntimeError:
                pass  # Already exists
            dbx_path = dropbox_doc_path(texte_path, filename, user, session)
            result = await dbx.upload_file(content_bytes, dbx_path)
            dbx_hash = result.get("content_hash")
            dbx_file_id = result.get("id")
            # Falls Dropbox auto-renamed hat, nutzen wir den tatsaechlichen
            # Namen statt des angefragten.
            actual_path = result.get("path_display")
            if actual_path:
                actual_name = actual_path.rsplit("/", 1)[-1]
                if actual_name and actual_name != filename:
                    filename = actual_name
    except Exception:
        logger.exception("paste_text: Dropbox upload failed for %s", filename)

    rel_path = document_service.build_dropbox_path(texte_path, filename)
    doc = document_service.register_document(
        folder_path=texte_path,
        file_type=body.file_type,
        original_name=filename,
        file_size=len(content_bytes),
        user_id=user.id,
        session=session,
        content_hash=dbx_hash,
        dropbox_path=rel_path,
        dropbox_file_id=dbx_file_id,
    )

    # Auto-select first document in folder
    document_service.auto_select_if_first_doc(doc, texte_path, user.id, session)

    # Companion-PDF: gleicher Trigger-Pfad wie bei RTF-Re-Save.
    if doc.file_type == "rtf" and pdf_service.is_available():
        doc.pdf_status = "pending"
        session.add(doc)
        session.commit()
        background_tasks.add_task(pdf_service.regenerate_companion_pdf, doc.id)

    return ActionResponse.success(data={
        "id": doc.id,
        "original_name": doc.original_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "folder_path": texte_path,
        "pdf_status": doc.pdf_status,
    })


def _safe_filename(title: str) -> str:
    """Create a filesystem-safe filename from a title."""
    import re
    safe = re.sub(r'[^\w\s\-äöüÄÖÜß]', '', title)
    safe = re.sub(r'\s+', ' ', safe).strip()
    return safe


# ---------------------------------------------------------------------------
# PDF Page Rendering (from Dropbox → Memory → JPEG)
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/page/{page}")
async def document_page(
    doc_id: int,
    page: int,
    user: User = Depends(require_permission_query("documents.read")),
    session: Session = Depends(get_session),
):
    """Render a PDF page as JPEG. Fetches PDF from Dropbox on cache miss.

    Uses require_permission_query because the frontend embeds these URLs
    as <img src> and the browser cannot send Authorization headers there.
    """
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "pdf":
        raise HTTPException(404, "Kein PDF vorhanden")

    # Ensure PDF bytes are in memory cache
    if not document_service._get_cached_pdf(doc_id):
        dbx = get_dropbox_service(session)
        if not dbx:
            raise HTTPException(400, "Dropbox nicht verbunden")
        dbx_path = full_doc_path(doc, user, session)
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
    user: User = Depends(require_permission_query("documents.read")),
    session: Session = Depends(get_session),
):
    """Redirect to Dropbox temporary link for download.

    Uses require_permission_query because the frontend embeds this URL
    as an <a href download> and the browser cannot send Authorization
    headers on plain link clicks.
    """
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = full_doc_path(doc, user, session)
    try:
        link = await dbx.get_temporary_link(dbx_path)
        return RedirectResponse(url=link)
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.get("/{doc_id}/stream")
async def stream_document(
    doc_id: int,
    user: User = Depends(require_permission("documents.read")),
    session: Session = Depends(get_session),
):
    """Get a temporary Dropbox link for streaming video/txt content."""
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = full_doc_path(doc, user, session)
    try:
        link = await dbx.get_temporary_link(dbx_path)
        return {"link": link}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.get("/{doc_id}/content")
async def get_text_content(
    doc_id: int,
    user: User = Depends(require_permission("documents.read")),
    session: Session = Depends(get_session),
):
    """Get the text content of a TXT, CHO or RTF document via Dropbox."""
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type not in ("txt", "cho", "rtf"):
        raise HTTPException(404, "Kein Textdokument")

    cached = document_service._get_cached_text(doc_id, doc.content_hash)
    if cached is not None:
        return {"content": cached}

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    dbx_path = full_doc_path(doc, user, session)
    try:
        link = await dbx.get_temporary_link(dbx_path)
        async with httpx.AsyncClient() as client:
            resp = await client.get(link)
            resp.raise_for_status()
            content = resp.text.replace('\r\n', '\n').replace('\r', '\n').replace('\u2028', '\n').replace('\u2029', '\n\n')
            document_service._put_cached_text(doc_id, content, doc.content_hash)
            return {"content": content}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


class UpdateTextContentBody(BaseModel):
    # Optional + expliziter 400-Check, damit der Endpoint bei fehlendem Feld
    # dieselbe Fehlermeldung liefert wie vorher (statt einem Pydantic-422).
    content: str | None = None


@router.put("/{doc_id}/content")
async def update_text_content(
    doc_id: int,
    body: UpdateTextContentBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_permission("chord_input.edit")),
    session: Session = Depends(get_session),
):
    """Overwrite the content of an existing .cho, .txt or .rtf document.

    Used by the chord-input editor (.cho), the text-edit mode (plain .txt),
    and the RTF-Editor (.rtf) to persist changes in place. Other file types
    (PDF, video, audio) are rejected.
    """
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type not in ("cho", "txt", "rtf"):
        raise HTTPException(404, "Textdokument nicht gefunden")

    if body.content is None:
        raise HTTPException(400, "content muss ein String sein")

    content_bytes = body.content.encode("utf-8")
    if len(content_bytes) > document_service.MAX_TXT_SIZE:
        raise HTTPException(400, "Text zu gross (max. 2 MB)")

    dbx = get_dropbox_service(session)
    dbx_hash = None
    if dbx:
        dbx_path = full_doc_path(doc, user, session)
        try:
            result = await dbx.upload_file(content_bytes, dbx_path, overwrite=True)
            dbx_hash = result.get("content_hash")
        except RuntimeError as e:
            raise HTTPException(502, str(e))

    if dbx_hash:
        doc.content_hash = dbx_hash
    doc.file_size = len(content_bytes)
    # Companion-PDF anstossen: bei RTF synchron pdf_status='pending' setzen,
    # Hintergrund-Task generiert + uploaded + setzt 'ready' / 'failed'.
    if doc.file_type == "rtf" and pdf_service.is_available():
        doc.pdf_status = "pending"
    session.add(doc)
    session.commit()

    document_service._clear_cached_text(doc_id)

    if doc.file_type == "rtf" and pdf_service.is_available():
        background_tasks.add_task(pdf_service.regenerate_companion_pdf, doc.id)

    return ActionResponse.success(data={
        "id": doc.id,
        "file_size": doc.file_size,
        "pdf_status": doc.pdf_status,
    })


# ---------------------------------------------------------------------------
# Rename
# ---------------------------------------------------------------------------

class RenameDocumentBody(BaseModel):
    new_name: str = ""


@router.post("/{doc_id}/rename")
async def rename_document(
    doc_id: int,
    body: RenameDocumentBody,
    user: User = Depends(require_permission("documents.rename")),
    session: Session = Depends(get_session),
):
    new_name = body.new_name.strip()
    if not new_name:
        raise HTTPException(400, "Name ist erforderlich")

    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    old_name = doc.original_name

    # Rename in Dropbox
    dbx = get_dropbox_service(session)
    if dbx:
        old_path = dropbox_doc_path(doc.folder_path, old_name, user, session)
        new_path = dropbox_doc_path(doc.folder_path, new_name, user, session)
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
    document_service._clear_cached_text(doc_id)
    document_service.clear_render_cache()

    return ActionResponse.success()


# ---------------------------------------------------------------------------
# Delete / Hide / Unhide
# ---------------------------------------------------------------------------

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: int,
    user: User = Depends(require_permission("documents.delete")),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    dbx_path = full_doc_path(doc, user, session)
    document_service.delete_document(doc_id, session)

    try:
        dbx = get_dropbox_service(session)
        if dbx:
            await dbx.delete_file(dbx_path)
    except RuntimeError as e:
        # DB-seitig ist das Doc bereits weg. Wenn Dropbox die Datei nicht
        # findet, ist das fuer den Delete semantisch ok (idempotent).
        if "path_lookup/not_found" not in str(e):
            logger.warning("delete_document(%s): Dropbox delete failed: %s", doc_id, e)

    return ActionResponse.success()


@router.post("/{doc_id}/hide")
def hide_document(
    doc_id: int,
    user: User = Depends(require_permission("documents.hide")),
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
    user: User = Depends(require_permission("documents.hide")),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    document_service.unhide_document(user.id, doc_id, session)
    return ActionResponse.success()


# ---------------------------------------------------------------------------
# Select / Deselect document for player
# ---------------------------------------------------------------------------

class SelectDocumentBody(BaseModel):
    folder_path: str = ""
    document_id: int | None = None


@router.post("/select")
def select_document(
    body: SelectDocumentBody,
    user: User = Depends(require_permission("player.state")),
    session: Session = Depends(get_session),
):
    folder_path = body.folder_path.strip()
    document_id = body.document_id
    if not folder_path or not document_id:
        raise HTTPException(400, "folder_path und document_id erforderlich")

    doc = document_service.get_document(document_id, session)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")

    from backend.models.user_selected_document import UserSelectedDocument
    existing = session.exec(
        select(UserSelectedDocument).where(
            UserSelectedDocument.user_id == user.id,
            UserSelectedDocument.folder_path == folder_path,
        )
    ).first()

    if existing and existing.document_id == document_id:
        # Toggle: same document again → deselect
        session.delete(existing)
        session.commit()
        return ActionResponse.success(data={"deselected": True})

    if existing:
        existing.document_id = document_id
        existing.song_id = doc.song_id
        session.add(existing)
    else:
        session.add(UserSelectedDocument(
            user_id=user.id,
            folder_path=folder_path,
            song_id=doc.song_id,
            document_id=document_id,
        ))
    session.commit()
    return ActionResponse.success()


@router.delete("/select")
def deselect_document(
    folder: str,
    user: User = Depends(require_permission("player.state")),
    session: Session = Depends(get_session),
):
    from backend.models.user_selected_document import UserSelectedDocument
    existing = session.exec(
        select(UserSelectedDocument).where(
            UserSelectedDocument.user_id == user.id,
            UserSelectedDocument.folder_path == folder,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
    return ActionResponse.success()


@router.get("/selected")
async def get_selected_document(
    folder: str,
    user: User = Depends(require_permission("player.state")),
    session: Session = Depends(get_session),
):
    from backend.models.user_selected_document import UserSelectedDocument
    sel = session.exec(
        select(UserSelectedDocument).where(
            UserSelectedDocument.user_id == user.id,
            UserSelectedDocument.folder_path == folder,
        )
    ).first()

    if sel:
        doc = document_service.get_document(sel.document_id, session)
        if doc:
            return {"document": _doc_to_dict(doc)}
        # Selection points to deleted document — clean up
        session.delete(sel)
        session.commit()

    return {"document": None}


def _doc_to_dict(doc: Document) -> dict:
    return {
        "id": doc.id,
        "file_type": doc.file_type,
        "original_name": doc.original_name,
        "file_size": doc.file_size,
        "page_count": doc.page_count,
        "sort_order": doc.sort_order,
    }


# ---------------------------------------------------------------------------
# Chord Preference (per-user transposition for .cho documents)
# ---------------------------------------------------------------------------

class ChordPreferenceBody(BaseModel):
    transposition: int


@router.get("/{doc_id}/chord-preference")
def get_chord_preference(
    doc_id: int,
    user: User = Depends(require_permission("transposition.read")),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "cho":
        raise HTTPException(404, "Kein Chord Sheet")
    pref = session.exec(
        select(UserChordPreference).where(
            UserChordPreference.user_id == user.id,
            UserChordPreference.document_id == doc_id,
        )
    ).first()
    return {"transposition": pref.transposition_semitones if pref else 0}


@router.put("/{doc_id}/chord-preference")
def set_chord_preference(
    doc_id: int,
    body: ChordPreferenceBody,
    user: User = Depends(require_permission("transposition.write")),
    session: Session = Depends(get_session),
):
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "cho":
        raise HTTPException(404, "Kein Chord Sheet")
    if not -12 <= body.transposition <= 12:
        raise HTTPException(400, "Transposition muss zwischen -12 und +12 liegen.")
    pref = session.exec(
        select(UserChordPreference).where(
            UserChordPreference.user_id == user.id,
            UserChordPreference.document_id == doc_id,
        )
    ).first()
    if pref:
        pref.transposition_semitones = body.transposition
        pref.updated_at = datetime.utcnow()
    else:
        pref = UserChordPreference(
            user_id=user.id,
            document_id=doc_id,
            transposition_semitones=body.transposition,
        )
    session.add(pref)
    session.commit()
    return {"transposition": pref.transposition_semitones}


# ---------------------------------------------------------------------------
# Server-side PDF rendering (RTF only)
# ---------------------------------------------------------------------------

async def _load_rtf_text(doc: Document, user: User, session: Session) -> str:
    """Wie ``GET /content`` aber als interner Helfer — gibt den RTF-Text zurueck."""
    cached = document_service._get_cached_text(doc.id, doc.content_hash)
    if cached is not None:
        return cached
    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(502, "Dropbox nicht verbunden")
    dbx_path = full_doc_path(doc, user, session)
    link = await dbx.get_temporary_link(dbx_path)
    async with httpx.AsyncClient() as client:
        resp = await client.get(link)
        resp.raise_for_status()
        content = (
            resp.text
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace(" ", "\n")
            .replace(" ", "\n\n")
        )
        document_service._put_cached_text(doc.id, content, doc.content_hash)
        return content


@router.post("/{doc_id}/regenerate-pdf")
async def regenerate_pdf(
    doc_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_permission("chord_input.edit")),
    session: Session = Depends(get_session),
):
    """Manuelles Re-Triggern der Companion-PDF-Generierung — z.B. nach
    transientem Fehler. Setzt pdf_status auf 'pending' und schedult den
    Hintergrund-Task."""
    doc = session.get(Document, doc_id)
    if not doc or doc.file_type != "rtf":
        raise HTTPException(404, "RTF nicht gefunden")
    if not pdf_service.is_available():
        raise HTTPException(503, "PDF-Generator nicht verfuegbar")
    doc.pdf_status = "pending"
    session.add(doc)
    session.commit()
    background_tasks.add_task(pdf_service.regenerate_companion_pdf, doc.id)
    return ActionResponse.success(data={"pdf_status": "pending"})


@router.get("/{doc_id}/pdf-status")
async def get_pdf_status(
    doc_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_permission("documents.read")),
    session: Session = Depends(get_session),
):
    """Liefert den Stand der Companion-PDF-Generierung fuer ein RTF.

    Wird vom Frontend gepollt waehrend `status == "pending"`. Enthaelt die
    Companion-Document-id, sobald sie existiert — damit kann das Frontend
    die PDF-Anzeige (PdfPages) auf die Companion-id wechseln.

    **Lazy-Trigger**: Wenn der RTF noch nie generiert wurde (Altbestand,
    `pdf_status` ist NULL und kein Companion existiert) ODER die letzte
    Generierung fehlschlug (`failed`), kicken wir die Generierung hier
    automatisch an. So muss der User nicht erst speichern, damit das
    initiale PDF entsteht.
    """
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    companion = session.exec(
        select(Document).where(
            Document.source_doc_id == doc_id,
            Document.file_type == "pdf",
        )
    ).first()

    if (
        doc.file_type == "rtf"
        and pdf_service.is_available()
        and (doc.pdf_status in (None, "failed"))
        and companion is None
    ):
        doc.pdf_status = "pending"
        session.add(doc)
        session.commit()
        background_tasks.add_task(pdf_service.regenerate_companion_pdf, doc.id)

    return {
        "status": doc.pdf_status,
        "companion_doc_id": companion.id if companion else None,
        "companion_page_count": companion.page_count if companion else 0,
        "annotations_stale": companion.annotations_stale if companion else False,
    }


@router.post("/{doc_id}/clear-stale-annotations")
async def clear_stale_annotations(
    doc_id: int,
    user: User = Depends(require_permission("annotations.write")),
    session: Session = Depends(get_session),
):
    """Entfernt das stale-Flag am Companion-PDF, nachdem der User die
    Markierungen ueberprueft (oder geloescht) hat."""
    companion = session.exec(
        select(Document).where(
            Document.source_doc_id == doc_id,
            Document.file_type == "pdf",
        )
    ).first()
    if not companion:
        raise HTTPException(404, "Companion nicht gefunden")
    companion.annotations_stale = False
    session.add(companion)
    session.commit()
    return ActionResponse.success()


@router.get("/print/{doc_id}/bundle")
async def get_print_bundle(
    doc_id: int,
    token: str = Query(...),
    session: Session = Depends(get_session),
):
    """Liefert RTF-Inhalt + Annotations fuer die headless Print-Seite.

    Auth ueber kurzlebigen Print-Token (HMAC-signiert, 60 s TTL), gebunden
    an doc_id + user_id. Der Token wird vom PDF-Endpoint frisch ausgestellt
    und nur dem Playwright-Browser uebergeben — der User-Session-Token
    verlaesst nie das normale Frontend.
    """
    claims = verify_print_token(token)
    if not claims or claims.doc_id != doc_id:
        raise HTTPException(401, "Invalid or expired print token")

    user = session.exec(select(User).where(User.id == claims.user_id)).first()
    if not user:
        raise HTTPException(401, "Print-Token-User nicht gefunden")

    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "rtf":
        raise HTTPException(404, "RTF-Dokument nicht gefunden")

    content = await _load_rtf_text(doc, user, session)

    ann = session.exec(
        select(Annotation).where(
            Annotation.user_id == user.id,
            Annotation.document_id == doc_id,
            Annotation.page_number == 1,
        )
    ).first()
    strokes = json.loads(ann.strokes_json) if ann else []

    return {
        "content": content,
        "strokes": strokes,
        "doc_name": doc.original_name,
    }


@router.get("/{doc_id}/pdf")
async def render_document_pdf(
    doc_id: int,
    request: Request,
    user: User = Depends(require_permission("documents.read")),
    session: Session = Depends(get_session),
):
    """Liefert das Companion-PDF eines RTF-Dokuments als Bytes.

    Wenn ein Companion-PDF existiert (auto-generiert vom RTF-Save-Hintergrund-
    Task), streamen wir dessen Bytes server-seitig durch — ohne Redirect zu
    Dropbox, sodass der Frontend-`fetch()` nicht in CORS laeuft.

    Falls (noch) keine Companion existiert, fallen wir auf eine Live-
    Generierung via Playwright zurueck (langsamer, aber als Notnagel).
    """
    doc = document_service.get_document(doc_id, session)
    if not doc or doc.file_type != "rtf":
        raise HTTPException(404, "RTF-Dokument nicht gefunden")

    safe_stem = (doc.original_name.rsplit(".", 1)[0] or "dokument").replace('"', "")

    # Companion-PDF aus Dropbox holen und durchstreamen.
    companion = session.exec(
        select(Document).where(
            Document.source_doc_id == doc_id,
            Document.file_type == "pdf",
        )
    ).first()
    if companion:
        dbx = get_dropbox_service(session)
        if not dbx:
            raise HTTPException(502, "Dropbox nicht verbunden")
        dbx_path = full_doc_path(companion, user, session)
        try:
            link = await dbx.get_temporary_link(dbx_path)
            async with httpx.AsyncClient() as client:
                resp = await client.get(link)
                resp.raise_for_status()
                pdf_bytes = resp.content
        except Exception as e:
            logger.exception("Companion-PDF-Download fuer doc %s fehlgeschlagen", doc_id)
            raise HTTPException(502, f"Download fehlgeschlagen: {e}")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{safe_stem}.pdf"',
                "Cache-Control": "no-store",
            },
        )

    # Kein Companion vorhanden — Live-Generierung via Playwright.
    if not pdf_service.is_available():
        raise HTTPException(
            503,
            "PDF-Generator nicht verfuegbar — playwright + chromium sind nicht installiert.",
        )

    token = issue_print_token(doc_id, user.id, ttl_seconds=PRINT_TOKEN_TTL_SECONDS)
    base = str(request.base_url).rstrip("/")
    print_url = f"{base}/#/print/rtf/{doc_id}?token={token}"

    try:
        pdf_bytes = await pdf_service.render_rtf_pdf(print_url)
    except Exception as e:
        logger.exception("PDF-Generierung fehlgeschlagen fuer doc %s", doc_id)
        raise HTTPException(502, f"PDF-Generierung fehlgeschlagen: {e}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_stem}.pdf"',
            "Cache-Control": "no-store",
        },
    )
