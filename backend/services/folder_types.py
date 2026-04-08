"""Folder type registry — .song extension + reserved folder names.

Song folders use a '.song' extension (e.g. 'Fragile.song').
Inside songs, reserved folder names (Texte, Audio, Videos, Multitrack)
determine content type.  This module is the single source of truth.
"""

from backend.api.auth import ROLE_HIERARCHY

# --- Song extension ---
SONG_EXTENSION = "song"
TRASH_FOLDER_NAME = "Trash"

# --- Reserved folder names (canonical casing) → metadata ---
RESERVED_FOLDERS: dict[str, dict] = {
    "Texte":      {"type": "texte",      "label": "Texte",      "admin_only": False},
    "Audio":      {"type": "audio",      "label": "Audio",      "admin_only": False},
    "Videos":     {"type": "videos",     "label": "Videos",     "admin_only": False},
    "Multitrack": {"type": "multitrack", "label": "Multitrack", "admin_only": False},
    "Chordsheets": {"type": "chordsheets", "label": "Akkorde", "admin_only": False},
}

# Quick lookup: lowercase → canonical name
_RESERVED_LOOKUP: dict[str, str] = {k.lower(): k for k in RESERVED_FOLDERS}


def parse_folder_name(name: str) -> tuple[str, str | None]:
    """Parse a folder name into (display_name, folder_type).

    >>> parse_folder_name("Fragile.song")
    ('Fragile', 'song')
    >>> parse_folder_name("Texte")
    ('Texte', 'texte')
    >>> parse_folder_name("Konzert im Juni")
    ('Konzert im Juni', None)
    """
    # Check reserved name first
    reserved = get_reserved_type(name)
    if reserved:
        return name, reserved

    # Check .song extension
    if "." in name:
        base, ext = name.rsplit(".", 1)
        if ext.lower() == SONG_EXTENSION and base:
            return base, SONG_EXTENSION
    return name, None


def is_reserved_name(name: str) -> bool:
    """Check if name is a reserved folder name (case-insensitive)."""
    return name.lower() in _RESERVED_LOOKUP


def get_reserved_type(name: str) -> str | None:
    """Get the type for a reserved folder name, or None."""
    canonical = _RESERVED_LOOKUP.get(name.lower())
    if canonical:
        return RESERVED_FOLDERS[canonical]["type"]
    return None


def get_canonical_reserved_name(name: str) -> str | None:
    """Get the canonical (correctly-cased) reserved name, or None."""
    return _RESERVED_LOOKUP.get(name.lower())


def is_song_folder(name: str) -> bool:
    """Check if name has the .song extension."""
    if "." in name:
        _, ext = name.rsplit(".", 1)
        return ext.lower() == SONG_EXTENSION
    return False


def get_parent_folder_type(path: str) -> str | None:
    """Return the folder type of the last path segment."""
    segment = path.rstrip("/").rsplit("/", 1)[-1] if path.strip("/") else ""
    _, ft = parse_folder_name(segment)
    return ft


def get_visible_reserved_types(user_role: str) -> set[str]:
    """Return reserved types visible to the given role."""
    user_level = ROLE_HIERARCHY.get(user_role, 0)
    admin_level = ROLE_HIERARCHY.get("admin", 4)
    return {
        meta["type"]
        for meta in RESERVED_FOLDERS.values()
        if not meta["admin_only"] or user_level >= admin_level
    }
