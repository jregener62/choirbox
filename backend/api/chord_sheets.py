"""Chord Sheets API — import, CRUD, and transposition preferences.

Imported PDFs are stored in Dropbox under the song's Chordsheets/ folder.
Additionally, a .txt export of the parsed chords is saved alongside the PDF.
"""

import json
import logging
from pydantic import BaseModel
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from sqlmodel import Session

from backend.database import get_session
from backend.api.auth import require_user, require_role
from backend.models.user import User
from backend.models.choir import Choir
from backend.schemas import ActionResponse
from backend.services import chord_sheet_service as svc
from backend.services.chord_parser import parse_pdf_to_chord_sheet
from backend.services.chord_transposer import transpose_parsed_content

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/chord-sheets", tags=["chord-sheets"])


# --- Dropbox helpers ---

def _get_root_folder(user: User, session: Session) -> str:
    """Get the choir's Dropbox subfolder."""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            return (choir.dropbox_root_folder or "").strip("/")
    return ""


def _build_dropbox_path(user_path: str, filename: str, user: User, session: Session) -> str:
    """Build full Dropbox path from user-visible path + filename."""
    root = _get_root_folder(user, session)
    parts = [p for p in [root, user_path.strip("/"), filename] if p]
    return "/" + "/".join(parts)


def _build_chordsheets_folder(song_folder_path: str) -> str:
    """Get the Chordsheets subfolder path for a song folder."""
    return song_folder_path.rstrip("/") + "/Chordsheets"


def _export_to_text(title: str, original_key: str, parsed_content: dict) -> str:
    """Generate a plain-text chord sheet from parsed content.

    Format: chords positioned above lyrics, with section headers.
    """
    lines = []
    lines.append(f"# {title}")
    if original_key:
        lines.append(f"# Tonart: {original_key}")
    lines.append("")

    for section in parsed_content.get("sections", []):
        if section.get("label"):
            lines.append(section["label"])
        for line in section.get("lines", []):
            chords = line.get("chords", [])
            text = line.get("text", "")

            if chords:
                # Build chord line with proper spacing
                chord_line = [" "] * max(
                    (max(c["col"] + len(c["chord"]) for c in chords) if chords else 0),
                    len(text) + 1,
                )
                for c in chords:
                    col = c["col"]
                    chord = c["chord"]
                    for i, ch in enumerate(chord):
                        if col + i < len(chord_line):
                            chord_line[col + i] = ch
                        else:
                            chord_line.append(ch)
                lines.append("".join(chord_line).rstrip())

            if text:
                lines.append(text)

        lines.append("")  # Blank line between sections

    return "\n".join(lines)


async def _upload_to_dropbox(
    session: Session,
    user: User,
    song_folder_path: str,
    pdf_bytes: bytes | None,
    pdf_filename: str,
    title: str,
    original_key: str,
    parsed_content: dict,
) -> tuple[str | None, str | None]:
    """Upload PDF and text export to Dropbox Chordsheets/ folder.

    Returns (pdf_dropbox_path, txt_dropbox_path) or (None, None) on failure.
    """
    from backend.services.dropbox_service import get_dropbox_service

    dbx = get_dropbox_service(session)
    if not dbx:
        return None, None

    chordsheets_path = _build_chordsheets_folder(song_folder_path)

    # Ensure Chordsheets/ folder exists
    chordsheets_dbx = _build_dropbox_path(chordsheets_path, "", user, session).rstrip("/")
    try:
        await dbx.create_folder(chordsheets_dbx)
    except RuntimeError:
        pass  # Already exists

    pdf_dbx_path = None
    txt_dbx_path = None

    # Upload original PDF
    if pdf_bytes and pdf_filename:
        try:
            pdf_full = _build_dropbox_path(chordsheets_path, pdf_filename, user, session)
            await dbx.upload_file(pdf_bytes, pdf_full)
            pdf_dbx_path = chordsheets_path.strip("/") + "/" + pdf_filename
            _log.info("Uploaded chord PDF: %s", pdf_full)
        except Exception as e:
            _log.warning("Failed to upload chord PDF: %s", e)

    # Export and upload text version
    try:
        txt_content = _export_to_text(title, original_key, parsed_content)
        txt_filename = _safe_filename(title) + ".txt"
        txt_full = _build_dropbox_path(chordsheets_path, txt_filename, user, session)
        await dbx.upload_file(txt_content.encode("utf-8"), txt_full)
        txt_dbx_path = chordsheets_path.strip("/") + "/" + txt_filename
        _log.info("Uploaded chord text export: %s", txt_full)
    except Exception as e:
        _log.warning("Failed to upload chord text: %s", e)

    return pdf_dbx_path, txt_dbx_path


def _safe_filename(title: str) -> str:
    """Create a filesystem-safe filename from a title."""
    import re
    safe = re.sub(r'[^\w\s\-äöüÄÖÜß]', '', title)
    safe = re.sub(r'\s+', ' ', safe).strip()
    return safe or "Akkordblatt"


# --- Import ---

# Store PDF bytes temporarily between parse and confirm steps
_pdf_cache: dict[str, bytes] = {}


