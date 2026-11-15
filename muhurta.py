"""The day as an Indian almanac sees it, for a place.

Sunrise and sunset; the panchang at sunrise (as printed calendars fix it); Rahu Kaal,
Yamaganda, Gulika and Abhijit muhurta; the day and night choghadiyas; how the day sits
with a person's birth Moon (Chandra bala, Tara bala, Chandrashtama); and a muhurat
finder that scores the coming days for an activity.

Times are aware datetimes in the place's time zone.
"""

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from skyfield import almanac
from skyfield.api import wgs84

from astrology import _ephemeris
from jyotish import (
    NAKSHATRA_SPAN,
    NAKSHATRAS,
    RASHIS,
    YOGAS,
    karana_of,
    tithi_of,
)
from kundali import _series, house_from

# Which eighth of the daytime each period takes, by weekday (Sunday = 0)
RAHU_KAAL = {0: 8, 1: 2, 2: 7, 3: 5, 4: 6, 5: 4, 6: 3}
YAMAGANDA = {0: 5, 1: 4, 2: 3, 3: 2, 4: 1, 5: 7, 6: 6}
GULIKA = {0: 7, 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1}

# Choghadiyas: (name, quality, meaning). The day sequence starts from the weekday's
# own choghadiya and runs through DAY_ORDER; the night uses NIGHT_ORDER.
CHOGHADIYA = {
    "Amrit": ("good", "nectar: the best for anything"),
    "Shubh": ("good", "auspicious: ceremonies and new starts"),
    "Labh": ("good", "gain: business, study and buying"),
    "Char": ("neutral", "moving: travel and changes"),
    "Udveg": ("bad", "anxiety: avoid new starts"),
    "Kaal": ("bad", "loss: avoid new starts"),
    "Rog": ("bad", "illness and quarrels: avoid new starts"),
}
DAY_ORDER = ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"]
NIGHT_ORDER = ["Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg"]

# Tara bala: counting from the birth nakshatra to the day's, in nines
TARAS = [
    ("Janma", None, "the birth star: a sensitive day, go gently"),
    ("Sampat", True, "wealth and gains"),
    ("Vipat", False, "obstacles; avoid risks"),
    ("Kshema", True, "well-being and safety"),
    ("Pratyak", False, "opposition; be patient"),
    ("Sadhana", True, "achievement: good for effort"),
    ("Naidhana", False, "the most testing star; avoid new starts"),
    ("Mitra", True, "friendly and helpful"),
    ("Param Mitra", True, "very friendly: a good day"),
]

# What the day's Moon brings, by its house from the birth Moon. Good: 1, 3, 6, 7, 10, 11.
MOON_HOUSES = {
    1: (True, "feelings run strong; a good day to begin things for yourself"),
    2: (False, "money and family talk; watch your words and spending"),
    3: (True, "courage and short journeys; good for effort"),
    4: (False, "home and mother; rest rather than push"),
    5: (False, "children and creativity, but the mind wanders; avoid speculation"),
    6: (True, "obstacles give way; good for work, health routines and settling disputes"),
    7: (True, "partners and agreements; good for meetings"),
    8: (False, "Chandrashtama: the Moon passes your 8th. Go gently and postpone big decisions"),
    9: (False, "elders and blessings, but energy is low; good for prayer"),
    10: (True, "work and recognition; good for career moves"),
    11: (True, "gains and friends; a good day to ask for things"),
    12: (False, "expenses and tiredness; good for rest and spiritual practice"),
}

# Nakshatra natures for muhurta (Muhurta Chintamani)
DHRUVA = {3, 11, 20, 25}  # fixed: Rohini, the three Uttaras
CHARA = {6, 14, 21, 22, 23}  # movable: Punarvasu, Swati, Shravana, Dhanishta, Shatabhisha
KSHIPRA = {0, 7, 12}  # swift: Ashwini, Pushya, Hasta
MRIDU = {4, 13, 16, 26}  # soft: Mrigashira, Chitra, Anuradha, Revati
UGRA = {1, 9, 10, 19, 24}  # fierce: Bharani, Magha, the three Purvas
TIKSHNA = {5, 8, 17, 18}  # sharp: Ardra, Ashlesha, Jyeshtha, Mula

