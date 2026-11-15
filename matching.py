"""Kundali matching: Ashtakoota guna milan, the 36-point match of two birth Moons.

Eight kootas compare the bride's and groom's Moon signs and nakshatras: Varna (1),
Vashya (2), Tara (3), Yoni (4), Graha Maitri (5), Gana (6), Bhakoot (7) and Nadi (8).
The tables are the ones most Indian software uses; traditions differ in places, so
each koota says what it compared.
"""

from typing import Any, Dict, List, Optional

from jyotish import NAKSHATRA_SPAN, NAKSHATRAS, RASHIS
from kundali import SIGN_LORDS, graha_name

# Varna by rashi: 3 Brahmin, 2 Kshatriya, 1 Vaishya, 0 Shudra
VARNAS = ["Shudra", "Vaishya", "Kshatriya", "Brahmin"]
SIGN_VARNA = [2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3]

# Vashya groups; Dhanu and Makara change group at 15°
VASHYA_GROUPS = ["Chatushpada", "Manava", "Jalachara", "Vanachara", "Keeta"]
VASHYA_SCORES = [
    [2, 1, 1, 0.5, 1],
    [1, 2, 0.5, 0, 1],
    [1, 0.5, 2, 1, 1],
    [0.5, 0, 1, 2, 0],
    [1, 1, 1, 0, 2],
]

