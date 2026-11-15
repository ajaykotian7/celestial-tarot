"""Jataka: the Vedic birth chart (kundali) and what it says about time.

The nine grahas in their rashis and houses, the navamsa, Vimshottari dasha down to
pratyantardasha, the transits that matter most (Shani, Guru, Rahu and Ketu, including
Sade Sati and Dhaiya), doshas with their traditional cancellations, and yogas.

Conventions, as in most printed Indian charts: Lahiri ayanamsa, mean lunar nodes for
Rahu and Ketu, whole-sign houses counted from the lagna, and dasha years of 365.25
days. A jataka needs the birth time and place: the lagna moves a sign every two hours
or so, and the Moon (which sets the dashas) half a degree an hour.

Doshas are checked by the most commonly used rules. Jyotishis differ on many of them,
so each one says what was found and why, rather than issuing a verdict.
"""

import bisect
import copy
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from skyfield.framelib import ecliptic_frame

from astrology import (
    BODIES,
    EPHEMERIS_FIRST_DAY,
    EPHEMERIS_LAST_DAY,
    _ephemeris,
    ascendant,
    birth_moment,
    ecliptic_longitude,
    in_ephemeris,
)
from jyotish import (
    AYANAMSA_J2000,
    NAKSHATRA_SPAN,
    PRECESSION_DEGREES_PER_YEAR,
    ayanamsa,
    nakshatra_of,
    rashi_of,
    tithi_of,
)

J2000 = 2451545.0

# key -> (name, Devanagari, English, chart abbreviation)
GRAHAS = {
    "sun": ("Surya", "सूर्य", "Sun", "Su"),
    "moon": ("Chandra", "चन्द्र", "Moon", "Mo"),
    "mars": ("Mangal", "मंगल", "Mars", "Ma"),
    "mercury": ("Budh", "बुध", "Mercury", "Me"),
    "jupiter": ("Guru", "गुरु", "Jupiter", "Ju"),
    "venus": ("Shukra", "शुक्र", "Venus", "Ve"),
    "saturn": ("Shani", "शनि", "Saturn", "Sa"),
    "rahu": ("Rahu", "राहु", "north lunar node", "Ra"),
    "ketu": ("Ketu", "केतु", "south lunar node", "Ke"),
}
# The seven visible grahas, which can be retrograde, combust or dignified
PLANETS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"]
# Mars to Saturn: the grahas that make (or break) Kemadruma and the Mahapurusha yogas
TARA_GRAHAS = ["mars", "mercury", "jupiter", "venus", "saturn"]

# Ruler of each rashi, Mesha first
SIGN_LORDS = [
    "mars", "venus", "mercury", "moon", "sun", "mercury",
    "venus", "mars", "jupiter", "saturn", "saturn", "jupiter",
]
EXALTATION = {"sun": 0, "moon": 1, "mars": 9, "mercury": 5, "jupiter": 3, "venus": 11, "saturn": 6}
OWN_SIGNS = {
    "sun": {4}, "moon": {3}, "mars": {0, 7}, "mercury": {2, 5},
    "jupiter": {8, 11}, "venus": {1, 6}, "saturn": {9, 10},
}
# Degrees from the Sun within which a graha is combust (asta); tighter when retrograde
COMBUSTION = {"moon": 12, "mars": 17, "mercury": 14, "jupiter": 11, "venus": 10, "saturn": 15}
COMBUSTION_RETROGRADE = {"mercury": 12, "venus": 8}
# Every graha aspects the 7th house from itself; these also aspect others
SPECIAL_ASPECTS = {"mars": {4, 8}, "jupiter": {5, 9}, "saturn": {3, 10}}
KENDRAS = {1, 4, 7, 10}

# Vimshottari: the order of the lords and their years (120 in all). The Moon's
# nakshatra at birth picks the first lord; nakshatra n is ruled by DASHA_ORDER[n % 9].
DASHA_ORDER = ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"]
DASHA_YEARS = {
    "ketu": 7, "venus": 20, "sun": 6, "moon": 10, "mars": 7,
    "rahu": 18, "jupiter": 16, "saturn": 19, "mercury": 17,
}
DASHA_YEAR_DAYS = 365.25

# Ingress tables are sampled this often, then refined to the day
INGRESS_STEP_DAYS = 4

# Kaal Sarp types, by the house Rahu occupies
KAAL_SARP_TYPES = [
    "Anant", "Kulik", "Vasuki", "Shankhpal", "Padma", "Mahapadma",
    "Takshak", "Karkotak", "Shankhachud", "Ghatak", "Vishdhar", "Sheshnag",
]
# The gandanta nakshatras, where a water sign meets a fire sign
GANDMOOL_NAKSHATRAS = {0, 8, 9, 17, 18, 26}
MANGAL_HOUSES = {1, 2, 4, 7, 8, 12}
# Mars in these houses and signs is a widely cited exception to Mangal dosha
MANGAL_EXCEPTIONS = {2: {2, 5}, 4: {0, 7}, 7: {3, 9}, 8: {8, 11}, 12: {1, 6}}

SADE_SATI_PHASES = {11: "rising", 0: "peak", 1: "setting"}
SADE_SATI_PHASE_MEANING = {
    "rising": "Shani in the 12th from the Moon",
    "peak": "Shani over the natal Moon",
    "setting": "Shani in the 2nd from the Moon",
}
DHAIYA = {3: "Kantaka Shani (4th from the Moon)", 7: "Ashtama Shani (8th from the Moon)"}
# Saturn re-entering a sign after a retrograde loop continues the same period
EPISODE_GAP = timedelta(days=400)

