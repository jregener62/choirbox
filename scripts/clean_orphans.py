"""Cleanup-Skript: loescht nachweislich tote FK-Verweise.

Wird einmalig vor der Aktivierung von PRAGMA foreign_keys=ON gefahren, um
Orphan-Rows aufzuraeumen, die SQLite bisher still durchgewinkt hat.

Aufruf:
    python -m scripts.clean_orphans              # echtes Loeschen
    python -m scripts.clean_orphans --dry-run    # nur zeigen, was geloescht wird

Idempotent: zweite Ausfuehrung loescht nichts mehr.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

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


def _ids(session: Session, model) -> set:
    return {row.id for row in session.exec(select(model)).all()}


def _user_ids(session: Session) -> set:
    return {u.id for u in session.exec(select(User)).all()}


def _delete_orphans(
    session: Session, model, predicate, label: str, deleted: dict[str, int],
) -> None:
    rows = [r for r in session.exec(select(model)).all() if predicate(r)]
    if rows:
        for r in rows:
            session.delete(r)
        deleted[label] = len(rows)


def cleanup(dry_run: bool) -> dict[str, int]:
    deleted: dict[str, int] = {}
    with Session(engine) as session:
        users = _user_ids(session)
        docs = _ids(session, Document)
        labels = _ids(session, Label)
        sections = _ids(session, Section)

        # Wichtig: zuerst die Tabellen aufraeumen, deren Parents bereits bekannt sind.
        # Annotations: document_id darf 0 sein (Default), das ist KEIN Orphan im
        # eigentlichen Sinne, sondern ein Migrations-Artefakt — wir lassen 0 stehen.
        _delete_orphans(
            session, Annotation,
            lambda r: r.user_id not in users,
            "annotations.user_id_orphan", deleted,
        )
        _delete_orphans(
            session, Annotation,
            lambda r: r.document_id and r.document_id not in docs,
            "annotations.document_id_orphan", deleted,
        )

        _delete_orphans(
            session, UserChordPreference,
            lambda r: r.user_id not in users or r.document_id not in docs,
            "user_chord_preferences_orphan", deleted,
        )
        _delete_orphans(
            session, UserSelectedDocument,
            lambda r: r.user_id not in users or r.document_id not in docs,
            "user_selected_documents_orphan", deleted,
        )
        _delete_orphans(
            session, UserHiddenDocument,
            lambda r: r.user_id not in users or r.document_id not in docs,
            "user_hidden_documents_orphan", deleted,
        )

        _delete_orphans(
            session, Favorite,
            lambda r: r.user_id not in users,
            "favorites.user_id_orphan", deleted,
        )
        _delete_orphans(
            session, UserLabel,
            lambda r: r.user_id not in users or r.label_id not in labels,
            "user_labels_orphan", deleted,
        )
        _delete_orphans(
            session, Note,
            lambda r: r.user_id not in users
            or (r.section_id is not None and r.section_id not in sections),
            "notes_orphan", deleted,
        )
        _delete_orphans(
            session, Section,
            lambda r: r.created_by not in users,
            "sections.created_by_orphan", deleted,
        )
        _delete_orphans(
            session, SessionToken,
            lambda r: r.user_id not in users,
            "session_tokens.user_id_orphan", deleted,
        )

        if dry_run:
            session.rollback()
        else:
            session.commit()
    return deleted


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup verwaister FK-Referenzen")
    parser.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts loeschen")
    args = parser.parse_args()

    deleted = cleanup(args.dry_run)
    if not deleted:
        print("Keine Orphans gefunden — DB ist sauber.")
        return 0

    width = max(len(k) for k in deleted)
    print("Orphan-Cleanup:" + (" (Dry-Run, nichts geschrieben)" if args.dry_run else ""))
    print("-" * (width + 12))
    total = 0
    for key in sorted(deleted):
        n = deleted[key]
        total += n
        print(f"  {key.ljust(width)}  {n}")
    print("-" * (width + 12))
    print(f"  {'GESAMT'.ljust(width)}  {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
