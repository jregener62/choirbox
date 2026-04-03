"""Folder type registry — defines recognized folder types by name extension.

Folder names like 'Fragile.song' or 'texte.tx' carry a type-identifying
extension.  This module is the single source of truth for known types.
"""

from backend.api.auth import ROLE_HIERARCHY

# Extension (without dot) → metadata
FOLDER_TYPES: dict[str, dict] = {
    "song":  {"label": "Musikstück", "admin_only": False},
    "tx":    {"label": "Texte",      "admin_only": False},
    "audio":      {"label": "Audio",      "admin_only": False},
    "multitrack": {"label": "Multitrack", "admin_only": False},
}

FOLDER_TYPE_EXTENSIONS = set(FOLDER_TYPES.keys())


def parse_folder_name(name: str) -> tuple[str, str | None]:
    """Parse a folder name into (display_name, folder_type).

    >>> parse_folder_name("Fragile.song")
    ('Fragile', 'song')
    >>> parse_folder_name("Konzert im Juni")
    ('Konzert im Juni', None)
    >>> parse_folder_name("texte.tx")
    ('texte', 'tx')
    """
    if "." in name:
        base, ext = name.rsplit(".", 1)
        if ext.lower() in FOLDER_TYPE_EXTENSIONS and base:
            return base, ext.lower()
    return name, None


def get_folder_type(name: str) -> str | None:
    """Extract folder type from a name, or None."""
    _, ft = parse_folder_name(name)
    return ft


def is_typed_path(path: str) -> bool:
    """Check if the last segment of *path* has a recognized folder type."""
    segment = path.rstrip("/").rsplit("/", 1)[-1] if path.strip("/") else ""
    return get_folder_type(segment) is not None


def get_parent_folder_type(path: str) -> str | None:
    """Return the folder type of the last path segment (the current folder)."""
    segment = path.rstrip("/").rsplit("/", 1)[-1] if path.strip("/") else ""
    return get_folder_type(segment)


def get_visible_types(user_role: str) -> set[str]:
    """Return the set of folder type extensions visible to *user_role*."""
    user_level = ROLE_HIERARCHY.get(user_role, 0)
    admin_level = ROLE_HIERARCHY.get("admin", 4)
    return {
        ext
        for ext, meta in FOLDER_TYPES.items()
        if not meta["admin_only"] or user_level >= admin_level
    }
