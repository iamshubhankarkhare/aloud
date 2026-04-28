import type { AloudConfig } from "./config";
import type { TtsProvider } from "./tts";
import { loadConfig } from "./config";

type SamplingFn = (params: {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
  systemPrompt?: string;
  maxTokens?: number;
  modelPreferences?: {
    speedPriority?: number;
    costPriority?: number;
  };
}) => Promise<{ content: { type: string; text: string } }>;

export function createSpeakHandler(
  config: AloudConfig,
  sampling: SamplingFn,
  tts: TtsProvider
) {
  return async function handleSpeak(args: { text: string }): Promise<void> {
    const { text } = args;

    // Re-read config so /aloud:configure tts on/off takes effect without restart.
    const liveConfig = loadConfig();

    if (!liveConfig.runtime.tts_enabled) return;
    if (text.length < liveConfig.runtime.tts_min_chars) return;

    // Ask Claude Code to format for TTS via MCP sampling
    let summary = text;
    try {
      const result = await sampling({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Format this for spoken TTS output:\n\n${text}`,
            },
          },
        ],
        systemPrompt: liveConfig.summarizer.system_prompt,
        maxTokens: liveConfig.summarizer.max_tokens,
        modelPreferences: {
          speedPriority: 1.0,
          costPriority: 0.8,
        },
      });

      const formatted = result.content.text.trim();
      if (formatted) {
        summary = formatted;
      }
    } catch (err) {
      console.error("[aloud] sampling failed, using original text:", err);
    }

    await tts.speak(summary);
  };
}

export const SPEAK_TOOL_DEFINITION = {
  name: "speak",
  description:
    "Speak a response aloud to the user via local TTS. Pass your full response text — the tool internally summarizes it to one short sentence for spoken playback. No-ops silently when TTS is disabled by the user.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to speak. Will be summarized to a single short sentence and synthesized.",
      },
    },
    required: ["text"],
  },
} as const;
