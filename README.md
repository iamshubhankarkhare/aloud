# Aloud

Give your AI a voice.

Ambient voice channel plugin for Claude Code. Say your wake word, ask something, Claude responds through your speaker. No cloud APIs required.

## How it works

- **Wake word** → local STT (Whisper) → pushed into Claude Code session via MCP channel
- Claude responds → calls `speak()` tool → MCP sampling formats it → local TTS (Kokoro) → speaker
- One command starts everything

## Prerequisites

- [Bun](https://bun.sh) installed
- Python 3.11+
- macOS or Linux

```bash
# Python deps
pip install -r wakeword/requirements.txt

# Kokoro TTS (local)
pip install kokoro-onnx
```

## Setup

```bash
bun run init
```

Follow the prompts to set your wake word, voice, and Whisper model.

## Start

```bash
./aloud.sh
```

Kokoro TTS starts automatically. On first run, models (~330MB) download to `~/.aloud/models/`.

Or manually:
```bash
claude --dangerously-load-development-channels server:aloud
```

## Configuration

Config lives at `~/.aloud/config.json`. All fields are optional — unset fields use defaults.

### TTS Providers

| Provider | Config |
|---|---|
| Kokoro (local, default) | `tts.provider: "kokoro"` |
| OpenAI | `tts.provider: "openai"`, `tts.api_key`, `tts.voice_id` |
| OpenAI-compatible | `tts.provider: "openai-compatible"`, `tts.base_url`, `tts.api_key` |
| ElevenLabs | `tts.provider: "elevenlabs"`, `tts.api_key`, `tts.voice_id` |

### STT Providers

| Provider | Config |
|---|---|
| Whisper local (default) | `stt.provider: "whisper-local"`, `stt.model: "base.en"` |
| OpenAI | `stt.provider: "openai"`, `stt.api_key` |

## License

MIT
