#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy
# Usage: ./deploy.sh          → Deploy nur auf Testserver
#        ./deploy.sh prod     → Deploy auf Testserver + Produktion
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Nicht aus Worktrees deployen — nur aus dem Haupt-Checkout
if git rev-parse --is-inside-work-tree &>/dev/null && [ "$(cd "$(git rev-parse --git-dir)" && pwd)" != "$(cd "$(git rev-parse --git-common-dir)" && pwd)" ]; then
  echo -e "\033[0;31mFehler: Deploy aus einem Git-Worktree ist nicht erlaubt.\033[0m"
  echo -e "Wechsle zum Haupt-Checkout und deploye von dort."
  exit 1
fi

# --- Server-Konfigurationen ---
TEST_SERVER="joerg@192.168.178.50"
TEST_DIR="/home/joerg/choirbox"
TEST_URL="http://192.168.178.50:8001"
TEST_RESTART="sudo systemctl restart choirbox"

PROD_SERVER="choirbox@204.168.218.188"
PROD_ROOT_SERVER="root@204.168.218.188"
PROD_DIR="/home/choirbox/choirbox"
PROD_URL="https://choirbox.duckdns.org"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

# --- Deploy-Funktion fuer einen Server ---
deploy_server() {
  local SERVER="$1"
  local REMOTE_DIR="$2"
  local APP_URL="$3"
  local LABEL="$4"
  local RESTART_CMD="$5"
  local VERIFY_CMD="${6:-}"

  echo -e "${BOLD}=== Deploy → ${LABEL} ===${NC}"
  echo ""

  # 1. Dateien synchronisieren
  echo -e "  ${CYAN}>${NC} Dateien synchronisieren..."
  cd "$PROJECT_DIR"
  rsync -avz --delete \
    --exclude='venv/' --exclude='node_modules/' --exclude='.git/' \
    --exclude='choirbox.db*' --exclude='.env' --exclude='data/' --exclude='__pycache__/' \
    --exclude='.pytest_cache/' --exclude='frontend/dist/' \
    --exclude='static/react/' --exclude='.logs/' --exclude='.claude/' \
    --exclude='*.sf2' \
    --exclude='.DS_Store' \
    . ${SERVER}:${REMOTE_DIR}/ > /dev/null 2>&1
  echo -e "  ${GREEN}ok${NC} Dateien synchronisiert"

  # 2. Python Dependencies
  echo -e "  ${CYAN}>${NC} Python Dependencies..."
  ssh "$SERVER" "cd ${REMOTE_DIR} && source venv/bin/activate && pip install -q -r requirements.txt" 2>/dev/null
  echo -e "  ${GREEN}ok${NC} Dependencies aktuell"

  # 3. Frontend bauen
  echo -e "  ${CYAN}>${NC} Frontend bauen..."
  ssh "$SERVER" "cd ${REMOTE_DIR}/frontend && npm install --silent && npm run build" 2>/dev/null
  echo -e "  ${GREEN}ok${NC} Frontend build fertig"

  # 4. App neu starten
  echo -e "  ${CYAN}>${NC} App neu starten..."
  eval "$RESTART_CMD" 2>/dev/null
  sleep 2

  # 5. Verify
  if [ -n "$VERIFY_CMD" ]; then
    HTTP_STATUS=$(eval "$VERIFY_CMD" 2>/dev/null || echo "000")
  else
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$APP_URL/" 2>/dev/null || echo "000")
  fi

  if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}ok${NC} Server laeuft"
    echo -e "  ${GREEN}${BOLD}${APP_URL}${NC}"
  else
    echo -e "  ${RED}x${NC} Server antwortet nicht (HTTP $HTTP_STATUS)"
    echo -e "  ${CYAN}>${NC} Log pruefen: ssh $SERVER 'journalctl -u choirbox -n 30'"
    exit 1
  fi
  echo ""
}

# --- Ziel bestimmen ---
TARGET="${1:-test}"

if [ "$TARGET" = "prod" ]; then
  echo -e "${BOLD}Deploy → Testserver + Prodserver${NC}"
else
  echo -e "${BOLD}Deploy → Testserver${NC}"
fi
echo ""

# Testserver immer deployen
deploy_server "$TEST_SERVER" "$TEST_DIR" "$TEST_URL" "Testserver" \
  "ssh $TEST_SERVER '$TEST_RESTART'"

# Bei "prod" zusaetzlich Produktion deployen
if [ "$TARGET" = "prod" ]; then
  deploy_server "$PROD_SERVER" "$PROD_DIR" "$PROD_URL" "Produktion" \
    "ssh $PROD_ROOT_SERVER 'systemctl restart choirbox'" \
    "ssh $PROD_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 http://localhost:8001/'"
  echo -e "${GREEN}${BOLD}Deploy auf beide Server abgeschlossen.${NC}"
else
  echo -e "${YELLOW}  → Nach Tests: ${NC}${BOLD}./deploy.sh prod${NC}"
fi
