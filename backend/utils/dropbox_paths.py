"""Zentrale Pfad-Utilities fuer Dropbox-Pfade relativ zum Choir-Root.

Die App speichert alle Pfade choir-relativ (ohne den Dropbox-App-Folder-Root).
Um mit Dropbox-APIs zu sprechen, muss der Choir-Root-Folder vorne drangesetzt
werden. Diese Helper sind die einzige Stelle, an der diese Umwandlung passiert.

- `get_choir_root(user, session)` - ermittelt den Root-Ordner des Chores aus DB.
- `to_dropbox_path(user_path, root)` / `to_user_path(dropbox_path, root)` -
  reine Pfad-Umwandlungen mit bereits ermitteltem Root.
- `dropbox_folder_path(...)` / `dropbox_doc_path(...)` / `full_doc_path(...)` -
  Convenience-Wrapper, die intern `get_choir_root` aufrufen.
"""

from __future__ import annotations

from sqlmodel import Session

from backend.models.choir import Choir
from backend.models.document import Document
from backend.models.user import User


def get_choir_root(user: User, session: Session) -> str:
    """Choir's Dropbox subfolder (relative to Dropbox App root). '' ohne Choir."""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            return (choir.dropbox_root_folder or "").strip("/")
    return ""


def to_dropbox_path(user_path: str, root_folder: str) -> str:
    """User-visible path + root folder -> absolute Dropbox path.

    '' + 'Maennerchor'            -> '/Maennerchor'
    '/Stuecke' + 'Maennerchor'    -> '/Maennerchor/Stuecke'
    """
    parts = [p for p in [root_folder, user_path.strip("/")] if p]
    return "/" + "/".join(parts) if parts else ""


def to_user_path(dropbox_path: str, root_folder: str) -> str:
    """Absolute Dropbox path -> user-visible path (strips root folder)."""
    if root_folder:
        prefix = "/" + root_folder
        if dropbox_path == prefix or dropbox_path == prefix + "/":
            return ""
        if dropbox_path.startswith(prefix + "/"):
            return dropbox_path[len(prefix):]
    return dropbox_path


def dropbox_folder_path(folder_path: str, user: User, session: Session) -> str:
    """Build the full Dropbox path for a choir-relative folder."""
    return to_dropbox_path(folder_path, get_choir_root(user, session))


def dropbox_doc_path(
    folder_path: str, doc_name: str, user: User, session: Session
) -> str:
    """Build the full Dropbox path for a document in a choir-relative folder."""
    root = get_choir_root(user, session)
    parts = [p for p in [root, folder_path.strip("/"), doc_name] if p]
    return "/" + "/".join(parts)


def full_doc_path(doc: Document, user: User, session: Session) -> str:
    """Full Dropbox path for a document.

    Nutzt `doc.dropbox_path` wenn gesetzt (stabiler, deckt Renames ab),
    sonst Fallback auf `folder_path + original_name`.
    """
    root = get_choir_root(user, session)
    if doc.dropbox_path:
        parts = [p for p in [root, doc.dropbox_path.strip("/")] if p]
        return "/" + "/".join(parts)
    parts = [p for p in [root, doc.folder_path.strip("/"), doc.original_name] if p]
    return "/" + "/".join(parts)
