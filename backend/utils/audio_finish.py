"""
Final processing of generated speech for video use.

Applied to every generated output after ``normalize_audio``:

1. speaking rate (time-stretch, pitch unchanged)
2. de-esser: only the 5–10 kHz band is lowered while it dominates the signal
3. loudness normalization to an integrated target (ITU-R BS.1770, pyloudnorm)
4. look-ahead limiter at -1 dBFS, so raising the loudness never clips

Settings live in ``<data dir>/audio_finish.json``.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, sosfiltfilt

from .audio import apply_speed, soft_limit

logger = logging.getLogger(__name__)

# loudness_lufs 0 keeps the level from normalize_audio.
DEFAULT_SETTINGS = {
    "loudness_lufs": -14.0,
    "deesser": True,
    "deesser_strength": 0.5,
    "speed": 1.0,
}
CEILING = 10 ** (-1.0 / 20)  # -1 dBFS
DEESS_BAND_HZ = (5000.0, 10000.0)
# Share of the signal level above which the sibilance band is lowered.
DEESS_THRESHOLD = 0.35
DEESS_MAX_REDUCTION_DB = 12.0
ENVELOPE_MS = 5.0
MIN_LOUDNESS_SECONDS = 0.5  # BS.1770 gating needs at least 400 ms


def _settings_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "audio_finish.json"


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


def _envelope(x: np.ndarray, window: int) -> np.ndarray:
    return np.sqrt(np.maximum(uniform_filter1d(x * x, size=window), 0.0))


def deess(audio: np.ndarray, sample_rate: int, strength: float = 0.5) -> np.ndarray:
    """
    Lower the sibilance band where it dominates the signal.

    Where the 5–10 kHz band carries more than ``DEESS_THRESHOLD`` of the
    signal level, that band (and only that band) is attenuated. ``strength``
    0–1 scales the depth in dB: 1 pulls the band down to the threshold, 0.5
    halfway; never more than ``DEESS_MAX_REDUCTION_DB``.
    """
    if strength <= 0 or audio.size == 0:
        return audio
    high = min(DEESS_BAND_HZ[1], 0.45 * sample_rate)
    if high <= DEESS_BAND_HZ[0]:
        return audio
    sos = butter(4, [DEESS_BAND_HZ[0], high], btype="bandpass", fs=sample_rate, output="sos")
    padlen = min(audio.size - 1, sample_rate // 10)
    if padlen <= 3 * (2 * len(sos) + 1):
        return audio
    band = sosfiltfilt(sos, audio, padlen=padlen)

    window = max(1, int(sample_rate * ENVELOPE_MS / 1000))
    env_band = _envelope(band, window)
    env_full = _envelope(audio.astype(np.float64), window)
    ratio = DEESS_THRESHOLD * env_full / np.maximum(env_band, 1e-9)
    gain = np.clip(ratio, 0.0, 1.0) ** min(strength, 1.0)
    gain = np.maximum(gain, 10 ** (-DEESS_MAX_REDUCTION_DB / 20))
    gain = uniform_filter1d(gain, size=window)
    return (audio - band * (1.0 - gain)).astype(np.float32)


def normalize_loudness(audio: np.ndarray, sample_rate: int, target_lufs: float) -> np.ndarray:
    """Bring integrated loudness to ``target_lufs`` and keep peaks under -1 dBFS."""
    if audio.size < MIN_LOUDNESS_SECONDS * sample_rate:
        return soft_limit(audio, CEILING)
    import pyloudnorm

    meter = pyloudnorm.Meter(sample_rate)
    # The limiter takes back a little loudness; further passes make up for it.
    for _ in range(3):
        measured = meter.integrated_loudness(audio.astype(np.float64))
        if not np.isfinite(measured):
            break
        audio = soft_limit(audio * 10 ** ((target_lufs - measured) / 20), CEILING)
    return audio


def finish_audio(
    audio: np.ndarray,
    sample_rate: int,
    settings: Optional[dict] = None,
    apply_speed_setting: bool = True,
) -> np.ndarray:
    """Apply speed, de-esser, loudness and limiter according to the settings."""
    s = settings if settings is not None else load_settings()
    audio = np.asarray(audio, dtype=np.float32)
    if apply_speed_setting:
        audio = apply_speed(audio, sample_rate, float(s.get("speed") or 1.0))
    if s.get("deesser"):
        audio = deess(audio, sample_rate, float(s.get("deesser_strength", 0.5)))
    target = float(s.get("loudness_lufs") or 0)
    if target < 0:
        audio = normalize_loudness(audio, sample_rate, target)
    else:
        audio = soft_limit(audio, CEILING)
    return audio
