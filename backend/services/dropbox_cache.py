"""In-memory TTL cache for Dropbox list_folder results.

Reduces redundant Dropbox API calls during browse operations.
A single /browse request can trigger 30+ list_folder calls (1 main + N for
.song sub-folder counts + N for reserved folder counts). This cache ensures
repeated calls for the same path within the TTL window are served from memory.
"""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Default TTL: 2 minutes
DEFAULT_TTL = 120

# Max cached paths to prevent unbounded memory growth
MAX_ENTRIES = 200


class _CacheEntry:
    __slots__ = ("entries", "cursor", "timestamp")

    def __init__(self, entries: list[dict], cursor: str, timestamp: float):
        self.entries = entries
        self.cursor = cursor
        self.timestamp = timestamp


class DropboxCache:
    """Simple in-memory TTL cache for Dropbox folder listings."""

    def __init__(self, ttl: int = DEFAULT_TTL):
        self.ttl = ttl
        self._store: dict[str, _CacheEntry] = {}

    def _normalize_key(self, path: str) -> str:
        """Normalize path for cache lookup (lowercase, strip trailing slash)."""
        return path.lower().rstrip("/") or "/"

    def get(self, path: str) -> Optional[tuple[list[dict], str]]:
        """Return (entries, cursor) if cached and fresh, else None."""
        key = self._normalize_key(path)
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.time() - entry.timestamp > self.ttl:
            del self._store[key]
            return None
        return entry.entries, entry.cursor

    def put(self, path: str, entries: list[dict], cursor: str = "") -> None:
        """Store folder listing in cache."""
        # Evict oldest entries if at capacity
        if len(self._store) >= MAX_ENTRIES:
            oldest_key = min(self._store, key=lambda k: self._store[k].timestamp)
            del self._store[oldest_key]

        key = self._normalize_key(path)
        self._store[key] = _CacheEntry(entries, cursor, time.time())

    def invalidate(self, path: str) -> None:
        """Remove a specific path from cache."""
        key = self._normalize_key(path)
        if key in self._store:
            del self._store[key]
            logger.debug("Cache invalidated: %s", path)

    def invalidate_tree(self, path: str) -> None:
        """Remove a path and its parent from cache.

        Used after mutations (upload, delete, rename) to ensure both the
        affected folder and its parent show fresh data.
        """
        self.invalidate(path)
        # Also invalidate parent
        parent = path.rsplit("/", 1)[0] if "/" in path.lstrip("/") else ""
        if parent or path != "":
            self.invalidate(parent)

    def clear(self) -> None:
        """Clear entire cache."""
        self._store.clear()
        logger.debug("Cache cleared")

    def get_cursor(self, path: str) -> Optional[str]:
        """Get the stored cursor for a path (for change detection)."""
        key = self._normalize_key(path)
        entry = self._store.get(key)
        return entry.cursor if entry else None


# Singleton instance shared across requests
folder_cache = DropboxCache()
