"""Spoken-form text preparation: numbers, currencies, abbreviations, dictionary."""
import pytest

from backend.utils.text_prep import DEFAULT_DICTIONARY, parse_rules, spoken_form

RULES = parse_rules(DEFAULT_DICTIONARY)


@pytest.mark.parametrize("raw, spoken", [
    ("3.5", "drei Komma fünf"),
    ("3,5", "drei Komma fünf"),
    ("0,2 %", "null Komma zwei Prozent"),
    ("1.000", "eintausend"),
    ("CHF 10'000", "zehntausend Franken"),
    ("10'000 CHF", "zehntausend Franken"),
    ("1999", "neunzehnhundertneunundneunzig"),
    ("2026", "zweitausendsechsundzwanzig"),
    ("5 €", "fünf Euro"),
])
def test_german_numbers(raw, spoken):
    assert spoken_form(raw, "de", []) == spoken


def test_english_numbers():
    assert spoken_form("1,000 and 2.5 %", "en", []) == "one thousand and two point five percent"


def test_dictionary_matches_whole_words_only():
    assert spoken_form("KI und KIno", "de", [("KI", "Ka I")]) == "Ka I und KIno"


def test_default_dictionary_expands_abbreviations():
    assert spoken_form("Das ist z.B. gut.", "de", RULES) == "Das ist zum Beispiel gut."


def test_other_languages_only_get_dictionary():
    assert spoken_form("3.5 z.B.", "fr", RULES) == "3.5 zum Beispiel"


def test_paragraph_breaks_survive():
    assert spoken_form("Eins.\n\nZwei.", "de", []) == "Eins.\n\nZwei."
