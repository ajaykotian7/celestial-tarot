"""Personal insights from the querent's profile: numerology, birth cards, sign cards
and a card of the day. Only these derived traits reach the model, never the raw
birth date, time or place."""

import hashlib
from datetime import date, time
from typing import Any, Dict, List, Optional

from astrology import birth_chart
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
) -> Optional[Dict[str, Any]]:
    """Everything the reading can use from a birth date (plus time and place if given).
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
    }
