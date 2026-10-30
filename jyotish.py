"""Vedic (sidereal) astrology: rashi, nakshatra and today's panchang.

Uses the same JPL ephemeris as astrology.py. Sidereal longitudes subtract the Lahiri
(Chitrapaksha) ayanamsa, the standard in Indian panchangs. The panchang is for the
moment it is asked for; traditional calendars fix each day's tithi at sunrise, so
around a change the two can differ by a day.
"""

from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional

from astrology import (
    ELEMENTS,
    _ephemeris,
    ascendant,
    birth_moment,
    ecliptic_longitude,
    in_ephemeris,
)

# Mean Lahiri ayanamsa at J2000 (2000-01-01 12:00 TT), and general precession.
# Ignoring nutation (under 20 arcseconds) can only matter right at a boundary.
AYANAMSA_J2000 = 23.857092
PRECESSION_DEGREES_PER_YEAR = 50.288 / 3600

NAKSHATRA_SPAN = 360 / 27

# (name, Devanagari, Western sign, ruling graha)
RASHIS = [
    ("Mesha", "मेष", "Aries", "Mangal (Mars)"),
    ("Vrishabha", "वृषभ", "Taurus", "Shukra (Venus)"),
    ("Mithuna", "मिथुन", "Gemini", "Budh (Mercury)"),
    ("Karka", "कर्क", "Cancer", "Chandra (Moon)"),
    ("Simha", "सिंह", "Leo", "Surya (Sun)"),
    ("Kanya", "कन्या", "Virgo", "Budh (Mercury)"),
    ("Tula", "तुला", "Libra", "Shukra (Venus)"),
    ("Vrishchika", "वृश्चिक", "Scorpio", "Mangal (Mars)"),
    ("Dhanu", "धनु", "Sagittarius", "Guru (Jupiter)"),
    ("Makara", "मकर", "Capricorn", "Shani (Saturn)"),
    ("Kumbha", "कुम्भ", "Aquarius", "Shani (Saturn)"),
    ("Meena", "मीन", "Pisces", "Guru (Jupiter)"),
]

# (name, Devanagari, deity, symbol, theme)
NAKSHATRAS = [
    ("Ashwini", "अश्विनी", "the Ashwini Kumaras, divine healers", "a horse's head", "swift beginnings and healing"),
    ("Bharani", "भरणी", "Yama, lord of dharma", "a womb", "bearing, restraint and transformation"),
    ("Krittika", "कृत्तिका", "Agni, the sacred fire", "a flame", "purifying fire and sharp truth"),
    ("Rohini", "रोहिणी", "Brahma, the creator", "an ox cart", "growth, beauty and abundance"),
    ("Mrigashira", "मृगशिरा", "Soma, the moon's nectar", "a deer's head", "searching and gentle curiosity"),
    ("Ardra", "आर्द्रा", "Rudra, the storm", "a teardrop", "storms that clear the air"),
    ("Punarvasu", "पुनर्वसु", "Aditi, the boundless mother", "a quiver of arrows", "return, renewal and home"),
    ("Pushya", "पुष्य", "Brihaspati, teacher of the gods", "a cow's udder", "nourishment and care"),
    ("Ashlesha", "आश्लेषा", "the Nagas, serpent spirits", "a coiled serpent", "hidden depths and the power to hold on"),
    ("Magha", "मघा", "the Pitris, the ancestors", "a royal throne", "lineage, honour and the ancestors"),
    ("Purva Phalguni", "पूर्वा फाल्गुनी", "Bhaga, giver of delight", "the front legs of a bed", "rest, pleasure and creativity"),
    ("Uttara Phalguni", "उत्तरा फाल्गुनी", "Aryaman, keeper of promises", "the back legs of a bed", "loyalty and kept promises"),
    ("Hasta", "हस्त", "Savitar, the sun's light", "an open hand", "skill and the work of the hands"),
    ("Chitra", "चित्रा", "Vishvakarma, the divine architect", "a bright jewel", "brilliance and the making of beauty"),
    ("Swati", "स्वाति", "Vayu, the wind", "a young shoot in the wind", "independence, bending without breaking"),
    ("Vishakha", "विशाखा", "Indra and Agni", "a triumphal arch", "single-minded purpose"),
    ("Anuradha", "अनुराधा", "Mitra, lord of friendship", "a lotus", "devotion and friendship"),
    ("Jyeshtha", "ज्येष्ठा", "Indra, king of the gods", "a protective earring", "courage and protecting others"),
    ("Mula", "मूल", "Nirriti, goddess of dissolution", "a bundle of roots", "going to the root of things"),
    ("Purva Ashadha", "पूर्वाषाढ़ा", "Apas, the waters", "a winnowing fan", "invincible hope"),
    ("Uttara Ashadha", "उत्तराषाढ़ा", "the Vishvedevas, the universal gods", "an elephant's tusk", "lasting victory"),
    ("Shravana", "श्रवण", "Vishnu, the preserver", "an ear", "listening and learning"),
    ("Dhanishta", "धनिष्ठा", "the eight Vasus", "a drum", "rhythm, music and plenty"),
    ("Shatabhisha", "शतभिषा", "Varuna, lord of the cosmic waters", "an empty circle", "healing and hidden mysteries"),
    ("Purva Bhadrapada", "पूर्वा भाद्रपद", "Aja Ekapada, the one-footed goat", "the front legs of a funeral cot", "fierce idealism and transformation"),
    ("Uttara Bhadrapada", "उत्तरा भाद्रपद", "Ahir Budhnya, serpent of the deep", "the back legs of a funeral cot", "depth, wisdom and calm"),
    ("Revati", "रेवती", "Pushan, guardian of journeys", "a fish", "safe passage and completion"),
]

