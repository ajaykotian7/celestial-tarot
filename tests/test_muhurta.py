from datetime import date, timedelta

import pytest

from muhurta import (
    ACTIVITIES,
    day_periods,
    good_windows,
    guidance,
    muhurat,
    natal_moon,
    personal_day,
    sun_times,
)

MUMBAI = (19.07, 72.88, "Asia/Kolkata")
SUNDAY = date(2026, 11, 15)


@pytest.fixture(scope="module")
def sunday():
    day = sun_times(*MUMBAI, SUNDAY, 1)[0]
    return day, day_periods(day["sunrise"], day["sunset"], day["next_sunrise"], SUNDAY)


def test_sunrise_and_sunset_in_mumbai(sunday):
    day, _ = sunday
    assert day["sunrise"].strftime("%H:%M") == "06:45"
    assert day["sunset"].strftime("%H:%M") == "18:00"
    assert day["next_sunrise"].date() == SUNDAY + timedelta(days=1)
    assert not day["approximate"]


def test_sunday_rahu_kaal_is_the_last_eighth_of_the_day(sunday):
    day, periods = sunday
    assert abs((periods["rahu_kaal"]["end"] - day["sunset"]).total_seconds()) < 1
    assert periods["yamaganda"]["start"].strftime("%H:%M") == "12:22"
    assert periods["gulika"]["start"].strftime("%H:%M") == "15:11"
    assert periods["abhijit"]["start"] < day["sunrise"] + (day["sunset"] - day["sunrise"]) / 2


@pytest.mark.parametrize(
    "day, rahu_part",
    # Monday 2nd, Tuesday 7th, Wednesday 5th, Thursday 6th, Friday 4th, Saturday 3rd
    [(date(2026, 11, 16), 2), (date(2026, 11, 17), 7), (date(2026, 11, 18), 5),
     (date(2026, 11, 19), 6), (date(2026, 11, 20), 4), (date(2026, 11, 21), 3)],
)
def test_rahu_kaal_by_weekday(day, rahu_part):
    t = sun_times(*MUMBAI, day, 1)[0]
    periods = day_periods(t["sunrise"], t["sunset"], t["next_sunrise"], day)
    eighth = (t["sunset"] - t["sunrise"]) / 8
    assert periods["rahu_kaal"]["start"] == t["sunrise"] + eighth * (rahu_part - 1)
    # No Abhijit muhurta on a Wednesday
    assert (periods["abhijit"] is None) == (day.weekday() == 2)


def test_choghadiyas(sunday):
    _, periods = sunday
    names = [c["name"] for c in periods["choghadiya"]]
    assert names[:8] == ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg"]
    assert names[8:] == ["Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh"]


def test_good_windows_avoid_rahu_kaal(sunday):
    _, periods = sunday
    for window in good_windows(periods):
        for bad in ("rahu_kaal", "yamaganda", "gulika"):
            assert window["end"] <= periods[bad]["start"] or window["start"] >= periods[bad]["end"]


def test_chandrashtama_and_tara():
    natal = {"sign": 11, "nakshatra": 26}  # Meena, Revati
    eighth = personal_day(natal, moon_sign=6, nakshatra=13)
    assert eighth["chandrashtama"] and eighth["mood"] == "caution"
    assert "Chandrashtama" in guidance(eighth)
    # Makara is the 11th from Meena; counting from Revati, Ashwini is the 2nd star (Sampat)
    good = personal_day(natal, moon_sign=9, nakshatra=0)
    assert good["moon_house"] == 11 and good["tara"] == "Sampat" and good["mood"] == "good"
    # ...and Bharani the 3rd (Vipat)
    assert personal_day(natal, moon_sign=9, nakshatra=1)["tara"] == "Vipat"


def test_natal_moon_needs_a_certain_rashi_and_nakshatra():
    assert natal_moon({"rashi": {"name": "Meena"}, "nakshatra": {"name": "Revati"}}) == {"sign": 11, "nakshatra": 26}
    assert natal_moon({"rashi": {"alternatives": ["Meena", "Mesha"]}, "nakshatra": {"name": "Revati"}}) is None
    assert natal_moon(None) is None


@pytest.mark.parametrize("activity", list(ACTIVITIES))
def test_muhurat_finds_good_days_without_bad_tithis(activity):
    result = muhurat(*MUMBAI, SUNDAY, 45, activity, {"sign": 11, "nakshatra": 26})
    assert result["label"] == ACTIVITIES[activity]["label"]
    assert result["days"], "some day in six weeks should do"
    for day in result["days"]:
        assert "Chandrashtama for this person" not in day["cautions"]
        assert day["reasons"]
        assert all(w["end"] > w["start"] for w in day["windows"])
    dates = [d["date"] for d in result["days"]]
    assert dates == sorted(dates)
