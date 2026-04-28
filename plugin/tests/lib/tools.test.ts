import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync } from "fs";
import { createSpeakHandler } from "../../lib/tools";
import type { AloudConfig } from "../../lib/config";

const TEST_CONFIG_PATH = `/tmp/aloud-tools-test-${Date.now()}.json`;

function mockConfig(): AloudConfig {
  return {
    tts: { provider: "kokoro", voice: "af_sky", speed: 1.0, api_key: null, base_url: "http://localhost:8880", voice_id: null },
    summarizer: {
      system_prompt: "Summarize in one sentence.",
      max_sentences: 1,
      max_tokens: 80,
    },
    ports: { kokoro: 8880 },
    runtime: {
      sounds_enabled: true,
      tts_enabled: true,
      tts_volume: 0.5,
      tts_min_chars: 80,
      theme: "lofi",
    },
  };
}

function writeRuntime(overrides: Partial<AloudConfig["runtime"]>): string {
  const path = `/tmp/aloud-tools-test-${Date.now()}-${Math.random()}.json`;
  writeFileSync(path, JSON.stringify({ runtime: overrides }));
  process.env.ALOUD_CONFIG_PATH = path;
  return path;
}

afterEach(() => {
  delete process.env.ALOUD_CONFIG_PATH;
});

describe("createSpeakHandler", () => {
  it("calls sampling then TTS with formatted text when enabled", async () => {
    const path = writeRuntime({ tts_enabled: true, tts_min_chars: 10 });
    const samplingCalls: any[] = [];
    const ttsCalls: string[] = [];

    const mockSampling = mock(async (params: any) => {
      samplingCalls.push(params);
      return { content: { type: "text", text: "Task complete." } };
    });
    const mockTts = { speak: mock(async (text: string) => { ttsCalls.push(text); }) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "I updated 3 files and ran the tests. All passed." });

    expect(samplingCalls).toHaveLength(1);
    expect(ttsCalls).toHaveLength(1);
    expect(ttsCalls[0]).toBe("Task complete.");

    rmSync(path, { force: true });
  });

  it("falls back to original text if sampling returns empty", async () => {
    const path = writeRuntime({ tts_enabled: true, tts_min_chars: 10 });
    const ttsCalls: string[] = [];

    const mockSampling = mock(async () => ({
      content: { type: "text", text: "   " }
    }));
    const mockTts = { speak: mock(async (t: string) => { ttsCalls.push(t); }) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "original text long enough to pass min chars" });

    expect(ttsCalls[0]).toBe("original text long enough to pass min chars");

    rmSync(path, { force: true });
  });

  it("no-ops when tts_enabled is false", async () => {
    const path = writeRuntime({ tts_enabled: false });
    const mockSampling = mock(async () => ({ content: { type: "text", text: "summary" } }));
    const mockTts = { speak: mock(async () => {}) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "this is a long sentence that would normally be spoken aloud but TTS is off" });

    expect(mockSampling).not.toHaveBeenCalled();
    expect(mockTts.speak).not.toHaveBeenCalled();

    rmSync(path, { force: true });
  });

  it("no-ops when text shorter than tts_min_chars", async () => {
    const path = writeRuntime({ tts_enabled: true, tts_min_chars: 80 });
    const mockSampling = mock(async () => ({ content: { type: "text", text: "summary" } }));
    const mockTts = { speak: mock(async () => {}) };

    const handler = createSpeakHandler(mockConfig(), mockSampling as any, mockTts);
    await handler({ text: "OK" });

    expect(mockSampling).not.toHaveBeenCalled();
    expect(mockTts.speak).not.toHaveBeenCalled();

    rmSync(path, { force: true });
  });
});
