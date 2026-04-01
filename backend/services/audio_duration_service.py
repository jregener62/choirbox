"""Audio duration cache service."""

from datetime import datetime
from sqlmodel import Session, select
from backend.models.audio_duration import AudioDuration


def get_durations_for_paths(session: Session, paths: list[str]) -> dict[str, float]:
    """Batch-fetch cached durations. Returns {path: seconds}."""
    if not paths:
        return {}
    stmt = select(AudioDuration).where(AudioDuration.dropbox_path.in_(paths))
    results = session.exec(stmt).all()
    return {r.dropbox_path: r.duration_seconds for r in results}


def save_duration(session: Session, dropbox_path: str, duration_seconds: float) -> None:
    """Upsert a duration entry."""
    existing = session.get(AudioDuration, dropbox_path)
    now = datetime.utcnow()
    if existing:
        existing.duration_seconds = duration_seconds
        existing.updated_at = now
    else:
        existing = AudioDuration(
            dropbox_path=dropbox_path,
            duration_seconds=duration_seconds,
            updated_at=now,
        )
    session.add(existing)
    session.commit()
