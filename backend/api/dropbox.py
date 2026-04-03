"""Dropbox OAuth2 integration and file browsing endpoints."""

import secrets
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session

from backend.config import DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REDIRECT_URI
from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.choir import Choir
from backend.models.user import User
from backend.api.auth import require_user, require_admin, require_role
from backend.schemas import ActionResponse

router = APIRouter(prefix="/dropbox", tags=["dropbox"])

_oauth_states: dict[str, str] = {}


def _get_root_folder(user: User, session: Session) -> str:
    """Get the choir's Dropbox subfolder (relative to Dropbox App folder root)."""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            return (choir.dropbox_root_folder or "").strip("/")
    return ""


def _to_dropbox_path(user_path: str, root_folder: str) -> str:
    """User-visible path -> actual Dropbox path. '' + 'Männerchor' -> '/Männerchor'"""
    parts = [p for p in [root_folder, user_path.strip("/")] if p]
    return "/" + "/".join(parts) if parts else ""


def _to_user_path(dropbox_path: str, root_folder: str) -> str:
    """Actual Dropbox path -> user-visible path. '/Männerchor/Stücke' -> '/Stücke'"""
    if root_folder:
        prefix = "/" + root_folder
        if dropbox_path == prefix or dropbox_path == prefix + "/":
            return ""
        if dropbox_path.startswith(prefix + "/"):
            return dropbox_path[len(prefix):]
    return dropbox_path


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
    user: User = Depends(require_user),
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
def dropbox_authorize(user: User = Depends(require_role("developer"))):
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

    settings = _get_or_create_settings(session)
    settings.dropbox_refresh_token = refresh_token
    settings.dropbox_account_id = account_id
    settings.dropbox_account_email = account_email
    settings.dropbox_connected_at = datetime.utcnow()
    session.add(settings)
    session.commit()

    # Redirect back to the app settings page
    # In dev mode Vite runs on :5174, in production the app is on the same port
    from backend.config import BASE_DIR
    react_index = BASE_DIR / "static" / "react" / "index.html"
    if react_index.exists():
        # Production: app served from same origin
        return RedirectResponse("/#/settings?dropbox=connected")
    else:
        # Dev mode: redirect to Vite dev server
        return RedirectResponse("http://localhost:5174/#/settings?dropbox=connected")


