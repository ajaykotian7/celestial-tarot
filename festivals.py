"""The festival calendar: lunar months, fasts, festivals and sankrantis for a place.

Lunar months are amanta (new moon to new moon), named by the sidereal sign the Sun is
in when the month begins; a month in which the Sun changes no sign is adhika (extra),
and festivals then wait for the regular month. Each festival is kept on the first day
whose observance time (sunrise, midday, the afternoon, pradosh at dusk, midnight or
moonrise) falls in its tithi, as most printed panchangs do. Regional traditions differ,
so a family calendar can disagree by a day.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from astrology import _ephemeris
from jyotish import NAKSHATRAS, RASHIS, tithi_of
from kundali import _series, graha_name, house_from, ordinal, sign_ingresses, transit
from muhurta import limbs_at, sun_times

# Chaitra first: the month whose new moon falls with the Sun in Meena
MONTHS = [
    "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
    "Ashwin", "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna",
]

# (month, tithi 1-30, observance time, name, note)
FESTIVALS = [
    (0, 1, "sunrise", "Ugadi / Gudi Padwa", "the lunar new year"),
    (0, 9, "midday", "Ram Navami", "the birth of Rama"),
    (0, 15, "sunrise", "Hanuman Jayanti", "as kept in the north"),
    (1, 3, "forenoon", "Akshaya Tritiya", "a day for beginnings that never wane"),
    (3, 11, "sunrise", "Devshayani Ekadashi", "Vishnu goes to sleep; Chaturmas begins"),
    (3, 15, "sunrise", "Guru Purnima", "honouring teachers"),
    (4, 5, "forenoon", "Nag Panchami", "worship of the serpents"),
    (4, 15, "afternoon", "Raksha Bandhan", "the thread between brother and sister"),
    (4, 23, "midnight", "Krishna Janmashtami", "the birth of Krishna"),
    (5, 4, "midday", "Ganesh Chaturthi", "Ganesha comes home"),
    (5, 30, "afternoon", "Mahalaya Amavasya", "the ancestors' new moon, ending Pitru Paksha"),
    (6, 1, "sunrise", "Navaratri begins", "nine nights of the Goddess"),
    (6, 10, "afternoon", "Vijayadashami (Dussehra)", "victory of good over evil"),
    (6, 19, "moonrise", "Karwa Chauth", "a fast until moonrise"),
    (6, 28, "pradosh", "Dhanteras", "Lakshmi and Dhanvantari"),
    (6, 29, "sunrise", "Naraka Chaturdashi", "the first lamps of Deepavali"),
    (6, 30, "pradosh", "Deepavali (Lakshmi Puja)", "the festival of lamps"),
    (7, 1, "sunrise", "Govardhan Puja / Bali Pratipada", None),
    (7, 2, "afternoon", "Bhai Dooj", "for brothers"),
    (7, 11, "sunrise", "Prabodhini Ekadashi", "Vishnu wakes; Chaturmas ends"),
    (7, 15, "sunrise", "Kartika Purnima", "Dev Deepavali"),
    (10, 5, "forenoon", "Vasant Panchami", "Saraswati Puja"),
    (10, 29, "midnight", "Maha Shivaratri", "the great night of Shiva"),
    (11, 15, "pradosh", "Holika Dahan", "the bonfire on the eve of Holi"),
]
# Kept on the day after another
FOLLOWING = {"Holika Dahan": ("Holi", "the festival of colours")}

# Monthly observances: (tithi, time, name)
OBSERVANCES = [
    (4, "midday", "Vinayaka Chaturthi"),
    (11, "sunrise", "Ekadashi"),
    (13, "pradosh", "Pradosh"),
    (15, "sunrise", "Purnima"),
    (19, "moonrise", "Sankashti Chaturthi"),
    (26, "sunrise", "Ekadashi"),
    (28, "pradosh", "Pradosh"),
    (29, "midnight", "Masik Shivaratri"),
    (30, "sunrise", "Amavasya"),
]

SANKRANTI_NAMES = {
    0: "Mesha Sankranti (Vishu, Baisakhi)",
    3: "Karka Sankranti",
    6: "Tula Sankranti",
    9: "Makar Sankranti (Pongal, Uttarayan)",
}

TIMES = ("sunrise", "forenoon", "midday", "afternoon", "pradosh", "midnight", "moonrise")


def _observance_times(day: Dict[str, Any]) -> Dict[str, datetime]:
    rise, dusk, next_rise = day["sunrise"], day["sunset"], day["next_sunrise"]
    length = dusk - rise
    return {
        "sunrise": rise,
        "forenoon": rise + length * 0.3,
        "midday": rise + length * 0.5,
        # Aparahna, the fourth fifth of the day
        "afternoon": rise + length * 0.7,
        "pradosh": dusk + timedelta(hours=1),
        "midnight": dusk + (next_rise - dusk) / 2,
        # Near enough to moonrise on the fourth night after full moon
        "moonrise": dusk + timedelta(hours=2),
    }


def new_moons(start: datetime, end: datetime) -> List[datetime]:
    """Each new moon (UTC) between two instants, to the minute."""
    ts, _ = _ephemeris()
    hours = int((end - start).total_seconds() // 3600) + 1
    step = 6
    samples = [start + timedelta(hours=h) for h in range(0, hours, step)]
    t = ts.from_datetimes(samples)
    elongation = (_series("moon", t) - _series("sun", t)) % 360
    wraps = np.nonzero((elongation[:-1] > 300) & (elongation[1:] < 60))[0]
    found = []
    for i in wraps:
        lo, hi = samples[i], samples[i + 1]
        while hi - lo > timedelta(minutes=1):
            mid = lo + (hi - lo) / 2
            tm = ts.from_datetime(mid)
            e = float((_series("moon", tm) - _series("sun", tm)) % 360)
            if e > 180:
                lo = mid
            else:
                hi = mid
        found.append(hi)
    return found


def lunar_months(start: datetime, end: datetime) -> List[Dict[str, Any]]:
    """Amanta months overlapping [start, end]: name, adhika, and their bounds."""
    moons = new_moons(start - timedelta(days=32), end + timedelta(days=32))
    ts, _ = _ephemeris()
    signs = [int(_series("sun", ts.from_datetime(m)) // 30) % 12 for m in moons]
    months = []
    for i in range(len(moons) - 1):
        months.append(
            {
                "name": MONTHS[(signs[i] + 1) % 12],
                "index": (signs[i] + 1) % 12,
                # No sankranti between this new moon and the next
                "adhika": signs[i] == signs[i + 1],
                "start": moons[i],
                "end": moons[i + 1],
            }
        )
    return months


def _month_at(months: List[Dict[str, Any]], when: datetime) -> Optional[Dict[str, Any]]:
    return next((m for m in months if m["start"] <= when < m["end"]), None)


def _keep_day(days, tithis, months, month_index, tithi, rule) -> Optional[int]:
    """Index of the day a tithi is kept in a month: the first day its tithi holds at
    the observance time, or, if it slips between two days' observance times, the
    day it fell on."""
    for i, day in enumerate(days):
        month = _month_at(months, day["times"][rule])
        if month and not month["adhika"] and month["index"] == month_index and tithis[i][rule] == tithi:
            return i
    for i in range(len(days) - 1):
        month = _month_at(months, days[i]["times"][rule])
        if not month or month["adhika"] or month["index"] != month_index:
            continue
        before, after = tithis[i][rule], tithis[i + 1][rule]
        if before < tithi < after or (before > after and (tithi > before or tithi < after)):
            return i
    return None


def calendar(
    latitude: float,
    longitude: float,
    tz_name: Optional[str],
    start: date,
    days: int,
    natal: Optional[Dict[str, int]] = None,
    jataka: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Every day from start: its tithi and nakshatra at sunrise, lunar month, and what
    falls on it (festivals, fasts, sankrantis, and for a person: Chandrashtama, dasha
    changes and the slow grahas changing sign)."""
    # A margin on each side, so a tithi kept the day before or after is seen
    span = sun_times(latitude, longitude, tz_name, start - timedelta(days=2), days + 4)
    for d in span:
        d["times"] = _observance_times(d)
    instants = [d["times"][rule] for d in span for rule in TIMES]
    limbs = limbs_at(instants)
    per_day = [
        {rule: limbs[i * len(TIMES) + k] for k, rule in enumerate(TIMES)} for i in range(len(span))
    ]
    tithis = [{rule: limbs_[rule]["tithi"] for rule in TIMES} for limbs_ in per_day]
    months = lunar_months(
        span[0]["sunrise"].astimezone(timezone.utc), span[-1]["next_sunrise"].astimezone(timezone.utc)
    )

    items: Dict[int, List[Dict[str, Any]]] = {i: [] for i in range(len(span))}
    month_indexes = {m["index"] for m in months if not m["adhika"]}
    for month_index, tithi, rule, name, note in FESTIVALS:
        if month_index not in month_indexes:
            continue
        i = _keep_day(span, tithis, months, month_index, tithi, rule)
        if i is None:
            continue
        items[i].append({"kind": "festival", "name": name, "note": note})
        if name in FOLLOWING and i + 1 < len(span):
            follow, follow_note = FOLLOWING[name]
            items[i + 1].append({"kind": "festival", "name": follow, "note": follow_note})

    for month in months:
        for tithi, rule, name in OBSERVANCES:
            i = _keep_day(span, tithis, [month], month["index"], tithi, rule) if not month["adhika"] else _keep_day(
                span, tithis, [{**month, "adhika": False}], month["index"], tithi, rule
            )
            if i is not None and not any(x["name"] == name for x in items[i]):
                items[i].append({"kind": "fast", "name": name, "note": None})

    # A sankranti belongs to the calendar date the Sun changes sign, so compare
    # successive local midnights
    zone = span[0]["sunrise"].tzinfo
    midnights = limbs_at([datetime.combine(d["date"], time(0), zone) for d in span])
    for i in range(len(span) - 1):
        before, now = midnights[i]["sun_sign"], midnights[i + 1]["sun_sign"]
        if before != now:
            name = SANKRANTI_NAMES.get(now, f"{RASHIS[now][0]} Sankranti")
            items[i].append({"kind": "sankranti", "name": name, "note": f"the Sun enters {RASHIS[now][0]}"})

    if natal:
        for i, day in enumerate(per_day):
            if house_from(day["sunrise"]["moon_sign"], natal["sign"]) == 8:
                items[i].append(
                    {"kind": "caution", "name": "Chandrashtama", "note": "the Moon passes the 8th from the birth Moon"}
                )
    if jataka:
        _personal_events(jataka, span, items)

    result = []
    for i, day in enumerate(span):
        if not start <= day["date"] < start + timedelta(days=days):
            continue
        at = per_day[i]["sunrise"]
        tithi = tithi_of((at["tithi"] - 1) * 12 + 6)
        month = _month_at(months, day["sunrise"])
        result.append(
            {
                "date": day["date"],
                "tithi": {"number": at["tithi"], "name": tithi["name"], "paksha": tithi["paksha"]},
                "nakshatra": NAKSHATRAS[at["nakshatra"]][0],
                "month": month and (("Adhika " if month["adhika"] else "") + month["name"]),
                "sunrise": day["sunrise"],
                "sunset": day["sunset"],
                "items": items[i],
            }
        )
    return result


