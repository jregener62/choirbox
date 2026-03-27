"""Import all models so SQLModel can discover them."""

from backend.models.user import User  # noqa: F401
from backend.models.app_settings import AppSettings  # noqa: F401
from backend.models.label import Label  # noqa: F401
from backend.models.favorite import Favorite  # noqa: F401
from backend.models.user_label import UserLabel  # noqa: F401
from backend.models.session_token import SessionToken  # noqa: F401
from backend.models.section import Section  # noqa: F401
from backend.models.note import Note  # noqa: F401
