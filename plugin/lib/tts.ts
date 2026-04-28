import type { AloudConfig } from "./config";

export interface TtsProvider {
  speak(text: string): Promise<void>;
}

type FetchFn = typeof fetch;
type PlayAudioFn = (buffer: ArrayBuffer) => Promise<void>;

export function createTtsProvider(
  config: AloudConfig["tts"],
  fetchFn: FetchFn = fetch,
  playFn: PlayAudioFn = playAudio
): TtsProvider {
  switch (config.provider) {
    case "kokoro":
      return new KokoroProvider(config, fetchFn, playFn);
    case "openai":
    case "openai-compatible":
    case "elevenlabs":
      throw new Error(`TTS provider not yet implemented: ${config.provider}`);
    default:
      throw new Error(`Unknown TTS provider: ${(config as any).provider}`);
  }
}

class KokoroProvider implements TtsProvider {
  constructor(
    private config: AloudConfig["tts"],
    private fetchFn: FetchFn,
    private playFn: PlayAudioFn
  ) {}

  async speak(text: string): Promise<void> {
    const res = await this.fetchFn(`${this.config.base_url}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: text,
        voice: this.config.voice_id ?? this.config.voice,
        response_format: "wav",
        speed: this.config.speed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Kokoro TTS failed: ${res.status} ${res.statusText}`);
    }

    const audioBuffer = await res.arrayBuffer();
    await this.playFn(audioBuffer);
  }
}

async function playAudio(buffer: ArrayBuffer): Promise<void> {
  // Write to temp file and play with afplay (macOS) or aplay (Linux)
  const tmp = `/tmp/aloud-tts-${Date.now()}.wav`;
  await Bun.write(tmp, buffer);
  const cmd =
    process.platform === "darwin"
      ? Bun.spawnSync(["afplay", tmp])
      : Bun.spawnSync(["aplay", tmp]);
  Bun.spawnSync(["rm", "-f", tmp]);
  if (cmd.exitCode !== 0) {
    throw new Error(`Audio playback failed: exit ${cmd.exitCode}`);
  }
}