@router.get("/browse")
async def dropbox_browse(
    path: str = "",
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """List files/folders at a Dropbox path with folder-type awareness."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import (
        parse_folder_name, get_parent_folder_type, is_reserved_name,
        get_visible_reserved_types,
    )
    from backend.services.document_service import ALL_DOC_EXTENSIONS

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    dropbox_path = _to_dropbox_path(path, root_folder)

    try:
        entries = await dbx.list_folder(dropbox_path)
    except RuntimeError as e:
        if "path/not_found" in str(e):
            return {"path": path, "entries": [], "root_name": root_folder or None, "error": "Folder not found"}
        raise HTTPException(500, str(e))

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
        user_path = _to_user_path(e.get("path_display", ""), root_folder)

        if tag == "folder":
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

    # Create synthetic entries for reserved folders + count their contents
    for reserved_name, reserved_path in reserved_found.items():
        _, folder_type = parse_folder_name(reserved_name)
        count = 0
        try:
            sub_dbx = _to_dropbox_path(reserved_path, root_folder)
            sub_entries = await dbx.list_folder(sub_dbx)
            count = sum(1 for e in sub_entries if e.get(".tag") == "file")
        except Exception:
            pass
        filtered.append({
            "name": reserved_name,
            "display_name": reserved_name,
            "path": reserved_path,
            "type": "folder",
            "folder_type": folder_type,
            "doc_count": count,
            "reserved": True,
        })

    # Enrich document entries with doc_id from DB
    if parent_type == "texte":
        from sqlmodel import select as sql_select
        from backend.models.document import Document
        docs_in_folder = {
            d.original_name: d.id
            for d in session.exec(
                sql_select(Document).where(Document.folder_path == path)
            ).all()
        }
        for entry in filtered:
            if entry.get("type") == "document":
                entry["doc_id"] = docs_in_folder.get(entry["name"])

    # Sort: containers, .song folders, reserved (synthetic) entries, documents, files
    type_order = {"folder": 0, "document": 1, "file": 2}
    folder_type_order = {None: 0, "song": 1, "texte": 2, "audio": 3, "videos": 4, "multitrack": 5}
    filtered.sort(key=lambda x: (
        type_order.get(x["type"], 9),
        folder_type_order.get(x.get("folder_type"), 5),
        (x.get("display_name") or x["name"]).lower(),
    ))

    # Attach cached durations
    from backend.services.audio_duration_service import get_durations_for_paths
    file_paths = [e["path"] for e in filtered if e["type"] == "file"]
    durations = get_durations_for_paths(session, file_paths)
    for e in filtered:
        if e["type"] == "file" and e["path"] in durations:
            e["duration"] = durations[e["path"]]

    return {"path": path, "entries": filtered, "root_name": root_folder or None}


@router.get("/search")
async def dropbox_search(
    q: str = "",
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Search for MP3 files and folders by name."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import parse_folder_name, is_reserved_name

    if not q or len(q) < 2:
        raise HTTPException(400, "Search query must be at least 2 characters")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    search_path = ("/" + root_folder) if root_folder else ""

    try:
        results = await dbx.search(q, path=search_path)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    from backend.services.document_service import ALL_DOC_EXTENSIONS
    media_exts = (".mp3", ".webm", ".m4a", ".mp4")
    allowed_exts = media_exts + ALL_DOC_EXTENSIONS
    entries = []
    for e in results:
        tag = e.get(".tag", "")
        name = e.get("name", "")
        if tag == "folder":
            if is_reserved_name(name):
                continue  # Don't show reserved folders in search results
            display_name, folder_type = parse_folder_name(name)
            entries.append({
                "name": name,
                "display_name": display_name,
                "path": _to_user_path(e.get("path_display", ""), root_folder),
                "type": "folder",
                "folder_type": folder_type,
            })
        elif tag == "file" and name.lower().endswith(allowed_exts):
            entry_type = "document" if name.lower().endswith(ALL_DOC_EXTENSIONS) else "file"
            entries.append({
                "name": name,
                "display_name": name,
                "path": _to_user_path(e.get("path_display", ""), root_folder),
                "type": entry_type,
                "size": e.get("size", 0),
            })

    return {"query": q, "entries": entries}


@router.get("/stream")
async def dropbox_stream(
    path: str = "",
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Get a temporary streaming link for audio playback (4h valid)."""
    from backend.services.dropbox_service import get_dropbox_service

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    dropbox_path = _to_dropbox_path(path, root_folder)

    try:
        link = await dbx.get_temporary_link(dropbox_path)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    return {"link": link, "expires_in": 14400}


@router.post("/upload")
async def dropbox_upload(
    file: UploadFile = File(...),
    target_path: str = Form(...),
    user: User = Depends(require_role("pro-member")),
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

    root_folder = _get_root_folder(user, session)

    if target_path and not target_path.startswith("/"):
        target_path = "/" + target_path

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
        sub_dbx = _to_dropbox_path(target_path, root_folder)
        try:
            await dbx.create_folder(sub_dbx)
        except RuntimeError:
            pass  # Already exists

    full_target = _to_dropbox_path(target_path, root_folder)
    dropbox_path = f"{full_target}/{filename}".replace("//", "/")

    try:
        result = await dbx.upload_file(content, dropbox_path)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    return ActionResponse.success(data={
        "name": result.get("name", filename),
        "path": _to_user_path(result.get("path_display", dropbox_path), root_folder),
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
                import logging
                logging.getLogger(__name__).error("SoundFont not found: %s", soundfont)
                return None

            wav_path = src_path.rsplit(".", 1)[0] + ".wav"
            proc = await asyncio.create_subprocess_exec(
                "fluidsynth", "-ni", soundfont, src_path, "-F", wav_path, "-r", "44100",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

            if proc.returncode != 0:
                import logging
                logging.getLogger(__name__).error("FluidSynth error: %s", stderr.decode())
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
            import logging
            logging.getLogger(__name__).error("FFmpeg error: %s", stderr.decode())
            return None

        with open(dst_path, "rb") as f:
            return f.read()
    except FileNotFoundError as e:
        import logging
        logging.getLogger(__name__).error("External tool not found (%s) — cannot convert", e)
        return None
    except asyncio.TimeoutError:
        import logging
        logging.getLogger(__name__).error("Conversion timeout")
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
    user: User = Depends(require_role("chorleiter")),
    session: Session = Depends(get_session),
):
    """Delete a file from Dropbox. Requires Chorleiter or Admin role."""
    from backend.services.dropbox_service import get_dropbox_service

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    dropbox_path = _to_dropbox_path(path, root_folder)

    try:
        result = await dbx.delete_file(dropbox_path)
    except RuntimeError as e:
        if "path_lookup/not_found" in str(e):
            raise HTTPException(404, "Datei nicht gefunden")
        raise HTTPException(502, str(e))

    # Cleanup associated DB records
    from backend.services.cleanup_service import cleanup_file
    cleanup_file(path, session)

    metadata = result.get("metadata", {})
    return ActionResponse.success(data={
        "name": metadata.get("name", ""),
        "path": _to_user_path(metadata.get("path_display", path), root_folder),
    })


@router.post("/folder")
async def dropbox_create_folder(
    data: dict,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Create a new folder in Dropbox. Requires Admin role."""
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import is_reserved_name

    name = (data.get("name") or "").strip()
    path = data.get("path", "")
    if not name:
        raise HTTPException(400, "Ordnername ist erforderlich")
    if is_reserved_name(name):
        raise HTTPException(400, f"'{name}' ist ein reservierter Ordnername")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    parent = _to_dropbox_path(path, root_folder)
    full_path = f"{parent}/{name}".replace("//", "/")

    try:
        result = await dbx.create_folder(full_path)
    except RuntimeError as e:
        if "path/conflict" in str(e):
            raise HTTPException(409, "Ordner existiert bereits")
        raise HTTPException(502, str(e))

    return ActionResponse.success(data={
        "name": result.get("name", name),
        "path": _to_user_path(result.get("path_display", full_path), root_folder),
    })


@router.delete("/folder")
async def dropbox_delete_folder(
    path: str = "",
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Delete an empty folder from Dropbox. Requires Admin role."""
    from backend.services.dropbox_service import get_dropbox_service

    if not path:
        raise HTTPException(400, "path is required")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    dropbox_path = _to_dropbox_path(path, root_folder)

    # Check if folder is empty
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

    # Cleanup associated DB records (sections, documents, etc.)
    from backend.services.cleanup_service import cleanup_folder
    cleanup_folder(path, session)

    return ActionResponse.success()


@router.post("/rename")
async def dropbox_rename(
    data: dict,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Rename a file or folder in Dropbox. Requires Admin role."""
    from backend.services.dropbox_service import get_dropbox_service

    path = (data.get("path") or "").strip()
    new_name = (data.get("new_name") or "").strip()
    if not path or not new_name:
        raise HTTPException(400, "path und new_name sind erforderlich")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    root_folder = _get_root_folder(user, session)
    from_dropbox = _to_dropbox_path(path, root_folder)

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

    return ActionResponse.success(data={
        "name": result.get("name", new_name),
        "path": _to_user_path(result.get("path_display", to_dropbox), root_folder),
    })


@router.post("/duration")
def report_duration(
    data: dict,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Cache a track's audio duration (reported by the frontend)."""
    from backend.services.audio_duration_service import save_duration

    path = (data.get("path") or "").strip()
    duration = data.get("duration")
    if not path or not isinstance(duration, (int, float)) or duration <= 0:
        raise HTTPException(400, "path and positive duration required")

    save_duration(session, path, float(duration))
    return ActionResponse.success()


@router.post("/disconnect")
def dropbox_disconnect(
    user: User = Depends(require_role("developer")),
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
