#!/bin/bash
# Dev harness for the full MCP server (no plugin install needed).
# Runs server.ts directly. Stderr visible. Stdin held open so the
# orphan watchdog doesn't kill it.
# Useful for iterating on listener + speak end-to-end.
# Note: speak() needs MCP sampling, so the stub stdin won't reply
# to createMessage requests — speak() will fall back to original text.
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PLUGIN_DIR"
echo "[dev] $(pwd)"
echo "[dev] starting bun server.ts; ctrl-c to stop"
# Hold stdin open via a fifo so the watchdog doesn't shut us down
FIFO=$(mktemp -u)
mkfifo "$FIFO"
sleep infinity > "$FIFO" &
WRITER=$!
trap "kill $WRITER 2>/dev/null; rm -f $FIFO" EXIT
bun server.ts < "$FIFO"
