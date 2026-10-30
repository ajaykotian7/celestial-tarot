"""Western (tropical) astrology from NASA JPL ephemeris data, via Skyfield.

data/de440s-excerpt.bsp is an excerpt of JPL's DE440s covering only the Sun, Moon,
Earth and Mercury from 1900 to 2100, made with:
    python -m jplephem excerpt --targets 1,3,10,301,399 1900/01/01 2100/01/01 \
        https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp \
        data/de440s-excerpt.bsp
"""

import math
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from skyfield.api import load, load_file
from skyfield.framelib import ecliptic_frame

EPHEMERIS_PATH = Path(__file__).resolve().parent / "data" / "de440s-excerpt.bsp"
# A day of margin inside the excerpt's 1900-2100 range
EPHEMERIS_FIRST_DAY = date(1900, 1, 3)
EPHEMERIS_LAST_DAY = date(2099, 12, 29)

SIGNS = [
    ("Aries", "fire"),
    ("Taurus", "earth"),
    ("Gemini", "air"),
    ("Cancer", "water"),
    ("Leo", "fire"),
    ("Virgo", "earth"),
    ("Libra", "air"),
    ("Scorpio", "water"),
    ("Sagittarius", "fire"),
    ("Capricorn", "earth"),
    ("Aquarius", "air"),
    ("Pisces", "water"),
]
ELEMENTS = dict(SIGNS)

BODIES = {"sun": "sun", "moon": "moon", "mercury": "mercury barycenter"}


@lru_cache(maxsize=1)
def _ephemeris():
    # Built-in timescale data, so nothing is downloaded at runtime
    return load.timescale(builtin=True), load_file(str(EPHEMERIS_PATH))


def sign_of(longitude: float) -> str:
    return SIGNS[int(longitude % 360 // 30)][0]


def ecliptic_longitude(body: str, when: datetime) -> float:
    """Apparent geocentric longitude in degrees, on the ecliptic of date (tropical)."""
    ts, eph = _ephemeris()
    t = ts.from_datetime(when)
    # Light deflection by the Sun only: the excerpt has no Jupiter or Saturn, whose
    # effect (milliarcseconds) could never change a sign
    position = eph["earth"].at(t).observe(eph[BODIES[body]]).apparent(deflectors=(10,))
    _, lon, _ = position.frame_latlon(ecliptic_frame)
    return lon.degrees


def ascendant(when: datetime, latitude: float, longitude: float) -> float:
    """Ecliptic longitude of the point rising on the eastern horizon."""
    ts, _ = _ephemeris()
    t = ts.from_datetime(when)
    ramc = math.radians((t.gast * 15 + longitude) % 360)
    centuries = (t.tt - 2451545.0) / 36525
    obliquity = math.radians(23.4392911 - 0.0130042 * centuries)
    phi = math.radians(latitude)
    asc = math.atan2(
        math.cos(ramc),
        -(math.sin(ramc) * math.cos(obliquity) + math.tan(phi) * math.sin(obliquity)),
    )
    return math.degrees(asc) % 360


def _placement(sign: str, alternatives=None) -> Dict[str, Any]:
    result = {"sign": sign, "element": ELEMENTS[sign]}
    if alternatives:
        result["alternatives"] = alternatives
    return result


def _sign_over(body: str, start: datetime, end: datetime) -> Dict[str, Any]:
    """The body's sign across a window. If it changes sign within the window (a cusp
    birth with no exact time), report both possibilities rather than guess."""
    first = sign_of(ecliptic_longitude(body, start))
    last = sign_of(ecliptic_longitude(body, end))
    if first == last:
        return _placement(first)
    middle = start + (end - start) / 2
    return _placement(sign_of(ecliptic_longitude(body, middle)), [first, last])


def birth_moment(
    birth_date: date, birth_time: Optional[time] = None, tz_name: Optional[str] = None
) -> Tuple[Optional[datetime], datetime, datetime]:
    """(exact instant or None, window start, window end) for a birth. Without a time,
    the window covers the birth day in its zone, or everywhere on Earth if the zone
    is unknown."""
    zone = None
    if tz_name:
        try:
            zone = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError):
            zone = None

    if birth_time is not None and zone is not None:
        instant = datetime.combine(birth_date, birth_time, tzinfo=zone)
        return instant, instant, instant

    if zone is not None:
        start = datetime.combine(birth_date, time.min, tzinfo=zone)
        return None, start, start + timedelta(days=1)

    # Unknown time zone: UTC-12 to UTC+14
    midnight_utc = datetime.combine(birth_date, time.min, tzinfo=timezone.utc)
    return None, midnight_utc - timedelta(hours=14), midnight_utc + timedelta(hours=36)


def in_ephemeris(day: date) -> bool:
    return EPHEMERIS_FIRST_DAY <= day <= EPHEMERIS_LAST_DAY


def birth_chart(
    birth_date: date,
    birth_time: Optional[time] = None,
    tz_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Sun, Moon and rising signs. Rising needs birth time and place; without an
    exact time, a sign that changes during the birth day comes back as uncertain."""
    if not in_ephemeris(birth_date):
        return None

    instant, start, end = birth_moment(birth_date, birth_time, tz_name)
    if instant is not None:
        rising = None
        if latitude is not None and longitude is not None:
            rising = _placement(sign_of(ascendant(instant, latitude, longitude)))
        return {
            "sun": _placement(sign_of(ecliptic_longitude("sun", instant))),
            "moon": _placement(sign_of(ecliptic_longitude("moon", instant))),
            "rising": rising,
        }

    return {
        "sun": _sign_over("sun", start, end),
        "moon": _sign_over("moon", start, end),
        "rising": None,
    }


def current_sky(now: Optional[datetime] = None) -> Dict[str, Any]:
    """The current astrological season and whether Mercury is retrograde."""
    now = now or datetime.now(timezone.utc)
    mercury_now = ecliptic_longitude("mercury", now)
    mercury_tomorrow = ecliptic_longitude("mercury", now + timedelta(days=1))
    motion = (mercury_tomorrow - mercury_now + 540) % 360 - 180
    return {
        "season": sign_of(ecliptic_longitude("sun", now)),
        "mercury_retrograde": bool(motion < 0),
    }
