from datetime import date, time

import pytest

from personal import (
    birth_cards,
    daily_card,
    derive_insights,
    life_path,
    personal_year,
    reduce_number,
)


@pytest.mark.parametrize(
    "n, keep_master, expected",
    [(7, True, 7), (14, True, 5), (11, True, 11), (11, False, 2), (29, True, 11), (38, False, 2)],
)
def test_reduce_number(n, keep_master, expected):
    assert reduce_number(n, keep_master) == expected


@pytest.mark.parametrize(
    "birth, expected",
    [
        (date(1990, 7, 15), 5),  # 7 + 6 + 1 = 14 -> 5
        (date(1985, 11, 5), 3),  # 11 + 5 + 5 = 21 -> 3
        (date(1992, 2, 9), 5),  # 2 + 9 + 3 = 14 -> 5
        (date(1974, 11, 29), 7),  # 11 + 11 + 3 = 25 -> 7
        (date(1960, 2, 2), 11),  # 2 + 2 + 7 = 11 (master number kept)
    ],
)
def test_life_path(birth, expected):
    assert life_path(birth) == expected


def test_personal_year():
    # 7 + 6 + (2026 -> 10 -> 1) = 14 -> 5
    assert personal_year(date(1990, 7, 15), date(2026, 10, 15)) == 5
    assert 1 <= personal_year(date(1985, 11, 5), date(2027, 1, 1)) <= 9


def test_birth_cards_follow_greer_rule():
    # 1990-07-15: 7 + 15 + 1990 = 2012 -> 2+0+1+2 = 5 -> The Hierophant
    assert birth_cards(date(1990, 7, 15)) == ["the hierophant"]
    # 1975-03-28: 3 + 28 + 1975 = 2006 -> 8 -> Strength
    assert birth_cards(date(1975, 3, 28)) == ["strength"]
    # 1982-06-09: 6 + 9 + 1982 = 1997 -> 26 -> 8 -> Strength
    assert birth_cards(date(1982, 6, 9)) == ["strength"]
    # 1998-09-01: 9 + 1 + 1998 = 2008 -> 10 -> Wheel of Fortune, then 1 -> The Magician
    assert birth_cards(date(1998, 9, 1)) == ["wheel of fortune", "the magician"]
    # 1979-09-01: 9 + 1 + 1979 = 1989 -> 27 -> 9 -> The Hermit
    assert birth_cards(date(1979, 9, 1)) == ["the hermit"]
    # 1999-10-03: 10 + 3 + 1999 = 2012 -> 5
    assert birth_cards(date(1999, 10, 3)) == ["the hierophant"]
    # 2000-01-19: 1 + 19 + 2000 = 2020 -> 4 -> The Emperor
    assert birth_cards(date(2000, 1, 19)) == ["the emperor"]
    # 1997-12-31: 12 + 31 + 1997 = 2040 -> 6 -> The Lovers
    assert birth_cards(date(1997, 12, 31)) == ["the lovers"]


def test_birth_cards_with_two_digit_results():
    # 1975-12-31: 12 + 31 + 1975 = 2018 -> 11 -> Justice, then 2 -> The High Priestess
    assert birth_cards(date(1975, 12, 31)) == ["justice", "the high priestess"]
    # 1950-06-10: 6 + 10 + 1950 = 1966 -> 22 -> The Fool, then 4 -> The Emperor
    assert birth_cards(date(1950, 6, 10)) == ["the fool", "the emperor"]
    # 1970-05-06: 5 + 6 + 1970 = 1981 -> 19 -> The Sun, 10 -> Wheel of Fortune, 1 -> The Magician
    assert birth_cards(date(1970, 5, 6)) == ["the sun", "wheel of fortune", "the magician"]


def test_daily_card_is_stable_for_a_day_and_changes_between_people():
    today = date(2026, 10, 15)
    first = daily_card(today, date(1990, 7, 15))
    assert first == daily_card(today, date(1990, 7, 15))
    assert first["position"] == "Your card for today"
    assert first["image"].startswith("/static/cards/")
    days = {daily_card(date(2026, 10, d), date(1990, 7, 15))["card"] for d in range(1, 29)}
    assert len(days) > 10
    people = {daily_card(today, date(1990, 1, d))["card"] for d in range(1, 29)}
    assert len(people) > 10


def test_derive_insights_full_profile():
    insights = derive_insights(
        date(1990, 7, 15), date(2026, 10, 15), time(14, 30), "Asia/Kolkata", 19.07, 72.88
    )
    assert insights["sun"]["sign"] == "Cancer"
    assert insights["rising"] is not None
    assert insights["birth_cards"] == ["The Hierophant"]
    assert insights["life_path"] == 5
    assert insights["life_path_theme"] == "freedom and change"
    assert insights["personal_year"] == 5
    assert insights["personal_cards"]["the hierophant"] == "your birth card"
    assert insights["personal_cards"]["the chariot"] == "the card of your Cancer sun"


def test_derive_insights_skips_uncertain_sign_cards():
    # Born on the Pisces/Aries cusp with no time: neither sign's card is claimed
    insights = derive_insights(date(2024, 3, 20), date(2026, 10, 15))
    assert insights["sun"]["alternatives"] == ["Pisces", "Aries"]
    # Only the birth cards (Death and The Emperor: 2047 -> 13 -> 4) count as personal
    assert set(insights["personal_cards"].values()) == {"your birth card"}


def test_derive_insights_without_birth_date():
    assert derive_insights(None, date(2026, 10, 15)) is None
