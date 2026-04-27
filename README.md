# Aloud

Ambient voice channel for Claude Code — local wake word, local STT, local TTS. No cloud required.

The MCP server listens for a wake word, transcribes via Whisper locally, and forwards what you said to your Claude Code session as a channel event. Claude responds through your speaker via Kokoro TTS.

## Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- macOS or Linux (sound device required)

## Quick Setup

**1. Install the plugin.**

In a Claude Code session:

```
/plugin install <git-url>
/reload-plugins
```

**2. Configure.**

```
/aloud:configure setup
```

Creates a Python venv at `~/.claude/channels/aloud/.venv`, installs deps, prompts for wake word/voice/STT model, writes `~/.claude/channels/aloud/config.json`.

**3. Relaunch with the channel flag.**

Exit your session and start a new one:

```sh
claude --channels plugin:aloud@<source>
```

The first TTS request downloads Kokoro models (~330MB) to `~/.claude/channels/aloud/models/` — one-time.

**4. Talk.**

Say your wake word. Ask anything. Claude responds through your speaker.

## Runtime control

`/aloud:configure` is the single skill — same one for setup, mute, sensitivity, status, reinstall.

```
/aloud:configure                          # status
/aloud:configure setup                    # interactive setup or update
/aloud:configure mute                     # ignore wake word
/aloud:configure unmute                   # resume listening
/aloud:configure sensitivity 0.6          # adjust wake word strictness
/aloud:configure reinstall                # rebuild the Python venv
```

Mute/sensitivity changes take effect immediately — the server re-reads `config.json` on every voice event.

## Configuration

See [ACCESS.md](./ACCESS.md) for the full config schema, state-dir layout, and TTS/STT provider options.

## Tools exposed to the assistant

| Tool | Purpose |
| --- | --- |
| `speak` | Speak a response aloud. The text is summarized for spoken output via MCP sampling, then synthesized by Kokoro and played through the speaker. Call when responding to a voice-initiated message, when a long task completes, or when you need user input. Do NOT call for routine silent tool use. |

## License

MIT
