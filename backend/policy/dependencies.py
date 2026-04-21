"""FastAPI-Dependencies fuer das Policy-System.

Ersetzt die bisherigen ``require_user`` / ``require_role``-Calls durch eine
einheitliche :func:`require_permission`, die sowohl die aktive Distribution
als auch die Rollen-Hierarchie beruecksichtigt.

Error-Codes im HTTP-Body (``detail``):
    * ``feature_not_available`` — das Feature ist in der aktiven Distribution
      nicht aktiviert (z.B. Pro-Feature in Demo-Instanz). Status 403.
    * ``permission_denied`` — das Feature ist aktiv, aber die Rolle des Users
      reicht nicht aus. Status 403.
    * 401 wenn der User gar nicht authentifiziert ist.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.policy.engine import get_policy

# Note: ``backend.api.auth`` is imported *lazily* inside the dependency
# callables to break the circular import (auth.py needs require_permission,
# require_permission needs auth helpers).


def _raise_for_reason(reason: str, perm: str) -> None:
    policy = get_policy()
    if reason == "feature_not_available":
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_available",
                "permission": perm,
                "feature": policy.feature_for_permission(perm),
                "distribution": policy.distribution,
            },
        )
    if reason == "permission_denied":
        raise HTTPException(
            status_code=403,
            detail={
                "error": "permission_denied",
                "permission": perm,
                "required_role": policy.min_role_for(perm),
            },
        )
    if reason in ("unknown_permission", "unknown_role"):
        # Both are server-side bugs — not a client's fault.
        raise HTTPException(500, detail=f"Policy error: {reason} ({perm})")


def require_permission(perm: str):
    """Factory: returns a FastAPI dependency enforcing ``perm``.

    Use for normal API calls where the token comes in via the
    ``Authorization: Bearer <token>`` header.
    """

    def _dep(
        request: Request,
        session: Session = Depends(get_session),
    ) -> User:
        from backend.api.auth import get_current_user
        user = get_current_user(request, session)
        if not user:
            raise HTTPException(401, "Not authenticated")
        ok, reason = get_policy().can(user.role, perm)
        if not ok:
            _raise_for_reason(reason, perm)
        return user

    return _dep


def require_permission_query(perm: str):
    """Like :func:`require_permission` but also accepts the token via the
    ``?token=`` query parameter.

    Use ONLY for endpoints embedded as ``<img src>``, ``<a href download>``,
    or similar contexts where the browser cannot set request headers.
    """

    def _dep(
        request: Request,
        session: Session = Depends(get_session),
    ) -> User:
        from backend.services.auth_service import resolve_token_to_user
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
        else:
            token = request.query_params.get("token", "")
        user = resolve_token_to_user(token, session)
        if not user:
            raise HTTPException(401, "Not authenticated")
        ok, reason = get_policy().can(user.role, perm)
        if not ok:
            _raise_for_reason(reason, perm)
        return user

    return _dep