@router.post("/import/parse")
async def parse_pdf(
    file: UploadFile = File(...),
    user: User = Depends(require_role("pro-member")),
):
    """Upload a PDF and return parsed chord sheet for review.

    Step 1 of the import flow: parse → review → confirm.
    PDF bytes are cached for the confirm step (Dropbox upload).
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        return ActionResponse.failure("Nur PDF-Dateien werden unterstützt.")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        return ActionResponse.failure("PDF ist zu groß (max. 10 MB).")

    try:
        result = parse_pdf_to_chord_sheet(pdf_bytes, file.filename)
    except ValueError as e:
        return ActionResponse.failure(str(e))
    except Exception:
        return ActionResponse.failure(
            "Fehler beim Parsen des PDFs. Bitte prüfe das Format."
        )

    # Cache PDF bytes for the confirm step (keyed by filename + user)
    cache_key = f"{user.id}:{file.filename}"
    _pdf_cache[cache_key] = pdf_bytes

    # Limit cache size (max 10 entries)
    while len(_pdf_cache) > 10:
        _pdf_cache.pop(next(iter(_pdf_cache)))

    return ActionResponse.success(data=result)


class ConfirmImportBody(BaseModel):
    folder: str
    title: str
    original_key: str = ""
    parsed_content: dict
    source_filename: str = ""


@router.post("/import")
async def confirm_import_body(
    body: ConfirmImportBody,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Save a chord sheet: DB entry + Dropbox upload (PDF + text export)."""

    # Retrieve cached PDF bytes
    cache_key = f"{user.id}:{body.source_filename}"
    pdf_bytes = _pdf_cache.pop(cache_key, None)

    # Upload to Dropbox (PDF + text export)
    pdf_dbx_path, txt_dbx_path = await _upload_to_dropbox(
        session=session,
        user=user,
        song_folder_path=body.folder,
        pdf_bytes=pdf_bytes,
        pdf_filename=body.source_filename,
        title=body.title,
        original_key=body.original_key,
        parsed_content=body.parsed_content,
    )

    # Save to database
    cs = svc.create_chord_sheet(
        session=session,
        song_folder_path=body.folder,
        title=body.title,
        parsed_content=body.parsed_content,
        original_key=body.original_key,
        source_filename=body.source_filename,
        choir_id=user.choir_id or "",
        created_by=user.id,
    )

    return ActionResponse.success(data=svc.chord_sheet_to_dict(cs))


# --- List & Read ---

@router.get("/list")
async def list_sheets(
    folder: str = Query(..., description="Song folder path"),
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """List all chord sheets in a song folder."""
    sheets = svc.list_chord_sheets(session, folder)
    result = []
    for cs in sheets:
        pref = svc.get_user_preference(session, user.id, cs.id)
        result.append(svc.chord_sheet_to_dict(cs, pref))
    return ActionResponse.success(data=result)


@router.get("/{chord_sheet_id}")
async def get_sheet(
    chord_sheet_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Get a single chord sheet with user's transposition preference."""
    cs = svc.get_chord_sheet(session, chord_sheet_id)
    if not cs:
        raise HTTPException(404, "Chord Sheet nicht gefunden.")

    pref = svc.get_user_preference(session, user.id, cs.id)
    return ActionResponse.success(data=svc.chord_sheet_to_dict(cs, pref))


# --- Update & Delete ---

class UpdateChordSheetBody(BaseModel):
    title: Optional[str] = None
    parsed_content: Optional[dict] = None
    original_key: Optional[str] = None


@router.put("/{chord_sheet_id}")
async def update_sheet(
    chord_sheet_id: int,
    body: UpdateChordSheetBody,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Update a chord sheet (title, content, key). Re-exports text to Dropbox."""
    cs = svc.get_chord_sheet(session, chord_sheet_id)
    if not cs:
        raise HTTPException(404, "Chord Sheet nicht gefunden.")

    cs = svc.update_chord_sheet(
        session, cs,
        title=body.title,
        parsed_content=body.parsed_content,
        original_key=body.original_key,
    )

    # Re-export text to Dropbox
    content = json.loads(cs.parsed_content) if isinstance(cs.parsed_content, str) else cs.parsed_content
    await _upload_to_dropbox(
        session=session,
        user=user,
        song_folder_path=cs.song_folder_path,
        pdf_bytes=None,
        pdf_filename="",
        title=cs.title,
        original_key=cs.original_key or "",
        parsed_content=content,
    )

    pref = svc.get_user_preference(session, user.id, cs.id)
    return ActionResponse.success(data=svc.chord_sheet_to_dict(cs, pref))


@router.delete("/{chord_sheet_id}")
async def delete_sheet(
    chord_sheet_id: int,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Delete a chord sheet from DB. Files in Dropbox remain (manual cleanup)."""
    cs = svc.get_chord_sheet(session, chord_sheet_id)
    if not cs:
        raise HTTPException(404, "Chord Sheet nicht gefunden.")

    svc.delete_chord_sheet(session, cs)
    return ActionResponse.success()


# --- User Transposition Preference ---

class TranspositionBody(BaseModel):
    semitones: int


@router.put("/{chord_sheet_id}/preference")
async def set_preference(
    chord_sheet_id: int,
    body: TranspositionBody,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Save user's preferred transposition for a chord sheet."""
    cs = svc.get_chord_sheet(session, chord_sheet_id)
    if not cs:
        raise HTTPException(404, "Chord Sheet nicht gefunden.")

    if not -12 <= body.semitones <= 12:
        return ActionResponse.failure("Transposition muss zwischen -12 und +12 liegen.")

    pref = svc.set_user_preference(session, user.id, chord_sheet_id, body.semitones)

    return ActionResponse.success(data={
        "chord_sheet_id": chord_sheet_id,
        "transposition_semitones": pref.transposition_semitones,
    })
