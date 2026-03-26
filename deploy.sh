#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy to Hetzner
# Usage: ./deploy.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="choirbox@204.168.218.188"
ROOT_SERVER="root@204.168.218.188"
REMOTE_DIR="/home/choirbox/choirbox"
APP_URL="https://choirbox.duckdns.org"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}=== ChoirBox — Deploy ===${NC}"
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
ssh "$ROOT_SERVER" "systemctl restart choirbox" 2>/dev/null
sleep 2

# 5. Verify
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$APP_URL/" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "  ${GREEN}ok${NC} Server laeuft"
  echo ""
  echo -e "${GREEN}App: ${BOLD}${APP_URL}${NC}"
else
  echo -e "  ${RED}x${NC} Server antwortet nicht (HTTP $HTTP_STATUS)"
  echo -e "  ${CYAN}>${NC} Log pruefen: ssh $ROOT_SERVER 'journalctl -u choirbox -n 30'"
  exit 1
fi
