"""Admin API — user management and choir management."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.choir import Choir
from backend.models.user import User
from backend.api.auth import _hash_password, _valid_voice_parts, VALID_ROLES, MIN_PASSWORD_LENGTH
from backend.policy import require_permission
from backend.schemas import ActionResponse

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_VIEW_MODES = {"songs", "texts"}
# Rollen, fuer die view_mode angewendet wird. Chorleiter/Admin/Developer
# brauchen immer vollen Zugriff und werden im Bulk-Endpunkt uebersprungen.
VIEW_MODE_APPLICABLE_ROLES = {"member", "pro-member"}


@router.get("/users")
def list_users(user: User = Depends(require_permission("users.manage")), session: Session = Depends(get_session)):
    users = session.exec(select(User).where(User.choir_id == user.choir_id).order_by(User.created_at)).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role,
            "voice_part": u.voice_part,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "can_report_bugs": u.can_report_bugs,
            "view_mode": u.view_mode,
        }
        for u in users
    ]


@router.post("/users")
def create_user(data: dict, user: User = Depends(require_permission("users.manage")), session: Session = Depends(get_session)):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    voice_part = data.get("voice_part", "").strip()

    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")
    valid_parts = _valid_voice_parts(session, user.choir_id)
    if valid_parts and voice_part not in valid_parts:
        raise HTTPException(400, f"Stimmgruppe muss eine der folgenden sein: {', '.join(sorted(valid_parts))}")

    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(409, "Username already exists")

    role = data.get("role", "member")
    if role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")

    new_user = User(
        username=username,
        display_name=data.get("display_name", username),
        role=role,
        voice_part=voice_part,
        password_hash=_hash_password(password),
        choir_id=user.choir_id,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return ActionResponse.success(data={"id": new_user.id})


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    data: dict,
    user: User = Depends(require_permission("users.manage")),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target or target.choir_id != user.choir_id:
        raise HTTPException(404, "User not found")

    if "role" in data and data["role"] not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")

    if "view_mode" in data:
        if data["view_mode"] not in VALID_VIEW_MODES:
            raise HTTPException(400, f"view_mode must be one of: {', '.join(sorted(VALID_VIEW_MODES))}")
        target.view_mode = data["view_mode"]

    if "can_report_bugs" in data:
        from backend.api.auth import ROLE_HIERARCHY
        if ROLE_HIERARCHY.get(user.role, 0) < ROLE_HIERARCHY["developer"]:
            raise HTTPException(403, "Nur Developer koennen Bug-Reporting vergeben")
        target.can_report_bugs = bool(data["can_report_bugs"])

    for field in ["display_name", "role", "voice_part"]:
        if field in data:
            setattr(target, field, data[field])

    if "password" in data and data["password"]:
        if len(data["password"]) < MIN_PASSWORD_LENGTH:
            raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")
        target.password_hash = _hash_password(data["password"])

    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    return ActionResponse.success()


@router.post("/users/bulk-view-mode")
def bulk_view_mode(
    data: dict,
    user: User = Depends(require_permission("users.manage")),
    session: Session = Depends(get_session),
):
    """Setzt view_mode fuer mehrere Nutzer im eigenen Chor.

    Body:
      - view_mode: "songs" | "texts"
      - user_ids: Liste von User-IDs ODER "all-members" (shortcut fuer alle Member/Pro-Member im Chor)

    Chorleiter/Admin werden immer uebersprungen (sie brauchen vollen Zugriff).
    """
    view_mode = data.get("view_mode")
    if view_mode not in VALID_VIEW_MODES:
        raise HTTPException(400, f"view_mode must be one of: {', '.join(sorted(VALID_VIEW_MODES))}")

    user_ids = data.get("user_ids")
    if user_ids == "all-members":
        targets = session.exec(
            select(User).where(
                User.choir_id == user.choir_id,
                User.role.in_(list(VIEW_MODE_APPLICABLE_ROLES)),  # type: ignore[attr-defined]
            )
        ).all()
    elif isinstance(user_ids, list):
        if not user_ids:
            raise HTTPException(400, "user_ids darf nicht leer sein")
        targets = session.exec(
            select(User).where(User.choir_id == user.choir_id, User.id.in_(user_ids))  # type: ignore[attr-defined]
        ).all()
    else:
        raise HTTPException(400, "user_ids muss eine Liste sein oder 'all-members'")

    updated = 0
    skipped = 0
    now = datetime.utcnow()
    for target in targets:
        if target.role not in VIEW_MODE_APPLICABLE_ROLES:
            skipped += 1
            continue
        if target.view_mode != view_mode:
            target.view_mode = view_mode
            target.updated_at = now
            session.add(target)
            updated += 1
    session.commit()
    return ActionResponse.success(data={"updated": updated, "skipped": skipped})


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    user: User = Depends(require_permission("users.manage")),
    session: Session = Depends(get_session),
):
    from backend.models.favorite import Favorite
    from backend.models.user_label import UserLabel
    from backend.models.annotation import Annotation
    from backend.models.note import Note
    from backend.models.session_token import SessionToken
    from backend.models.user_hidden_document import UserHiddenDocument
    from backend.models.user_chord_preference import UserChordPreference
    from backend.models.user_selected_document import UserSelectedDocument
    from backend.models.guest_link import GuestLink

    target = session.get(User, user_id)
    if not target or target.choir_id != user.choir_id:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Cannot delete yourself")

    for model in [
        Favorite, UserLabel, Annotation, Note, SessionToken,
        UserHiddenDocument, UserChordPreference, UserSelectedDocument,
    ]:
        for row in session.exec(select(model).where(model.user_id == target.id)).all():
            session.delete(row)

    for link in session.exec(select(GuestLink).where(GuestLink.created_by_user_id == target.id)).all():
        session.delete(link)

    session.delete(target)
    session.commit()
    return ActionResponse.success()


@router.get("/settings")
def get_settings(user: User = Depends(require_permission("settings.manage")), session: Session = Depends(get_session)):
    choir = session.get(Choir, user.choir_id) if user.choir_id else None
    return {
        "invite_code": choir.invite_code if choir else None,
        "dropbox_root_folder": choir.dropbox_root_folder if choir else None,
    }


@router.put("/settings")
def update_settings(data: dict, user: User = Depends(require_permission("settings.manage")), session: Session = Depends(get_session)):
    if not user.choir_id:
        raise HTTPException(400, "Kein Chor zugeordnet")
    choir = session.get(Choir, user.choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")

    if "invite_code" in data:
        new_code = data["invite_code"].strip()
        if new_code and new_code != choir.invite_code:
            existing = session.exec(select(Choir).where(Choir.invite_code == new_code)).first()
            if existing:
                raise HTTPException(409, "Einladungscode bereits vergeben")
            choir.invite_code = new_code
    if "dropbox_root_folder" in data:
        choir.dropbox_root_folder = data["dropbox_root_folder"].strip() or None

    session.add(choir)
    session.commit()
    return ActionResponse.success()


# -- Choir management (developer only) --

@router.get("/choirs")
def list_choirs(user: User = Depends(require_permission("choirs.manage")), session: Session = Depends(get_session)):
    choirs = session.exec(select(Choir).order_by(Choir.created_at)).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "invite_code": c.invite_code,
            "dropbox_root_folder": c.dropbox_root_folder,
            "created_at": c.created_at.isoformat(),
        }
        for c in choirs
    ]


@router.post("/choirs")
def create_choir(data: dict, user: User = Depends(require_permission("choirs.manage")), session: Session = Depends(get_session)):
    name = data.get("name", "").strip()
    invite_code = data.get("invite_code", "").strip()
    dropbox_root_folder = data.get("dropbox_root_folder", "").strip() or None
    admin_username = data.get("admin_username", "").strip()
    admin_password = data.get("admin_password", "").strip()

    if not name or not invite_code:
        raise HTTPException(400, "name und invite_code sind erforderlich")
    if not admin_username or not admin_password:
        raise HTTPException(400, "Admin-Benutzername und -Passwort sind erforderlich")
    if len(admin_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")

    existing = session.exec(select(Choir).where(Choir.invite_code == invite_code)).first()
    if existing:
        raise HTTPException(409, "Einladungscode bereits vergeben")

    existing_user = session.exec(select(User).where(User.username == admin_username)).first()
    if existing_user:
        raise HTTPException(409, "Benutzername bereits vergeben")

    choir = Choir(name=name, invite_code=invite_code, dropbox_root_folder=dropbox_root_folder)
    session.add(choir)
    session.commit()
    session.refresh(choir)

    admin_user = User(
        username=admin_username,
        display_name=admin_username,
        role="admin",
        voice_part="Bass",
        password_hash=_hash_password(admin_password),
        choir_id=choir.id,
        must_change_password=True,
    )
    session.add(admin_user)
    session.commit()

    # Shared Gast-User fuer diesen Chor anlegen — der wird beim Einloesen
    # eines Guest-Links wiederverwendet.
    from backend.services.guest_link_service import get_or_create_guest_user
    get_or_create_guest_user(session, choir)

    return ActionResponse.success(data={"id": choir.id, "name": choir.name, "admin_username": admin_username})


@router.put("/choirs/{choir_id}")
def update_choir(choir_id: str, data: dict, user: User = Depends(require_permission("choirs.manage")), session: Session = Depends(get_session)):
    choir = session.get(Choir, choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")

    if "name" in data:
        choir.name = data["name"].strip()
    if "dropbox_root_folder" in data:
        choir.dropbox_root_folder = data["dropbox_root_folder"].strip() or None
    if "invite_code" in data:
        new_code = data["invite_code"].strip()
        if new_code and new_code != choir.invite_code:
            existing = session.exec(select(Choir).where(Choir.invite_code == new_code)).first()
            if existing:
                raise HTTPException(409, "Einladungscode bereits vergeben")
            choir.invite_code = new_code

    session.add(choir)
    session.commit()
    return ActionResponse.success()


@router.delete("/choirs/{choir_id}")
def delete_choir(choir_id: str, user: User = Depends(require_permission("choirs.manage")), session: Session = Depends(get_session)):
    """Delete a choir and ALL associated DB data (users, labels, etc.)."""
    from backend.models.favorite import Favorite
    from backend.models.user_label import UserLabel
    from backend.models.annotation import Annotation
    from backend.models.note import Note
    from backend.models.session_token import SessionToken
    from backend.models.user_hidden_document import UserHiddenDocument
    from backend.models.user_chord_preference import UserChordPreference
    from backend.models.user_selected_document import UserSelectedDocument
    from backend.models.guest_link import GuestLink
    from backend.models.label import Label
    from backend.models.section_preset import SectionPreset

    choir = session.get(Choir, choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")
    if user.choir_id == choir_id:
        raise HTTPException(400, "Eigenen aktiven Chor kann man nicht loeschen — zuerst Chor wechseln")

    # Collect user IDs of this choir
    choir_users = session.exec(select(User).where(User.choir_id == choir_id)).all()
    user_ids = [u.id for u in choir_users]

    # Delete user-dependent records
    if user_ids:
        for model in [
            Favorite, UserLabel, Annotation, Note, SessionToken,
            UserHiddenDocument, UserChordPreference, UserSelectedDocument,
        ]:
            for row in session.exec(select(model).where(model.user_id.in_(user_ids))).all():
                session.delete(row)
        for link in session.exec(select(GuestLink).where(GuestLink.created_by_user_id.in_(user_ids))).all():
            session.delete(link)

    # Delete users
    for u in choir_users:
        session.delete(u)

    # Delete choir-level records
    for model in [Label, SectionPreset]:
        for row in session.exec(select(model).where(model.choir_id == choir_id)).all():
            session.delete(row)

    # Delete choir
    session.delete(choir)
    session.commit()

    return ActionResponse.success(data={"deleted_users": len(user_ids)})


@router.post("/choirs/{choir_id}/switch")
def switch_choir(choir_id: str, user: User = Depends(require_permission("choirs.manage")), session: Session = Depends(get_session)):
    """Switch the developer's active choir."""
    choir = session.get(Choir, choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")

    user.choir_id = choir.id
    session.add(user)
    session.commit()
    session.refresh(user)

    from backend.api.auth import _user_response
    return ActionResponse.success(data=_user_response(user, session))


# ---------------------------------------------------------------------------
# Re-Sync: Full Dropbox ↔ DB reconciliation
# ---------------------------------------------------------------------------

def _strip_root(display_path: str, root: str) -> str:
    """Convert absolute Dropbox path to user-visible relative path."""
    rel = display_path
    if root:
        prefix = "/" + root + "/"
        if rel.lower().startswith(prefix.lower()):
            rel = rel[len(prefix):]
        elif rel.lower() == ("/" + root).lower():
            return ""
    else:
        rel = rel.lstrip("/")
    return rel


async def _count_document_sync_delta(
    folder_path: str, user: User, session: Session, dbx,
) -> tuple[int, int, int]:
    """Dry-Run-Variante von _sync_documents_from_dropbox.

    Vergleicht einen .tx-Ordner zwischen Dropbox und DB und zaehlt, wie viele
    Dokumente neu hinzugefuegt, aktualisiert oder entfernt wuerden. Schreibt
    nichts in die DB.
    """
    from backend.api.documents import _dropbox_folder_path
    from backend.models.document import Document
    from backend.services import document_service

    tx_folder = _dropbox_folder_path(folder_path, user, session)
    try:
        texte_entries = await dbx.list_folder(tx_folder)
    except Exception:
        texte_entries = []

    entries = [
        e for e in texte_entries
        if e.get(".tag") == "file" and document_service.detect_file_type(e.get("name", ""))
    ]

    existing = {
        d.original_name: d.content_hash
        for d in session.exec(
            select(Document).where(Document.folder_path == folder_path)
        ).all()
    }

    added = updated = removed = 0
    dbx_names: set[str] = set()
    for entry in entries:
        name = entry.get("name", "")
        if not document_service.detect_file_type(name):
            continue
        dbx_names.add(name)
        dbx_hash = entry.get("content_hash")
        if name not in existing:
            added += 1
        elif existing[name] != dbx_hash:
            updated += 1

    for name in existing:
        if name not in dbx_names:
            removed += 1

    return added, updated, removed


def _backup_sqlite_db(keep: int = 5) -> str | None:
    """Kopiert choirbox.db nach choirbox.db.bak-<timestamp> und behaelt nur die
    letzten `keep` Backups. Gibt den Pfad des neuen Backups zurueck, oder None,
    wenn die DB keine SQLite-Datei ist."""
    from pathlib import Path
    import shutil
    from datetime import datetime as _dt

    from backend.config import DATABASE_URL

    if not DATABASE_URL.startswith("sqlite:///"):
        return None

    db_path = Path(DATABASE_URL.removeprefix("sqlite:///"))
    if not db_path.exists():
        return None

    ts = _dt.utcnow().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(f"{db_path.name}.bak-{ts}")
    shutil.copy2(db_path, backup_path)

    # Nur die letzten `keep` Backups behalten
    backups = sorted(
        db_path.parent.glob(f"{db_path.name}.bak-*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[keep:]:
        try:
            old.unlink()
        except OSError:
            pass

    return str(backup_path)


@router.post("/resync")
async def resync_all(
    dry_run: bool = False,
    user: User = Depends(require_permission("settings.manage")),
    session: Session = Depends(get_session),
):
    """Full sync: scan the choir's Dropbox recursively and reconcile all DB records.

    Mit `?dry_run=true` laeuft der Resync als Simulation: es wird nur gezaehlt,
    welche Aenderungen vorgenommen wuerden, aber nichts in die DB geschrieben und
    kein DB-Backup erstellt.
    """
    from backend.models.document import Document
    from backend.models.audio_duration import AudioDuration
    from backend.models.favorite import Favorite
    from backend.models.user_label import UserLabel
    from backend.models.note import Note
    from backend.models.section import Section
    from backend.services import document_service
    from backend.api.documents import (
        _sync_documents_from_dropbox, _get_root_folder,
    )
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.folder_types import get_reserved_type

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    # --- Step 0: Vor echtem Resync DB-Backup ziehen ---
    backup_file: str | None = None
    if not dry_run:
        try:
            backup_file = _backup_sqlite_db()
        except Exception:
            # Backup-Fehler darf den Resync nicht blockieren, aber wir wollen
            # wissen, dass es schiefging.
            backup_file = None

    # --- Step 1: Recursive listing of entire choir Dropbox ---
    root = _get_root_folder(user, session)
    root_path = "/" + root if root else ""
    try:
        result = await dbx.api_call("files/list_folder", {
            "path": root_path or "",
            "recursive": True,
        })
        entries = result.get("entries", [])
        while result.get("has_more"):
            result = await dbx.api_call("files/list_folder/continue", {
                "cursor": result["cursor"],
            })
            entries.extend(result.get("entries", []))
    except Exception:
        raise HTTPException(502, "Dropbox-Listing fehlgeschlagen")

    # Build sets of all valid paths (user-visible, relative to root)
    dbx_file_paths: set[str] = set()
    dbx_folder_paths: set[str] = set()
    texte_folder_paths: set[str] = set()
    # path → file_id Mapping fuer .song-Ordner (stabiler Anker fuer Phase 3)
    song_folder_ids: dict[str, str] = {}
    # Phase 4: file_id-Sets fuer ID-basierte Orphan-Erkennung
    dbx_file_ids: set[str] = set()
    dbx_folder_ids: set[str] = set()

    from backend.services.folder_types import is_song_folder

    for e in entries:
        rel = _strip_root(e.get("path_display", ""), root)
        tag = e.get(".tag", "")
        file_id = e.get("id")
        if tag == "file":
            dbx_file_paths.add(rel)
            if file_id:
                dbx_file_ids.add(file_id)
        elif tag == "folder":
            dbx_folder_paths.add(rel)
            if file_id:
                dbx_folder_ids.add(file_id)
            name = e.get("name", "")
            # Track Texte folders for document sync
            if get_reserved_type(name) == "texte":
                texte_folder_paths.add(rel)
            # Track .song folders for the songs-Tabelle
            if is_song_folder(name) and file_id:
                song_folder_ids[rel] = file_id

    stats = {
        "dry_run": dry_run,
        "synced_folders": 0,
        "added": 0,
        "updated": 0,
        "removed": 0,
    }
    if backup_file:
        stats["backup_file"] = backup_file

    # --- Step 2: Sync documents (.tx folders) ---
    for fp in texte_folder_paths:
        if dry_run:
            added, updated, removed = await _count_document_sync_delta(
                fp, user, session, dbx,
            )
            stats["added"] += added
            stats["updated"] += updated
            stats["removed"] += removed
        else:
            before = {
                d.original_name: d.content_hash
                for d in session.exec(
                    select(Document).where(Document.folder_path == fp)
                ).all()
            }

            await _sync_documents_from_dropbox(fp, user, session)

            after = {
                d.original_name: d.content_hash
                for d in session.exec(
                    select(Document).where(Document.folder_path == fp)
                ).all()
            }

            for name in after:
                if name not in before:
                    stats["added"] += 1
                elif after[name] != before[name]:
                    stats["updated"] += 1
            for name in before:
                if name not in after:
                    stats["removed"] += 1
        stats["synced_folders"] += 1

    # --- Step 2b: songs-Tabelle pflegen + Sections/Documents an song_id binden ---
    from backend.models.song import Song
    from backend.services import song_service

    matched_song_ids: set[int] = set()
    for fp, file_id in song_folder_ids.items():
        if dry_run:
            existing = song_service.get_song_by_file_id(session, file_id)
            if not existing:
                stats["added"] += 1
            elif existing.folder_path != fp or existing.status == "orphan":
                stats["updated"] += 1
            continue
        song = song_service.upsert_song(session, fp, file_id)
        matched_song_ids.add(song.id)
        # Sections und Documents im selben Pfad an song_id binden
        for sec in session.exec(
            select(Section).where(Section.folder_path == fp)
        ).all():
            if sec.song_id != song.id:
                sec.song_id = song.id
                session.add(sec)
        for d in session.exec(
            select(Document).where(Document.folder_path.like(fp + "/%"))
        ).all():
            if d.song_id != song.id:
                d.song_id = song.id
                session.add(d)
        if matched_song_ids:
            session.commit()

    # Songs ohne Match in den dbx-IDs als orphan markieren
    if not dry_run:
        for song in session.exec(select(Song).where(Song.status == "active")).all():
            if song.dropbox_file_id and song.dropbox_file_id not in song_folder_ids.values():
                song_service.mark_orphan(session, song)

    # Clean up documents whose .tx folder no longer exists in Dropbox
    db_doc_folders = set(
        d.folder_path for d in session.exec(select(Document)).all()
    )
    for fp in db_doc_folders - texte_folder_paths:
        for doc in session.exec(
            select(Document).where(Document.folder_path == fp)
        ).all():
            if not dry_run:
                document_service.delete_document(doc.id, session)
            stats["removed"] += 1

    # --- Step 3: Parse file metadata (audio + documents) ---
    from backend.models.audio_meta import AudioMeta
    from backend.services.audio_meta_service import sync_audio_meta, MEDIA_EXTENSIONS
    media_paths = [p for p in dbx_file_paths if any(p.lower().endswith(ext) for ext in MEDIA_EXTENSIONS)]
    if dry_run:
        # Nur zaehlen, wie viele Medien AudioMeta haetten
        stats["meta_synced"] = len(media_paths)
    else:
        meta_count = sync_audio_meta(session, user.choir_id, media_paths)
        stats["meta_synced"] = meta_count

    # --- Step 4: Clean up orphaned records for deleted files/folders ---
    # Phase-4-Strategie: Wenn ein Row eine stabile ID hat (audio_file_id /
    # target_file_id / dropbox_file_id auf documents/songs), wird per ID
    # gematcht — der Pfad spielt fuer die Orphan-Entscheidung dann keine
    # Rolle mehr (Renames bleiben erhalten). Nur Rows ohne ID fallen auf
    # den alten Pfad-Vergleich zurueck.

    # AudioMeta — bisher nur Pfad-basiert (Phase 5 stellt auf id um)
    for meta in session.exec(select(AudioMeta)).all():
        if meta.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(meta)
            stats["removed"] += 1

    # AudioDurations — bisher nur Pfad-basiert
    for dur in session.exec(select(AudioDuration)).all():
        if dur.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(dur)
            stats["removed"] += 1

    # Favorites — primaer per ID
    for fav in session.exec(select(Favorite)).all():
        et = fav.entry_type or "file"
        if fav.audio_file_id:
            valid = fav.audio_file_id in dbx_file_ids
        elif fav.document_id is not None:
            doc = session.get(Document, fav.document_id)
            valid = doc is not None
        elif fav.song_id is not None:
            from backend.models.song import Song as _S
            s = session.get(_S, fav.song_id)
            valid = s is not None and s.status == "active"
        else:
            # Legacy: nur Pfad
            valid = (
                fav.dropbox_path in dbx_folder_paths
                if et in ("folder", "song")
                else fav.dropbox_path in dbx_file_paths
            )
        if not valid:
            if not dry_run:
                session.delete(fav)
            stats["removed"] += 1

    # UserLabels — primaer per target_file_id
    for ul in session.exec(select(UserLabel)).all():
        if ul.target_file_id:
            valid = ul.target_file_id in dbx_file_ids
        else:
            valid = ul.dropbox_path in dbx_file_paths
        if not valid:
            if not dry_run:
                session.delete(ul)
            stats["removed"] += 1

    # Notes — primaer per target_file_id
    for note in session.exec(select(Note)).all():
        if note.target_file_id:
            valid = note.target_file_id in dbx_file_ids
        else:
            valid = note.dropbox_path in dbx_file_paths
        if not valid:
            if not dry_run:
                session.delete(note)
            stats["removed"] += 1

    # Sections — bevorzugt ueber song_id (Status=active reicht)
    for sec in session.exec(select(Section)).all():
        if sec.song_id is not None:
            from backend.models.song import Song as _S
            s = session.get(_S, sec.song_id)
            valid = s is not None and s.status == "active"
        else:
            valid = sec.folder_path in dbx_folder_paths
        if not valid:
            if not dry_run:
                session.delete(sec)
            stats["removed"] += 1

    if dry_run:
        session.rollback()
    else:
        session.commit()

    return ActionResponse.success(data=stats)


# ---------------------------------------------------------------------------
# Datenpflege: Orphan-Verwaltung (Phase 4)
# ---------------------------------------------------------------------------

@router.get("/datacare/orphans")
def list_orphans(
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    """Liefert Orphans pro Tabelle.

    - songs: Songs mit status='orphan'. Pro Eintrag die Anzahl angehaengter
      Sections, Documents, Favorites, Notes, UserLabels, UserSelectedDocuments.
    - documents: Documents ohne dropbox_file_id (Backfill nicht aufgeloest).
    - user_data: Favorites/Notes/UserLabels ohne stabile ID (Legacy).
    """
    from backend.models.document import Document
    from backend.models.favorite import Favorite
    from backend.models.note import Note
    from backend.models.section import Section
    from backend.models.song import Song
    from backend.models.user_chord_preference import UserChordPreference
    from backend.models.user_hidden_document import UserHiddenDocument
    from backend.models.user_label import UserLabel
    from backend.models.user_selected_document import UserSelectedDocument
    from backend.models.annotation import Annotation
    from backend.services import document_service  # noqa: F401

    # User-Scoping: nur Choere des aktuellen Admins (Songs gehoeren keinem
    # einzelnen User, aber wir filtern Documents/Sections nach Pfad-Praefix
    # waere zu fragil — Phase 4 macht das choir-uebergreifend; in der Praxis
    # hat ein Admin nur einen Choir).

    orphan_songs = session.exec(
        select(Song).where(Song.status == "orphan").order_by(Song.folder_path)
    ).all()

    def _song_summary(s: Song) -> dict:
        sec_count = len(session.exec(
            select(Section).where(Section.song_id == s.id)
        ).all())
        doc_count = len(session.exec(
            select(Document).where(Document.song_id == s.id)
        ).all())
        fav_count = len(session.exec(
            select(Favorite).where(Favorite.song_id == s.id)
        ).all())
        return {
            "id": s.id,
            "folder_path": s.folder_path,
            "name": s.name,
            "dropbox_file_id": s.dropbox_file_id,
            "sections": sec_count,
            "documents": doc_count,
            "favorites": fav_count,
        }

    orphan_documents = session.exec(
        select(Document).where(Document.dropbox_file_id == None)  # noqa: E711
    ).all()

    def _doc_summary(d: Document) -> dict:
        ann_count = len(session.exec(
            select(Annotation).where(Annotation.document_id == d.id)
        ).all())
        chord_count = len(session.exec(
            select(UserChordPreference).where(UserChordPreference.document_id == d.id)
        ).all())
        sel_count = len(session.exec(
            select(UserSelectedDocument).where(UserSelectedDocument.document_id == d.id)
        ).all())
        hidden_count = len(session.exec(
            select(UserHiddenDocument).where(UserHiddenDocument.document_id == d.id)
        ).all())
        return {
            "id": d.id,
            "folder_path": d.folder_path,
            "original_name": d.original_name,
            "annotations": ann_count,
            "chord_prefs": chord_count,
            "selections": sel_count,
            "hidden": hidden_count,
        }

    legacy_favorites = session.exec(
        select(Favorite).where(
            Favorite.audio_file_id == None,  # noqa: E711
            Favorite.document_id == None,  # noqa: E711
            Favorite.song_id == None,  # noqa: E711
        )
    ).all()
    legacy_notes = session.exec(
        select(Note).where(Note.target_file_id == None)  # noqa: E711
    ).all()
    legacy_user_labels = session.exec(
        select(UserLabel).where(UserLabel.target_file_id == None)  # noqa: E711
    ).all()

    return {
        "songs": [_song_summary(s) for s in orphan_songs],
        "documents": [_doc_summary(d) for d in orphan_documents],
        "user_data": {
            "favorites": [
                {"id": f.id, "user_id": f.user_id, "dropbox_path": f.dropbox_path,
                 "entry_type": f.entry_type or "file"}
                for f in legacy_favorites
            ],
            "notes": [
                {"id": n.id, "user_id": n.user_id, "dropbox_path": n.dropbox_path}
                for n in legacy_notes
            ],
            "user_labels": [
                {"id": u.id, "user_id": u.user_id, "dropbox_path": u.dropbox_path,
                 "label_id": u.label_id}
                for u in legacy_user_labels
            ],
        },
    }


@router.delete("/datacare/song/{song_id}")
def delete_orphan_song(
    song_id: int,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    """Loescht einen orphan-Song endgueltig samt Sections/Documents/Favorites/etc.

    Documents-Loeschung ueber document_service.delete_document, damit alle
    abhaengigen Per-User-Settings (UserSelectedDocument, UserChordPreference,
    UserHiddenDocument, Annotation) sauber mit aufgeraeumt werden.
    """
    from backend.models.song import Song
    from backend.models.document import Document
    from backend.models.favorite import Favorite
    from backend.models.section import Section
    from backend.services import document_service

    song = session.get(Song, song_id)
    if not song or song.status != "orphan":
        raise HTTPException(404, "Orphan-Song nicht gefunden")

    counts = {"sections": 0, "documents": 0, "favorites": 0}
    for sec in session.exec(select(Section).where(Section.song_id == song_id)).all():
        session.delete(sec)
        counts["sections"] += 1
    for d in session.exec(select(Document).where(Document.song_id == song_id)).all():
        document_service.delete_document(d.id, session)
        counts["documents"] += 1
    for f in session.exec(select(Favorite).where(Favorite.song_id == song_id)).all():
        session.delete(f)
        counts["favorites"] += 1
    session.delete(song)
    session.commit()
    return ActionResponse.success(data=counts)


@router.post("/datacare/song/{song_id}/reactivate")
async def reactivate_orphan_song(
    song_id: int,
    data: dict,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    """Bindet einen orphan-Song an einen anderen Dropbox-Ordnerpfad an.

    Body: { "folder_path": "..." } — der choir-relative Pfad eines Ordners,
    der noch eine gueltige Dropbox-File-ID hat. Wir holen die ID per
    get_metadata, ueberschreiben dropbox_file_id und folder_path und setzen
    den Status zurueck auf 'active'.
    """
    from backend.models.song import Song
    from backend.api.documents import _dropbox_folder_path
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services import song_service

    new_path = (data.get("folder_path") or "").strip().lstrip("/")
    if not new_path:
        raise HTTPException(400, "folder_path erforderlich")

    song = session.get(Song, song_id)
    if not song or song.status != "orphan":
        raise HTTPException(404, "Orphan-Song nicht gefunden")

    dbx = get_dropbox_service(session)
    if not dbx:
        raise HTTPException(400, "Dropbox nicht verbunden")

    full = _dropbox_folder_path(new_path, user, session)
    meta = await dbx.get_metadata(full)
    if not meta or meta.get(".tag") != "folder":
        raise HTTPException(404, "Dropbox-Ordner nicht gefunden")

    file_id = meta.get("id")
    song.folder_path = new_path
    song.dropbox_file_id = file_id
    song.status = "active"
    song.name = song_service._name_from_path(new_path)
    session.add(song)
    session.commit()
    return ActionResponse.success(data={"id": song.id, "folder_path": new_path})


@router.delete("/datacare/document/{doc_id}")
def delete_orphan_document(
    doc_id: int,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    """Loescht ein Document, das beim Backfill keine Dropbox-File-ID kriegen
    konnte (Datei in Dropbox bereits weg)."""
    from backend.models.document import Document
    from backend.services import document_service

    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    if doc.dropbox_file_id:
        raise HTTPException(400, "Dokument hat eine gueltige Dropbox-ID, kein Orphan")
    document_service.delete_document(doc_id, session)
    return ActionResponse.success()


@router.delete("/datacare/user-data/favorite/{favorite_id}")
def delete_orphan_favorite(
    favorite_id: int,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    from backend.models.favorite import Favorite
    fav = session.get(Favorite, favorite_id)
    if not fav:
        raise HTTPException(404, "Favorit nicht gefunden")
    session.delete(fav)
    session.commit()
    return ActionResponse.success()


@router.delete("/datacare/user-data/note/{note_id}")
def delete_orphan_note(
    note_id: int,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    from backend.models.note import Note
    n = session.get(Note, note_id)
    if not n:
        raise HTTPException(404, "Notiz nicht gefunden")
    session.delete(n)
    session.commit()
    return ActionResponse.success()


@router.delete("/datacare/user-data/user-label/{ul_id}")
def delete_orphan_user_label(
    ul_id: int,
    user: User = Depends(require_permission("datacare.manage")),
    session: Session = Depends(get_session),
):
    from backend.models.user_label import UserLabel
    u = session.get(UserLabel, ul_id)
    if not u:
        raise HTTPException(404, "Label-Zuweisung nicht gefunden")
    session.delete(u)
    session.commit()
    return ActionResponse.success()


@router.get("/backup-status")
def backup_status(
    user: User = Depends(require_permission("dropbox.connect")),
    session: Session = Depends(get_session),
):
    from backend.models.app_settings import AppSettings
    settings = session.get(AppSettings, 1)
    if not settings:
        return {"last_backup_at": None, "last_backup_size": None, "last_backup_error": None}
    return {
        "last_backup_at": settings.last_backup_at.isoformat() if settings.last_backup_at else None,
        "last_backup_size": settings.last_backup_size,
        "last_backup_error": settings.last_backup_error,
    }
