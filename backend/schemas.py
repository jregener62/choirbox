"""Pydantic request/response schemas for API endpoints."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ActionWarning(BaseModel):
    code: str
    message: str


class ActionResponse(BaseModel):
    """Standardized response for all action endpoints."""
    outcome: Literal["success", "success_with_warnings", "failure"]
    reason: str | None = None
    data: Any | None = None
    warnings: list[ActionWarning] = Field(default_factory=list)

    @staticmethod
    def success(data: Any = None, warnings: list[ActionWarning] | None = None) -> ActionResponse:
        has_warnings = warnings and len(warnings) > 0
        return ActionResponse(
            outcome="success_with_warnings" if has_warnings else "success",
            reason=None,
            data=data,
            warnings=warnings or [],
        )

    @staticmethod
    def failure(reason: str, data: Any = None) -> ActionResponse:
        return ActionResponse(
            outcome="failure",
            reason=reason,
            data=data,
            warnings=[],
        )
