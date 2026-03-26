#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Deploy to Test Server
# Usage: ./deploy.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="192.168.178.50"
SERVER_USER="joerg"
SERVER_PASS="admin"
SERVER_PATH="/home/joerg/choirbox"
SERVER_PORT=8001

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SSH_CMD="sshpass -p $SERVER_PASS ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER}"
SCP_CMD="sshpass -p $SERVER_PASS scp -o StrictHostKeyChecking=no"

echo -e "${BOLD}=== ChoirBox — Deploy ===${NC}"
echo ""

# 1. Frontend build
echo -e "  ${CYAN}>${NC} Frontend build..."
cd "$PROJECT_DIR/frontend"
npm run build > /dev/null 2>&1
echo -e "  ${GREEN}ok${NC} Frontend build fertig"

# 2. Rsync to server
echo -e "  ${CYAN}>${NC} Dateien synchronisieren..."
cd "$PROJECT_DIR"
rsync -avz --delete \
  --exclude='venv/' --exclude='node_modules/' --exclude='.git/' \
  --exclude='choirbox.db*' --exclude='.env' --exclude='__pycache__/' \
  --exclude='.pytest_cache/' --exclude='frontend/dist/' \
  --exclude='.logs/' --exclude='.claude/' --exclude='.DS_Store' \
  -e "sshpass -p $SERVER_PASS ssh -o StrictHostKeyChecking=no" \
  . ${SERVER_USER}@${SERVER}:${SERVER_PATH}/ > /dev/null 2>&1
echo -e "  ${GREEN}ok${NC} Dateien synchronisiert"

# 3. Install deps if needed (check if venv exists)
$SSH_CMD "test -d ${SERVER_PATH}/venv || (cd ${SERVER_PATH} && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt > /dev/null 2>&1)" 2>/dev/null
echo -e "  ${GREEN}ok${NC} Dependencies geprueft"

# 4. Restart server
echo -e "  ${CYAN}>${NC} Server neustarten..."
$SSH_CMD "kill \$(lsof -ti:${SERVER_PORT}) 2>/dev/null; sleep 1; cd ${SERVER_PATH} && source venv/bin/activate && UVICORN_RELOAD=false nohup python run.py </dev/null >${SERVER_PATH}/choirbox.log 2>&1 & echo started" 2>/dev/null || true

# 5. Wait and verify
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${SERVER}:${SERVER_PORT}/" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "  ${GREEN}ok${NC} Server laeuft"
  echo ""
  echo -e "${GREEN}App: ${BOLD}http://${SERVER}:${SERVER_PORT}${NC}"
else
  echo -e "  ${RED}x${NC} Server antwortet nicht (HTTP $HTTP_STATUS)"
  echo -e "  ${CYAN}>${NC} Log pruefen: $SSH_CMD 'tail -20 ${SERVER_PATH}/choirbox.log'"
  exit 1
fi
