#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { defaultConfigPath } from "./channel/config";

const configPath = defaultConfigPath(); // honors ALOUD_CONFIG_PATH env var
const configDir = `${homedir()}/.aloud`;

if (existsSync(configPath)) {
  console.log(`Config already exists at ${configPath}`);
  console.log("Delete it and re-run to reconfigure.");
  process.exit(0);
}

console.log("Aloud — ambient voice for Claude Code\n");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string, defaultVal: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultVal}]: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

const phrase = await prompt("Wake word phrase", "hey jarvis");
const sensitivity = await prompt("Wake word sensitivity (0-1)", "0.5");
const sttModel = await prompt("Whisper model (tiny.en / base.en / small.en)", "base.en");
const ttsVoice = await prompt("TTS voice (af_sky / af_bella / etc)", "af_sky");
const ttsSpeed = await prompt("TTS speed (0.5-2.0)", "1.0");
const maxSentences = await prompt("Max sentences in spoken summary", "5");
const maxTokens = await prompt("Max tokens for summary", "80");
rl.close();

const config = {
  wakeword: {
    phrase,
    sensitivity: parseFloat(sensitivity),
    model: "openWakeWord/hey_jarvis.tflite",
  },
  stt: {
    provider: "whisper-local",
    model: sttModel,
    api_key: null,
    base_url: null,
  },
  tts: {
    provider: "kokoro",
    voice: ttsVoice,
    speed: parseFloat(ttsSpeed),
    api_key: null,
    base_url: "http://localhost:8880",
    voice_id: null,
  },
  summarizer: {
    system_prompt:
      "You are an ambient voice assistant. Summarize what was just done in {max_sentences} sentences. Be direct and casual. No markdown, no lists — spoken output only.",
    max_sentences: parseInt(maxSentences, 10),
    max_tokens: parseInt(maxTokens, 10),
  },
  ports: {
    kokoro: 8880,
  },
};

mkdirSync(configDir, { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`\nConfig saved to ${configPath}`);
console.log(`\nTo start:\n  ./aloud.sh\n`);
