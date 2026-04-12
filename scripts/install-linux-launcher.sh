#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="$SCRIPT_DIR/start-investfinder.sh"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/investfinder.desktop"
USER_BIN_DIR="$HOME/.local/bin"
USER_LAUNCHER="$USER_BIN_DIR/investfinder-launcher"
CONFIG_DIR="$HOME/.config/investfinder"
CONFIG_FILE="$CONFIG_DIR/launcher.conf"

mkdir -p "$DESKTOP_DIR"
mkdir -p "$USER_BIN_DIR"
mkdir -p "$CONFIG_DIR"
chmod +x "$LAUNCHER"

cat > "$USER_LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="\$HOME/.config/investfinder"
CONFIG_FILE="\$CONFIG_DIR/launcher.conf"
DEFAULT_REPO_DIR="$REPO_DIR"

is_valid_repo_dir() {
	local dir="\$1"
	[[ -n "\$dir" ]] || return 1
	[[ -f "\$dir/scripts/start-investfinder.sh" ]] || return 1
	[[ -f "\$dir/server.js" ]] || return 1
	[[ -d "\$dir/src" ]] || return 1
}

write_config() {
	local repo="\$1"
	mkdir -p "\$CONFIG_DIR"
	printf 'REPO_DIR=%q\n' "\$repo" > "\$CONFIG_FILE"
}

load_saved_repo() {
	if [[ -f "\$CONFIG_FILE" ]]; then
		# shellcheck disable=SC1090
		source "\$CONFIG_FILE"
		echo "\${REPO_DIR:-}"
		return 0
	fi

	echo ""
}

find_repo_dir() {
	local candidate=""

	candidate="\$(load_saved_repo)"
	if is_valid_repo_dir "\$candidate"; then
		echo "\$candidate"
		return 0
	fi

	if is_valid_repo_dir "\$DEFAULT_REPO_DIR"; then
		echo "\$DEFAULT_REPO_DIR"
		return 0
	fi

	local search_roots=(
		"\$PWD"
		"\$HOME/Schreibtisch"
		"\$HOME/Desktop"
		"\$HOME/Dokumente"
		"\$HOME/Documents"
		"\$HOME"
	)

	for root in "\${search_roots[@]}"; do
		[[ -d "\$root" ]] || continue

		while IFS= read -r match; do
			local dir="\$(dirname "\$(dirname "\$match")")"
			if is_valid_repo_dir "\$dir"; then
				echo "\$dir"
				return 0
			fi
		done < <(find "\$root" -maxdepth 5 -type f -path '*/scripts/start-investfinder.sh' 2>/dev/null)
	done

	return 1
}

REPO_DIR="\$(find_repo_dir || true)"

if [[ -z "\$REPO_DIR" ]]; then
	echo "[InvestFinder] Fehler: Projektordner konnte nicht gefunden werden."
	echo "[InvestFinder] Bitte starte einmal direkt: /PFAD/ZU/InvestFinder/scripts/start-investfinder.sh"
	exit 1
fi

write_config "\$REPO_DIR"

exec "\$REPO_DIR/scripts/start-investfinder.sh" "\$@"
EOF

chmod +x "$USER_LAUNCHER"
printf 'REPO_DIR=%q\n' "$REPO_DIR" > "$CONFIG_FILE"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=InvestFinder
Comment=Startet InvestFinder lokal und stoppt ihn beim Schliessen des Terminals
Exec=$USER_LAUNCHER
Icon=utilities-terminal
Terminal=true
Categories=Finance;Development;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"

echo "Desktop-Launcher erstellt: $DESKTOP_FILE"
echo "Stabiler Launcher erstellt: $USER_LAUNCHER"
echo "Launcher-Konfiguration: $CONFIG_FILE"
echo "Hinweis: Beim Schliessen des Launcher-Terminals wird InvestFinder automatisch gestoppt."
