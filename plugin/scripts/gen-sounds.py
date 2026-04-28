#!/usr/bin/env python3
"""Generate baseline lo-fi sound effects for Aloud v1.

Each sound is short (~120-250ms), soft, distinguishable. Output: 9
WAVs at plugin/sounds/lofi/*.wav, mono 22050 Hz.

Procedurally generated so they're CC0 — no copyrighted samples.
Replaceable later with curated packs.
"""
import numpy as np
import soundfile as sf
from pathlib import Path

SR = 22050
OUT_DIR = Path(__file__).parent.parent / "sounds" / "lofi"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def envelope(n: int, attack: float = 0.02, release: float = 0.5) -> np.ndarray:
    a = max(1, int(SR * attack))
    r = max(1, int(SR * release))
    s = max(0, n - a - r)
    return np.concatenate([
        np.linspace(0.0, 1.0, a),
        np.ones(s),
        np.linspace(1.0, 0.0, r),
    ])[:n]


def tone(freq: float, dur: float, harmonics=(1.0, 0.3, 0.1), noise: float = 0.005,
         attack: float = 0.02, release: float = 0.5) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    wave = sum(amp * np.sin(2 * np.pi * freq * h * t) for h, amp in zip([1, 2, 3], harmonics))
    wave = wave * envelope(n, attack=attack, release=release)
    if noise > 0:
        wave += noise * np.random.randn(n)
    peak = max(np.abs(wave).max(), 1e-6)
    return (wave / peak * 0.6).astype(np.float32)


def write(name: str, samples: np.ndarray) -> None:
    sf.write(OUT_DIR / f"{name}.wav", samples, SR)
    print(f"  wrote {name}.wav ({len(samples)/SR*1000:.0f}ms)")


# scan: soft high blip — Read/Grep/Glob/LS
write("scan", tone(880, 0.12))

# type: short medium pop — Edit/Write/MultiEdit
write("type", tone(660, 0.08, harmonics=(1.0, 0.2, 0.0)))

# term: low click — Bash
write("term", tone(440, 0.06, harmonics=(1.0, 0.5, 0.2)))

# web: rising swoosh — WebFetch/WebSearch
n = int(SR * 0.15)
t = np.arange(n) / SR
swoosh = np.sin(2 * np.pi * (440 + 200 * t) * t) * envelope(n, attack=0.05, release=0.3)
write("web", (swoosh / max(np.abs(swoosh).max(), 1e-6) * 0.6).astype(np.float32))

# agent: distinct two-tone — Task (subagent)
n = int(SR * 0.18)
t = np.arange(n) / SR
half = n // 2
agent = np.zeros(n)
agent[:half] = np.sin(2 * np.pi * 587 * t[:half]) * envelope(half, attack=0.02, release=0.05)
agent[half:] = np.sin(2 * np.pi * 880 * t[half:]) * envelope(n - half, attack=0.02, release=0.4)
write("agent", (agent / max(np.abs(agent).max(), 1e-6) * 0.6).astype(np.float32))

# permission: ascending alert — Notification
n = int(SR * 0.25)
t = np.arange(n) / SR
perm = np.sin(2 * np.pi * (440 + 600 * t) * t) * envelope(n, attack=0.03, release=0.4)
write("permission", (perm / max(np.abs(perm).max(), 1e-6) * 0.7).astype(np.float32))

# welcome: soft chord — SessionStart
n = int(SR * 0.4)
t = np.arange(n) / SR
chord = (np.sin(2 * np.pi * 523 * t) + np.sin(2 * np.pi * 659 * t) + np.sin(2 * np.pi * 784 * t)) / 3
chord = chord * envelope(n, attack=0.05, release=0.7)
write("welcome", (chord / max(np.abs(chord).max(), 1e-6) * 0.5).astype(np.float32))

# done: soft confirm — Stop (turn end)
write("done", tone(523, 0.15, harmonics=(1.0, 0.4, 0.15)))

# error: descending low — failures
n = int(SR * 0.2)
t = np.arange(n) / SR
err = np.sin(2 * np.pi * (440 - 200 * t) * t) * envelope(n, attack=0.02, release=0.5)
write("error", (err / max(np.abs(err).max(), 1e-6) * 0.6).astype(np.float32))

print(f"Done. 9 sounds in {OUT_DIR}")
