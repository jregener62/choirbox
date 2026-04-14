"""Draft service — Pro-Member-verwaltete Draft/Entwurf-Markierungen.

Eintraege, die als Draft markiert sind, sind fuer Rollen unter pro-member
unsichtbar (Listing, Suche, Counts). Ab pro-member bekommen sie ein
``is_draft: true``-Flag und werden im UI als "Entwurf" gerendert.
"""

from __future__ import annotations

from typing import Iterable, Optional

from sqlmodel import Session, select

from backend.models.draft_entry import DraftEntry
from backend.policy import get_policy


KIND_DOCUMENT = "document"
KIND_PATH = "path"
VALID_KINDS = (KIND_DOCUMENT, KIND_PATH)

DRAFT_PERMISSION = "drafts.manage"


# --- role helpers ---

def can_manage_drafts(role: str) -> bool:
    ok, _ = get_policy().can(role, DRAFT_PERMISSION)
    return ok


def can_see_drafts(role: str) -> bool:
    # Wer setzen darf, darf auch sehen. Das deckt pro-member+ ab.
    return can_manage_drafts(role)


# --- ref normalisation ---

def normalize_path(path: str) -> str:
    """Normalize a Dropbox path for draft lookup.

    Rules:
      * strip surrounding whitespace
      * ensure leading slash
      * strip trailing slashes
      * lowercase (Dropbox itself is case-insensitive)
    """
    p = (path or "").strip()
    if not p.startswith("/"):
        p = "/" + p
    p = p.rstrip("/")
    return p.lower()


def _document_ref(doc_id: int) -> str:
    return str(int(doc_id))


# --- loading ---

class DraftSet:
    """In-memory snapshot of all drafts for a choir.

    Cheap hash-set lookup — load once per request, then reuse.
    """

    __slots__ = ("document_ids", "paths")

    def __init__(self, document_ids: set[int], paths: set[str]):
        self.document_ids = document_ids
        self.paths = paths

    def has_document(self, doc_id: Optional[int]) -> bool:
        return doc_id is not None and int(doc_id) in self.document_ids

    def has_path(self, path: Optional[str]) -> bool:
        if not path:
            return False
        return normalize_path(path) in self.paths

    def is_empty(self) -> bool:
        return not self.document_ids and not self.paths


def load_drafts(session: Session, choir_id: Optional[str]) -> DraftSet:
    """Load all draft refs for the choir. Call once per request."""
    entries = session.exec(
        select(DraftEntry).where(DraftEntry.choir_id == choir_id)
    ).all()
    doc_ids: set[int] = set()
    paths: set[str] = set()
    for e in entries:
        if e.kind == KIND_DOCUMENT:
            try:
                doc_ids.add(int(e.ref))
            except (TypeError, ValueError):
                continue
        elif e.kind == KIND_PATH:
            paths.add(normalize_path(e.ref))
    return DraftSet(doc_ids, paths)


# --- toggle ---

def set_draft(
    session: Session,
    *,
    choir_id: Optional[str],
    kind: str,
    ref: str,
    user_id: str,
) -> DraftEntry:
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid kind: {kind}")
    stored_ref = normalize_path(ref) if kind == KIND_PATH else str(ref).strip()
    if not stored_ref:
        raise ValueError("Empty ref")

    existing = session.exec(
        select(DraftEntry).where(
            DraftEntry.choir_id == choir_id,
            DraftEntry.kind == kind,
            DraftEntry.ref == stored_ref,
        )
    ).first()
    if existing:
        return existing
    entry = DraftEntry(
        choir_id=choir_id,
        kind=kind,
        ref=stored_ref,
        created_by=user_id,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def unset_draft(
    session: Session,
    *,
    choir_id: Optional[str],
    kind: str,
    ref: str,
) -> bool:
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid kind: {kind}")
    stored_ref = normalize_path(ref) if kind == KIND_PATH else str(ref).strip()
    entries = session.exec(
        select(DraftEntry).where(
            DraftEntry.choir_id == choir_id,
            DraftEntry.kind == kind,
            DraftEntry.ref == stored_ref,
        )
    ).all()
    removed = False
    for e in entries:
        session.delete(e)
        removed = True
    if removed:
        session.commit()
    return removed


def list_drafts(session: Session, choir_id: Optional[str]) -> list[DraftEntry]:
    return list(session.exec(
        select(DraftEntry).where(DraftEntry.choir_id == choir_id)
    ).all())


# --- filtering helpers for listing/search endpoints ---

def filter_documents(
    docs: Iterable[dict],
    drafts: DraftSet,
    can_see: bool,
) -> list[dict]:
    """Filter a list of document dicts.

    ``docs`` must have an ``id`` key. For callers that can see drafts, we
    annotate ``is_draft``. For callers that cannot, draft documents are
    dropped entirely.
    """
    out: list[dict] = []
    for d in docs:
        is_draft = drafts.has_document(d.get("id"))
        if is_draft and not can_see:
            continue
        if is_draft:
            d = {**d, "is_draft": True}
        out.append(d)
    return out


def filter_dropbox_entries(
    entries: Iterable[dict],
    drafts: DraftSet,
    can_see: bool,
    *,
    path_key: str = "path_display",
) -> list[dict]:
    """Filter Dropbox-style entries (folders, files) by draft path."""
    out: list[dict] = []
    for e in entries:
        path = e.get(path_key) or e.get("path_lower") or e.get("path")
        is_draft = drafts.has_path(path)
        if is_draft and not can_see:
            continue
        if is_draft:
            e = {**e, "is_draft": True}
        out.append(e)
    return out


def is_draft_browse_entry(entry: dict, drafts: DraftSet) -> bool:
    """True wenn der Eintrag (Browse/Search-Format) als Draft markiert ist.

    Prueft sowohl doc_id als auch path, damit sowohl Documents als auch
    Files/Folders/Songs abgedeckt sind.
    """
    if drafts.has_document(entry.get("doc_id")):
        return True
    return drafts.has_path(entry.get("path"))


def filter_browse_entries(
    entries: Iterable[dict],
    drafts: DraftSet,
    can_see: bool,
) -> list[dict]:
    """Filter Browse/Search-Entries (mit path und optional doc_id)."""
    out: list[dict] = []
    for e in entries:
        draft_hit = is_draft_browse_entry(e, drafts)
        if draft_hit and not can_see:
            continue
        if draft_hit:
            e = {**e, "is_draft": True}
        out.append(e)
    return out


def count_non_draft_files(
    sub_entries: Iterable[dict],
    to_user_path,
    drafts: DraftSet,
) -> int:
    """Zaehle Dateien in sub_entries, die nicht als Draft markiert sind.

    ``to_user_path(path_display) -> user_path`` wird pro Eintrag aufgerufen,
    um den Choir-relativen User-Pfad zu berechnen (Draft-Refs sind als
    User-Pfade gespeichert).
    """
    n = 0
    for se in sub_entries:
        if se.get(".tag") != "file":
            continue
        user_path = to_user_path(se.get("path_display", ""))
        if drafts.has_path(user_path):
            continue
        n += 1
    return n
