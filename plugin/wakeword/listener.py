import json
import os
import sys
import queue
import numpy as np
import sounddevice as sd
import webrtcvad
import openwakeword.utils
from openwakeword.model import Model as WakeWordModel
from faster_whisper import WhisperModel
from datetime import datetime, timezone
from typing import Any

DEBUG = os.environ.get("ALOUD_DEBUG") == "1"

SAMPLE_RATE = 16000
CHUNK_MS = 30          # webrtcvad requires 10/20/30ms chunks
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_MS / 1000)
WAKE_WORD_WINDOW = 1280  # openwakeword expects 80ms (1280 samples) per predict
SILENCE_LIMIT_MS = 800 # stop recording after 800ms of silence
VAD_AGGRESSIVENESS = 3  # 0-3, higher = more aggressive filtering


def format_result(text: str, confidence: float) -> str:
    text = text.strip()
    if not text:
        raise ValueError("Cannot format empty transcription result")
    payload = {
        "text": text,
        "confidence": round(confidence, 3),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(payload)


class WakeWordListener:
    def __init__(self, config: dict[str, Any]):
        ww_cfg = config["wakeword"]
        stt_cfg = config["stt"]

        self.phrase = ww_cfg["phrase"]
        self.sensitivity = ww_cfg.get("sensitivity", 0.5)

        # Wake word model — download bundled models on first run
        openwakeword.utils.download_models()
        self.wakeword_model = WakeWordModel(
            wakeword_models=[ww_cfg.get("model", "hey_jarvis")],
            inference_framework="onnx",
        )
        print(
            f"[aloud] wake word models loaded: {list(self.wakeword_model.models.keys())}",
            file=sys.stderr,
            flush=True,
        )

        # Whisper STT
        self.whisper = WhisperModel(
            stt_cfg.get("model", "base.en"),
            device="cpu",
            compute_type="int8",
        )

        self.vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
        self._audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self._running = False

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info: Any, status: Any) -> None:
        if status:
            print(f"[aloud] audio status: {status}", file=sys.stderr)
        self._audio_queue.put(indata.copy())

    def _record_until_silence(self) -> np.ndarray:
        chunks: list[np.ndarray] = []
        silence_chunks = 0
        silence_limit = int(SILENCE_LIMIT_MS / CHUNK_MS)

        while True:
            try:
                chunk = self._audio_queue.get(timeout=2.0)
            except queue.Empty:
                break

            pcm = (chunk[:, 0] * 32767).astype(np.int16)
            chunks.append(pcm)

            is_speech = self.vad.is_speech(pcm.tobytes(), SAMPLE_RATE)
            if is_speech:
                silence_chunks = 0
            else:
                silence_chunks += 1
                if silence_chunks >= silence_limit and len(chunks) > 5:
                    break

        return np.concatenate(chunks) if chunks else np.array([], dtype=np.int16)

    def run(self) -> None:
        self._running = True
        buffer = np.array([], dtype=np.float32)
        windows_processed = 0
        max_confidence_window = 0.0
        max_peak_window = 0.0

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=CHUNK_SAMPLES,
            callback=self._audio_callback,
        ):
            print(f"[aloud] listening for wake word: {self.phrase!r}", file=sys.stderr)
            print(f"[aloud] debug heartbeat enabled — speak and watch the levels", file=sys.stderr, flush=True)
            while self._running:
                try:
                    chunk = self._audio_queue.get(timeout=0.5)
                except queue.Empty:
                    continue

                buffer = np.append(buffer, chunk[:, 0])
                peak = float(np.abs(chunk).max())
                if peak > max_peak_window:
                    max_peak_window = peak

                # Feed 80ms (1280-sample) windows to openwakeword.
                # Scale float32 ([-1.0, 1.0]) to int16 range and pass int16 array.
                # Advance by full window each predict (no overlap) — openwakeword
                # buffers internally and produces a confidence per frame.
                while len(buffer) >= WAKE_WORD_WINDOW:
                    window = (buffer[:WAKE_WORD_WINDOW] * 32767).astype(np.int16)
                    buffer = buffer[WAKE_WORD_WINDOW:]

                    predictions = self.wakeword_model.predict(window)
                    confidence = max(predictions.values(), default=0.0)
                    if confidence > max_confidence_window:
                        max_confidence_window = confidence
                    windows_processed += 1

                    # Heartbeat: print mic peak + per-model confidence every ~1s
                    # (12 windows × 80ms ≈ 1s).
                    if windows_processed % 12 == 0:
                        preds_str = " ".join(
                            f"{k}={v:.3f}" for k, v in predictions.items()
                        )
                        print(
                            f"[aloud] heartbeat peak={max_peak_window:.4f} "
                            f"max_conf={max_confidence_window:.3f} | {preds_str}",
                            file=sys.stderr,
                            flush=True,
                        )
                        max_peak_window = 0.0
                        max_confidence_window = 0.0

                    if confidence >= self.sensitivity:
                        print(f"[aloud] wake word detected ({confidence:.2f})", file=sys.stderr)
                        # Drain buffer and record until silence
                        while not self._audio_queue.empty():
                            self._audio_queue.get_nowait()

                        audio = self._record_until_silence()
                        if len(audio) < SAMPLE_RATE * 0.3:  # less than 300ms, skip
                            continue

                        segments, _ = self.whisper.transcribe(
                            audio.astype(np.float32) / 32768.0,
                            language="en",
                        )
                        text = " ".join(s.text for s in segments).strip()
                        if text:
                            result = format_result(text, confidence)
                            print(result, flush=True)  # stdout → Bun reads this

                        buffer = np.array([], dtype=np.float32)


def main() -> None:
    import json as json_module
    import signal
    raw = sys.stdin.read()
    config = json_module.loads(raw) if raw.strip() else {}

    listener = WakeWordListener(config)

    def _stop(_signum, _frame):
        listener._running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    try:
        listener.run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
