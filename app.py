import os
import json
import time
from collections import defaultdict
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openai import OpenAI
from tarot_engine import draw_three_card_spread, get_tarot_meaning, tarot_tools

load_dotenv()

app = FastAPI(title="Celestial Tarot AI")

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("MY_OPEN_AI_KEY")
client = OpenAI(api_key=api_key)

AVAILABLE_FUNCTIONS = {
    "draw_three_card_spread": draw_three_card_spread,
    "get_tarot_meaning": get_tarot_meaning,
}

# Access PIN configured in .env or Hugging Face Space secrets
APP_ACCESS_PIN = os.environ.get("APP_ACCESS_PIN", "").strip()

# Rate limiter: 5 requests per minute per IP
ip_history = defaultdict(list)
RATE_LIMIT_MAX_REQUESTS = 5
RATE_LIMIT_WINDOW_SECONDS = 60


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


@app.get("/")
def serve_index():
    return FileResponse("static/index.html")


@app.post("/api/verify-pin")
async def verify_pin(x_app_pin: Optional[str] = Header(None)):
    """Validates whether the provided PIN matches APP_ACCESS_PIN."""
    if not APP_ACCESS_PIN:
        # If no PIN is configured on the server, allow entry
        return {"status": "unlocked", "pin_required": False}

    if x_app_pin == APP_ACCESS_PIN:
        return {"status": "unlocked", "pin_required": True}

    raise HTTPException(status_code=401, detail="Invalid sanctuary PIN.")


@app.post("/api/chat")
async def chat_endpoint(
    payload: ChatRequest, request: Request, x_app_pin: Optional[str] = Header(None)
):
    current_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("MY_OPEN_AI_KEY")
    if not current_key:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key missing. Set OPENAI_API_KEY in .env.",
        )

    # 1. Enforce PIN check
    if APP_ACCESS_PIN and x_app_pin != APP_ACCESS_PIN:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid access PIN.")

    # 2. Rate limiting check
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "127.0.0.1")
    )
    now = time.time()
    recent = [t for t in ip_history[client_ip] if now - t < RATE_LIMIT_WINDOW_SECONDS]

    if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {RATE_LIMIT_MAX_REQUESTS} readings per minute.",
        )

    recent.append(now)
    ip_history[client_ip] = recent

    # 3. Agent Execution
    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an intuitive, grounded Tarot AI reader. "
                    "When answering a query or drawing cards:\n"
                    "1. Detail individual cards and interactions.\n"
                    "2. ALWAYS conclude your reading by providing a unified takeaway in 2-3 sentences. "
                    "Wrap ONLY this summary inside <tldr>...</tldr> tags.\n"
                    "3. End with an open-ended reflective question."
                ),
            }
        ]

        for h in payload.history[-6:]:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": payload.message})

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tarot_tools,
            tool_choice="auto",
            max_tokens=700,
        )

        resp_msg = response.choices[0].message
        drawn_cards_data = []

        if resp_msg.tool_calls:
            messages.append(resp_msg)
            for tool_call in resp_msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                if fn_name in AVAILABLE_FUNCTIONS:
                    tool_res = AVAILABLE_FUNCTIONS[fn_name](**fn_args)
                    if fn_name == "draw_three_card_spread" and "cards" in tool_res:
                        drawn_cards_data = tool_res["cards"]

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(tool_res),
                        }
                    )

            final_resp = client.chat.completions.create(
                model="gpt-4o", messages=messages, max_tokens=700
            )
            raw_reply = final_resp.choices[0].message.content
        else:
            raw_reply = resp_msg.content

        tldr_summary = None
        assistant_reply = raw_reply

        if "<tldr>" in raw_reply and "</tldr>" in raw_reply:
            parts = raw_reply.split("<tldr>")
            assistant_reply = parts[0].strip()
            tldr_and_after = parts[1].split("</tldr>")
            tldr_summary = tldr_and_after[0].strip()
            if len(tldr_and_after) > 1 and tldr_and_after[1].strip():
                assistant_reply += "\n\n" + tldr_and_after[1].strip()

        return {
            "reply": assistant_reply,
            "cards": drawn_cards_data,
            "tldr": tldr_summary,
        }

    except Exception as e:
        print(f"\n❌ Error during /api/chat execution: {e}\n")
        raise HTTPException(status_code=500, detail=str(e))
