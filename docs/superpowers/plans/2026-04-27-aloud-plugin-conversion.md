# Aloud → Claude Code Plugin Conversion

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Aloud from a standalone repo with local `.mcp.json` into a Claude Code plugin matching the Telegram channel pattern, so it can be installed via `/plugin install <git-url>` and invoked with `claude --channels plugin:aloud@<source>` from any directory.

**Architecture:** Plugin root contains `.claude-plugin/plugin.json` manifest, `.mcp.json` using `${CLAUDE_PLUGIN_ROOT}`, a thin `server.ts` entry that imports from `lib/`, Python subprocess code under `wakeword/`, two user-invocable skills (`configure`/`control`) under `skills/`, and runtime state at `~/.claude/channels/aloud/`. Python deps live in a uv-managed venv inside the state dir. The `aloud.sh` wrapper and `aloud-init.ts` standalone CLI are deleted — `/aloud:configure` replaces both.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, Python 3.11+, uv (Python venv manager), openWakeWord, faster-whisper, kokoro-onnx

**Reference plugin:** `~/.claude/plugins/cache/claude-plugins-official/telegram/0.0.6/`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest (name, description, version, keywords) |
| `server.ts` | Thin MCP server entry — imports from `lib/`, wires subprocess lifecycle, stdin/SIGTERM shutdown, PID lock |
| `lib/bootstrap.ts` | Detect/create uv venv at `~/.claude/channels/aloud/.venv`, install Python requirements |
| `skills/configure/SKILL.md` | `/aloud:configure` — prompt for wake word/voice/STT model, run bootstrap, write `config.json`, pre-download Kokoro models |
| `skills/control/SKILL.md` | `/aloud:control` — mute/unmute, sensitivity, status (reads/writes `~/.claude/channels/aloud/control.json`) |
| `ACCESS.md` | Config schema, skill commands, state-dir layout |

### Renamed/moved

| Old | New |
|---|---|
| `channel/config.ts` | `lib/config.ts` |
| `channel/state.ts` | `lib/state.ts` |
| `channel/tts.ts` | `lib/tts.ts` |
| `channel/tools.ts` | `lib/tools.ts` |
| `channel/index.ts` | `server.ts` (consolidated entry) |
| `tests/channel/*` | `tests/lib/*` |

### Modified

| File | Change |
|---|---|
| `.mcp.json` | Use `${CLAUDE_PLUGIN_ROOT}`; drop relative `channel/index.ts` |
| `package.json` | `start: "bun install --no-summary && bun server.ts"`; drop `init` script |
| `lib/config.ts` | `defaultConfigPath()` → `~/.claude/channels/aloud/config.json` |
| `wakeword/kokoro_server.py` | `MODELS_DIR` → `~/.claude/channels/aloud/models/` |
| `wakeword/listener.py` | Read venv markers for graceful failure if deps missing |
| `README.md` | Rewrite Telegram-style: Prerequisites, Quick Setup with `/plugin install`, `/aloud:configure`, `--channels` restart |
| `.gitignore` | Already covers state — verify |

### Deleted

| File | Reason |
|---|---|
| `aloud.sh` | Replaced by `claude --channels plugin:aloud@<source>` |
| `aloud-init.ts` | Replaced by `/aloud:configure` skill |
| `channel/` directory | Contents moved to `lib/` |

---

## Prerequisites (do once before any task)

- Confirm `uv` is installed: `uv --version` (install via `curl -LsSf https://astral.sh/uv/install.sh | sh` if missing)
- Working git tree: `git status` clean except for plan files
- Existing tests pass: `bun test` and `pytest tests/wakeword/`

---

## Task 1: Plugin manifest + `.mcp.json` rewrite

**Files:**
- Create: `.claude-plugin/plugin.json`
- Modify: `.mcp.json`
- Modify: `package.json`

- [ ] **Step 1: Create plugin manifest**

Write `.claude-plugin/plugin.json`:

```json
{
  "name": "aloud",
  "description": "Ambient voice channel for Claude Code — local wake word, local STT, local TTS. No cloud required.",
  "version": "0.1.0",
  "keywords": ["voice", "wake-word", "tts", "stt", "channel", "mcp"]
}
```

- [ ] **Step 2: Rewrite `.mcp.json`**

Replace contents with:

```json
{
  "mcpServers": {
    "aloud": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}", "--shell=bun", "--silent", "start"]
    }
  }
}
```

- [ ] **Step 3: Update `package.json` `start` script**

Replace `"start": "bun channel/index.ts"` with:

```json
"start": "bun install --no-summary && bun server.ts"
```

Drop `"init": "bun aloud-init.ts"` from scripts.

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))" && node -e "JSON.parse(require('fs').readFileSync('.mcp.json'))" && node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json .mcp.json package.json
git commit -m "feat: plugin manifest + portable .mcp.json (CLAUDE_PLUGIN_ROOT)"
```

---

## Task 2: Move state dir to `~/.claude/channels/aloud/`

**Files:**
- Modify: `channel/config.ts`
- Modify: `wakeword/kokoro_server.py`
- Modify: `tests/channel/config.test.ts` (existing tests reference old path)
- Test: existing tests pass with new defaults

- [ ] **Step 1: Update `defaultConfigPath()` in `channel/config.ts`**

Change:
```typescript
return process.env.ALOUD_CONFIG_PATH ?? join(homedir(), ".aloud", "config.json");
```
To:
```typescript
return process.env.ALOUD_CONFIG_PATH ?? join(homedir(), ".claude", "channels", "aloud", "config.json");
```

- [ ] **Step 2: Update `MODELS_DIR` in `wakeword/kokoro_server.py`**

Change:
```python
MODELS_DIR = Path(os.environ.get("ALOUD_MODELS_DIR", Path.home() / ".aloud" / "models"))
```
To:
```python
MODELS_DIR = Path(os.environ.get("ALOUD_MODELS_DIR", Path.home() / ".claude" / "channels" / "aloud" / "models"))
```

- [ ] **Step 3: Run existing tests**

Run: `bun test tests/channel/config.test.ts -v`
Expected: PASS. If a test asserts the literal old path, update assertion to new path.

- [ ] **Step 4: Move existing model files (one-time migration for dev)**

```bash
mkdir -p ~/.claude/channels/aloud
mv ~/.aloud/* ~/.claude/channels/aloud/ 2>/dev/null || true
rmdir ~/.aloud 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add channel/config.ts wakeword/kokoro_server.py tests/channel/config.test.ts
git commit -m "feat: move state dir to ~/.claude/channels/aloud/"
```

---

## Task 3: File reorg — `channel/` → `lib/`, add thin `server.ts`

**Files:**
- Move: `channel/{config,state,tts,tools}.ts` → `lib/`
- Move: `channel/index.ts` → `server.ts` (root)
- Move: `tests/channel/` → `tests/lib/`
- Update all import paths

- [ ] **Step 1: Move source files**

```bash
mkdir -p lib
git mv channel/config.ts lib/config.ts
git mv channel/state.ts lib/state.ts
git mv channel/tts.ts lib/tts.ts
git mv channel/tools.ts lib/tools.ts
git mv channel/index.ts server.ts
rmdir channel
```

- [ ] **Step 2: Update imports in `server.ts`**

Replace:
```typescript
import { loadConfig } from "./config";
import { StateMachine, State } from "./state";
import { createTtsProvider } from "./tts";
import { createSpeakHandler, SPEAK_TOOL_DEFINITION } from "./tools";
```
With:
```typescript
import { loadConfig } from "./lib/config";
import { StateMachine, State } from "./lib/state";
import { createTtsProvider } from "./lib/tts";
import { createSpeakHandler, SPEAK_TOOL_DEFINITION } from "./lib/tools";
```

- [ ] **Step 3: Update wakeword script paths in `server.ts`**

The two `startKokoroServer()` and `startWakeWordListener()` functions resolve scripts relative to the source file. Now `server.ts` is at root, so:

Change:
```typescript
const serverPath = join(scriptDir, "../wakeword/kokoro_server.py");
```
To:
```typescript
const serverPath = join(scriptDir, "wakeword/kokoro_server.py");
```

(Same change for `listenerPath`.)

- [ ] **Step 4: Move tests**

```bash
mkdir -p tests/lib
git mv tests/channel/config.test.ts tests/lib/config.test.ts
git mv tests/channel/state.test.ts tests/lib/state.test.ts
git mv tests/channel/tts.test.ts tests/lib/tts.test.ts
git mv tests/channel/tools.test.ts tests/lib/tools.test.ts
rmdir tests/channel
```

- [ ] **Step 5: Update test imports**

In each `tests/lib/*.test.ts`, replace `from "../../channel/<X>"` with `from "../../lib/<X>"`.

- [ ] **Step 6: Run all TS tests**

Run: `bun test`
Expected: all 16 tests PASS.

- [ ] **Step 7: Run Python tests**

Run: `pytest tests/wakeword/ -v`
Expected: 4 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move channel/ to lib/, hoist server.ts to root"
```

---

## Task 4: uv venv bootstrap for Python deps

**Files:**
- Create: `lib/bootstrap.ts`
- Modify: `server.ts` (use venv python path for subprocess)
- Test: `tests/lib/bootstrap.test.ts`

The MCP server should use a per-plugin venv so Python deps don't pollute system Python and survive plugin reinstall. uv is the venv manager.

- [ ] **Step 1: Write failing test for `getVenvPython()`**

Create `tests/lib/bootstrap.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { getVenvPython, venvExists } from "../../lib/bootstrap";
import { homedir } from "os";
import { join } from "path";

describe("bootstrap", () => {
  it("getVenvPython returns expected path", () => {
    const path = getVenvPython();
    expect(path).toBe(join(homedir(), ".claude", "channels", "aloud", ".venv", "bin", "python3"));
  });

  it("venvExists returns false when missing", () => {
    process.env.ALOUD_VENV_DIR = "/tmp/aloud-nonexistent-venv";
    expect(venvExists()).toBe(false);
    delete process.env.ALOUD_VENV_DIR;
  });
});
```

Run: `bun test tests/lib/bootstrap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `lib/bootstrap.ts`**

```typescript
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function venvDir(): string {
  return process.env.ALOUD_VENV_DIR ?? join(homedir(), ".claude", "channels", "aloud", ".venv");
}

export function getVenvPython(): string {
  return join(venvDir(), "bin", "python3");
}

export function venvExists(): boolean {
  return existsSync(getVenvPython());
}
```

- [ ] **Step 3: Run test, expect PASS**

Run: `bun test tests/lib/bootstrap.test.ts`
Expected: 2 PASS.

- [ ] **Step 4: Use venv python in `server.ts` subprocess spawns**

Replace `Bun.spawn(["python3", serverPath, ...])` with logic that:
- Imports `getVenvPython, venvExists` from `./lib/bootstrap`
- If `venvExists()`, use `getVenvPython()`; else log a clear error pointing user to `/aloud:configure` and exit non-zero.

```typescript
import { getVenvPython, venvExists } from "./lib/bootstrap";

if (!venvExists()) {
  console.error(
    "[aloud] Python venv missing at " + getVenvPython() + "\n" +
    "[aloud] Run /aloud:configure in Claude Code to set up dependencies."
  );
  process.exit(1);
}

const PYTHON = getVenvPython();
// ...
Bun.spawn([PYTHON, serverPath, "--host", "127.0.0.1", "--port", port], { ... });
Bun.spawn([PYTHON, listenerPath], { ... });
```

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: 18 PASS (16 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add lib/bootstrap.ts server.ts tests/lib/bootstrap.test.ts
git commit -m "feat: use uv-managed venv for Python deps; require setup before server start"
```

---

## Task 5: `/aloud:configure` skill

**Files:**
- Create: `skills/configure/SKILL.md`

This skill replaces `aloud-init.ts` and the manual `pip install` step. It is user-invocable and uses Read/Write/Bash for state-dir setup.

- [ ] **Step 1: Write `skills/configure/SKILL.md`**

```markdown
---
name: configure
description: Set up the Aloud voice channel — install Python dependencies, configure wake word, voice, and STT model, pre-download local TTS models. Use when the user wants to install or reconfigure Aloud, asks "how do I set up voice", or pastes a wake word phrase.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(uv *)
  - Bash(mkdir *)
  - Bash(ls *)
---

# /aloud:configure — Aloud Channel Setup

Sets up Aloud: creates a Python venv with uv, installs requirements, writes `~/.claude/channels/aloud/config.json`, and pre-downloads local TTS models. The MCP server reads `config.json` at boot.

Arguments passed: `$ARGUMENTS`

---

## Dispatch on arguments

### No args — interactive setup

Drive a short conversation. Ask one question at a time. Defaults in brackets are accepted on empty input.

1. **Check uv is installed.** Run `uv --version`. If missing, tell the user to install: `curl -LsSf https://astral.sh/uv/install.sh | sh` and stop here.

2. **Check venv exists.** `ls ~/.claude/channels/aloud/.venv/bin/python3`.
   - If missing: `mkdir -p ~/.claude/channels/aloud && uv venv ~/.claude/channels/aloud/.venv --python 3.11` then `uv pip install --python ~/.claude/channels/aloud/.venv/bin/python3 -r ${CLAUDE_PLUGIN_ROOT}/wakeword/requirements.txt`. Report success/failure.
   - If present: skip; tell the user "Python deps already installed."

3. **Read existing config** at `~/.claude/channels/aloud/config.json`. If present, show current values and ask if user wants to change anything. If not, prompt for each field.

4. **Prompt for fields** (one at a time):
   - Wake word phrase [`hey jarvis`] — must match an openwakeword bundled model name (`hey_jarvis`, `alexa`, `hey_mycroft`, `hey_rhasspy`, `timer`, `weather`). Map "hey jarvis" → `hey_jarvis` for the `wakeword.model` field.
   - TTS voice [`af_sky`] — Kokoro voice ID
   - Whisper model [`base.en`] — one of `tiny.en`, `base.en`, `small.en`
   - Max sentences in spoken summary [`5`] — integer

5. **Write config.** Merge with defaults (do not write fields the user accepted as default — keep config minimal). Pretty-print 2-space indent.

   ```json
   {
     "wakeword": { "phrase": "<phrase>", "model": "<model>" },
     "stt": { "model": "<model>" },
     "tts": { "voice": "<voice>" },
     "summarizer": { "max_sentences": <n> }
   }
   ```

6. **Confirm + next step.** Tell the user:
   > "Config saved. Restart Claude Code with `claude --channels plugin:aloud@<source>` to start the voice channel. First TTS request downloads the Kokoro models (~330MB) — this is one-time."

### `status` — show current state

1. Read `~/.claude/channels/aloud/config.json` (missing = "not configured").
2. Check venv: `ls ~/.claude/channels/aloud/.venv/bin/python3`.
3. Check Kokoro models: `ls ~/.claude/channels/aloud/models/`.
4. Show all three with concrete next steps for each missing piece.

### `reinstall` — rebuild venv

1. Confirm with user (destructive).
2. `rm -rf ~/.claude/channels/aloud/.venv`
3. Run venv create + install steps from no-args path.

---

## Implementation notes

- Read `~/.claude/channels/aloud/config.json` before writing — preserve fields the skill doesn't manage.
- The state dir might not exist on first run. Always `mkdir -p` before writing.
- Never set fields to literal defaults — keep `config.json` minimal so future default changes propagate.
- The plugin root is `${CLAUDE_PLUGIN_ROOT}`. Use it to reference `wakeword/requirements.txt`.
```

- [ ] **Step 2: Smoke test the skill (manual)**

Have the user run `/aloud:configure` after plugin install. Verify:
- venv created at `~/.claude/channels/aloud/.venv`
- `config.json` written
- `python3 -c "import openwakeword, faster_whisper, sounddevice, kokoro_onnx"` exits 0 using the venv python

- [ ] **Step 3: Commit**

```bash
git add skills/configure/SKILL.md
git commit -m "feat: /aloud:configure skill — uv venv install + interactive config"
```

---

## Task 6: `/aloud:control` skill + control.json runtime state

**Files:**
- Create: `skills/control/SKILL.md`
- Modify: `lib/config.ts` (add `loadControl()` reader)
- Modify: `server.ts` (respect mute flag in voice input handler)
- Test: `tests/lib/config.test.ts` (add control.json tests)

Mute, sensitivity, and status are runtime knobs. Stored separately from `config.json` so they're cheap to re-read on every voice event.

- [ ] **Step 1: Write failing test for `loadControl()`**

Add to `tests/lib/config.test.ts`:

```typescript
describe("loadControl", () => {
  it("returns defaults when file missing", () => {
    process.env.ALOUD_CONTROL_PATH = "/tmp/aloud-nonexistent-control.json";
    const control = loadControl();
    expect(control.muted).toBe(false);
    expect(control.sensitivity).toBe(0.5);
    delete process.env.ALOUD_CONTROL_PATH;
  });

  it("merges file overrides", async () => {
    const tmp = `/tmp/aloud-control-${Date.now()}.json`;
    await Bun.write(tmp, JSON.stringify({ muted: true }));
    process.env.ALOUD_CONTROL_PATH = tmp;
    const control = loadControl();
    expect(control.muted).toBe(true);
    expect(control.sensitivity).toBe(0.5);
    delete process.env.ALOUD_CONTROL_PATH;
  });
});
```

Run: `bun test tests/lib/config.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `loadControl()` in `lib/config.ts`**

```typescript
export interface AloudControl {
  muted: boolean;
  sensitivity: number;
}

const CONTROL_DEFAULTS: AloudControl = { muted: false, sensitivity: 0.5 };

export function defaultControlPath(): string {
  return process.env.ALOUD_CONTROL_PATH ?? join(homedir(), ".claude", "channels", "aloud", "control.json");
}

export function loadControl(controlPath = defaultControlPath()): AloudControl {
  if (!existsSync(controlPath)) return { ...CONTROL_DEFAULTS };
  try {
    const parsed = JSON.parse(readFileSync(controlPath, "utf-8"));
    return { ...CONTROL_DEFAULTS, ...parsed };
  } catch {
    return { ...CONTROL_DEFAULTS };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/lib/config.test.ts`
Expected: PASS.

- [ ] **Step 4: Use `loadControl()` in `server.ts` voice handler**

In `onVoiceInput`, re-read control.json on each event and short-circuit when muted:

```typescript
import { loadControl } from "./lib/config";

async function onVoiceInput(text: string): Promise<void> {
  const control = loadControl();
  if (control.muted) {
    console.error("[aloud] muted — ignoring voice input");
    return;
  }
  // ... existing logic
}
```

- [ ] **Step 5: Write `skills/control/SKILL.md`**

```markdown
---
name: control
description: Control the Aloud voice channel at runtime — mute or unmute, adjust wake word sensitivity, check status. Use when the user asks to mute/unmute voice, change sensitivity, or wants to know if Aloud is listening.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(mkdir *)
---

# /aloud:control — Aloud Runtime Control

Manages `~/.claude/channels/aloud/control.json`. The MCP server re-reads this file on every voice event — changes take effect immediately, no restart.

Arguments passed: `$ARGUMENTS`

---

## State shape

```json
{ "muted": false, "sensitivity": 0.5 }
```

Missing file = `{ muted: false, sensitivity: 0.5 }`.

---

## Dispatch on arguments

### No args — status

Read `~/.claude/channels/aloud/control.json`. Show:
- Muted: yes/no
- Sensitivity: <value> (0.0–1.0; higher = stricter wake word match)

### `mute` / `unmute`

1. Read existing control.json (or default).
2. Set `muted` to true/false.
3. Write back.
4. Confirm. Tell the user "Effective immediately — no restart needed."

### `sensitivity <value>`

1. Validate `<value>` is float between 0.0 and 1.0.
2. Read, set `sensitivity`, write.
3. Confirm.

---

## Implementation notes

- `mkdir -p ~/.claude/channels/aloud` before write.
- Always Read before Write to preserve unknown fields.
- Pretty-print 2-space indent.
```

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts server.ts skills/control/SKILL.md tests/lib/config.test.ts
git commit -m "feat: /aloud:control skill + runtime mute/sensitivity via control.json"
```

---

## Task 7: PID lock + clean shutdown

**Files:**
- Modify: `server.ts`

Mirror Telegram's single-instance enforcement. Wake word listener and Kokoro server should die when the parent MCP server dies (don't leak as orphans).

- [ ] **Step 1: Add PID lock at boot**

In `server.ts`, before subprocess spawn:

```typescript
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const STATE_DIR = join(homedir(), ".claude", "channels", "aloud");
const PID_FILE = join(STATE_DIR, "aloud.pid");

mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
try {
  const stale = parseInt(readFileSync(PID_FILE, "utf-8"), 10);
  if (stale > 1 && stale !== process.pid) {
    process.kill(stale, 0);  // throws ESRCH if dead
    console.error(`[aloud] replacing stale instance pid=${stale}`);
    process.kill(stale, "SIGTERM");
  }
} catch {}
writeFileSync(PID_FILE, String(process.pid));
```

- [ ] **Step 2: Add stdin EOF + signal handlers**

Replace existing SIGINT/SIGTERM handler with:

```typescript
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error("[aloud] shutting down");
  try {
    if (parseInt(readFileSync(PID_FILE, "utf-8"), 10) === process.pid) {
      rmSync(PID_FILE);
    }
  } catch {}
  kokoroChild.kill();
  wakeWordChild.kill();
  setTimeout(() => process.exit(0), 1500);
}
process.stdin.on("end", shutdown);
process.stdin.on("close", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
```

- [ ] **Step 3: Add orphan watchdog**

```typescript
const bootPpid = process.ppid;
setInterval(() => {
  const orphaned =
    (process.platform !== "win32" && process.ppid !== bootPpid) ||
    process.stdin.destroyed ||
    process.stdin.readableEnded;
  if (orphaned) shutdown();
}, 5000).unref();
```

- [ ] **Step 4: Smoke test**

```bash
bun server.ts &
PID=$!
sleep 8
ps -p $PID -o command   # should show server running
ls ~/.claude/channels/aloud/aloud.pid  # should exist
kill -TERM $PID
sleep 3
ls ~/.claude/channels/aloud/aloud.pid 2>&1 | grep -q "No such" && echo "PID file cleaned up"
ps aux | grep -E "(kokoro_server|listener\.py)" | grep -v grep   # should be empty (subprocesses dead)
```

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: PID lock, stdin EOF handler, orphan watchdog for clean shutdown"
```

---

## Task 8: README + ACCESS.md rewrite

**Files:**
- Modify: `README.md`
- Create: `ACCESS.md`

Telegram's README structure: tagline → prerequisites → quick setup (numbered) → access control pointer → tools table → notes. Mirror it.

- [ ] **Step 1: Rewrite README.md**

Replace contents with (Telegram-style structure):

```markdown
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
/aloud:configure
```

Creates a Python venv, installs deps, prompts for wake word/voice/STT model, writes config.

**3. Relaunch with the channel flag.**

```sh
claude --channels plugin:aloud@<source>
```

The first TTS request downloads Kokoro models (~330MB) to `~/.claude/channels/aloud/models/` — one-time.

**4. Talk.**

Say your wake word. Ask anything. Claude responds through your speaker.

## Runtime control

Use `/aloud:control` to mute, unmute, or adjust sensitivity at runtime — no restart needed.

```
/aloud:control mute
/aloud:control unmute
/aloud:control sensitivity 0.6
/aloud:control                  # status
```

## Configuration

See [ACCESS.md](./ACCESS.md) for the full config schema, state-dir layout, and TTS/STT provider options.

## Tools exposed to the assistant

| Tool | Purpose |
| --- | --- |
| `speak` | Speak a response aloud. Text is summarized for spoken output via MCP sampling, then sent to Kokoro. Call when responding to a voice-initiated message, when a long task completes, or when needing user input. |

## License

MIT
```

- [ ] **Step 2: Create ACCESS.md**

```markdown
# Aloud — Configuration Reference

State lives in `~/.claude/channels/aloud/`:

```
~/.claude/channels/aloud/
├── config.json     # provider config (wake word, STT, TTS) — managed by /aloud:configure
├── control.json    # runtime control (muted, sensitivity) — managed by /aloud:control
├── .venv/          # uv-managed Python venv with openwakeword, faster-whisper, kokoro-onnx
├── models/         # Kokoro ONNX + voices (auto-downloaded on first TTS request)
└── aloud.pid       # single-instance lock (managed by server)
```

## config.json

All fields optional — unset fields use defaults.

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

## control.json

```json
{ "muted": false, "sensitivity": 0.5 }
```

Re-read on every voice event. Changes take effect immediately.

## Skills

| Command | Purpose |
|---|---|
| `/aloud:configure` | Install Python deps, set wake word/voice/model, write config |
| `/aloud:configure status` | Show install + config state |
| `/aloud:configure reinstall` | Delete and rebuild venv |
| `/aloud:control` | Show muted state + sensitivity |
| `/aloud:control mute` / `unmute` | Toggle listening |
| `/aloud:control sensitivity <0.0–1.0>` | Adjust wake word match strictness |

## Multiple instances

Set `ALOUD_CONFIG_PATH` and `ALOUD_VENV_DIR` to point at different paths per session.
```

- [ ] **Step 3: Commit**

```bash
git add README.md ACCESS.md
git commit -m "docs: rewrite README + ACCESS.md to match Telegram channel pattern"
```

---

## Task 9: Cleanup deleted files

**Files:**
- Delete: `aloud.sh`, `aloud-init.ts`
- Modify: `.gitignore` (verify state dir is not tracked anywhere)

- [ ] **Step 1: Delete obsolete entry points**

```bash
git rm aloud.sh aloud-init.ts
```

- [ ] **Step 2: Verify nothing references them**

Run: `grep -rn "aloud-init\|aloud\.sh" . --include="*.ts" --include="*.json" --include="*.md" 2>/dev/null | grep -v docs/superpowers/plans`
Expected: empty (or only README references that should be removed too).

- [ ] **Step 3: Run full test suite**

```bash
bun test
pytest tests/wakeword/
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove aloud.sh and aloud-init.ts (replaced by /aloud:configure)"
```

---

## Task 10: End-to-end install + voice validation

**Files:** none (validation only)

This is the integration test. No tests file — must be run manually because it touches Mac audio + Claude Code MCP runtime.

- [ ] **Step 1: Push current branch and confirm git URL is reachable**

```bash
git push origin <branch>
gh repo view --json url -q .url
```

- [ ] **Step 2: Install the plugin from local path**

In a Claude Code session:
```
/plugin install /Users/shubhankar/Desktop/myplayground/aloud
/reload-plugins
```

Verify install: `cat ~/.claude/plugins/installed_plugins.json | grep aloud`

- [ ] **Step 3: Run `/aloud:configure`**

Accept all defaults. Verify:
```bash
ls ~/.claude/channels/aloud/.venv/bin/python3   # exists
ls ~/.claude/channels/aloud/config.json          # exists
~/.claude/channels/aloud/.venv/bin/python3 -c "import openwakeword, faster_whisper, kokoro_onnx, sounddevice"
# Expected: no output, exit 0
```

- [ ] **Step 4: Restart Claude Code with `--channels`**

Exit current session. Run from any directory:
```bash
claude --channels plugin:aloud@<source>
```

Watch stderr for:
```
[aloud] state → RUNNING
[kokoro] listening on 127.0.0.1:8880
[aloud] listening for wake word: 'hey jarvis'
[aloud] ready — wake word: "hey jarvis"
```

- [ ] **Step 5: Trigger wake word, verify channel event**

Say "hey jarvis, what time is it?". Verify in Claude Code:
- Channel notification arrives in session
- Claude responds
- Claude calls `speak()` tool
- TTS audio plays through speaker

- [ ] **Step 6: Test runtime control**

In Claude Code: `/aloud:control mute`. Say wake word — should be ignored. `/aloud:control unmute`. Say wake word — should fire again.

- [ ] **Step 7: Test clean shutdown**

Exit Claude Code (Ctrl-D). Verify subprocesses are gone:
```bash
ps aux | grep -E "(kokoro_server|listener\.py)" | grep -v grep
# Expected: empty
ls ~/.claude/channels/aloud/aloud.pid 2>&1 | grep -q "No such"
# Expected: PID file cleaned up
```

- [ ] **Step 8: Final commit + push**

```bash
git push origin <branch>
```

If any step above fails, file an issue (or fix root cause + restart from failing step). Do not declare done until all 7 substeps validate.

---

## Notes for the Implementer

- **TDD where applicable.** Tasks 4, 6 have unit tests. Tasks 1, 2, 3, 7, 8, 9 are mechanical refactors — verify with existing tests.
- **One commit per task.** Don't bundle.
- **Don't skip the venv check in `server.ts`.** The whole point of this restructure is that `/aloud:configure` is required before server start.
- **`${CLAUDE_PLUGIN_ROOT}` vs runtime paths.** The MCP `.mcp.json` resolves at server-spawn time. Inside `server.ts`, use `import.meta.url` + `URL` for path resolution (same as current code).
- **Don't refactor `lib/tts.ts` while moving it.** Move first, refactor never (until needed).
- **Caveman lite mode is active in chat.** Plan documents and code comments stay normal.
