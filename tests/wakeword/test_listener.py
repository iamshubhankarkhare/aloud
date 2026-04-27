import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../wakeword"))

import pytest
from unittest.mock import patch, MagicMock
from listener import format_result, WakeWordListener

def test_format_result_valid_json():
    line = format_result("hello world", confidence=0.92)
    parsed = json.loads(line)
    assert parsed["text"] == "hello world"
    assert parsed["confidence"] == 0.92
    assert "timestamp" in parsed

def test_format_result_strips_whitespace():
    line = format_result("  hello   ", confidence=0.8)
    parsed = json.loads(line)
    assert parsed["text"] == "hello"

def test_format_result_empty_text_raises():
    with pytest.raises(ValueError, match="empty"):
        format_result("", confidence=0.9)

def test_wakeword_listener_init_reads_config():
    config = {
        "wakeword": {"phrase": "hey forge", "sensitivity": 0.7, "model": "fake.tflite"},
        "stt": {"provider": "whisper-local", "model": "tiny.en", "api_key": None, "base_url": None},
    }
    with patch("listener.WakeWordModel") as mock_oww, \
         patch("listener.WhisperModel") as mock_whisper:
        listener = WakeWordListener(config)
        assert listener.phrase == "hey forge"
        assert listener.sensitivity == 0.7
