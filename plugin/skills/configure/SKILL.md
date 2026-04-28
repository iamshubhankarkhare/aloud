---
name: configure
description: Set up and control the Aloud voice-output plugin — install Kokoro TTS dependencies, toggle sound effects on/off, toggle TTS on/off, set volume, change voice, audition the sound pack. Use when the user asks to install Aloud, mute/unmute sounds or voice, change Aloud settings, or test the pack.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(uv *)
  - Bash(mkdir *)
  - Bash(ls *)
  - Bash(rm *)
  - Bash(afplay *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/play.sh *)
---

# /aloud:configure — Aloud Setup & Control

One skill, all controls. State lives in `~/.claude/channels/aloud/config.json`. The MCP server re-reads runtime fields on each `speak()` call, and `play.sh` re-reads on every hook fire — toggles take effect immediately, no restart.

Arguments passed: `$ARGUMENTS`

---

## State shape

```json
{
  "tts": { "voice": "af_sky", "speed": 1.0 },
  "summarizer": { "max_sentences": 1 },
  "runtime": {
    "sounds_enabled": true,
    "tts_enabled": false,
    "tts_volume": 0.5,
    "tts_min_chars": 80,
    "theme": "lofi"
  }
}
```

All fields optional — defaults baked into the server. Keep `config.json` minimal: only persist values that differ from default.

Always Read before Write to preserve unknown fields.

---

## Dispatch on arguments

If empty or unrecognized, show status (no-args path).

### No args — status

Read state. Show:
- **Sounds enabled:** yes/no
- **TTS enabled:** yes/no
- **Voice:** `<name>` (e.g. `af_sky`)
- **Volume:** `<value>` (0.0–1.0)
- **Theme:** `<name>` (e.g. `lofi`)
- **Python venv installed:** yes/no (via `ls ~/.claude/channels/aloud/.venv/bin/python3`)

End with a concrete next step:
- venv missing → "Run `/aloud:configure setup` to install Kokoro TTS dependencies."
- TTS off → "Run `/aloud:configure tts on` to start hearing summarized voice output."
- Both on → "All set. Sound effects fire on tool use, voice summaries on substantive responses."

### `setup` — install Python deps

1. **uv check.** Run `uv --version`. If missing: stop, tell the user `curl -LsSf https://astral.sh/uv/install.sh | sh`.
2. **Venv create + Kokoro install.**
   - `mkdir -p ~/.claude/channels/aloud`
   - `uv venv ~/.claude/channels/aloud/.venv --python 3.11` (only if missing)
   - `uv pip install --python ~/.claude/channels/aloud/.venv/bin/python3 -r ${CLAUDE_PLUGIN_ROOT}/tts/requirements.txt`
3. **Write minimal config** at `~/.claude/channels/aloud/config.json`:
   ```json
   {}
   ```
   All defaults are baked in. Empty file is the cleanest minimal config.
4. **Confirm + next step.**
   > "Setup complete. Sound effects fire automatically on tool use. To hear voice summaries of Claude's responses, run `/aloud:configure tts on`. First voice output downloads Kokoro models (~330MB) — one-time."

### `sounds on` / `sounds off`

Read config. Set `runtime.sounds_enabled` to true/false. Write back. Confirm. Note effect is immediate — `play.sh` re-reads on every hook fire.

### `tts on` / `tts off`

Read config. Set `runtime.tts_enabled` to true/false. Write back. Confirm. The `speak()` tool re-reads on each call.

### `volume <0.0–1.0>`

Validate float in `[0.0, 1.0]`. Read config. Set `runtime.tts_volume`. Write. Confirm.

### `min-chars <integer>`

Read config. Set `runtime.tts_min_chars`. Write. Default 80 — replies shorter than this are not spoken.

### `voice <name>`

Set `tts.voice`. Common Kokoro voices: `af_sky`, `af_bella`, `am_adam`, `am_michael`. Read, set, write.

### `test`

Audition the active sound pack. Run for each sound name in order:
- scan, type, term, web, agent, permission, welcome, done, error

```bash
for s in scan type term web agent permission welcome done error; do
  ${CLAUDE_PLUGIN_ROOT}/scripts/play.sh "$s"
  sleep 0.4
done
```

### `reinstall`

Destructive. Confirm with user before proceeding ("This deletes `~/.claude/channels/aloud/.venv/` and rebuilds it. Existing config.json is preserved. Continue?"). Then:
1. `rm -rf ~/.claude/channels/aloud/.venv`
2. Re-run venv create + deps install from `setup`.

---

## Implementation notes

- Always Read before Write — preserve unknown fields.
- The state dir might not exist on first run; `mkdir -p ~/.claude/channels/aloud` before any write.
- Pretty-print JSON (2-space indent).
- The plugin root is `${CLAUDE_PLUGIN_ROOT}` — use it to reference `tts/requirements.txt` and `scripts/play.sh`.
- Never set fields to literal defaults; keep `config.json` minimal so future default changes propagate.
- This is the only skill for Aloud. Mute/unmute and volume controls live here as subcommands.
