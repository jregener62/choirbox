"""UserHiddenDocument model — tracks which documents a user has hidden."""

from sqlmodel import SQLModel, Field


class UserHiddenDocument(SQLModel, table=True):
    __tablename__ = "user_hidden_documents"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    document_id: int = Field(foreign_key="documents.id", primary_key=True)
