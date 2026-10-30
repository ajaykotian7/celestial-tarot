"""Kaudi prashna: a reading from cowrie shells, inspired by the cowrie counting of
Kerala's Ashtamangala prashna. A handful of cowries is split into three heaps (what
has been, what is, what is coming) and each heap is counted away in eights. The
remainder, 1 to 8, names one of the eight ayas; odd ayas are favourable and even ones
ask for patience, as in Vastu. The shells are cast here, at random, so the model can't
invent them."""

import random
from typing import Any, Dict

TOTAL_COWRIES = 108
# How many of the 108 the querent's hand takes
HANDFUL = (36, 96)

HEAPS = ["What has been", "What is", "What is coming"]

# Remainder -> (aya, Devanagari, symbol, meaning)
AYAS = {
    1: ("Dhwaja", "ध्वज", "the flag", "victory, honour and a cause raised high"),
    2: ("Dhooma", "धूम", "smoke", "confusion and hidden things; what is unclear will clear in time"),
    3: ("Simha", "सिंह", "the lion", "courage, authority and the strength to act"),
    4: ("Shwana", "श्वान", "the dog", "loyalty tested; notice who stands beside you"),
    5: ("Vrishabha", "वृषभ", "the bull", "steady growth, patience rewarded, and plenty"),
    6: ("Khara", "खर", "the donkey", "burdens and toil; the load is heavy, but it is being carried"),
    7: ("Gaja", "गज", "the elephant", "wisdom and blessings; obstacles are removed"),
    8: ("Kaka", "काक", "the crow", "messages from the ancestors; an ending, or a warning to heed"),
}

# How the three heaps lean together, by how many are favourable
LEANINGS = {
    3: "The shells smile on this question.",
    2: "The shells lean kindly, with one heap asking for care.",
    1: "The shells ask for patience, with one heap offering hope.",
    0: "The shells ask for great patience; what is wanted will not come by force.",
}


def cast_kaudi() -> Dict[str, Any]:
    handful = random.randint(*HANDFUL)
    first, second = sorted(random.sample(range(1, handful), 2))
    counts = [first, second - first, handful - second]

    heaps = []
    for position, count in zip(HEAPS, counts):
        remainder = count % 8 or 8
        aya, devanagari, symbol, meaning = AYAS[remainder]
        heaps.append(
            {
                "position": position,
                "count": count,
                "remainder": remainder,
                "aya": aya,
                "devanagari": devanagari,
                "symbol": symbol,
                "meaning": meaning,
                "favourable": remainder % 2 == 1,
            }
        )
    favourable = sum(h["favourable"] for h in heaps)
    return {
        "status": "success",
        "cowries": handful,
        "heaps": heaps,
        "leaning": LEANINGS[favourable],
    }


kaudi_tool = {
    "type": "function",
    "function": {
        "name": "cast_kaudi",
        "description": (
            "Casts cowrie shells (kaudi prashna) for a direct question about whether something "
            "will happen or how a matter will turn out. A handful is split into three heaps "
            "for what has been, what is, and what is coming; each heap counted by eights "
            "leaves a remainder naming one of the eight ayas. Odd ayas are favourable, even "
            "ones ask for patience."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
}
