# 🔮 Celestial Tarot AI

An interactive, AI-powered Tarot divination web application. The agent uses OpenAI function calling to shuffle and draw from a full 78-card deck, synthesizes multi-card spreads into empathetic interpretations with a dedicated TL;DR takeaway, and serves a mobile-responsive UI complete with deck-shuffling animations and a security gatekeeper screen.

Deployed live on **Render**.

---

## ✨ Features

- **Full 78-Card Divination Engine:** All 22 Major Arcana and 56 Minor Arcana across every suit (Wands, Cups, Swords, Pentacles), each with its own upright and reversed meaning.
- **OpenAI Tool / Function Calling:** The AI autonomously triggers structured tool calls (`draw_three_card_spread` and `get_tarot_meaning`) to resolve card draws dynamically.
- **Two 3-Card Spreads:** Past / Present / Future, or Situation / Obstacle / Advice.
- **Dedicated TL;DR Synthesis:** Extracts a concise 2–3 sentence takeaway highlighted in a prominent gilded card above the in-depth reading.
- **Interactive UI & Shuffling Animation:** Pure CSS card-shuffling animation displayed during API processing, followed by an animated card reveal.
- **Mobile-Adaptive Design:** Responsive layout designed for phones and desktops, complete with iOS zoom prevention and safe-area insets.
- **Cost & Spend Protection:**
  - **Full-Screen Gatekeeper:** When `APP_ACCESS_PIN` is set, the app is locked behind a PIN prompt and the API rejects requests without it. PIN attempts are limited to 5 per minute per IP.
  - **IP Rate Limiting:** Sliding-window limit of 5 readings per minute per IP, using the proxy-added `X-Forwarded-For` entry so clients can't spoof their way around it.
  - **Input & Token Capping:** Questions are capped at 1,000 characters, only the last 6 history messages reach the model, and each completion is capped at 700 tokens.
- **Safe Rendering:** Model output is rendered as plain text, never as HTML.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.14+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/)
- **AI / LLM:** [OpenAI Python SDK](https://github.com/openai/openai-python) (GPT-4o with Function Calling)
- **Package Management:** [uv](https://github.com/astral-sh/uv)
- **Frontend:** Vanilla HTML5, CSS3 (Flexbox/Grid, keyframe animations), JavaScript (Fetch API, LocalStorage)
- **Hosting:** [Render](https://render.com) (Web Service)

---

## 📁 Project Structure

```text
tarot-space/
├── static/
│   └── index.html          # Mobile-first frontend, gatekeeper modal, and animations
├── app.py                  # FastAPI server, security guardrails, and chat endpoints
├── tarot_engine.py         # 78-card deck database, spread logic, and OpenAI tool schemas
├── tests/                  # pytest suite (engine + API with OpenAI mocked)
├── requirements.txt        # Production dependencies for Render
├── pyproject.toml          # Project configuration (uv, pytest)
├── uv.lock                 # Pinned lockfile
├── .env.example            # Template for required environment variables
└── .gitignore              # Ignores .env, .venv, and caches
```

---

## 🚀 Getting Started

### 1. Prerequisites

Install [uv](https://github.com/astral-sh/uv) (it will fetch Python 3.14 automatically), or have Python 3.14+ installed if you prefer pip:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Clone the repository

```bash
git clone https://github.com/ajaykotian7/celestial-tarot.git
cd celestial-tarot
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key (`MY_OPEN_AI_KEY` is accepted as a fallback). |
| `APP_ACCESS_PIN` | No | PIN required to unlock the app. Leave empty to disable the gatekeeper. |

### 4. Install dependencies

Using **uv** (recommended):

```bash
uv sync
```

Or using **pip**:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Run the app

Using **uv**:

```bash
uv run uvicorn app:app --reload --port 8000
```

Or, with the pip virtual environment activated:

```bash
uvicorn app:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser. If you set `APP_ACCESS_PIN`, enter it to unlock the sanctuary.

### 6. Run the tests

```bash
uv run pytest
```

The tests mock OpenAI, so they need no API key and make no paid calls.

---

## 🌐 Deployment on Render

The app runs on Render as a Python Web Service. Render picks up the Python version from `.python-version`.

### Service settings

- **Runtime:** Python 3
- **Build Command:**
  ```bash
  pip install -r requirements.txt
  ```
- **Start Command:**
  ```bash
  uvicorn app:app --host 0.0.0.0 --port $PORT
  ```

### Environment variables

Set these in the Render Dashboard under **Environment**:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key. |
| `APP_ACCESS_PIN` | Recommended | PIN required by the gatekeeper screen. Without it, the deployed app is open to anyone. Use 6+ digits. |
| `TRUSTED_PROXY_HOPS` | No | How many proxies append to `X-Forwarded-For` (default `1`). The client IP for rate limiting is read this many entries from the right. Set `0` to ignore the header. |

> If you change dependencies, regenerate `requirements.txt` from the lockfile (`--no-dev` keeps pytest out of production):
> `uv export --no-emit-project --no-hashes --no-dev --format requirements-txt > requirements.txt`

---

## 📡 API Reference

### `POST /api/verify-pin`

Checks the PIN before letting the user past the gatekeeper screen.

- **Headers:** `x-app-pin: <PIN>`
- **Responses:**
  - `200` `{"status": "unlocked", "pin_required": true}` when the PIN matches.
  - `200` `{"status": "unlocked", "pin_required": false}` when no `APP_ACCESS_PIN` is configured.
  - `401` when the PIN is wrong.
  - `429` after 5 attempts in a minute from the same IP.

### `POST /api/chat`

Main conversational endpoint. Runs the GPT-4o function-calling loop and returns the reading.

- **Headers:** `Content-Type: application/json`, `x-app-pin: <PIN>`
- **Body:** `message` is 1–1,000 characters. `history` holds up to 20 messages with role `user` or `assistant`, each up to 8,000 characters; only the last 6 are sent to the model.
  ```json
  {
    "message": "What should I focus on in my career?",
    "history": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }
  ```
- **Response** (`cards` is empty when no spread was drawn; `tldr` is `null` if the model didn't include one):
  ```json
  {
    "reply": "Narrative interpretation...",
    "cards": [
      {
        "position": "Current Situation",
        "card": "The Magician",
        "orientation": "upright",
        "meaning": "Manifestation, resourcefulness, power, inspired action."
      }
    ],
    "tldr": "Core takeaway summary..."
  }
  ```
- **Errors:** `401` invalid PIN, `422` invalid body (empty or too-long message, unknown role), `429` rate limit exceeded (5 requests/minute per IP), `500` missing API key or a failed reading (details are logged on the server, not returned).