from datetime import datetime, timezone
from typing import Any, Dict, Optional

SYNODIC_MONTH_DAYS = 29.530588853
# A known new moon: 2000-01-06 18:14 UTC
REFERENCE_NEW_MOON = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)

# (upper bound as a fraction of the cycle, name, emoji)
PHASES = [
    (1 / 16, "New Moon", "🌑"),
    (3 / 16, "Waxing Crescent", "🌒"),
    (5 / 16, "First Quarter", "🌓"),
    (7 / 16, "Waxing Gibbous", "🌔"),
    (9 / 16, "Full Moon", "🌕"),
    (11 / 16, "Waning Gibbous", "🌖"),
    (13 / 16, "Last Quarter", "🌗"),
    (15 / 16, "Waning Crescent", "🌘"),
    (1.0, "New Moon", "🌑"),
]

# Local hours (0-23) that count as the witching hour
WITCHING_HOURS = range(0, 4)


def moon_phase(now: Optional[datetime] = None) -> Dict[str, Any]:
    """Approximate moon phase (accurate to within about a day)."""
    now = now or datetime.now(timezone.utc)
    days = (now - REFERENCE_NEW_MOON).total_seconds() / 86400
    fraction = (days % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS
    name, emoji = next((n, e) for bound, n, e in PHASES if fraction < bound)
    return {"name": name, "emoji": emoji, "fraction": round(fraction, 4)}


def is_witching_hour(local_hour: Optional[int]) -> bool:
    return local_hour in WITCHING_HOURS
