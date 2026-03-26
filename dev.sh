#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ChoirBox — Dev Server Manager
# Steuert Backend (FastAPI/Uvicorn) und Frontend (Vite) zuverlaessig.
#
# Verwendung:
#   ./dev.sh start [backend|frontend]   — Server starten (beide oder einzeln)
#   ./dev.sh stop  [backend|frontend]   — Server stoppen (beide oder einzeln)
#   ./dev.sh restart [backend|frontend] — Stoppen + Starten
#   ./dev.sh status                     — Zeigt was laeuft
#   ./dev.sh logs [backend|frontend]    — Live Log-Ausgabe (tail -f)
#   ./dev.sh help                       — Diese Hilfe
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/.logs"
BACKEND_PORT=8001
FRONTEND_PORT=5174
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# ─── Farben ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Hilfsfunktionen ─────────────────────────────────────────

ensure_log_dir() {
    mkdir -p "$LOG_DIR"
    if ! grep -qx '.logs/' "$PROJECT_DIR/.gitignore" 2>/dev/null; then
        echo '.logs/' >> "$PROJECT_DIR/.gitignore"
    fi
}

is_running() {
    local pid_file="$1"
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            rm -f "$pid_file"
        fi
    fi
    return 1
}

get_pid() {
    local pid_file="$1"
    if [[ -f "$pid_file" ]]; then
        cat "$pid_file"
    fi
}

wait_for_port() {
    local port=$1
    local timeout=${2:-10}
    local elapsed=0
    while ! lsof -ti:"$port" >/dev/null 2>&1; do
        sleep 0.5
        elapsed=$((elapsed + 1))
        if [[ $elapsed -ge $((timeout * 2)) ]]; then
            return 1
        fi
    done
    return 0
}

kill_gracefully() {
    local pid=$1
    local name=$2
    local timeout=${3:-5}

    if ! kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    kill "$pid" 2>/dev/null

    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
        sleep 0.5
        elapsed=$((elapsed + 1))
        if [[ $elapsed -ge $((timeout * 2)) ]]; then
            echo -e "  ${YELLOW}! $name reagiert nicht, force kill...${NC}"
            kill -9 "$pid" 2>/dev/null
            sleep 0.5
            break
        fi
    done
}

kill_tree() {
    local pid=$1
    local name=$2

    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)

    kill_gracefully "$pid" "$name"

    for child in $children; do
        kill_gracefully "$child" "$name (child)" 2
    done
}

kill_by_port() {
    local port=$1
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        for pid in $pids; do
            kill "$pid" 2>/dev/null || true
        done
        sleep 1
        pids=$(lsof -ti:"$port" 2>/dev/null || true)
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
}

# ─── Kommandos ────────────────────────────────────────────────

start_backend() {
    if is_running "$BACKEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$BACKEND_PID_FILE")
        echo -e "  ${GREEN}*${NC} Backend laeuft bereits (PID $pid, Port $BACKEND_PORT)"
        return 0
    fi

    if lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}! Port $BACKEND_PORT belegt, raeume auf...${NC}"
        kill_by_port "$BACKEND_PORT"
        sleep 1
    fi

    echo -e "  ${CYAN}>${NC} Backend starten..."
    cd "$PROJECT_DIR"

    (
        source venv/bin/activate 2>/dev/null || {
            echo -e "  ${RED}x venv nicht gefunden. Erst 'python3 -m venv venv' ausfuehren.${NC}"
            exit 1
        }
        python run.py >> "$BACKEND_LOG" 2>&1 &
        echo $! > "$BACKEND_PID_FILE"
    )

    if wait_for_port "$BACKEND_PORT" 10; then
        local pid
        pid=$(get_pid "$BACKEND_PID_FILE")
        echo -e "  ${GREEN}ok${NC} Backend gestartet (PID $pid, Port $BACKEND_PORT)"
    else
        echo -e "  ${RED}x${NC} Backend konnte nicht gestartet werden"
        echo -e "  ${YELLOW}-> Log pruefen: ./dev.sh logs backend${NC}"
        rm -f "$BACKEND_PID_FILE"
        return 1
    fi
}

stop_backend() {
    if is_running "$BACKEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$BACKEND_PID_FILE")
        echo -e "  ${CYAN}#${NC} Backend stoppen (PID $pid)..."
        kill_tree "$pid" "Backend"
        rm -f "$BACKEND_PID_FILE"
        kill_by_port "$BACKEND_PORT"
        echo -e "  ${GREEN}ok${NC} Backend gestoppt"
    elif lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}!${NC} Backend ohne PID-File gefunden, stoppe ueber Port..."
        kill_by_port "$BACKEND_PORT"
        echo -e "  ${GREEN}ok${NC} Backend gestoppt"
    else
        echo -e "  ${YELLOW}o${NC} Backend laeuft nicht"
    fi
}