# Weekdays with Sunday = 0
ACTIVITIES = {
    "work": {
        "label": "Start a new job or venture",
        "nakshatras": KSHIPRA | DHRUVA | MRIDU | CHARA,
        "weekdays": {1, 3, 4, 5},
    },
    "travel": {
        "label": "Begin a journey",
        "nakshatras": CHARA | KSHIPRA | MRIDU,
        "weekdays": {1, 3, 4, 5},
    },
    "vehicle": {
        "label": "Buy a vehicle",
        "nakshatras": CHARA | KSHIPRA | MRIDU | DHRUVA,
        "weekdays": {1, 3, 4, 5},
    },
    "home": {
        "label": "Move into a home or buy property",
        "nakshatras": DHRUVA | MRIDU,
        "weekdays": {1, 3, 4, 5},
        "shukla_only": True,
    },
    "study": {
        "label": "Begin studies or a course",
        "nakshatras": KSHIPRA | MRIDU | CHARA,
        "weekdays": {3, 4, 5},
    },
    "purchase": {
        "label": "Buy gold, jewellery or valuables",
        "nakshatras": KSHIPRA | MRIDU | CHARA | DHRUVA,
        "weekdays": {0, 3, 4, 5},
    },
}
# Lunar days good for beginnings (1-15 within either fortnight)
GOOD_TITHIS = {2, 3, 5, 7, 10, 11, 13}
# Rikta (empty) tithis and Amavasya, avoided for beginnings
EMPTY_TITHIS = {4, 9, 14, 19, 24, 29, 30}


