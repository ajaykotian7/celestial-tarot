"""Personal insights from the querent's profile: numerology, birth cards, sign cards
and a card of the day. Only these derived traits reach the model, never the raw
birth date, time or place."""

import copy
import hashlib
from datetime import date, time
from typing import Any, Dict, List, Optional

from astrology import birth_chart
from jyotish import vedic_chart
from tarot_engine import MAJOR_ARCANA, TAROT_DECK, card_display_name, card_image_path

MASTER_NUMBERS = {11, 22, 33}

# Major Arcana in order, so the index is the card's number (The Fool = 0)
MAJOR_ORDER = list(MAJOR_ARCANA)

# Golden Dawn correspondences between the zodiac and the Major Arcana
SIGN_CARDS = {
    "Aries": "the emperor",
    "Taurus": "the hierophant",
    "Gemini": "the lovers",
    "Cancer": "the chariot",
    "Leo": "strength",
    "Virgo": "the hermit",
    "Libra": "justice",
    "Scorpio": "death",
    "Sagittarius": "temperance",
    "Capricorn": "the devil",
    "Aquarius": "the star",
    "Pisces": "the moon",
}

LIFE_PATH_THEMES = {
    1: "independence and leadership",
    2: "harmony and partnership",
    3: "creativity and expression",
    4: "stability and dedication",
    5: "freedom and change",
    6: "love and responsibility",
    7: "wisdom and introspection",
    8: "ambition and abundance",
    9: "compassion and completion",
    11: "intuition and inspiration",
    22: "turning great visions into reality",
    33: "healing and selfless love",
}

PERSONAL_YEAR_THEMES = {
    1: "new beginnings and planting seeds",
    2: "patience, partnership and cooperation",
    3: "creativity, expression and joy",
    4: "building foundations through steady work",
    5: "change, freedom and adventure",
    6: "love, home and responsibility",
    7: "reflection, solitude and inner wisdom",
    8: "ambition, power and abundance",
    9: "completion, release and letting go",
}


# Indian numerology: the graha that rules each number
NUMBER_GRAHAS = {
    1: "Surya (Sun)",
    2: "Chandra (Moon)",
    3: "Guru (Jupiter)",
    4: "Rahu",
    5: "Budh (Mercury)",
    6: "Shukra (Venus)",
    7: "Ketu",
    8: "Shani (Saturn)",
    9: "Mangal (Mars)",
}

# Chaldean letter values (no letter is 9, the sacred number)
CHALDEAN = {
    **dict.fromkeys("aijqy", 1),
    **dict.fromkeys("bkr", 2),
    **dict.fromkeys("cgls", 3),
    **dict.fromkeys("dmt", 4),
    **dict.fromkeys("ehnx", 5),
    **dict.fromkeys("uvw", 6),
    **dict.fromkeys("oz", 7),
    **dict.fromkeys("fp", 8),
}

# What each number's place in the Lo Shu grid stands for, as read in Indian numerology
LO_SHU_AREAS = {
    1: "career and the path ahead",
    2: "marriage and partnership",
    3: "family and health",
    4: "wealth and prosperity",
    5: "balance and stability",
    6: "travel and helpful people",
    7: "children and creativity",
    8: "knowledge and learning",
    9: "fame and recognition",
}

# Complete rows, columns and diagonals of the grid
#   4 9 2
#   3 5 7
#   8 1 6
LO_SHU_PLANES = [
    ("Mental plane", (4, 9, 2), "a sharp, thinking mind"),
    ("Emotional plane", (3, 5, 7), "deep feeling and sensitivity"),
    ("Practical plane", (8, 1, 6), "a gift for getting things done"),
    ("Thought plane", (4, 3, 8), "careful planning"),
    ("Will plane", (9, 5, 1), "determination"),
    ("Action plane", (2, 7, 6), "turning ideas into action"),
    ("Golden Raj Yoga", (4, 5, 6), "success and recognition"),
    ("Silver Raj Yoga", (2, 5, 8), "property and steady wealth"),
]


def digit_sum(n: int) -> int:
    return sum(int(d) for d in str(n))


def reduce_number(n: int, keep_master: bool = True) -> int:
    while n > 9 and not (keep_master and n in MASTER_NUMBERS):
        n = digit_sum(n)
    return n


def life_path(birth_date: date) -> int:
    parts = (birth_date.month, birth_date.day, birth_date.year)
    return reduce_number(sum(reduce_number(p) for p in parts))


def personal_year(birth_date: date, today: date) -> int:
    parts = (birth_date.month, birth_date.day, today.year)
    return reduce_number(sum(reduce_number(p, False) for p in parts), keep_master=False)


