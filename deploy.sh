#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy
# Usage: ./deploy.sh 1   → Dev
#        ./deploy.sh 2   → Staging
#        ./deploy.sh 3   → Prod (Staging + Produktion)
#        ./deploy.sh 4   → Alle (Dev + Staging + Produktion)
#        ./deploy.sh     → Fragt nach
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

  # 2b. Playwright Chromium — idempotent, lädt nur, falls noch nicht da.
  echo -e "  ${CYAN}>${NC} Playwright Chromium pruefen..."
  ssh "$SERVER" "cd ${REMOTE_DIR} && source venv/bin/activate && python -m playwright install chromium" >/dev/null 2>&1 || true
  echo -e "  ${GREEN}ok${NC} Chromium bereit"

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
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo ""
  echo "Deploy-Ziel waehlen:"
  echo "  1 = Dev"
  echo "  2 = Staging"
  echo "  3 = Prod (Staging + Produktion)"
  echo "  4 = Alle (Dev + Staging + Produktion)"
  echo ""
  read -rp "Nummer: " TARGET
fi

deploy_dev() {
  deploy_server "$DEV_SERVER" "$DEV_DIR" "$DEV_URL" "Dev" \
    "ssh -t $DEV_SERVER '$DEV_RESTART'" \
    "ssh $DEV_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 http://localhost:8002/'"
}

deploy_staging() {
  deploy_server "$STAGING_SERVER" "$STAGING_DIR" "$STAGING_URL" "Staging" \
    "ssh -t $STAGING_SERVER '$STAGING_RESTART'"
}

deploy_prod() {
  deploy_server "$PROD_SERVER" "$PROD_DIR" "$PROD_URL" "Produktion" \
    "ssh $PROD_ROOT_SERVER 'systemctl restart choirbox'" \
    "ssh $PROD_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 http://localhost:8001/'"
}

case "$TARGET" in
  1)
    echo -e "${BOLD}Deploy → Dev${NC}"
    echo ""
    deploy_dev
    ;;
  2)
    echo -e "${BOLD}Deploy → Staging${NC}"
    echo ""
    deploy_staging
    ;;
  3)
    echo -e "${BOLD}Deploy → Staging + Produktion${NC}"
    echo ""
    deploy_staging
    deploy_prod
    ;;
  4)
    echo -e "${BOLD}Deploy → Dev + Staging + Produktion${NC}"
    echo ""
    deploy_dev
    deploy_staging
    deploy_prod
    ;;
  *)
    echo -e "${RED}Unbekanntes Ziel: $TARGET${NC}"
    echo "Erlaubt: 1 (Dev), 2 (Staging), 3 (Prod), 4 (Alle)"
    exit 1
    ;;
esac