# Vimshottari order: nakshatra n is ruled by NAKSHATRA_LORDS[n % 9]
NAKSHATRA_LORDS = [
    "Ketu (south lunar node)",
    "Shukra (Venus)",
    "Surya (Sun)",
    "Chandra (Moon)",
    "Mangal (Mars)",
    "Rahu (north lunar node)",
    "Guru (Jupiter)",
    "Shani (Saturn)",
    "Budh (Mercury)",
]

# The 14 tithis of each fortnight before its last: Purnima (15) or Amavasya (30)
TITHIS = [
    ("Pratipada", "प्रतिपदा"),
    ("Dwitiya", "द्वितीया"),
    ("Tritiya", "तृतीया"),
    ("Chaturthi", "चतुर्थी"),
    ("Panchami", "पंचमी"),
    ("Shashthi", "षष्ठी"),
    ("Saptami", "सप्तमी"),
    ("Ashtami", "अष्टमी"),
    ("Navami", "नवमी"),
    ("Dashami", "दशमी"),
    ("Ekadashi", "एकादशी"),
    ("Dwadashi", "द्वादशी"),
    ("Trayodashi", "त्रयोदशी"),
    ("Chaturdashi", "चतुर्दशी"),
]
PURNIMA = ("Purnima", "पूर्णिमा")
AMAVASYA = ("Amavasya", "अमावस्या")

PAKSHAS = {
    "Shukla": ("शुक्ल", "the bright, waxing fortnight"),
    "Krishna": ("कृष्ण", "the dark, waning fortnight"),
}

# Observances by tithi number (1-30)
OBSERVANCES = {
    4: "Vinayaka Chaturthi, sacred to Ganesha",
    11: "Ekadashi, a day of fasting sacred to Vishnu",
    13: "Pradosh, sacred to Shiva at twilight",
    15: "Purnima, the full moon",
    19: "Sankashti Chaturthi, sacred to Ganesha",
    26: "Ekadashi, a day of fasting sacred to Vishnu",
    28: "Pradosh, sacred to Shiva at twilight",
    29: "Masik Shivaratri, Shiva's night of the month",
    30: "Amavasya, the moonless night, sacred to the ancestors",
}

# (name, Devanagari, meaning, traditionally inauspicious)
YOGAS = [
    ("Vishkambha", "विष्कम्भ", "the pillar", True),
    ("Priti", "प्रीति", "affection", False),
    ("Ayushman", "आयुष्मान", "long life", False),
    ("Saubhagya", "सौभाग्य", "good fortune", False),
    ("Shobhana", "शोभन", "splendour", False),
    ("Atiganda", "अतिगण्ड", "great obstacle", True),
    ("Sukarma", "सुकर्मा", "good deeds", False),
    ("Dhriti", "धृति", "steadfastness", False),
    ("Shula", "शूल", "the spear", True),
    ("Ganda", "गण्ड", "the knot", True),
    ("Vriddhi", "वृद्धि", "growth", False),
    ("Dhruva", "ध्रुव", "constancy", False),
    ("Vyaghata", "व्याघात", "the blow", True),
    ("Harshana", "हर्षण", "joy", False),
    ("Vajra", "वज्र", "the thunderbolt", True),
    ("Siddhi", "सिद्धि", "accomplishment", False),
    ("Vyatipata", "व्यतीपात", "upheaval", True),
    ("Variyana", "वरीयान", "comfort", False),
    ("Parigha", "परिघ", "the barrier", True),
    ("Shiva", "शिव", "auspiciousness", False),
    ("Siddha", "सिद्ध", "attainment", False),
    ("Sadhya", "साध्य", "the achievable", False),
    ("Shubha", "शुभ", "blessing", False),
    ("Shukla", "शुक्ल", "brightness", False),
    ("Brahma", "ब्रह्म", "sacred knowledge", False),
    ("Indra", "इन्द्र", "sovereignty", False),
    ("Vaidhriti", "वैधृति", "discord", True),
]