MAHAPURUSHA = {
    "mars": ("Ruchaka", "courage, vigour and command"),
    "mercury": ("Bhadra", "intellect, speech and skill"),
    "jupiter": ("Hamsa", "wisdom, virtue and good counsel"),
    "venus": ("Malavya", "grace, comfort and the arts"),
    "saturn": ("Sasa", "discipline, endurance and authority"),
}

ORDINALS = {1: "1st", 2: "2nd", 3: "3rd"}


def ordinal(n: int) -> str:
    return ORDINALS.get(n, f"{n}th")


def graha_name(key: str) -> str:
    return GRAHAS[key][0]


def graha_label(key: str) -> str:
    """'Shani (Saturn)', for prompts."""
    name, _, english, _ = GRAHAS[key]
    if key in ("rahu", "ketu"):
        return name
    return f"{name} ({english})"


def house_from(sign: int, reference: int) -> int:
    """Whole-sign house of `sign` counted from `reference` (1-12)."""
    return (sign - reference) % 12 + 1


def aspects(graha: str, from_sign: int, to_sign: int) -> bool:
    return house_from(to_sign, from_sign) in {7} | SPECIAL_ASPECTS.get(graha, set())


# --- Positions ---


def _julian_centuries(tt: Any) -> Any:
    return (tt - J2000) / 36525


def mean_rahu_tropical(tt: Any) -> Any:
    """Mean longitude of the Moon's ascending node (Meeus 47.7), degrees."""
    t = _julian_centuries(tt)
    return (
        125.0445479 - 1934.1362891 * t + 0.0020754 * t**2 + t**3 / 467441 - t**4 / 60616000
    ) % 360


def _ayanamsa_tt(tt: Any) -> Any:
    return AYANAMSA_J2000 + PRECESSION_DEGREES_PER_YEAR * (tt - J2000) / 365.25


def graha_longitude(key: str, when: datetime) -> float:
    """Sidereal (Lahiri) longitude of a graha, degrees."""
    if key in ("rahu", "ketu"):
        ts, _ = _ephemeris()
        tt = ts.from_datetime(when).tt
        rahu = (mean_rahu_tropical(tt) - _ayanamsa_tt(tt)) % 360
        return rahu if key == "rahu" else (rahu + 180) % 360
    return (ecliptic_longitude(key, when) - ayanamsa(when)) % 360


def _series(key: str, t: Any) -> Any:
    """Sidereal longitudes for a vector of Skyfield times."""
    if key in ("rahu", "ketu"):
        rahu = (mean_rahu_tropical(t.tt) - _ayanamsa_tt(t.tt)) % 360
        return rahu if key == "rahu" else (rahu + 180) % 360
    _, eph = _ephemeris()
    position = eph["earth"].at(t).observe(eph[BODIES[key]]).apparent(deflectors=(10,))
    _, lon, _ = position.frame_latlon(ecliptic_frame)
    return (lon.degrees - _ayanamsa_tt(t.tt)) % 360


