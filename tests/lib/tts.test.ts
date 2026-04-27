import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createTtsProvider, type TtsProvider } from "../../lib/tts";
import type { AloudConfig } from "../../lib/config";

function kokoroConfig(overrides: Partial<AloudConfig["tts"]> = {}): AloudConfig["tts"] {
  return {
    provider: "kokoro",
    voice: "af_sky",
    speed: 1.0,
    api_key: null,
    base_url: "http://localhost:8880",
    voice_id: null,
    ...overrides,
  };
}

describe("createTtsProvider", () => {
  it("creates a kokoro provider", () => {
    const provider = createTtsProvider(kokoroConfig());
    expect(provider).toBeDefined();
  });

  it("kokoro provider calls /v1/audio/speech with OpenAI-compatible body", async () => {
    const fetched: { url: string; body: any }[] = [];
    const fakeFetch = mock(async (url: string, opts: any) => {
      fetched.push({ url, body: JSON.parse(opts.body) });
      return new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { "Content-Type": "audio/wav" },
      });
    });
    const fakePlay = mock(async (_buf: ArrayBuffer) => {});

    const provider = createTtsProvider(kokoroConfig(), fakeFetch as any, fakePlay);
    await provider.speak("hello world");

    expect(fetched).toHaveLength(1);
    expect(fetched[0].url).toBe("http://localhost:8880/v1/audio/speech");
    expect(fetched[0].body.model).toBe("kokoro");
    expect(fetched[0].body.input).toBe("hello world");
    expect(fetched[0].body.voice).toBe("af_sky");
    expect(fetched[0].body.response_format).toBe("wav");
    expect(fetched[0].body.speed).toBe(1.0);
  });

  it("throws on unsupported provider at runtime", () => {
    expect(() =>
      createTtsProvider({ ...kokoroConfig(), provider: "elevenlabs" as any })
    ).toThrow("TTS provider not yet implemented: elevenlabs");
  });
});
