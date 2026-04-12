#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER_CONFIG_DIR="$HOME/.config/investfinder"
LAUNCHER_CONFIG_FILE="$LAUNCHER_CONFIG_DIR/launcher.conf"

APP_PORT="${PORT:-3000}"
APP_URL="http://localhost:${APP_PORT}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[InvestFinder] Stoppe Server (PID $SERVER_PID) ..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$REPO_DIR"

mkdir -p "$LAUNCHER_CONFIG_DIR"
printf 'REPO_DIR=%q\n' "$REPO_DIR" > "$LAUNCHER_CONFIG_FILE"

echo "[InvestFinder] Starte in: $REPO_DIR"

if [[ ! -d "$REPO_DIR/node_modules" ]]; then
  echo "[InvestFinder] node_modules fehlen. Fuehre npm install aus ..."
  npm install
fi

echo "[InvestFinder] Starte Server ..."
npm start &
SERVER_PID="$!"

for _ in $(seq 1 60); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[InvestFinder] Server konnte nicht gestartet werden."
    exit 1
  fi

  sleep 1
done

echo "[InvestFinder] Oeffne Browser: $APP_URL"
if ! xdg-open "$APP_URL" >/dev/null 2>&1; then
  echo "[InvestFinder] Browser konnte nicht automatisch geoeffnet werden."
  echo "[InvestFinder] Bitte manuell aufrufen: $APP_URL"
fi

echo "[InvestFinder] App laeuft. Zum Beenden dieses Fenster schliessen oder Strg+C druecken."
wait "$SERVER_PID"
