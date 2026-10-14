from datetime import datetime, timezone

import pytest

from celestial import is_witching_hour, moon_phase


@pytest.mark.parametrize(
    "when, expected",
    [
        # Published new and full moons (UTC)
        (datetime(2024, 1, 11, 11, 57, tzinfo=timezone.utc), "New Moon"),
        (datetime(2024, 1, 25, 17, 54, tzinfo=timezone.utc), "Full Moon"),
        (datetime(2025, 3, 14, 6, 55, tzinfo=timezone.utc), "Full Moon"),
        (datetime(2025, 3, 29, 10, 58, tzinfo=timezone.utc), "New Moon"),
        # Quarters
        (datetime(2024, 1, 18, 3, 53, tzinfo=timezone.utc), "First Quarter"),
        (datetime(2024, 2, 2, 23, 18, tzinfo=timezone.utc), "Last Quarter"),
        # In between
        (datetime(2024, 1, 14, 12, 0, tzinfo=timezone.utc), "Waxing Crescent"),
        (datetime(2024, 1, 29, 12, 0, tzinfo=timezone.utc), "Waning Gibbous"),
    ],
)
def test_moon_phase_matches_known_dates(when, expected):
    assert moon_phase(when)["name"] == expected


def test_moon_phase_fraction_is_in_range():
    assert 0 <= moon_phase()["fraction"] < 1


@pytest.mark.parametrize("hour, expected", [(0, True), (3, True), (4, False), (12, False), (None, False)])
def test_is_witching_hour(hour, expected):
    assert is_witching_hour(hour) is expected
