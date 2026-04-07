"""GitHub Issue integration — create and list issues via GitHub API."""

import logging
import time
from typing import Optional

import httpx

from backend.config import GITHUB_TOKEN, GITHUB_REPO

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# Simple in-memory cache for issue listing
_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL = 60  # seconds


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def is_configured() -> bool:
    return bool(GITHUB_TOKEN and GITHUB_REPO)


async def create_issue(
    title: str,
    body: str,
    labels: list[str],
) -> dict:
    """Create a GitHub issue. Returns the created issue data."""
    if not is_configured():
        raise RuntimeError("GitHub not configured (GITHUB_TOKEN / GITHUB_REPO missing)")

    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/issues"
    payload = {"title": title, "body": body, "labels": labels}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=_headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()

    # Invalidate cache after creating
    _cache.clear()

    logger.info("GitHub issue #%s created: %s", data.get("number"), title)
    return {
        "number": data["number"],
        "title": data["title"],
        "html_url": data["html_url"],
        "state": data["state"],
    }


async def list_issues(state: str = "all") -> list[dict]:
    """List issues from the configured repo. Cached for CACHE_TTL seconds."""
    if not is_configured():
        return []

    cache_key = f"issues_{state}"
    cached = _cache.get(cache_key)
    if cached and (time.time() - cached[0]) < CACHE_TTL:
        return cached[1]

    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/issues"
    params = {"state": state, "per_page": 50, "sort": "created", "direction": "desc"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=_headers(), timeout=15)
        resp.raise_for_status()
        raw = resp.json()

    # Filter out pull requests (GitHub API returns PRs as issues too)
    issues = [
        {
            "number": i["number"],
            "title": i["title"],
            "state": i["state"],
            "html_url": i["html_url"],
            "labels": [l["name"] for l in i.get("labels", [])],
            "created_at": i["created_at"],
            "user": i["user"]["login"] if i.get("user") else None,
        }
        for i in raw
        if "pull_request" not in i
    ]

    _cache[cache_key] = (time.time(), issues)
    return issues
