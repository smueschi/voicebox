"""Whisper quality check: word comparison and retry with another seed."""
import numpy as np
import pytest

from backend.utils import quality_check as qc
from backend.utils import text_prep
from backend.utils.chunked_tts import QUALITY_RETRY_SEED_STEP, generate_chunked

SAMPLE_RATE = 1000


@pytest.fixture(autouse=True)
def _dictionary(monkeypatch):
    rules = text_prep.DEFAULT_DICTIONARY + "nextrova.ch => Nekst-rova punkt Zeh Ha\nNextrova => Nekst-rova\n"
    monkeypatch.setattr(text_prep, "load_dictionary_text", lambda: rules)
    monkeypatch.setattr(text_prep, "load_settings", lambda: {"enabled": True})


def test_written_and_spoken_forms_compare_equal():
    sent = text_prep.prepare_text("Ein ETF mit 0,2 % kostet bei CHF 10'000 nur 20 Franken. Mehr auf nextrova.ch.", "de")
    heard = "Ein ETF mit 0,2% kostet bei 10.000 Franken nur 20 Franken. Mehr auf nextrova.ch."
    assert qc.word_errors(qc.normalize_words(sent, "de"), qc.normalize_words(heard, "de")) == 0


def test_dictionary_ignores_whisper_capitalisation():
    sent = text_prep.prepare_text("Mehr auf nextrova.ch.", "de")
    assert qc.normalize_words("Mehr auf Nextrova.ch.", "de") == qc.normalize_words(sent, "de")


def test_word_errors_counts_missing_and_extra_words():
    ref = "das ist ein kurzer test".split()
    assert qc.word_errors(ref, "das ist kurzer test".split()) == 1
    assert qc.word_errors(ref, "das ist ein kurzer test test test".split()) == 2
    assert qc.word_errors(ref, []) == 5


def test_single_misheard_word_in_short_sentence_passes():
    assert qc.Verdict(errors=1, words=5, heard="", max_wer=0.1).ok
    assert not qc.Verdict(errors=2, words=5, heard="", max_wer=0.1).ok
    assert qc.Verdict(errors=2, words=40, heard="", max_wer=0.1).ok


class _Backend:
    def __init__(self):
        self.seeds = []

    async def generate(self, text, voice_prompt, language, seed, instruct):
        self.seeds.append(seed)
        return np.full(SAMPLE_RATE, len(self.seeds) / 10, dtype=np.float32), SAMPLE_RATE


class _Check:
    """Pretends the n-th attempt has errors[n] word errors out of 20."""

    def __init__(self, errors, max_attempts=3):
        self.errors = list(errors)
        self.max_attempts = max_attempts

    async def check(self, audio, sample_rate, text):
        return qc.Verdict(errors=self.errors.pop(0), words=20, heard="", max_wer=0.1)


@pytest.mark.asyncio
async def test_good_first_attempt_is_not_retried():
    backend = _Backend()
    await generate_chunked(backend, "Kurzer Satz.", {}, language="de", seed=5, quality_check=_Check([0]))
    assert backend.seeds == [5]


@pytest.mark.asyncio
async def test_bad_attempt_is_retried_with_new_seed_and_best_is_kept():
    backend = _Backend()
    audio, _ = await generate_chunked(backend, "Kurzer Satz.", {}, language="de", seed=5,
                                      quality_check=_Check([6, 3, 4]))
    assert backend.seeds == [5, 5 + QUALITY_RETRY_SEED_STEP, 5 + 2 * QUALITY_RETRY_SEED_STEP]
    assert audio[0] == pytest.approx(0.2)  # second attempt had the fewest errors


@pytest.mark.asyncio
async def test_retry_stops_once_an_attempt_passes():
    backend = _Backend()
    await generate_chunked(backend, "Kurzer Satz.", {}, language="de", seed=None,
                           quality_check=_Check([6, 1, 0]))
    assert backend.seeds == [None, None]


@pytest.mark.asyncio
async def test_failed_check_keeps_the_audio():
    class Broken(_Check):
        async def check(self, audio, sample_rate, text):
            return None

    backend = _Backend()
    await generate_chunked(backend, "Kurzer Satz.", {}, language="de", seed=1, quality_check=Broken([]))
    assert backend.seeds == [1]


def test_disabled_setting_returns_no_check(monkeypatch):
    monkeypatch.setattr(qc, "load_settings", lambda: {"enabled": False, "max_wer": 0.1, "max_attempts": 3})
    assert qc.get_quality_check("de") is None
