"""
Qwen3-TTS via qwentts.cpp (GGML) — GPU acceleration without CUDA.

Runs the same Qwen3-TTS Base checkpoints as the ``qwen`` engine, but through
the C++/GGML port's ``tts-server`` instead of PyTorch. GGML picks the GPU API
per platform: Vulkan on Windows/Linux (AMD, Intel, NVIDIA — including
integrated Radeon GPUs that PyTorch can only run on CPU), Metal on macOS.

The server is a child process that keeps the model resident; this backend
speaks its HTTP API (``/v1/audio/voices`` to register a reference clip,
``/v1/audio/speech`` to synthesise). Weights are GGUF files fetched from
``Serveurperso/Qwen3-TTS-GGUF``.

Locating ``tts-server``: ``VOICEBOX_QWENTTS_DIR`` (directory with the binary),
then ``<data dir>/qwentts``, then next to the frozen server executable.

Tuning lives in ``<data dir>/qwen_cpp.json`` (all keys optional)::

    {"talker_precision": "Q8_0" | "BF16", "codec_precision": "Q8_0" | "F32",
     "device": "auto" | "Vulkan0" | "MTL0" | "CPU",
     "temperature": 0.9, "top_k": 50, "top_p": 1.0, "repetition_penalty": 1.05,
     "subtalker_temperature": 0.9, "subtalker_top_k": 50}
"""

import asyncio
import atexit
import base64
import hashlib
import io
import json
import logging
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

from . import LANGUAGE_CODE_TO_NAME
from .base import combine_voice_prompts as _combine_voice_prompts, is_model_cached, model_load_progress
from ..utils.cache import cache_voice_prompt, get_cache_key, get_cached_voice_prompt

logger = logging.getLogger(__name__)

QWENTTS_HF_REPO = "Serveurperso/Qwen3-TTS-GGUF"

# Qwen library defaults (generation_config.json of the Base checkpoints).
DEFAULT_SETTINGS = {
    "talker_precision": "Q8_0",
    "codec_precision": "Q8_0",
    "device": "auto",
    "temperature": 0.9,
    "top_k": 50,
    "top_p": 1.0,
    "repetition_penalty": 1.05,
    "subtalker_temperature": 0.9,
    "subtalker_top_k": 50,
}
SAMPLING_KEYS = ("temperature", "top_k", "top_p", "repetition_penalty", "subtalker_temperature", "subtalker_top_k")


def load_settings() -> dict:
    """Defaults merged with ``<data dir>/qwen_cpp.json``."""
    from ..config import get_data_dir

    settings = dict(DEFAULT_SETTINGS)
    path = get_data_dir() / "qwen_cpp.json"
    if path.exists():
        try:
            settings.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError) as e:
            logger.warning("Ignoring unreadable %s: %s", path, e)
    return settings


def save_settings(patch: dict) -> dict:
    from ..config import get_data_dir

    current = load_settings()
    current.update({k: v for k, v in patch.items() if k in DEFAULT_SETTINGS and v is not None})
    path = get_data_dir() / "qwen_cpp.json"
    path.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current


def model_files(model_size: str, settings: Optional[dict] = None) -> tuple[str, str]:
    """GGUF file names (talker, codec) for a model size and the chosen precision."""
    settings = settings or load_settings()
    size = "1.7b" if model_size == "1.7B" else "0.6b"
    return (
        f"qwen-talker-{size}-base-{settings['talker_precision']}.gguf",
        f"qwen-tokenizer-12hz-{settings['codec_precision']}.gguf",
    )


def find_server_binary() -> Optional[Path]:
    from ..config import get_data_dir

    name = "tts-server.exe" if sys.platform == "win32" else "tts-server"
    candidates = []
    if os.environ.get("VOICEBOX_QWENTTS_DIR"):
        candidates.append(Path(os.environ["VOICEBOX_QWENTTS_DIR"]))
    candidates.append(get_data_dir() / "qwentts")
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).parent / "qwentts")
    for folder in candidates:
        for sub in ("", "bin", "Release", "build/Release", "build/bin"):
            exe = folder / sub / name
            if exe.exists():
                return exe
    found = shutil.which(name)
    return Path(found) if found else None


