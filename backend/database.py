from sqlalchemy import event
from sqlmodel import SQLModel, Session, create_engine
from backend.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    _migrate(engine)


def _migrate(eng):
    """Add columns that create_all won't add to existing tables."""
    from sqlalchemy import inspect, text
    insp = inspect(eng)
    migrations = [
        ("sections", "lyrics", "TEXT"),
        ("sections", "updated_at", "DATETIME"),
        ("file_settings", "pdf_ref_path", "VARCHAR(1000)"),
    ]
    with eng.begin() as conn:
        for table, column, col_type in migrations:
            if table not in insp.get_table_names():
                continue
            existing = [c["name"] for c in insp.get_columns(table)]
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))

