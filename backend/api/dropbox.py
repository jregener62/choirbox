"""Dropbox OAuth2 integration and file browsing endpoints."""

import secrets
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session

from backend.config import DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REDIRECT_URI
from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.user import User
from backend.api.auth import require_user, require_admin
from backend.schemas import ActionResponse

router = APIRouter(prefix="/dropbox", tags=["dropbox"])

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
def dropbox_authorize(user: User = Depends(require_admin)):
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
    """List files/folders at a Dropbox path. Filters to show only folders and MP3 files."""
    from backend.services.dropbox_service import get_dropbox_service

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    try:
        entries = await dbx.list_folder(path)
    except RuntimeError as e:
        if "path/not_found" in str(e):
            return {"path": path, "entries": [], "error": "Folder not found"}
        raise HTTPException(500, str(e))

    # Filter: only folders and MP3 files
    filtered = []
    for e in entries:
        tag = e.get(".tag", "")
        name = e.get("name", "")
        if tag == "folder":
            filtered.append({
                "name": name,
                "path": e.get("path_display", ""),
                "type": "folder",
            })
        elif tag == "file" and name.lower().endswith(".mp3"):
            filtered.append({
                "name": name,
                "path": e.get("path_display", ""),
                "type": "file",
                "size": e.get("size", 0),
                "modified": e.get("server_modified", ""),
            })

    # Sort: folders first, then files, both alphabetical
    filtered.sort(key=lambda x: (0 if x["type"] == "folder" else 1, x["name"].lower()))

    return {"path": path, "entries": filtered}


@router.get("/search")
async def dropbox_search(
    q: str = "",
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Search for MP3 files and folders by name."""
    from backend.services.dropbox_service import get_dropbox_service

    if not q or len(q) < 2:
        raise HTTPException(400, "Search query must be at least 2 characters")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox not connected")

    try:
        results = await dbx.search(q)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    entries = []
    for e in results:
        tag = e.get(".tag", "")
        name = e.get("name", "")
        if tag == "folder" or (tag == "file" and name.lower().endswith(".mp3")):
            entries.append({
                "name": name,
                "path": e.get("path_display", ""),
                "type": "folder" if tag == "folder" else "file",
                "size": e.get("size", 0) if tag == "file" else None,
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

    try:
        link = await dbx.get_temporary_link(path)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    return {"link": link, "expires_in": 14400}


@router.post("/disconnect")
def dropbox_disconnect(
    user: User = Depends(require_admin),
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
