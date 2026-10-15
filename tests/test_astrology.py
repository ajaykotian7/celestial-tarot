import math
from datetime import date, datetime, time, timezone

import pytest

import astrology
from astrology import ascendant, birth_chart, current_sky, ecliptic_longitude, sign_of

UTC = timezone.utc


@pytest.mark.parametrize(
    "longitude, sign", [(0, "Aries"), (29.99, "Aries"), (30, "Taurus"), (359.9, "Pisces"), (360, "Aries")]
)
def test_sign_of(longitude, sign):
    assert sign_of(longitude) == sign


def test_full_moon_january_2024_was_in_leo():
    # Full moon 2024-01-25 17:54 UTC: Moon in Leo opposite the Sun in Aquarius
    when = datetime(2024, 1, 25, 17, 54, tzinfo=UTC)
    assert sign_of(ecliptic_longitude("sun", when)) == "Aquarius"
    assert sign_of(ecliptic_longitude("moon", when)) == "Leo"


def test_march_2024_equinox():
    # The Sun entered Aries at 2024-03-20 03:06 UTC
    assert sign_of(ecliptic_longitude("sun", datetime(2024, 3, 20, 2, 0, tzinfo=UTC))) == "Pisces"
    assert sign_of(ecliptic_longitude("sun", datetime(2024, 3, 20, 4, 0, tzinfo=UTC))) == "Aries"


@pytest.mark.parametrize(
    "day, retrograde",
    # Mercury was retrograde from 2024-04-01 to 2024-04-25
    [(date(2024, 3, 25), False), (date(2024, 4, 10), True), (date(2024, 5, 5), False)],
)
def test_mercury_retrograde(day, retrograde):
    sky = current_sky(datetime.combine(day, time(12), tzinfo=UTC))
    assert sky["mercury_retrograde"] is retrograde


def test_current_sky_season():
    assert current_sky(datetime(2024, 10, 15, tzinfo=UTC))["season"] == "Libra"


@pytest.mark.parametrize(
    "when, lat, lon",
    [
        (datetime(1990, 7, 15, 9, 0, tzinfo=UTC), 19.07, 72.88),  # Mumbai
        (datetime(1985, 11, 5, 6, 15, tzinfo=UTC), 51.5, -0.12),  # London
        (datetime(2001, 2, 3, 22, 40, tzinfo=UTC), -33.87, 151.21),  # Sydney
        (datetime(1972, 6, 30, 3, 5, tzinfo=UTC), 40.71, -74.0),  # New York
    ],
)
def test_ascendant_is_on_the_eastern_horizon(when, lat, lon):
    lam = math.radians(ascendant(when, lat, lon))
    ts, _ = astrology._ephemeris()
    t = ts.from_datetime(when)
    eps = math.radians(23.4392911 - 0.0130042 * (t.tt - 2451545.0) / 36525)
    ra = math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))
    dec = math.asin(math.sin(lam) * math.sin(eps))
    hour_angle = math.radians((t.gast * 15 + lon) % 360) - ra
    phi = math.radians(lat)
    altitude = math.degrees(
        math.asin(
            math.sin(phi) * math.sin(dec)
            + math.cos(phi) * math.cos(dec) * math.cos(hour_angle)
        )
    )
    assert abs(altitude) < 1e-6
    assert math.sin(hour_angle) < 0  # east of the meridian, i.e. rising


def test_full_birth_chart():
    chart = birth_chart(date(1990, 7, 15), time(14, 30), "Asia/Kolkata", 19.07, 72.88)
    assert chart["sun"] == {"sign": "Cancer", "element": "water"}
    assert chart["moon"]["sign"] and "alternatives" not in chart["moon"]
    assert chart["rising"]["sign"]


def test_cusp_birthday_without_time_is_uncertain():
    chart = birth_chart(date(2024, 3, 20))
    assert chart["sun"]["alternatives"] == ["Pisces", "Aries"]
    assert chart["rising"] is None


@pytest.mark.parametrize("hour, sign", [(1, "Pisces"), (12, "Aries")])
def test_cusp_birthday_with_time_is_exact(hour, sign):
    chart = birth_chart(date(2024, 3, 20), time(hour), "UTC")
    assert chart["sun"] == {"sign": sign, "element": "water" if sign == "Pisces" else "fire"}


def test_no_rising_without_place():
    assert birth_chart(date(1990, 7, 15), time(14, 30), "Asia/Kolkata")["rising"] is None


def test_unknown_time_zone_falls_back_to_whole_day():
    chart = birth_chart(date(1990, 7, 15), time(14, 30), "Mars/Olympus_Mons", 19.07, 72.88)
    assert chart["sun"]["sign"] == "Cancer"
    assert chart["rising"] is None


@pytest.mark.parametrize("day", [date(1899, 12, 31), date(2100, 1, 1)])
def test_dates_outside_the_ephemeris(day):
    assert birth_chart(day) is None
