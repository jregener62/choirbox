"""Short-lived HMAC-signed print tokens.

Used by the PDF-Generator (Playwright in headless Chromium) to authenticate
its API calls. The Browser session cannot use the user's Bearer token —
spawning Playwright with the user's real session would broaden the blast
radius of a compromise. Instead we mint a single-purpose token bound to
``(doc_id, user_id)`` with a 60-second TTL. The token grants read access to
this one document and the user's annotations on it; nothing else.

Token format:
    <payload-b64url>.<sig-b64url>

where payload = ``"<doc_id>|<user_id>|<exp_unix>"`` (UTF-8) and sig is the
first 32 bytes of HMAC-SHA256(SECRET_KEY, payload). Both fields are
base64url-encoded without padding.

Verification fails on signature mismatch, expiry, or malformed input.
"""

from __future__ import annotations

import base64
import hmac
import hashlib
import time
from dataclasses import dataclass
from typing import Optional

from backend.config import SECRET_KEY


PRINT_TOKEN_TTL_SECONDS = 60


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign(payload: bytes) -> bytes:
    return hmac.new(SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).digest()[:32]


def issue_print_token(doc_id: int, user_id: str, ttl_seconds: int = PRINT_TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + ttl_seconds
    payload = f"{doc_id}|{user_id}|{exp}".encode("utf-8")
    sig = _sign(payload)
    return f"{_b64url_encode(payload)}.{_b64url_encode(sig)}"


@dataclass
class PrintTokenClaims:
    doc_id: int
    user_id: str
    exp: int


def verify_print_token(token: str) -> Optional[PrintTokenClaims]:
    """Return the claims if the token is valid + unexpired, else None."""
    if not token or "." not in token:
        return None
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        payload = _b64url_decode(payload_b64)
        sig = _b64url_decode(sig_b64)
    except (ValueError, base64.binascii.Error):
        return None
    expected = _sign(payload)
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        doc_part, user_part, exp_part = payload.decode("utf-8").split("|", 2)
        doc_id = int(doc_part)
        exp = int(exp_part)
    except (ValueError, UnicodeDecodeError):
        return None
    if exp < int(time.time()):
        return None
    return PrintTokenClaims(doc_id=doc_id, user_id=user_part, exp=exp)
