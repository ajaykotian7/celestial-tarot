from datetime import date, datetime, time, timedelta, timezone

import pytest

from jyotish import NAKSHATRA_SPAN, RASHIS
from kundali import (
    DASHA_YEAR_DAYS,
    _dignity,
    current_dasha,
    doshas,
    house_from,
    jataka,
    jataka_summary,
    saturn_periods,
    SADE_SATI_PHASES,
    sign_ingresses,
    transit,
    vimshottari,
    yogas,
)

UTC = timezone.utc
SIGN = {name: i for i, (name, *_rest) in enumerate(RASHIS)}

# The sample querent used across the tests (Mumbai, afternoon)
BIRTH = date(1990, 7, 15)
TODAY = date(2026, 11, 15)


@pytest.fixture(scope="module")
def sample():
    return jataka(BIRTH, TODAY, time(14, 30), "Asia/Kolkata", 19.07, 72.88)


# --- Transits, checked against the dates printed in Indian panchangs ---


@pytest.mark.parametrize(
    "graha, day, rashi",
    [
        ("saturn", date(2023, 1, 17), "Kumbha"),
        ("saturn", date(2025, 3, 29), "Meena"),
        ("jupiter", date(2024, 5, 1), "Vrishabha"),
        ("jupiter", date(2025, 5, 14), "Mithuna"),
        # Rahu's published dates follow the mean node
        ("rahu", date(2025, 5, 18), "Kumbha"),
    ],
)
def test_ingresses_match_published_dates(graha, day, rashi):
    assert (day, SIGN[rashi]) in sign_ingresses(graha)


def test_retrograde_re_entries_are_listed():
    # Guru entered Karka in October 2025, slipped back into Mithuna in December
    days = {d: s for d, s in sign_ingresses("jupiter") if date(2025, 10, 1) <= d <= date(2026, 7, 1)}
    assert list(days.values()) == [SIGN["Karka"], SIGN["Mithuna"], SIGN["Karka"]]


def test_transit_knows_when_it_started_and_ends():
    now = transit("saturn", date(2026, 11, 15))
    assert now["sign"] == SIGN["Meena"]
    assert now["since"] == date(2025, 3, 29)
    assert now["until"].year == 2027 and now["until"].month == 6


# --- Sade Sati ---


@pytest.mark.parametrize("moon, phase", [("Mesha", "rising"), ("Meena", "peak"), ("Kumbha", "setting")])
def test_sade_sati_phase_in_late_2026(moon, phase):
    periods = saturn_periods(SIGN[moon], SADE_SATI_PHASES)
    today = date(2026, 11, 15)
    running = next(p for p in periods if p["start"] <= today < p["end"])
    assert next(ph["phase"] for ph in running["phases"] if ph["start"] <= today < ph["end"]) == phase


def test_sade_sati_for_kumbha_moon_spans_makara_to_meena():
    # Shani entered Makara in January 2020. It leaves Meena in June 2027 but slips back
    # from October until February 2028, so the Sade Sati ends then
    period = next(
        p for p in saturn_periods(SIGN["Kumbha"], SADE_SATI_PHASES) if p["start"].year == 2020
    )
    assert period["start"] == date(2020, 1, 24)
    assert period["end"] == date(2028, 2, 23)
    # Retrograde loops revisit phases (back to rising in mid-2022), but the order holds
    assert list(dict.fromkeys(ph["phase"] for ph in period["phases"])) == ["rising", "peak", "setting"]


# --- Vimshottari ---


def test_dasha_from_start_of_ashwini_is_a_full_ketu_dasha():
    birth = datetime(2000, 1, 1, tzinfo=UTC)
    first = vimshottari(0.0, birth)[0]
    assert first["lord"] == "ketu"
    assert first["start"] == birth
    assert first["end"] - first["start"] == timedelta(days=7 * DASHA_YEAR_DAYS)


def test_dasha_balance_halfway_through_bharani():
    birth = datetime(2000, 1, 1, tzinfo=UTC)
    first = vimshottari(NAKSHATRA_SPAN * 1.5, birth)[0]
    assert first["lord"] == "venus"
    # Half of Venus's 20 years were spent before birth
    assert first["end"] - birth == timedelta(days=10 * DASHA_YEAR_DAYS)


def test_dashas_cover_120_years_and_antardashas_fill_each_one():
    mahadashas = vimshottari(123.4, datetime(2000, 1, 1, tzinfo=UTC))
    assert len(mahadashas) == 9
    assert mahadashas[-1]["end"] - mahadashas[0]["start"] == timedelta(days=120 * DASHA_YEAR_DAYS)
    for md in mahadashas:
        ads = md["antardashas"]
        assert ads[0]["lord"] == md["lord"]
        assert ads[0]["start"] == md["start"]
        assert abs((ads[-1]["end"] - md["end"]).total_seconds()) < 1