def zone_of(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("Asia/Kolkata")


def sun_times(
    latitude: float, longitude: float, tz_name: Optional[str], first: date, days: int
) -> List[Dict[str, Any]]:
    """Sunrise, sunset and the next sunrise for each local day. Where the Sun doesn't
    rise or set (near the poles), 6 am and 6 pm stand in, marked approximate."""
    ts, eph = _ephemeris()
    zone = zone_of(tz_name)
    observer = eph["earth"] + wgs84.latlon(latitude, longitude)
    t0 = ts.from_datetime(datetime.combine(first, time(0), zone))
    t1 = ts.from_datetime(datetime.combine(first + timedelta(days=days + 1), time(23, 59), zone))
    rises, rose = almanac.find_risings(observer, eph["sun"], t0, t1)
    sets, set_ok = almanac.find_settings(observer, eph["sun"], t0, t1)

    def by_day(times, ok):
        found = {}
        for t, good in zip(times, ok):
            if good:
                local = t.utc_datetime().astimezone(zone)
                found.setdefault(local.date(), local)
        return found

    sunrises, sunsets = by_day(rises, rose), by_day(sets, set_ok)
    result = []
    for i in range(days + 1):
        day = first + timedelta(days=i)
        rise = sunrises.get(day)
        dusk = sunsets.get(day)
        approximate = rise is None or dusk is None or dusk <= rise
        if approximate:
            rise = datetime.combine(day, time(6), zone)
            dusk = datetime.combine(day, time(18), zone)
        result.append({"date": day, "sunrise": rise, "sunset": dusk, "approximate": approximate})
    for today, tomorrow in zip(result, result[1:]):
        today["next_sunrise"] = tomorrow["sunrise"]
    return result[:days]


def sunday_first(day: date) -> int:
    return (day.weekday() + 1) % 7


def day_periods(sunrise: datetime, sunset: datetime, next_sunrise: datetime, day: date) -> Dict[str, Any]:
    """Rahu Kaal, Yamaganda, Gulika, Abhijit and the 16 choghadiyas."""
    weekday = sunday_first(day)
    eighth = (sunset - sunrise) / 8

    def part(n: int) -> Dict[str, datetime]:
        return {"start": sunrise + eighth * (n - 1), "end": sunrise + eighth * n}

    midday = sunrise + (sunset - sunrise) / 2
    muhurta = (sunset - sunrise) / 15
    choghadiyas = []
    night_eighth = (next_sunrise - sunset) / 8
    for when, start, step, order, first in (
        ("day", sunrise, eighth, DAY_ORDER, (3 * weekday) % 7),
        ("night", sunset, night_eighth, NIGHT_ORDER, (2 * weekday) % 7),
    ):
        for i in range(8):
            name = order[(first + i) % 7]
            quality, meaning = CHOGHADIYA[name]
            choghadiyas.append(
                {
                    "name": name,
                    "quality": quality,
                    "meaning": meaning,
                    "part": when,
                    "start": start + step * i,
                    "end": start + step * (i + 1),
                }
            )
    return {
        "rahu_kaal": part(RAHU_KAAL[weekday]),
        "yamaganda": part(YAMAGANDA[weekday]),
        "gulika": part(GULIKA[weekday]),
        # The eighth of the day's fifteen muhurtas; traditionally not used on Wednesday
        "abhijit": None if weekday == 3 else {"start": midday - muhurta / 2, "end": midday + muhurta / 2},
        "choghadiya": choghadiyas,
    }


def limbs_at(instants: List[datetime]) -> List[Dict[str, Any]]:
    """Tithi, nakshatra, yoga, karana and the Sun and Moon's signs at many instants."""
    ts, _ = _ephemeris()
    t = ts.from_datetimes(instants)
    suns = _series("sun", t)
    moons = _series("moon", t)
    result = []
    for sun, moon in zip(suns, moons):
        elongation = (moon - sun) % 360
        result.append(
            {
                "tithi": min(int(elongation // 12), 29) + 1,
                "nakshatra": min(int(moon // NAKSHATRA_SPAN), 26),
                "yoga": min(int((sun + moon) % 360 // NAKSHATRA_SPAN), 26),
                "karana": karana_of(elongation)["name"],
                "sun_sign": int(sun // 30) % 12,
                "moon_sign": int(moon // 30) % 12,
                "elongation": float(elongation),
            }
        )
    return result


def personal_day(natal: Dict[str, int], moon_sign: int, nakshatra: int) -> Dict[str, Any]:
    """How the day's Moon sits with a birth Moon: natal = {"sign", "nakshatra"} indexes."""
    house = house_from(moon_sign, natal["sign"])
    good, meaning = MOON_HOUSES[house]
    tara_name, tara_good, tara_meaning = TARAS[(nakshatra - natal["nakshatra"]) % 27 % 9]
    if house == 8:
        mood = "caution"
    elif good and tara_good:
        mood = "good"
    elif not good and tara_good is False:
        mood = "testing"
    else:
        mood = "mixed"
    return {
        "moon_house": house,
        "chandra_bala": good,
        "moon_meaning": meaning,
        "tara": tara_name,
        "tara_good": tara_good,
        "tara_meaning": tara_meaning,
        "chandrashtama": house == 8,
        "mood": mood,
    }


def guidance(personal: Dict[str, Any]) -> str:
    """One line for the day, in plain words."""
    moon = f"The Moon is in your {_ordinal(personal['moon_house'])}: {personal['moon_meaning']}."
    tara = f"Your tara today is {personal['tara']} ({personal['tara_meaning']})."
    if personal["chandrashtama"]:
        return f"{moon} {tara}"
    lead = {
        "good": "A good day to act.",
        "testing": "A day for patience.",
        "mixed": "A mixed day: choose your moments.",
    }[personal["mood"]]
    return f"{lead} {moon} {tara}"


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")


def _names(limbs: Dict[str, Any]) -> Dict[str, Any]:
    tithi = tithi_of((limbs["tithi"] - 1) * 12 + 6)
    return {
        "tithi": tithi,
        "nakshatra": NAKSHATRAS[limbs["nakshatra"]][0],
        "yoga": YOGAS[limbs["yoga"]][0],
        "yoga_inauspicious": YOGAS[limbs["yoga"]][3],
        "karana": limbs["karana"],
        "moon_rashi": RASHIS[limbs["moon_sign"]][0],
    }


def muhurat(
    latitude: float,
    longitude: float,
    tz_name: Optional[str],
    start: date,
    days: int,
    activity: str,
    natal: Optional[Dict[str, int]] = None,
    limit: int = 8,
) -> Dict[str, Any]:
    """The best coming days for an activity, each with its reasons, cautions and the
    good windows of the day (Abhijit and the good day choghadiyas, outside Rahu Kaal,
    Yamaganda and Gulika)."""
    rules = ACTIVITIES[activity]
    times = sun_times(latitude, longitude, tz_name, start, days)
    limbs = limbs_at([d["sunrise"] for d in times])
    candidates = []
    for day, at in zip(times, limbs):
        reasons, cautions = [], []
        score = 0
        names = _names(at)
        tithi, nakshatra = at["tithi"], at["nakshatra"]
        within = (tithi - 1) % 15 + 1
        if nakshatra in rules["nakshatras"]:
            score += 3
            reasons.append(f"{names['nakshatra']} nakshatra suits this")
        elif nakshatra in UGRA | TIKSHNA:
            score -= 5
            cautions.append(f"{names['nakshatra']} is a fierce nakshatra")
        if tithi in EMPTY_TITHIS:
            score -= 5
            cautions.append(f"{names['tithi']['name']} is avoided for beginnings")
        elif within in GOOD_TITHIS:
            score += 2
            reasons.append(f"{names['tithi']['paksha']} {names['tithi']['name']} is a good tithi")
        if tithi > 15 and within > 8:
            score -= 2
            cautions.append("the waning Moon is growing dark")
        if rules.get("shukla_only") and tithi > 15:
            score -= 2
            cautions.append("the waxing fortnight is preferred for this")
        weekday = sunday_first(day["date"])
        if weekday in rules["weekdays"]:
            score += 1
            reasons.append(f"{day['date'].strftime('%A')} suits this")
        elif weekday in (2, 6):
            score -= 2
            cautions.append(f"{day['date'].strftime('%A')} is avoided for this")
        if names["yoga_inauspicious"]:
            score -= 3
            cautions.append(f"{names['yoga']} yoga is a testing yoga")
        if at["karana"] == "Vishti":
            score -= 3
            cautions.append("Bhadra (Vishti karana) at sunrise")
        if natal:
            mine = personal_day(natal, at["moon_sign"], nakshatra)
            if mine["chandrashtama"]:
                score -= 6
                cautions.append("Chandrashtama for this person")
            elif mine["chandra_bala"]:
                score += 1
                reasons.append(f"the Moon is in their {_ordinal(mine['moon_house'])}, a strong place")
            if mine["tara_good"]:
                score += 1
                reasons.append(f"{mine['tara']} tara")
            elif mine["tara_good"] is False:
                score -= 2
                cautions.append(f"{mine['tara']} tara")
        if score < 3:
            continue
        periods = day_periods(day["sunrise"], day["sunset"], day["next_sunrise"], day["date"])
        candidates.append(
            {
                "date": day["date"],
                "score": score,
                "tithi": f"{names['tithi']['paksha']} {names['tithi']['name']}",
                "nakshatra": names["nakshatra"],
                "reasons": reasons,
                "cautions": cautions,
                "windows": good_windows(periods),
                "rahu_kaal": periods["rahu_kaal"],
            }
        )
    best = sorted(candidates, key=lambda c: (-c["score"], c["date"]))[:limit]
    return {
        "activity": activity,
        "label": rules["label"],
        "days": sorted(best, key=lambda c: c["date"]),
    }


def good_windows(periods: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Abhijit and the good daytime choghadiyas, with the bad periods cut out."""
    blocked = [periods[k] for k in ("rahu_kaal", "yamaganda", "gulika")]
    windows = []
    if periods["abhijit"]:
        windows.append({**periods["abhijit"], "label": "Abhijit muhurta"})
    for c in periods["choghadiya"]:
        if c["part"] == "day" and c["quality"] == "good":
            windows.append({"start": c["start"], "end": c["end"], "label": f"{c['name']} choghadiya"})

    def cut(window):
        pieces = [window]
        for b in blocked:
            nxt = []
            for p in pieces:
                if b["end"] <= p["start"] or b["start"] >= p["end"]:
                    nxt.append(p)
                    continue
                if p["start"] < b["start"]:
                    nxt.append({**p, "end": b["start"]})
                if b["end"] < p["end"]:
                    nxt.append({**p, "start": b["end"]})
            pieces = nxt
        return [p for p in pieces if p["end"] - p["start"] >= timedelta(minutes=20)]

    result = [piece for w in windows for piece in cut(w)]
    return sorted(result, key=lambda w: w["start"])


def natal_moon(vedic: Optional[Dict[str, Any]]) -> Optional[Dict[str, int]]:
    """The birth Moon's sign and nakshatra indexes, if both are certain."""
    if not vedic:
        return None
    rashi, nakshatra = vedic.get("rashi") or {}, vedic.get("nakshatra") or {}
    if "name" not in rashi or "name" not in nakshatra:
        return None
    return {
        "sign": [r[0] for r in RASHIS].index(rashi["name"]),
        "nakshatra": [n[0] for n in NAKSHATRAS].index(nakshatra["name"]),
    }

