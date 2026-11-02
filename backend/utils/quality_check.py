"""
Whisper quality check per generated chunk.

After each chunk the audio is transcribed with faster-whisper (``small``,
int8 on the CPU: about 0.1× real time) and compared word by word with the
text that was sent to the model. When words are missing or extra words were
added (dropouts, stumbles, runaway babble), the chunk is generated again with
another seed and the attempt with the fewest errors is kept.

Whisper runs in a separate worker process: CTranslate2 ships Intel's OpenMP
runtime and PyTorch on Windows ships LLVM's, and loading both into one
process aborts or hangs it ("OMP: Error #15"). The server process therefore
never imports faster-whisper; it only downloads the model files.

Both sides go through the same spoken-form rewrite (``text_prep``) before the
comparison, so "10.000 Franken" heard by Whisper matches "zehntausend Franken"
sent to the model, and pronunciation-dictionary entries match their written
form.

Settings live in ``<data dir>/quality_check.json`` (all keys optional)::

    {"enabled": true, "max_wer": 0.1, "max_attempts": 3}
"""

import asyncio
import importlib.util
import json
import logging
import multiprocessing
import re
import threading
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {"enabled": True, "max_wer": 0.1, "max_attempts": 3}
WHISPER_MODEL = "small"
WHISPER_REPO = "Systran/faster-whisper-small"
WHISPER_SAMPLE_RATE = 16000
# A single misheard word in a short sentence is usually Whisper, not the TTS.
MIN_WORD_ERRORS = 2

_PARA_TAG_RE = re.compile(r"\[[^\]]*\]")
_pool: Optional[ProcessPoolExecutor] = None
_model_dir: Optional[str] = None
_pool_lock = threading.Lock()
_worker_model = None  # lives in the worker process only


def _settings_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "quality_check.json"


def load_settings() -> dict:
    settings = dict(DEFAULT_SETTINGS)
    path = _settings_path()
    if path.exists():
        try:
            settings.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError) as e:
            logger.warning("Ignoring unreadable %s: %s", path, e)
    return settings


def save_settings(patch: dict) -> dict:
    settings = load_settings()
    settings.update({k: v for k, v in patch.items() if k in DEFAULT_SETTINGS and v is not None})
    _settings_path().write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return settings


def normalize_words(text: str, language: str) -> list[str]:
    """Spoken form, lower case, punctuation and hyphens removed."""
    from .text_prep import apply_rules, load_dictionary_text, parse_rules, spoken_form

    text = _PARA_TAG_RE.sub(" ", text)
    try:
        # Whisper's capitalisation is arbitrary ("Nextrova.ch" vs "nextrova.ch")
        text = apply_rules(text, parse_rules(load_dictionary_text()), ignore_case=True)
        text = spoken_form(text, language, [])
    except Exception as e:  # comparison still works on the raw text
        logger.debug("spoken_form failed during quality check: %s", e)
    text = text.lower().replace("ß", "ss")
    return re.findall(r"\w+", text)


def word_errors(reference: list[str], hypothesis: list[str]) -> int:
    """Levenshtein distance on words (substitutions + deletions + insertions)."""
    previous = list(range(len(hypothesis) + 1))
    for i, ref_word in enumerate(reference, 1):
        current = [i] + [0] * len(hypothesis)
        for j, hyp_word in enumerate(hypothesis, 1):
            current[j] = min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (ref_word != hyp_word),
            )
        previous = current
    return previous[-1]


@dataclass
class Verdict:
    errors: int
    words: int
    heard: str
    max_wer: float

    @property
    def wer(self) -> float:
        return self.errors / max(1, self.words)

    @property
    def ok(self) -> bool:
        return self.errors < MIN_WORD_ERRORS or self.wer <= self.max_wer


def _to_16k(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if sample_rate == WHISPER_SAMPLE_RATE or len(audio) == 0:
        return audio
    positions = np.arange(0, len(audio), sample_rate / WHISPER_SAMPLE_RATE)
    return np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)


def _worker_transcribe(model_dir: str, audio_16k: np.ndarray, language: str) -> str:
    """Runs in the worker process; the model stays loaded between calls."""
    global _worker_model
    from faster_whisper import WhisperModel
    from faster_whisper.tokenizer import _LANGUAGE_CODES

    if _worker_model is None:
        _worker_model = WhisperModel(model_dir, device="cpu", compute_type="int8")
    segments, _ = _worker_model.transcribe(
        audio_16k,
        language=language if language in _LANGUAGE_CODES else None,
        beam_size=1,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segments)


def _worker() -> tuple[ProcessPoolExecutor, str]:
    """Download the model (with progress in the UI) and start the worker once."""
    global _pool, _model_dir
    with _pool_lock:
        if _model_dir is None:
            from huggingface_hub import snapshot_download

            from ..backends.base import is_model_cached, model_load_progress

            with model_load_progress(f"whisper-qc-{WHISPER_MODEL}", is_model_cached(WHISPER_REPO)):
                _model_dir = snapshot_download(WHISPER_REPO)
        if _pool is None:
            _pool = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))
        return _pool, _model_dir


def transcribe(audio: np.ndarray, sample_rate: int, language: str) -> str:
    global _pool
    pool, model_dir = _worker()
    try:
        return pool.submit(_worker_transcribe, model_dir, _to_16k(audio, sample_rate), language).result(timeout=300)
    except Exception:
        # A crashed or stuck worker is replaced on the next call.
        with _pool_lock:
            if _pool is pool:
                pool.shutdown(wait=False, cancel_futures=True)
                _pool = None
        raise


@dataclass
class QualityCheck:
    language: str
    max_wer: float = DEFAULT_SETTINGS["max_wer"]
    max_attempts: int = DEFAULT_SETTINGS["max_attempts"]

    async def check(self, audio: np.ndarray, sample_rate: int, text: str) -> Optional[Verdict]:
        """None when the check itself failed; the chunk is then kept as is."""
        try:
            heard = await asyncio.to_thread(transcribe, audio, sample_rate, self.language)
        except Exception as e:
            logger.warning("Quality check skipped: %s", e)
            return None
        reference = normalize_words(text, self.language)
        errors = word_errors(reference, normalize_words(heard, self.language))
        return Verdict(errors=errors, words=len(reference), heard=heard, max_wer=self.max_wer)


def get_quality_check(language: str) -> Optional[QualityCheck]:
    """The configured check, or None when it is off or faster-whisper is missing."""
    settings = load_settings()
    if not settings.get("enabled", True):
        return None
    if importlib.util.find_spec("faster_whisper") is None:
        logger.info("faster-whisper not installed; quality check disabled")
        return None
    return QualityCheck(
        language=language,
        max_wer=float(settings["max_wer"]),
        max_attempts=max(1, int(settings["max_attempts"])),
    )
