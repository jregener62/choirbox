"""Dropbox API service with automatic token refresh."""

import asyncio
import json
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)
from sqlmodel import Session

from backend.config import DROPBOX_APP_KEY, DROPBOX_APP_SECRET
from backend.models.app_settings import AppSettings


class DropboxService:
    """Wraps Dropbox API calls with automatic access token management."""

    def __init__(self, refresh_token: str):
        self.refresh_token = refresh_token
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    async def _get_access_token(self) -> str:
        """Get a valid access token, refreshing if needed."""
        if self._access_token and self._token_expires_at > time.time() + 300:
            return self._access_token

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.dropboxapi.com/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                    "client_id": DROPBOX_APP_KEY,
                    "client_secret": DROPBOX_APP_SECRET,
                },
            )

        if resp.status_code != 200:
            raise RuntimeError(f"Dropbox token refresh failed: {resp.text}")

        data = resp.json()
        self._access_token = data["access_token"]
        self._token_expires_at = time.time() + data.get("expires_in", 14400)
        return self._access_token

    async def api_call(self, endpoint: str, body: dict, max_retries: int = 5) -> dict:
        """Make an authenticated Dropbox API call with auto-retry on 401 and rate limits."""
        token = await self._get_access_token()

        for attempt in range(max_retries + 1):
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"https://api.dropboxapi.com/2/{endpoint}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )

                if resp.status_code == 401:
                    self._access_token = None
                    token = await self._get_access_token()
                    resp = await client.post(
                        f"https://api.dropboxapi.com/2/{endpoint}",
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json",
                        },
                        json=body,
                    )

            if resp.status_code == 200:
                return resp.json()

            resp_text = resp.text
            if attempt < max_retries and (
                "too_many_write_operations" in resp_text
                or "too_many_requests" in resp_text
                or resp.status_code == 429
            ):
                delay = 2 ** attempt
                logger.warning(
                    "Dropbox rate limit on %s (HTTP %d, attempt %d/%d), retrying in %ds",
                    endpoint, resp.status_code, attempt + 1, max_retries, delay,
                )
                await asyncio.sleep(delay)
                continue

            raise RuntimeError(f"Dropbox API error ({endpoint}): {resp.text}")

        raise RuntimeError(f"Dropbox API error ({endpoint}): max retries exceeded")

    async def upload_file(self, file_content: bytes, dropbox_path: str, max_retries: int = 3) -> dict:
        """Upload a file to Dropbox via the simple upload endpoint (max 150 MB).

        Uses content.dropboxapi.com with binary body + Dropbox-API-Arg header.
        Includes 401 auto-refresh and rate-limit retry with exponential backoff.
        """
        token = await self._get_access_token()

        api_arg = json.dumps({
            "path": dropbox_path,
            "mode": "add",
            "autorename": True,
            "mute": False,
        })

        for attempt in range(max_retries + 1):
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": api_arg,
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://content.dropboxapi.com/2/files/upload",
                    headers=headers,
                    content=file_content,
                )

            if resp.status_code == 401:
                self._access_token = None
                token = await self._get_access_token()
                headers["Authorization"] = f"Bearer {token}"
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        "https://content.dropboxapi.com/2/files/upload",
                        headers=headers,
                        content=file_content,
                    )

            if resp.status_code == 200:
                return resp.json()

            resp_text = resp.text
            if attempt < max_retries and (
                "too_many_write_operations" in resp_text
                or "too_many_requests" in resp_text
                or resp.status_code == 429
            ):
                delay = 2 ** attempt
                logger.warning(
                    "Dropbox rate limit on upload (HTTP %d, attempt %d/%d), retrying in %ds",
                    resp.status_code, attempt + 1, max_retries, delay,
                )
                await asyncio.sleep(delay)
                continue

            raise RuntimeError(f"Dropbox upload error: {resp_text}")

        raise RuntimeError("Dropbox upload error: max retries exceeded")

    # -- High-level helpers --

    async def list_folder(self, path: str, use_cache: bool = True) -> list[dict]:
        """List files and folders at a Dropbox path with full pagination.

        Results are cached in-memory with a 2-minute TTL. Pass use_cache=False
        to bypass the cache (e.g. after mutations or manual refresh).
        """
        from backend.services.dropbox_cache import folder_cache

        if use_cache:
            cached = folder_cache.get(path)
            if cached is not None:
                logger.debug("list_folder cache hit: %s", path)
                return cached[0]  # entries

        try:
            result = await self.api_call("files/list_folder", {"path": path})
        except RuntimeError as e:
            if "path/not_found" in str(e):
                folder_cache.put(path, [])
                return []
            raise
        entries = result.get("entries", [])
        cursor = result.get("cursor", "")

        page = 1
        while result.get("has_more"):
            page += 1
            logger.info("list_folder %s: fetching page %d", path, page)
            result = await self.api_call("files/list_folder/continue", {
                "cursor": result["cursor"],
            })
            entries.extend(result.get("entries", []))
            cursor = result.get("cursor", cursor)

        folder_cache.put(path, entries, cursor)
        return entries

    async def list_folder_recursive(self, path: str, use_cache: bool = True) -> list[dict]:
        """Recursively list all entries under a Dropbox path and pre-populate the per-folder cache.

        Makes a single Dropbox API call with recursive=True (plus pagination),
        then splits entries by parent directory and stores each group in folder_cache.
        Returns the top-level entries (direct children of path) for immediate use.
        """
        from backend.services.dropbox_cache import folder_cache
        from collections import defaultdict

        # If top-level path is already cached, skip the recursive call
        if use_cache:
            cached = folder_cache.get(path)
            if cached is not None:
                logger.debug("list_folder_recursive cache hit (top-level): %s", path)
                return cached[0]

        result = await self.api_call("files/list_folder", {
            "path": path,
            "recursive": True,
        })
        all_entries = result.get("entries", [])

        page = 1
        while result.get("has_more"):
            page += 1
            logger.info("list_folder_recursive %s: fetching page %d", path, page)
            result = await self.api_call("files/list_folder/continue", {
                "cursor": result["cursor"],
            })
            all_entries.extend(result.get("entries", []))

        # Group entries by parent directory, track all folder paths
        by_parent: dict[str, list[dict]] = defaultdict(list)
        folder_paths: set[str] = set()
        for entry in all_entries:
            entry_path = entry.get("path_lower", "")
            if "/" in entry_path.lstrip("/"):
                parent = entry_path.rsplit("/", 1)[0]
            else:
                parent = ""
            by_parent[parent].append(entry)
            if entry.get(".tag") == "folder":
                folder_paths.add(entry_path)

        # Populate per-folder cache
        for parent_path, entries in by_parent.items():
            folder_cache.put(parent_path, entries)

        # Pre-populate empty cache entries for leaf folders (no children)
        for folder_path in folder_paths:
            if folder_path not in by_parent:
                folder_cache.put(folder_path, [])

        # Return top-level entries
        normalized = path.lower().rstrip("/") or ""
        return by_parent.get(normalized, [])

    async def search(self, query: str, path: str = "") -> list[dict]:
        """Search for files by name."""
        body = {
            "query": query,
            "options": {
                "max_results": 50,
                "file_extensions": ["mp3", "webm", "m4a"],
            },
        }
        if path:
            body["options"]["path"] = path

        result = await self.api_call("files/search_v2", body)
        return [
            match.get("metadata", {}).get("metadata", {})
            for match in result.get("matches", [])
        ]

    async def get_temporary_link(self, dropbox_path: str) -> str:
        """Get a temporary direct-download link for a Dropbox file (4h valid)."""
        result = await self.api_call("files/get_temporary_link", {
            "path": dropbox_path,
        })
        return result["link"]

    async def delete_file(self, dropbox_path: str) -> dict:
        """Delete a file or folder from Dropbox."""
        return await self.api_call("files/delete_v2", {"path": dropbox_path})

    async def create_folder(self, path: str) -> dict:
        """Create a folder in Dropbox."""
        result = await self.api_call("files/create_folder_v2", {"path": path})
        return result.get("metadata", {})

    async def move_file(self, from_path: str, to_path: str) -> dict:
        """Move/rename a file or folder in Dropbox."""
        result = await self.api_call("files/move_v2", {
            "from_path": from_path,
            "to_path": to_path,
        })
        return result.get("metadata", {})

    async def get_account_info(self) -> dict:
        """Get current account info (for connection test)."""
        token = await self._get_access_token()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.dropboxapi.com/2/users/get_current_account",
                headers={"Authorization": f"Bearer {token}"},
                content="null",
            )
        if resp.status_code != 200:
            raise RuntimeError(f"Dropbox account info failed: {resp.text}")
        return resp.json()


def get_dropbox_service(session: Session) -> Optional[DropboxService]:
    """Get a DropboxService instance from app settings, or None if not connected."""
    settings = session.get(AppSettings, 1)
    if not settings or not settings.dropbox_refresh_token:
        return None
    return DropboxService(refresh_token=settings.dropbox_refresh_token)
