#!/bin/bash
set -euo pipefail
# Launch Claude Code with Aloud channel
# Usage: ./aloud.sh [extra claude flags]
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
claude --dangerously-load-development-channels server:aloud "$@"
