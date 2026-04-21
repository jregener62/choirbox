"""Seed database with admin user from .env on first start."""

import logging
from sqlmodel import Session, select

from backend.config import ADMIN_USERNAME, ADMIN_PASSWORD, REGISTRATION_CODE
from backend.database import engine, create_db_and_tables
from backend.models.choir import Choir
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.models.label import Label
from backend.models.section_preset import SectionPreset

logger = logging.getLogger(__name__)


def seed():
    """Create tables, default choir, admin user, default labels, and app settings."""
    import backend.models  # noqa: F401 — ensure all models are registered
    create_db_and_tables()

    with Session(engine) as session:
        choir_id = _seed_default_choir(session)
        _seed_admin(session, choir_id)
        _seed_app_settings(session)
        _seed_default_labels(session, choir_id)
        _seed_default_section_presets(session, choir_id)
        _assign_orphans(session, choir_id)
        _seed_guest_users(session)


def _seed_guest_users(session: Session):
    """Ensure every choir has its shared guest user (role=guest)."""
    from backend.services.guest_link_service import ensure_guest_users_for_all_choirs

    created = ensure_guest_users_for_all_choirs(session)
    if created:
        logger.info("%d Gast-User angelegt (shared per Chor)", created)


def _seed_default_choir(session: Session) -> str:
    """Create a default choir if none exists. Returns choir ID."""
    existing = session.exec(select(Choir)).first()
    if existing:
        return existing.id

    settings = session.get(AppSettings, 1)
    invite_code = (settings.registration_code if settings else None) or REGISTRATION_CODE or "CantaBox2026"

    choir = Choir(
        name="Mein Chor",
        invite_code=invite_code,
    )
    session.add(choir)
    session.commit()
    session.refresh(choir)
    logger.info("Default choir '%s' created (invite_code: %s)", choir.name, choir.invite_code)
    return choir.id


def _seed_admin(session: Session, choir_id: str):
    """Create admin user from .env if not exists."""
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        logger.warning("ADMIN_USERNAME or ADMIN_PASSWORD not set in .env — skipping admin creation")
        return

    existing = session.exec(select(User).where(User.username == ADMIN_USERNAME)).first()
    if existing:
        if not existing.choir_id:
            existing.choir_id = choir_id
            session.add(existing)
            session.commit()
        return

    from backend.services.auth_service import hash_password
    admin = User(
        username=ADMIN_USERNAME,
        display_name=ADMIN_USERNAME,
        role="admin",
        voice_part="Bass",
        password_hash=hash_password(ADMIN_PASSWORD),
        choir_id=choir_id,
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


def _seed_default_labels(session: Session, choir_id: str):
    """Create default voice part and status labels."""
    existing = session.exec(select(Label)).first()
    if existing:
        return

    defaults = [
        Label(name="Sopran", color="#ec4899", category="Stimme", sort_order=1, choir_id=choir_id, shortcode="S", aliases="soprano,sop"),
        Label(name="Alt", color="#f97316", category="Stimme", sort_order=2, choir_id=choir_id, shortcode="A", aliases="alto"),
        Label(name="Tenor", color="#3b82f6", category="Stimme", sort_order=3, choir_id=choir_id, shortcode="T", aliases="tenore"),
        Label(name="Bass", color="#22c55e", category="Stimme", sort_order=4, choir_id=choir_id, shortcode="B", aliases="basso,baritone"),
        Label(name="Schwierig", color="#ef4444", category="Status", sort_order=10, choir_id=choir_id),
        Label(name="Geubt", color="#10b981", category="Status", sort_order=11, choir_id=choir_id),
    ]
    for label in defaults:
        session.add(label)
    session.commit()
    logger.info("Default labels created")


def _seed_default_section_presets(session: Session, choir_id: str):
    """Create default section presets for song structure."""
    existing = session.exec(select(SectionPreset)).first()
    if existing:
        return

    defaults = [
        SectionPreset(name="Intro", color="#14b8a6", sort_order=1, choir_id=choir_id, shortcode="Intro", max_num=0),
        SectionPreset(name="Strophe", color="#ef4444", sort_order=2, choir_id=choir_id, shortcode="Strophe", max_num=5),
        SectionPreset(name="Refrain", color="#8b5cf6", sort_order=3, choir_id=choir_id, shortcode="Refrain", max_num=4),
        SectionPreset(name="Bridge", color="#ec4899", sort_order=4, choir_id=choir_id, shortcode="Bridge", max_num=4),
        SectionPreset(name="Solo", color="#f97316", sort_order=5, choir_id=choir_id, shortcode="Solo", max_num=0),
        SectionPreset(name="Outro", color="#a855f7", sort_order=6, choir_id=choir_id, shortcode="Outro", max_num=0),
    ]
    for preset in defaults:
        session.add(preset)
    session.commit()
    logger.info("Default section presets created")


def _assign_orphans(session: Session, choir_id: str):
    """Assign all records without a choir to the default choir."""
    count = 0
    for user in session.exec(select(User).where(User.choir_id == None)).all():  # noqa: E711
        user.choir_id = choir_id
        session.add(user)
        count += 1
    for label in session.exec(select(Label).where(Label.choir_id == None)).all():  # noqa: E711
        label.choir_id = choir_id
        session.add(label)
        count += 1
    for preset in session.exec(select(SectionPreset).where(SectionPreset.choir_id == None)).all():  # noqa: E711
        preset.choir_id = choir_id
        session.add(preset)
        count += 1
    if count:
        session.commit()
        logger.info("Assigned %d orphaned records to default choir", count)