# Karanas are half-tithis: one fixed karana starts the month, seven movable ones
# cycle eight times, and three fixed ones end it
MOVABLE_KARANAS = [
    ("Bava", "बव"),
    ("Balava", "बालव"),
    ("Kaulava", "कौलव"),
    ("Taitila", "तैतिल"),
    ("Gara", "गर"),
    ("Vanija", "वणिज"),
    ("Vishti", "विष्टि"),
]
FIRST_KARANA = ("Kimstughna", "किंस्तुघ्न")
LAST_KARANAS = [("Shakuni", "शकुनि"), ("Chatushpada", "चतुष्पाद"), ("Naga", "नाग")]

# Monday first, matching date.weekday()
VARAS = [
    ("Somavara", "सोमवार", "Chandra (Moon)"),
    ("Mangalavara", "मंगलवार", "Mangal (Mars)"),
    ("Budhavara", "बुधवार", "Budh (Mercury)"),
    ("Guruvara", "गुरुवार", "Guru (Jupiter)"),
    ("Shukravara", "शुक्रवार", "Shukra (Venus)"),
    ("Shanivara", "शनिवार", "Shani (Saturn)"),
    ("Ravivara", "रविवार", "Surya (Sun)"),
]


def ayanamsa(when: datetime) -> float:
    ts, _ = _ephemeris()
    years = (ts.from_datetime(when).tt - 2451545.0) / 365.25
    return AYANAMSA_J2000 + PRECESSION_DEGREES_PER_YEAR * years


def sidereal_longitude(body: str, when: datetime) -> float:
    return (ecliptic_longitude(body, when) - ayanamsa(when)) % 360


