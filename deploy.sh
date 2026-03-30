#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy
# Usage: ./deploy.sh              → Deploy nur auf Dev
#        ./deploy.sh staging      → Deploy auf Staging
#        ./deploy.sh prod         → Deploy auf Staging + Produktion
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
DEV_SERVER="joerg@192.168.178.50"
DEV_DIR="/home/joerg/choirbox-dev"
DEV_URL="http://192.168.178.50:8002"
DEV_RESTART="sudo systemctl restart choirbox-dev"

STAGING_SERVER="joerg@192.168.178.50"
STAGING_DIR="/home/joerg/choirbox"
STAGING_URL="http://192.168.178.50:8001"
STAGING_RESTART="sudo systemctl restart choirbox"

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
TARGET="${1:-dev}"

case "$TARGET" in
  dev)
    echo -e "${BOLD}Deploy → Dev${NC}"
    echo ""
    deploy_server "$DEV_SERVER" "$DEV_DIR" "$DEV_URL" "Dev" \
      "ssh $DEV_SERVER '$DEV_RESTART'"
    echo -e "${YELLOW}  → Nach Tests: ${NC}${BOLD}./deploy.sh staging${NC}"
    ;;
  staging)
    echo -e "${BOLD}Deploy → Staging${NC}"
    echo ""
    deploy_server "$STAGING_SERVER" "$STAGING_DIR" "$STAGING_URL" "Staging" \
      "ssh $STAGING_SERVER '$STAGING_RESTART'"
    echo -e "${YELLOW}  → Nach Tests: ${NC}${BOLD}./deploy.sh prod${NC}"
    ;;
  prod)
    echo -e "${BOLD}Deploy → Staging + Produktion${NC}"
    echo ""
    deploy_server "$STAGING_SERVER" "$STAGING_DIR" "$STAGING_URL" "Staging" \
      "ssh $STAGING_SERVER '$STAGING_RESTART'"
    deploy_server "$PROD_SERVER" "$PROD_DIR" "$PROD_URL" "Produktion" \
      "ssh $PROD_ROOT_SERVER 'systemctl restart choirbox'" \
      "ssh $PROD_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 http://localhost:8001/'"
    echo -e "${GREEN}${BOLD}Deploy auf Staging + Produktion abgeschlossen.${NC}"
    ;;
  *)
    echo -e "${RED}Unbekanntes Ziel: $TARGET${NC}"
    echo "Erlaubt: dev (default), staging, prod"
    exit 1
    ;;
esac
