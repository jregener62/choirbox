"""Symmetric encryption for sensitive DB fields using Fernet.

The Fernet key is derived from SECRET_KEY via SHA256 — that way the
encryption key rotates whenever SECRET_KEY changes, and we don't need
to manage a separate key file.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from backend.config import SECRET_KEY


def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_fernet_key(SECRET_KEY))


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()


def is_encrypted(value: str) -> bool:
    """Check if a value looks like a Fernet token issued by this key."""
    if not value:
        return False
    try:
        _fernet.decrypt(value.encode())
        return True
    except (InvalidToken, Exception):
        return False
