import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { loadConfig } from "../../lib/config";

const TEST_CONFIG_DIR = "/tmp/aloud-test-config";
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, "config.json");

beforeEach(() => {
  mkdirSync(TEST_CONFIG_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when config file does not exist", () => {
    const config = loadConfig("/tmp/nonexistent-aloud-99999/config.json");
    expect(config.tts.provider).toBe("kokoro");
    expect(config.tts.voice).toBe("af_sky");
    expect(config.summarizer.max_sentences).toBe(1);
    expect(config.runtime.sounds_enabled).toBe(true);
    expect(config.runtime.tts_enabled).toBe(false);
    expect(config.runtime.tts_volume).toBe(0.5);
    expect(config.runtime.tts_min_chars).toBe(80);
    expect(config.runtime.theme).toBe("lofi");
  });

  it("merges user config over defaults", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      tts: { voice: "af_bella" }
    }));
    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.tts.voice).toBe("af_bella");
    expect(config.tts.provider).toBe("kokoro"); // default preserved
  });

  it("throws on invalid provider value", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      tts: { provider: "unsupported-provider" }
    }));
    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow("Unknown TTS provider");
  });

  it("substitutes {max_sentences} in system_prompt", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      summarizer: { system_prompt: "Speak in {max_sentences} sentences.", max_sentences: 3 }
    }));
    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.summarizer.system_prompt).toContain("3");
    expect(config.summarizer.system_prompt).not.toContain("{max_sentences}");
  });

  it("merges runtime overrides", async () => {
    const tmp = `/tmp/aloud-config-runtime-${Date.now()}.json`;
    await Bun.write(tmp, JSON.stringify({ runtime: { tts_enabled: true } }));
    const config = loadConfig(tmp);
    expect(config.runtime.tts_enabled).toBe(true);
    expect(config.runtime.sounds_enabled).toBe(true); // default preserved
    expect(config.runtime.tts_volume).toBe(0.5);
  });
});
