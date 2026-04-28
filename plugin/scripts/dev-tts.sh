#!/bin/bash
# Dev harness for Aloud v2.
# Runs server.ts standalone with stdin held open via fifo so the orphan
# watchdog doesn't shut us down. Stderr visible. speak() sampling fails
# silently because there's no MCP host to answer createMessage — that's
# expected in dev. Use this to verify the server boots, Kokoro loads,
# and TTS synthesis works (via direct curl to the Kokoro HTTP server).
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PLUGIN_DIR"
echo "[dev] $(pwd)"
echo "[dev] starting bun server.ts; ctrl-c to stop"
FIFO=$(mktemp -u)
mkfifo "$FIFO"
sleep infinity > "$FIFO" &
WRITER=$!
trap "kill $WRITER 2>/dev/null; rm -f $FIFO" EXIT
bun server.ts < "$FIFO"
