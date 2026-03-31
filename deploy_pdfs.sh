#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Deploy PDFs + DB-Eintraege auf den Prod-Server
# Uebertraegt data/pdfs/ und fuehrt SQL-Inserts aus
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PROD_SERVER="choirbox@204.168.218.188"
PROD_DIR="/home/choirbox/choirbox"
LOCAL_DB="choirbox.db"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}=== PDF-Import → Produktion ===${NC}"
echo ""

# 1. PDF-Dateien synchronisieren
echo -e "  ${CYAN}>${NC} PDF-Dateien synchronisieren (data/pdfs/)..."
PDF_COUNT=$(ls data/pdfs/*.pdf 2>/dev/null | wc -l | tr -d ' ')
rsync -avz data/pdfs/ "${PROD_SERVER}:${PROD_DIR}/data/pdfs/" > /dev/null 2>&1
echo -e "  ${GREEN}ok${NC} ${PDF_COUNT} PDF-Dateien synchronisiert"

# 2. SQL generieren
echo -e "  ${CYAN}>${NC} SQL-Statements generieren..."
SQL_FILE=$(mktemp /tmp/choirbox_pdfs_XXXXXX.sql)

# pdf_files Eintraege
sqlite3 "$LOCAL_DB" "SELECT 'INSERT OR REPLACE INTO pdf_files (dropbox_path, filename, original_name, file_size, page_count, uploaded_by, created_at) VALUES (' || quote(dropbox_path) || ', ' || quote(filename) || ', ' || quote(original_name) || ', ' || file_size || ', ' || page_count || ', (SELECT id FROM users WHERE username=''admin''), ' || quote(created_at) || ');' FROM pdf_files;" >> "$SQL_FILE"

# file_settings Eintraege (nur die mit pdf_ref_path)
sqlite3 "$LOCAL_DB" "SELECT 'INSERT OR REPLACE INTO file_settings (dropbox_path, pdf_ref_path, created_at, updated_at) VALUES (' || quote(dropbox_path) || ', ' || quote(pdf_ref_path) || ', ' || quote(created_at) || ', ' || quote(updated_at) || ');' FROM file_settings WHERE pdf_ref_path IS NOT NULL;" >> "$SQL_FILE"

STMT_COUNT=$(wc -l < "$SQL_FILE" | tr -d ' ')
echo -e "  ${GREEN}ok${NC} ${STMT_COUNT} SQL-Statements generiert"

# 3. SQL auf Prod ausfuehren
echo -e "  ${CYAN}>${NC} SQL auf Prod-DB ausfuehren..."
scp "$SQL_FILE" "${PROD_SERVER}:/tmp/choirbox_pdfs.sql" > /dev/null 2>&1
ssh "$PROD_SERVER" "sqlite3 ${PROD_DIR}/choirbox.db < /tmp/choirbox_pdfs.sql && rm /tmp/choirbox_pdfs.sql"
echo -e "  ${GREEN}ok${NC} DB-Eintraege erstellt"

# 4. Aufraumen
rm "$SQL_FILE"

# 5. Verifizieren
echo -e "  ${CYAN}>${NC} Verifizieren..."
REMOTE_PDFS=$(ssh "$PROD_SERVER" "ls ${PROD_DIR}/data/pdfs/*.pdf 2>/dev/null | wc -l | tr -d ' '")
REMOTE_RECORDS=$(ssh "$PROD_SERVER" "sqlite3 ${PROD_DIR}/choirbox.db 'SELECT COUNT(*) FROM pdf_files;'")
REMOTE_REFS=$(ssh "$PROD_SERVER" "sqlite3 ${PROD_DIR}/choirbox.db 'SELECT COUNT(*) FROM file_settings WHERE pdf_ref_path IS NOT NULL;'")
echo -e "  ${GREEN}ok${NC} Prod: ${REMOTE_PDFS} PDF-Dateien, ${REMOTE_RECORDS} PdfFile-Eintraege, ${REMOTE_REFS} Referenzen"

echo ""
echo -e "${GREEN}${BOLD}PDF-Import auf Produktion abgeschlossen.${NC}"
