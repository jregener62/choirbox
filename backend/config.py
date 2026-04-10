import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

_default_db = f"sqlite:///{BASE_DIR}/choirbox.db"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

# Dropbox OAuth2
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET", "")
DROPBOX_REDIRECT_URI = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8001/api/dropbox/callback")

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "SECRET_KEY ist nicht gesetzt! Nutze einen zufaelligen Wert. "
        "Setze SECRET_KEY in .env fuer Production.",
        stacklevel=2,
    )
    import secrets as _s
    SECRET_KEY = _s.token_hex(32)

# Admin (created on first start from .env)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

# Registration code
REGISTRATION_CODE = os.getenv("REGISTRATION_CODE", "")

# GitHub Issue Reporting
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")  # Format: "owner/repo"