YONIS = [
    "Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat",
    "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion",
]
# Each nakshatra's yoni, Ashwini first
NAKSHATRA_YONI = [
    0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9,
    8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1,
]
YONI_SCORES = [
    [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
    [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
    [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
    [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
    [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
    [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
    [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
    [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
    [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
    [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
    [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
    [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
    [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
    [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
]

# Natural friendships (Parashara): graha -> (friends, enemies); the rest are neutral
FRIENDSHIP = {
    "sun": ({"moon", "mars", "jupiter"}, {"venus", "saturn"}),
    "moon": ({"sun", "mercury"}, set()),
    "mars": ({"sun", "moon", "jupiter"}, {"mercury"}),
    "mercury": ({"sun", "venus"}, {"moon"}),
    "jupiter": ({"sun", "moon", "mars"}, {"mercury", "venus"}),
    "venus": ({"mercury", "saturn"}, {"sun", "moon"}),
    "saturn": ({"mercury", "venus"}, {"sun", "moon", "mars"}),
}

GANAS = ["Deva", "Manushya", "Rakshasa"]
NAKSHATRA_GANA = [
    0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2,
    0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0,
]
# [groom][bride]
GANA_SCORES = [[6, 6, 0], [5, 6, 0], [1, 0, 6]]

NADIS = ["Adi", "Madhya", "Antya"]
NADI_PATTERN = [0, 1, 2, 2, 1, 0]

# Distances (bride to groom, groom to bride) that bring Bhakoot dosha
BHAKOOT_DOSHA = {(2, 12), (12, 2), (5, 9), (9, 5), (6, 8), (8, 6)}


def moon_of(longitude: float) -> Dict[str, Any]:
    longitude %= 360
    return {
        "longitude": longitude,
        "sign": int(longitude // 30),
        "nakshatra": min(int(longitude // NAKSHATRA_SPAN), 26),
        "pada": min(int(longitude % NAKSHATRA_SPAN // (NAKSHATRA_SPAN / 4)), 3) + 1,
    }


def _vashya(moon: Dict[str, Any]) -> int:
    sign, degree = moon["sign"], moon["longitude"] % 30
    if sign == 8:
        return 1 if degree < 15 else 0
    if sign == 9:
        return 0 if degree < 15 else 2
    return [0, 0, 1, 2, 3, 1, 1, 4, None, None, 1, 2][sign]


def _relation(a: str, b: str) -> str:
    if a == b:
        return "friend"
    friends, enemies = FRIENDSHIP[a]
    return "friend" if b in friends else "enemy" if b in enemies else "neutral"


def _maitri(lord_a: str, lord_b: str) -> float:
    pair = sorted([_relation(lord_a, lord_b), _relation(lord_b, lord_a)])
    return {
        ("friend", "friend"): 5,
        ("friend", "neutral"): 4,
        ("neutral", "neutral"): 3,
        ("enemy", "friend"): 1,
        ("enemy", "neutral"): 0.5,
        ("enemy", "enemy"): 0,
    }[tuple(pair)]


def _tara_ok(from_nakshatra: int, to_nakshatra: int) -> bool:
    return (to_nakshatra - from_nakshatra) % 27 % 9 + 1 not in (3, 5, 7)


def ashtakoota(bride: Dict[str, Any], groom: Dict[str, Any]) -> Dict[str, Any]:
    """bride and groom are moon_of() results."""
    b_sign, g_sign = bride["sign"], groom["sign"]
    b_nak, g_nak = bride["nakshatra"], groom["nakshatra"]
    b_lord, g_lord = SIGN_LORDS[b_sign], SIGN_LORDS[g_sign]
    kootas: List[Dict[str, Any]] = []

    def koota(key, name, points, score, bride_value, groom_value, meaning):
        kootas.append(
            {
                "key": key,
                "name": name,
                "max": points,
                "score": score,
                "bride": bride_value,
                "groom": groom_value,
                "meaning": meaning,
            }
        )

    koota(
        "varna", "Varna", 1,
        1 if SIGN_VARNA[g_sign] >= SIGN_VARNA[b_sign] else 0,
        VARNAS[SIGN_VARNA[b_sign]], VARNAS[SIGN_VARNA[g_sign]],
        "spiritual temperament and ego",
    )
    bv, gv = _vashya(bride), _vashya(groom)
    koota(
        "vashya", "Vashya", 2, VASHYA_SCORES[gv][bv],
        VASHYA_GROUPS[bv], VASHYA_GROUPS[gv],
        "mutual attraction and who leads",
    )
    tara = (1.5 if _tara_ok(b_nak, g_nak) else 0) + (1.5 if _tara_ok(g_nak, b_nak) else 0)
    koota(
        "tara", "Tara", 3, tara,
        NAKSHATRAS[b_nak][0], NAKSHATRAS[g_nak][0],
        "health and fortune together",
    )
    by, gy = NAKSHATRA_YONI[b_nak], NAKSHATRA_YONI[g_nak]
    koota(
        "yoni", "Yoni", 4, YONI_SCORES[gy][by], YONIS[by], YONIS[gy],
        "physical and intimate compatibility",
    )
    koota(
        "graha_maitri", "Graha Maitri", 5, _maitri(b_lord, g_lord),
        graha_name(b_lord), graha_name(g_lord),
        "friendship of the Moon-sign lords: mental harmony",
    )
    bg, gg = NAKSHATRA_GANA[b_nak], NAKSHATRA_GANA[g_nak]
    koota(
        "gana", "Gana", 6, GANA_SCORES[gg][bg], GANAS[bg], GANAS[gg],
        "nature and temperament",
    )
    distance = ((g_sign - b_sign) % 12 + 1, (b_sign - g_sign) % 12 + 1)
    koota(
        "bhakoot", "Bhakoot", 7, 0 if distance in BHAKOOT_DOSHA else 7,
        RASHIS[b_sign][0], RASHIS[g_sign][0],
        "family welfare, prosperity and children",
    )
    bn, gn = NADI_PATTERN[b_nak % 6], NADI_PATTERN[g_nak % 6]
    koota(
        "nadi", "Nadi", 8, 0 if bn == gn else 8, NADIS[bn], NADIS[gn],
        "health and progeny",
    )

    total = sum(k["score"] for k in kootas)
    doshas = []
    if distance in BHAKOOT_DOSHA:
        eased = []
        if b_lord == g_lord:
            eased.append("both Moon signs share a lord")
        elif _relation(b_lord, g_lord) == "friend" and _relation(g_lord, b_lord) == "friend":
            eased.append("the Moon-sign lords are friends")
        doshas.append(
            {
                "name": "Bhakoot dosha",
                "detail": f"The Moon signs are {distance[0]}/{distance[1]} from each other.",
                "cancellations": eased,
            }
        )
    if bn == gn:
        eased = []
        if b_nak == g_nak and b_sign != g_sign:
            eased.append("the same nakshatra but different rashis")
        if b_sign == g_sign and b_nak != g_nak:
            eased.append("the same rashi but different nakshatras")
        if b_nak == g_nak and bride["pada"] != groom["pada"]:
            eased.append("the same nakshatra but different padas")
        doshas.append(
            {
                "name": "Nadi dosha",
                "detail": f"Both have {NADIS[bn]} nadi.",
                "cancellations": eased,
            }
        )
    if total >= 28:
        verdict = "An excellent match by the gunas."
    elif total >= 18:
        verdict = "A good match by the gunas (18 or more is traditionally accepted)."
    else:
        verdict = "Below the traditional 18 gunas; jyotishis look closely at the full charts in such cases."
    return {"kootas": kootas, "total": total, "max": 36, "verdict": verdict, "doshas": doshas}


def moon_for_matching(
    vedic: Optional[Dict[str, Any]], jataka: Optional[Dict[str, Any]], midday_longitude: Optional[float]
) -> Optional[Dict[str, Any]]:
    """The birth Moon to match with: exact from the jataka, otherwise the day's Moon if
    its rashi and nakshatra didn't change that day (approximate)."""
    if jataka:
        moon = next(g for g in jataka["grahas"] if g["key"] == "moon")
        return {**moon_of(moon["longitude"]), "approximate": False}
    if not vedic or midday_longitude is None:
        return None
    if "alternatives" in vedic["rashi"] or "alternatives" in vedic["nakshatra"]:
        return None
    return {**moon_of(midday_longitude), "approximate": True}
