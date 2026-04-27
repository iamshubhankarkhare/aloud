#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { defaultConfigPath } from "./lib/config";

const configPath = defaultConfigPath(); // honors ALOUD_CONFIG_PATH env var
const configDir = `${homedir()}/.aloud`;

if (existsSync(configPath)) {
  console.log(`Config already exists at ${configPath}`);
  console.log("Delete it and re-run to reconfigure.");
  process.exit(0);
}

console.log("Aloud — ambient voice for Claude Code\n");

// Pre-read stdin lines for piped/non-TTY mode (Bun readline.question has a
// 2-call limit with piped stdin)
let stdinLines: string[] = [];
if (!process.stdin.isTTY) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  stdinLines = Buffer.concat(chunks).toString().split("\n");
}
let lineIdx = 0;

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string, defaultVal: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const answer = (stdinLines[lineIdx++] ?? "").trim();
    return Promise.resolve(answer || defaultVal);
  }
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultVal}]: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

const phrase = await prompt("Wake word phrase", "hey jarvis");
const voice = await prompt("TTS voice (kokoro)", "af_sky");
const model = await prompt("Whisper model (tiny.en / base.en / small.en)", "base.en");
const maxSentences = await prompt("Max sentences in spoken summary", "5");
rl.close();

const config = {
  wakeword: { phrase },
  stt: { model },
  tts: { voice },
  summarizer: { max_sentences: parseInt(maxSentences, 10) },
};

mkdirSync(configDir, { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`\nConfig saved to ${configPath}`);
console.log(`\nTo start:\n  ./aloud.sh\n`);
