import type { AloudConfig } from "./config";
import type { TtsProvider } from "./tts";

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
        systemPrompt: config.summarizer.system_prompt,
        maxTokens: config.summarizer.max_tokens,
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
      // sampling failed — speak original text
      console.error("[aloud] sampling failed, using original text:", err);
    }

    await tts.speak(summary);
  };
}

export const SPEAK_TOOL_DEFINITION = {
  name: "speak",
  description:
    "Speak a response aloud to the user via TTS. Call this when responding to a voice-initiated message, when a long task completes, or when you need user input. Do NOT call for routine tool use.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to speak. Will be summarized and formatted for TTS.",
      },
    },
    required: ["text"],
  },
} as const;
