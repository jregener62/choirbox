"""Audio metadata service — parse filenames and store/retrieve results."""

from datetime import datetime
from sqlmodel import Session, select

from backend.models.audio_meta import AudioMeta
from backend.models.label import Label
from backend.models.section_preset import SectionPreset
from backend.services.filename_parser import parse_audio_filename

AUDIO_EXTENSIONS = ('.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.webm', '.mp4')


def _load_shortcodes(session: Session, choir_id: str) -> tuple[list[str], list[str]]:
    """Load voice and section shortcodes for a choir."""
    voice_labels = session.exec(
        select(Label).where(Label.choir_id == choir_id, Label.category == "Stimme")
    ).all()
    voice_shortcodes = [l.shortcode or l.name for l in voice_labels]

    section_presets = session.exec(
        select(SectionPreset).where(SectionPreset.choir_id == choir_id)
    ).all()
    section_shortcodes = [p.shortcode or p.name for p in section_presets]

    return voice_shortcodes, section_shortcodes


def sync_audio_meta(
    session: Session,
    choir_id: str,
    file_paths: list[str],
) -> int:
    """Parse filenames and upsert AudioMeta for all given audio file paths.
    Returns number of records synced.
    """
    voice_sc, section_sc = _load_shortcodes(session, choir_id)
    count = 0

    for path in file_paths:
        if not any(path.lower().endswith(ext) for ext in AUDIO_EXTENSIONS):
            continue

        filename = path.rsplit('/', 1)[-1] if '/' in path else path
        parsed = parse_audio_filename(filename, path, voice_sc, section_sc)

        existing = session.get(AudioMeta, path)
        if existing:
            existing.voice_keys = parsed["voice_keys"] or None
            existing.section_keys = parsed["section_keys"] or None
            existing.song_name = parsed["song_name"] or None
            existing.free_text = parsed["free_text"] or None
            existing.choir_id = choir_id
            existing.updated_at = datetime.utcnow()
            session.add(existing)
        else:
            meta = AudioMeta(
                dropbox_path=path,
                voice_keys=parsed["voice_keys"] or None,
                section_keys=parsed["section_keys"] or None,
                song_name=parsed["song_name"] or None,
                free_text=parsed["free_text"] or None,
                choir_id=choir_id,
            )
            session.add(meta)
        count += 1

    session.commit()
    return count


def get_meta_for_paths(session: Session, paths: list[str]) -> dict[str, AudioMeta]:
    """Batch lookup of AudioMeta for given paths."""
    if not paths:
        return {}
    metas = session.exec(select(AudioMeta).where(AudioMeta.dropbox_path.in_(paths))).all()
    return {m.dropbox_path: m for m in metas}


def ensure_meta_for_paths(
    session: Session,
    choir_id: str,
    paths: list[str],
) -> dict[str, AudioMeta]:
    """Get meta for paths, lazy-parsing any that don't exist yet."""
    existing = get_meta_for_paths(session, paths)
    missing = [p for p in paths if p not in existing and any(p.lower().endswith(ext) for ext in AUDIO_EXTENSIONS)]

    if missing:
        sync_audio_meta(session, choir_id, missing)
        new_metas = get_meta_for_paths(session, missing)
        existing.update(new_metas)

    return existing


def invalidate_choir_meta(session: Session, choir_id: str) -> int:
    """Delete all AudioMeta for a choir (triggers re-parse on next browse)."""
    metas = session.exec(select(AudioMeta).where(AudioMeta.choir_id == choir_id)).all()
    count = len(metas)
    for m in metas:
        session.delete(m)
    session.commit()
    return count
