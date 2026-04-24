"""Dropbox OAuth2 integration and file browsing endpoints."""

import logging
import secrets
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from pydantic import BaseModel

from backend.config import DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REDIRECT_URI
from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.user import User
from backend.policy import require_permission
from backend.schemas import ActionResponse


class CreateFolderBody(BaseModel):
    name: str = ""
    path: str = ""


class RenamePathBody(BaseModel):
    path: str = ""
    new_name: str = ""


class DuplicatePathBody(BaseModel):
    path: str = ""


class ReportDurationBody(BaseModel):
    path: str = ""
    duration: float | int | None = None
from backend.utils.dropbox_paths import (
    get_choir_root,
    to_dropbox_path,
    to_user_path,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dropbox", tags=["dropbox"])


async def _get_children(tree, dbx, dbx_path: str) -> list[dict]:
    """Look up folder children from in-memory tree, cache, or targeted API call.

    On fresh fetch (tree available): direct dict lookup.
    On cache hit (tree=None): sub-folders were cached by the same recursive listing.
    On cache miss while tree=None: check parent cache to avoid 409s for
    non-existent paths, otherwise fall back to a single list_folder call.
    """
    if tree is not None:
        return tree.get(dbx_path.lower().rstrip("/"), [])
    from backend.services.dropbox_cache import folder_cache
    cached = folder_cache.get(dbx_path)
    if cached is not None:
        return cached[0]
    # Cache miss: before hitting the API, check whether the parent knows this
    # sub-path exists. Reserved sub-folders (Audio, Texte, Videos, Multitrack)
    # often don't exist for every song — querying them returns 409 path/not_found.
    if "/" in dbx_path.lstrip("/"):
        parent_path, _, child_name = dbx_path.rpartition("/")
        parent_cached = folder_cache.get(parent_path or "/")
        if parent_cached is not None:
            child_lower = child_name.lower()
            exists_as_folder = any(
                e.get(".tag") == "folder" and e.get("name", "").lower() == child_lower
                for e in parent_cached[0]
            )
            if not exists_as_folder:
                return []
    # Cache inconsistency: root was cached but this sub-path was invalidated.
    # Fetch just this folder instead of returning [] (which hides sub-folders).
    try:
        return await dbx.list_folder(dbx_path)
    except RuntimeError as e:
        if "path/not_found" not in str(e):
            logger.warning("_get_children(%s): Dropbox error: %s", dbx_path, e)
        return []

_oauth_states: dict[str, str] = {}


def _get_or_create_settings(session: Session) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@router.get("/status")
def dropbox_status(
    user: User = Depends(require_permission("dropbox.status")),
    session: Session = Depends(get_session),
):
    settings = _get_or_create_settings(session)
    connected = bool(settings.dropbox_refresh_token)
    return {
        "connected": connected,
        "configured": bool(DROPBOX_APP_KEY and DROPBOX_APP_SECRET),
        "account_email": settings.dropbox_account_email if connected else None,
        "account_id": settings.dropbox_account_id if connected else None,
    }


@router.get("/authorize")
def dropbox_authorize(user: User = Depends(require_permission("dropbox.connect"))):
    if not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET:
        raise HTTPException(400, "Dropbox App Key and App Secret must be configured in .env.")

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = user.id

    authorize_url = (
        "https://www.dropbox.com/oauth2/authorize"
        f"?client_id={DROPBOX_APP_KEY}"
        f"&redirect_uri={DROPBOX_REDIRECT_URI}"
        "&response_type=code"
        f"&state={state}"
        "&token_access_type=offline"
    )
    return {"authorize_url": authorize_url}


@router.get("/callback")
async def dropbox_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    session: Session = Depends(get_session),
):
    if error:
        return HTMLResponse(_callback_html(success=False, message=f"Dropbox error: {error}"))

    if not code or not state:
        return HTMLResponse(_callback_html(success=False, message="Missing parameters."))

    user_id = _oauth_states.pop(state, None)
    if not user_id:
        return HTMLResponse(_callback_html(success=False, message="Invalid state. Please reconnect."))

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "client_id": DROPBOX_APP_KEY,
                "client_secret": DROPBOX_APP_SECRET,
                "redirect_uri": DROPBOX_REDIRECT_URI,
            },
        )

    if resp.status_code != 200:
        return HTMLResponse(_callback_html(success=False, message=f"Token exchange failed: {resp.text}"))

    token_data = resp.json()
    refresh_token = token_data.get("refresh_token", "")
    access_token = token_data.get("access_token", "")
    account_id = token_data.get("account_id", "")

    if not refresh_token:
        return HTMLResponse(_callback_html(success=False, message="No refresh token received."))

    # Fetch account info
    account_email = ""
    async with httpx.AsyncClient() as client:
        acct_resp = await client.post(
            "https://api.dropboxapi.com/2/users/get_current_account",
            headers={"Authorization": f"Bearer {access_token}"},
            content="null",
        )
        if acct_resp.status_code == 200:
            acct_data = acct_resp.json()
            account_email = acct_data.get("email", "")

    from backend.utils.crypto import encrypt
    settings = _get_or_create_settings(session)
    settings.dropbox_refresh_token = encrypt(refresh_token)
    settings.dropbox_account_id = account_id
    settings.dropbox_account_email = account_email
    settings.dropbox_connected_at = datetime.utcnow()
    session.add(settings)
    session.commit()

    # Redirect back to the app settings page.
    # In dev the backend runs on :8001 but the user-facing frontend is on
    # Vite (:5174); in production both share the same origin (e.g.
    # https://cantabox.de) — derive the target from request.base_url.
    frontend_url = str(request.base_url).rstrip("/")
    if "localhost:8001" in frontend_url or "127.0.0.1:8001" in frontend_url:
        frontend_url = "http://localhost:5174"
    return RedirectResponse(f"{frontend_url}/#/settings/data?dropbox=connected")


