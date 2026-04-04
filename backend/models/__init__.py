"""Import all models so SQLModel can discover them."""

from backend.models.choir import Choir  # noqa: F401
from backend.models.user import User  # noqa: F401
from backend.models.app_settings import AppSettings  # noqa: F401
from backend.models.label import Label  # noqa: F401
from backend.models.favorite import Favorite  # noqa: F401
from backend.models.user_label import UserLabel  # noqa: F401
from backend.models.session_token import SessionToken  # noqa: F401
from backend.models.section import Section  # noqa: F401
from backend.models.section_preset import SectionPreset  # noqa: F401
from backend.models.note import Note  # noqa: F401
from backend.models.document import Document  # noqa: F401
from backend.models.user_hidden_document import UserHiddenDocument  # noqa: F401
from backend.models.annotation import Annotation  # noqa: F401
from backend.models.audio_duration import AudioDuration  # noqa: F401
from backend.models.audio_meta import AudioMeta  # noqa: F401
from backend.models.user_selected_document import UserSelectedDocument  # noqa: F401
