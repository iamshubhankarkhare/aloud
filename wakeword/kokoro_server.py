#!/usr/bin/env python3
"""
Minimal HTTP server wrapping kokoro-onnx.
Serves POST /v1/audio/speech (OpenAI-compatible).
Models auto-download to ~/.aloud/models/ on first run.
"""
import json
import os
import sys
import io
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
import soundfile as sf

MODELS_DIR = Path(os.environ.get("ALOUD_MODELS_DIR", Path.home() / ".aloud" / "models"))
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

SAMPLE_RATE = 24000


def ensure_models() -> tuple[str, str]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / "kokoro-v1.0.onnx"
    voices_path = MODELS_DIR / "voices-v1.0.bin"

    if not model_path.exists():
        print(f"[kokoro] downloading model to {model_path} ...", file=sys.stderr, flush=True)
        urlretrieve(MODEL_URL, model_path)
        print("[kokoro] model downloaded", file=sys.stderr, flush=True)

    if not voices_path.exists():
        print(f"[kokoro] downloading voices to {voices_path} ...", file=sys.stderr, flush=True)
        urlretrieve(VOICES_URL, voices_path)
        print("[kokoro] voices downloaded", file=sys.stderr, flush=True)

    return str(model_path), str(voices_path)


def make_handler(kokoro):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            print(f"[kokoro] {format % args}", file=sys.stderr, flush=True)

        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path != "/v1/audio/speech":
                self.send_error(404)
                return

            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))

            text = body.get("input", "")
            voice = body.get("voice", "af_sky")
            speed = float(body.get("speed", 1.0))

            if not text:
                self.send_error(400, "Missing 'input' field")
                return

            try:
                samples, sample_rate = kokoro.create(text, voice=voice, speed=speed)
            except Exception as e:
                print(f"[kokoro] synthesis error: {e}", file=sys.stderr, flush=True)
                self.send_error(500, str(e))
                return

            buf = io.BytesIO()
            sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
            wav_bytes = buf.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)

    return Handler


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8880)
    args = parser.parse_args()

    model_path, voices_path = ensure_models()

    print("[kokoro] loading model ...", file=sys.stderr, flush=True)
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(model_path, voices_path)
    print("[kokoro] ready", file=sys.stderr, flush=True)

    server = HTTPServer((args.host, args.port), make_handler(kokoro))
    print(f"[kokoro] listening on {args.host}:{args.port}", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
