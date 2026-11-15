import os

# One thread for numpy's maths libraries: a small server has a fraction of one CPU, and
# a thread per host core would only fight over it. Set before numpy is first imported.
for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

import asyncio  # noqa: E402
import datetime as dt
import hmac
import json
import logging
import time
from collections import Counter
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI, AuthenticationError, PermissionDeniedError, RateLimitError
from pydantic import BaseModel, Field

from astrology import birth_moment, current_sky
from celestial import moon_phase
from festivals import calendar as festival_calendar
from festivals import upcoming
from jyotish import NAKSHATRAS, RASHIS, panchang
from kaudi import cast_kaudi, kaudi_tool
from kundali import _sign_ingresses, current_line, graha_longitude, jataka_summary, sign_ingresses
from matching import ashtakoota, moon_for_matching
from muhurta import ACTIVITIES, day_periods, guidance, muhurat, natal_moon, personal_day, sun_times
from personal import daily_card, derive_insights
from tarot_engine import (
    TAROT_DECK,
    card_display_name,
    card_image_path,
    draw_spread,
    find_card,
    get_tarot_meaning,
    tarot_tools,
)

load_dotenv()

logger = logging.getLogger("uvicorn.error")


def build_transit_tables() -> None:
    for graha in ("saturn", "jupiter", "rahu"):
        sign_ingresses(graha)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Shani, Guru and Rahu's ingress tables take a second or two to build; start them
    # now, in the background, so the first jataka after a restart doesn't wait
    warm_up = asyncio.create_task(asyncio.to_thread(build_transit_tables))
    yield
    warm_up.cancel()