@router.get("/browse")
async def dropbox_browse(
    path: str = "",
    refresh: bool = False,
    user: User = Depends(require_permission("browse.read")),
    session: Session = Depends(get_session),
):
    """List files/folders at a Dropbox path with folder-type awareness."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import (
        parse_folder_name, get_parent_folder_type, is_reserved_name,
        get_visible_reserved_types, is_song_folder, RESERVED_FOLDERS,
        TRASH_FOLDER_NAME,
    )
    from backend.services.document_service import ALL_DOC_EXTENSIONS
    from backend.services import draft_service

    _t0 = time.monotonic()

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    dropbox_path = to_dropbox_path(path, root_folder)

    drafts = draft_service.load_drafts(session, user.choir_id)
    can_see_drafts = draft_service.can_see_drafts(user.role)

    def _sub_count(sub_entries):
        """Count files in a reserved subfolder, respecting draft visibility."""
        if can_see_drafts or drafts.is_empty():
            return sum(1 for se in sub_entries if se.get(".tag") == "file")
        return draft_service.count_non_draft_files(
            sub_entries,
            lambda p: to_user_path(p, root_folder),
            drafts,
        )

    use_cache = not refresh
    try:
        entries, tree = await dbx.list_folder_recursive(dropbox_path, use_cache=use_cache)
    except RuntimeError as e:
        if "path/not_found" in str(e):
            return {"path": path, "entries": [], "root_name": root_folder or None, "error": "Folder not found"}
        raise HTTPException(500, str(e))
    _t1 = time.monotonic()
    logger.info("browse %s: recursive listing %.1fms (cache=%s, entries=%d, tree=%s)",
              path or "/", (_t1 - _t0) * 1000, "hit" if tree is None else "miss",
              len(entries), f"{len(tree)} paths" if tree else "cached")

    parent_type = get_parent_folder_type(path)
    is_inside_reserved = parent_type in ("texte", "audio", "videos", "multitrack")
    visible_reserved = get_visible_reserved_types(user.role)
    media_exts = (".mp3", ".webm", ".m4a", ".mp4")
    audio_exts = (".mp3", ".webm", ".m4a", ".ogg", ".wav", ".opus")
    video_exts = (".mp4", ".mov")

    filtered = []
    reserved_found: dict[str, str] = {}  # reserved_name → user_path

    for e in entries:
        tag = e.get(".tag", "")
        name = e.get("name", "")
        user_path = to_user_path(e.get("path_display", ""), root_folder)

        if tag == "folder":
            # Hide Trash folder from browse
            if name.lower() == TRASH_FOLDER_NAME.lower():
                continue

            display_name, folder_type = parse_folder_name(name)

            # Reserved folders: hide and collect for synthetic entries
            if is_reserved_name(name) and not is_inside_reserved:
                if folder_type in visible_reserved:
                    reserved_found[name] = user_path
                continue

            # Inside .song: hide non-reserved, non-typed subfolders
            if parent_type == "song" and folder_type is None:
                continue

            filtered.append({
                "name": name,
                "display_name": display_name,
                "path": user_path,
                "type": "folder",
                "folder_type": folder_type,
            })

        elif tag == "file":
            lower = name.lower()
            if is_inside_reserved:
                # Inside reserved folder: show files matching the folder's type
                if parent_type == "texte" and lower.endswith(ALL_DOC_EXTENSIONS):
                    filtered.append({
                        "name": name, "display_name": name, "path": user_path,
                        "type": "document", "size": e.get("size", 0),
                        "modified": e.get("server_modified", ""),
                    })
                elif parent_type in ("audio", "multitrack") and lower.endswith(audio_exts + media_exts):
                    filtered.append({
                        "name": name, "display_name": name, "path": user_path,
                        "type": "file", "size": e.get("size", 0),
                        "modified": e.get("server_modified", ""),
                    })
                elif parent_type == "videos" and lower.endswith(video_exts):
                    filtered.append({
                        "name": name, "display_name": name, "path": user_path,
                        "type": "file", "size": e.get("size", 0),
                        "modified": e.get("server_modified", ""),
                    })
            elif lower.endswith(media_exts):
                # Normal context: show media files
                filtered.append({
                    "name": name, "display_name": name, "path": user_path,
                    "type": "file", "size": e.get("size", 0),
                    "modified": e.get("server_modified", ""),
                })

    # Resolve sub-folder contents up front so we can batch DB queries below.
    # reserved_meta: reserved_name -> (folder_type, reserved_path, sub_files, count)
    reserved_meta: dict[str, tuple[str | None, str, list[dict], int]] = {}
    for reserved_name, reserved_path in reserved_found.items():
        _, folder_type = parse_folder_name(reserved_name)
        sub_dbx = to_dropbox_path(reserved_path, root_folder)
        sub_entries = await _get_children(tree, dbx, sub_dbx)
        sub_files = [e for e in sub_entries if e.get(".tag") == "file"]
        # Member + darunter: Drafts zaehlen nicht mit. Fuer Pro+ bleibt es beim Rohcount.
        count = len(sub_files) if can_see_drafts or drafts.is_empty() else _sub_count(sub_entries)
        if count == 0:
            continue
        reserved_meta[reserved_name] = (folder_type, reserved_path, sub_files, count)

    # Batch-Load fuer die Texte-Reserved-Eintraege: statt pro Iteration eine
    # DocModel-Query abzusetzen (N+1), laden wir alle in Frage kommenden
    # Documents einmal und die User-Selection fuer den Browse-Path einmal.
    from sqlmodel import select as sqlmodel_select
    from backend.models.document import Document as DocModel
    from backend.models.user_selected_document import UserSelectedDocument

    reserved_texte_paths = [
        rp for _ft, rp, _sf, _c in reserved_meta.values() if _ft == "texte"
    ]
    reserved_docs_by_key: dict[tuple[str, str], DocModel] = {}
    browse_path_selection: UserSelectedDocument | None = None
    browse_selected_doc: DocModel | None = None
    if reserved_texte_paths:
        try:
            rows = session.exec(
                sqlmodel_select(DocModel).where(
                    DocModel.folder_path.in_(reserved_texte_paths)  # type: ignore[attr-defined]
                )
            ).all()
            reserved_docs_by_key = {
                (d.folder_path, d.original_name): d for d in rows
            }
            browse_path_selection = session.exec(
                sqlmodel_select(UserSelectedDocument).where(
                    UserSelectedDocument.user_id == user.id,
                    UserSelectedDocument.folder_path == path,
                )
            ).first()
            if browse_path_selection:
                browse_selected_doc = session.get(
                    DocModel, browse_path_selection.document_id
                )
        except Exception:
            logger.exception("browse: reserved batch lookup failed for %s", path)

    # Create synthetic entries for reserved folders
    for reserved_name, (folder_type, reserved_path, sub_files, count) in reserved_meta.items():
        if folder_type == "texte":
            if count == 1:
                # Single document: show document directly instead of folder
                single = sub_files[0]
                single_name = single.get("name", "")
                single_path = to_user_path(single.get("path_display", ""), root_folder)
                doc_row = reserved_docs_by_key.get((reserved_path, single_name))
                filtered.append({
                    "name": single_name,
                    "display_name": single_name,
                    "path": single_path,
                    "type": "document",
                    "folder_type": "texte",
                    "doc_id": doc_row.id if doc_row else None,
                    "size": single.get("size", 0),
                    "selected": True,
                })
            else:
                # 2+ documents: show Texte folder
                filtered.append({
                    "name": reserved_name,
                    "display_name": reserved_name,
                    "path": reserved_path,
                    "type": "folder",
                    "folder_type": folder_type,
                    "doc_count": count,
                    "reserved": True,
                })
                # Also show selected document directly (if user has one)
                if browse_selected_doc:
                    doc = browse_selected_doc
                    sel_path = reserved_path.rstrip("/") + "/" + doc.original_name
                    filtered.append({
                        "name": doc.original_name,
                        "display_name": doc.original_name,
                        "path": sel_path,
                        "type": "document",
                        "folder_type": "texte",
                        "doc_id": doc.id,
                        "size": doc.file_size,
                        "selected": True,
                    })
        else:
            filtered.append({
                "name": reserved_name,
                "display_name": reserved_name,
                "path": reserved_path,
                "type": "folder",
                "folder_type": folder_type,
                "doc_count": count,
                "reserved": True,
            })

    # Sync documents from Dropbox to DB, then enrich with doc_id
    if parent_type == "texte":
        from backend.services import document_service
        await document_service.sync_documents_from_dropbox(path, user, session)

        from sqlmodel import select as sql_select
        from backend.models.document import Document
        folder_path_stripped = path.lstrip("/")
        docs_in_folder = {
            d.original_name: d.id
            for d in session.exec(
                sql_select(Document).where(
                    (Document.folder_path == path) | (Document.folder_path == folder_path_stripped)
                )
            ).all()
        }
        for entry in filtered:
            if entry.get("type") == "document":
                entry["doc_id"] = docs_in_folder.get(entry["name"])

    # Sort: containers, .song folders, reserved entries, single texte doc, other documents, files
    def _sort_key(x):
        ft = x.get("folder_type")
        folder_type_order = {None: 0, "song": 1, "texte": 2, "audio": 3, "videos": 4, "multitrack": 5}
        if x["type"] == "folder":
            return (0, folder_type_order.get(ft, 5), (x.get("display_name") or x["name"]).lower())
        if x["type"] == "document" and ft == "texte":
            # Single texte doc: sort alongside reserved folders
            return (0, folder_type_order["texte"], (x.get("display_name") or x["name"]).lower())
        if x["type"] == "document":
            return (1, 0, (x.get("display_name") or x["name"]).lower())
        return (2, 0, (x.get("display_name") or x["name"]).lower())
    filtered.sort(key=_sort_key)

    # Attach cached durations
    from backend.services.audio_duration_service import get_durations_for_paths
    file_paths = [e["path"] for e in filtered if e["type"] == "file"]
    durations = get_durations_for_paths(session, file_paths)
    for e in filtered:
        if e["type"] == "file" and e["path"] in durations:
            e["duration"] = durations[e["path"]]

    # Attach parsed file metadata (lazy: parses on first access)
    from backend.services.audio_meta_service import ensure_meta_for_paths
    all_file_paths = [e["path"] for e in filtered if e["type"] in ("file", "document")]
    if all_file_paths:
        metas = ensure_meta_for_paths(session, user.choir_id, all_file_paths)
        for e in filtered:
            meta = metas.get(e.get("path"))
            if meta:
                e["voice_keys"] = meta.voice_keys
                e["section_keys"] = meta.section_keys
                e["song_name"] = meta.song_name
                e["free_text"] = meta.free_text

    # Attach sub_folders + selected_doc to .song folder entries
    from sqlmodel import select as sql_select
    song_entries = [e for e in filtered if e.get("folder_type") == "song" and e["type"] == "folder"]

    # Batch-Load fuer den Song-Loop: statt pro Song eine UserSelectedDocument-
    # und eine Document-Query abzusetzen (N+1), laden wir beide jeweils einmal
    # per IN-Clause und arbeiten dann im Loop nur noch mit Dict-Lookups.
    song_sels_by_path: dict[str, UserSelectedDocument] = {}
    song_docs_by_id: dict[int, DocModel] = {}
    if song_entries:
        song_paths = [s["path"] for s in song_entries]
        try:
            sels = session.exec(
                sql_select(UserSelectedDocument).where(
                    UserSelectedDocument.user_id == user.id,
                    UserSelectedDocument.folder_path.in_(song_paths),  # type: ignore[attr-defined]
                )
            ).all()
            song_sels_by_path = {s.folder_path: s for s in sels}
            sel_doc_ids = [s.document_id for s in sels if s.document_id]
            if sel_doc_ids:
                docs = session.exec(
                    sql_select(DocModel).where(DocModel.id.in_(sel_doc_ids))  # type: ignore[attr-defined]
                ).all()
                song_docs_by_id = {d.id: d for d in docs}
        except Exception:
            logger.exception("browse: song batch lookup failed")

    for song in song_entries:
        sub_folders = []
        selected_doc = None
        song_dbx = to_dropbox_path(song["path"], root_folder)
        for reserved_name, meta in RESERVED_FOLDERS.items():
            reserved_type = meta["type"]
            sub_path = f"{song_dbx}/{reserved_name}"
            sub_entries = await _get_children(tree, dbx, sub_path)
            count = _sub_count(sub_entries)
            if count > 0:
                user_sub_path = f"{song['path']}/{reserved_name}"
                sub_folders.append({"type": reserved_type, "name": reserved_name, "path": user_sub_path, "count": count})
        sel = song_sels_by_path.get(song["path"])
        if sel:
            doc = song_docs_by_id.get(sel.document_id)
            if doc:
                texte_path = f"{song['path']}/Texte"
                selected_doc = {
                    "name": doc.original_name,
                    "path": f"{texte_path}/{doc.original_name}",
                    "doc_id": doc.id,
                }
        song["sub_folders"] = sub_folders
        song["selected_doc"] = selected_doc

    # If browsing inside a .song subfolder, attach song_sub_folders to response
    song_sub_folders = None
    path_segments = [s for s in path.split('/') if s]
    song_ancestor_idx = next((i for i, s in enumerate(path_segments) if is_song_folder(s)), None)
    if song_ancestor_idx is not None and len(path_segments) > song_ancestor_idx + 1:
        song_user_path = '/' + '/'.join(path_segments[:song_ancestor_idx + 1])
        song_dbx_path = to_dropbox_path(song_user_path, root_folder)
        song_sub_folders = []
        for reserved_name, meta in RESERVED_FOLDERS.items():
            reserved_type = meta["type"]
            sub_path = f"{song_dbx_path}/{reserved_name}"
            # None statt tree: tree wurde vom aktuellen Subfolder gebaut und
            # enthält keine Geschwister-Daten. Mit None nutzt _get_children
            # den Cache oder macht einen gezielten API-Call.
            sub_entries = await _get_children(None, dbx, sub_path)
            count = _sub_count(sub_entries)
            if count > 0:
                user_sub_path = f"{song_user_path}/{reserved_name}"
                song_sub_folders.append({"type": reserved_type, "name": reserved_name, "path": user_sub_path, "count": count})

    _t2 = time.monotonic()
    logger.info("browse %s: total %.1fms (listing=%.1fms, enrichment=%.1fms, songs=%d, entries=%d)",
              path or "/", (_t2 - _t0) * 1000, (_t1 - _t0) * 1000,
              (_t2 - _t1) * 1000, len(song_entries), len(filtered))

    # Drafts filtern: fuer <pro-member komplett ausblenden, fuer pro-member+
    # mit is_draft=true annotieren. Nach dem Count-Update, damit Pro+ die
    # korrekten Counts (inkl. Drafts) sehen.
    if not drafts.is_empty():
        filtered = draft_service.filter_browse_entries(filtered, drafts, can_see_drafts)

    result = {"path": path, "entries": filtered, "root_name": root_folder or None}
    if song_sub_folders is not None:
        result["song_sub_folders"] = song_sub_folders
    return result


@router.get("/search")
async def dropbox_search(
    q: str = "",
    user: User = Depends(require_permission("browse.search")),
    session: Session = Depends(get_session),
):
    """Search root level only (non-recursive). Includes files and folders; .song folders shown with stripped display name."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import (
        parse_folder_name, is_reserved_name, TRASH_FOLDER_NAME, RESERVED_FOLDERS,
    )
    from backend.services.document_service import ALL_DOC_EXTENSIONS
    from backend.services import draft_service
    from sqlmodel import select as sql_select
    from backend.models.user_selected_document import UserSelectedDocument
    from backend.models.document import Document as DocModel

    if not q or len(q) < 2:
        raise HTTPException(400, "Search query must be at least 2 characters")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    root_path = ("/" + root_folder) if root_folder else ""

    drafts = draft_service.load_drafts(session, user.choir_id)
    can_see_drafts = draft_service.can_see_drafts(user.role)

    def _search_sub_count(sub_entries):
        if can_see_drafts or drafts.is_empty():
            return sum(1 for se in sub_entries if se.get(".tag") == "file")
        return draft_service.count_non_draft_files(
            sub_entries,
            lambda p: to_user_path(p, root_folder),
            drafts,
        )

    try:
        results = await dbx.list_folder(root_path)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    media_exts = (".mp3", ".webm", ".m4a", ".mp4")
    allowed_exts = media_exts + ALL_DOC_EXTENSIONS
    q_lower = q.lower()
    entries = []
    for e in results:
        tag = e.get(".tag", "")
        name = e.get("name", "")
        if q_lower not in name.lower():
            continue
        if tag == "folder":
            # Skip Trash and reserved folders (.song folders are included but not descended into)
            if name.lower() == TRASH_FOLDER_NAME.lower():
                continue
            if is_reserved_name(name):
                continue
            display_name, folder_type = parse_folder_name(name)
            entries.append({
                "name": name,
                "display_name": display_name,
                "path": to_user_path(e.get("path_display", ""), root_folder),
                "type": "folder",
                "folder_type": folder_type,
            })
        elif tag == "file" and name.lower().endswith(allowed_exts):
            entry_type = "document" if name.lower().endswith(ALL_DOC_EXTENSIONS) else "file"
            entries.append({
                "name": name,
                "display_name": name,
                "path": to_user_path(e.get("path_display", ""), root_folder),
                "type": entry_type,
                "size": e.get("size", 0),
            })

    # Enrich .song folder entries with sub_folders + selected_doc so the
    # frontend can auto-navigate into Audio/Texte/Videos and show the
    # song-card header (matching regular browse behavior).
    song_entries = [e for e in entries if e.get("folder_type") == "song"]
    search_sels_by_path: dict[str, UserSelectedDocument] = {}
    search_docs_by_id: dict[int, DocModel] = {}
    if song_entries:
        song_paths = [s["path"] for s in song_entries]
        try:
            sels = session.exec(
                sql_select(UserSelectedDocument).where(
                    UserSelectedDocument.user_id == user.id,
                    UserSelectedDocument.folder_path.in_(song_paths),  # type: ignore[attr-defined]
                )
            ).all()
            search_sels_by_path = {s.folder_path: s for s in sels}
            sel_doc_ids = [s.document_id for s in sels if s.document_id]
            if sel_doc_ids:
                docs = session.exec(
                    sql_select(DocModel).where(DocModel.id.in_(sel_doc_ids))  # type: ignore[attr-defined]
                ).all()
                search_docs_by_id = {d.id: d for d in docs}
        except Exception:
            logger.exception("search: song batch lookup failed")

    for song in song_entries:
        sub_folders = []
        selected_doc = None
        song_dbx = to_dropbox_path(song["path"], root_folder)
        for reserved_name, meta in RESERVED_FOLDERS.items():
            reserved_type = meta["type"]
            sub_path = f"{song_dbx}/{reserved_name}"
            sub_entries = await _get_children(None, dbx, sub_path)
            count = _search_sub_count(sub_entries)
            if count > 0:
                user_sub_path = f"{song['path']}/{reserved_name}"
                sub_folders.append({"type": reserved_type, "name": reserved_name, "path": user_sub_path, "count": count})
        sel = search_sels_by_path.get(song["path"])
        if sel:
            doc = search_docs_by_id.get(sel.document_id)
            if doc:
                texte_path = f"{song['path']}/Texte"
                selected_doc = {
                    "name": doc.original_name,
                    "path": f"{texte_path}/{doc.original_name}",
                    "doc_id": doc.id,
                }
        song["sub_folders"] = sub_folders
        song["selected_doc"] = selected_doc

    if not drafts.is_empty():
        entries = draft_service.filter_browse_entries(entries, drafts, can_see_drafts)

    return {"query": q, "entries": entries}


