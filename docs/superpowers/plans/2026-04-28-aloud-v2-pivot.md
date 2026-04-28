# Aloud v2 — Pivot to Voice Output Only (MVP Plan)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot Aloud from a full voice loop (wake word → STT → channel → speak) to a focused voice-output plugin: hook-driven sound effects on tool events, plus opt-in sampling-summarized TTS via Kokoro. Personal use first, open source.

**Architecture:** Two independent paths. (1) **Sound effects:** Claude Code hooks (PreToolUse, PostToolUse, Notification, SessionStart) → `play.sh` wrapper → `afplay` on a bundled WAV pack. No MCP roundtrip — hooks fire instantly. (2) **TTS:** Claude calls `speak()` MCP tool when system prompt nudges → existing MCP sampling generates a one-sentence spoken summary → Kokoro synthesizes → speaker. Both paths gated by runtime flags in `config.json`, toggled via `/aloud:configure` subcommands.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, Python 3.11+ (Kokoro only — no Whisper/openwakeword/sounddevice anymore), `afplay` (macOS), `aplay` (Linux fallback), uv.

**Sound theme:** Lo-fi — short soft chimes, vinyl-crackle blips, synth pops. Source mix of CC0 packs + macOS built-ins. ≤ 200ms each so it doesn't drag.

**Reference plugin:** `~/.claude/plugins/cache/claude-plugins-official/telegram/0.0.6/` (still our pattern reference for plugin structure).

---

## File Map

### Delete

| Path | Reason |
|---|---|
| `plugin/wakeword/listener.py` | Voice input gone |
| `plugin/wakeword/` (whole dir) | Renamed to `plugin/tts/` |
| `plugin/scripts/dev-listener.sh` | Voice input gone |
| `plugin/scripts/dev-server.sh` | Replaced by `dev-tts.sh` |
| `plugin/lib/state.ts` | No more CAPTURING/LISTENING state machine |
| `plugin/tests/lib/state.test.ts` | Obsolete |
| `plugin/tests/wakeword/` | Obsolete |
| Fields removed from `requirements.txt`: `openwakeword`, `faster-whisper`, `webrtcvad-wheels`, `sounddevice` |

### Move/rename

| Old | New |
|---|---|
| `plugin/wakeword/kokoro_server.py` | `plugin/tts/kokoro_server.py` |
| `plugin/wakeword/requirements.txt` | `plugin/tts/requirements.txt` (keeps only `kokoro-onnx`, `soundfile`, `numpy`) |

### Create

| Path | Responsibility |
|---|---|
| `plugin/.claude-plugin/hooks/hooks.json` | Plugin-installed hook manifest (PreToolUse, PostToolUse, Notification, SessionStart) |
| `plugin/scripts/play.sh` | Sound-playback wrapper. Reads `config.json`, exits silent if `sounds_enabled === false`, else `afplay -v <volume> <path>` with macOS/Linux fallback |
| `plugin/scripts/speak.sh` | Optional CLI helper for testing — pipes text to MCP `speak` tool via direct Kokoro call |
| `plugin/scripts/dev-tts.sh` | Dev harness — `bun server.ts` standalone with stdin held open, for iterating on TTS without plugin reinstall |
| `plugin/sounds/lofi/scan.wav` | Soft chime — for Read/Grep/Glob |
| `plugin/sounds/lofi/type.wav` | Typewriter blip — for Edit/Write/MultiEdit |
| `plugin/sounds/lofi/term.wav` | Terminal click — for Bash |
| `plugin/sounds/lofi/web.wav` | Soft swoosh — for WebFetch/WebSearch |
| `plugin/sounds/lofi/agent.wav` | Distinct chime — for Task (subagent) |
| `plugin/sounds/lofi/permission.wav` | Ascending alert — for Notification (permission needed) |
| `plugin/sounds/lofi/welcome.wav` | Soft chord — for SessionStart |
| `plugin/sounds/lofi/done.wav` | Soft confirm — for Stop (turn end) |
| `plugin/sounds/lofi/error.wav` | Low tone — for tool failure |
| `plugin/sounds/lofi/LICENSE.md` | CC0 attribution + sources |

### Modify

| File | Change |
|---|---|
| `plugin/server.ts` | Drop wake-word listener subprocess + `onVoiceInput` + state machine. Keep MCP server, Kokoro subprocess, `speak()` tool, PID lock, signal handlers. Strengthen `instructions` field nudging Claude to call `speak()` on substantive responses when TTS enabled. |
| `plugin/lib/tools.ts` | `speak` handler reads live config; if `runtime.tts_enabled === false`, return silently. Sampling stays. |
| `plugin/lib/config.ts` | Replace `runtime: { muted, sensitivity }` with `runtime: { sounds_enabled, tts_enabled, tts_volume, tts_min_chars }`. Remove wake-word/STT defaults. |
| `plugin/skills/configure/SKILL.md` | Drop wake-word/STT prompts. Add subcommands: `sounds on/off`, `tts on/off`, `volume <0–1>`, `theme <lofi|system>` (lofi-only for v1, theme is forward-compat). Update `setup` flow: install Python deps for Kokoro only. |
| `plugin/.mcp.json` | No change needed (still spawns `bun server.ts` from plugin root). |
| `plugin/package.json` | No change needed. |
| `plugin/lib/tts.ts` | No change. |
| `plugin/tests/lib/tools.test.ts` | Add test: speak no-ops when `tts_enabled` is false. |
| `plugin/tests/lib/config.test.ts` | Update: assertions on new runtime shape. |
| `README.md` | Rewrite — voice OUTPUT positioning. Drop wake word language. Add hook-based sound effects + TTS-on-Stop language. |
| `plugin/ACCESS.md` | Update config schema, drop wake-word section, add hooks section, document subcommands. |