def _personal_events(jataka: Dict[str, Any], span, items) -> None:
    by_date = {d["date"]: i for i, d in enumerate(span)}
    for md in jataka["dasha"]["mahadashas"]:
        if md["start"] in by_date:
            items[by_date[md["start"]]].append(
                {"kind": "personal", "name": f"{md['lord']} mahadasha begins", "note": f"until {md['end'].year}"}
            )
        for ad in md["antardashas"]:
            if ad["start"] in by_date:
                items[by_date[ad["start"]]].append(
                    {"kind": "personal", "name": f"{md['lord']}–{ad['lord']} antardasha begins", "note": None}
                )
    moon = next(g for g in jataka["grahas"] if g["key"] == "moon")["sign"]
    lagna = jataka["lagna"]["sign"]
    for key in ("saturn", "jupiter", "rahu"):
        for day_, sign in sign_ingresses(key):
            if day_ in by_date:
                items[by_date[day_]].append(
                    {
                        "kind": "personal",
                        "name": f"{graha_name(key)} enters {RASHIS[sign][0]}",
                        "note": f"the {ordinal(house_from(sign, moon))} from the Moon, "
                        f"{ordinal(house_from(sign, lagna))} from the lagna",
                    }
                )
    for period in jataka["sade_sati"]["periods"]:
        for edge, label in ((period["start"], "Sade Sati begins"), (period["end"], "Sade Sati ends")):
            if edge in by_date:
                items[by_date[edge]].append({"kind": "personal", "name": label, "note": None})


def upcoming(days: List[Dict[str, Any]], kinds: Tuple[str, ...] = ("festival", "fast", "sankranti")):
    """The next few days that have something on them."""
    return [
        {"date": d["date"], "items": [x for x in d["items"] if x["kind"] in kinds]}
        for d in days
        if any(x["kind"] in kinds for x in d["items"])
    ]


__all__ = ["calendar", "lunar_months", "new_moons", "upcoming", "transit"]