@router.get("/stream")
async def dropbox_stream(
    path: str = "",
    user: User = Depends(require_permission("stream.play")),
    session: Session = Depends(get_session),
):
    """Get a temporary streaming link for audio playback (4h valid)."""
    from backend.services.dropbox_service import get_dropbox_service

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    dropbox_path = to_dropbox_path(path, root_folder)

    try:
        link = await dbx.get_temporary_link(dropbox_path)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    return {"link": link, "expires_in": 14400}


@router.post("/upload")
async def dropbox_upload(
    file: UploadFile = File(...),
    target_path: str = Form(...),
    song_folder_name: str | None = Form(None),
    user: User = Depends(require_permission("documents.upload")),
    session: Session = Depends(get_session),
):
    """Upload a recording/video to Dropbox. Audio → MP3, Video → compressed MP4."""
    import asyncio
    import tempfile
    import os

    from backend.services.dropbox_service import get_dropbox_service

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    filename = file.filename or "recording"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    video_exts = ("mp4",)
    audio_exts = ("webm", "m4a", "ogg", "opus", "wav", "mp3", "mid", "midi")
    if ext not in video_exts + audio_exts:
        raise HTTPException(400, f"Unsupported file format: .{ext}")

    content = await file.read()

    if ext in video_exts:
        # Video: compress with ffmpeg (larger size limit)
        from backend.services.video_service import MAX_VIDEO_SIZE, process_video
        if len(content) > MAX_VIDEO_SIZE:
            raise HTTPException(413, "Video zu gross (max. 150 MB)")
        try:
            content, filename = await process_video(content, filename)
        except RuntimeError as e:
            raise HTTPException(422, str(e))
    else:
        # Audio: convert to MP3
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(413, "File too large (max 20 MB)")
        if ext != "mp3":
            mp3_content = await _convert_to_mp3(content, ext)
            if mp3_content is None:
                raise HTTPException(500, "Audio conversion failed")
            content = mp3_content
            filename = filename.rsplit(".", 1)[0] + ".mp3"

    root_folder = get_choir_root(user, session)

    if target_path and not target_path.startswith("/"):
        target_path = "/" + target_path

    # Auto-create .song folder if requested (root-level upload)
    if song_folder_name:
        song_path = f"{target_path.rstrip('/')}/{song_folder_name}.song"
        song_dbx = to_dropbox_path(song_path, root_folder)
        try:
            await dbx.create_folder(song_dbx)
        except RuntimeError:
            pass  # Already exists
        target_path = song_path

    # Auto-routing: inside a .song folder, route to reserved subfolders
    from backend.services.folder_types import get_parent_folder_type
    parent_type = get_parent_folder_type(target_path)
    if parent_type == "song":
        out_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if out_ext in ("mp4", "mov"):
            target_path = target_path.rstrip("/") + "/Videos"
        else:
            target_path = target_path.rstrip("/") + "/Audio"
        # Ensure subfolder exists
        sub_dbx = to_dropbox_path(target_path, root_folder)
        try:
            await dbx.create_folder(sub_dbx)
        except RuntimeError:
            pass  # Already exists

    full_target = to_dropbox_path(target_path, root_folder)
    dropbox_path = f"{full_target}/{filename}".replace("//", "/")

    try:
        result = await dbx.upload_file(content, dropbox_path)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    # Invalidate cache for the target folder and its parent
    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(full_target)

    return ActionResponse.success(data={
        "name": result.get("name", filename),
        "path": to_user_path(result.get("path_display", dropbox_path), root_folder),
        "size": result.get("size", len(content)),
    })


