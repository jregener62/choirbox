"""Feedback API — create and list GitHub issues from within the app."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.api.auth import require_user
from backend.schemas import ActionResponse
from backend.services import github_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _require_bug_reporter(user: User = Depends(require_user)) -> User:
    if not user.can_report_bugs:
        raise HTTPException(403, "Keine Berechtigung fuer Bug-Reporting")
    return user


@router.get("/issues")
async def list_issues(user: User = Depends(_require_bug_reporter)):
    """List open/closed issues from GitHub."""
    if not github_service.is_configured():
        raise HTTPException(503, "GitHub nicht konfiguriert")

    issues = await github_service.list_issues(state="all")
    open_count = sum(1 for i in issues if i["state"] == "open")
    closed_count = sum(1 for i in issues if i["state"] == "closed")
    return {"issues": issues, "open_count": open_count, "closed_count": closed_count}


@router.post("")
async def create_issue(
    data: dict,
    user: User = Depends(_require_bug_reporter),
    session: Session = Depends(get_session),
):
    """Create a new GitHub issue."""
    if not github_service.is_configured():
        raise HTTPException(503, "GitHub nicht konfiguriert")

    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    issue_type = data.get("type", "bug")  # "bug" or "feature"

    if not title:
        raise HTTPException(400, "Titel ist erforderlich")

    # Build issue body with user context
    from backend.models.choir import Choir
    choir_name = ""
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        choir_name = choir.name if choir else ""

    body_parts = []
    if description:
        body_parts.append(description)
    body_parts.append("")
    body_parts.append("---")
    body_parts.append(f"*Gemeldet von **{user.display_name}** ({user.voice_part}) — {choir_name}*")

    body = "\n".join(body_parts)

    label = "bug" if issue_type == "bug" else "enhancement"
    result = await github_service.create_issue(title=title, body=body, labels=[label])

    return ActionResponse.success(data=result)
