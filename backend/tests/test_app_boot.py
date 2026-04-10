"""Smoke tests: app starts, schema migrates, auth wires correctly."""

from sqlmodel import select

from backend.models.user import User


def test_app_imports():
    """The FastAPI app must be importable without side effects in tests."""
    from backend.app import app
    assert app.title == "CantaBox"


def test_engine_creates_all_tables(engine):
    """All registered SQLModel tables exist after metadata.create_all."""
    from sqlalchemy import inspect
    table_names = set(inspect(engine).get_table_names())
    # A representative slice of expected tables
    expected = {"users", "choirs", "documents", "user_chord_preferences", "annotations"}
    missing = expected - table_names
    assert not missing, f"Missing tables: {missing}"


def test_auth_me_unauthenticated(client):
    """GET /api/auth/me returns 401 without an Authorization header."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_auth_me_authenticated(client, member):
    """A valid Bearer token resolves to the matching user."""
    user, headers = member
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == user.id
    assert body["role"] == "member"


def test_user_factory_persists(session, user_factory):
    """The factory writes the user through the same session the fixtures share."""
    user, _ = user_factory(role="pro-member", username="alice")
    fetched = session.exec(select(User).where(User.username == "alice")).first()
    assert fetched is not None
    assert fetched.id == user.id
    assert fetched.role == "pro-member"