async def _convert_to_mp3(audio_bytes: bytes, input_ext: str) -> bytes | None:
    """Convert audio bytes to MP3 using FFmpeg (or FluidSynth for MIDI)."""
    import asyncio
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(suffix=f".{input_ext}", delete=False) as src:
        src.write(audio_bytes)
        src_path = src.name

    dst_path = src_path.rsplit(".", 1)[0] + ".mp3"
    wav_path = None

    try:
        # MIDI needs FluidSynth to render to WAV first
        if input_ext in ("mid", "midi"):
            soundfont = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "soundfonts", "FluidR3_GM.sf2"
            )
            if not os.path.exists(soundfont):
                logger.error("SoundFont not found: %s", soundfont)
                return None

            wav_path = src_path.rsplit(".", 1)[0] + ".wav"
            proc = await asyncio.create_subprocess_exec(
                "fluidsynth", "-ni", "-F", wav_path, "-r", "44100",
                soundfont, src_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

            if proc.returncode != 0:
                logger.error("FluidSynth error: %s", stderr.decode())
                return None

            # Now convert the WAV to MP3 via FFmpeg
            src_path_for_ffmpeg = wav_path
        else:
            src_path_for_ffmpeg = src_path

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", src_path_for_ffmpeg,
            "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1",
            dst_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

        if proc.returncode != 0:
            logger.error("FFmpeg error: %s", stderr.decode())
            return None

        with open(dst_path, "rb") as f:
            return f.read()
    except FileNotFoundError as e:
        logger.error("External tool not found (%s) — cannot convert", e)
        return None
    except asyncio.TimeoutError:
        logger.error("Conversion timeout")
        return None
    finally:
        for p in (src_path, dst_path, wav_path):
            if p is None:
                continue
            try:
                os.unlink(p)
            except OSError:
                pass


@router.delete("/file")
async def dropbox_delete_file(
    path: str = "",
    user: User = Depends(require_permission("documents.delete")),
    session: Session = Depends(get_session),
):
    """Delete a file from Dropbox. Requires Chorleiter or Admin role."""
    from backend.services.dropbox_service import get_dropbox_service

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    dropbox_path = to_dropbox_path(path, root_folder)

    try:
        result = await dbx.delete_file(dropbox_path)
    except RuntimeError as e:
        if "path_lookup/not_found" in str(e):
            raise HTTPException(404, "Datei nicht gefunden")
        raise HTTPException(502, str(e))

    # Invalidate cache for the parent folder
    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(dropbox_path)

    # Cleanup associated DB records
    from backend.services.cleanup_service import cleanup_file
    cleanup_file(path, session)

    metadata = result.get("metadata", {})
    return ActionResponse.success(data={
        "name": metadata.get("name", ""),
        "path": to_user_path(metadata.get("path_display", path), root_folder),
    })


@router.post("/folder")
async def dropbox_create_folder(
    body: CreateFolderBody,
    user: User = Depends(require_permission("folders.create")),
    session: Session = Depends(get_session),
):
    """Create a new folder in Dropbox. Requires Admin role."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import is_reserved_name

    name = body.name.strip()
    path = body.path
    if not name:
        raise HTTPException(400, "Ordnername ist erforderlich")
    if is_reserved_name(name):
        raise HTTPException(400, f"'{name}' ist ein reservierter Ordnername")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    parent = to_dropbox_path(path, root_folder)
    full_path = f"{parent}/{name}".replace("//", "/")

    try:
        result = await dbx.create_folder(full_path)
    except RuntimeError as e:
        if "path/conflict" in str(e):
            raise HTTPException(409, "Ordner existiert bereits")
        raise HTTPException(502, str(e))

    # Invalidate cache for the parent folder
    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(full_path)

    return ActionResponse.success(data={
        "name": result.get("name", name),
        "path": to_user_path(result.get("path_display", full_path), root_folder),
    })


@router.delete("/folder")
async def dropbox_delete_folder(
    path: str = "",
    user: User = Depends(require_permission("folders.delete")),
    session: Session = Depends(get_session),
):
    """Delete a folder from Dropbox. .song folders (chorleiter+) are moved to Trash; others (admin) must be empty."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import is_song_folder, TRASH_FOLDER_NAME

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    dropbox_path = to_dropbox_path(path, root_folder)

    folder_name = path.rstrip("/").rsplit("/", 1)[-1] if "/" in path.strip("/") else path.strip("/")

    if is_song_folder(folder_name):
        # .song folder: move to Trash instead of permanent delete
        trash_path = to_dropbox_path(TRASH_FOLDER_NAME, root_folder)
        try:
            await dbx.move_to_trash(dropbox_path, trash_path)
        except RuntimeError as e:
            if "path_lookup/not_found" in str(e) or "from_lookup/not_found" in str(e):
                raise HTTPException(404, "Ordner nicht gefunden")
            raise HTTPException(502, str(e))
    else:
        # Non-.song folder: must be empty, permanent delete
        try:
            entries = await dbx.list_folder(dropbox_path)
        except RuntimeError as e:
            if "path/not_found" in str(e):
                raise HTTPException(404, "Ordner nicht gefunden")
            raise HTTPException(502, str(e))

        if entries:
            raise HTTPException(409, "Ordner ist nicht leer")

        try:
            await dbx.delete_file(dropbox_path)
        except RuntimeError as e:
            raise HTTPException(502, str(e))

    # Invalidate cache for the deleted/moved folder and its parent
    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(dropbox_path)

    # Cleanup associated DB records (sections, documents, etc.)
    from backend.services.cleanup_service import cleanup_folder
    cleanup_folder(path, session)

    return ActionResponse.success()


@router.post("/rename")
async def dropbox_rename(
    body: RenamePathBody,
    user: User = Depends(require_permission("documents.rename")),
    session: Session = Depends(get_session),
):
    """Rename a file or folder in Dropbox. Requires Pro-Member role."""
    from backend.services.dropbox_service import get_dropbox_service

    path = body.path.strip()
    new_name = body.new_name.strip()
    if not path or not new_name:
        raise HTTPException(400, "path und new_name sind erforderlich")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    from_dropbox = to_dropbox_path(path, root_folder)

    # Build new path: same parent + new name
    parent = from_dropbox.rsplit("/", 1)[0] if "/" in from_dropbox else ""
    to_dropbox = f"{parent}/{new_name}" if parent else f"/{new_name}"

    try:
        result = await dbx.move_file(from_dropbox, to_dropbox)
    except RuntimeError as e:
        if "to/conflict" in str(e) or "path/conflict" in str(e):
            raise HTTPException(409, "Name bereits vergeben")
        if "path_lookup/not_found" in str(e) or "from_lookup/not_found" in str(e):
            raise HTTPException(404, "Datei/Ordner nicht gefunden")
        raise HTTPException(502, str(e))

    # Invalidate cache for both old and new paths
    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(from_dropbox)
    folder_cache.invalidate_subtree(to_dropbox)

    # Update audio meta for renamed file
    new_user_path = to_user_path(result.get("path_display", to_dropbox), root_folder)
    from backend.models.audio_meta import AudioMeta
    old_meta = session.get(AudioMeta, path)
    if old_meta:
        session.delete(old_meta)
        session.commit()
    from backend.services.audio_meta_service import sync_audio_meta
    sync_audio_meta(session, user.choir_id, [new_user_path])

    # Phase 4: pfad-basierte User-Daten umhaengen, damit Renames keine
    # Favoriten/Notizen/Labels mehr verwaisen lassen. Funktioniert sowohl fuer
    # einzelne Dateien als auch fuer Ordner (Praefix-Replacement). User-Daten
    # mit stabiler ID werden nicht angefasst — die zeigen sowieso ueber die
    # ID auf das richtige Asset.
    from backend.models.favorite import Favorite as _Fav
    from backend.models.note import Note as _Note
    from backend.models.user_label import UserLabel as _UL
    from backend.models.section import Section as _Sec

    is_folder = (result.get(".tag") == "folder")
    old_path = path
    new_path = new_user_path

    def _swap(p: str) -> str:
        if p == old_path:
            return new_path
        if is_folder and p.startswith(old_path + "/"):
            return new_path + p[len(old_path):]
        return p

    for fav in session.exec(select(_Fav).where(
        (_Fav.dropbox_path == old_path) |
        (_Fav.dropbox_path.like(old_path + "/%"))
    )).all():
        fav.dropbox_path = _swap(fav.dropbox_path)
        if not is_folder:
            import os as _os
            fav.file_name = _os.path.basename(fav.dropbox_path)
        session.add(fav)
    for n in session.exec(select(_Note).where(
        (_Note.dropbox_path == old_path) |
        (_Note.dropbox_path.like(old_path + "/%"))
    )).all():
        n.dropbox_path = _swap(n.dropbox_path)
        session.add(n)
    for u in session.exec(select(_UL).where(
        (_UL.dropbox_path == old_path) |
        (_UL.dropbox_path.like(old_path + "/%"))
    )).all():
        u.dropbox_path = _swap(u.dropbox_path)
        session.add(u)
    if is_folder:
        for s in session.exec(select(_Sec).where(
            (_Sec.folder_path == old_path) |
            (_Sec.folder_path.like(old_path + "/%"))
        )).all():
            s.folder_path = _swap(s.folder_path)
            session.add(s)
        # Auch Documents/UserSelectedDocuments/Songs umhaengen
        from backend.models.document import Document as _Doc
        from backend.models.user_selected_document import UserSelectedDocument as _USD
        from backend.models.song import Song as _Song
        for d in session.exec(select(_Doc).where(
            (_Doc.folder_path == old_path) |
            (_Doc.folder_path.like(old_path + "/%"))
        )).all():
            d.folder_path = _swap(d.folder_path)
            if d.dropbox_path:
                d.dropbox_path = _swap(d.dropbox_path)
            session.add(d)
        for usd in session.exec(select(_USD).where(
            (_USD.folder_path == old_path) |
            (_USD.folder_path.like(old_path + "/%"))
        )).all():
            usd.folder_path = _swap(usd.folder_path)
            session.add(usd)
        for song in session.exec(select(_Song).where(
            (_Song.folder_path == old_path) |
            (_Song.folder_path.like(old_path + "/%"))
        )).all():
            song.folder_path = _swap(song.folder_path)
            session.add(song)
    session.commit()

    return ActionResponse.success(data={
        "name": result.get("name", new_name),
        "path": new_user_path,
    })


def _split_name(name: str, is_folder: bool) -> tuple[str, str]:
    """Split a Dropbox entry name into (stem, ext). Ordner behalten `.song` als Extension."""
    import os as _os
    if is_folder:
        if name.lower().endswith(".song"):
            return name[:-5], name[-5:]
        return name, ""
    return _os.path.splitext(name)


def _find_kopie_name(stem: str, ext: str, existing_names_lower: set[str]) -> str | None:
    """Waehle 'stem (Kopie)ext' oder 'stem (Kopie N)ext' — erster freier Name, sonst None."""
    candidate = f"{stem} (Kopie){ext}"
    if candidate.lower() not in existing_names_lower:
        return candidate
    for n in range(2, 100):
        candidate = f"{stem} (Kopie {n}){ext}"
        if candidate.lower() not in existing_names_lower:
            return candidate
    return None


@router.post("/duplicate")
async def dropbox_duplicate(
    body: DuplicatePathBody,
    user: User = Depends(require_permission("documents.duplicate")),
    session: Session = Depends(get_session),
):
    """Duplicate a file or folder in Dropbox with auto-generated '(Kopie)' suffix.
    Ordner werden rekursiv kopiert. DB-Records (Favoriten, Notes, Labels, Sections,
    Documents, Songs) werden NICHT mitkopiert — das Duplikat startet leer, Documents
    regenerieren sich beim naechsten Browse."""
    from backend.services.dropbox_service import get_dropbox_service

    path = body.path.strip()
    if not path:
        raise HTTPException(400, "path ist erforderlich")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = get_choir_root(user, session)
    from_dropbox = to_dropbox_path(path, root_folder)

    metadata = await dbx.get_metadata(from_dropbox)
    if metadata is None:
        raise HTTPException(404, "Datei/Ordner nicht gefunden")

    is_folder = metadata.get(".tag") == "folder"
    original_name = metadata.get("name", from_dropbox.rsplit("/", 1)[-1])

    parent_dropbox = from_dropbox.rsplit("/", 1)[0] if "/" in from_dropbox else ""

    try:
        siblings = await dbx.list_folder(parent_dropbox, use_cache=True)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    existing_names_lower = {s.get("name", "").lower() for s in siblings}

    stem, ext = _split_name(original_name, is_folder)
    new_name = _find_kopie_name(stem, ext, existing_names_lower)
    if new_name is None:
        raise HTTPException(409, "Zu viele Duplikate — bitte alte Kopien aufraeumen")

    to_dropbox = f"{parent_dropbox}/{new_name}" if parent_dropbox else f"/{new_name}"

    try:
        result = await dbx.copy_file(from_dropbox, to_dropbox)
    except RuntimeError as e:
        if "to/conflict" in str(e) or "path/conflict" in str(e):
            raise HTTPException(409, "Name bereits vergeben")
        if "path_lookup/not_found" in str(e) or "from_lookup/not_found" in str(e):
            raise HTTPException(404, "Datei/Ordner nicht gefunden")
        if "too_many_files" in str(e):
            raise HTTPException(507, "Ordner enthaelt zu viele Dateien zum Kopieren")
        raise HTTPException(502, str(e))

    from backend.services.dropbox_cache import folder_cache
    folder_cache.invalidate_subtree(parent_dropbox)

    return ActionResponse.success(data={
        "name": result.get("name", new_name),
        "path": to_user_path(result.get("path_display", to_dropbox), root_folder),
    })


@router.post("/duration")
def report_duration(
    body: ReportDurationBody,
    user: User = Depends(require_permission("audio.metadata.cache")),
    session: Session = Depends(get_session),
):
    """Cache a track's audio duration (reported by the frontend)."""
    from backend.services.audio_duration_service import save_duration

    path = body.path.strip()
    duration = body.duration
    if not path or duration is None or duration <= 0:
        raise HTTPException(400, "path and positive duration required")

    save_duration(session, path, float(duration))
    return ActionResponse.success()


@router.post("/disconnect")
def dropbox_disconnect(
    user: User = Depends(require_permission("dropbox.connect")),
    session: Session = Depends(get_session),
):
    settings = _get_or_create_settings(session)
    settings.dropbox_refresh_token = None
    settings.dropbox_account_id = None
    settings.dropbox_account_email = None
    settings.dropbox_connected_at = None
    session.add(settings)
    session.commit()
    return ActionResponse.success()


def _callback_html(success: bool, message: str) -> str:
    color = "#4ade80" if success else "#f87171"
    icon = "&#10003;" if success else "&#10007;"
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Dropbox OAuth</title>
<style>
  body {{ font-family: system-ui; background: #1a1a2e; color: #e0e0e0;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
  .box {{ text-align: center; padding: 40px; border-radius: 12px; background: #16213e; }}
  .icon {{ font-size: 48px; color: {color}; }}
  p {{ margin-top: 16px; font-size: 16px; }}
  .hint {{ margin-top: 12px; font-size: 12px; color: #888; }}
</style></head>
<body><div class="box">
  <div class="icon">{icon}</div>
  <p>{message}</p>
  <p class="hint">This window can be closed.</p>
</div>
<script>
  if (window.opener) {{
    window.opener.postMessage({{ type: 'dropbox-oauth', success: {'true' if success else 'false'} }}, '*');
  }}
  setTimeout(() => window.close(), 3000);
</script>
</body></html>"""
