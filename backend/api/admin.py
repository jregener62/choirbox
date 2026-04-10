"""Admin API — user management and choir management."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.choir import Choir
from backend.models.user import User
from backend.api.auth import require_admin, require_role, _hash_password, _valid_voice_parts, VALID_ROLES
from backend.schemas import ActionResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
def list_users(user: User = Depends(require_admin), session: Session = Depends(get_session)):
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
        }
        for u in users
    ]


@router.post("/users")
def create_user(data: dict, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    voice_part = data.get("voice_part", "").strip()

    if not username or not password:
        raise HTTPException(400, "Username and password required")
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
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target or target.choir_id != user.choir_id:
        raise HTTPException(404, "User not found")

    if "role" in data and data["role"] not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")

    if "can_report_bugs" in data:
        from backend.api.auth import ROLE_HIERARCHY
        if ROLE_HIERARCHY.get(user.role, 0) < ROLE_HIERARCHY["developer"]:
            raise HTTPException(403, "Nur Developer koennen Bug-Reporting vergeben")
        target.can_report_bugs = bool(data["can_report_bugs"])

    for field in ["display_name", "role", "voice_part"]:
        if field in data:
            setattr(target, field, data[field])

    if "password" in data and data["password"]:
        target.password_hash = _hash_password(data["password"])

    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    return ActionResponse.success()


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target or target.choir_id != user.choir_id:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Cannot delete yourself")

    session.delete(target)
    session.commit()
    return ActionResponse.success()


@router.get("/settings")
def get_settings(user: User = Depends(require_admin), session: Session = Depends(get_session)):
    choir = session.get(Choir, user.choir_id) if user.choir_id else None
    return {
        "invite_code": choir.invite_code if choir else None,
        "dropbox_root_folder": choir.dropbox_root_folder if choir else None,
    }


@router.put("/settings")
def update_settings(data: dict, user: User = Depends(require_admin), session: Session = Depends(get_session)):
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
def list_choirs(user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
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
def create_choir(data: dict, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
    name = data.get("name", "").strip()
    invite_code = data.get("invite_code", "").strip()
    dropbox_root_folder = data.get("dropbox_root_folder", "").strip() or None
    admin_username = data.get("admin_username", "").strip()
    admin_password = data.get("admin_password", "").strip()

    if not name or not invite_code:
        raise HTTPException(400, "name und invite_code sind erforderlich")
    if not admin_username or not admin_password:
        raise HTTPException(400, "Admin-Benutzername und -Passwort sind erforderlich")

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

    return ActionResponse.success(data={"id": choir.id, "name": choir.name, "admin_username": admin_username})


@router.put("/choirs/{choir_id}")
def update_choir(choir_id: str, data: dict, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
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
def delete_choir(choir_id: str, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
    """Delete a choir and ALL associated DB data (users, labels, etc.)."""
    from backend.models.favorite import Favorite
    from backend.models.user_label import UserLabel
    from backend.models.annotation import Annotation
    from backend.models.note import Note
    from backend.models.session_token import SessionToken
    from backend.models.user_hidden_document import UserHiddenDocument
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
        for model in [Favorite, UserLabel, Annotation, Note, SessionToken, UserHiddenDocument]:
            for row in session.exec(select(model).where(model.user_id.in_(user_ids))).all():
                session.delete(row)

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
def switch_choir(choir_id: str, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
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
    user: User = Depends(require_admin),
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

    for e in entries:
        rel = _strip_root(e.get("path_display", ""), root)
        tag = e.get(".tag", "")
        if tag == "file":
            dbx_file_paths.add(rel)
        elif tag == "folder":
            dbx_folder_paths.add(rel)
            # Track Texte folders for document sync
            if get_reserved_type(e.get("name", "")) == "texte":
                texte_folder_paths.add(rel)

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
    # AudioMeta
    for meta in session.exec(select(AudioMeta)).all():
        if meta.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(meta)
            stats["removed"] += 1

    # AudioDurations
    for dur in session.exec(select(AudioDuration)).all():
        if dur.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(dur)
            stats["removed"] += 1

    # Favorites
    for fav in session.exec(select(Favorite)).all():
        valid = (
            fav.dropbox_path in dbx_folder_paths
            if fav.entry_type == "folder"
            else fav.dropbox_path in dbx_file_paths
        )
        if not valid:
            if not dry_run:
                session.delete(fav)
            stats["removed"] += 1

    # UserLabels
    for ul in session.exec(select(UserLabel)).all():
        if ul.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(ul)
            stats["removed"] += 1

    # Notes
    for note in session.exec(select(Note)).all():
        if note.dropbox_path not in dbx_file_paths:
            if not dry_run:
                session.delete(note)
            stats["removed"] += 1

    # Sections
    for sec in session.exec(select(Section)).all():
        if sec.folder_path not in dbx_folder_paths:
            if not dry_run:
                session.delete(sec)
            stats["removed"] += 1

    if dry_run:
        session.rollback()
    else:
        session.commit()

    return ActionResponse.success(data=stats)