start_frontend() {
    if is_running "$FRONTEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$FRONTEND_PID_FILE")
        echo -e "  ${GREEN}*${NC} Frontend laeuft bereits (PID $pid, Port $FRONTEND_PORT)"
        return 0
    fi

    if lsof -ti:"$FRONTEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}! Port $FRONTEND_PORT belegt, raeume auf...${NC}"
        kill_by_port "$FRONTEND_PORT"
        sleep 1
    fi

    echo -e "  ${CYAN}>${NC} Frontend starten..."
    cd "$PROJECT_DIR/frontend"

    npm run dev >> "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"

    cd "$PROJECT_DIR"

    if wait_for_port "$FRONTEND_PORT" 15; then
        local pid
        pid=$(get_pid "$FRONTEND_PID_FILE")
        echo -e "  ${GREEN}ok${NC} Frontend gestartet (PID $pid, Port $FRONTEND_PORT)"
    else
        echo -e "  ${RED}x${NC} Frontend konnte nicht gestartet werden"
        echo -e "  ${YELLOW}-> Log pruefen: ./dev.sh logs frontend${NC}"
        rm -f "$FRONTEND_PID_FILE"
        return 1
    fi
}

stop_frontend() {
    if is_running "$FRONTEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$FRONTEND_PID_FILE")
        echo -e "  ${CYAN}#${NC} Frontend stoppen (PID $pid)..."
        kill_tree "$pid" "Frontend"
        rm -f "$FRONTEND_PID_FILE"
        kill_by_port "$FRONTEND_PORT"
        echo -e "  ${GREEN}ok${NC} Frontend gestoppt"
    elif lsof -ti:"$FRONTEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}!${NC} Frontend ohne PID-File gefunden, stoppe ueber Port..."
        kill_by_port "$FRONTEND_PORT"
        echo -e "  ${GREEN}ok${NC} Frontend gestoppt"
    else
        echo -e "  ${YELLOW}o${NC} Frontend laeuft nicht"
    fi
}

cmd_start() {
    local target="${1:-all}"
    echo -e "${BOLD}=== ChoirBox — Start ===${NC}"
    ensure_log_dir

    case "$target" in
        backend|b)  start_backend ;;
        frontend|f) start_frontend ;;
        all)
            start_backend
            start_frontend
            echo ""
            echo -e "${GREEN}App: ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
            ;;
        *)
            echo -e "${RED}Unbekanntes Target: $target${NC}"
            echo "Erlaubt: backend (b), frontend (f), oder leer fuer beide"
            return 1
            ;;
    esac
}

cmd_stop() {
    local target="${1:-all}"
    echo -e "${BOLD}=== ChoirBox — Stop ===${NC}"

    case "$target" in
        backend|b)  stop_backend ;;
        frontend|f) stop_frontend ;;
        all)
            stop_frontend
            stop_backend
            ;;
        *)
            echo -e "${RED}Unbekanntes Target: $target${NC}"
            return 1
            ;;
    esac
}

cmd_restart() {
    local target="${1:-all}"
    echo -e "${BOLD}=== ChoirBox — Restart ===${NC}"
    ensure_log_dir

    case "$target" in
        backend|b)
            stop_backend
            start_backend
            ;;
        frontend|f)
            stop_frontend
            start_frontend
            ;;
        all)
            stop_frontend
            stop_backend
            sleep 1
            start_backend
            start_frontend
            echo ""
            echo -e "${GREEN}App: ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
            ;;
        *)
            echo -e "${RED}Unbekanntes Target: $target${NC}"
            return 1
            ;;
    esac
}

cmd_status() {
    echo -e "${BOLD}=== ChoirBox — Status ===${NC}"
    echo ""

    if is_running "$BACKEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$BACKEND_PID_FILE")
        echo -e "  ${GREEN}*${NC} Backend    PID $pid    Port $BACKEND_PORT    http://localhost:$BACKEND_PORT/docs"
    elif lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}*${NC} Backend    Port $BACKEND_PORT belegt (kein PID-File)"
    else
        echo -e "  ${RED}o${NC} Backend    gestoppt"
    fi

    if is_running "$FRONTEND_PID_FILE"; then
        local pid
        pid=$(get_pid "$FRONTEND_PID_FILE")
        echo -e "  ${GREEN}*${NC} Frontend   PID $pid    Port $FRONTEND_PORT    http://localhost:$FRONTEND_PORT"
    elif lsof -ti:"$FRONTEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${YELLOW}*${NC} Frontend   Port $FRONTEND_PORT belegt (kein PID-File)"
    else
        echo -e "  ${RED}o${NC} Frontend   gestoppt"
    fi

    echo ""

    if [[ -d "$LOG_DIR" ]]; then
        echo -e "  ${CYAN}Logs:${NC}"
        if [[ -f "$BACKEND_LOG" ]]; then
            local size
            size=$(du -h "$BACKEND_LOG" 2>/dev/null | cut -f1)
            echo "    Backend:  $BACKEND_LOG ($size)"
        fi
        if [[ -f "$FRONTEND_LOG" ]]; then
            local size
            size=$(du -h "$FRONTEND_LOG" 2>/dev/null | cut -f1)
            echo "    Frontend: $FRONTEND_LOG ($size)"
        fi
    fi
}