@lru_cache(maxsize=None)
def sign_ingresses(key: str) -> Tuple[Tuple[date, int], ...]:
    """Every day the graha entered a new sidereal sign, 1900-2099, retrograde
    re-entries included, as (date, sign index). Days are in Indian Standard Time, as
    in Indian panchangs. The first entry is the sign it was in when the ephemeris
    begins."""
    ts, _ = _ephemeris()
    first = EPHEMERIS_FIRST_DAY
    span = (EPHEMERIS_LAST_DAY - first).days
    days = np.arange(0, span + 1, INGRESS_STEP_DAYS)

    def signs_on(day_offsets: Any) -> Any:
        # Midnight IST (18:30 UTC the evening before) at the start of each day
        t = ts.utc(first.year, first.month, first.day - 1 + day_offsets, 18, 30)
        return (_series(key, t) // 30).astype(int) % 12

    signs = signs_on(days)
    changes = np.nonzero(signs[1:] != signs[:-1])[0]
    table = [(first, int(signs[0]))]
    if len(changes) == 0:
        return tuple(table)

    # The first midnight in the new sign; the change happened during the day before
    offsets = np.arange(1, INGRESS_STEP_DAYS)
    candidates = (days[changes][:, None] + offsets[None, :]).ravel()
    refined = signs_on(candidates).reshape(len(changes), len(offsets))
    for row, i in zip(refined, changes):
        moved = np.nonzero(row != signs[i])[0]
        if len(moved):
            day, sign = int(days[i] + offsets[moved[0]]), int(row[moved[0]])
        else:
            day, sign = int(days[i + 1]), int(signs[i + 1])
        table.append((first + timedelta(days=day - 1), sign))
    return tuple(table)


def transit(key: str, day: date) -> Dict[str, Any]:
    """The sign a slow graha is in on a day, and when it entered and leaves it."""
    table = sign_ingresses(key)
    i = bisect.bisect_right([d for d, _ in table], day) - 1
    i = max(i, 0)
    since, sign = table[i]
    until = table[i + 1][0] if i + 1 < len(table) else None
    return {"sign": sign, "since": since, "until": until}


def _spans(key: str):
    table = sign_ingresses(key)
    for i, (start, sign) in enumerate(table):
        end = table[i + 1][0] if i + 1 < len(table) else EPHEMERIS_LAST_DAY
        yield start, end, sign


# --- Natal chart ---


def _dignity(key: str, sign: int) -> Optional[str]:
    if key not in EXALTATION:
        return None
    if sign == EXALTATION[key]:
        return "exalted"
    if sign == (EXALTATION[key] + 6) % 12:
        return "debilitated"
    if sign in OWN_SIGNS[key]:
        return "own sign"
    return None


def _separation(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


@lru_cache(maxsize=128)
def natal_chart(
    birth_date: date,
    birth_time: time,
    tz_name: str,
    latitude: float,
    longitude: float,
) -> Optional[Dict[str, Any]]:
    """The grahas, lagna and navamsa at birth. Cached; callers copy before changing."""
    instant, _, _ = birth_moment(birth_date, birth_time, tz_name)
    if instant is None:
        return None

    lagna_lon = (ascendant(instant, latitude, longitude) - ayanamsa(instant)) % 360
    lagna_sign = int(lagna_lon // 30)
    longitudes = {key: graha_longitude(key, instant) for key in GRAHAS}
    sun = longitudes["sun"]

    grahas = []
    for key, lon in longitudes.items():
        name, devanagari, english, short = GRAHAS[key]
        sign = int(lon // 30)
        if key in ("rahu", "ketu"):
            # The mean nodes always move backwards
            retrograde = True
        elif key in ("sun", "moon"):
            retrograde = False
        else:
            before = graha_longitude(key, instant - timedelta(hours=12))
            after = graha_longitude(key, instant + timedelta(hours=12))
            retrograde = (after - before + 540) % 360 - 180 < 0
        orb = (COMBUSTION_RETROGRADE if retrograde else {}).get(key, COMBUSTION.get(key))
        nakshatra = nakshatra_of(lon)
        grahas.append(
            {
                "key": key,
                "name": name,
                "devanagari": devanagari,
                "english": english,
                "short": short,
                "longitude": round(lon, 4),
                "sign": sign,
                "rashi": rashi_of(lon)["name"],
                "degree": round(lon % 30, 2),
                "nakshatra": nakshatra["name"],
                "pada": nakshatra["pada"],
                "house": house_from(sign, lagna_sign),
                "retrograde": bool(retrograde),
                "combust": bool(orb is not None and _separation(lon, sun) < orb),
                "dignity": _dignity(key, sign),
                # Each navamsa is 3°20'; counting them from Mesha gives the D9 sign
                "navamsa": int(lon // (30 / 9)) % 12,
            }
        )

    lagna_nakshatra = nakshatra_of(lagna_lon)
    return {
        "lagna": {
            **rashi_of(lagna_lon),
            "sign": lagna_sign,
            "degree": round(lagna_lon % 30, 2),
            "nakshatra": lagna_nakshatra["name"],
            "pada": lagna_nakshatra["pada"],
            "navamsa": int(lagna_lon // (30 / 9)) % 12,
        },
        "grahas": grahas,
        "birth_tithi": tithi_of((longitudes["moon"] - sun) % 360)["number"],
        "instant": instant,
    }


# --- Vimshottari dasha ---


def _years(n: float) -> timedelta:
    return timedelta(days=n * DASHA_YEAR_DAYS)


def _subperiods(lord: str, start: datetime, years: float) -> List[Dict[str, Any]]:
    """The nine sub-periods of a period, starting with its own lord."""
    first = DASHA_ORDER.index(lord)
    periods = []
    for i in range(9):
        sub = DASHA_ORDER[(first + i) % 9]
        length = years * DASHA_YEARS[sub] / 120
        periods.append({"lord": sub, "start": start, "end": start + _years(length), "years": length})
        start = periods[-1]["end"]
    return periods


def vimshottari(moon_longitude: float, birth: datetime) -> List[Dict[str, Any]]:
    """The nine mahadashas from the one running at birth (which began before it), each
    with its antardashas. 120 years in all."""
    index = int(moon_longitude % 360 // NAKSHATRA_SPAN)
    lord = DASHA_ORDER[index % 9]
    elapsed = (moon_longitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN
    start = birth - _years(DASHA_YEARS[lord] * elapsed)
    mahadashas = _subperiods(lord, start, 120)
    for md in mahadashas:
        md["antardashas"] = _subperiods(md["lord"], md["start"], md["years"])
    return mahadashas


def _running(periods: List[Dict[str, Any]], now: datetime) -> Optional[Dict[str, Any]]:
    return next((p for p in periods if p["start"] <= now < p["end"]), None)


def current_dasha(mahadashas: List[Dict[str, Any]], now: datetime) -> Optional[Dict[str, Any]]:
    md = _running(mahadashas, now)
    if md is None:
        return None
    ad = _running(md["antardashas"], now)
    pd = _running(_subperiods(ad["lord"], ad["start"], ad["years"]), now)
    return {"mahadasha": md, "antardasha": ad, "pratyantardasha": pd}


# --- Sade Sati and Dhaiya ---


def saturn_periods(moon_sign: int, offsets: Dict[int, str]) -> List[Dict[str, Any]]:
    """Spells of Shani in the given houses from the Moon (0 = over it), merging the
    returns of a retrograde loop into one period. Each has its phases in order."""
    episodes: List[Dict[str, Any]] = []
    for start, end, sign in _spans("saturn"):
        phase = offsets.get((sign - moon_sign) % 12)
        if phase is None:
            continue
        if episodes and start - episodes[-1]["end"] <= EPISODE_GAP:
            episodes[-1]["end"] = end
            episodes[-1]["phases"].append({"phase": phase, "start": start, "end": end})
        else:
            episodes.append(
                {"start": start, "end": end, "phases": [{"phase": phase, "start": start, "end": end}]}
            )
    return episodes


def _sade_sati(moon_sign: int, birth: date, today: date) -> Dict[str, Any]:
    def in_life(periods):
        return [p for p in periods if p["end"] > birth]

    def now_in(periods):
        for p in periods:
            if p["start"] <= today < p["end"]:
                phase = next(
                    (ph["phase"] for ph in p["phases"] if ph["start"] <= today < ph["end"]),
                    p["phases"][-1]["phase"],
                )
                return {"start": p["start"], "end": p["end"], "phase": phase}
        return None

    sade_sati = in_life(saturn_periods(moon_sign, SADE_SATI_PHASES))
    dhaiya = in_life(saturn_periods(moon_sign, DHAIYA))
    for period in dhaiya:
        period["kind"] = period["phases"][0]["phase"]
    return {
        "periods": [{"start": p["start"], "end": p["end"]} for p in sade_sati],
        "current": now_in(sade_sati),
        "dhaiya": [{"start": p["start"], "end": p["end"], "kind": p["kind"]} for p in dhaiya],
        "current_dhaiya": next(
            ({"start": p["start"], "end": p["end"], "kind": p["kind"]} for p in dhaiya
             if p["start"] <= today < p["end"]),
            None,
        ),
    }


def guru_periods(moon_sign: int, birth: date, years: int = 100) -> List[Dict[str, Any]]:
    """Guru's passage through the signs over a lifetime, counted from the birth Moon.
    The 2nd, 5th, 7th, 9th and 11th from the Moon are traditionally favourable."""
    last = birth + timedelta(days=int(years * 365.25))
    periods = []
    for start, end, sign in _spans("jupiter"):
        if end <= birth or start > last:
            continue
        house = house_from(sign, moon_sign)
        periods.append(
            {
                "start": start,
                "end": end,
                "sign": sign,
                "rashi": rashi_of(sign * 30)["name"],
                "from_moon": house,
                "favourable": house in (2, 5, 7, 9, 11),
            }
        )
    return periods


def moon_timeline(moon_sign: int, birth: date, today: date) -> Dict[str, Any]:
    """The transits that need only the birth Moon's sign: Sade Sati, Dhaiya and Guru."""
    return {"sade_sati": _sade_sati(moon_sign, birth, today), "guru": guru_periods(moon_sign, birth)}


# --- Doshas ---


def _dosha(key, name, devanagari, status, detail, cancellations=None, note=None):
    """status: present, mild (a lighter form), cancelled, or absent."""
    return {
        "key": key,
        "name": name,
        "devanagari": devanagari,
        "status": status,
        "detail": detail,
        "cancellations": cancellations or [],
        "note": note,
    }


def doshas(chart: Dict[str, Any], sade_sati: Dict[str, Any]) -> List[Dict[str, Any]]:
    g = {x["key"]: x for x in chart["grahas"]}
    lagna = chart["lagna"]["sign"]
    moon = g["moon"]["sign"]
    sign = {k: x["sign"] for k, x in g.items()}
    together = lambda a, b: sign[a] == sign[b]  # noqa: E731
    found = []

    # Mangal (Kuja, Chevvai) dosha: Mars in 1, 2, 4, 7, 8 or 12 from lagna, Moon or Venus
    mars = sign["mars"]
    from_where = [
        label
        for label, ref in (("lagna", lagna), ("Moon", moon), ("Venus", sign["venus"]))
        if house_from(mars, ref) in MANGAL_HOUSES
    ]
    mars_house = house_from(mars, lagna)
    cancellations = []
    if g["mars"]["dignity"] in ("own sign", "exalted"):
        cancellations.append(f"Mangal is in its {g['mars']['dignity']} ({g['mars']['rashi']})")
    if together("jupiter", "mars") or aspects("jupiter", sign["jupiter"], mars):
        cancellations.append("Guru joins or aspects Mangal")
    if lagna in (3, 4):
        cancellations.append(
            f"for a {chart['lagna']['name']} lagna, Mangal is a yogakaraka (a benefic)"
        )
    if mars in MANGAL_EXCEPTIONS.get(mars_house, set()):
        cancellations.append(f"Mangal in {g['mars']['rashi']} in the {ordinal(mars_house)} house is an exception")
    if not from_where:
        status, detail = "absent", f"Mangal sits in the {ordinal(mars_house)} house, outside the Mangal dosha houses."
    else:
        detail = (
            f"Mangal is in the {ordinal(mars_house)} house from the lagna"
            if "lagna" in from_where
            else f"Mangal is in a Mangal dosha house from the {' and '.join(from_where)}, though not from the lagna"
        )
        if "lagna" in from_where and len(from_where) > 1:
            detail += f", and from the {' and '.join(w for w in from_where if w != 'lagna')} too"
        detail += "."
        status = "cancelled" if cancellations else ("present" if "lagna" in from_where else "mild")
    found.append(
        _dosha(
            "mangal", "Mangal dosha", "मंगल दोष", status, detail, cancellations,
            "Also called Kuja or Chevvai dosha. Traditionally weighed in marriage matching; "
            "it is also considered cancelled when both partners have it, and many say it "
            "softens after the age of 28.",
        )
    )

    # Kaal Sarp: the seven grahas all on one side of the Rahu-Ketu axis
    rahu = g["rahu"]["longitude"]
    sides = [(g[k]["longitude"] - rahu) % 360 < 180 for k in PLANETS]
    outside = min(sides.count(True), sides.count(False))
    kind = KAAL_SARP_TYPES[g["rahu"]["house"] - 1]
    if outside == 0:
        status = "present"
        detail = f"All seven grahas lie between Rahu and Ketu: {kind} Kaal Sarp, with Rahu in the {ordinal(g['rahu']['house'])} house."
    elif outside == 1:
        odd_one = next(k for k, side in zip(PLANETS, sides) if side != (sides.count(True) > 1))
        status = "mild"
        detail = f"All but {graha_name(odd_one)} lie between Rahu and Ketu, a partial (anshik) Kaal Sarp."
    else:
        status = "absent"
        detail = "The grahas fall on both sides of the Rahu–Ketu axis."
    found.append(
        _dosha(
            "kaal_sarp", "Kaal Sarp dosha", "काल सर्प दोष", status, detail, [],
            "A later addition to Jyotish, not found in the classical texts; many jyotishis "
            "give it little weight.",
        )
    )

    # Sade Sati and Dhaiya: Shani transiting around the natal Moon (current only)
    current = sade_sati["current"]
    found.append(
        _dosha(
            "sade_sati", "Sade Sati", "साढ़े साती",
            "present" if current else "absent",
            (
                f"Running now, in its {current['phase']} phase "
                f"({SADE_SATI_PHASE_MEANING[current['phase']]})."
                if current
                else "Not running now."
            ),
            [],
            "Seven and a half years of Shani passing the 12th, 1st and 2nd from the Moon: "
            "a time of hard work, patience and maturing, not only of trouble.",
        )
    )
    dhaiya = sade_sati["current_dhaiya"]
    found.append(
        _dosha(
            "dhaiya", "Shani Dhaiya", "शनि ढैय्या",
            "present" if dhaiya else "absent",
            f"Running now: {dhaiya['kind']}." if dhaiya else "Not running now.",
            [],
            "Two and a half years of Shani in the 4th or 8th from the Moon.",
        )
    )

    # Pitru dosha: the Sun (the father, the ancestors) with the nodes or Shani, or the
    # nodes in the 9th house
    reasons = []
    for other in ("rahu", "ketu", "saturn"):
        if together("sun", other):
            reasons.append(f"Surya is joined by {graha_name(other)}")
    for node in ("rahu", "ketu"):
        if g[node]["house"] == 9:
            reasons.append(f"{graha_name(node)} is in the 9th house, the house of the ancestors")
    found.append(
        _dosha(
            "pitru", "Pitru dosha", "पितृ दोष",
            "present" if reasons else "absent",
            ("; ".join(reasons) + ".") if reasons else "No affliction to the Sun or the 9th house by the nodes.",
            [],
            "Traditionally eased by remembering the ancestors, as at Pitru Paksha and Amavasya.",
        )
    )

    # Grahan dosha: a luminary eclipsed by a node
    eclipsed = [
        f"{graha_name(light)} with {graha_name(node)}"
        for light in ("sun", "moon")
        for node in ("rahu", "ketu")
        if together(light, node)
    ]
    found.append(
        _dosha(
            "grahan", "Grahan dosha", "ग्रहण दोष",
            "present" if eclipsed else "absent",
            ("An eclipse in the chart: " + ", ".join(eclipsed) + ".") if eclipsed else "Neither the Sun nor the Moon sits with Rahu or Ketu.",
        )
    )

    def pair(key, name, devanagari, a, nodes, meaning):
        joined = [n for n in nodes if together(a, n)]
        found.append(
            _dosha(
                key, name, devanagari,
                "present" if joined else "absent",
                (
                    f"{graha_name(a)} sits with {' and '.join(graha_name(n) for n in joined)}: {meaning}."
                    if joined
                    else f"{graha_name(a)} is not joined by {' or '.join(graha_name(n) for n in nodes)}."
                ),
            )
        )

    pair("guru_chandal", "Guru Chandal dosha", "गुरु चांडाल दोष", "jupiter", ("rahu", "ketu"),
         "wisdom clouded by restless desire, or unconventional beliefs")
    pair("angarak", "Angarak dosha", "अंगारक दोष", "mars", ("rahu", "ketu"),
         "fiery energy that needs patience and an outlet")
    pair("shrapit", "Shrapit dosha", "श्रापित दोष", "saturn", ("rahu",),
         "delays and karmic lessons that reward persistence")
    pair("vish", "Vish dosha", "विष दोष", "moon", ("saturn",),
         "a heavy, serious mind that learns to find its own light")

    # Punarphoo: Shani aspecting the Moon (their conjunction is Vish dosha)
    aspected = not together("saturn", "moon") and aspects("saturn", sign["saturn"], moon)
    found.append(
        _dosha(
            "punarphoo", "Punarphoo dosha", "पुनर्फू दोष",
            "present" if aspected else "absent",
            (
                f"Shani aspects the Moon from the {ordinal(house_from(sign['saturn'], moon))} house from it: hesitation and delays, especially around marriage."
                if aspected
                else "Shani does not aspect the Moon."
            ),
        )
    )

    # Kemadruma: the Moon alone, with no graha (Mars to Saturn) in the 2nd or 12th from it
    neighbours = [k for k in TARA_GRAHAS if house_from(sign[k], moon) in (2, 12)]
    if neighbours:
        status, detail, cancellations = "absent", "The Moon has company in the houses beside it.", []
    else:
        cancellations = []
        companions = [k for k in TARA_GRAHAS if house_from(sign[k], moon) in KENDRAS]
        if companions:
            cancellations.append(
                f"{', '.join(graha_name(k) for k in companions)} in a kendra from the Moon"
            )
        if house_from(moon, lagna) in KENDRAS:
            cancellations.append("the Moon is in a kendra from the lagna")
        status = "cancelled" if cancellations else "present"
        detail = "No graha stands in the 2nd or 12th from the Moon, so the Moon is alone."
    found.append(
        _dosha(
            "kemadruma", "Kemadruma dosha", "केमद्रुम दोष", status, detail, cancellations,
            "Traditionally a feeling of standing alone; it is very often cancelled.",
        )
    )

    # Shakata: the Moon in the 6th, 8th or 12th from Jupiter, like a cart wheel's ups and downs
    from_jupiter = house_from(moon, sign["jupiter"])
    if from_jupiter in (6, 8, 12):
        cancellations = ["the Moon is in a kendra from the lagna"] if house_from(moon, lagna) in KENDRAS else []
        status = "cancelled" if cancellations else "present"
        detail = f"The Moon is in the {ordinal(from_jupiter)} from Guru: fortunes that rise and fall like a cart wheel."
    else:
        status, cancellations = "absent", []
        detail = f"The Moon is in the {ordinal(from_jupiter)} from Guru."
    found.append(_dosha("shakata", "Shakata dosha", "शकट दोष", status, detail, cancellations))

    # Gandmool: the Moon in a gandanta nakshatra, where water signs meet fire signs
    moon_nakshatra = g["moon"]["nakshatra"]
    gandmool = int(g["moon"]["longitude"] // NAKSHATRA_SPAN) in GANDMOOL_NAKSHATRAS
    found.append(
        _dosha(
            "gandmool", "Gandmool dosha", "गंडमूल दोष",
            "present" if gandmool else "absent",
            (
                f"Born with the Moon in {moon_nakshatra}, one of the six Gandmool nakshatras."
                if gandmool
                else f"The Moon's nakshatra, {moon_nakshatra}, is not a Gandmool nakshatra."
            ),
            [],
            "Traditionally addressed with a Gandmool shanti puja on the nakshatra's return, "
            "27 days after birth.",
        )
    )

    # Naga (Sarpa) dosha, as weighed in South Indian matching: Rahu or Ketu in the
    # 1st, 2nd, 7th or 8th from the lagna (or, more lightly, from the Moon)
    in_lagna = [n for n in ("rahu", "ketu") if g[n]["house"] in (1, 2, 7, 8)]
    in_moon = [n for n in ("rahu", "ketu") if house_from(sign[n], moon) in (1, 2, 7, 8)]
    if in_lagna:
        status = "present"
        detail = ", ".join(f"{graha_name(n)} in the {ordinal(g[n]['house'])} house" for n in in_lagna) + "."
    elif in_moon:
        status = "mild"
        detail = ", ".join(f"{graha_name(n)} in the {ordinal(house_from(sign[n], moon))} from the Moon" for n in in_moon) + ", though not from the lagna."
    else:
        status, detail = "absent", "Rahu and Ketu are away from the 1st, 2nd, 7th and 8th houses."
    found.append(
        _dosha(
            "naga", "Naga dosha (Rahu–Ketu)", "नाग दोष", status, detail, [],
            "Also called Sarpa dosha. Weighed in South Indian matching, where it is balanced "
            "when both partners have it.",
        )
    )

    # Born on Amavasya
    amavasya = chart["birth_tithi"] == 30
    found.append(
        _dosha(
            "amavasya", "Amavasya dosha", "अमावस्या दोष",
            "present" if amavasya else "absent",
            "Born on Amavasya, the moonless night." if amavasya else "Not born on Amavasya.",
        )
    )

    order = {"present": 0, "mild": 1, "cancelled": 2, "absent": 3}
    return sorted(found, key=lambda d: order[d["status"]])


# --- Yogas ---


def yogas(chart: Dict[str, Any]) -> List[Dict[str, str]]:
    g = {x["key"]: x for x in chart["grahas"]}
    lagna = chart["lagna"]["sign"]
    moon = g["moon"]["sign"]
    sign = {k: x["sign"] for k, x in g.items()}
    found = []

    def add(name, devanagari, detail):
        found.append({"name": name, "devanagari": devanagari, "detail": detail})

    if house_from(sign["jupiter"], moon) in KENDRAS:
        add("Gaja Kesari yoga", "गजकेसरी योग",
            "Guru in a kendra from the Moon: wisdom, good name and protection.")
    if sign["sun"] == sign["mercury"]:
        add("Budhaditya yoga", "बुधादित्य योग",
            "Surya with Budh: a bright, quick and articulate mind.")
    if sign["moon"] == sign["mars"]:
        add("Chandra-Mangal yoga", "चन्द्र-मंगल योग",
            "Moon with Mangal: drive and a gift for earning.")
    for key, (name, gift) in MAHAPURUSHA.items():
        if g[key]["dignity"] in ("own sign", "exalted") and g[key]["house"] in KENDRAS:
            add(f"{name} yoga", "पञ्च महापुरुष योग",
                f"{graha_name(key)} strong in a kendra, one of the five great-person yogas: {gift}.")

    second = [k for k in TARA_GRAHAS if house_from(sign[k], moon) == 2]
    twelfth = [k for k in TARA_GRAHAS if house_from(sign[k], moon) == 12]
    if second and twelfth:
        add("Durudhara yoga", "दुरुधरा योग",
            "Grahas on both sides of the Moon: support, comfort and generosity.")
    elif second:
        add("Sunapha yoga", "सुनफा योग",
            "A graha in the 2nd from the Moon: self-made wealth and a good reputation.")
    elif twelfth:
        add("Anapha yoga", "अनफा योग",
            "A graha in the 12th from the Moon: good health, poise and a gracious nature.")

    # Neecha bhanga: a debilitated graha redeemed when the lord of its sign, or of its
    # exaltation sign, stands in a kendra from the lagna or the Moon
    for key in PLANETS:
        if g[key]["dignity"] != "debilitated":
            continue
        helpers = {SIGN_LORDS[sign[key]], SIGN_LORDS[EXALTATION[key]]}
        if any(
            house_from(sign[h], lagna) in KENDRAS or house_from(sign[h], moon) in KENDRAS
            for h in helpers
        ):
            add("Neecha Bhanga Raja yoga", "नीचभंग राजयोग",
                f"{graha_name(key)} is debilitated, but the weakness is cancelled: strength "
                "that comes after early struggle.")
    return found


# --- Putting it together ---


def _transits(chart: Dict[str, Any], today: date) -> List[Dict[str, Any]]:
    moon = next(x for x in chart["grahas"] if x["key"] == "moon")["sign"]
    lagna = chart["lagna"]["sign"]
    result = []
    for key in ("saturn", "jupiter", "rahu", "ketu"):
        # Ketu is always opposite Rahu, entering signs on the same days
        now = transit("rahu" if key == "ketu" else key, today)
        sign = (now["sign"] + 6) % 12 if key == "ketu" else now["sign"]
        result.append(
            {
                "key": key,
                "name": graha_name(key),
                "sign": sign,
                "rashi": rashi_of(sign * 30)["name"],
                "from_moon": house_from(sign, moon),
                "from_lagna": house_from(sign, lagna),
                "since": now["since"],
                "until": now["until"],
            }
        )
    return result


def _public_dasha(mahadashas, now: datetime) -> Dict[str, Any]:
    def period(p):
        return {"lord": graha_name(p["lord"]), "key": p["lord"], "start": p["start"].date(), "end": p["end"].date()}

    current = current_dasha(mahadashas, now)
    return {
        "mahadashas": [
            {**period(md), "antardashas": [period(ad) for ad in md["antardashas"]]}
            for md in mahadashas
        ],
        "current": current and {level: period(p) for level, p in current.items()},
    }


@lru_cache(maxsize=128)
def _jataka(
    birth_date: date,
    birth_time: time,
    tz_name: str,
    latitude: float,
    longitude: float,
    today: date,
) -> Optional[Dict[str, Any]]:
    if not in_ephemeris(birth_date):
        return None
    chart = natal_chart(birth_date, birth_time, tz_name, latitude, longitude)
    if chart is None:
        return None
    chart = copy.deepcopy(chart)
    instant = chart.pop("instant")
    moon = next(x for x in chart["grahas"] if x["key"] == "moon")
    now = datetime.combine(today, time(12), tzinfo=timezone.utc)
    sade_sati = _sade_sati(moon["sign"], birth_date, today)
    return {
        **chart,
        "dasha": _public_dasha(vimshottari(moon["longitude"], instant), now),
        "transits": _transits(chart, today),
        "sade_sati": sade_sati,
        "doshas": doshas(chart, sade_sati),
        "yogas": yogas(chart),
        # The houses each graha rules, counted from the lagna
        "lordships": house_lordships(chart["lagna"]["sign"]),
        "conventions": "Lahiri ayanamsa, mean Rahu and Ketu, whole-sign houses, 365.25-day dasha years",
    }


def jataka(
    birth_date: date,
    today: date,
    birth_time: Optional[time] = None,
    tz_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """The full jataka, or None without a birth time and place (a chart without them
    would be mostly guesswork). Returns a fresh copy the caller may change."""
    if birth_time is None or not tz_name or latitude is None or longitude is None:
        return None
    if not EPHEMERIS_FIRST_DAY <= today <= EPHEMERIS_LAST_DAY:
        return None
    result = _jataka(birth_date, birth_time, tz_name, latitude, longitude, today)
    return copy.deepcopy(result)


# --- The summary the reader sees ---
#
# Only signs, houses and periods: no degrees, no birth date, and no date in the birth
# year, so the summary doesn't give the birth details away as plainly as the chart would.


def _month(d: date) -> str:
    return d.strftime("%b %Y")


def house_lordships(lagna_sign: int) -> Dict[str, List[int]]:
    """The houses each graha rules, counted from the lagna (Rahu and Ketu rule none)."""
    ruled: Dict[str, List[int]] = {key: [] for key in PLANETS}
    for house in range(1, 13):
        ruled[SIGN_LORDS[(lagna_sign + house - 1) % 12]].append(house)
    return ruled


def _and(items: List[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def jataka_summary(j: Dict[str, Any], birth_date: date, today: date) -> str:
    def shown(d: date) -> bool:
        return d.year > birth_date.year

    ruled = house_lordships(j["lagna"]["sign"])
    house_of = {x["key"]: x["house"] for x in j["grahas"]}

    def role(key: str) -> str:
        """'lord of the 10th, in the 6th'"""
        rules = ruled.get(key)
        where = f"in the {ordinal(house_of[key])}"
        if not rules:
            return where
        return f"lord of the {_and([ordinal(h) for h in rules])}, {where}"

    lagna = j["lagna"]
    lines = [f"Lagna: {lagna['name']} ({lagna['western']}), ruled by {lagna['lord']}."]

    placements = []
    for x in j["grahas"]:
        flags = [f for f in (x["dignity"], "retrograde" if x["retrograde"] and x["key"] not in ("rahu", "ketu") else None, "combust" if x["combust"] else None) if f]
        text = f"{graha_label(x['key'])} in {x['rashi']}, {ordinal(x['house'])} house"
        if flags:
            text += f" ({', '.join(flags)})"
        placements.append(text)
    lines.append("Grahas: " + "; ".join(placements) + ".")
    lines.append(
        "House lords: "
        + "; ".join(
            f"{graha_name(key)} rules the {_and([ordinal(h) for h in houses])}"
            for key, houses in ruled.items()
            if houses
        )
        + "."
    )
    moon = next(x for x in j["grahas"] if x["key"] == "moon")
    lines.append(f"Moon nakshatra: {moon['nakshatra']} pada {moon['pada']}.")

    dasha = j["dasha"]
    current = dasha["current"]
    if current:
        md, ad, pd = current["mahadasha"], current["antardasha"], current["pratyantardasha"]
        lines.append(
            f"Running now: {md['lord']} mahadasha ({role(md['key'])}; until {_month(md['end'])}), "
            f"{ad['lord']} antardasha ({role(ad['key'])}; until {_month(ad['end'])}), "
            f"{pd['lord']} pratyantardasha ({role(pd['key'])}; until {_month(pd['end'])})."
        )
        all_ads = [
            (m["lord"], a) for m in dasha["mahadashas"] for a in m["antardashas"]
        ]
        now_index = next(i for i, (_, a) in enumerate(all_ads) if a["start"] <= today < a["end"])
        past = [
            f"{m}–{a['lord']} ({_month(a['start'])}–{_month(a['end'])})"
            for m, a in all_ads[max(0, now_index - 4):now_index]
            if shown(a["start"])
        ]
        upcoming = [
            f"{m}–{a['lord']} ({_month(a['start'])}–{_month(a['end'])}; {a['lord']} is {role(a['key'])})"
            for m, a in all_ads[now_index + 1:now_index + 7]
        ]
        if past:
            lines.append("Recent periods (mahadasha–antardasha): " + "; ".join(past) + ".")
        if upcoming:
            lines.append("Coming periods: " + "; ".join(upcoming) + ".")
        later = [m for m in dasha["mahadashas"] if m["start"] > today][:2]
        if later:
            lines.append(
                "Next mahadashas: "
                + "; ".join(f"{m['lord']} from {_month(m['start'])}" for m in later)
                + "."
            )

    gochar = []
    for t in j["transits"]:
        text = (
            f"{graha_label(t['key'])} in {t['rashi']}, the {ordinal(t['from_moon'])} from the Moon "
            f"and {ordinal(t['from_lagna'])} from the lagna"
        )
        if t["until"]:
            text += f", until {_month(t['until'])}"
        gochar.append(text)
    lines.append(
        "Transits now (gochar: where these grahas are moving today, not their places at "
        "birth): " + "; ".join(gochar) + "."
    )

    ss = j["sade_sati"]
    if ss["current"]:
        c = ss["current"]
        lines.append(f"Sade Sati is running, {c['phase']} phase, until {c['end'].year}.")
    else:
        past = [p for p in ss["periods"] if p["end"] <= today and shown(p["start"])]
        future = [p for p in ss["periods"] if p["start"] > today]
        parts = ["Sade Sati is not running"]
        if past:
            parts.append(f"the last one was {past[-1]['start'].year}–{past[-1]['end'].year}")
        if future:
            parts.append(f"the next begins in {future[0]['start'].year}")
        lines.append("; ".join(parts) + ".")
    if ss["current_dhaiya"]:
        d = ss["current_dhaiya"]
        lines.append(f"Shani Dhaiya is running: {d['kind']}, until {d['end'].year}.")

    active = []
    for d in j["doshas"]:
        if d["key"] in ("sade_sati", "dhaiya") or d["status"] == "absent":
            continue
        text = f"{d['name']} ({d['status']}): {d['detail']}"
        if d["cancellations"]:
            text += f" Cancelled or eased because {'; '.join(d['cancellations'])}."
        active.append(text)
    absent = [d["name"] for d in j["doshas"] if d["status"] == "absent" and d["key"] not in ("sade_sati", "dhaiya")]
    if active:
        lines.append("Doshas: " + " ".join(active))
    if absent:
        lines.append("Not present: " + ", ".join(absent) + ".")
    if j["yogas"]:
        lines.append("Yogas: " + " ".join(f"{y['name']}: {y['detail']}" for y in j["yogas"]))
    return "\n".join(lines)


def current_line(j: Dict[str, Any]) -> str:
    """One line for every reading: the lagna, the running dasha and Sade Sati."""
    parts = [f"{j['lagna']['name']} lagna"]
    current = j["dasha"]["current"]
    if current:
        parts.append(
            f"running {current['mahadasha']['lord']} mahadasha, "
            f"{current['antardasha']['lord']} antardasha"
        )
    if j["sade_sati"]["current"]:
        parts.append(f"Sade Sati running ({j['sade_sati']['current']['phase']} phase)")
    return "; ".join(parts)


jataka_tool = {
    "type": "function",
    "function": {
        "name": "consult_jataka",
        "description": (
            "Reads the querent's own jataka (Vedic birth chart): their grahas by rashi and "
            "house, the dasha periods running now and coming, current transits including "
            "Sade Sati, and their doshas and yogas. Use it for questions about timing, life "
            "periods, the past and the future, career, marriage, health of mind, or doshas."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
}