def rashi_of(longitude: float) -> Dict[str, Any]:
    name, devanagari, western, lord = RASHIS[int(longitude % 360 // 30) % 12]
    return {
        "name": name,
        "devanagari": devanagari,
        "western": western,
        "element": ELEMENTS[western],
        "lord": lord,
    }


def nakshatra_of(longitude: float) -> Dict[str, Any]:
    longitude %= 360
    index = min(int(longitude // NAKSHATRA_SPAN), 26)
    name, devanagari, deity, symbol, theme = NAKSHATRAS[index]
    return {
        "name": name,
        "devanagari": devanagari,
        "deity": deity,
        "symbol": symbol,
        "theme": theme,
        "lord": NAKSHATRA_LORDS[index % 9],
        # Each nakshatra has four quarters (padas) of 3°20'
        "pada": min(int(longitude % NAKSHATRA_SPAN // (NAKSHATRA_SPAN / 4)), 3) + 1,
    }


def tithi_of(elongation: float) -> Dict[str, Any]:
    """The lunar day: each 12° the Moon gains on the Sun. 1-15 are Shukla, 16-30 Krishna."""
    number = min(int(elongation % 360 // 12), 29) + 1
    paksha = "Shukla" if number <= 15 else "Krishna"
    if number == 15:
        name, devanagari = PURNIMA
    elif number == 30:
        name, devanagari = AMAVASYA
    else:
        name, devanagari = TITHIS[(number - 1) % 15]
    paksha_devanagari, paksha_meaning = PAKSHAS[paksha]
    return {
        "number": number,
        "name": name,
        "devanagari": devanagari,
        "paksha": paksha,
        "paksha_devanagari": paksha_devanagari,
        "paksha_meaning": paksha_meaning,
        "observance": OBSERVANCES.get(number),
    }


def yoga_of(sun: float, moon: float) -> Dict[str, Any]:
    index = min(int((sun + moon) % 360 // NAKSHATRA_SPAN), 26)
    name, devanagari, meaning, inauspicious = YOGAS[index]
    return {"name": name, "devanagari": devanagari, "meaning": meaning, "inauspicious": inauspicious}


def karana_of(elongation: float) -> Dict[str, Any]:
    half = min(int(elongation % 360 // 6), 59)
    if half == 0:
        name, devanagari = FIRST_KARANA
    elif half >= 57:
        name, devanagari = LAST_KARANAS[half - 57]
    else:
        name, devanagari = MOVABLE_KARANAS[(half - 1) % 7]
    # Vishti, also called Bhadra, is traditionally avoided for new beginnings
    return {"name": name, "devanagari": devanagari, "bhadra": name == "Vishti"}


def vara_of(day: date) -> Dict[str, Any]:
    name, devanagari, lord = VARAS[day.weekday()]
    return {"name": name, "devanagari": devanagari, "lord": lord}


def _next_boundary(angle: Callable[[datetime], float], now: datetime, step: float) -> datetime:
    """When an increasing angle (degrees) next reaches a multiple of `step`."""
    start = angle(now)
    target = (start // step + 1) * step - start

    def gained(t: datetime) -> float:
        return (angle(t) - start) % 360

    # Secant steps from a one-hour probe; converges to seconds in a few rounds
    t0, g0 = now, 0.0
    t1 = now + timedelta(hours=1)
    g1 = gained(t1)
    for _ in range(8):
        if g1 == g0:
            break
        t2 = t1 + (t1 - t0) * ((target - g1) / (g1 - g0))
        t0, g0, t1, g1 = t1, g1, t2, gained(t2)
        if abs(target - g1) < 1e-4:
            break
    return t1


def _elongation(when: datetime) -> float:
    return (ecliptic_longitude("moon", when) - ecliptic_longitude("sun", when)) % 360


def panchang(now: Optional[datetime] = None, local_date: Optional[date] = None) -> Dict[str, Any]:
    """The five limbs of the day, for this moment: tithi, vara, nakshatra, yoga and
    karana, plus when the current tithi and nakshatra end (UTC, ISO 8601)."""
    now = now or datetime.now(timezone.utc)
    local_date = local_date or now.date()
    sun = sidereal_longitude("sun", now)
    moon = sidereal_longitude("moon", now)
    elongation = (moon - sun) % 360

    nakshatra = nakshatra_of(moon)
    del nakshatra["pada"]

    def iso(t: datetime) -> str:
        return t.astimezone(timezone.utc).isoformat(timespec="minutes")

    return {
        "tithi": tithi_of(elongation),
        "vara": vara_of(local_date),
        "nakshatra": nakshatra,
        "yoga": yoga_of(sun, moon),
        "karana": karana_of(elongation),
        "moon_rashi": rashi_of(moon)["name"],
        "tithi_ends": iso(_next_boundary(_elongation, now, 12)),
        "nakshatra_ends": iso(
            _next_boundary(lambda t: sidereal_longitude("moon", t), now, NAKSHATRA_SPAN)
        ),
    }


def _over(describe: Callable[[datetime], Dict[str, Any]], start: datetime, end: datetime):
    """Each distinct value across a window, in order, sampled hourly (the Moon moves
    about half a degree an hour, so no nakshatra can slip between samples)."""
    values: List[Dict[str, Any]] = []
    t = start
    while True:
        value = describe(t)
        if not values or values[-1]["name"] != value["name"]:
            values.append(value)
        if t >= end:
            break
        t = min(t + timedelta(hours=1), end)
    return values


def _settled(values: List[Dict[str, Any]]) -> Dict[str, Any]:
    if len(values) == 1:
        return values[0]
    return {"alternatives": [v["name"] for v in values]}


@lru_cache(maxsize=256)
def vedic_chart(
    birth_date: date,
    birth_time: Optional[time] = None,
    tz_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Moon rashi, janma nakshatra, sidereal Sun and lagna. Without an exact birth
    time the Moon often changes nakshatra (and sometimes rashi) during the day, so
    those come back as alternatives; the pada needs an exact time. Cached, so callers
    must copy before changing the result."""
    if not in_ephemeris(birth_date):
        return None

    instant, start, end = birth_moment(birth_date, birth_time, tz_name)
    if instant is not None:
        moon = sidereal_longitude("moon", instant)
        lagna = None
        if latitude is not None and longitude is not None:
            lagna = rashi_of(ascendant(instant, latitude, longitude) - ayanamsa(instant))
        return {
            "rashi": rashi_of(moon),
            "nakshatra": nakshatra_of(moon),
            "sun": rashi_of(sidereal_longitude("sun", instant)),
            "lagna": lagna,
        }

    def nakshatra_without_pada(t: datetime) -> Dict[str, Any]:
        n = nakshatra_of(sidereal_longitude("moon", t))
        del n["pada"]
        return n

    return {
        "rashi": _settled(_over(lambda t: rashi_of(sidereal_longitude("moon", t)), start, end)),
        "nakshatra": _settled(_over(nakshatra_without_pada, start, end)),
        "sun": _settled(_over(lambda t: rashi_of(sidereal_longitude("sun", t)), start, end)),
        "lagna": None,
    }
