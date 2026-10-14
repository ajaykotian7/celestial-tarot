import pytest

from tarot_engine import (
    MAJOR_ARCANA,
    MINOR_ARCANA,
    TAROT_DECK,
    draw_three_card_spread,
    get_tarot_meaning,
)


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


@pytest.mark.parametrize(
    "spread_type, positions",
    [
        (
            "past_present_future",
            ["Past Influences", "Current Situation", "Future Potential"],
        ),
        (
            "situation_obstacle_advice",
            ["Core Situation", "The Obstacle", "Guiding Advice"],
        ),
    ],
)
def test_draw_three_card_spread(spread_type, positions):
    result = draw_three_card_spread(spread_type)

    assert result["status"] == "success"
    cards = result["cards"]
    assert [c["position"] for c in cards] == positions
    assert len({c["card"] for c in cards}) == 3
    for c in cards:
        assert c["orientation"] in ("upright", "reversed")
        assert c["meaning"] == TAROT_DECK[c["card"].lower()][c["orientation"]]


@pytest.mark.parametrize(
    "name, expected",
    [
        ("The Tower", "The Tower"),
        ("  five of CUPS ", "Five Of Cups"),
        ("magician", "The Magician"),
        ("tower", "The Tower"),
        ("Queen of  Swords", "Queen Of Swords"),
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
