"""Seed database with admin user from .env on first start."""

import logging
from sqlmodel import Session, select

from backend.config import ADMIN_USERNAME, ADMIN_PASSWORD, REGISTRATION_CODE
from backend.database import engine, create_db_and_tables
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.models.label import Label
from backend.models.section_preset import SectionPreset

logger = logging.getLogger(__name__)


def seed():
    """Create tables, admin user, default labels, and app settings."""
    import backend.models  # noqa: F401 — ensure all models are registered
    create_db_and_tables()

    with Session(engine) as session:
        _seed_admin(session)
        _seed_app_settings(session)
        _seed_default_labels(session)
        _seed_default_section_presets(session)


def _seed_admin(session: Session):
    """Create admin user from .env if not exists."""
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        logger.warning("ADMIN_USERNAME or ADMIN_PASSWORD not set in .env — skipping admin creation")
        return

    existing = session.exec(select(User).where(User.username == ADMIN_USERNAME)).first()
    if existing:
        return

    from backend.api.auth import _hash_password
    admin = User(
        username=ADMIN_USERNAME,
        display_name=ADMIN_USERNAME,
        role="admin",
        voice_part="Bass",
        password_hash=_hash_password(ADMIN_PASSWORD),
    )
    session.add(admin)
    session.commit()
    logger.info("Admin user '%s' created from .env", ADMIN_USERNAME)


def _seed_app_settings(session: Session):
    """Create singleton app settings with registration code from .env."""
    settings = session.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1, registration_code=REGISTRATION_CODE or None)
        session.add(settings)
        session.commit()
        logger.info("App settings created (registration_code: %s)", "set" if REGISTRATION_CODE else "not set")


def _seed_default_labels(session: Session):
    """Create default voice part and status labels."""
    existing = session.exec(select(Label)).first()
    if existing:
        return

    defaults = [
        Label(name="Sopran", color="#ec4899", category="Stimme", sort_order=1),
        Label(name="Alt", color="#f97316", category="Stimme", sort_order=2),
        Label(name="Tenor", color="#3b82f6", category="Stimme", sort_order=3),
        Label(name="Bass", color="#22c55e", category="Stimme", sort_order=4),
        Label(name="Schwierig", color="#ef4444", category="Status", sort_order=10),
        Label(name="Geubt", color="#10b981", category="Status", sort_order=11),
    ]
    for label in defaults:
        session.add(label)
    session.commit()
    logger.info("Default labels created")


def _seed_default_section_presets(session: Session):
    """Create default section presets for song structure."""
    existing = session.exec(select(SectionPreset)).first()
    if existing:
        return

    defaults = [
        SectionPreset(name="Intro", color="#14b8a6", sort_order=1),
        SectionPreset(name="Strophe", color="#ef4444", sort_order=2),
        SectionPreset(name="Refrain", color="#8b5cf6", sort_order=3),
        SectionPreset(name="Bridge", color="#ec4899", sort_order=4),
        SectionPreset(name="Solo", color="#f97316", sort_order=5),
        SectionPreset(name="Outro", color="#a855f7", sort_order=6),
    ]
    for preset in defaults:
        session.add(preset)
    session.commit()
    logger.info("Default section presets created")
