"""Final processing: limiter, de-esser, loudness, speed."""
import numpy as np
import pyloudnorm
import pytest
from scipy.signal import butter, sosfiltfilt

from backend.utils import audio_finish as af
from backend.utils.audio import normalize_audio, soft_limit
from backend.utils.chunked_tts import split_pause_markers

SR = 24000


def _tone(seconds, amp=0.3, freq=200.0):
    t = np.arange(int(seconds * SR)) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def _band_rms(x, lo=5000, hi=10000):
    band = sosfiltfilt(butter(4, [lo, hi], btype="bandpass", fs=SR, output="sos"), x)
    return float(np.sqrt(np.mean(band**2)))


def test_soft_limit_holds_the_ceiling_without_flat_tops():
    audio = _tone(1.0, amp=1.5)
    out = soft_limit(audio, 0.85)
    assert np.abs(out).max() <= 0.85 + 1e-6
    # Gain reduction, not clipping: the waveform stays a scaled sine.
    middle = slice(SR // 4, 3 * SR // 4)
    ratio = out[middle] / np.where(np.abs(audio[middle]) > 0.1, audio[middle], np.nan)
    assert np.nanstd(ratio) < 1e-3


def test_soft_limit_leaves_quiet_audio_untouched():
    audio = _tone(1.0, amp=0.3)
    assert np.array_equal(soft_limit(audio, 0.85), audio)


def test_normalize_audio_no_longer_hard_clips():
    audio = _tone(1.0, amp=0.1)
    audio[SR // 2] = 1.0  # one spike far above the rest
    out = normalize_audio(audio)
    assert np.abs(out).max() <= 0.85 + 1e-6
    assert (np.abs(out) >= 0.8499).sum() <= 3


def test_loudness_reaches_target_and_peaks_stay_under_minus_1_dbfs():
    rng = np.random.default_rng(0)
    speechlike = _tone(4.0, amp=0.05) * (1 + rng.random(int(4.0 * SR)).astype(np.float32))
    out = af.normalize_loudness(speechlike, SR, -14.0)
    assert pyloudnorm.Meter(SR).integrated_loudness(out.astype(np.float64)) == pytest.approx(-14.0, abs=0.5)
    assert np.abs(out).max() <= af.CEILING + 1e-6


def test_deesser_lowers_a_sibilant_burst_and_spares_voiced_sound():
    rng = np.random.default_rng(1)
    voiced = _tone(2.0, amp=0.3)
    hiss = sosfiltfilt(butter(4, [5500, 9000], btype="bandpass", fs=SR, output="sos"),
                       rng.standard_normal(voiced.size)).astype(np.float32)
    burst = slice(SR // 2, SR)
    audio = voiced.copy()
    audio[burst] = 0.05 * voiced[burst] + 0.3 * hiss[burst] / np.abs(hiss[burst]).max()
    out = af.deess(audio, SR, 0.5)
    reduction_db = 20 * np.log10(_band_rms(out[burst]) / _band_rms(audio[burst]))
    assert reduction_db <= -3.0
    voiced_part = slice(int(1.3 * SR), int(1.9 * SR))
    assert np.allclose(out[voiced_part], audio[voiced_part], atol=1e-3)


def test_deesser_strength_zero_is_a_no_op():
    audio = _tone(1.0)
    assert np.array_equal(af.deess(audio, SR, 0.0), audio)


def test_finish_applies_speed_only_when_asked():
    audio = _tone(2.0, amp=0.1)
    settings = {"loudness_lufs": 0, "deesser": False, "deesser_strength": 0.5, "speed": 1.25}
    assert len(af.finish_audio(audio, SR, settings)) == pytest.approx(len(audio) / 1.25, rel=0.02)
    assert len(af.finish_audio(audio, SR, settings, apply_speed_setting=False)) == len(audio)


def test_settings_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(af, "_settings_path", lambda: tmp_path / "audio_finish.json")
    assert af.load_settings() == af.DEFAULT_SETTINGS
    af.save_settings({"loudness_lufs": -16.0, "unknown": 1, "speed": None})
    loaded = af.load_settings()
    assert loaded["loudness_lufs"] == -16.0
    assert loaded["speed"] == 1.0
    assert "unknown" not in loaded


def test_pause_marker_parsing():
    assert split_pause_markers("A. [pause 0,8] B [Pause] C") == [("A.", 0.8), ("B", 0.6), ("C", 0.0)]
    assert split_pause_markers("Kein Marker") == [("Kein Marker", 0.0)]
    assert split_pause_markers("Lang [pause 30]") == [("Lang", 5.0)]
    assert split_pause_markers("Ein [laugh] Tag") == [("Ein [laugh] Tag", 0.0)]
