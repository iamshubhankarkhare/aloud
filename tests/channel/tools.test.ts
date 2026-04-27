import { describe, it, expect, mock } from "bun:test";
import { createSpeakHandler } from "../../channel/tools";
import type { AloudConfig } from "../../channel/config";

function mockConfig(): AloudConfig {
  return {
    wakeword: { phrase: "hey jarvis", sensitivity: 0.5, model: "" },
    stt: { provider: "whisper-local", model: "base.en", api_key: null, base_url: null },
    tts: { provider: "kokoro", voice: "af_sky", speed: 1.0, api_key: null, base_url: "http://localhost:8880", voice_id: null },
    summarizer: {
      system_prompt: "Summarize in 5 sentences. Spoken only.",
      max_sentences: 5,
      max_tokens: 80,
    },
    ports: { kokoro: 8880 },
  };
}

describe("createSpeakHandler", () => {
  it("calls sampling then TTS with formatted text", async () => {
    const samplingCalls: any[] = [];
    const ttsCalls: string[] = [];

    const mockSampling = mock(async (params: any) => {
      samplingCalls.push(params);
      return { content: { type: "text", text: "Task complete. Files updated." } };
    });

    const mockTts = { speak: mock(async (text: string) => { ttsCalls.push(text); }) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "I updated 3 files and ran the tests. All passed." });

    expect(samplingCalls).toHaveLength(1);
    expect(samplingCalls[0].messages[0].content.text).toContain("I updated 3 files");
    expect(samplingCalls[0].systemPrompt).toBe("Summarize in 5 sentences. Spoken only.");
    expect(samplingCalls[0].maxTokens).toBe(80);

    expect(ttsCalls).toHaveLength(1);
    expect(ttsCalls[0]).toBe("Task complete. Files updated.");
  });

  it("falls back to original text if sampling returns empty", async () => {
    const ttsCalls: string[] = [];

    const mockSampling = mock(async () => ({
      content: { type: "text", text: "   " }
    }));
    const mockTts = { speak: mock(async (t: string) => { ttsCalls.push(t); }) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "original text" });

    expect(ttsCalls[0]).toBe("original text");
  });
});
