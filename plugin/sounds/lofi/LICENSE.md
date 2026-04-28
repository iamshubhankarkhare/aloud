# Lo-fi sound pack

All sounds in this directory are CC0 (public domain).

Generated procedurally by `plugin/scripts/gen-sounds.py` using simple sine +
harmonic synthesis with envelope shaping. No copyrighted samples. Free to use,
modify, and redistribute.

To regenerate or tweak the timbres, edit `plugin/scripts/gen-sounds.py` and
re-run with the plugin's Python venv:

    ~/.claude/channels/aloud/.venv/bin/python3 plugin/scripts/gen-sounds.py

## Sounds in this pack

| File | Trigger | Description |
|---|---|---|
| `scan.wav` | Read / Grep / Glob / LS / NotebookRead | Soft high blip |
| `type.wav` | Edit / Write / MultiEdit / NotebookEdit | Short medium pop |
| `term.wav` | Bash | Low click |
| `web.wav` | WebFetch / WebSearch | Rising swoosh |
| `agent.wav` | Task (subagent) | Two-tone chime |
| `permission.wav` | Notification (permission needed) | Ascending alert |
| `welcome.wav` | SessionStart | Soft three-note chord |
| `done.wav` | Stop (turn end) | Soft confirm |
| `error.wav` | Reserved (tool failure) | Descending low tone |
