---
name: configure
description: Set up and control the Aloud voice channel — install Python dependencies, configure wake word/voice/STT model, mute or unmute at runtime, adjust sensitivity, check status. Use when the user wants to install or reconfigure Aloud, mute/unmute the voice channel, change sensitivity, or asks "how do I set up voice".
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(uv *)
  - Bash(mkdir *)
  - Bash(ls *)
  - Bash(rm *)
---

# /aloud:configure — Aloud Channel Setup & Control

One skill for the whole channel: setup, runtime control, status. Everything is stored at `~/.claude/channels/aloud/config.json`. The MCP server re-reads runtime fields on each voice event — `mute`/`sensitivity` changes take effect immediately, no restart.

Arguments passed: `$ARGUMENTS`

---

## State shape

`~/.claude/channels/aloud/config.json` — all fields optional, missing fields fall back to defaults:

```json
{
  "wakeword": { "phrase": "hey jarvis", "model": "hey_jarvis" },
  "stt": { "model": "base.en" },
  "tts": { "voice": "af_sky" },
  "summarizer": { "max_sentences": 5 },
  "runtime": { "muted": false, "sensitivity": 0.5 }
}
```

The skill always Reads first and Writes back the merged result so unknown fields are preserved.

---

## Dispatch on arguments

Parse `$ARGUMENTS` (space-separated). If empty or unrecognized, show status (no-args path).

### No args — status

Show the user where Aloud stands. Read three things:

1. **uv installed?** `uv --version`. If missing: stop and tell user `curl -LsSf https://astral.sh/uv/install.sh | sh`.
2. **Python venv?** `ls ~/.claude/channels/aloud/.venv/bin/python3` — present or missing.
3. **Config?** Read `~/.claude/channels/aloud/config.json` — show current values (wake word phrase, voice, STT model, max sentences, runtime.muted, runtime.sensitivity), or "not configured" if missing.

End with a concrete next step:
- uv missing → "Install uv first: `curl -LsSf https://astral.sh/uv/install.sh | sh`"
- venv missing → "Run `/aloud:configure setup` to install Python deps and write your config."
- config missing but venv present → "Run `/aloud:configure setup` to write your config."
- everything set → "Ready. Restart Claude Code with `claude --channels plugin:aloud@<source>` to start the voice channel. Currently muted: yes/no. Wake word sensitivity: <value>."

### `setup` — interactive setup (default for first-time users)

Drive a short conversation. Ask one question at a time. Defaults in brackets are accepted on empty input.

1. **uv check.** Run `uv --version`. If missing: stop, tell the user to install uv (link above).

2. **Venv create + deps install.** If `~/.claude/channels/aloud/.venv/bin/python3` is missing:
   - `mkdir -p ~/.claude/channels/aloud`
   - `uv venv ~/.claude/channels/aloud/.venv --python 3.11`
   - `uv pip install --python ~/.claude/channels/aloud/.venv/bin/python3 -r ${CLAUDE_PLUGIN_ROOT}/wakeword/requirements.txt`
   Report success or failure.

   If venv is already present: report "Python deps already installed — reuse existing venv."

3. **Read existing config** at `~/.claude/channels/aloud/config.json`. If present, surface current values and ask if user wants to change anything. If not present, prompt for each field below.

4. **Prompt for fields** (one at a time). Defaults are baked into the server, so only persist fields that differ from default — keeps `config.json` minimal.

   - **Wake word phrase** [`hey jarvis`] — must map to one of the openwakeword bundled models. Mapping: `hey jarvis` → `hey_jarvis`, `alexa` → `alexa`, `hey mycroft` → `hey_mycroft`, `hey rhasspy` → `hey_rhasspy`, `timer` → `timer`, `weather` → `weather`. Persist BOTH the phrase (display) and the model (the openwakeword identifier).
   - **TTS voice** [`af_sky`] — Kokoro voice ID. Common: `af_sky`, `af_bella`, `am_adam`, `am_michael`. Anything else passes through.
   - **Whisper model** [`base.en`] — one of `tiny.en`, `base.en`, `small.en` (size/quality tradeoff).
   - **Max sentences in spoken summary** [`5`] — integer; how aggressively the LLM compresses spoken responses.

5. **Write config.** Read existing config first; merge new values into it; write back pretty-printed (2-space indent). Never include fields the user accepted at default — keep the file minimal so future default changes propagate.

6. **Confirm + next step.** Tell the user:
   > "Config saved to `~/.claude/channels/aloud/config.json`. Restart Claude Code with `claude --channels plugin:aloud@<source>` to start the voice channel. First TTS request downloads Kokoro models (~330MB) to `~/.claude/channels/aloud/models/` — one-time."

### `mute`

1. Read `~/.claude/channels/aloud/config.json` (or empty `{}` if missing — but this case is unusual after setup).
2. Set `runtime.muted = true`. Pretty-print, write back.
3. Confirm: "Muted. Wake word ignored until you run `/aloud:configure unmute`. Effective immediately — no restart needed."

### `unmute`

1. Read config; set `runtime.muted = false`; write.
2. Confirm: "Unmuted. Wake word listening again."

### `sensitivity <value>`

1. Validate `<value>` is a float between 0.0 and 1.0 inclusive. Reject otherwise.
2. Read config; set `runtime.sensitivity = <value>`; write.
3. Confirm: "Sensitivity set to <value>. Higher = stricter wake word match. Effective immediately."

### `reinstall`

Destructive. Ask user to confirm before running.

1. Confirm: "This deletes `~/.claude/channels/aloud/.venv/` and rebuilds it. Existing config.json is preserved. Continue?" — wait for "yes".
2. `rm -rf ~/.claude/channels/aloud/.venv`
3. Repeat the venv create + deps install from `setup`.
4. Confirm completion.

---

## Implementation notes

- **Always Read before Write** — preserve fields not managed by this skill.
- The state dir might not exist on first run; `mkdir -p ~/.claude/channels/aloud` before any write.
- Pretty-print JSON (2-space indent).
- The plugin root is `${CLAUDE_PLUGIN_ROOT}` — use it to reference `wakeword/requirements.txt`.
- Never set fields to literal defaults; keep `config.json` minimal.
- This skill is the only skill for Aloud. There is no `/aloud:control` — `mute`/`unmute`/`sensitivity` live here.
