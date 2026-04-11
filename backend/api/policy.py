"""Policy API — liefert dem Frontend die aktive Policy-Sicht fuer den
eingeloggten User.

Der Endpoint kombiniert:

    * die globale Sicht (welche Distribution ist aktiv, welche Features
      sind insgesamt vorhanden, welche Rollen gibt es)
    * die user-spezifische Sicht (welche Permissions darf *dieser* User
      in der aktiven Distribution nutzen)

Das Frontend nutzt das, um Menue-Items auszublenden (Feature-Gating),
Buttons auszugrauen (Permission-Gating) und "Upgrade auf Pro"-Hinweise
zu rendern.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.models.user import User
from backend.policy import get_policy, require_permission

router = APIRouter(prefix="/policy", tags=["policy"])


@router.get("/active")
def get_active_policy(user: User = Depends(require_permission("policy.read"))):
    """Return the active policy as seen by the current user."""
    policy = get_policy()

    # Global facts
    features = {
        name: {
            "description": f.description,
            "active": name in policy.active_features,
            "permissions": list(f.permissions),
        }
        for name, f in policy.all_features.items()
    }

    permissions = {
        name: {
            "description": p.description,
            "min_role": p.min_role,
            "feature": policy.feature_for_permission(name),
            "active": policy.is_permission_in_distribution(name),
        }
        for name, p in policy.all_permissions.items()
    }

    roles = {
        name: {
            "level": r.level,
            "description": r.description,
            "bypass_distribution": r.bypass_distribution,
        }
        for name, r in policy.all_roles.items()
    }

    # User-specific facts
    allowed = policy.allowed_permissions_for_role(user.role)
    allowed_features: list[str] = []
    for fname, f in policy.all_features.items():
        # A feature is "allowed" for the user if they can at least use one
        # of its permissions in the active distribution.
        if any(p in allowed for p in f.permissions):
            allowed_features.append(fname)

    return {
        "distribution": {
            "name": policy.distribution,
            "description": policy.distribution_description,
            "active_features": policy.active_features,
        },
        "features": features,
        "permissions": permissions,
        "roles": roles,
        "user": {
            "role": user.role,
            "bypass_distribution": policy.role_bypasses_distribution(user.role),
            "allowed_permissions": allowed,
            "allowed_features": allowed_features,
        },
    }
