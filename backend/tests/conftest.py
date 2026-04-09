"""Pytest fixtures for ChoirBox backend tests.

Each test gets a clean SQLite database (file-based, in tmp_path) so tests
are fully isolated. The Dropbox service is forced to None — the API
endpoints handle that gracefully and skip remote uploads, but still
register Documents in the local DB. That's enough for unit-level coverage
of the request/response/persistence path.

Auth fixtures create real Users + SessionTokens via the same code paths
the production code uses, so the Authorization header that comes back
flows through `require_user` / `require_role` exactly like in production.
"""

from __future__ import annotations

import hashlib
import secrets
from typing import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

# Models must be imported before create_all so SQLModel discovers them
import backend.models  # noqa: F401
from backend.models.choir import Choir
from backend.models.session_token import SessionToken
from backend.models.user import User


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

@pytest.fixture
def engine(monkeypatch):
    """Per-test in-memory SQLite engine.

    Uses StaticPool so all sessions share the same in-memory DB. Patches
    `backend.database.engine` so any code that imports the module-level
    engine (e.g. document_service caches) sees the test engine.
    """
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    import backend.database
    monkeypatch.setattr(backend.database, "engine", test_engine)
    yield test_engine


@pytest.fixture
def session(engine) -> Iterator[Session]:
    with Session(engine) as s:
        yield s


# ---------------------------------------------------------------------------
# FastAPI test client with overridden dependencies
# ---------------------------------------------------------------------------

@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    """TestClient with get_session pointing at the test engine and
    Dropbox forced to None (no real network calls)."""
    from backend.app import app
    from backend.database import get_session
    from backend.services import dropbox_service

    def override_get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override_get_session

    # Force Dropbox-less mode for all tests
    original_get_dbx = dropbox_service.get_dropbox_service
    dropbox_service.get_dropbox_service = lambda _session: None  # type: ignore[assignment]
    # Patch all the modules that imported it directly
    import backend.api.documents as documents_api
    import backend.api.dropbox as dropbox_api
    documents_api.get_dropbox_service = lambda _session: None  # type: ignore[assignment]
    if hasattr(dropbox_api, "get_dropbox_service"):
        dropbox_api.get_dropbox_service = lambda _session: None  # type: ignore[assignment]

    try:
        # context manager triggers FastAPI startup events
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
        dropbox_service.get_dropbox_service = original_get_dbx
        documents_api.get_dropbox_service = original_get_dbx


# ---------------------------------------------------------------------------
# Domain fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def test_choir(session: Session) -> Choir:
    """Insert a test choir with a known invite_code."""
    choir = Choir(name="Test-Chor", invite_code="TESTCODE2026", dropbox_root_folder=None)
    session.add(choir)
    session.commit()
    session.refresh(choir)
    return choir


def _hash_password(password: str) -> str:
    """Mirror backend.api.auth._hash_password for direct user creation in tests."""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


@pytest.fixture
def user_factory(session: Session, test_choir: Choir) -> Callable[..., tuple[User, dict]]:
    """Factory: build a user with the requested role and return (user, headers).

    `headers` is a dict ready to drop into client.post(...).
    """
    def make(role: str = "pro-member", username: str | None = None) -> tuple[User, dict]:
        username = username or f"test_{role}_{secrets.token_hex(3)}"
        user = User(
            username=username,
            display_name=username,
            role=role,
            voice_part="",
            password_hash=_hash_password("testpw"),
            choir_id=test_choir.id,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        token = SessionToken(user_id=user.id)
        session.add(token)
        session.commit()
        session.refresh(token)
        return user, {"Authorization": f"Bearer {token.token}"}

    return make


@pytest.fixture
def member(user_factory):
    return user_factory(role="member")


@pytest.fixture
def pro_member(user_factory):
    return user_factory(role="pro-member")


@pytest.fixture
def admin(user_factory):
    return user_factory(role="admin")
