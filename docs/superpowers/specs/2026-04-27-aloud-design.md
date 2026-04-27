# Aloud — Design Spec
**Date:** 2026-04-27  
**Status:** Approved  
**Tagline:** Give your AI a voice.

---

## What It Is

Aloud is an ambient voice channel plugin for Claude Code. It listens for a configurable wake word, transcribes speech locally, and pushes the text into your running Claude Code session as a channel event. Claude speaks back through your machine's speaker via local TTS.

No cloud APIs required by default. No always-on transcription. No Telegram. One command starts everything.

---

## User Flow

```
claude --dangerously-load-development-channels server:aloud
```

Everything starts. You work normally. When Claude finishes something worth saying, it speaks. You say your wake word, ask something, it responds. You never touch the keyboard.

---

## Architecture

Four components. All started by one command.

```
claude --channels server:aloud
  └── spawns channel/index.ts (Bun)
        ├── spawns wakeword/listener.py  (child process)
        ├── spawns Kokoro TTS server     (child process, port 8880)
        └── owns full lifecycle of both
```

### Components

| Component | Language | Responsibility |
|---|---|---|
| `channel/index.ts` | Bun/TypeScript | MCP channel server. Owns subprocess lifecycle. Pushes events to Claude. Handles `speak` tool. |
| `wakeword/listener.py` | Python | openWakeWord + VAD + Whisper. Always-on mic loop. Writes transcriptions to stdout. |
| Kokoro TTS server | Python (managed) | Local TTS. Receives text, returns audio. HTTP on port 8880. |

### Communication

- `channel/index.ts` ↔ Claude Code: MCP over stdio (channel protocol)
- `channel/index.ts` ↔ `listener.py`: child process stdout (newline-delimited JSON)
- `channel/index.ts` ↔ Kokoro: HTTP on localhost:8880
- No external ports. No webhooks.

---

## Data Flow

### Input path (you speak → Claude receives)

```
openWakeWord running continuously in listener.py (~0% CPU)
  → wake word detected
  → VAD (webrtcvad) captures mic until silence
  → Whisper transcribes locally
  → writes to stdout: {"text": "...", "confidence": 0.94}
  → channel/index.ts reads line
  → mcp.notification("notifications/claude/channel", { content: text })
  → Claude Code receives:
      <channel source="aloud" source_type="voice">
        [transcribed text]
      </channel>
  → Claude processes and responds
```

### Output path (Claude decides to speak)

```
Claude calls speak({ text: "..." }) MCP tool
  → channel/index.ts receives tool call
  → calls sampling/createMessage:
      system: config.summarizer.system_prompt
      user: "Format for spoken TTS: [text]"
      max_tokens: 80
  → Claude Code returns formatted summary
  → POST to Kokoro: { text: summary, voice: config.tts.voice }
  → audio bytes → play via speaker
  → state: LISTENING (wake word reactivates)
```

### State machine

```
IDLE
  → claude --channels starts → RUNNING

RUNNING
  → Claude calls speak() → SPEAKING
  → SPEAKING finishes → LISTENING
  → Wake word detected → CAPTURING
  → Transcription done → RUNNING (event pushed)

Guards:
  SPEAKING blocks CAPTURING  (won't record itself speaking)
  CAPTURING blocks SPEAKING  (won't TTS mid-capture)
```

---

## MCP Channel Contract

```typescript
// Capabilities declared by Aloud
capabilities: {
  experimental: { 'claude/channel': {} },
  tools: {}
}

// Instructions added to Claude's system prompt
instructions: `
  Voice messages arrive as <channel source="aloud" source_type="voice">.
  Respond naturally. Call the speak tool when:
  - Responding to a voice-initiated message
  - A long task completes and the user should know
  - You need user input or permission
  Do NOT call speak for routine tool use or silent background work.
`

// speak tool schema
{
  name: "speak",
  description: "Speak a response aloud to the user via TTS",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to speak. Will be formatted for TTS." }
    },
    required: ["text"]
  }
}
```

---

## Configuration

Stored at `~/.aloud/config.json`. Set via `aloud init` on first run.

```json
{
  "wakeword": {
    "phrase": "hey jarvis",
    "sensitivity": 0.5,
    "model": "openWakeWord/hey_jarvis.tflite"
  },

  "stt": {
    "provider": "whisper-local",
    "model": "base.en",
    "api_key": null,
    "base_url": null
  },

  "tts": {
    "provider": "kokoro",
    "voice": "af_sky",
    "speed": 1.0,
    "api_key": null,
    "base_url": "http://localhost:8880",
    "voice_id": null
  },

  "summarizer": {
    "system_prompt": "You are an ambient voice assistant. Summarize what was just done in {max_sentences} sentences. Be direct and casual. No markdown, no lists — spoken output only.",
    "max_sentences": 5,
    "max_tokens": 80
  },

  "ports": {
    "kokoro": 8880
  }
}
```

### Provider values (day 1 → future)

| Capability | Providers |
|---|---|
| `stt` | `whisper-local` → `openai`, `openai-compatible` |
| `tts` | `kokoro` → `openai`, `elevenlabs`, `openai-compatible` |
| `summarizer` | MCP sampling only — always uses Claude Code's own model |

Adding ElevenLabs = set `provider: "elevenlabs"`, `api_key`, `voice_id`. Zero structural change.

---

## Project Structure

```
aloud/
├── channel/
│   ├── index.ts          # MCP server entry, subprocess lifecycle, state machine
│   ├── tools.ts          # speak() handler, sampling call, TTS dispatch
│   ├── tts.ts            # Provider abstraction: Kokoro / OpenAI / ElevenLabs
│   └── config.ts         # Load + validate ~/.aloud/config.json
│
├── wakeword/
│   ├── listener.py       # openWakeWord → VAD → Whisper → stdout
│   └── requirements.txt  # openwakeword, webrtcvad-wheels, faster-whisper, sounddevice
│
├── .mcp.json             # { "mcpServers": { "aloud": { "command": "bun", "args": ["channel/index.ts"] } } }
├── package.json          # @modelcontextprotocol/sdk
├── aloud.sh              # claude --dangerously-load-development-channels server:aloud
└── docs/
    └── config.md         # Full config reference
```

---

## Key Design Decisions

1. **Channel not tool-model** — push model (Forge pushes events to Claude) not pull (Claude calls converse). Enables ambient use when you're away from the terminal.

2. **speak tool not Stop hook** — Claude decides when to speak. Avoids narrating every file edit. Matches Telegram's reply tool pattern exactly.

3. **MCP sampling for TTS formatting** — no separate API key. Aloud calls `sampling/createMessage` on Claude Code's own session. System prompt fully user-configurable (tone, language, verbosity).

4. **Child process stdout not HTTP** — wake word listener is a child of the Bun server. Communicates via stdout. No ports, no sockets, no IPC complexity.

5. **Provider abstraction from day 1** — `tts.provider`, `stt.provider` fields. Swap Kokoro → ElevenLabs by changing one config value. No code changes.

6. **Wake word is user config** — "Forge", "hey jarvis", anything. Not hardcoded. Users set it on `aloud init`.

---

## What's Out of Scope (v1)

- Mobile (phone as mic, remote wake word) — different architecture, next version
- Multi-agent awareness (Donna / Token status via Aloud) — add after core is stable
- Permission relay (approve bash commands via voice) — MCP supports it, add in v2
- Windows support — macOS/Linux only for v1

---

## Open Source Story

**Repo name:** `aloud`  
**Tagline:** Give your AI a voice.  
**One-liner:** Ambient voice channel plugin for Claude Code. Wake word → local STT → Claude → local TTS. No cloud required.