def birth_cards(birth_date: date) -> List[str]:
    """Mary K. Greer's birth cards: add month + day + year and sum the digits until
    the result is 22 or less (22 is The Fool), then keep reducing to a single digit.
    Returns 1-3 Major Arcana deck keys, e.g. 19 -> The Sun, Wheel of Fortune, The Magician."""
    n = digit_sum(birth_date.month + birth_date.day + birth_date.year)
    while n > 22:
        n = digit_sum(n)
    numbers = [n]
    while n >= 10:
        n = digit_sum(n)
        numbers.append(n)
    return [MAJOR_ORDER[0 if x == 22 else x] for x in numbers]


def moolank(birth_date: date) -> int:
    """The root (driver) number: the day of birth, reduced to one digit."""
    return reduce_number(birth_date.day, keep_master=False)


def bhagyank(birth_date: date) -> int:
    """The destiny (conductor) number: every digit of the birth date, reduced."""
    return reduce_number(digit_sum(int(birth_date.strftime("%d%m%Y"))), keep_master=False)


def name_number(name: Optional[str]) -> Optional[Dict[str, Any]]:
    """Chaldean name number, from the Latin letters of the name, or None."""
    total = sum(CHALDEAN.get(ch, 0) for ch in (name or "").lower())
    if not total:
        return None
    number = reduce_number(total, keep_master=False)
    return {"compound": total, "number": number, "graha": NUMBER_GRAHAS[number]}


def lo_shu(birth_date: date) -> Dict[str, Any]:
    """The Lo Shu grid: each non-zero digit of the birth date, plus the Bhagyank,
    and the Moolank when the day has two digits."""
    digits = [int(d) for d in birth_date.strftime("%d%m%Y") if d != "0"]
    digits.append(bhagyank(birth_date))
    if birth_date.day >= 10:
        digits.append(moolank(birth_date))
    counts = [digits.count(n) for n in range(1, 10)]
    return {
        # counts[n - 1] is how many times n appears
        "counts": counts,
        "missing": [n for n in range(1, 10) if not counts[n - 1]],
        "planes": [
            {"name": name, "numbers": list(numbers), "meaning": meaning}
            for name, numbers, meaning in LO_SHU_PLANES
            if all(counts[n - 1] for n in numbers)
        ],
    }


def numerology(birth_date: date, name: Optional[str] = None) -> Dict[str, Any]:
    root, destiny = moolank(birth_date), bhagyank(birth_date)
    return {
        "moolank": {"number": root, "graha": NUMBER_GRAHAS[root]},
        "bhagyank": {"number": destiny, "graha": NUMBER_GRAHAS[destiny]},
        "name_number": name_number(name),
        "lo_shu": lo_shu(birth_date),
        "lo_shu_areas": LO_SHU_AREAS,
    }


def daily_card(today: date, birth_date: Optional[date] = None) -> Dict[str, Any]:
    """A card for the day, the same all day for the same person."""
    seed = f"{birth_date.isoformat() if birth_date else 'anyone'}|{today.isoformat()}"
    digest = hashlib.sha256(seed.encode()).digest()
    keys = list(TAROT_DECK)
    key = keys[int.from_bytes(digest[:4], "big") % len(keys)]
    orientation = "reversed" if digest[4] % 2 else "upright"
    return {
        "position": "Your card for today",
        "card": card_display_name(key),
        "orientation": orientation,
        "meaning": TAROT_DECK[key][orientation],
        "image": card_image_path(key),
    }


def derive_insights(
    birth_date: Optional[date],
    today: date,
    birth_time: Optional[time] = None,
    tz_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Everything the reading can use from a birth date (plus time and place if given,
    and the name for its Chaldean number).
    personal_cards maps deck keys to why they matter to this querent."""
    if birth_date is None:
        return None

    chart = birth_chart(birth_date, birth_time, tz_name, latitude, longitude)
    cards = birth_cards(birth_date)
    path = life_path(birth_date)
    year = personal_year(birth_date, today)

    reasons: Dict[str, List[str]] = {}
    for key in cards:
        reasons.setdefault(key, []).append("your birth card")
    for placement in ("sun", "moon", "rising"):
        sign = (chart or {}).get(placement)
        # Only certain placements: a cusp birth with no time could be either sign
        if sign and "alternatives" not in sign:
            reasons.setdefault(SIGN_CARDS[sign["sign"]], []).append(
                f"the card of your {sign['sign']} {placement}"
            )

    vedic = vedic_chart(birth_date, birth_time, tz_name, latitude, longitude)

    return {
        "sun": (chart or {}).get("sun"),
        "moon": (chart or {}).get("moon"),
        "rising": (chart or {}).get("rising"),
        "birth_cards": [card_display_name(k) for k in cards],
        "life_path": path,
        "life_path_theme": LIFE_PATH_THEMES[path],
        "personal_year": year,
        "personal_year_theme": PERSONAL_YEAR_THEMES[year],
        "personal_cards": {k: " and ".join(r) for k, r in reasons.items()},
        # Sidereal (Jyotish): moon rashi, janma nakshatra, sidereal sun and lagna
        "vedic": copy.deepcopy(vedic),
        # Moolank, Bhagyank, name number and the Lo Shu grid
        "numerology": numerology(birth_date, name),
    }
