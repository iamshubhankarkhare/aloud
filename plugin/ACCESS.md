# Aloud — Configuration Reference

State lives in `~/.claude/channels/aloud/`:

```
~/.claude/channels/aloud/
├── config.json     # all config — managed by /aloud:configure
├── .venv/          # uv-managed Python venv with kokoro-onnx, soundfile, numpy
├── models/         # Kokoro ONNX + voices (auto-downloaded on first TTS request)
└── aloud.pid       # single-instance lock (managed by server)
```

## config.json

All fields optional — unset fields use defaults. The MCP server re-reads on every `speak()` call. The `play.sh` wrapper re-reads on every hook fire.

```json
{
  "tts": {
    "provider": "kokoro",
    "voice": "af_sky",
    "speed": 1.0,
    "base_url": "http://localhost:8880"
  },
  "summarizer": {
    "max_sentences": 1,
    "max_tokens": 80
  },
  "ports": {
    "kokoro": 8880
  },
  "runtime": {
    "sounds_enabled": true,
    "tts_enabled": false,
    "tts_volume": 0.5,
    "tts_min_chars": 80,
    "theme": "lofi"
  }
}
```

### TTS providers

| Provider | Required fields |
|---|---|
| `kokoro` (local, default) | none |
| `openai` | `tts.api_key`, `tts.voice_id` |
| `openai-compatible` | `tts.base_url`, `tts.api_key` |
| `elevenlabs` | `tts.api_key`, `tts.voice_id` |

Only `kokoro` is wired in v1. Other providers are reserved for future implementation.

### runtime section

| Field | Type | Effect |
|---|---|---|
| `runtime.sounds_enabled` | bool | When false, `play.sh` exits silent and no hook sounds fire. |
| `runtime.tts_enabled` | bool | When false, `speak()` returns early before sampling and synthesis. |
| `runtime.tts_volume` | float (0.0–1.0) | Passed to `afplay -v` for both sound effects and TTS. |
| `runtime.tts_min_chars` | int | `speak()` no-ops when text length < this. Avoids voicing tiny replies. |
| `runtime.theme` | string | Sound pack directory under `plugin/sounds/<theme>/`. v1 ships `lofi`. |

## Sound pack

`plugin/sounds/lofi/*.wav` — 9 procedurally-generated CC0 sounds. Generator:
`plugin/scripts/gen-sounds.py`. To regenerate:

```bash
~/.claude/channels/aloud/.venv/bin/python3 plugin/scripts/gen-sounds.py
```

| Sound | Trigger |
|---|---|
| `scan.wav` | Read / Grep / Glob / LS / NotebookRead |
| `type.wav` | Edit / Write / MultiEdit / NotebookEdit |
| `term.wav` | Bash |
| `web.wav` | WebFetch / WebSearch |
| `agent.wav` | Task (subagent) |
| `permission.wav` | Notification hook |
| `welcome.wav` | SessionStart |
| `done.wav` | Stop (turn end) |
| `error.wav` | Reserved (tool failure) |

To use your own sounds: drop replacement WAVs at the same paths. They're loaded by name on each hook fire.

## Hooks

Plugin ships `plugin/.claude-plugin/hooks/hooks.json`. Hooks install automatically with the plugin and fire even when you're not running with `--channels`.

User-level `~/.claude/settings.json` hooks aren't affected.

## Skill

Aloud exposes a single user-invocable skill: `/aloud:configure`.

| Command | Effect |
|---|---|
| `/aloud:configure` | Show install + config status |
| `/aloud:configure setup` | Install Python deps + write defaults |
| `/aloud:configure sounds on` / `off` | Toggle sound effects |
| `/aloud:configure tts on` / `off` | Toggle voice summaries |
| `/aloud:configure volume <0.0–1.0>` | Set audio volume |
| `/aloud:configure min-chars <int>` | Skip TTS for replies shorter than this |
| `/aloud:configure voice <name>` | Change Kokoro voice (af_sky, af_bella, am_adam, am_michael, etc) |
| `/aloud:configure test` | Audition all 9 sounds |
| `/aloud:configure reinstall` | Delete + rebuild Python venv |

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `ALOUD_CONFIG_PATH` | Override config file path | `~/.claude/channels/aloud/config.json` |
| `ALOUD_VENV_DIR` | Override venv location | `~/.claude/channels/aloud/.venv` |
| `ALOUD_MODELS_DIR` | Override Kokoro models dir | `~/.claude/channels/aloud/models` |

## Multiple instances

Set `ALOUD_CONFIG_PATH` and `ALOUD_VENV_DIR` to point at different paths per session for isolated configs.
