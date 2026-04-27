// channel/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { loadConfig } from "./config";
import { StateMachine, State } from "./state";
import { createTtsProvider } from "./tts";
import { createSpeakHandler, SPEAK_TOOL_DEFINITION } from "./tools";

const config = loadConfig();
const state = new StateMachine((s) => {
  console.error(`[aloud] state → ${s}`);
});
const tts = createTtsProvider(config.tts);

// --- MCP Server ---
const mcp = new Server(
  { name: "aloud", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `
Voice messages arrive as <channel source="aloud" source_type="voice">.
Respond naturally to them. Call the speak tool when:
- Responding to a voice-initiated message
- A long-running task completes and the user should know
- You need user input or permission to continue
Do NOT call speak for routine silent tool use or background file edits.
    `.trim(),
  }
);

// Speak tool
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
    if (state.is(State.CAPTURING)) {
      return { content: [{ type: "text", text: "skipped: currently capturing voice input" }] };
    }
    state.transition(State.SPEAKING);
    try {
      await speakHandler(req.params.arguments as { text: string });
    } finally {
      state.transition(State.LISTENING);
    }
    return { content: [{ type: "text", text: "spoken" }] };
  }
  throw new Error(`unknown tool: ${req.params.name}`);
});

// --- Kokoro TTS subprocess ---
function startKokoroServer(): ReturnType<typeof Bun.spawn> {
  const scriptDir = new URL(".", import.meta.url).pathname;
  const serverPath = join(scriptDir, "../wakeword/kokoro_server.py");
  const port = String(config.ports.kokoro);

  const child = Bun.spawn(
    ["python3", serverPath, "--host", "127.0.0.1", "--port", port],
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

// --- Wake word subprocess ---
function startWakeWordListener(): ReturnType<typeof Bun.spawn> {
  const scriptDir = new URL(".", import.meta.url).pathname;
  const listenerPath = join(scriptDir, "../wakeword/listener.py");
  const configJson = JSON.stringify(config);

  const child = Bun.spawn(["python3", listenerPath], {
    stdin: new TextEncoder().encode(configJson),
    stdout: "pipe",
    stderr: "inherit",
    onExit(_, code) {
      console.error(`[aloud] wake word listener exited: ${code}`);
    },
  });

  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function readLoop(): Promise<void> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed.text === "string" && parsed.text) {
            onVoiceInput(parsed.text);
          }
        } catch {
          console.error("[aloud] bad stdout line from listener:", trimmed);
        }
      }
    }
  }

  readLoop().catch((err) => console.error("[aloud] readLoop error:", err));
  return child;
}

async function onVoiceInput(text: string): Promise<void> {
  if (state.is(State.SPEAKING)) {
    console.error("[aloud] ignoring voice input while speaking");
    return;
  }
  state.transition(State.CAPTURING);

  try {
    await mcp.notification({
      method: "notifications/claude/channel",
      params: {
        content: text,
        meta: { source_type: "voice" },
      },
    } as any);
  } finally {
    // Always return to RUNNING so the wake word listener can fire again
    state.transition(State.RUNNING);
  }
}

// --- Start ---
await mcp.connect(new StdioServerTransport());
const kokoroChild = startKokoroServer();
const wakeWordChild = startWakeWordListener();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    kokoroChild.kill();
    wakeWordChild.kill();
    process.exit(0);
  });
}

console.error(`[aloud] ready — wake word: "${config.wakeword.phrase}"`);