---

## Prerequisites (do once before any task)

- Working directory: `/Users/shubhankar/Desktop/myplayground/aloud`
- Tests pass on current main: `cd plugin && bun test && pytest tests/wakeword/`
- Git tree clean except for plan file in `docs/superpowers/plans/`

---

## Task 1: Strip voice input plumbing

**Files:**
- Delete: `plugin/wakeword/listener.py`, `plugin/scripts/dev-listener.sh`, `plugin/scripts/dev-server.sh`, `plugin/lib/state.ts`, `plugin/tests/lib/state.test.ts`, `plugin/tests/wakeword/`
- Modify: `plugin/wakeword/requirements.txt` (drop openwakeword, faster-whisper, webrtcvad-wheels, sounddevice; keep kokoro-onnx, soundfile, numpy)

- [ ] **Step 1: Delete obsolete files**

```bash
cd /Users/shubhankar/Desktop/myplayground/aloud
git rm plugin/wakeword/listener.py
git rm plugin/scripts/dev-listener.sh
git rm plugin/scripts/dev-server.sh
git rm plugin/lib/state.ts
git rm plugin/tests/lib/state.test.ts
git rm -r plugin/tests/wakeword/
```

- [ ] **Step 2: Trim Python requirements**

Replace contents of `plugin/wakeword/requirements.txt` with:

```
kokoro-onnx>=0.4.0
soundfile>=0.12.0
numpy>=1.24.0
```

- [ ] **Step 3: Verify TS still compiles after `state.ts` removal**

`server.ts` and possibly `tools.ts` import from `./lib/state` — those imports must be removed. Search:

```bash
grep -rn "from.*state" plugin/ --include="*.ts"
```

For every match, remove the `state` import + any code using `StateMachine`/`State`. The state machine was only relevant to voice input — it's dead code now.

- [ ] **Step 4: Run TS tests**

```bash
cd plugin && bun test
```
Expected: existing config/tts/tools/bootstrap tests still PASS (anything referencing state was deleted in step 1). 14–16 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: strip voice input — drop listener, state machine, STT deps"
```

---

## Task 2: Move kokoro_server.py to plugin/tts/

**Files:**
- Move: `plugin/wakeword/kokoro_server.py` → `plugin/tts/kokoro_server.py`
- Move: `plugin/wakeword/requirements.txt` → `plugin/tts/requirements.txt`
- Modify: `plugin/server.ts` (update path to `tts/kokoro_server.py`)
- Modify: `plugin/skills/configure/SKILL.md` (update path reference)

- [ ] **Step 1: Move files**

```bash
cd /Users/shubhankar/Desktop/myplayground/aloud
mkdir -p plugin/tts
git mv plugin/wakeword/kokoro_server.py plugin/tts/kokoro_server.py
git mv plugin/wakeword/requirements.txt plugin/tts/requirements.txt
rmdir plugin/wakeword
```

- [ ] **Step 2: Update path in `server.ts`**

Find and change:
```typescript
const serverPath = join(scriptDir, "wakeword/kokoro_server.py");
```
To:
```typescript
const serverPath = join(scriptDir, "tts/kokoro_server.py");
```

- [ ] **Step 3: Update path in SKILL.md**

In `plugin/skills/configure/SKILL.md`, change `${CLAUDE_PLUGIN_ROOT}/wakeword/requirements.txt` to `${CLAUDE_PLUGIN_ROOT}/tts/requirements.txt`. Update any other `wakeword/` references.

- [ ] **Step 4: Sanity check**

```bash
cd plugin && bun test
```
Expected: PASS (no logic changed, just path).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move kokoro_server.py from wakeword/ to tts/"
```

---

## Task 3: Update config schema (drop wake-word, add runtime audio flags)

**Files:**
- Modify: `plugin/lib/config.ts`
- Modify: `plugin/tests/lib/config.test.ts`

- [ ] **Step 1: Write failing test for new runtime shape**

Replace existing runtime tests in `plugin/tests/lib/config.test.ts` with:

```typescript
it("uses default runtime when missing", async () => {
  const tmp = `/tmp/aloud-config-runtime-${Date.now()}.json`;
  await Bun.write(tmp, JSON.stringify({}));
  const config = loadConfig(tmp);
  expect(config.runtime.sounds_enabled).toBe(true);
  expect(config.runtime.tts_enabled).toBe(false);
  expect(config.runtime.tts_volume).toBe(0.5);
  expect(config.runtime.tts_min_chars).toBe(80);
});

it("merges runtime overrides", async () => {
  const tmp = `/tmp/aloud-config-runtime-${Date.now()}.json`;
  await Bun.write(tmp, JSON.stringify({ runtime: { tts_enabled: true } }));
  const config = loadConfig(tmp);
  expect(config.runtime.tts_enabled).toBe(true);
  expect(config.runtime.sounds_enabled).toBe(true); // default preserved
});
```

Run: `cd plugin && bun test tests/lib/config.test.ts`
Expected: FAIL.

- [ ] **Step 2: Update `AloudConfig` interface in `plugin/lib/config.ts`**

Replace existing `runtime` shape:
```typescript
runtime: {
  muted: boolean;
  sensitivity: number;
};
```
With:
```typescript
runtime: {
  sounds_enabled: boolean;
  tts_enabled: boolean;
  tts_volume: number;       // 0.0–1.0, passed to afplay -v
  tts_min_chars: number;    // skip TTS for replies shorter than this
};
```

- [ ] **Step 3: Update `DEFAULTS` in `plugin/lib/config.ts`**

Replace existing runtime defaults:
```typescript
runtime: {
  muted: false,
  sensitivity: 0.5,
},
```
With:
```typescript
runtime: {
  sounds_enabled: true,
  tts_enabled: false,
  tts_volume: 0.5,
  tts_min_chars: 80,
},
```

Also: drop the entire `wakeword`, `stt` sections from AloudConfig + DEFAULTS (no longer needed). Keep `tts`, `summarizer`, `ports`.

- [ ] **Step 4: Run tests**

```bash
cd plugin && bun test tests/lib/config.test.ts
```
Expected: PASS.

- [ ] **Step 5: Update `server.ts` to remove wake-word config usage**

Remove any `config.wakeword` and `config.stt` references in `server.ts`. The "ready — wake word: ..." log should be replaced with `[aloud] ready — TTS ${config.runtime.tts_enabled ? "ON" : "OFF"}, sounds ${config.runtime.sounds_enabled ? "ON" : "OFF"}`.

- [ ] **Step 6: Run full test suite**

```bash
cd plugin && bun test
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add plugin/lib/config.ts plugin/tests/lib/config.test.ts plugin/server.ts
git commit -m "feat: replace wake-word config with runtime audio flags (sounds/tts/volume)"
```

---

## Task 4: TTS gate in `speak` handler

**Files:**
- Modify: `plugin/lib/tools.ts`
- Modify: `plugin/tests/lib/tools.test.ts`

- [ ] **Step 1: Write failing test**

Add to `plugin/tests/lib/tools.test.ts`:

```typescript
it("speak no-ops when tts_enabled is false", async () => {
  const samplingMock = mock(async () => ({
    content: { type: "text", text: "summary" },
  }));
  const speakMock = mock(async () => {});
  const tts = { speak: speakMock };

  const config: AloudConfig = {
    // ... use defaults via loadConfig with a tmp file that sets runtime.tts_enabled=false
  };

  const handler = createSpeakHandler(config, samplingMock as any, tts as any);
  await handler({ text: "hello world this is a sentence" });

  expect(samplingMock).not.toHaveBeenCalled();
  expect(speakMock).not.toHaveBeenCalled();
});

it("speak no-ops when text shorter than tts_min_chars", async () => {
  const samplingMock = mock(async () => ({
    content: { type: "text", text: "summary" },
  }));
  const speakMock = mock(async () => {});
  const tts = { speak: speakMock };

  const config: AloudConfig = {
    // ... runtime.tts_enabled=true, tts_min_chars=80
  };

  const handler = createSpeakHandler(config, samplingMock as any, tts as any);
  await handler({ text: "OK" });

  expect(samplingMock).not.toHaveBeenCalled();
  expect(speakMock).not.toHaveBeenCalled();
});
```

Run: expect FAIL.

- [ ] **Step 2: Add gate in `createSpeakHandler` in `plugin/lib/tools.ts`**

At the top of the returned async function:

```typescript
if (!config.runtime.tts_enabled) return;
if (text.length < config.runtime.tts_min_chars) return;
```

- [ ] **Step 3: Run tests**

```bash
cd plugin && bun test tests/lib/tools.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugin/lib/tools.ts plugin/tests/lib/tools.test.ts
git commit -m "feat: speak handler gates on tts_enabled + tts_min_chars"
```

---

## Task 5: `play.sh` sound wrapper

**Files:**
- Create: `plugin/scripts/play.sh`

- [ ] **Step 1: Write `plugin/scripts/play.sh`**

