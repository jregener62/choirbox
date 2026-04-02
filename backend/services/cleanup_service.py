"""Cleanup service — remove orphaned DB records when files/folders are deleted."""

from sqlmodel import Session, select

from backend.models.audio_duration import AudioDuration
from backend.models.favorite import Favorite
from backend.models.user_label import UserLabel
from backend.models.note import Note
from backend.models.section import Section
from backend.models.document import Document
from backend.services import document_service


def cleanup_audio_file(dropbox_path: str, session: Session) -> None:
    """Remove all DB records associated with an audio file."""
    # Audio durations
    duration = session.get(AudioDuration, dropbox_path)
    if duration:
        session.delete(duration)

    # Favorites
    favs = session.exec(
        select(Favorite).where(Favorite.dropbox_path == dropbox_path)
    ).all()
    for f in favs:
        session.delete(f)

    # User label assignments
    labels = session.exec(
        select(UserLabel).where(UserLabel.dropbox_path == dropbox_path)
    ).all()
    for l in labels:
        session.delete(l)

    # Notes
    notes = session.exec(
        select(Note).where(Note.dropbox_path == dropbox_path)
    ).all()
    for n in notes:
        session.delete(n)

    session.commit()


def cleanup_folder(folder_path: str, session: Session) -> None:
    """Remove all DB records associated with a folder (sections, documents, etc.)."""
    # Sections + their notes
    sections = session.exec(
        select(Section).where(Section.folder_path == folder_path)
    ).all()
    for s in sections:
        notes = session.exec(
            select(Note).where(Note.section_id == s.id)
        ).all()
        for n in notes:
            session.delete(n)
        session.delete(s)

    # Documents (PDFs, videos, TXT) — handles annotations + hidden entries
    document_service.delete_documents_for_folder(folder_path, session)

    session.commit()
