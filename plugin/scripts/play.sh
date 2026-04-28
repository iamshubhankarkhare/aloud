#!/bin/bash
# Aloud sound effect player. Invoked by Claude Code hooks.
# Reads ~/.claude/channels/aloud/config.json for sounds_enabled, theme, volume.
# Exits 0 silently if sounds disabled or sound missing.
# Usage: play.sh <sound-name>  (e.g. play.sh scan)
set -euo pipefail

CONFIG="${ALOUD_CONFIG_PATH:-$HOME/.claude/channels/aloud/config.json}"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOUND_NAME="${1:-}"

if [ -z "$SOUND_NAME" ]; then
  exit 0
fi

# Defaults
SOUNDS_ENABLED="true"
VOLUME="0.5"
THEME="lofi"

if [ -f "$CONFIG" ]; then
  # Cheap JSON parsing — avoid jq dep. Match "key":value patterns.
  SE=$(grep -o '"sounds_enabled"[[:space:]]*:[[:space:]]*[a-z]*' "$CONFIG" 2>/dev/null | grep -o 'true\|false' | head -1 || true)
  [ -n "$SE" ] && SOUNDS_ENABLED="$SE"

  V=$(grep -o '"tts_volume"[[:space:]]*:[[:space:]]*[0-9.]*' "$CONFIG" 2>/dev/null | grep -oE '[0-9]*\.?[0-9]+' | head -1 || true)
  [ -n "$V" ] && VOLUME="$V"

  T=$(grep -o '"theme"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null | grep -oE '"[^"]+"$' | tr -d '"' | head -1 || true)
  [ -n "$T" ] && THEME="$T"
fi

[ "$SOUNDS_ENABLED" != "true" ] && exit 0

SOUND_FILE="$PLUGIN_DIR/sounds/$THEME/$SOUND_NAME.wav"
[ -f "$SOUND_FILE" ] || exit 0

# Background the player so the hook returns immediately and doesn't block tool dispatch.
if command -v afplay >/dev/null 2>&1; then
  (afplay -v "$VOLUME" "$SOUND_FILE" 2>/dev/null &) >/dev/null 2>&1
elif command -v aplay >/dev/null 2>&1; then
  (aplay -q "$SOUND_FILE" 2>/dev/null &) >/dev/null 2>&1
elif command -v paplay >/dev/null 2>&1; then
  (paplay "$SOUND_FILE" 2>/dev/null &) >/dev/null 2>&1
fi

exit 0
