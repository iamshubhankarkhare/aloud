#!/bin/bash
# Dev harness for the wake word listener.
# Runs listener.py directly with the venv python and your config.
# Stderr visible, stdout shows JSON lines on wake word detection.
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${ALOUD_CONFIG_PATH:-$HOME/.claude/channels/aloud/config.json}"
VENV_PYTHON="$HOME/.claude/channels/aloud/.venv/bin/python3"
[ -x "$VENV_PYTHON" ] || { echo "venv python missing — run /aloud:configure first"; exit 1; }
[ -f "$CONFIG_PATH" ] || { echo "config missing at $CONFIG_PATH — run /aloud:configure"; exit 1; }
echo "[dev] config: $CONFIG_PATH"
echo "[dev] python: $VENV_PYTHON"
echo "[dev] starting listener — say wake word; ctrl-c to stop"
cat "$CONFIG_PATH" | "$VENV_PYTHON" "$PLUGIN_DIR/wakeword/listener.py"
