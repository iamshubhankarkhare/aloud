# Aloud — Configuration Reference

State lives in `~/.claude/channels/aloud/`:

```
~/.claude/channels/aloud/
├── config.json     # all config — managed by /aloud:configure
├── .venv/          # uv-managed Python venv with openwakeword, faster-whisper, kokoro-onnx
├── models/         # Kokoro ONNX + voices (auto-downloaded on first TTS request)
└── aloud.pid       # single-instance lock (managed by server)
```

## config.json

All fields optional — unset fields use defaults. The server re-reads on every voice event for runtime fields (mute, sensitivity).

```json
{
  "wakeword": {
    "phrase": "hey jarvis",
    "model": "hey_jarvis",
    "sensitivity": 0.5
  },
  "stt": {
    "provider": "whisper-local",
    "model": "base.en"
  },
  "tts": {
    "provider": "kokoro",
    "voice": "af_sky",
    "speed": 1.0,
    "base_url": "http://localhost:8880"
  },
  "summarizer": {
    "max_sentences": 5,
    "max_tokens": 80
  },
  "ports": {
    "kokoro": 8880
  },
  "runtime": {
    "muted": false,
    "sensitivity": 0.5
  }
}
```

### Wake word models

openwakeword bundled: `hey_jarvis`, `alexa`, `hey_mycroft`, `hey_rhasspy`, `timer`, `weather`. Custom `.tflite` paths also accepted.

### TTS providers

| Provider | Required fields |
|---|---|
| `kokoro` (local, default) | none |
| `openai` | `tts.api_key`, `tts.voice_id` |
| `openai-compatible` | `tts.base_url`, `tts.api_key` |
| `elevenlabs` | `tts.api_key`, `tts.voice_id` |

### STT providers

| Provider | Required fields |
|---|---|
| `whisper-local` (default) | `stt.model` (`tiny.en` / `base.en` / `small.en`) |
| `openai` | `stt.api_key` |

### runtime section

| Field | Type | Effect |
|---|---|---|
| `runtime.muted` | bool | When true, the server drops every voice input event. Wake word listener still runs. |
| `runtime.sensitivity` | float (0.0–1.0) | Reserved for runtime sensitivity adjustment. Currently logged but the wake word listener requires restart to pick up. Persists across sessions. |

## Skills

Aloud exposes a single user-invocable skill: `/aloud:configure`.

| Command | Effect |
|---|---|
| `/aloud:configure` | Show install + config status |
| `/aloud:configure setup` | Install Python deps + interactive config (or update) |
| `/aloud:configure mute` / `unmute` | Toggle listening (effective immediately) |
| `/aloud:configure sensitivity <0.0–1.0>` | Set runtime sensitivity (persisted) |
| `/aloud:configure reinstall` | Delete and rebuild the Python venv |

## Multiple instances

Set `ALOUD_CONFIG_PATH` and `ALOUD_VENV_DIR` to point at different paths per session.

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `ALOUD_CONFIG_PATH` | Override config file path | `~/.claude/channels/aloud/config.json` |
| `ALOUD_VENV_DIR` | Override venv location | `~/.claude/channels/aloud/.venv` |
| `ALOUD_MODELS_DIR` | Override Kokoro models dir | `~/.claude/channels/aloud/models` |
