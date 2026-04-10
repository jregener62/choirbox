"""Audit-Skript: zaehlt Orphans in allen User-Daten-Tabellen.

Wird vor dem Aktivieren von PRAGMA foreign_keys=ON ausgefuehrt, um zu sehen,
wie viele tote FK-Verweise in der DB stehen. Diese muessen mit clean_orphans.py
aufgeraeumt werden, sonst knallt SQLite spaeter bei DELETE/INSERT-Operationen
mit FOREIGN KEY constraint failed.

Aufruf:
    python -m scripts.audit_orphans

Schreibt nichts in die DB.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Repo-Root in den Pythonpfad, damit `backend` importierbar ist, auch wenn das
# Skript ausserhalb des venv mit `python scripts/audit_orphans.py` gestartet wird.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from backend.database import engine  # noqa: E402
from backend.models.annotation import Annotation  # noqa: E402
from backend.models.document import Document  # noqa: E402
from backend.models.favorite import Favorite  # noqa: E402
from backend.models.label import Label  # noqa: E402
from backend.models.note import Note  # noqa: E402
from backend.models.section import Section  # noqa: E402
from backend.models.session_token import SessionToken  # noqa: E402
from backend.models.user import User  # noqa: E402
from backend.models.user_chord_preference import UserChordPreference  # noqa: E402
from backend.models.user_hidden_document import UserHiddenDocument  # noqa: E402
from backend.models.user_label import UserLabel  # noqa: E402
from backend.models.user_selected_document import UserSelectedDocument  # noqa: E402


def _ids(session: Session, model, attr: str = "id") -> set:
    return {getattr(row, attr) for row in session.exec(select(model)).all()}


def audit() -> dict[str, int]:
    """Zaehlt Orphans pro Tabelle/FK. Gibt ein Dict mit Bezeichnern zurueck."""
    counts: dict[str, int] = {}
    with Session(engine) as session:
        user_ids = _ids(session, User)
        doc_ids = _ids(session, Document)
        label_ids = _ids(session, Label)
        section_ids = _ids(session, Section)

        # --- documents.id Referenzen ---
        counts["annotations.document_id"] = sum(
            1 for a in session.exec(select(Annotation)).all()
            if a.document_id and a.document_id not in doc_ids
        )
        counts["user_chord_preferences.document_id"] = sum(
            1 for r in session.exec(select(UserChordPreference)).all()
            if r.document_id not in doc_ids
        )
        counts["user_hidden_documents.document_id"] = sum(
            1 for r in session.exec(select(UserHiddenDocument)).all()
            if r.document_id not in doc_ids
        )
        counts["user_selected_documents.document_id"] = sum(
            1 for r in session.exec(select(UserSelectedDocument)).all()
            if r.document_id not in doc_ids
        )

        # --- users.id Referenzen ---
        counts["annotations.user_id"] = sum(
            1 for r in session.exec(select(Annotation)).all()
            if r.user_id not in user_ids
        )
        counts["favorites.user_id"] = sum(
            1 for r in session.exec(select(Favorite)).all()
            if r.user_id not in user_ids
        )
        counts["notes.user_id"] = sum(
            1 for r in session.exec(select(Note)).all()
            if r.user_id not in user_ids
        )
        counts["sections.created_by"] = sum(
            1 for r in session.exec(select(Section)).all()
            if r.created_by not in user_ids
        )
        counts["session_tokens.user_id"] = sum(
            1 for r in session.exec(select(SessionToken)).all()
            if r.user_id not in user_ids
        )
        counts["user_chord_preferences.user_id"] = sum(
            1 for r in session.exec(select(UserChordPreference)).all()
            if r.user_id not in user_ids
        )
        counts["user_hidden_documents.user_id"] = sum(
            1 for r in session.exec(select(UserHiddenDocument)).all()
            if r.user_id not in user_ids
        )
        counts["user_labels.user_id"] = sum(
            1 for r in session.exec(select(UserLabel)).all()
            if r.user_id not in user_ids
        )
        counts["user_selected_documents.user_id"] = sum(
            1 for r in session.exec(select(UserSelectedDocument)).all()
            if r.user_id not in user_ids
        )

        # --- labels.id Referenzen ---
        counts["user_labels.label_id"] = sum(
            1 for r in session.exec(select(UserLabel)).all()
            if r.label_id not in label_ids
        )

        # --- sections.id Referenzen (nullable, also nur wenn gesetzt) ---
        counts["notes.section_id"] = sum(
            1 for r in session.exec(select(Note)).all()
            if r.section_id is not None and r.section_id not in section_ids
        )

    return counts


def main() -> int:
    counts = audit()
    width = max(len(k) for k in counts)
    total = 0
    print("Orphan-Audit (FK → Parent fehlt):")
    print("-" * (width + 12))
    for key in sorted(counts):
        n = counts[key]
        total += n
        marker = "  " if n == 0 else "!!"
        print(f"{marker} {key.ljust(width)}  {n}")
    print("-" * (width + 12))
    print(f"   {'GESAMT'.ljust(width)}  {total}")
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
