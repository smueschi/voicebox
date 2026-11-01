"""
Spoken-form text preparation (German and English), applied before chunking.

TTS models read digits, currency codes and abbreviations inconsistently
("CHF 10'000", "0,2 %", "z.B."). This module rewrites them into the words a
speaker would say, and applies a user pronunciation dictionary.

Settings live in ``<data dir>/text_prep.json``::

    {"enabled": true}

The dictionary is ``<data dir>/pronunciation.txt`` with one ``from => to``
rule per line (``#`` starts a comment). Rules that start and end with a word
character only match whole words.
"""

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {"enabled": True}

DEFAULT_DICTIONARY = """# Pronunciation dictionary: one rule per line,  written form => spoken form
# Rules that start and end with a letter/digit only match whole words.
z.B. => zum Beispiel
z. B. => zum Beispiel
bzw. => beziehungsweise
ca. => circa
inkl. => inklusive
usw. => und so weiter
d.h. => das heisst
e.g. => for example
"""


def _settings_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "text_prep.json"


def dictionary_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "pronunciation.txt"


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


def load_dictionary_text() -> str:
    path = dictionary_path()
    return path.read_text(encoding="utf-8") if path.exists() else DEFAULT_DICTIONARY


def save_dictionary_text(content: str) -> None:
    dictionary_path().write_text(content, encoding="utf-8")


def parse_rules(content: str) -> list[tuple[str, str]]:
    """Lines ``from => to``; longest entries first so specific rules win."""
    rules = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=>" not in line:
            continue
        src, dst = (part.strip() for part in line.split("=>", 1))
        if src:
            rules.append((src, dst))
    return sorted(rules, key=lambda r: len(r[0]), reverse=True)


def apply_rules(text: str, rules: list[tuple[str, str]]) -> str:
    for src, dst in rules:
        if re.match(r"\w", src[0]) and re.match(r"\w", src[-1]):
            text = re.sub(rf"(?<!\w){re.escape(src)}(?!\w)", dst, text)
        else:
            text = text.replace(src, dst)
    return text


def _number_words(number: str, lang: str) -> str:
    from num2words import num2words

    number = number.replace("'", "").replace("’", "")
    # Dot followed by exactly three digits = thousands separator (1.000), else decimal point (3.5)
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", number):
        number = number.replace(".", "")
    if lang == "en" and re.fullmatch(r"\d{1,3}(,\d{3})+", number):
        number = number.replace(",", "")
    try:
        if "," in number or "." in number:
            whole, _, frac = number.replace(",", ".").partition(".")
            sep = " Komma " if lang == "de" else " point "
            return num2words(int(whole), lang=lang) + sep + " ".join(num2words(int(d), lang=lang) for d in frac)
        value = int(number)
        if lang == "de" and 1100 <= value <= 1999 and len(number) == 4:
            return num2words(value, lang=lang, to="year")
        return num2words(value, lang=lang)
    except (ValueError, NotImplementedError, OverflowError):
        return number


def spoken_form(text: str, language: str, rules: list[tuple[str, str]]) -> str:
    """Dictionary first, then currencies/percent and numbers (de/en only)."""
    text = apply_rules(text, rules)
    lang = language if language in ("de", "en") else None
    if lang is None:
        return text
    if lang == "de":
        text = re.sub(r"\bCHF\s*([\d'’.,]+)", r"\1 Franken", text)
        text = re.sub(r"([\d'’.,]+)\s*CHF\b", r"\1 Franken", text)
        text = re.sub(r"([\d'’.,]+)\s*%", r"\1 Prozent", text)
        text = re.sub(r"([\d'’.,]+)\s*€", r"\1 Euro", text)
        text = text.replace("&", " und ")
    else:
        text = re.sub(r"([\d,.]+)\s*%", r"\1 percent", text)
        text = text.replace("&", " and ")
    number = r"\d{1,3}(?:['’.]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?"
    text = re.sub(number, lambda m: _number_words(m.group(0), lang), text)
    # Keep line breaks (paragraphs matter for chunking); squeeze other whitespace
    return re.sub(r"[ \t]{2,}", " ", text).strip()


def prepare_text(text: str, language: str) -> str:
    """Entry point used by the generation pipeline. No-op when disabled."""
    try:
        if not load_settings().get("enabled", True):
            return text
        return spoken_form(text, language, parse_rules(load_dictionary_text()))
    except Exception as e:  # never block a generation because of text prep
        logger.warning("Text preparation skipped: %s", e)
        return text
