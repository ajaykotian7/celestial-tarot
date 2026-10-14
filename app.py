import hmac
import json
import logging
import os
import time
from typing import Any, Dict, List, Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from tarot_engine import draw_three_card_spread, get_tarot_meaning, tarot_tools

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
    "draw_three_card_spread": draw_three_card_spread,
    "get_tarot_meaning": get_tarot_meaning,
}

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

MODEL = "gpt-4o"
MAX_COMPLETION_TOKENS = 700

SYSTEM_PROMPT = (
    "You are an intuitive, grounded Tarot AI reader. "
    "When answering a query or drawing cards:\n"
    "1. Detail individual cards and interactions.\n"
    "2. ALWAYS conclude your reading by providing a unified takeaway in 2-3 sentences. "
    "Wrap ONLY this summary inside <tldr>...</tldr> tags.\n"
    "3. End with an open-ended reflective question."
)

EMPTY_REPLY_FALLBACK = "The cards are quiet right now. Please ask your question again."


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_HISTORY_CONTENT_CHARS)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: List[ChatMessage] = Field(default=[], max_length=MAX_HISTORY_MESSAGES)


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


def pin_matches(candidate: Optional[str]) -> bool:
    return hmac.compare_digest((candidate or "").encode(), APP_ACCESS_PIN.encode())


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
        messages: List[Any] = [{"role": "system", "content": SYSTEM_PROMPT}]

        for h in payload.history[-HISTORY_MESSAGES_SENT_TO_MODEL:]:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": payload.message})

        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=tarot_tools,
            tool_choice="auto",
            max_tokens=MAX_COMPLETION_TOKENS,
        )

        resp_msg = response.choices[0].message
        drawn_cards_data = []

        if resp_msg.tool_calls:
            messages.append(resp_msg)
            for tool_call in resp_msg.tool_calls:
                fn_name = tool_call.function.name
                tool_res = run_tool(fn_name, tool_call.function.arguments)
                if fn_name == "draw_three_card_spread" and "cards" in tool_res:
                    drawn_cards_data = tool_res["cards"]

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(tool_res),
                    }
                )

            final_resp = await client.chat.completions.create(
                model=MODEL, messages=messages, max_tokens=MAX_COMPLETION_TOKENS
            )
            raw_reply = final_resp.choices[0].message.content
        else:
            raw_reply = resp_msg.content

        assistant_reply, tldr_summary = split_tldr(raw_reply)

        return {
            "reply": assistant_reply,
            "cards": drawn_cards_data,
            "tldr": tldr_summary,
        }

    except Exception:
        # Full details go to the server log only; the client gets a generic message
        logger.exception("Error during /api/chat execution")
        raise HTTPException(
            status_code=500,
            detail="The oracle could not complete your reading. Please try again.",
        )