def test_current_dasha_goes_down_to_pratyantar():
    birth = datetime(2000, 1, 1, tzinfo=UTC)
    # Ketu–Ketu–Ketu lasts 7 * 7/120 * 7/120 years, about nine days
    current = current_dasha(vimshottari(0.0, birth), birth + timedelta(days=5))
    assert [current[k]["lord"] for k in ("mahadasha", "antardasha", "pratyantardasha")] == [
        "ketu", "ketu", "ketu",
    ]


# --- The sample jataka ---


def test_sample_chart(sample):
    g = {x["key"]: x for x in sample["grahas"]}
    assert sample["lagna"]["name"] == "Tula"
    assert g["moon"]["rashi"] == "Meena" and g["moon"]["nakshatra"] == "Revati" and g["moon"]["pada"] == 4
    assert g["mars"]["rashi"] == "Mesha" and g["mars"]["dignity"] == "own sign" and g["mars"]["house"] == 7
    # Guru within a degree of the Sun
    assert g["jupiter"]["combust"]
    assert g["saturn"]["retrograde"]
    assert g["rahu"]["sign"] == (g["ketu"]["sign"] + 6) % 12
    # Revati is ruled by Budh: Budh, Ketu, Shukra and Surya are spent by late 2026
    assert sample["dasha"]["current"]["mahadasha"]["lord"] == "Chandra"
    assert sample["sade_sati"]["current"]["phase"] == "peak"


def test_sample_doshas_and_yogas(sample):
    by_key = {d["key"]: d for d in sample["doshas"]}
    assert len(by_key) == 16
    assert by_key["mangal"]["status"] == "cancelled"
    assert by_key["gandmool"]["status"] == "present"
    assert by_key["kaal_sarp"]["status"] == "mild"
    assert by_key["sade_sati"]["status"] == "present"
    names = {y["name"] for y in sample["yogas"]}
    assert {"Gaja Kesari yoga", "Ruchaka yoga"} <= names


@pytest.mark.parametrize(
    "kwargs",
    [
        {"birth_time": None, "tz_name": "Asia/Kolkata", "latitude": 19.07, "longitude": 72.88},
        {"birth_time": time(14, 30), "tz_name": None, "latitude": None, "longitude": None},
    ],
)
def test_no_jataka_without_birth_time_and_place(kwargs):
    assert jataka(BIRTH, TODAY, **kwargs) is None


def test_summary_gives_nothing_away(sample):
    text = jataka_summary(sample, BIRTH, TODAY)
    assert "Tula" in text and "Chandra mahadasha" in text and "Sade Sati is running" in text
    # For a Tula lagna, Karka is the 10th house: the Moon's dasha is about career
    assert "Chandra rules the 10th" in text and "Mangal rules the 2nd and 7th" in text
    assert "Chandra mahadasha (lord of the 10th, in the 6th;" in text
    for private in ("1990", "°", "Kolkata", "14:30", "27.7"):
        assert private not in text


def test_jataka_is_a_fresh_copy(sample):
    sample["grahas"].clear()
    again = jataka(BIRTH, TODAY, time(14, 30), "Asia/Kolkata", 19.07, 72.88)
    assert len(again["grahas"]) == 9


# --- Dosha and yoga rules, on hand-made charts ---