app = FastAPI(title="Celestial Tarot AI", lifespan=lifespan)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Created only when a key is configured, so a missing key returns a clear
# error from /api/chat instead of crashing the app at startup.
api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("MY_OPEN_AI_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key else None

AVAILABLE_FUNCTIONS = {
    "draw_spread": draw_spread,
    "get_tarot_meaning": get_tarot_meaning,
    "cast_kaudi": cast_kaudi,
}
DRAW_SPREAD_TOOL = next(t for t in tarot_tools if t["function"]["name"] == "draw_spread")
ALL_TOOLS = [*tarot_tools, kaudi_tool]

# Access PIN configured in .env or Render environment variables
APP_ACCESS_PIN = os.environ.get("APP_ACCESS_PIN", "").strip()

# Number of trusted proxies that append to X-Forwarded-For (Render's proxy = 1).
# The client IP is read this many entries from the right, because entries
# further left can be set by the client. Set to 0 to ignore the header.
TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", "1"))

# Rate limits per client IP
RATE_LIMIT_WINDOW_SECONDS = 60
CHAT_RATE_LIMIT_MAX_REQUESTS = 5
PIN_RATE_LIMIT_MAX_ATTEMPTS = 5
RATE_LIMIT_MAX_TRACKED_IPS = 10_000
chat_history_by_ip: Dict[str, List[float]] = {}
pin_history_by_ip: Dict[str, List[float]] = {}

# Input caps, so a single request can't run up the OpenAI input-token bill
MAX_MESSAGE_CHARS = 1000
MAX_HISTORY_CONTENT_CHARS = 8000
MAX_HISTORY_MESSAGES = 20
HISTORY_MESSAGES_SENT_TO_MODEL = 6
MAX_RECENT_READINGS = 5
MAX_LIFE_EVENTS = 40
MAX_CALENDAR_DAYS = 92

MODEL = "gpt-4o"
MAX_COMPLETION_TOKENS = 700
# A 10-card Celtic Cross, and readings in Indian scripts, need more room
LONG_COMPLETION_TOKENS = 1200

SYSTEM_PROMPT = (
    "You are an intuitive, grounded reader of the tarot, kaudi (cowrie) prashna and "
    "Jyotish, with a gentle, reassuring voice. Soften difficult signs and emphasise hope "
    "and the querent's own agency, without hiding what you see.\n"
    "When answering:\n"
    "1. Detail what was drawn or read (each card, heap or graha) and how they interact. "
    "Mention only cards, cowries or grahas that were actually drawn, cast or read in "
    "this conversation; never invent any.\n"
    "2. Match the length to the question: a few short paragraphs for a simple question "
    "or a single card, a fuller reading for a complex question, and a thorough one for "
    "a Celtic Cross. Keep follow-up answers brief.\n"
    "3. ALWAYS conclude your reading by providing a unified takeaway in 2-3 sentences. "
    "Wrap ONLY this summary inside <tldr>...</tldr> tags.\n"
    "4. End with an open-ended reflective question.\n"
    "5. You are not a doctor, lawyer or financial adviser: for health, legal or money "
    "decisions, encourage the right professional alongside the reading."
)

EMPTY_REPLY_FALLBACK = "The cards are quiet right now. Please ask your question again."

# Problems the keeper of the app can fix, so worth naming (without any detail)
KEY_PROBLEM = (
    "The oracle's OpenAI key has expired or been revoked. Whoever looks after this app "
    "needs to set a new one."
)
OUT_OF_CREDIT = "The oracle's OpenAI credit has run out. Whoever looks after this app needs to top it up."
TOO_BUSY = "The oracle is overwhelmed right now. Please try again in a minute."

SPREAD_SIZING = (
    "Size the spread to the question: single_card for a simple or yes/no question, "
    "a three-card spread for a question with some complexity (past_present_future for "
    "how something is unfolding, situation_obstacle_advice for a problem or decision), "
    "and celtic_cross only for an extremely deep or complex question with many "
    "intertwined factors. Interpret every position."
)

KAUDI_READING = (
    "Read the three heaps in order (what has been, what is, what is coming), each through "
    "its aya, then how they lean together. Say the remainder and the aya's name and symbol "
    "for each heap."
)

# How to read a jataka, whenever one is part of the reading
JATAKA_GUIDE = (
    "Reading the jataka: answer from the mahadasha, antardasha and pratyantardasha running "
    "now and the houses their lords rule and occupy, the transits from the Moon and lagna "
    "(Sade Sati, Guru, Rahu and Ketu), the natal houses that bear on the question and their "
    "lords (for work and money: the 10th, the 11th of gains, the 2nd of wealth and the 6th "
    "of service; for marriage: the 7th, its lord and Shukra; for children: the 5th and "
    "Guru; for home and property: the 4th), and any doshas or yogas that matter to it. Name "
    "the houses and grahas you are reading from, in plain words. When they ask when, name "
    "the specific coming periods and transits in the jataka that best support it and say "
    "why, as tendencies, never certainties. Never predict death, serious illness, "
    "accidents or the end of a marriage, and never frighten: when a dosha or a hard period "
    "comes up, say what it traditionally means, any cancellations, and when it eases. Never "
    "recommend gemstones or paid pujas; if a remedy fits, offer a simple one (a prayer or "
    "mantra, a lamp, a fast, charity). The family jyotishi knows them best; never "
    "contradict them."
)

JATAKA_ONLY = (
    "This is a new question, read from their jataka alone: no tarot cards or cowries are "
    "drawn, so never mention or invent any."
)

# What to do with a new question, by the oracle the querent chose
NEW_READING_PROMPTS = {
    "tarot": "This is a new question, so draw cards with draw_spread before answering. "
    + SPREAD_SIZING,
    "kaudi": "This is a new question, so cast the cowries with cast_kaudi before answering. "
    + KAUDI_READING,
    "jataka": JATAKA_ONLY,
    "auto": (
        "This is a new question. Consult one oracle before answering. Cast the cowries "
        "(cast_kaudi) for a direct question about whether something will happen or how a "
        "matter will turn out. Draw tarot cards (draw_spread) for questions about feelings, "
        "relationships, choices, or understanding a situation. For the tarot: "
        + SPREAD_SIZING
        + " For the cowries: "
        + KAUDI_READING
    ),
}

# Added to "auto" when the querent has a jataka: one consultation, two voices
COMBINED_READING = (
    "Their jataka is below, so read it together with the cards or cowries: the jataka says "
    "when and why (the dashas and transits), the cards or cowries say how to meet it. Open "
    "with what the jataka shows, giving it at least as much room as what was drawn, then "
    "bring them together. When the question asks when, the timing must come from the "
    "jataka: name the coming antardashas or transits that support it, with their dates."
)

NO_JATAKA_REPLY = (
    "A jataka needs a birth time and birth place. Add them in Family, and the grahas will "
    "answer."
)

FOLLOW_UP_PROMPT = (
    "The querent is asking a follow-up about the cards, cowries or jataka already read in "
    "this conversation. Answer from those. Only draw or cast again if they explicitly ask "
    "for a new reading."
)

TOPICS = {
    "career": "career and work",
    "money": "money and finances",
    "marriage": "marriage",
    "love": "love and relationships",
    "health": "health and well-being",
    "family": "family",
    "children": "children",
    "studies": "studies and exams",
    "travel": "travel and living abroad",
    "home": "home and property",
    "spiritual": "spiritual life",
}

LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "kn": "Kannada",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "mr": "Marathi",
    "gu": "Gujarati",
    "bn": "Bengali",
}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_HISTORY_CONTENT_CHARS)


class LifeEvent(BaseModel):
    """Something that happened (or is planned) in a person's life, e.g. 2015 married."""

    when: str = Field(pattern=r"^\d{4}(-\d{2})?$")
    label: str = Field(min_length=1, max_length=80)


