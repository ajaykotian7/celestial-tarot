import datetime as dt
import hmac
import json
import logging
import os
import time
from collections import Counter
from typing import Any, Dict, List, Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from astrology import current_sky
from celestial import is_witching_hour, moon_phase
from jyotish import panchang
from kaudi import cast_kaudi, kaudi_tool
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

app = FastAPI(title="Celestial Tarot AI")

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

MODEL = "gpt-4o"
MAX_COMPLETION_TOKENS = 700
# A 10-card Celtic Cross needs more room to cover every position
CELTIC_CROSS_COMPLETION_TOKENS = 1200

SYSTEM_PROMPT = (
    "You are an intuitive, grounded Tarot AI reader with a gentle, reassuring voice. "
    "Soften difficult cards and emphasise hope and the querent's own agency, without "
    "hiding what the cards say.\n"
    "When answering a query or drawing cards:\n"
    "1. Detail individual cards and interactions.\n"
    "2. Match the length to the question: a few short paragraphs for a simple question "
    "or a single card, a fuller reading for a complex question, and a thorough one for "
    "a Celtic Cross. Keep follow-up answers brief.\n"
    "3. ALWAYS conclude your reading by providing a unified takeaway in 2-3 sentences. "
    "Wrap ONLY this summary inside <tldr>...</tldr> tags.\n"
    "4. End with an open-ended reflective question."
)

EMPTY_REPLY_FALLBACK = "The cards are quiet right now. Please ask your question again."

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

# What to do with a new question, by the oracle the querent chose
NEW_READING_PROMPTS = {
    "tarot": "This is a new question, so draw cards with draw_spread before answering. "
    + SPREAD_SIZING,
    "kaudi": "This is a new question, so cast the cowries with cast_kaudi before answering. "
    + KAUDI_READING,
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

FOLLOW_UP_PROMPT = (
    "The querent is asking a follow-up about the cards or cowries already cast in this "
    "conversation. Answer from those. Only draw or cast again if they explicitly ask for "
    "a new reading."
)

# In the app's story, watchers in the dark try to cloud readings; the querent drives
# them off with the lamp. If one was still watching when they asked:
WATCHED_PROMPT = (
    "Something unseen was watching from the dark as the querent asked this question. "
    "Near the end, in one gentle sentence, invite them to trust what rings true in this "
    "reading and let the rest fall away. Keep it calm and kind; never frighten them."
)

WITCHING_HOUR_PROMPT = (
    "It is the witching hour where the querent is (after midnight). Let the atmosphere "
    "grow darker, more ominous and uncanny, while your voice stays gentle and kind: "
    "never frighten them about real-world harm."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_HISTORY_CONTENT_CHARS)


class Profile(BaseModel):
    """Kept only in the querent's browser and sent with each request. Birth details are
    used here to derive signs and numbers; they are never stored, logged, or sent to
    OpenAI. Only the derived traits (and the name) reach the model."""

    name: Optional[str] = Field(default=None, max_length=40)
    birth_date: Optional[dt.date] = None
    birth_time: Optional[dt.time] = None
    # IANA time zone of the birth place, e.g. "Asia/Kolkata"
    timezone: Optional[str] = Field(default=None, max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


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
    or the three heaps of a kaudi casting."""

    date: dt.date
    question: str = Field(max_length=300)
    cards: List[JournalCard] = Field(default=[], max_length=10)
    kaudi: List[JournalHeap] = Field(default=[], max_length=3)
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
    # For a new reading: the tarot, the cowries, or let the oracle choose
    oracle: Literal["auto", "tarot", "kaudi"] = "auto"
    # A watcher was in the dark, uncaught, when the question was asked
    watched: bool = False
    # The querent's local hour, used for the witching-hour tone
    local_hour: Optional[int] = Field(default=None, ge=0, le=23)
    local_date: Optional[dt.date] = None
    profile: Optional[Profile] = None
    # Most recent first
    recent_readings: List[JournalEntry] = Field(default=[], max_length=MAX_RECENT_READINGS)


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
            "Weave these in lightly where they illuminate the cards; don't recite them."
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
        if entry.kaudi:
            drew = "cast the cowries: " + ", ".join(
                f"{h.position.lower()} {h.aya} ({h.remainder})" for h in entry.kaudi
            )
        else:
            drew = "drew " + ", ".join(
                c.card + (" (reversed)" if c.orientation == "reversed" else "")
                for c in entry.cards
            )
        counts.update(c.card for c in entry.cards)
        line = f'- {entry.date.isoformat()}: "{entry.question}" {drew}.'
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


def build_system_prompt(
    payload: ChatRequest, insights: Optional[Dict[str, Any]] = None
) -> str:
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
    if is_witching_hour(payload.local_hour):
        parts.append(WITCHING_HOUR_PROMPT)
    if payload.watched and payload.new_reading:
        parts.append(WATCHED_PROMPT)
    for extra in (
        profile_prompt(payload.profile, insights),
        journal_prompt(payload.recent_readings),
    ):
        if extra:
            parts.append(extra)
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


def tool_settings(payload: ChatRequest) -> Dict[str, Any]:
    """Tools for the first completion. A new question must consult exactly one oracle:
    the one the querent chose, or (auto) whichever the model judges fits. Follow-ups
    may use any tool, or none."""
    if not payload.new_reading:
        return {"tools": ALL_TOOLS, "tool_choice": "auto"}
    if payload.oracle == "auto":
        return {
            "tools": [DRAW_SPREAD_TOOL, kaudi_tool],
            "tool_choice": "required",
            "parallel_tool_calls": False,
        }
    name = "cast_kaudi" if payload.oracle == "kaudi" else "draw_spread"
    return {
        "tools": ALL_TOOLS,
        "tool_choice": {"type": "function", "function": {"name": name}},
    }


@app.get("/")
def serve_index():
    return FileResponse("static/index.html")


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
    if APP_ACCESS_PIN and not pin_matches(x_app_pin):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid access PIN.")

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
        system_prompt = build_system_prompt(payload, querent)
        messages: List[Any] = [{"role": "system", "content": system_prompt}]

        for h in payload.history[-HISTORY_MESSAGES_SENT_TO_MODEL:]:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": payload.message})

        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            **tool_settings(payload),
            max_tokens=MAX_COMPLETION_TOKENS,
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
                max_tokens=(
                    CELTIC_CROSS_COMPLETION_TOKENS
                    if drawn_spread == "celtic_cross"
                    else MAX_COMPLETION_TOKENS
                ),
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
            "tldr": tldr_summary,
        }

    except Exception:
        # Full details go to the server log only; the client gets a generic message
        logger.exception("Error during /api/chat execution")
        raise HTTPException(
            status_code=500,
            detail="The oracle could not complete your reading. Please try again.",
        )
