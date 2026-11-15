from datetime import date

import pytest

from festivals import calendar, lunar_months

MUMBAI = (19.07, 72.88, "Asia/Kolkata")


@pytest.fixture(scope="module")
def festivals_2024_25():
    days = calendar(*MUMBAI, date(2024, 8, 1), 92) + calendar(*MUMBAI, date(2024, 11, 1), 92) + calendar(
        *MUMBAI, date(2025, 2, 1), 92
    )
    return {item["name"]: d["date"] for d in days for item in d["items"] if item["kind"] in ("festival", "sankranti")}


# Published dates (Drik Panchang, Mumbai)
@pytest.mark.parametrize(
    "name, day",
    [
        ("Raksha Bandhan", date(2024, 8, 19)),
        ("Krishna Janmashtami", date(2024, 8, 26)),
        ("Ganesh Chaturthi", date(2024, 9, 7)),
        ("Navaratri begins", date(2024, 10, 3)),
        ("Vijayadashami (Dussehra)", date(2024, 10, 12)),
        ("Karwa Chauth", date(2024, 10, 20)),
        ("Dhanteras", date(2024, 10, 29)),
        ("Deepavali (Lakshmi Puja)", date(2024, 10, 31)),
        ("Bhai Dooj", date(2024, 11, 3)),
        ("Makar Sankranti (Pongal, Uttarayan)", date(2025, 1, 14)),
        ("Vasant Panchami", date(2025, 2, 2)),
        ("Maha Shivaratri", date(2025, 2, 26)),
        ("Holika Dahan", date(2025, 3, 13)),
        ("Holi", date(2025, 3, 14)),
        ("Ugadi / Gudi Padwa", date(2025, 3, 30)),
        ("Ram Navami", date(2025, 4, 6)),
        ("Mesha Sankranti (Vishu, Baisakhi)", date(2025, 4, 14)),
    ],
)
def test_festivals_fall_on_their_published_dates(festivals_2024_25, name, day):
    assert festivals_2024_25[name] == day


def test_ekadashis_2025():
    days = calendar(*MUMBAI, date(2025, 1, 1), 92)
    ekadashis = [d["date"] for d in days if any(i["name"] == "Ekadashi" for i in d["items"])]
    assert ekadashis[:6] == [
        date(2025, 1, 10), date(2025, 1, 25), date(2025, 2, 8),
        date(2025, 2, 24), date(2025, 3, 10), date(2025, 3, 25),
    ]


def test_lunar_months_and_an_adhika_month():
    from datetime import datetime, timezone

    months = lunar_months(datetime(2026, 4, 1, tzinfo=timezone.utc), datetime(2026, 8, 1, tzinfo=timezone.utc))
    names = [("Adhika " if m["adhika"] else "") + m["name"] for m in months]
    # 2026 has an Adhika Jyeshtha (17 May to 15 June)
    assert "Adhika Jyeshtha" in names
    assert names.index("Adhika Jyeshtha") + 1 == names.index("Jyeshtha")


def test_days_carry_the_tithi_and_month():
    (day,) = calendar(*MUMBAI, date(2024, 10, 31), 1)
    assert day["tithi"]["name"] == "Chaturdashi" and day["tithi"]["paksha"] == "Krishna"
    assert day["month"] == "Ashwin"


def test_chandrashtama_days_for_a_person():
    days = calendar(*MUMBAI, date(2026, 11, 1), 30, natal={"sign": 11, "nakshatra": 26})
    cautions = [d["date"] for d in days if any(i["name"] == "Chandrashtama" for i in d["items"])]
    # The Moon passes each sign every ~27 days, for two or three days
    assert 2 <= len(cautions) <= 4
