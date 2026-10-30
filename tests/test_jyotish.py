from datetime import date, datetime, time, timezone

import pytest

from jyotish import (
    NAKSHATRA_SPAN,
    karana_of,
    nakshatra_of,
    panchang,
    rashi_of,
    sidereal_longitude,
    tithi_of,
    vara_of,
    vedic_chart,
    yoga_of,
)

UTC = timezone.utc


@pytest.mark.parametrize(
    "when, rashi",
    [
        # Makar Sankranti 2024: the Sun entered sidereal Capricorn on 2024-01-14 ~21:20 UTC
        (datetime(2024, 1, 14, 12, tzinfo=UTC), "Dhanu"),
        (datetime(2024, 1, 15, 6, tzinfo=UTC), "Makara"),
        # Mesha Sankranti 2024: sidereal Aries on 2024-04-13 ~15:45 UTC
        (datetime(2024, 4, 13, 6, tzinfo=UTC), "Meena"),
        (datetime(2024, 4, 14, 0, tzinfo=UTC), "Mesha"),
    ],
)
def test_sankrantis(when, rashi):
    assert rashi_of(sidereal_longitude("sun", when))["name"] == rashi


@pytest.mark.parametrize(
    "longitude, name, pada",
    [(0, "Ashwini", 1), (3.4, "Ashwini", 2), (NAKSHATRA_SPAN, "Bharani", 1), (359.99, "Revati", 4), (360, "Ashwini", 1)],
)
def test_nakshatra_of(longitude, name, pada):
    n = nakshatra_of(longitude)
    assert (n["name"], n["pada"]) == (name, pada)


def test_nakshatra_lords_follow_vimshottari_order():
    assert nakshatra_of(0)["lord"].startswith("Ketu")
    assert nakshatra_of(9.5 * NAKSHATRA_SPAN)["lord"].startswith("Ketu")  # Magha
    assert nakshatra_of(26.5 * NAKSHATRA_SPAN)["lord"].startswith("Budh")  # Revati


@pytest.mark.parametrize(
    "elongation, number, name, paksha",
    [
        (0, 1, "Pratipada", "Shukla"),
        (130, 11, "Ekadashi", "Shukla"),
        (179.9, 15, "Purnima", "Shukla"),
        (180, 16, "Pratipada", "Krishna"),
        (300, 26, "Ekadashi", "Krishna"),
        (359.9, 30, "Amavasya", "Krishna"),
    ],
)
def test_tithi_of(elongation, number, name, paksha):
    t = tithi_of(elongation)
    assert (t["number"], t["name"], t["paksha"]) == (number, name, paksha)


def test_ekadashi_and_amavasya_are_observances():
    assert "Ekadashi" in tithi_of(130)["observance"]
    assert "Amavasya" in tithi_of(359)["observance"]
    assert tithi_of(50)["observance"] is None


@pytest.mark.parametrize(
    "elongation, name",
    [
        (1, "Kimstughna"),  # first half of Shukla Pratipada
        (7, "Bava"),
        (6 * 7 + 1, "Vishti"),
        (6 * 56 + 1, "Vishti"),  # last movable karana
        (6 * 57 + 1, "Shakuni"),  # second half of Krishna Chaturdashi
        (6 * 58 + 1, "Chatushpada"),
        (6 * 59 + 1, "Naga"),
    ],
)
def test_karana_of(elongation, name):
    k = karana_of(elongation)
    assert k["name"] == name
    assert k["bhadra"] is (name == "Vishti")


def test_yoga_of():
    assert yoga_of(0, 0)["name"] == "Vishkambha"
    assert yoga_of(200, 159.9)["name"] == "Vaidhriti"
    assert yoga_of(0, 15.5 * NAKSHATRA_SPAN)["name"] == "Siddhi"


def test_vara_of():
    assert vara_of(date(2026, 10, 30))["name"] == "Shukravara"  # a Friday
    assert vara_of(date(2026, 11, 1))["name"] == "Ravivara"


def test_paush_purnima_2024_was_in_pushya():
    # Full moon 2024-01-25 17:54 UTC; Pausha takes its name from Pushya
    today = panchang(datetime(2024, 1, 25, 16, tzinfo=UTC), date(2024, 1, 25))
    assert today["tithi"]["name"] == "Purnima"
    assert today["nakshatra"]["name"] == "Pushya"
    assert today["vara"]["name"] == "Guruvara"
    # The tithi ends at the moment of the full moon
    assert today["tithi_ends"] == "2024-01-25T17:54+00:00"
    assert "pada" not in today["nakshatra"]


def test_diwali_2024_was_amavasya():
    # New moon 2024-11-01 12:47 UTC
    today = panchang(datetime(2024, 11, 1, 6, tzinfo=UTC), date(2024, 11, 1))
    assert today["tithi"]["name"] == "Amavasya"
    assert today["tithi_ends"] == "2024-11-01T12:47+00:00"


def test_panchang_end_times_are_in_the_future():
    now = datetime(2026, 10, 30, 6, tzinfo=UTC)
    today = panchang(now)
    for key in ("tithi_ends", "nakshatra_ends"):
        ends = datetime.fromisoformat(today[key])
        assert now < ends < datetime(2026, 11, 1, 12, tzinfo=UTC)


def test_vedic_chart_with_exact_time_and_place():
    chart = vedic_chart(date(1990, 7, 15), time(14, 30), "Asia/Kolkata", 19.07, 72.88)
    # Tropical Moon in Aries sits in sidereal Pisces
    assert chart["rashi"]["name"] == "Meena"
    assert chart["rashi"]["western"] == "Pisces"
    assert chart["nakshatra"]["name"] == "Revati"
    assert chart["nakshatra"]["pada"] == 4
    assert chart["sun"]["name"] == "Mithuna"
    assert chart["lagna"]["name"] == "Tula"


def test_vedic_chart_without_time_gives_alternatives():
    chart = vedic_chart(date(1990, 7, 16), None, "Asia/Kolkata")
    # The Moon stays in Mesha all day but crosses from Ashwini into Bharani
    assert chart["rashi"]["name"] == "Mesha"
    assert chart["nakshatra"] == {"alternatives": ["Ashwini", "Bharani"]}
    assert chart["lagna"] is None


def test_vedic_chart_outside_ephemeris():
    assert vedic_chart(date(1850, 1, 1)) is None
