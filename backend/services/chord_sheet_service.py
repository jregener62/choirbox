"""Chord sheet service — business logic for chord sheet CRUD and preferences."""

import json
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from backend.models.chord_sheet import ChordSheet
from backend.models.user_chord_preference import UserChordPreference


def create_chord_sheet(
    session: Session,
    song_folder_path: str,
    title: str,
    parsed_content: dict,
    original_key: str,
    source_filename: str,
    choir_id: str,
    created_by: str,
) -> ChordSheet:
    """Create a new chord sheet."""
    cs = ChordSheet(
        song_folder_path=song_folder_path,
        title=title,
        original_key=original_key,
        parsed_content=json.dumps(parsed_content, ensure_ascii=False),
        source_filename=source_filename,
        choir_id=choir_id,
        created_by=created_by,
    )
    session.add(cs)
    session.commit()
    session.refresh(cs)
    return cs


def get_chord_sheet(session: Session, chord_sheet_id: int) -> Optional[ChordSheet]:
    """Get a single chord sheet by ID."""
    return session.get(ChordSheet, chord_sheet_id)


def list_chord_sheets(session: Session, song_folder_path: str) -> list[ChordSheet]:
    """List all chord sheets for a song folder."""
    stmt = (
        select(ChordSheet)
        .where(ChordSheet.song_folder_path == song_folder_path)
        .order_by(ChordSheet.created_at)
    )
    return list(session.exec(stmt).all())


def update_chord_sheet(
    session: Session,
    cs: ChordSheet,
    title: Optional[str] = None,
    parsed_content: Optional[dict] = None,
    original_key: Optional[str] = None,
) -> ChordSheet:
    """Update an existing chord sheet."""
    if title is not None:
        cs.title = title
    if parsed_content is not None:
        cs.parsed_content = json.dumps(parsed_content, ensure_ascii=False)
    if original_key is not None:
        cs.original_key = original_key
    cs.updated_at = datetime.utcnow()
    session.add(cs)
    session.commit()
    session.refresh(cs)
    return cs


def delete_chord_sheet(session: Session, cs: ChordSheet) -> None:
    """Delete a chord sheet and its preferences."""
    # Delete all user preferences for this sheet
    stmt = select(UserChordPreference).where(
        UserChordPreference.chord_sheet_id == cs.id
    )
    for pref in session.exec(stmt).all():
        session.delete(pref)
    session.delete(cs)
    session.commit()


def get_user_preference(
    session: Session, user_id: str, chord_sheet_id: int
) -> Optional[UserChordPreference]:
    """Get user's transposition preference for a chord sheet."""
    stmt = select(UserChordPreference).where(
        UserChordPreference.user_id == user_id,
        UserChordPreference.chord_sheet_id == chord_sheet_id,
    )
    return session.exec(stmt).first()


def set_user_preference(
    session: Session, user_id: str, chord_sheet_id: int, semitones: int
) -> UserChordPreference:
    """Save user's preferred transposition (upsert)."""
    pref = get_user_preference(session, user_id, chord_sheet_id)
    if pref:
        pref.transposition_semitones = semitones
        pref.updated_at = datetime.utcnow()
    else:
        pref = UserChordPreference(
            user_id=user_id,
            chord_sheet_id=chord_sheet_id,
            transposition_semitones=semitones,
        )
    session.add(pref)
    session.commit()
    session.refresh(pref)
    return pref


def chord_sheet_to_dict(cs: ChordSheet, preference: Optional[UserChordPreference] = None) -> dict:
    """Convert a ChordSheet to API response dict."""
    return {
        "id": cs.id,
        "song_folder_path": cs.song_folder_path,
        "title": cs.title,
        "original_key": cs.original_key,
        "parsed_content": json.loads(cs.parsed_content),
        "source_filename": cs.source_filename,
        "created_by": cs.created_by,
        "created_at": cs.created_at.isoformat() if cs.created_at else None,
        "updated_at": cs.updated_at.isoformat() if cs.updated_at else None,
        "user_transposition": preference.transposition_semitones if preference else 0,
    }