def chart(lagna, places, tithi=5):
    """A chart with each graha at 15° of the named rashi (or at an exact longitude)."""
    lagna_sign = SIGN[lagna]
    grahas = []
    for key in ("sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"):
        where = places[key]
        lon = where if isinstance(where, (int, float)) else SIGN[where] * 30 + 15
        sign = int(lon // 30)
        grahas.append(
            {
                "key": key,
                "longitude": lon,
                "sign": sign,
                "rashi": RASHIS[sign][0],
                "house": house_from(sign, lagna_sign),
                "dignity": _dignity(key, sign),
                "nakshatra": "Rohini",
            }
        )
    return {"lagna": {"sign": lagna_sign, "name": lagna}, "grahas": grahas, "birth_tithi": tithi}


QUIET = {"current": None, "current_dhaiya": None}
# Spread out, with nothing joined: no dosha should fire on its own
BASE = {
    "sun": "Mesha", "moon": "Vrishabha", "mars": "Simha", "mercury": "Mithuna",
    "jupiter": "Tula", "venus": "Kumbha", "saturn": "Dhanu", "rahu": "Kanya", "ketu": "Meena",
}


def status(c, key):
    return next(d for d in doshas(c, QUIET) if d["key"] == key)


def test_mangal_absent_when_mars_is_5th_from_lagna_moon_and_venus():
    places = {**BASE, "mars": "Simha", "moon": "Mesha", "venus": "Mesha"}
    assert status(chart("Mesha", places), "mangal")["status"] == "absent"


def test_mangal_dosha_from_lagna_and_its_cancellations():
    places = {**BASE, "moon": "Mesha", "mars": "Tula", "jupiter": "Mesha", "venus": "Mesha"}
    # Mars in the 7th from a Mesha lagna; Guru in Mesha aspects it (7th): cancelled
    assert status(chart("Mesha", places), "mangal")["status"] == "cancelled"
    # Move Guru away (Kanya: no aspect on Tula)
    places["jupiter"] = "Kanya"
    found = status(chart("Mesha", places), "mangal")
    assert found["status"] == "present" and not found["cancellations"]
    # Mars in its own sign Vrishchika, 8th from Mesha: cancelled
    places["mars"] = "Vrishchika"
    assert status(chart("Mesha", places), "mangal")["status"] == "cancelled"


def test_mangal_dosha_only_from_moon_is_mild():
    # Mars in Tula: the 5th from a Mithuna lagna, but the 2nd from a Kanya Moon
    places = {**BASE, "moon": "Kanya", "mars": "Tula", "jupiter": "Kanya", "venus": "Mithuna"}
    found = status(chart("Mithuna", places), "mangal")
    assert found["status"] == "mild"


def test_kaal_sarp_full_partial_and_absent():
    hemmed = {
        "rahu": 10.0, "ketu": 190.0, "sun": 20.0, "moon": 40.0, "mars": 60.0,
        "mercury": 80.0, "jupiter": 100.0, "venus": 120.0, "saturn": 140.0,
    }
    full = status(chart("Mesha", hemmed), "kaal_sarp")
    assert full["status"] == "present" and "Anant" in full["detail"]
    partial = status(chart("Mesha", {**hemmed, "saturn": 200.0}), "kaal_sarp")
    assert partial["status"] == "mild" and "Shani" in partial["detail"]
    assert status(chart("Mesha", {**hemmed, "saturn": 200.0, "venus": 250.0}), "kaal_sarp")["status"] == "absent"


@pytest.mark.parametrize(
    "key, places, expected",
    [
        ("grahan", {"sun": "Kanya"}, "present"),
        ("grahan", {}, "absent"),
        ("guru_chandal", {"jupiter": "Kanya"}, "present"),
        ("angarak", {"mars": "Meena"}, "present"),
        ("shrapit", {"saturn": "Kanya"}, "present"),
        ("vish", {"saturn": "Vrishabha"}, "present"),
        ("pitru", {"sun": "Dhanu"}, "present"),
        # Saturn in Dhanu aspects the 3rd, 7th and 10th from itself: Kumbha, Mithuna, Kanya
        ("punarphoo", {"moon": "Mithuna"}, "present"),
        ("punarphoo", {}, "absent"),
    ],
)
def test_conjunction_doshas(key, places, expected):
    assert status(chart("Mesha", {**BASE, **places}), key)["status"] == expected


def test_kemadruma_and_its_cancellation():
    # Moon in Vrishabha with nothing in Mesha or Mithuna (Mercury moved away)
    places = {**BASE, "sun": "Karka", "mercury": "Karka"}
    # Guru in Tula is the 6th from the Moon (no kendra); Mars in Simha is the 4th: cancelled
    assert status(chart("Mesha", places), "kemadruma")["status"] == "cancelled"
    lonely = {**places, "mars": "Karka", "venus": "Karka", "saturn": "Karka", "jupiter": "Karka"}
    # The Moon is in the 2nd from a Mesha lagna, not a kendra: nothing cancels it
    assert status(chart("Mesha", lonely), "kemadruma")["status"] == "present"
    assert status(chart("Mesha", BASE), "kemadruma")["status"] == "absent"


def test_gandmool_naga_and_amavasya():
    revati = {**BASE, "moon": 355.0}
    assert status(chart("Mesha", revati), "gandmool")["status"] == "present"
    # Rahu in Kanya is the 6th from Mesha; in Tula it is the 7th
    assert status(chart("Mesha", BASE), "naga")["status"] in ("absent", "mild")
    assert status(chart("Mesha", {**BASE, "rahu": "Tula", "ketu": "Mesha"}), "naga")["status"] == "present"
    assert status(chart("Mesha", BASE, tithi=30), "amavasya")["status"] == "present"


def test_doshas_are_sorted_present_first():
    statuses = [d["status"] for d in doshas(chart("Mesha", {**BASE, "sun": "Kanya"}), QUIET)]
    order = ["present", "mild", "cancelled", "absent"]
    assert statuses == sorted(statuses, key=order.index)


def test_yogas():
    places = {**BASE, "jupiter": "Simha", "mercury": "Mesha", "mars": "Makara"}
    names = {y["name"] for y in yogas(chart("Mesha", places))}
    # Guru in Simha is the 4th from a Vrishabha Moon; Budh joins Surya in Mesha;
    # Mangal exalted in Makara, the 10th from a Mesha lagna
    assert {"Gaja Kesari yoga", "Budhaditya yoga", "Ruchaka yoga"} <= names