class Profile(BaseModel):
    """Kept only in the querent's browser and sent with each request. Birth details are
    used here to derive signs and numbers; they are never stored, logged, or sent to
    OpenAI. Only the derived traits (and the name) reach the model."""

    name: Optional[str] = Field(default=None, max_length=40)
    # Who this is to the person using the app: "self", "mother", "son", ...
    relation: Optional[str] = Field(default=None, max_length=24)
    birth_date: Optional[dt.date] = None
    birth_time: Optional[dt.time] = None
    # IANA time zone of the birth place, e.g. "Asia/Kolkata"
    timezone: Optional[str] = Field(default=None, max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    events: List[LifeEvent] = Field(default=[], max_length=MAX_LIFE_EVENTS)


class Place(BaseModel):
    """Where the user is now, for sunrise, Rahu Kaal and the calendar."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone: str = Field(max_length=64)


class JournalCard(BaseModel):
    card: str = Field(max_length=40)
    orientation: Literal["upright", "reversed"]
    position: str = Field(max_length=40)


class JournalHeap(BaseModel):
    position: str = Field(max_length=40)
    aya: str = Field(max_length=20)
    remainder: int = Field(ge=1, le=8)


class JournalEntry(BaseModel):
    """A summary of a past reading from the querent's on-device journal: tarot cards,
    the three heaps of a kaudi casting, and/or the dasha a jataka was read in."""

    date: dt.date
    question: str = Field(max_length=300)
    cards: List[JournalCard] = Field(default=[], max_length=10)
    kaudi: List[JournalHeap] = Field(default=[], max_length=3)
    # e.g. "Chandra–Budh" (mahadasha–antardasha)
    jataka: Optional[str] = Field(default=None, max_length=60)
    tldr: Optional[str] = Field(default=None, max_length=400)


class InsightsRequest(BaseModel):
    profile: Optional[Profile] = None
    # The querent's local date, so the card of the day turns over at their midnight
    local_date: Optional[dt.date] = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: List[ChatMessage] = Field(default=[], max_length=MAX_HISTORY_MESSAGES)
    # True for a fresh question: cards must be drawn (or cowries cast). False for
    # follow-ups about what is already on the table.
    new_reading: bool = False
    # For a new reading: the tarot, the cowries, the jataka alone, or let the reader
    # decide (which reads the jataka together with the cards or cowries)
    oracle: Literal["auto", "tarot", "kaudi", "jataka"] = "auto"
    local_date: Optional[dt.date] = None
    # The person the question is about
    profile: Optional[Profile] = None
    # The name of the person asking, when they ask about someone else
    asker: Optional[str] = Field(default=None, max_length=40)
    topic: Optional[Literal[tuple(TOPICS)]] = None  # type: ignore[valid-type]
    language: Literal[tuple(LANGUAGES)] = "en"  # type: ignore[valid-type]
    # Most recent first
    recent_readings: List[JournalEntry] = Field(default=[], max_length=MAX_RECENT_READINGS)


class DayRequest(BaseModel):
    place: Place
    local_date: dt.date
    profile: Optional[Profile] = None


class CalendarRequest(BaseModel):
    place: Place
    start: dt.date
    days: int = Field(default=31, ge=1, le=MAX_CALENDAR_DAYS)
    profile: Optional[Profile] = None


class MuhuratRequest(BaseModel):
    place: Place
    start: dt.date
    days: int = Field(default=60, ge=1, le=MAX_CALENDAR_DAYS)
    activity: Literal[tuple(ACTIVITIES)]  # type: ignore[valid-type]
    profile: Optional[Profile] = None


class MatchRequest(BaseModel):
    bride: Profile
    groom: Profile


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and TRUSTED_PROXY_HOPS > 0:
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        if hops:
            return hops[-min(TRUSTED_PROXY_HOPS, len(hops))]
    return request.client.host if request.client else "127.0.0.1"


def is_rate_limited(store: Dict[str, List[float]], key: str, max_requests: int) -> bool:
    """Sliding-window limiter. Records the request when it is allowed."""
    now = time.monotonic()

    # Drop idle IPs so the store can't grow without bound
    if len(store) > RATE_LIMIT_MAX_TRACKED_IPS:
        for k in [
            k for k, ts in store.items() if now - ts[-1] >= RATE_LIMIT_WINDOW_SECONDS
        ]:
            del store[k]

    recent = [t for t in store.get(key, []) if now - t < RATE_LIMIT_WINDOW_SECONDS]
    if len(recent) >= max_requests:
        store[key] = recent
        return True

    recent.append(now)
    store[key] = recent
    return False


def normalize_pin(value: str) -> str:
    """The PIN can be a passphrase, so ignore case and extra spaces (phones
    auto-capitalise the first word)."""
    return " ".join(value.split()).casefold()


def pin_matches(candidate: Optional[str]) -> bool:
    return hmac.compare_digest(
        normalize_pin(candidate or "").encode(), normalize_pin(APP_ACCESS_PIN).encode()
    )


def require_pin(x_app_pin: Optional[str]) -> None:
    if APP_ACCESS_PIN and not pin_matches(x_app_pin):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid access PIN.")


def run_tool(name: str, raw_args: Optional[str]) -> Dict[str, Any]:
    """Run a model-requested tool. Always returns a result, so every tool call
    gets a response message (OpenAI rejects the follow-up request otherwise)."""
    fn = AVAILABLE_FUNCTIONS.get(name)
    if fn is None:
        return {"status": "error", "message": f"Unknown tool: {name}"}
    try:
        args = json.loads(raw_args or "{}")
        return fn(**args)
    except (json.JSONDecodeError, TypeError) as e:
        return {"status": "error", "message": f"Invalid arguments for {name}: {e}"}


def split_tldr(raw_reply: Optional[str]) -> Tuple[str, Optional[str]]:
    """Separate the <tldr>...</tldr> summary from the rest of the reading."""
    raw_reply = (raw_reply or "").strip()
    if not raw_reply:
        return EMPTY_REPLY_FALLBACK, None

    if "<tldr>" not in raw_reply or "</tldr>" not in raw_reply:
        return raw_reply, None

    before, rest = raw_reply.split("<tldr>", 1)
    tldr, after = rest.split("</tldr>", 1)
    reply = before.strip()
    if after.strip():
        reply += "\n\n" + after.strip()
    return reply, tldr.strip() or None


def insights_for(
    profile: Optional[Profile], today: dt.date
) -> Optional[Dict[str, Any]]:
    """Derived traits for the querent, or None. A bad profile never breaks a reading."""
    if profile is None or profile.birth_date is None or profile.birth_date > today:
        return None
    try:
        return derive_insights(
            profile.birth_date,
            today,
            profile.birth_time,
            profile.timezone,
            profile.latitude,
            profile.longitude,
            profile.name,
        )
    except Exception:
        logger.exception("Could not derive profile insights")
        return None


def describe_placement(label: str, placement: Optional[Dict[str, Any]]) -> Optional[str]:
    if not placement:
        return None
    if "alternatives" in placement:
        return f"{label} on the {'/'.join(placement['alternatives'])} cusp"
    if label == "Rising":
        return f"{placement['sign']} rising ({placement['element']})"
    return f"{label} in {placement['sign']} ({placement['element']})"


def describe_vedic(vedic: Optional[Dict[str, Any]]) -> Optional[str]:
    if not vedic:
        return None
    parts = []
    rashi, nakshatra, sun, lagna = (vedic[k] for k in ("rashi", "nakshatra", "sun", "lagna"))
    if "alternatives" in rashi:
        parts.append(f"Moon rashi {' or '.join(rashi['alternatives'])} (birth time unknown)")
    else:
        parts.append(f"Moon rashi {rashi['name']}, ruled by {rashi['lord']}")
    if "alternatives" in nakshatra:
        parts.append(
            f"janma nakshatra {' or '.join(nakshatra['alternatives'])} (birth time unknown)"
        )
    else:
        pada = f" pada {nakshatra['pada']}" if "pada" in nakshatra else ""
        parts.append(
            f"janma nakshatra {nakshatra['name']}{pada}: deity {nakshatra['deity']}, "
            f"symbol {nakshatra['symbol']}, ruled by {nakshatra['lord']}, "
            f"a nakshatra of {nakshatra['theme']}"
        )
    if "alternatives" not in sun:
        parts.append(f"Vedic Sun in {sun['name']}")
    if lagna:
        parts.append(f"{lagna['name']} lagna")
    return (
        "Their Vedic (sidereal) chart, which many Indian querents know best: "
        + "; ".join(parts)
        + "."
    )


def describe_numerology(numbers: Dict[str, Any]) -> str:
    root, destiny, named = numbers["moolank"], numbers["bhagyank"], numbers["name_number"]
    text = (
        f"Indian numerology: Moolank {root['number']} ({root['graha']}), "
        f"Bhagyank {destiny['number']} ({destiny['graha']})"
    )
    if named:
        text += f", name number {named['number']} ({named['graha']})"
    grid = numbers["lo_shu"]
    areas = numbers["lo_shu_areas"]
    if grid["missing"]:
        missing = ", ".join(f"{n} ({areas[n]})" for n in grid["missing"])
        text += f". Missing from their Lo Shu grid: {missing}"
    if grid["planes"]:
        text += ". Complete planes: " + ", ".join(p["name"] for p in grid["planes"])
    return text + "."


def panchang_prompt(today: Dict[str, Any]) -> str:
    tithi, vara, nakshatra = today["tithi"], today["vara"], today["nakshatra"]
    yoga, karana = today["yoga"], today["karana"]
    tithi_name = (
        tithi["name"] if tithi["number"] in (15, 30) else f"{tithi['paksha']} {tithi['name']}"
    )
    text = (
        f"Today's panchang: {tithi_name} tithi, in {tithi['paksha_meaning']}; "
        f"{vara['name']}, the day of {vara['lord']}; the Moon in {nakshatra['name']} "
        f"nakshatra ({nakshatra['theme']}); {yoga['name']} yoga ({yoga['meaning']}); "
        f"{karana['name']} karana."
    )
    if tithi["observance"]:
        text += f" It is {tithi['observance']}."
    if karana["bhadra"]:
        text += " Vishti (Bhadra) karana is running, traditionally avoided for new beginnings."
    return text + " Mention the panchang only where it genuinely illuminates the reading."


def subject_prompt(payload: ChatRequest) -> Optional[str]:
    """Who is asking about whom, when the question is about someone else."""
    profile = payload.profile
    asker = " ".join((payload.asker or "").split())
    if not profile or not asker or (profile.relation or "self") == "self":
        return None
    name = " ".join((profile.name or "").split()) or "them"
    relation = " ".join((profile.relation or "").split())
    return (
        f"{asker} is asking about their {relation}, {name}. Speak to {asker}, about {name}: "
        f"everything below about the querent describes {name}."
    )


def profile_prompt(
    profile: Optional[Profile], insights: Optional[Dict[str, Any]]
) -> Optional[str]:
    if profile is None:
        return None
    lines = []
    name = " ".join((profile.name or "").split())
    if name:
        lines.append(f"Their name is {name}. Address them by name now and then.")
    if insights:
        placements = [
            describe_placement("Sun", insights["sun"]),
            describe_placement("Moon", insights["moon"]),
            describe_placement("Rising", insights["rising"]),
        ]
        placements = [p for p in placements if p]
        if placements:
            lines.append("Their chart: " + ", ".join(placements) + ".")
        lines.append(
            f"Birth card: {', '.join(insights['birth_cards'])}. "
            f"Life path number {insights['life_path']}. "
            f"Personal year {insights['personal_year']}: {insights['personal_year_theme']}."
        )
        vedic = describe_vedic(insights.get("vedic"))
        if vedic:
            lines.append(vedic)
        if insights.get("jataka"):
            lines.append(f"Their jataka: {current_line(insights['jataka'])}.")
        lines.append(describe_numerology(insights["numerology"]))
        personal = ", ".join(
            f"{card_display_name(key)} ({reason})"
            for key, reason in insights["personal_cards"].items()
        )
        lines.append(
            f"Cards with personal significance: {personal}. If one appears in the spread "
            "(it is marked 'personal'), point it out as especially meaningful."
        )
        lines.append(
            "Weave these in lightly where they illuminate the reading; don't recite them."
        )
    if profile.events:
        events = "; ".join(
            f"{e.when}: {' '.join(e.label.split())}" for e in sorted(profile.events, key=lambda e: e.when)
        )
        lines.append(
            f"Events in their life they have shared: {events}. Where the jataka's periods "
            "line up with these, say so; don't recite them."
        )
    if not lines:
        return None
    return "About the querent:\n" + "\n".join(f"- {line}" for line in lines)


def journal_prompt(entries: List[JournalEntry]) -> Optional[str]:
    if not entries:
        return None
    lines = []
    counts: Counter = Counter()
    for entry in entries:
        parts = []
        if entry.jataka:
            parts.append(f"read their jataka ({entry.jataka} dasha)")
        if entry.kaudi:
            parts.append(
                "cast the cowries: "
                + ", ".join(f"{h.position.lower()} {h.aya} ({h.remainder})" for h in entry.kaudi)
            )
        if entry.cards:
            parts.append(
                "drew "
                + ", ".join(
                    c.card + (" (reversed)" if c.orientation == "reversed" else "")
                    for c in entry.cards
                )
            )
        counts.update(c.card for c in entry.cards)
        line = f'- {entry.date.isoformat()}: "{entry.question}" {"; ".join(parts) or "asked"}.'
        if entry.tldr:
            line += f" Takeaway: {entry.tldr}"
        lines.append(line)
    text = "The querent's recent readings (most recent first):\n" + "\n".join(lines)
    recurring = [f"{card} ({n} times)" for card, n in counts.most_common() if n > 1]
    if recurring:
        text += "\nCards that keep returning to them: " + ", ".join(recurring) + "."
    return (
        text + "\nIf a card from these readings appears again, or this question continues "
        "an earlier theme, mention the connection briefly."
    )


def has_jataka(insights: Optional[Dict[str, Any]]) -> bool:
    return bool(insights and insights.get("jataka"))


def reads_jataka(payload: ChatRequest, insights: Optional[Dict[str, Any]]) -> bool:
    """Whether the full jataka is part of this reading: always for the jataka oracle and
    "let the reader decide", and for follow-ups (they may ask about timing)."""
    if not has_jataka(insights):
        return False
    return not payload.new_reading or payload.oracle in ("auto", "jataka")


def jataka_prompt(payload: ChatRequest, insights: Dict[str, Any], today: dt.date) -> str:
    summary = jataka_summary(insights["jataka"], payload.profile.birth_date, today)
    return f"Their jataka (a summary in words):\n{summary}\n\n{JATAKA_GUIDE}"


def build_system_prompt(
    payload: ChatRequest, insights: Optional[Dict[str, Any]] = None, today: Optional[dt.date] = None
) -> str:
    today = today or payload.local_date or dt.datetime.now(dt.timezone.utc).date()
    moon = moon_phase()
    sky_now = current_sky()
    sky_text = (
        f"The reading takes place under a {moon['name']}, in {sky_now['season']} season."
    )
    if sky_now["mercury_retrograde"]:
        sky_text += " Mercury is retrograde, a time of miscommunication, delays and revisiting the past."
    parts = [
        SYSTEM_PROMPT,
        sky_text + " Weave this in briefly where it fits.",
        panchang_prompt(panchang(local_date=payload.local_date)),
    ]
    parts.append(NEW_READING_PROMPTS[payload.oracle] if payload.new_reading else FOLLOW_UP_PROMPT)
    with_jataka = reads_jataka(payload, insights)
    if payload.new_reading and payload.oracle == "auto" and with_jataka:
        parts.append(COMBINED_READING)
    if payload.topic:
        parts.append(f"The question is about {TOPICS[payload.topic]}.")
    for extra in (
        subject_prompt(payload),
        profile_prompt(payload.profile, insights),
        jataka_prompt(payload, insights, today) if with_jataka else None,
        journal_prompt(payload.recent_readings),
    ):
        if extra:
            parts.append(extra)
    if payload.language != "en":
        parts.append(
            f"Write the whole reply, including the takeaway, in {LANGUAGES[payload.language]}, "
            "in its own script, simply enough for an elder to follow. Keep the <tldr> tags "
            "exactly as they are."
        )
    return "\n\n".join(parts)


def mark_personal_cards(
    cards: List[Dict[str, Any]], insights: Optional[Dict[str, Any]]
) -> None:
    """Flag drawn cards that are personally significant (birth card, sign cards)."""
    if not insights:
        return
    for card in cards:
        reason = insights["personal_cards"].get(find_card(card["card"]) or "")
        if reason:
            card["personal"] = reason[0].upper() + reason[1:]


def public_insights(insights: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if insights is None:
        return None
    return {
        **insights,
        # With artwork and meaning, for the profile portrait
        "personal_cards": [
            {
                "card": card_display_name(key),
                "reason": reason,
                "image": card_image_path(key),
                "meaning": TAROT_DECK[key]["upright"],
            }
            for key, reason in insights["personal_cards"].items()
        ],
    }


ORACLE_TOOLS = {"tarot": "draw_spread", "kaudi": "cast_kaudi"}


def tool_settings(payload: ChatRequest) -> Dict[str, Any]:
    """Tools for the first completion. A new question consults the oracle the querent
    chose, or (auto) cards or cowries as the model judges; the jataka needs no tool, as
    it is already in the prompt. Follow-ups may use any tool, or none."""
    if not payload.new_reading:
        return {"tools": ALL_TOOLS, "tool_choice": "auto"}
    if payload.oracle == "jataka":
        return {}
    if payload.oracle == "auto":
        return {
            "tools": [DRAW_SPREAD_TOOL, kaudi_tool],
            "tool_choice": "required",
            "parallel_tool_calls": False,
        }
    return {
        "tools": ALL_TOOLS,
        "tool_choice": {"type": "function", "function": {"name": ORACLE_TOOLS[payload.oracle]}},
    }


def dasha_now(insights: Dict[str, Any]) -> Optional[Dict[str, str]]:
    current = insights["jataka"]["dasha"]["current"]
    if not current:
        return None
    return {level: period["lord"] for level, period in current.items()}


def completion_tokens(payload: ChatRequest, spread: Optional[str], with_jataka: bool) -> int:
    if spread == "celtic_cross" or payload.language != "en" or (with_jataka and payload.new_reading):
        return LONG_COMPLETION_TOKENS
    return MAX_COMPLETION_TOKENS


@app.get("/")
def serve_index():
    return FileResponse("static/index.html")


@app.get("/sw.js")
def service_worker():
    # Served from the root so it can look after the whole app
    return FileResponse("static/sw.js", media_type="text/javascript")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse("static/manifest.webmanifest", media_type="application/manifest+json")


STARTED = time.monotonic()


@app.get("/api/health")
def health():
    """For checking the server from outside: how long it has been up, its memory, and
    whether the transit tables are built. No personal data."""
    try:
        with open("/proc/self/status") as f:
            rss = next(int(line.split()[1]) // 1024 for line in f if line.startswith("VmRSS"))
    except (OSError, StopIteration):
        rss = None
    return {
        "uptime_seconds": round(time.monotonic() - STARTED),
        "memory_mb": rss,
        # Shani, Guru and Rahu
        "transit_tables_ready": _sign_ingresses.cache_info().currsize >= 3,
    }


@app.post("/api/verify-pin")
async def verify_pin(request: Request, x_app_pin: Optional[str] = Header(None)):
    """Validates whether the provided PIN matches APP_ACCESS_PIN."""
    if not APP_ACCESS_PIN:
        # If no PIN is configured on the server, allow entry
        return {"status": "unlocked", "pin_required": False}

    if is_rate_limited(
        pin_history_by_ip, get_client_ip(request), PIN_RATE_LIMIT_MAX_ATTEMPTS
    ):
        raise HTTPException(
            status_code=429, detail="Too many PIN attempts. Try again in a minute."
        )

    if pin_matches(x_app_pin):
        return {"status": "unlocked", "pin_required": True}

    raise HTTPException(status_code=401, detail="Invalid sanctuary PIN.")


@app.get("/api/sky")
def sky(local_date: Optional[dt.date] = None):
    """Current moon phase, astrological season, Mercury's motion and today's panchang
    (local_date sets the weekday), shown in the UI."""
    return {
        "moon": moon_phase(),
        **current_sky(),
        "panchang": panchang(local_date=local_date),
    }


@app.post("/api/insights")
def insights(payload: InsightsRequest):
    """Derive signs, birth cards and numbers from a profile (nothing is stored), plus
    the card of the day. Works without a profile too: everyone shares that day's card."""
    today = payload.local_date or dt.datetime.now(dt.timezone.utc).date()
    profile = payload.profile
    derived = insights_for(profile, today)
    birth_date = profile.birth_date if profile and derived else None
    return {
        "insights": public_insights(derived),
        "daily_card": daily_card(today, birth_date),
    }


def _person(profile: Optional[Profile], today: dt.date):
    """(insights, natal Moon) for a profile, either of which may be None."""
    derived = insights_for(profile, today)
    return derived, natal_moon((derived or {}).get("vedic"))


@app.post("/api/day")
def day(payload: DayRequest, x_app_pin: Optional[str] = Header(None)):
    """Today for a place: sunrise, the panchang at sunrise, Rahu Kaal and the other
    periods, choghadiyas, what falls today and in the coming week, and (with a profile)
    how the day sits with the person's birth Moon."""
    require_pin(x_app_pin)
    place, today = payload.place, payload.local_date
    derived, natal = _person(payload.profile, today)
    times = sun_times(place.latitude, place.longitude, place.timezone, today, 1)[0]
    periods = day_periods(times["sunrise"], times["sunset"], times["next_sunrise"], today)
    at_sunrise = panchang(now=times["sunrise"].astimezone(dt.timezone.utc), local_date=today)
    days = festival_calendar(
        place.latitude, place.longitude, place.timezone, today, 8,
        natal, (derived or {}).get("jataka"),
    )
    mine = None
    if natal:
        # The Moon at sunrise, as the rest of the day's panchang
        moon_sign = [r[0] for r in RASHIS].index(at_sunrise["moon_rashi"])
        nakshatra = [n[0] for n in NAKSHATRAS].index(at_sunrise["nakshatra"]["name"])
        mine = personal_day(natal, moon_sign, nakshatra)
        mine["guidance"] = guidance(mine)
    jataka = (derived or {}).get("jataka")
    timeline = (derived or {}).get("timeline")
    return {
        "date": today,
        "sunrise": times["sunrise"],
        "sunset": times["sunset"],
        "next_sunrise": times["next_sunrise"],
        "approximate": times["approximate"],
        "panchang": at_sunrise,
        "month": days[0]["month"],
        "periods": periods,
        "today": days[0]["items"],
        "coming": upcoming(days[1:]),
        "moon": moon_phase(),
        "personal": mine,
        "dasha": jataka and dasha_now(derived),
        "sade_sati": timeline and timeline["sade_sati"]["current"],
        "daily_card": daily_card(today, payload.profile.birth_date if derived else None),
    }


@app.post("/api/calendar")
def calendar_endpoint(payload: CalendarRequest, x_app_pin: Optional[str] = Header(None)):
    """Festivals, fasts and sankrantis for each day, plus (with a profile) Chandrashtama
    days, dasha changes, Sade Sati and the slow grahas changing sign."""
    require_pin(x_app_pin)
    place = payload.place
    derived, natal = _person(payload.profile, payload.start)
    return {
        "days": festival_calendar(
            place.latitude, place.longitude, place.timezone, payload.start, payload.days,
            natal, (derived or {}).get("jataka"),
        )
    }


@app.post("/api/muhurat")
def muhurat_endpoint(payload: MuhuratRequest, x_app_pin: Optional[str] = Header(None)):
    """The best coming days (and hours) for an activity, for a place and optionally a
    person, with the reasons."""
    require_pin(x_app_pin)
    place = payload.place
    _, natal = _person(payload.profile, payload.start)
    return muhurat(
        place.latitude, place.longitude, place.timezone, payload.start, payload.days,
        payload.activity, natal,
    )


def _match_moon(profile: Profile, today: dt.date) -> Optional[Dict[str, Any]]:
    derived = insights_for(profile, today)
    if not derived:
        return None
    midday = None
    if not derived.get("jataka"):
        _, start, end = birth_moment(profile.birth_date, profile.birth_time, profile.timezone)
        midday = graha_longitude("moon", start + (end - start) / 2)
    moon = moon_for_matching(derived.get("vedic"), derived.get("jataka"), midday)
    if moon is None:
        return None
    mangal = next((d for d in (derived.get("jataka") or {}).get("doshas", []) if d["key"] == "mangal"), None)
    return {**moon, "mangal": mangal}


@app.post("/api/match")
def match_endpoint(payload: MatchRequest, x_app_pin: Optional[str] = Header(None)):
    """Ashtakoota guna milan for a bride and groom, with Mangal dosha for each when
    their birth times are known."""
    require_pin(x_app_pin)
    today = dt.datetime.now(dt.timezone.utc).date()
    bride, groom = _match_moon(payload.bride, today), _match_moon(payload.groom, today)
    missing = [
        p.name or role
        for p, role, moon in ((payload.bride, "the bride", bride), (payload.groom, "the groom", groom))
        if moon is None
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Matching needs a birth date for {' and '.join(missing)}, and a birth time "
                "if the Moon changed nakshatra that day."
            ),
        )
    result = ashtakoota(bride, groom)
    return {
        **result,
        "approximate": bride["approximate"] or groom["approximate"],
        "mangal": {"bride": bride["mangal"], "groom": groom["mangal"]},
    }