cmd_logs() {
    local target="${1:-all}"

    case "$target" in
        backend|b)
            if [[ -f "$BACKEND_LOG" ]]; then
                echo -e "${BOLD}=== Backend Log (Ctrl+C zum Beenden) ===${NC}"
                tail -f "$BACKEND_LOG"
            else
                echo -e "${YELLOW}Kein Backend-Log vorhanden.${NC}"
            fi
            ;;
        frontend|f)
            if [[ -f "$FRONTEND_LOG" ]]; then
                echo -e "${BOLD}=== Frontend Log (Ctrl+C zum Beenden) ===${NC}"
                tail -f "$FRONTEND_LOG"
            else
                echo -e "${YELLOW}Kein Frontend-Log vorhanden.${NC}"
            fi
            ;;
        all)
            local has_logs=false
            if [[ -f "$BACKEND_LOG" ]]; then has_logs=true; fi
            if [[ -f "$FRONTEND_LOG" ]]; then has_logs=true; fi

            if [[ "$has_logs" == true ]]; then
                echo -e "${BOLD}=== Alle Logs (Ctrl+C zum Beenden) ===${NC}"
                echo -e "${CYAN}[BE]${NC} = Backend   ${CYAN}[FE]${NC} = Frontend"
                echo ""
                tail -f "$BACKEND_LOG" 2>/dev/null | sed "s/^/[BE] /" &
                local tail_be=$!
                tail -f "$FRONTEND_LOG" 2>/dev/null | sed "s/^/[FE] /" &
                local tail_fe=$!
                trap "kill $tail_be $tail_fe 2>/dev/null; exit 0" INT TERM
                wait
            else
                echo -e "${YELLOW}Keine Logs vorhanden. Wurde ein Server schon gestartet?${NC}"
            fi
            ;;
        clear|c)
            echo -e "${CYAN}Logs loeschen...${NC}"
            : > "$BACKEND_LOG" 2>/dev/null || true
            : > "$FRONTEND_LOG" 2>/dev/null || true
            echo -e "${GREEN}ok${NC} Logs geleert"
            ;;
        *)
            echo -e "${RED}Unbekanntes Target: $target${NC}"
            echo "Erlaubt: backend (b), frontend (f), clear (c), oder leer fuer beide"
            return 1
            ;;
    esac
}

cmd_help() {
    echo -e "${BOLD}ChoirBox — Dev Server Manager${NC}"
    echo ""
    echo -e "  ${CYAN}./dev.sh start${NC}  [backend|frontend]   Beide oder einzeln starten"
    echo -e "  ${CYAN}./dev.sh stop${NC}   [backend|frontend]   Beide oder einzeln stoppen"
    echo -e "  ${CYAN}./dev.sh restart${NC} [backend|frontend]  Stoppen + Starten"
    echo -e "  ${CYAN}./dev.sh status${NC}                      Was laeuft gerade?"
    echo -e "  ${CYAN}./dev.sh logs${NC}   [backend|frontend]   Live Log-Ausgabe"
    echo -e "  ${CYAN}./dev.sh logs clear${NC}                  Logs leeren"
    echo ""
    echo "  Kurzformen: b = backend, f = frontend"
    echo ""
    echo "  Beispiele:"
    echo "    ./dev.sh start              # Beide Server starten"
    echo "    ./dev.sh restart b          # Nur Backend neustarten"
    echo "    ./dev.sh logs f             # Nur Frontend-Logs anzeigen"
    echo "    ./dev.sh stop               # Alles beenden"
}

# ─── Main ─────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true

case "$cmd" in
    start)   cmd_start "$@" ;;
    stop)    cmd_stop "$@" ;;
    restart) cmd_restart "$@" ;;
    status|s) cmd_status ;;
    logs|l)  cmd_logs "$@" ;;
    help|h|-h|--help) cmd_help ;;
    *)
        echo -e "${RED}Unbekannter Befehl: $cmd${NC}"
        echo ""
        cmd_help
        exit 1
        ;;
esac
