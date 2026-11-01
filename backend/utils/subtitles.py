"""
SRT subtitles for a generation: one cue per sentence of the original text.

No speech recognition is needed because the text is known. Sentence
boundaries are placed on the pauses in the audio: each boundary goes to the
pause nearest to where it is expected if speech time were proportional to the
number of characters. TTS output pauses reliably between sentences, so this
lands within a few hundred milliseconds without loading a model.
"""

import re

import numpy as np

_ABBREVIATIONS = ("z.B.", "z. B.", "u.a.", "bzw.", "ca.", "Nr.", "Dr.", "Prof.", "evtl.", "inkl.", "usw.",
                  "etc.", "d.h.", "vgl.", "e.g.", "i.e.", "vs.", "Mr.", "Mrs.", "Ms.")


def split_sentences(text: str) -> list[str]:
    protected = text
    for i, abbr in enumerate(_ABBREVIATIONS):
        protected = protected.replace(abbr, f"\x00{i}\x00")
    parts = re.split(r"(?<=[.!?…])\s+|\n\s*\n", protected)
    sentences = []
    for part in parts:
        for i, abbr in enumerate(_ABBREVIATIONS):
            part = part.replace(f"\x00{i}\x00", abbr)
        part = " ".join(part.split())
        if part:
            sentences.append(part)
    return sentences


def find_pauses(audio: np.ndarray, sr: int, min_pause_s: float = 0.12, frame_s: float = 0.02) -> list[float]:
    """Midpoints (seconds) of quiet stretches, relative to the clip's loudness."""
    hop = max(1, int(sr * frame_s))
    n = len(audio) // hop
    if n == 0:
        return []
    energy = np.sqrt((audio[: n * hop].reshape(n, hop) ** 2).mean(axis=1))
    loud = np.percentile(energy, 95)
    if loud <= 0:
        return []
    quiet = energy < loud * 0.06
    pauses, start = [], None
    for i, q in enumerate(np.append(quiet, False)):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) * frame_s >= min_pause_s and start > 0 and i < n:
                pauses.append((start + i) / 2 * frame_s)
            start = None
    return pauses


def align(sentences: list[str], audio: np.ndarray, sr: int) -> list[tuple[float, float, str]]:
    """(start, end, sentence) per sentence."""
    duration = len(audio) / sr
    if not sentences:
        return []
    weights = np.array([max(1, len(s)) for s in sentences], dtype=float)
    expected = np.cumsum(weights)[:-1] / weights.sum() * duration
    pauses = find_pauses(audio, sr)
    bounds, last = [], 0.0
    for k, target in enumerate(expected):
        remaining = len(expected) - k - 1
        usable = [p for p in pauses if p > last + 0.2]
        # keep enough pauses for the boundaries still to come
        usable = usable[: len(usable) - remaining] if remaining and len(usable) > remaining else usable
        best = min(usable, key=lambda p: abs(p - target), default=None)
        if best is None or abs(best - target) > max(1.5, 0.35 * (weights[k] / weights.sum() * duration)):
            best = max(target, last + 0.2)
        bounds.append(best)
        last = best
    edges = [0.0] + bounds + [duration]
    return [(edges[i], edges[i + 1], s) for i, s in enumerate(sentences)]


def _timestamp(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: list[tuple[float, float, str]]) -> str:
    lines = []
    for n, (start, end, text) in enumerate(cues, 1):
        lines += [str(n), f"{_timestamp(start)} --> {_timestamp(end)}", text, ""]
    return "\n".join(lines)


def srt_for(text: str, audio: np.ndarray, sr: int) -> str:
    return to_srt(align(split_sentences(text), audio, sr))
