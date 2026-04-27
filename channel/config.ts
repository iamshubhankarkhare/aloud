import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const VALID_STT_PROVIDERS = ["whisper-local", "openai", "openai-compatible"] as const;
const VALID_TTS_PROVIDERS = ["kokoro", "openai", "elevenlabs", "openai-compatible"] as const;

type SttProvider = typeof VALID_STT_PROVIDERS[number];
type TtsProvider = typeof VALID_TTS_PROVIDERS[number];

export interface AloudConfig {
  wakeword: {
    phrase: string;
    sensitivity: number;
    model: string;
  };
  stt: {
    provider: SttProvider;
    model: string;
    api_key: string | null;
    base_url: string | null;
  };
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
}

const DEFAULTS: AloudConfig = {
  wakeword: {
    phrase: "hey jarvis",
    sensitivity: 0.5,
    model: "openWakeWord/hey_jarvis.tflite",
  },
  stt: {
    provider: "whisper-local",
    model: "base.en",
    api_key: null,
    base_url: null,
  },
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
      "You are an ambient voice assistant. Summarize what was just done in {max_sentences} sentences. Be direct and casual. No markdown, no lists — spoken output only.",
    max_sentences: 5,
    max_tokens: 80,
  },
  ports: {
    kokoro: 8880,
  },
};

export function defaultConfigPath(): string {
  // ALOUD_CONFIG_PATH env var allows tests and CI to override without touching ~/.aloud
  return process.env.ALOUD_CONFIG_PATH ?? join(homedir(), ".aloud", "config.json");
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

  // Validate providers
  if (!VALID_TTS_PROVIDERS.includes(merged.tts.provider)) {
    throw new Error(`Unknown TTS provider: ${merged.tts.provider}. Valid: ${VALID_TTS_PROVIDERS.join(", ")}`);
  }
  if (!VALID_STT_PROVIDERS.includes(merged.stt.provider)) {
    throw new Error(`Unknown STT provider: ${merged.stt.provider}. Valid: ${VALID_STT_PROVIDERS.join(", ")}`);
  }

  // Substitute {max_sentences} in system_prompt
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
