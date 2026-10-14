from pathlib import Path

import pytest

from tarot_engine import (
    MAJOR_ARCANA,
    MINOR_ARCANA,
    SPREADS,
    TAROT_DECK,
    card_image_path,
    draw_spread,
    find_card,
    get_tarot_meaning,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_deck_has_all_78_cards():
    assert len(MAJOR_ARCANA) == 22
    assert len(MINOR_ARCANA) == 56
    assert len(TAROT_DECK) == 78


def test_every_card_has_distinct_upright_and_reversed_meanings():
    for name, meanings in TAROT_DECK.items():
        assert meanings["upright"].strip(), name
        assert meanings["reversed"].strip(), name
        assert meanings["upright"] != meanings["reversed"], name


def test_minor_arcana_meanings_are_unique():
    uprights = [m["upright"] for m in MINOR_ARCANA.values()]
    assert len(set(uprights)) == len(uprights)


def test_every_card_has_artwork():
    for key in TAROT_DECK:
        image = PROJECT_ROOT / card_image_path(key).lstrip("/")
        assert image.is_file(), key


def test_spread_sizes():
    assert {name: len(p) for name, p in SPREADS.items()} == {
        "single_card": 1,
        "past_present_future": 3,
        "situation_obstacle_advice": 3,
        "celtic_cross": 10,
    }


@pytest.mark.parametrize("spread_type", list(SPREADS))
def test_draw_spread(spread_type):
    result = draw_spread(spread_type)

    assert result["status"] == "success"
    assert result["spread_type"] == spread_type
    cards = result["cards"]
    assert [c["position"] for c in cards] == SPREADS[spread_type]
    assert len({c["card"] for c in cards}) == len(cards)
    for c in cards:
        key = find_card(c["card"])
        assert c["orientation"] in ("upright", "reversed")
        assert c["meaning"] == TAROT_DECK[key][c["orientation"]]
        assert c["image"] == card_image_path(key)


def test_draw_spread_rejects_unknown_spread():
    assert draw_spread("tea_leaves")["status"] == "error"


@pytest.mark.parametrize(
    "name, expected",
    [
        ("The Tower", "The Tower"),
        ("  five of CUPS ", "Five of Cups"),
        ("magician", "The Magician"),
        ("tower", "The Tower"),
        ("Queen of  Swords", "Queen of Swords"),
    ],
)
def test_get_tarot_meaning_resolves_names(name, expected):
    result = get_tarot_meaning(name, "reversed")
    assert result["status"] == "success"
    assert result["card"] == expected
    assert result["meaning"] == TAROT_DECK[expected.lower()]["reversed"]


@pytest.mark.parametrize("name", ["Ace of Swrods", "", "ace", "of cups"])
def test_get_tarot_meaning_rejects_unknown_or_ambiguous_names(name):
    result = get_tarot_meaning(name)
    assert result["status"] == "error"
    assert "message" in result


def test_get_tarot_meaning_defaults_invalid_orientation_to_upright():
    result = get_tarot_meaning("The Star", "sideways")
    assert result["orientation"] == "upright"
    assert result["meaning"] == TAROT_DECK["the star"]["upright"]
