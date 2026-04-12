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
        # FK-Constraints durchsetzen — sonst sammeln sich stille Orphans, weil
        # SQLite FK-Definitionen ohne dieses PRAGMA komplett ignoriert.
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    # Pre-migration: drop tables whose schema is incompatible BEFORE create_all,
    # so create_all can recreate them with the new schema.
    _pre_migrate(engine)
    SQLModel.metadata.create_all(engine)
    _migrate(engine)


def _pre_migrate(eng):
    """Drop tables that need to be recreated with a new schema."""
    from sqlalchemy import inspect, text
    insp = inspect(eng)
    tables = insp.get_table_names()

    with eng.begin() as conn:
        # user_chord_preferences: chord_sheet_id (int FK→chord_sheets) → document_id (int FK→documents)
        if "user_chord_preferences" in tables:
            cols = [c["name"] for c in insp.get_columns("user_chord_preferences")]
            if "chord_sheet_id" in cols and "document_id" not in cols:
                conn.execute(text("DROP TABLE user_chord_preferences"))
        # chord_sheets table is obsolete (chord sheets are now Documents with file_type='cho')
        if "chord_sheets" in tables:
            conn.execute(text("DROP TABLE chord_sheets"))


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
        ("documents", "content_hash", "VARCHAR(64)"),
        ("documents", "dropbox_path", "VARCHAR(1000)"),
        ("documents", "dropbox_file_id", "VARCHAR(128)"),
        ("documents", "song_id", "INTEGER"),
        ("sections", "song_id", "INTEGER"),
        ("user_selected_documents", "song_id", "INTEGER"),
        ("favorites", "song_id", "INTEGER"),
        ("favorites", "document_id", "INTEGER"),
        ("favorites", "audio_file_id", "VARCHAR(128)"),
        ("notes", "target_file_id", "VARCHAR(128)"),
        ("user_labels", "target_file_id", "VARCHAR(128)"),
        ("labels", "shortcode", "VARCHAR(10)"),
        ("labels", "aliases", "VARCHAR(200)"),
        ("section_presets", "shortcode", "VARCHAR(20)"),
        ("section_presets", "max_num", "INTEGER DEFAULT 0"),
        ("users", "can_report_bugs", "BOOLEAN DEFAULT 0"),
        ("app_settings", "guest_link_ttl_minutes", "INTEGER DEFAULT 60"),
        ("session_tokens", "expires_at", "DATETIME"),
        # Guest-Link Multi-Use Umbau: neue Spalten hinzufuegen. Die alten
        # Spalten (consumed_at, consumed_by_ip, consumed_by_ua) bleiben in
        # der DB als Dead-Columns — SQLModel liest sie nicht mehr.
        ("guest_links", "max_uses", "INTEGER"),
        ("guest_links", "uses_count", "INTEGER DEFAULT 0"),
        ("guest_links", "first_used_at", "DATETIME"),
        ("guest_links", "last_used_at", "DATETIME"),
        ("guest_links", "last_used_ip", "VARCHAR(64)"),
        ("guest_links", "last_used_ua", "VARCHAR(255)"),
        ("guest_links", "view_mode", "VARCHAR(10) DEFAULT 'songs'"),
    ]
    with eng.begin() as conn:
        for table, column, col_type in column_migrations:
            if table not in tables:
                continue
            existing = [c["name"] for c in insp.get_columns(table)]
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))

        # Partial unique index auf documents.dropbox_file_id (nur wenn nicht NULL),
        # damit Backfill und parallele Sync-Laeufe nie doppelte IDs anlegen.
        if "documents" in tables:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_dropbox_file_id "
                "ON documents(dropbox_file_id) WHERE dropbox_file_id IS NOT NULL"
            ))

    # --- Migrate pdf_files → documents ---
    _migrate_pdf_to_documents(eng, tables)

    # --- Migrate sections.dropbox_path → folder_path ---
    _migrate_sections_folder_path(eng, tables)

    # --- Migrate annotations: add document_id ---
    _migrate_annotations_document_id(eng, tables)

    # --- Backfill documents.dropbox_path ---
    _migrate_documents_dropbox_path(eng, tables)

    # --- Backfill label shortcodes ---
    _backfill_label_shortcodes(eng, tables)

    # --- Backfill section preset shortcodes ---
    _backfill_section_preset_shortcodes(eng, tables)

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

        # Migrate each row (metadata only, no local file reference)
        rows = conn.execute(text(
            "SELECT id, dropbox_path, original_name, file_size, "
            "page_count, uploaded_by, created_at FROM pdf_files"
        )).fetchall()
        for row in rows:
            old_id, dropbox_path, original_name, file_size, page_count, uploaded_by, created_at = row
            folder_path = dropbox_path.rsplit("/", 1)[0] if "/" in dropbox_path else ""
            conn.execute(text(
                "INSERT INTO documents (id, folder_path, file_type, original_name, "
                "file_size, page_count, sort_order, uploaded_by, created_at) "
                "VALUES (:id, :fp, 'pdf', :on, :fs, :pc, 0, :ub, :ca)"
            ), {
                "id": old_id, "fp": folder_path, "on": original_name,
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
    """Recreate annotations table with document_id instead of dropbox_path.

    SQLite can't ALTER NOT NULL constraints, so we recreate the table.
    This handles both fresh migrations (dropbox_path → document_id) and
    already-migrated DBs that still have the old dropbox_path NOT NULL column.
    """
    from sqlalchemy import text, inspect as sa_inspect
    if "annotations" not in tables:
        return
    insp = sa_inspect(eng)
    cols = [c["name"] for c in insp.get_columns("annotations")]

    # Already fully migrated (no dropbox_path column)
    if "document_id" in cols and "dropbox_path" not in cols:
        return

    with eng.begin() as conn:
        # Step 1: If document_id doesn't exist yet, add it and populate
        if "document_id" not in cols:
            conn.execute(text(
                "ALTER TABLE annotations ADD COLUMN document_id INTEGER DEFAULT 0"
            ))
            # Map existing annotations to documents by folder path
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

        # Step 2: Recreate table without dropbox_path (removes NOT NULL constraint)
        if "dropbox_path" in cols:
            conn.execute(text("""
                CREATE TABLE annotations_new (
                    id INTEGER PRIMARY KEY,
                    user_id VARCHAR NOT NULL,
                    document_id INTEGER NOT NULL DEFAULT 0,
                    page_number INTEGER NOT NULL,
                    strokes_json TEXT NOT NULL DEFAULT '[]',
                    created_at DATETIME,
                    updated_at DATETIME,
                    UNIQUE(user_id, document_id, page_number)
                )
            """))
            conn.execute(text("""
                INSERT INTO annotations_new
                    (id, user_id, document_id, page_number, strokes_json, created_at, updated_at)
                SELECT id, user_id, document_id, page_number, strokes_json, created_at, updated_at
                FROM annotations
            """))
            conn.execute(text("DROP TABLE annotations"))
            conn.execute(text("ALTER TABLE annotations_new RENAME TO annotations"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_annotations_user_id ON annotations(user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_annotations_document_id ON annotations(document_id)"))


def _migrate_documents_dropbox_path(eng, tables):
    """Backfill dropbox_path for existing documents from folder_path + name."""
    from sqlalchemy import text
    if "documents" not in tables:
        return
    with eng.begin() as conn:
        conn.execute(text(
            "UPDATE documents SET dropbox_path = folder_path || '/' || original_name "
            "WHERE dropbox_path IS NULL"
        ))


def _backfill_section_preset_shortcodes(eng, tables):
    """Set shortcode and max_num on existing section presets that don't have them yet."""
    if "section_presets" not in tables:
        return
    from sqlalchemy import text
    defaults = {
        "Intro": ("Intro", 0),
        "Strophe": ("Strophe", 5),
        "Refrain": ("Refrain", 4),
        "Bridge": ("Bridge", 4),
        "Solo": ("Solo", 0),
        "Outro": ("Outro", 0),
    }
    with eng.begin() as conn:
        for name, (shortcode, max_num) in defaults.items():
            conn.execute(text(
                "UPDATE section_presets SET shortcode = :sc, max_num = :mn "
                "WHERE name = :name AND shortcode IS NULL"
            ), {"sc": shortcode, "mn": max_num, "name": name})


def _backfill_label_shortcodes(eng, tables):
    """Set shortcode and aliases on existing Stimme labels that don't have them yet."""
    if "labels" not in tables:
        return
    from sqlalchemy import text
    defaults = {
        "Sopran": ("S", "soprano,sop"),
        "Alt": ("A", "alto"),
        "Tenor": ("T", "tenore"),
        "Bass": ("B", "basso,baritone"),
    }
    with eng.begin() as conn:
        # Normalize 'Stimmen' → 'Stimme'
        conn.execute(text("UPDATE labels SET category = 'Stimme' WHERE category = 'Stimmen'"))
        for name, (shortcode, aliases) in defaults.items():
            conn.execute(text(
                "UPDATE labels SET shortcode = :sc, aliases = :al "
                "WHERE name = :name AND category = 'Stimme' AND shortcode IS NULL"
            ), {"sc": shortcode, "al": aliases, "name": name})


def _drop_obsolete_tables(eng, tables):
    """Drop tables that are no longer needed."""
    from sqlalchemy import text
    with eng.begin() as conn:
        if "file_settings" in tables:
            conn.execute(text("DROP TABLE file_settings"))
