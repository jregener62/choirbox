"""Regression test: delete_user must not fail when target has rows that
reference users.id via NOT-NULL or optional FKs (sections.created_by,
documents.uploaded_by, draft_entries.created_by). With PRAGMA foreign_keys=ON
those would otherwise raise IntegrityError -> 500."""

from __future__ import annotations

from sqlmodel import Session, select

from backend.models.document import Document
from backend.models.draft_entry import DraftEntry
from backend.models.section import Section


def test_delete_user_reassigns_choir_shared_rows(client, admin, user_factory, session: Session):
    admin_user, headers = admin
    target_user, _ = user_factory(role="pro-member")

    section = Section(
        folder_path="some/folder",
        label="A",
        color="#ff0000",
        start_time=0.0,
        end_time=10.0,
        created_by=target_user.id,
    )
    document = Document(
        choir_id=admin_user.choir_id,
        folder_path="some/folder",
        original_name="x.pdf",
        stored_filename="x.pdf",
        file_type="pdf",
        uploaded_by=target_user.id,
    )
    draft = DraftEntry(
        choir_id=admin_user.choir_id,
        kind="path",
        ref="/some/path",
        created_by=target_user.id,
    )
    session.add(section)
    session.add(document)
    session.add(draft)
    session.commit()
    section_id = section.id
    document_id = document.id
    draft_id = draft.id

    resp = client.delete(f"/api/admin/users/{target_user.id}", headers=headers)
    assert resp.status_code == 200, resp.text

    session.expire_all()
    sec = session.get(Section, section_id)
    doc = session.get(Document, document_id)
    de = session.get(DraftEntry, draft_id)
    assert sec is not None and sec.created_by == admin_user.id
    assert doc is not None and doc.uploaded_by == admin_user.id
    assert de is not None and de.created_by == admin_user.id
