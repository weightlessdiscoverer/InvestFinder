#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="$SCRIPT_DIR/start-investfinder.sh"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/investfinder.desktop"

mkdir -p "$DESKTOP_DIR"
chmod +x "$LAUNCHER"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=InvestFinder
Comment=Startet InvestFinder lokal und stoppt ihn beim Schliessen des Terminals
Exec=$LAUNCHER
Icon=utilities-terminal
Terminal=true
Categories=Finance;Development;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"

echo "Desktop-Launcher erstellt: $DESKTOP_FILE"
echo "Hinweis: Beim Schliessen des Launcher-Terminals wird InvestFinder automatisch gestoppt."