```bash
#!/bin/bash
# Aloud sound effect player. Invoked by Claude Code hooks.
# Reads ~/.claude/channels/aloud/config.json. Exits 0 silently if sounds disabled.
# Usage: play.sh <sound-name>  (e.g. play.sh scan)
set -euo pipefail

CONFIG="${ALOUD_CONFIG_PATH:-$HOME/.claude/channels/aloud/config.json}"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOUND_NAME="${1:-}"

if [ -z "$SOUND_NAME" ]; then
  echo "play.sh: missing sound name" >&2
  exit 0
fi

# Read sounds_enabled + tts_volume from config (silent if missing).
# Default: sounds_enabled=true, volume=0.5.
SOUNDS_ENABLED="true"
VOLUME="0.5"
THEME="lofi"
if [ -f "$CONFIG" ]; then
  SOUNDS_ENABLED=$(grep -o '"sounds_enabled"[^,}]*' "$CONFIG" | grep -o 'true\|false' || echo "true")
  THEME=$(grep -o '"theme"[^,}]*' "$CONFIG" | grep -o '"[a-z]*"' | tr -d '"' | head -1 || echo "lofi")
  V=$(grep -o '"tts_volume"[^,}]*' "$CONFIG" | grep -oE '[0-9]*\.?[0-9]+' || echo "0.5")
  [ -n "$V" ] && VOLUME="$V"
fi

[ "$SOUNDS_ENABLED" != "true" ] && exit 0

SOUND_FILE="$PLUGIN_DIR/sounds/$THEME/$SOUND_NAME.wav"
[ -f "$SOUND_FILE" ] || { echo "play.sh: missing $SOUND_FILE" >&2; exit 0; }

if command -v afplay >/dev/null 2>&1; then
  afplay -v "$VOLUME" "$SOUND_FILE" 2>/dev/null &
elif command -v aplay >/dev/null 2>&1; then
  aplay -q "$SOUND_FILE" 2>/dev/null &
else
  exit 0
fi

# Don't block hook — release immediately. Background process plays the sound.
exit 0
```

```bash
chmod +x plugin/scripts/play.sh
```

- [ ] **Step 2: Manual test (after sounds exist — see Task 7)**

```bash
ALOUD_CONFIG_PATH=/tmp/dummy.json plugin/scripts/play.sh scan
```
With `/tmp/dummy.json` containing `{"runtime":{"sounds_enabled":true,"tts_volume":0.6}}` and a `sounds/lofi/scan.wav` placeholder. Expected: sound plays, no error.

- [ ] **Step 3: Commit**

```bash
git add plugin/scripts/play.sh
git commit -m "feat: scripts/play.sh — sound wrapper, gated by config.runtime.sounds_enabled"
```

---

## Task 6: Hook manifest

**Files:**
- Create: `plugin/.claude-plugin/hooks/hooks.json`

The plugin-installed hooks fire in any session that has the plugin enabled. They run `play.sh <name>` for the relevant tool/event.

- [ ] **Step 1: Write `plugin/.claude-plugin/hooks/hooks.json`**

```json
{
  "PreToolUse": [
    {
      "matcher": "Read|Grep|Glob|LS|NotebookRead",
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh scan" }
      ]
    },
    {
      "matcher": "Edit|Write|MultiEdit|NotebookEdit",
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh type" }
      ]
    },
    {
      "matcher": "Bash",
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh term" }
      ]
    },
    {
      "matcher": "WebFetch|WebSearch",
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh web" }
      ]
    },
    {
      "matcher": "Task",
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh agent" }
      ]
    }
  ],
  "Notification": [
    {
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh permission" }
      ]
    }
  ],
  "SessionStart": [
    {
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh welcome" }
      ]
    }
  ],
  "Stop": [
    {
      "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/play.sh done" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify JSON validity**

```bash
node -e "JSON.parse(require('fs').readFileSync('plugin/.claude-plugin/hooks/hooks.json'))"
```

- [ ] **Step 3: Commit**

```bash
git add plugin/.claude-plugin/hooks/hooks.json
git commit -m "feat: plugin hook manifest — sounds on PreToolUse/Notification/SessionStart/Stop"
```

---

## Task 7: Lo-fi sound pack

**Files:**
- Create: `plugin/sounds/lofi/{scan,type,term,web,agent,permission,welcome,done,error}.wav`
- Create: `plugin/sounds/lofi/LICENSE.md`

For v1 we generate a baseline lo-fi pack procedurally with Python (sine + envelope + light noise). Procedural generation gives us 9 distinguishable, brand-controlled, CC0 sounds with zero licensing risk. Replaceable later with curated packs.

- [ ] **Step 1: Write generator script**

Create `plugin/scripts/gen-sounds.py`:

```python
#!/usr/bin/env python3
"""Generate baseline lo-fi sound effects for Aloud v1.
Each sound is short (~120-200ms), soft, distinguishable.
Output: plugin/sounds/lofi/*.wav at 22050 Hz mono.
"""
import numpy as np
import soundfile as sf
from pathlib import Path

SR = 22050
OUT_DIR = Path(__file__).parent.parent / "sounds" / "lofi"
OUT_DIR.mkdir(parents=True, exist_ok=True)

