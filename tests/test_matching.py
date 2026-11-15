import pytest

from jyotish import NAKSHATRA_SPAN
from matching import YONI_SCORES, ashtakoota, moon_of, moon_for_matching


def at(nakshatra, pada=1):
    return moon_of(NAKSHATRA_SPAN * nakshatra + (pada - 0.5) * NAKSHATRA_SPAN / 4)


def scores(result):
    return {k["key"]: k["score"] for k in result["kootas"]}


def test_yoni_table_is_symmetric_with_sworn_enemies_at_zero():
    for i, row in enumerate(YONI_SCORES):
        assert row[i] == 4
        for j, value in enumerate(row):
            assert YONI_SCORES[j][i] == value
    # Horse–Buffalo, Elephant–Lion, Sheep–Monkey, Serpent–Mongoose, Dog–Deer, Cat–Rat, Cow–Tiger
    for a, b in [(0, 8), (1, 13), (2, 11), (3, 12), (4, 10), (5, 6), (7, 9)]:
        assert YONI_SCORES[a][b] == 0


def test_the_same_nakshatra_scores_28_with_nadi_dosha():
    result = ashtakoota(at(3, 1), at(3, 2))  # both Rohini
    assert result["total"] == 28
    assert scores(result)["nadi"] == 0
    nadi = next(d for d in result["doshas"] if d["name"] == "Nadi dosha")
    assert "the same nakshatra but different padas" in nadi["cancellations"]


def test_a_known_pair():
    # Bride Ashwini (Mesha), groom Rohini (Vrishabha)
    result = ashtakoota(at(0), at(3))
    s = scores(result)
    # A Kshatriya bride and a Vaishya groom: the groom's varna is lower
    assert s["varna"] == 0
    assert s["vashya"] == 2  # both quadrupeds
    assert s["yoni"] == 3  # Horse and Serpent
    assert s["gana"] == 5  # Deva bride, Manushya groom
    assert s["bhakoot"] == 0  # 2/12
    assert s["nadi"] == 8  # Adi and Antya
    assert any(d["name"] == "Bhakoot dosha" for d in result["doshas"])


def test_verdicts():
    assert "excellent" in ashtakoota(at(3, 1), at(3, 2))["verdict"]
    low = ashtakoota(at(0), at(3))
    assert low["total"] == sum(scores(low).values()) and low["max"] == 36


def test_moon_for_matching_needs_a_certain_moon():
    vedic = {"rashi": {"name": "Meena"}, "nakshatra": {"name": "Revati"}}
    assert moon_for_matching(vedic, None, 357.0)["approximate"] is True
    unsure = {"rashi": {"name": "Meena"}, "nakshatra": {"alternatives": ["Uttara Bhadrapada", "Revati"]}}
    assert moon_for_matching(unsure, None, 350.0) is None