def detect_device() -> str:
    """GGML device name: Metal on Apple Silicon, Vulkan if a Vulkan GPU exists, else CPU."""
    if platform.system() == "Darwin":
        return "MTL0"
    try:
        out = subprocess.run(["vulkaninfo", "--summary"], capture_output=True, text=True, timeout=20,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if "deviceName" in out.stdout:
            return "Vulkan0"
    except (OSError, subprocess.SubprocessError):
        pass
    # The Vulkan loader ships with every current AMD/Intel/NVIDIA Windows driver even
    # without the SDK's vulkaninfo; let the server try and fall back on failure.
    if sys.platform == "win32" and Path(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "vulkan-1.dll").exists():
        return "Vulkan0"
    return "CPU"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QwenCppTTSBackend:
    """Qwen3-TTS Base (voice cloning) served by qwentts.cpp."""

    def __init__(self):
        self.proc: Optional[subprocess.Popen] = None
        self.url: Optional[str] = None
        self.model_size: Optional[str] = None
        self._current_model_size: Optional[str] = None
        self.device_name: Optional[str] = None
        self._loaded_files: Optional[tuple[str, str]] = None
        self._voices: set[str] = set()
        self._lock = threading.Lock()
        atexit.register(self.unload_model)

    # ---- model management -------------------------------------------------
    def is_loaded(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def _get_model_path(self, model_size: str = "1.7B") -> str:
        return QWENTTS_HF_REPO

    def _is_model_cached(self, model_size: str = "1.7B") -> bool:
        return is_model_cached(QWENTTS_HF_REPO, required_files=list(model_files(model_size)))

    async def load_model(self, model_size: str = "1.7B") -> None:
        model_size = model_size if model_size in ("1.7B", "0.6B") else "1.7B"
        files = model_files(model_size)
        if self.is_loaded() and self._loaded_files == files:
            return
        await asyncio.to_thread(self._load_model_sync, model_size, files)

    def _load_model_sync(self, model_size: str, files: tuple[str, str]) -> None:
        from huggingface_hub import hf_hub_download

        with self._lock:
            if self.is_loaded() and self._loaded_files == files:
                return
            self.unload_model()

            exe = find_server_binary()
            if exe is None:
                raise RuntimeError(
                    "qwentts.cpp tts-server not found. Build it (see docs) and set VOICEBOX_QWENTTS_DIR "
                    "or copy it to the 'qwentts' folder in the Voicebox data directory."
                )

            model_name = f"qwen-cpp-{model_size}"
            with model_load_progress(model_name, self._is_model_cached(model_size)):
                talker = hf_hub_download(QWENTTS_HF_REPO, files[0])
                codec = hf_hub_download(QWENTTS_HF_REPO, files[1])

            settings = load_settings()
            device = settings["device"] if settings["device"] != "auto" else detect_device()
            for attempt_device in dict.fromkeys([device, "CPU"]):
                port = _free_port()
                cmd = [str(exe), "--model", talker, "--codec", codec, "--device", attempt_device,
                       "--port", str(port), "--lang", "auto"]
                logger.info("Starting qwentts.cpp: %s", " ".join(cmd))
                log_path = Path(talker).parent / "tts-server.log"
                log = open(log_path, "w", encoding="utf-8", errors="replace")
                self.proc = subprocess.Popen(
                    cmd, stdout=log, stderr=subprocess.STDOUT, cwd=str(exe.parent),
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                self.url = f"http://127.0.0.1:{port}"
                if self._wait_ready(timeout=300):
                    break
                logger.warning("qwentts.cpp failed on %s (log: %s)", attempt_device, log_path)
                self.unload_model()
            else:
                raise RuntimeError("qwentts.cpp tts-server did not start (see tts-server.log in the HF cache).")

            self.device_name = attempt_device
            self.model_size = self._current_model_size = model_size
            self._loaded_files = files
            self._voices.clear()
            logger.info("qwentts.cpp ready on %s (%s, %s)", attempt_device, *files)

    def _wait_ready(self, timeout: float) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc is None or self.proc.poll() is not None:
                return False
            try:
                with urllib.request.urlopen(self.url + "/health", timeout=2):
                    return True
            except (urllib.error.URLError, OSError):
                time.sleep(0.5)
        return False

    def unload_model(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None
        self._loaded_files = None
        self._voices.clear()

    # ---- HTTP -------------------------------------------------------------
    def _post(self, path: str, payload: dict, timeout: float = 900) -> bytes:
        req = urllib.request.Request(
            self.url + path, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"qwentts.cpp error {e.code}: {e.read().decode('utf-8', 'replace')}") from e

    # ---- voice prompts ----------------------------------------------------
    async def create_voice_prompt(self, audio_path: str, reference_text: str, use_cache: bool = True) -> Tuple[dict, bool]:
        """The prompt is just a reference to the clip; the server encodes it on first use."""
        cache_key = ("qwencpp_" + get_cache_key(audio_path, reference_text)) if use_cache else None
        if cache_key:
            cached = get_cached_voice_prompt(cache_key)
            if isinstance(cached, dict) and Path(cached.get("audio_path", "")).exists():
                return cached, True
        digest = hashlib.sha1(Path(audio_path).read_bytes() + reference_text.encode("utf-8")).hexdigest()[:16]
        prompt = {"voice": f"vb_{digest}", "audio_path": str(audio_path), "reference_text": reference_text}
        if cache_key:
            cache_voice_prompt(cache_key, prompt)
        return prompt, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=24000)

    def _ensure_voice(self, prompt: dict) -> None:
        if prompt["voice"] in self._voices:
            return
        payload = {"name": prompt["voice"], "wav_b64": base64.b64encode(Path(prompt["audio_path"]).read_bytes()).decode("ascii")}
        if prompt.get("reference_text", "").strip():
            payload["ref_text"] = prompt["reference_text"].strip()
        self._post("/v1/audio/voices", payload, timeout=300)
        self._voices.add(prompt["voice"])

    # ---- synthesis --------------------------------------------------------
    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
    ) -> Tuple[np.ndarray, int]:
        await self.load_model(self.model_size or "1.7B")

        def _generate_sync():
            with self._lock:
                self._ensure_voice(voice_prompt)
                settings = load_settings()
                payload = {"input": text, "voice": voice_prompt["voice"],
                           "language": LANGUAGE_CODE_TO_NAME.get(language, "auto"), "response_format": "wav"}
                payload.update({k: settings[k] for k in SAMPLING_KEYS})
                if seed is not None:
                    payload["seed"] = int(seed)
                raw = self._post("/v1/audio/speech", payload)
            with wave.open(io.BytesIO(raw)) as w:
                sr, width, channels = w.getframerate(), w.getsampwidth(), w.getnchannels()
                frames = w.readframes(w.getnframes())
            if width != 2:
                raise RuntimeError(f"Unexpected WAV sample width from qwentts.cpp: {width * 8} bit")
            audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
            if channels > 1:
                audio = audio.reshape(-1, channels).mean(axis=1)
            return audio, sr

        return await asyncio.to_thread(_generate_sync)
