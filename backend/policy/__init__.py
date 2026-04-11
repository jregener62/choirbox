"""Policy-Modul — zentrale Rollen- und Permission-Verwaltung.

Die ``permissions.json`` in diesem Verzeichnis ist die einzige Quelle der
Wahrheit fuer:

    * Rollen und ihre Hierarchie
    * Permissions und ihre Min-Rolle
    * Features (Buendel von Permissions)
    * Distributionen (welche Features sind in diesem Deployment aktiv)
    * Routen-Mapping (welcher FastAPI-Endpoint braucht welche Permission)

Aktive Distribution wird ueber die Umgebungsvariable ``CHOIRBOX_DISTRIBUTION``
festgelegt (Default: ``full``).

Oeffentliche API:

    * :func:`get_policy` — Singleton-Zugriff auf die Engine
    * :func:`require_permission` / :func:`require_permission_query` — die
      FastAPI-Dependencies fuer Router-Code
    * :func:`validate_routes_against_policy` — Start-Check, im App-Startup
      einmal aufrufen
"""

from backend.policy.dependencies import (
    require_permission,
    require_permission_query,
)
from backend.policy.engine import (
    PolicyEngine,
    PolicyError,
    get_policy,
    reload_policy,
    validate_routes_against_policy,
)

__all__ = [
    "PolicyEngine",
    "PolicyError",
    "get_policy",
    "reload_policy",
    "require_permission",
    "require_permission_query",
    "validate_routes_against_policy",
]
