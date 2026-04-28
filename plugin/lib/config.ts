import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const VALID_TTS_PROVIDERS = ["kokoro", "openai", "elevenlabs", "openai-compatible"] as const;

type TtsProvider = typeof VALID_TTS_PROVIDERS[number];

export interface AloudConfig {
  tts: {
    provider: TtsProvider;
    voice: string;
    speed: number;
    api_key: string | null;
    base_url: string;
    voice_id: string | null;
  };
  summarizer: {
    system_prompt: string;
    max_sentences: number;
    max_tokens: number;
  };
  ports: {
    kokoro: number;
  };
  runtime: {
    sounds_enabled: boolean;
    tts_enabled: boolean;
    tts_volume: number;
    tts_min_chars: number;
    theme: string;
  };
}

const DEFAULTS: AloudConfig = {
  tts: {
    provider: "kokoro",
    voice: "af_sky",
    speed: 1.0,
    api_key: null,
    base_url: "http://localhost:8880",
    voice_id: null,
  },
  summarizer: {
    system_prompt:
      "You are summarizing for spoken playback. Output ONE sentence (max 15 words), conversational tone, no markdown, no code, no lists. Capture the essence of what was just done or said.",
    max_sentences: 1,
    max_tokens: 80,
  },
  ports: {
    kokoro: 8880,
  },
  runtime: {
    sounds_enabled: true,
    tts_enabled: false,
    tts_volume: 0.5,
    tts_min_chars: 80,
    theme: "lofi",
  },
};

export function defaultConfigPath(): string {
  return process.env.ALOUD_CONFIG_PATH ?? join(homedir(), ".claude", "channels", "aloud", "config.json");
}

export function loadConfig(configPath = defaultConfigPath()): AloudConfig {
  let userConfig: Partial<AloudConfig> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      userConfig = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(`Invalid JSON in ${configPath}: ${err.message}`);
    }
  }

  const merged = deepMerge(DEFAULTS, userConfig) as AloudConfig;

  if (!VALID_TTS_PROVIDERS.includes(merged.tts.provider)) {
    throw new Error(`Unknown TTS provider: ${merged.tts.provider}. Valid: ${VALID_TTS_PROVIDERS.join(", ")}`);
  }

  merged.summarizer.system_prompt = merged.summarizer.system_prompt.replaceAll(
    "{max_sentences}",
    String(merged.summarizer.max_sentences)
  );

  return merged;
}

function deepMerge(defaults: any, overrides: any): any {
  const result = structuredClone(defaults);
  for (const key of Object.keys(overrides ?? {})) {
    if (overrides[key] !== null && typeof overrides[key] === "object" && !Array.isArray(overrides[key])) {
      result[key] = deepMerge(result[key] ?? {}, overrides[key]);
    } else if (overrides[key] !== undefined) {
      result[key] = overrides[key];
    }
  }
  return result;
}
