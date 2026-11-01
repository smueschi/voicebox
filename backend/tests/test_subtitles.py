"""SRT export: sentence splitting and pause-based alignment."""
import numpy as np

from backend.utils.subtitles import align, split_sentences, srt_for

SR = 16000


def _speech(seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return (0.3 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)


def _silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SR), dtype=np.float32)


def test_split_keeps_abbreviations_and_paragraphs():
    text = "Das ist z.B. gut. Zweiter Satz!\n\nNeuer Absatz ohne Punkt"
    assert split_sentences(text) == ["Das ist z.B. gut.", "Zweiter Satz!", "Neuer Absatz ohne Punkt"]


def test_boundaries_land_on_pauses():
    # 2 s speech, 0.4 s pause, 3 s speech, 0.5 s pause, 1 s speech
    audio = np.concatenate([_speech(2), _silence(0.4), _speech(3), _silence(0.5), _speech(1)])
    sentences = ["Eins zwei drei vier.", "Fünf sechs sieben acht neun zehn.", "Elf."]
    cues = align(sentences, audio, SR)
    assert abs(cues[0][1] - 2.2) < 0.1
    assert abs(cues[1][1] - 5.65) < 0.1
    assert cues[-1][1] == len(audio) / SR


def test_srt_format():
    audio = np.concatenate([_speech(1), _silence(0.3), _speech(1)])
    srt = srt_for("Hallo. Welt.", audio, SR)
    assert srt.startswith("1\n00:00:00,000 --> 00:00:01,")
    assert "\n2\n" in srt and srt.rstrip().endswith("Welt.")
