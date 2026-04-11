"""Policy Engine — zentraler Permission-/Feature-Check.

Liest ``permissions.json`` beim App-Start und stellt Funktionen bereit, um
Permissions gegen User-Rolle und aktive Distribution zu pruefen. Siehe
``permissions.json`` fuer die Struktur.

Konsistenz-Regeln (beim Laden gepruefft):
    * Jede Permission muss einer (und nur einer) Feature zugeordnet sein.
    * Jede Route muss eine bekannte Permission referenzieren.
    * Die aktive Distribution (aus ``CHOIRBOX_DISTRIBUTION``) muss existieren.

Die Engine ist ein Singleton, das ueber :func:`get_policy` erreicht wird.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

POLICY_FILE = Path(__file__).parent / "permissions.json"
DEFAULT_DISTRIBUTION = "full"
ENV_DISTRIBUTION = "CHOIRBOX_DISTRIBUTION"
ENV_STRICT = "CHOIRBOX_POLICY_STRICT"


class PolicyError(Exception):
    """Raised when the policy file is invalid or inconsistent."""


@dataclass
class Role:
    name: str
    level: int
    description: str
    bypass_distribution: bool = False


@dataclass
class Permission:
    name: str
    min_role: str
    description: str


@dataclass
class Feature:
    name: str
    description: str
    permissions: list[str]


@dataclass
class Distribution:
    name: str
    description: str
    features: list[str]


class PolicyEngine:
    """Loads the JSON policy and answers permission questions."""

    def __init__(
        self,
        policy_file: Path = POLICY_FILE,
        distribution: Optional[str] = None,
    ):
        self._policy_file = policy_file
        self._distribution_name = distribution or os.getenv(
            ENV_DISTRIBUTION, DEFAULT_DISTRIBUTION
        )
        self._load()

    # ---------- loading ----------

    def _load(self) -> None:
        if not self._policy_file.exists():
            raise PolicyError(f"Policy file not found: {self._policy_file}")
        with open(self._policy_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self._version = int(data.get("version", 0))

        # Roles
        self._roles: dict[str, Role] = {}
        for name, cfg in data.get("roles", {}).items():
            self._roles[name] = Role(
                name=name,
                level=int(cfg["level"]),
                description=cfg.get("description", ""),
                bypass_distribution=bool(cfg.get("bypass_distribution", False)),
            )
        if not self._roles:
            raise PolicyError("Policy has no roles defined")

        # Permissions
        self._permissions: dict[str, Permission] = {}
        for name, cfg in data.get("permissions", {}).items():
            min_role = cfg["min_role"]
            if min_role not in self._roles:
                raise PolicyError(
                    f"Permission '{name}' references unknown role '{min_role}'"
                )
            self._permissions[name] = Permission(
                name=name,
                min_role=min_role,
                description=cfg.get("description", ""),
            )

        # Features
        self._features: dict[str, Feature] = {}
        self._perm_to_feature: dict[str, str] = {}
        for name, cfg in data.get("features", {}).items():
            perms = list(cfg.get("permissions", []))
            for p in perms:
                if p not in self._permissions:
                    raise PolicyError(
                        f"Feature '{name}' references unknown permission '{p}'"
                    )
                if p in self._perm_to_feature:
                    raise PolicyError(
                        f"Permission '{p}' belongs to multiple features: "
                        f"'{self._perm_to_feature[p]}' and '{name}'"
                    )
                self._perm_to_feature[p] = name
            self._features[name] = Feature(
                name=name,
                description=cfg.get("description", ""),
                permissions=perms,
            )

        unassigned = set(self._permissions) - set(self._perm_to_feature)
        if unassigned:
            raise PolicyError(
                f"Permissions not assigned to any feature: {sorted(unassigned)}"
            )

        # Distributions
        self._distributions: dict[str, Distribution] = {}
        for name, cfg in data.get("distributions", {}).items():
            feats = list(cfg.get("features", []))
            for f in feats:
                if f not in self._features:
                    raise PolicyError(
                        f"Distribution '{name}' references unknown feature '{f}'"
                    )
            self._distributions[name] = Distribution(
                name=name,
                description=cfg.get("description", ""),
                features=feats,
            )

        if self._distribution_name not in self._distributions:
            raise PolicyError(
                f"{ENV_DISTRIBUTION}='{self._distribution_name}' is not a defined "
                f"distribution. Available: {sorted(self._distributions)}"
            )
        self._active_distribution = self._distributions[self._distribution_name]

        # Active permissions = alle Permissions, deren Feature in aktiver Distribution ist
        self._active_permissions: set[str] = set()
        for fname in self._active_distribution.features:
            for p in self._features[fname].permissions:
                self._active_permissions.add(p)

        # Routes
        self._routes: dict[str, str] = dict(data.get("routes", {}))
        self._public_routes: set[str] = set(data.get("public_routes", []))
        for route, perm in self._routes.items():
            if perm not in self._permissions:
                raise PolicyError(
                    f"Route '{route}' references unknown permission '{perm}'"
                )

        logger.info(
            "Policy geladen: distribution=%s, features=%d, permissions=%d, "
            "routes=%d (protected) + %d (public), active_permissions=%d",
            self._distribution_name,
            len(self._active_distribution.features),
            len(self._permissions),
            len(self._routes),
            len(self._public_routes),
            len(self._active_permissions),
        )

    # ---------- read API ----------

    @property
    def distribution(self) -> str:
        return self._distribution_name

    @property
    def distribution_description(self) -> str:
        return self._active_distribution.description

    @property
    def active_features(self) -> list[str]:
        return list(self._active_distribution.features)

    @property
    def active_permissions(self) -> set[str]:
        return set(self._active_permissions)

    @property
    def all_features(self) -> dict[str, Feature]:
        return dict(self._features)

    @property
    def all_permissions(self) -> dict[str, Permission]:
        return dict(self._permissions)

    @property
    def all_roles(self) -> dict[str, Role]:
        return dict(self._roles)

    def feature_for_permission(self, perm: str) -> Optional[str]:
        return self._perm_to_feature.get(perm)

    def role_level(self, role_name: str) -> int:
        r = self._roles.get(role_name)
        return r.level if r else -1

    def role_bypasses_distribution(self, role_name: str) -> bool:
        r = self._roles.get(role_name)
        return bool(r.bypass_distribution) if r else False

    def permission_exists(self, perm: str) -> bool:
        return perm in self._permissions

    def is_permission_in_distribution(self, perm: str) -> bool:
        return perm in self._active_permissions

    def min_role_for(self, perm: str) -> str:
        p = self._permissions.get(perm)
        if not p:
            raise PolicyError(f"Unknown permission: {perm}")
        return p.min_role

    def can(self, role_name: str, perm: str) -> tuple[bool, str]:
        """Check if a user with ``role_name`` may use ``perm``.

        Returns a tuple ``(allowed, reason)``. ``reason`` is one of:

        * ``ok`` — allowed
        * ``unknown_role``
        * ``unknown_permission``
        * ``feature_not_available`` (Distribution disabled the feature)
        * ``permission_denied`` (role-level too low)
        """
        if role_name not in self._roles:
            return False, "unknown_role"
        if perm not in self._permissions:
            return False, "unknown_permission"

        if not self.role_bypasses_distribution(role_name):
            if perm not in self._active_permissions:
                return False, "feature_not_available"

        user_level = self.role_level(role_name)
        required_level = self.role_level(self.min_role_for(perm))
        if user_level < required_level:
            return False, "permission_denied"

        return True, "ok"

    def route_permission(self, method: str, path: str) -> Optional[str]:
        return self._routes.get(f"{method.upper()} {path}")

    def is_public_route(self, method: str, path: str) -> bool:
        return f"{method.upper()} {path}" in self._public_routes

    def all_known_route_keys(self) -> set[str]:
        return set(self._routes) | set(self._public_routes)

    def allowed_permissions_for_role(self, role_name: str) -> list[str]:
        """Return all permissions a user with this role may use in the active
        distribution, sorted alphabetically."""
        out: list[str] = []
        for perm in sorted(self._permissions):
            ok, _ = self.can(role_name, perm)
            if ok:
                out.append(perm)
        return out


# ---------- singleton access ----------

_engine: Optional[PolicyEngine] = None


def get_policy() -> PolicyEngine:
    """Get the singleton policy engine, loading it on first call."""
    global _engine
    if _engine is None:
        _engine = PolicyEngine()
    return _engine


def reload_policy() -> PolicyEngine:
    """Force-reload the policy (intended for tests)."""
    global _engine
    _engine = PolicyEngine()
    return _engine


# ---------- startup consistency check ----------

def validate_routes_against_policy(app) -> None:
    """Compare registered FastAPI routes with the policy.

    Every API route (path starting with ``/api/``) must appear in either
    ``routes`` (protected) or ``public_routes`` (public). Missing routes
    cause a :class:`PolicyError` unless ``CHOIRBOX_POLICY_STRICT=0`` is set
    (then they are only logged as warnings). Extra routes in the policy
    are always just warnings.
    """
    policy = get_policy()

    registered: set[str] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            continue
        if not path.startswith("/api/"):
            continue
        for method in methods:
            if method in ("HEAD", "OPTIONS"):
                continue
            registered.add(f"{method} {path}")

    known = policy.all_known_route_keys()
    missing = registered - known
    extra = known - registered

    if missing:
        msg = (
            f"Policy-Konsistenz-Fehler: {len(missing)} Routes sind im "
            f"FastAPI-Router registriert, aber nicht in permissions.json "
            f"eingetragen:\n  "
            + "\n  ".join(sorted(missing))
        )
        strict = os.getenv(ENV_STRICT, "1") == "1"
        if strict:
            raise PolicyError(msg)
        logger.warning(msg)

    if extra:
        logger.warning(
            "Policy enthaelt %d Routes, die nicht im FastAPI-Router "
            "registriert sind (evtl. veraltete Eintraege): %s",
            len(extra),
            ", ".join(sorted(extra)),
        )
