// server.ts — Aloud v2 (voice output only)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { loadConfig } from "./lib/config";
import { createTtsProvider } from "./lib/tts";
import { createSpeakHandler, SPEAK_TOOL_DEFINITION } from "./lib/tools";
import { getVenvPython, venvExists } from "./lib/bootstrap";

const config = loadConfig();
const tts = createTtsProvider(config.tts);

// --- MCP Server ---
const mcp = new Server(
  { name: "aloud", version: "0.2.0" },
  {
    capabilities: { tools: {} },
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
  }
);

// Speak tool — wires sampling + Kokoro
const speakHandler = createSpeakHandler(
  config,
  async (params) => {
    const result = await mcp.createMessage({
      messages: params.messages as any,
      systemPrompt: params.systemPrompt,
      maxTokens: params.maxTokens ?? config.summarizer.max_tokens,
      modelPreferences: params.modelPreferences,
    });
    return result as any;
  },
  tts
);

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SPEAK_TOOL_DEFINITION],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "speak") {
    await speakHandler(req.params.arguments as { text: string });
    return { content: [{ type: "text", text: "spoken" }] };
  }
  throw new Error(`unknown tool: ${req.params.name}`);
});

// --- Kokoro TTS subprocess ---
function startKokoroServer(): ReturnType<typeof Bun.spawn> {
  const scriptDir = new URL(".", import.meta.url).pathname;
  const serverPath = join(scriptDir, "tts/kokoro_server.py");
  const port = String(config.ports.kokoro);

  const child = Bun.spawn(
    [getVenvPython(), serverPath, "--host", "127.0.0.1", "--port", port],
    {
      stdout: "inherit",
      stderr: "inherit",
      onExit(_, code) {
        console.error(`[aloud] kokoro server exited: ${code}`);
      },
    }
  );

  return child;
}

// --- Start ---
if (!venvExists()) {
  console.error(
    `[aloud] Python venv missing at ${getVenvPython()}\n` +
    `[aloud] Run /aloud:configure setup in Claude Code to set up dependencies.`
  );
  process.exit(1);
}

const STATE_DIR = join(homedir(), ".claude", "channels", "aloud");
const PID_FILE = join(STATE_DIR, "aloud.pid");

mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
try {
  const stale = parseInt(readFileSync(PID_FILE, "utf-8"), 10);
  if (stale > 1 && stale !== process.pid) {
    process.kill(stale, 0);  // throws ESRCH if process is dead
    console.error(`[aloud] replacing stale instance pid=${stale}`);
    process.kill(stale, "SIGTERM");
  }
} catch {}
writeFileSync(PID_FILE, String(process.pid));

await mcp.connect(new StdioServerTransport());
const kokoroChild = startKokoroServer();

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
  try { kokoroChild.kill(); } catch {}
  setTimeout(() => process.exit(0), 1500);
}
// Note: do NOT register process.stdin "end"/"close" handlers — the MCP SDK
// consumes stdin via its own readable interface and may mark it as ended,
// which would trigger spurious shutdowns. Rely on signal handlers + parent
// ppid orphan detection instead.
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

// Orphan watchdog: only kill ourselves if our parent process actually died.
const bootPpid = process.ppid;
setInterval(() => {
  if (process.platform !== "win32" && process.ppid !== bootPpid) {
    shutdown();
  }
}, 5000).unref();

console.error(
  `[aloud] ready — sounds ${config.runtime.sounds_enabled ? "ON" : "OFF"}, ` +
  `TTS ${config.runtime.tts_enabled ? "ON" : "OFF"}`
);
