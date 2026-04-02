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
    tables = insp.get_table_names()

    # --- Simple column additions ---
    column_migrations = [
        ("sections", "lyrics", "TEXT"),
        ("sections", "updated_at", "DATETIME"),
        ("pdf_files", "page_count", "INTEGER DEFAULT 1"),
        ("favorites", "entry_type", "VARCHAR(10) DEFAULT 'file'"),
        ("users", "choir_id", "VARCHAR(36)"),
        ("users", "must_change_password", "BOOLEAN DEFAULT 0"),
        ("labels", "choir_id", "VARCHAR(36)"),
        ("section_presets", "choir_id", "VARCHAR(36)"),
    ]
    with eng.begin() as conn:
        for table, column, col_type in column_migrations:
            if table not in tables:
                continue
            existing = [c["name"] for c in insp.get_columns(table)]
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))

    # --- Migrate pdf_files → documents ---
    _migrate_pdf_to_documents(eng, tables)

    # --- Migrate sections.dropbox_path → folder_path ---
    _migrate_sections_folder_path(eng, tables)

    # --- Migrate annotations: add document_id ---
    _migrate_annotations_document_id(eng, tables)

    # --- Drop obsolete tables ---
    _drop_obsolete_tables(eng, tables)


def _migrate_pdf_to_documents(eng, tables):
    """Move data from pdf_files to documents table."""
    from sqlalchemy import text
    if "pdf_files" not in tables:
        return
    with eng.begin() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM pdf_files")).scalar()
        if count == 0:
            conn.execute(text("DROP TABLE pdf_files"))
            return

        # Check if already migrated (documents has data from pdf_files)
        doc_count = conn.execute(text("SELECT COUNT(*) FROM documents")).scalar()
        if doc_count > 0:
            conn.execute(text("DROP TABLE IF EXISTS pdf_files"))
            return

        # Migrate each row
        rows = conn.execute(text(
            "SELECT id, dropbox_path, filename, original_name, file_size, "
            "page_count, uploaded_by, created_at FROM pdf_files"
        )).fetchall()
        for row in rows:
            old_id, dropbox_path, filename, original_name, file_size, page_count, uploaded_by, created_at = row
            # Extract folder path from audio file path
            folder_path = dropbox_path.rsplit("/", 1)[0] if "/" in dropbox_path else ""
            conn.execute(text(
                "INSERT INTO documents (id, folder_path, file_type, filename, original_name, "
                "file_size, page_count, sort_order, uploaded_by, created_at) "
                "VALUES (:id, :fp, 'pdf', :fn, :on, :fs, :pc, 0, :ub, :ca)"
            ), {
                "id": old_id, "fp": folder_path, "fn": filename, "on": original_name,
                "fs": file_size, "pc": page_count or 1, "ub": uploaded_by, "ca": created_at,
            })

        conn.execute(text("DROP TABLE pdf_files"))


def _migrate_sections_folder_path(eng, tables):
    """Rename sections.dropbox_path to folder_path and transform values."""
    from sqlalchemy import text, inspect as sa_inspect
    if "sections" not in tables:
        return
    insp = sa_inspect(eng)
    cols = [c["name"] for c in insp.get_columns("sections")]
    if "folder_path" in cols:
        return  # Already migrated
    if "dropbox_path" not in cols:
        return  # Unexpected state

    with eng.begin() as conn:
        conn.execute(text("ALTER TABLE sections RENAME COLUMN dropbox_path TO folder_path"))
        # Transform values: extract dirname from file paths
        rows = conn.execute(text("SELECT id, folder_path FROM sections")).fetchall()
        for row in rows:
            section_id, path = row
            # If path looks like a file path (has extension), extract dirname
            if "." in path.rsplit("/", 1)[-1]:
                folder = path.rsplit("/", 1)[0] if "/" in path else ""
                conn.execute(text(
                    "UPDATE sections SET folder_path = :fp WHERE id = :id"
                ), {"fp": folder, "id": section_id})


def _migrate_annotations_document_id(eng, tables):
    """Add document_id to annotations and populate from documents table."""
    from sqlalchemy import text, inspect as sa_inspect
    if "annotations" not in tables:
        return
    insp = sa_inspect(eng)
    cols = [c["name"] for c in insp.get_columns("annotations")]
    if "document_id" in cols:
        return  # Already migrated

    with eng.begin() as conn:
        conn.execute(text("ALTER TABLE annotations ADD COLUMN document_id INTEGER DEFAULT 0"))

        # Try to map existing annotations to documents
        if "documents" in eng.connect().execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'"
        )).fetchone() or []:
            rows = conn.execute(text(
                "SELECT id, dropbox_path FROM annotations"
            )).fetchall()
            for row in rows:
                ann_id, dropbox_path = row
                folder = dropbox_path.rsplit("/", 1)[0] if "/" in dropbox_path else ""
                doc = conn.execute(text(
                    "SELECT id FROM documents WHERE folder_path = :fp AND file_type = 'pdf' LIMIT 1"
                ), {"fp": folder}).fetchone()
                if doc:
                    conn.execute(text(
                        "UPDATE annotations SET document_id = :did WHERE id = :id"
                    ), {"did": doc[0], "id": ann_id})


def _drop_obsolete_tables(eng, tables):
    """Drop tables that are no longer needed."""
    from sqlalchemy import text
    with eng.begin() as conn:
        if "file_settings" in tables:
            conn.execute(text("DROP TABLE file_settings"))