def envelope(n, attack=0.02, release=0.5):
    a = int(SR * attack)
    r = int(SR * release)
    s = max(0, n - a - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.ones(s),
        np.linspace(1, 0, r),
    ])
    return env[:n]

def tone(freq, dur, harmonics=(1, 0.3, 0.1), noise=0.005):
    n = int(SR * dur)
    t = np.arange(n) / SR
    wave = sum(amp * np.sin(2 * np.pi * freq * h * t) for h, amp in zip([1, 2, 3], harmonics))
    wave = wave * envelope(n)
    if noise > 0:
        wave += noise * np.random.randn(n)
    wave /= max(np.abs(wave).max(), 1e-6)
    return (wave * 0.6).astype(np.float32)

# scan: soft high blip — for Read/Grep
sf.write(OUT_DIR / "scan.wav", tone(880, 0.12), SR)
# type: medium pop — for Edit/Write
sf.write(OUT_DIR / "type.wav", tone(660, 0.08, harmonics=(1, 0.2, 0)), SR)
# term: short low click — for Bash
sf.write(OUT_DIR / "term.wav", tone(440, 0.06, harmonics=(1, 0.5, 0.2)), SR)
# web: soft swoosh — for WebFetch/Search (rising tone)
n = int(SR * 0.15)
t = np.arange(n) / SR
swoosh = np.sin(2 * np.pi * (440 + 200 * t) * t) * envelope(n, attack=0.05, release=0.3)
swoosh = (swoosh * 0.6).astype(np.float32)
sf.write(OUT_DIR / "web.wav", swoosh, SR)
# agent: distinct two-tone — for Task (subagent)
n = int(SR * 0.18)
t = np.arange(n) / SR
agent = np.sin(2 * np.pi * 587 * t) * envelope(n)
agent[len(agent)//2:] += np.sin(2 * np.pi * 880 * t[:len(agent)//2 + 1][:len(agent) - len(agent)//2]) * envelope(len(agent) - len(agent)//2)
agent /= max(np.abs(agent).max(), 1e-6)
sf.write(OUT_DIR / "agent.wav", (agent * 0.6).astype(np.float32), SR)
# permission: ascending alert — for Notification
n = int(SR * 0.25)
t = np.arange(n) / SR
perm = np.sin(2 * np.pi * (440 + 600 * t) * t) * envelope(n, attack=0.03, release=0.4)
sf.write(OUT_DIR / "permission.wav", (perm * 0.7).astype(np.float32), SR)
# welcome: soft chord — for SessionStart
n = int(SR * 0.4)
t = np.arange(n) / SR
chord = (np.sin(2 * np.pi * 523 * t) + np.sin(2 * np.pi * 659 * t) + np.sin(2 * np.pi * 784 * t)) / 3
chord = chord * envelope(n, attack=0.05, release=0.7)
sf.write(OUT_DIR / "welcome.wav", (chord * 0.5).astype(np.float32), SR)
# done: soft confirm — for Stop (turn end)
sf.write(OUT_DIR / "done.wav", tone(523, 0.15, harmonics=(1, 0.4, 0.15)), SR)
# error: low descending — for failures
n = int(SR * 0.2)
t = np.arange(n) / SR
err = np.sin(2 * np.pi * (440 - 200 * t) * t) * envelope(n, attack=0.02, release=0.5)
sf.write(OUT_DIR / "error.wav", (err * 0.6).astype(np.float32), SR)

print(f"Wrote 9 sounds to {OUT_DIR}")
```

- [ ] **Step 2: Run generator with venv python**

```bash
cd plugin
~/.claude/channels/aloud/.venv/bin/python3 scripts/gen-sounds.py
ls sounds/lofi/
```
Expected: 9 .wav files.

- [ ] **Step 3: Audition each sound**

```bash
for f in plugin/sounds/lofi/*.wav; do
  echo "=== $(basename $f) ==="
  afplay "$f"
  sleep 0.3
done
```

If any sound is too harsh, too long, or indistinguishable from another, tune the generator and re-run. They should each be < 250ms and distinct.

- [ ] **Step 4: Write LICENSE.md**

Create `plugin/sounds/lofi/LICENSE.md`:

```markdown
# Lo-fi sound pack

All sounds in this directory are CC0 (public domain).

Generated procedurally by `scripts/gen-sounds.py` using simple sine + harmonic
synthesis. No copyrighted samples. Free to use, modify, redistribute.

To regenerate or tweak the timbres, edit `scripts/gen-sounds.py` and re-run with:

    plugin/.venv/bin/python3 scripts/gen-sounds.py
```

- [ ] **Step 5: Commit**

```bash
git add plugin/scripts/gen-sounds.py plugin/sounds/
git commit -m "feat: lo-fi sound pack v1 — 9 procedurally-generated CC0 sounds"
```

---

## Task 8: System prompt nudge for `speak()`

**Files:**
- Modify: `plugin/server.ts`

The MCP server's `instructions` field is read by Claude Code at session init and shapes Claude's behavior. We want Claude to call `speak()` when TTS is enabled, but the tool no-ops if disabled — so we can be aggressive about the nudge without spamming when off.

- [ ] **Step 1: Replace `instructions` field in `plugin/server.ts`**

Find the existing `instructions` field in the `Server(...)` constructor and replace with:

```typescript
instructions: `
You have a "speak" tool that generates spoken audio output via local TTS.

When you finish a substantive response — answering a question, completing a task, surfacing an important result — call the speak tool with the text you'd like spoken. Pass your full response text as the "text" argument. The tool internally summarizes it to a single short sentence for spoken playback, so you do not need to summarize yourself.

The tool no-ops silently when TTS is disabled by the user, so calling it is safe by default.

Skip speak for:
- Routine silent tool use (background reads, internal grep)
- Code-only outputs (the user reads code, doesn't need it spoken)
- Very short replies (≤ 80 chars; the tool already filters these)
- Multi-step intermediate progress (only speak at meaningful checkpoints)

The user toggles TTS on/off via /aloud:configure tts on|off. Sound effects on tool use fire automatically via plugin hooks — you don't manage those.
`.trim(),
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd plugin && bun build server.ts --target=bun --outfile=/tmp/aloud-build-check.js
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/server.ts
git commit -m "feat: strengthen MCP instructions — Claude calls speak() on substantive responses"
```

---

## Task 9: `/aloud:configure` skill — drop wake-word, add toggles

**Files:**
- Modify: `plugin/skills/configure/SKILL.md`

Replace voice-input setup with audio-output toggles.

- [ ] **Step 1: Rewrite SKILL.md**

Replace contents with:

```markdown
---
name: configure
description: Set up and control the Aloud voice-output plugin — install Kokoro TTS dependencies, toggle sound effects on/off, toggle TTS on/off, set volume, check status. Use when the user asks to install Aloud, mute/unmute sounds or voice, or change Aloud settings.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(uv *)
  - Bash(mkdir *)
  - Bash(ls *)
  - Bash(rm *)
  - Bash(afplay *)
---

# /aloud:configure — Aloud Setup & Control

One skill, all controls. State lives in `~/.claude/channels/aloud/config.json`. The MCP server re-reads runtime fields on each speak() call and the play.sh wrapper re-reads on every hook fire — changes take effect immediately, no restart.

Arguments passed: `$ARGUMENTS`

---

## State shape

`~/.claude/channels/aloud/config.json` — all fields optional, missing fields fall back to defaults:

```json
{
  "tts": { "voice": "af_sky", "speed": 1.0 },
  "summarizer": { "max_sentences": 1 },
  "runtime": {
    "sounds_enabled": true,
    "tts_enabled": false,
    "tts_volume": 0.5,
    "tts_min_chars": 80
  }
}
```

Always Read before Write to preserve unknown fields.

---

## Dispatch on arguments

If empty or unrecognized, show status (no-args path).

### No args — status

Read state. Show:
- Sounds enabled: yes/no
- TTS enabled: yes/no
- Voice: <name>, volume: <value>
- Python venv installed: yes/no (via `ls ~/.claude/channels/aloud/.venv/bin/python3`)

End with concrete next step:
- venv missing → "Run `/aloud:configure setup` to install Kokoro TTS dependencies."
- TTS off → "Run `/aloud:configure tts on` to start hearing summarized voice output."

### `setup` — install Python deps + write defaults

1. **uv check.** Run `uv --version`. If missing: stop, tell the user `curl -LsSf https://astral.sh/uv/install.sh | sh`.
2. **Venv create + Kokoro install.**
   - `mkdir -p ~/.claude/channels/aloud`
   - `uv venv ~/.claude/channels/aloud/.venv --python 3.11` (only if missing)
   - `uv pip install --python ~/.claude/channels/aloud/.venv/bin/python3 -r ${CLAUDE_PLUGIN_ROOT}/tts/requirements.txt`
3. **Write minimal config** at `~/.claude/channels/aloud/config.json`:
   ```json
   {}
   ```
   (All defaults are baked into the server. Empty file is the cleanest minimal config.)
4. **Confirm + next step.**
   > "Setup complete. Sound effects fire automatically on tool use. To hear voice summaries of Claude's responses, run `/aloud:configure tts on`. First voice output downloads Kokoro models (~330MB) — one-time."

### `sounds on` / `sounds off`

Read config. Set `runtime.sounds_enabled` to true/false. Write back. Confirm.

### `tts on` / `tts off`

Read config. Set `runtime.tts_enabled` to true/false. Write back. Confirm. Note that TTS uses MCP sampling, so toggling on means subsequent Claude responses will be summarized + spoken.

### `volume <0.0–1.0>`

Validate. Read, set `runtime.tts_volume`, write.

### `min-chars <integer>`

Validate. Read, set `runtime.tts_min_chars`, write. Default 80 — replies shorter than this are not spoken.

### `voice <name>`

Set `tts.voice`. Common Kokoro voices: `af_sky`, `af_bella`, `am_adam`, `am_michael`. Read, set, write.

### `test`

Play one of each sound effect (scan, type, term, web, agent, permission, welcome, done, error) with 300ms gaps. Helps audition the pack.

```bash
for s in scan type term web agent permission welcome done error; do
  ${CLAUDE_PLUGIN_ROOT}/scripts/play.sh "$s"
  sleep 0.3
done
```

### `reinstall`

Destructive. Confirm with user. `rm -rf ~/.claude/channels/aloud/.venv`. Re-run setup.

---

## Implementation notes

- Always Read before Write — preserve unknown fields.
- `mkdir -p ~/.claude/channels/aloud` before any write.
- Pretty-print JSON (2-space indent).
- The MCP server re-reads the config on each speak() invocation so toggles work without restart.
- The play.sh wrapper re-reads the config on each invocation so sound mute also takes effect immediately.
```

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/configure/SKILL.md
git commit -m "feat: rewrite /aloud:configure — drop wake-word setup, add sounds/tts toggles"
```

---

## Task 10: Update Kokoro spawn behavior — gate on TTS-enabled

**Files:**
- Modify: `plugin/server.ts`

Kokoro consumes ~150MB RAM idle and ~800MB during synthesis. If user has TTS off and never plans to use it, no point loading Kokoro. Gate the Kokoro subprocess spawn on initial `tts_enabled`.

The trade-off: turning TTS on at runtime means Kokoro isn't running, so first speak() would fail. Acceptable: skill could spawn it, OR speak() could lazy-spawn it on first call. Lazy-spawn is simplest.

For MVP, simpler approach: ALWAYS spawn Kokoro. ~150MB idle is acceptable. We optimize later.

- [ ] **Step 1: No code change in server.ts spawning logic**

Confirm Kokoro continues to spawn unconditionally on server start.

- [ ] **Step 2: Verify with smoke test**

```bash
cd plugin/scripts && ./dev-tts.sh &  # see Task 11 for dev-tts.sh
sleep 8
curl -s http://127.0.0.1:8880/health
# expected: {"status":"ok"}
kill %1
```

(Skip if dev-tts.sh isn't built yet.)

- [ ] **Step 3: No new commit needed unless you adjusted server.ts.**

---

## Task 11: Replace dev-listener.sh + dev-server.sh with dev-tts.sh

**Files:**
- Create: `plugin/scripts/dev-tts.sh`

Dev harness: run server.ts with held-open stdin (no MCP host), so we can iterate on TTS + sound triggering without plugin reinstall.

- [ ] **Step 1: Write `plugin/scripts/dev-tts.sh`**

```bash
#!/bin/bash
# Dev harness for Aloud v2.
# Runs server.ts standalone with stdin held open via fifo so the plugin
# orphan watchdog doesn't shut us down. Stderr visible so we see TTS
# logs, MCP errors, etc. Speak() sampling will fail silently because
# there's no MCP host to answer createMessage — that's expected.
# Use this to verify the TTS server boots, Kokoro loads, and sound
# files exist.
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PLUGIN_DIR"
echo "[dev] $(pwd)"
echo "[dev] starting bun server.ts; ctrl-c to stop"
FIFO=$(mktemp -u)
mkfifo "$FIFO"
sleep infinity > "$FIFO" &
WRITER=$!
trap "kill $WRITER 2>/dev/null; rm -f $FIFO" EXIT
bun server.ts < "$FIFO"
```

```bash
chmod +x plugin/scripts/dev-tts.sh
```

- [ ] **Step 2: Smoke test**

```bash
./plugin/scripts/dev-tts.sh &
sleep 10
curl -s http://127.0.0.1:8880/health
# Expected: {"status":"ok"}
curl -s -X POST http://127.0.0.1:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Aloud v2 ready.","voice":"af_sky","response_format":"wav","speed":1.0}' \
  -o /tmp/aloud-v2-test.wav
ls -la /tmp/aloud-v2-test.wav
afplay /tmp/aloud-v2-test.wav
kill %1 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
git add plugin/scripts/dev-tts.sh
git commit -m "feat: dev-tts.sh — TTS-only dev harness (replaces dev-listener.sh and dev-server.sh)"
```

---

## Task 12: README + ACCESS.md rewrite

**Files:**
- Modify: `README.md` (root)
- Modify: `plugin/ACCESS.md`

- [ ] **Step 1: Rewrite README.md**

Replace contents with:

```markdown
# Aloud

Hook-driven sound effects + sampling-summarized voice output for Claude Code. Local TTS via Kokoro, no cloud required, no microphone needed.

When Claude reads files, edits code, runs Bash, fetches the web, or spawns subagents — you hear distinct, soft, lo-fi sounds. When Claude finishes a substantive response, an MCP-sampled one-sentence summary plays through your speaker. Toggle either layer with one command.

## Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- macOS (afplay) or Linux (aplay)

## Quick Setup

**1. Install the plugin.**

```
/plugin marketplace add iamshubhankarkhare/aloud
/plugin install aloud@aloud
/reload-plugins
```

**2. Configure.**

```
/aloud:configure setup
```

Creates `~/.claude/channels/aloud/.venv`, installs Kokoro, writes default config. Sounds are on by default. TTS is off by default.

**3. Use.**

Sound effects fire automatically on tool use — no further action. To enable spoken summaries:

```
/aloud:configure tts on
```

The first voice output downloads Kokoro models (~330MB) to `~/.claude/channels/aloud/models/`, one-time.

## Runtime control

```
/aloud:configure                    # status
/aloud:configure sounds on          # toggle sound effects
/aloud:configure sounds off
/aloud:configure tts on             # toggle voice summaries
/aloud:configure tts off
/aloud:configure volume 0.7         # 0.0–1.0
/aloud:configure voice af_bella     # Kokoro voice
/aloud:configure test               # play every sound, audition the pack
```

Changes take effect immediately — no restart.

## What plays when

| Event | Sound | When |
|---|---|---|
| `Read` / `Grep` / `Glob` / `LS` | scan | tool dispatch |
| `Edit` / `Write` / `MultiEdit` | type | tool dispatch |
| `Bash` | term | tool dispatch |
| `WebFetch` / `WebSearch` | web | tool dispatch |
| `Task` (subagent) | agent | tool dispatch |
| Permission needed | permission | Notification hook |
| Session start | welcome | session boot |
| Turn end | done | Stop hook |

Voice summary fires when Claude calls `speak()` after a substantive response (system-prompt-nudged, only if TTS is enabled).

## Configuration

See [ACCESS.md](./plugin/ACCESS.md) for the full config schema, themes, and TTS provider options.

## License

MIT — sound pack is CC0 (procedurally generated, no copyrighted samples).
```

- [ ] **Step 2: Rewrite ACCESS.md**

Replace contents with the schema-and-skill reference. Drop wake-word, add hooks + sound pack section. (Detailed text omitted from this plan — write straight reference doc.)

- [ ] **Step 3: Commit**

```bash
git add README.md plugin/ACCESS.md
git commit -m "docs: rewrite README + ACCESS.md for v2 (voice output only)"
```

---

## Task 13: End-to-end install + smoke validation

Manual integration test. No automated test — must run on real machine with speakers.

- [ ] **Step 1: Push branch and reinstall plugin**

```bash
cd /Users/shubhankar/Desktop/myplayground/aloud
git push origin main
```

In Claude Code:
```
/plugin uninstall aloud@aloud
/plugin install aloud@aloud
/reload-plugins
```

- [ ] **Step 2: Re-run setup**

```
/aloud:configure setup
```

Verify:
- venv has only kokoro-onnx, soundfile, numpy (not openwakeword/whisper/sounddevice)
- config.json written

- [ ] **Step 3: Test sound effects**

```
/aloud:configure test
```

Hear all 9 sounds. They should be lo-fi, short, distinct.

- [ ] **Step 4: Restart with channels and verify hooks fire**

Exit Claude Code. Relaunch:

```bash
claude --dangerously-load-development-channels plugin:aloud@aloud
```

Wait for SessionStart sound (welcome). Then ask Claude to read a file:

```
Read package.json
```

Should hear the `scan` sound when the Read tool fires. Try Bash, Edit, etc.

- [ ] **Step 5: Test TTS**

In Claude Code:
```
/aloud:configure tts on
```

Then ask a question:
```
What does this project do?
```

Claude responds + calls speak() + you hear a one-sentence summary in Kokoro voice.

- [ ] **Step 6: Test toggle**

```
/aloud:configure tts off
```

Ask another question. No voice — only text response and the `done` Stop sound.

```
/aloud:configure sounds off
```

Ask another question. Silent — no sounds, no voice.

```
/aloud:configure sounds on
/aloud:configure tts on
```

Both back on.

- [ ] **Step 7: Done**

If all 6 substeps pass, MVP complete. Commit/push any final tweaks.

---

## Phase 2 (deferred — not in this plan)

- Multiple sound pack themes (synthwave, sci-fi, mac-hig, zen) + theme picker
- Audio ducking (lower Apple Music when TTS speaks)
- Per-tool sound override via config (user-replaceable WAV paths)
- Subagent-aware: distinct voice/sound when Task tool returns from background subagent
- Persona LLM rewrite (style summary in chosen voice's character — Voicebox-style)
- macOS `say` fallback when Kokoro unavailable / for zero-deps users
- Per-mode profiles (focused vs late-night vs pair-programming)

---

## Notes for the Implementer

- **Don't add features beyond MVP.** The Phase 2 list is a backlog, not a checklist.
- **Sound pack quality matters.** Audition every sound after generation. If any feels harsh or laggy, tune the generator.
- **Test with TTS off and on.** The default is off — a fresh install should work without a voice playing.
- **Keep play.sh fast.** Background the afplay process, exit immediately. Hooks must not block tool dispatch.
- **Plugin manifest hooks vs user settings.json hooks.** This plan ships hooks in `plugin/.claude-plugin/hooks/hooks.json` so they install with the plugin. Users with their own settings.json hooks aren't affected.
- **Caveman lite mode is active in chat.** Plan documents and code comments stay normal.
