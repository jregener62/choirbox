#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy (zweistufig: test → prod)
# Usage: ./deploy.sh          → Deploy auf Testserver (Standard)
#        ./deploy.sh prod     → Deploy auf Produktion
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Server-Konfigurationen ---
TEST_SERVER="joerg@192.168.178.50"
TEST_DIR="/home/joerg/choirbox"
TEST_URL="http://192.168.178.50:8001"
TEST_RESTART="sudo systemctl restart choirbox"

PROD_SERVER="choirbox@204.168.218.188"
PROD_ROOT_SERVER="root@204.168.218.188"
PROD_DIR="/home/choirbox/choirbox"
PROD_URL="https://choirbox.duckdns.org"
PROD_RESTART_CMD="ssh ${PROD_ROOT_SERVER} 'systemctl restart choirbox'"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

# --- Ziel bestimmen ---
TARGET="${1:-test}"

if [ "$TARGET" = "prod" ]; then
  SERVER="$PROD_SERVER"
  REMOTE_DIR="$PROD_DIR"
  APP_URL="$PROD_URL"
  LABEL="Produktion"
else
  SERVER="$TEST_SERVER"
  REMOTE_DIR="$TEST_DIR"
  APP_URL="$TEST_URL"
  LABEL="Testserver"
fi

echo -e "${BOLD}=== ChoirBox — Deploy → ${LABEL} ===${NC}"
echo ""

# 1. Dateien synchronisieren
echo -e "  ${CYAN}>${NC} Dateien synchronisieren..."
cd "$PROJECT_DIR"
rsync -avz --delete \
  --exclude='venv/' --exclude='node_modules/' --exclude='.git/' \
  --exclude='choirbox.db*' --exclude='.env' --exclude='__pycache__/' \
  --exclude='.pytest_cache/' --exclude='frontend/dist/' \
  --exclude='static/react/' --exclude='.logs/' --exclude='.claude/' \
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
if [ "$TARGET" = "prod" ]; then
  ssh "$PROD_ROOT_SERVER" "systemctl restart choirbox" 2>/dev/null
else
  ssh "$SERVER" "$TEST_RESTART" 2>/dev/null
fi
sleep 2

# 5. Verify
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$APP_URL/" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "  ${GREEN}ok${NC} Server laeuft"
  echo ""
  echo -e "${GREEN}${LABEL}: ${BOLD}${APP_URL}${NC}"
  if [ "$TARGET" != "prod" ]; then
    echo -e "${YELLOW}  → Nach Tests: ${NC}${BOLD}./deploy.sh prod${NC}"
  fi
else
  echo -e "  ${RED}x${NC} Server antwortet nicht (HTTP $HTTP_STATUS)"
  if [ "$TARGET" = "prod" ]; then
    echo -e "  ${CYAN}>${NC} Log pruefen: ssh $PROD_ROOT_SERVER 'journalctl -u choirbox -n 30'"
  else
    echo -e "  ${CYAN}>${NC} Log pruefen: ssh $SERVER 'journalctl -u choirbox -n 30'"
  fi
  exit 1
fi
