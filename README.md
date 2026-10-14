# 🔮 Celestial Tarot AI

An interactive, AI-powered tarot web app. Ask a question and the oracle decides how many cards it deserves, draws them from a full 78-card Rider-Waite-Smith deck using OpenAI function calling, and turns them over one by one before giving its reading, with a TL;DR takeaway at the end. A pre-reading ritual, an ambient soundscape, a living night sky that follows the real moon, and a witching-hour mode after midnight set the mood.

Deployed live on **Render**.

---

## ✨ Features

### The reading

- **Spread sized to the question:** The model picks the spread that fits each new question:
  - **One card:** simple or yes/no questions and daily guidance.
  - **Past · Present · Future:** how a situation is unfolding over time.
  - **Situation · Obstacle · Advice:** a problem, dilemma or decision.
  - **Celtic Cross (10 cards):** only extremely deep or complex questions with many intertwined factors.
- **Follow-up questions:** Once cards are on the table, further questions are answered from those cards without drawing again. **✦ New reading** clears the table for a fresh question.
- **Full 78-card deck:** All 22 Major Arcana and 56 Minor Arcana, each with its own upright and reversed meaning, and the original Rider-Waite-Smith artwork.
- **OpenAI tool calling:** The model calls `draw_spread` and `get_tarot_meaning`, which run in Python, so the cards are genuinely random rather than invented by the model.
- **TL;DR takeaway:** A 2–3 sentence summary in a gilded box above the full reading.

### Atmosphere

- **3D card reveal:** Cards are dealt face-down and flip over one at a time. Reversed cards appear upside down, as a reader would see them. Tap any card to see it enlarged with its meaning.
- **Pre-reading ritual:** Hold your question in mind, breathe in and out with a glowing orb, cut the deck, and choose a pile. It plays while the reading is being fetched, so it fills the wait instead of adding to it. It can be skipped, or turned off with the ✦ toggle.
- **Ambient sound:** A low drone plus shuffle, cut, flip and chime effects, all synthesised with the Web Audio API (no audio files). Sound is **off by default**, and the 🔊 toggle is remembered between visits.
- **Living sky:** Twinkling stars, drifting dust, the occasional shooting star, slow mist, and candlelight flickering behind the cards.
- **Real moon phase:** The current moon is drawn in the sky and named in the top bar, and the reader weaves its symbolism into the reading.
- **Witching hour:** Between midnight and 4am in the user's local time, the palette turns blood-red and the reader's tone grows darker and more uncanny.
- **Haptics:** A short vibration on each card flip, on Android browsers that support it.
- **Reduced motion:** With the system's reduce-motion setting on, the sky stands still, cards fade in instead of flipping, and the ritual drops its animations.

### Protection

- **PIN gatekeeper:** When `APP_ACCESS_PIN` is set, the app is locked behind a PIN screen and the API rejects requests without it. PIN attempts are limited to 5 per minute per IP.
- **IP rate limiting:** 5 readings per minute per IP, using the proxy-added `X-Forwarded-For` entry so clients can't spoof their way around it.
- **Input and token caps:** Questions are capped at 1,000 characters and only the last 6 history messages reach the model. Each completion is capped at 700 tokens, or 1,200 for a Celtic Cross.
- **Safe rendering:** Model output is always rendered as plain text, never as HTML.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.14+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/)
- **AI / LLM:** [OpenAI Python SDK](https://github.com/openai/openai-python) (GPT-4o with function calling)
- **Package management:** [uv](https://github.com/astral-sh/uv)
- **Frontend:** Vanilla HTML, CSS (3D transforms, keyframe animations, Grid) and JavaScript ES modules, with Canvas for the sky and the Web Audio API for sound. No build step.
- **Hosting:** [Render](https://render.com) (Web Service)

---

## 📁 Project Structure

```text
tarot-space/
├── static/
│   ├── index.html          # Page markup: gatekeeper, table, ritual, card lightbox
│   ├── css/style.css       # Theme, card flip, layouts, witching hour, reduced motion
│   ├── js/
│   │   ├── main.js         # App flow: PIN, readings vs follow-ups, toggles
│   │   ├── cards.js        # Dealing, flipping and enlarging cards
│   │   ├── ritual.js       # Breathe / cut / choose-a-pile ritual
│   │   ├── sky.js          # Canvas stars, dust, shooting stars and moon
│   │   ├── sound.js        # Web Audio drone and sound effects
│   │   └── util.js         # Shared helpers
│   └── cards/              # 78 Rider-Waite-Smith card images (WebP)
├── app.py                  # FastAPI server, guardrails, and the agent loop
├── tarot_engine.py         # Deck, meanings, spreads, and OpenAI tool schemas
├── celestial.py            # Moon phase and witching-hour helpers
├── tests/                  # pytest suite (OpenAI mocked)
├── requirements.txt        # Production dependencies for Render
├── pyproject.toml          # Project configuration (uv, pytest)
├── uv.lock                 # Pinned lockfile
├── .env.example            # Template for environment variables
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

### `GET /api/sky`

The current moon phase, shown in the UI and drawn in the sky. No PIN required.

```json
{"moon": {"name": "Waxing Crescent", "emoji": "🌒", "fraction": 0.1052}}
```

`fraction` is the position in the lunar cycle: `0` is a new moon and `0.5` is a full moon.

### `POST /api/chat`

Main conversational endpoint. Runs the GPT-4o function-calling loop and returns the reading.

- **Headers:** `Content-Type: application/json`, `x-app-pin: <PIN>`
- **Body:**
  - `message`: 1–1,000 characters.
  - `history`: up to 20 messages with role `user` or `assistant`, each up to 8,000 characters. Only the last 6 are sent to the model.
  - `new_reading`: `true` for a fresh question, which must draw cards in a spread the model sizes to the question. `false` (the default) for a follow-up, which is answered from the cards already drawn.
  - `local_hour`: optional, `0`–`23`. The user's local hour, used for the witching-hour tone.
  ```json
  {
    "message": "Should I take the new job offer?",
    "history": [],
    "new_reading": true,
    "local_hour": 21
  }
  ```
- **Response:** `spread` is the spread that was drawn, or `null` if none was. `cards` is empty when nothing was drawn, and `tldr` is `null` if the model didn't include one.
  ```json
  {
    "reply": "Narrative interpretation...",
    "spread": "situation_obstacle_advice",
    "cards": [
      {
        "position": "Core Situation",
        "card": "The Magician",
        "orientation": "upright",
        "meaning": "Manifestation, resourcefulness, power, inspired action.",
        "image": "/static/cards/the-magician.webp"
      }
    ],
    "tldr": "Core takeaway summary..."
  }
  ```
- **Errors:** `401` invalid PIN, `422` invalid body (empty or too-long message, unknown role, invalid `local_hour`), `429` rate limit exceeded (5 requests/minute per IP), `500` missing API key or a failed reading (details are logged on the server, not returned).

---

## 🎨 Credits

Card artwork is the original 1909 Rider-Waite-Smith deck illustrated by **Pamela Colman Smith**, which is in the public domain. The scans come from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)) and were resized and converted to WebP for this app.

Readings are generated by AI and are for entertainment and reflection only.