@app.post("/api/chat")
async def chat_endpoint(
    payload: ChatRequest, request: Request, x_app_pin: Optional[str] = Header(None)
):
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key missing. Set OPENAI_API_KEY in .env.",
        )

    # 1. Enforce PIN check
    require_pin(x_app_pin)

    # 2. Rate limiting check
    if is_rate_limited(
        chat_history_by_ip, get_client_ip(request), CHAT_RATE_LIMIT_MAX_REQUESTS
    ):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {CHAT_RATE_LIMIT_MAX_REQUESTS} readings per minute.",
        )

    # 3. Agent Execution
    try:
        today = payload.local_date or dt.datetime.now(dt.timezone.utc).date()
        querent = insights_for(payload.profile, today)
        with_jataka = reads_jataka(payload, querent)
        if payload.new_reading and payload.oracle == "jataka" and not with_jataka:
            # Nothing to read, so don't spend a completion on it
            return {
                "reply": NO_JATAKA_REPLY,
                "cards": [],
                "spread": None,
                "kaudi": None,
                "jataka": None,
                "tldr": None,
            }
        system_prompt = build_system_prompt(payload, querent, today)
        messages: List[Any] = [{"role": "system", "content": system_prompt}]

        for h in payload.history[-HISTORY_MESSAGES_SENT_TO_MODEL:]:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": payload.message})

        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            **tool_settings(payload),
            max_tokens=completion_tokens(payload, None, with_jataka),
        )

        resp_msg = response.choices[0].message
        drawn_cards_data = []
        drawn_spread = None
        cast = None

        if resp_msg.tool_calls:
            messages.append(resp_msg)
            for tool_call in resp_msg.tool_calls:
                fn_name = tool_call.function.name
                tool_res = run_tool(fn_name, tool_call.function.arguments)
                if fn_name == "draw_spread" and "cards" in tool_res:
                    # Marked before the model sees the result, so it can call them out
                    mark_personal_cards(tool_res["cards"], querent)
                    drawn_cards_data = tool_res["cards"]
                    drawn_spread = tool_res["spread_type"]
                elif fn_name == "cast_kaudi" and "heaps" in tool_res:
                    cast = tool_res

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(tool_res),
                    }
                )

            final_resp = await client.chat.completions.create(
                model=MODEL,
                messages=messages,
                max_tokens=completion_tokens(payload, drawn_spread, with_jataka),
            )
            raw_reply = final_resp.choices[0].message.content
        else:
            raw_reply = resp_msg.content

        assistant_reply, tldr_summary = split_tldr(raw_reply)

        return {
            "reply": assistant_reply,
            "cards": drawn_cards_data,
            "spread": drawn_spread,
            "kaudi": cast and {"heaps": cast["heaps"], "leaning": cast["leaning"]},
            # The dasha lords a new reading was read in; the browser draws the chart itself
            "jataka": dasha_now(querent) if with_jataka and payload.new_reading else None,
            "tldr": tldr_summary,
        }

    except (AuthenticationError, PermissionDeniedError):
        logger.exception("OpenAI rejected the API key")
        raise HTTPException(status_code=503, detail=KEY_PROBLEM)
    except RateLimitError as e:
        logger.exception("OpenAI rate limit or quota")
        raise HTTPException(
            status_code=503,
            detail=OUT_OF_CREDIT if e.code == "insufficient_quota" else TOO_BUSY,
        )
    except Exception:
        # Full details go to the server log only; the client gets a generic message
        logger.exception("Error during /api/chat execution")
        raise HTTPException(
            status_code=500,
            detail="The oracle could not complete your reading. Please try again.",
        )
