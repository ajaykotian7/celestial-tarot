# 🔮 Celestial Tarot AI

An interactive, AI-powered tarot web app. Ask a question and the oracle decides how many cards it deserves, draws them from a full 78-card Rider-Waite-Smith deck using OpenAI function calling, and turns them over one by one before giving its reading, with a TL;DR takeaway at the end. Share your birth date and the reading becomes yours: your rashi and nakshatra, your Western signs, birth card and numbers shape the interpretation, and the oracle remembers the cards that keep finding you. Every reading also knows today's panchang. The whole thing takes place in the dark inner sanctum of an old temple, lit only by the lamp you carry, where your question is carved into a sigil before the cards are cut.

Deployed live on **Render**.

---

## ✨ Features

### The reading

- **Spread sized to the question:** The model picks the spread that fits each new question:
  - **One card:** simple or yes/no questions and daily guidance.
  - **Past · Present · Future:** how a situation is unfolding over time.
  - **Situation · Obstacle · Advice:** a problem, dilemma or decision.
  - **Celtic Cross (10 cards):** only extremely deep or complex questions with many intertwined factors.
- **Choose your oracle:** Above the question box, pick **🃏 Cards**, **🐚 Kaudi**, or **✦ Let the oracle choose**, in which case the model decides which oracle the question needs (cowries for "will it happen?", the tarot for feelings, choices and understanding).
- **Kaudi prashna:** A cowrie-shell reading inspired by the cowrie counting of Kerala's Ashtamangala prashna. A handful of the 108 shells falls onto a red cloth in three heaps (what has been, what is, what is coming). Each heap is counted away in eights, and the shells that remain (1 to 8) name one of the eight ayas: Dhwaja the flag, Dhooma smoke, Simha the lion, Shwana the dog, Vrishabha the bull, Khara the donkey, Gaja the elephant, Kaka the crow. Odd ayas are favourable and even ones ask for patience, as in Vastu. The server casts the shells, so they are as random as the cards. Mapping remainders to the ayas is this app's own reading, not a fixed tradition.
- **Follow-up questions:** Once cards are on the table, further questions are answered from those cards without drawing again. **✦ New reading** clears the table for a fresh question.
- **Full 78-card deck:** All 22 Major Arcana and 56 Minor Arcana, each with its own upright and reversed meaning, and the original Rider-Waite-Smith artwork.
- **OpenAI tool calling:** The model calls `draw_spread` and `get_tarot_meaning`, which run in Python, so the cards are genuinely random rather than invented by the model.
- **TL;DR takeaway:** A 2–3 sentence summary in a gilded box above the full reading.

### Personal readings

- **"Let the cards know you":** An optional profile, offered after the first unlock and editable from **☉ You** in the top bar:
  - **Name:** the reader addresses you by it.
  - **Date of birth:** your **sun sign** and element, your **birth card** (Mary K. Greer's method), **life path number**, and **personal year**.
  - **Birth time and place** (optional): your exact **moon sign** and your **rising sign**. Without a birth time, a sign that changed on your birthday is shown as a cusp rather than guessed.
- **Your celestial portrait:** After saving, "What the cards know" is revealed piece by piece: Sun, Moon and Rising tiles with their zodiac glyphs and elements, the artwork of the cards that are yours, and your life path and personal year. **✎ Edit details** reopens the form with what you entered.
- **Personal cards glow:** If your birth card, or the card of your sun, moon or rising sign (e.g. Scorpio ↔ Death), appears in a spread, it glows with a ★ note and its own chime, and the reader calls it out.
- **Reading journal:** Every reading is saved to **📖 Journal** with its question, cards and takeaway. The reader sees your last 5 readings, so it can notice cards that keep returning and themes that continue.
- **Your numbers:** Indian numerology alongside the life path: your **Moolank** (root number, from the day) and **Bhagyank** (destiny number, from the whole date), each with its ruling graha, a Chaldean **name number** from the name you give, and your **Lo Shu grid**, showing which numbers repeat, which are missing (with the area of life each stands for) and any complete planes such as the Will plane or Golden Raj Yoga. The reader is told the numbers, the missing ones and the planes, never the date.
- **Card of the day:** **✦ Your card for today** is drawn from your birth date and today's date, so it stays the same all day.
- **A gentle reader:** The reader always speaks gently, softening difficult cards without hiding what they say, and sizes each answer to the question: brief for simple questions, thorough for deep ones.
- **Your Vedic chart:** The portrait also shows "In the Vedic sky": your **rashi** (the Moon's sidereal sign), your **janma nakshatra** with its deity, symbol, ruling graha and (with a birth time) pada, and your **lagna**, each with its Devanagari name. If your Vedic Sun sits in a different sign from your Western one, it says so. Without a birth time, a nakshatra or rashi that changed on your birthday is shown as alternatives rather than guessed.
- **Today's panchang:** 🪔 under the title shows the current tithi and nakshatra; tap it for all five limbs (tithi, vara, nakshatra, yoga and karana), with when the tithi and nakshatra end and any observance such as Ekadashi, Pradosh or Amavasya. It's worked out for the moment you look, with the Lahiri ayanamsa, and the reader weaves it into every reading.
- **Live astrology:** The current astrological season, and Mercury retrograde (shown as ☿ ℞), are woven into every reading.

### Privacy

- The profile and journal are stored **only in your browser**. The server stores nothing.
- Your birth date, time and place are sent to the server only to work out your signs and numbers. **Only those derived traits (and your name) are sent to OpenAI**, never the birth details themselves.
- Your last few readings (questions, cards and takeaways) are included in the prompt so the reader can spot patterns.
- City search for the birth place goes straight from your browser to [Open-Meteo](https://open-meteo.com/).
- **Forget me** in the profile panel erases the profile and journal from the device.

### Getting around

- **Guided tour:** After unlocking for the first time, a short tour spotlights each control (the question box, tonight's sky, the ritual, sound, the card of the day, the journal and your profile), with a one-tap "Turn sound on" along the way. It ends by inviting you to share your birth date. It includes the watchers in the dark and choosing your oracle. **✦ How this works** at the bottom of the page replays it, and after a major release everyone sees it once more.

### Atmosphere

- **3D card reveal:** Cards are dealt face-down and flip over one at a time. Reversed cards appear upside down, as a reader would see them. Tap any card to see it enlarged with its meaning.
- **The sanctum:** The page sits in near-darkness. A lamp follows your cursor, your finger or keyboard focus, flickering and swaying as if carried, and its light reveals pillars, an arch and a yantra carved into the walls. Watchers gather in the dark: eyes that creep toward your reading (the cards, or the question you're typing) and wait at the edge of your light, staring at it. Carry your lamp to them (move the cursor, or tap near them) and they flee. Typing a question draws them sooner. Leave one watching when you press Consult and the reading is marked "Something watched this reading", and the reader adds one gentle line inviting you to trust what rings true. The cards themselves are never affected. The eyes are drawn above the page, so they can't hide behind it, and none appear until you've unlocked. Each watcher is one of four kinds:
  - **Amber eyes** arrive with ghungroo (anklet bells) stepping closer from the side they appear on, and run off jingling when caught.
  - **A serpent's eyes**, yellow-green with thin slits, never blink and arrive with a hiss.
  - **Pale eyes** have no pupils and arrive with a breath.
  - **The temple cat** means no harm: it doesn't creep, doesn't cloud readings, and wanders off slowly when the light finds it.
- **Omens:** At most once every 40–90 seconds, and never during a reading or the ritual, a few bats cross the lamplight with wings beating across the speakers, or a draft gusts through and bows the lamp to an ember before it slowly catches again. The light flares as the cards turn. On Amavasya the sanctum grows darker and more things watch.
- **Heartbeat and breath:** With sound on, a low heartbeat starts while the oracle prepares the reading and quickens as each card turns or each heap of shells falls. Breathing follows the ritual's breaths, a breath sounds close by when something watches from the dark, and a sharp in-breath when your lamp catches it.
- **While you were away:** Leave the tab for a while and come back to find the lamp guttered and slowly catching again, a new line under the title ("You left. The cards didn't."), and one card or heap on the table turned slightly from where it lay.
- **Pre-reading ritual:** Your question is carved into a sigil by the old method (vowels and repeated letters dropped, the rest traced across the Lo Shu square), then you breathe in and out as it glows, it sinks into the deck, and you cut the deck and choose a pile (for kaudi, you let the shells fall). The same question always makes the same sigil, and each journal entry shows its own. It plays while the reading is being fetched, so it fills the wait instead of adding to it. It can be skipped, or turned off with the ✦ toggle.
- **Ambient sound:** A real **tanpura** drone, looped seamlessly, beneath everything. The core takeaway rings a brass **temple bell** (ghanta). Breathing is a real, close breath, and the watchers' footsteps are real **ghungroo**, played at a distance through a stone-room echo. Shuffle, cut, flip, heartbeat, wings, wind and the other effects are synthesised with the Web Audio API. The recordings (about 0.5 MB) load only once sound is turned on, and synthesised stand-ins play until they arrive. Sound is **off by default**, and the 🔊 toggle is remembered between visits.
- **Living sky:** Twinkling stars, drifting dust, the occasional shooting star, slow mist, and candlelight flickering behind the cards.
- **Real moon phase:** The current moon is drawn in the sky and named in the top bar, and the reader weaves its symbolism into the reading.
- **Witching hour:** Between midnight and 4am in the user's local time, the palette turns blood-red and the reader's tone grows darker and more uncanny.
- **Haptics:** A short vibration on each card flip, on Android browsers that support it.
- **Reduced motion:** With the system's reduce-motion setting on, the sky stands still, cards fade in instead of flipping, and the ritual drops its animations.

### Protection

- **Passphrase gatekeeper:** When `APP_ACCESS_PIN` is set, the app is locked behind a passphrase screen and the API rejects requests without it. Case and extra spaces are ignored, and attempts are limited to 5 per minute per IP.
- **IP rate limiting:** 5 readings per minute per IP, using the proxy-added `X-Forwarded-For` entry so clients can't spoof their way around it.
- **Input and token caps:** Questions are capped at 1,000 characters and only the last 6 history messages reach the model. Each completion is capped at 700 tokens, or 1,200 for a Celtic Cross.
- **Safe rendering:** Model output is always rendered as plain text, never as HTML.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.14+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/)
- **AI / LLM:** [OpenAI Python SDK](https://github.com/openai/openai-python) (GPT-4o with function calling)
- **Package management:** [uv](https://github.com/astral-sh/uv)
- **Frontend:** Vanilla HTML, CSS (3D transforms, keyframe animations, Grid) and JavaScript ES modules, with Canvas for the sky and the Web Audio API for sound. No build step.
- **Astronomy:** [Skyfield](https://rhodesmill.org/skyfield/) with NASA JPL's DE440s ephemeris for sun, moon and rising signs, Mercury's motion, and (with the Lahiri ayanamsa) the Vedic chart and panchang
- **Hosting:** [Render](https://render.com) (Web Service)

---

## 📁 Project Structure

```text
tarot-space/
├── static/
│   ├── index.html          # Page markup: gatekeeper, table, ritual, panels, card lightbox
│   ├── css/style.css       # Theme, card flip, layouts, witching hour, reduced motion
│   ├── js/
│   │   ├── main.js         # App flow: PIN, readings vs follow-ups, toggles
│   │   ├── profile.js      # Profile panel, place search, derived insights
│   │   ├── journal.js      # Reading journal and the summary sent to the oracle
│   │   ├── tour.js         # First-run guided tour (coachmarks)
│   │   ├── cards.js        # Dealing, flipping and enlarging cards
│   │   ├── ritual.js       # Sigil / breathe / cut / choose-a-pile ritual
│   │   ├── sigil.js        # Sigil from a question, traced on the Lo Shu square
│   │   ├── kaudi.js        # Cowrie heaps falling, counted in eights, read
│   │   ├── omens.js        # Rare bats and drafts in the sanctum
│   │   ├── sanctum.js      # The dark sanctum: the lamp, wall carvings and watching eyes
│   │   ├── panchang.js     # Today's panchang button and panel
│   │   ├── sky.js          # Canvas stars, dust, shooting stars and moon
│   │   ├── sound.js        # Web Audio drone and sound effects
│   │   └── util.js         # Shared helpers
│   ├── audio/              # Tanpura loop, temple bell, breaths, ghungroo (CC0 recordings)
│   └── cards/              # 78 Rider-Waite-Smith card images (WebP)
├── app.py                  # FastAPI server, guardrails, and the agent loop
├── tarot_engine.py         # Deck, meanings, spreads, and OpenAI tool schemas
├── celestial.py            # Moon phase and witching-hour helpers
├── astrology.py            # Sun, moon and rising signs; season; Mercury retrograde
├── personal.py             # Birth cards, numerology (incl. Moolank, Bhagyank, Lo Shu), sign cards, card of the day
├── jyotish.py              # Sidereal (Lahiri) rashi, nakshatra, lagna and panchang
├── kaudi.py                # Kaudi prashna: cast cowries into three heaps, the eight ayas
├── data/de440s-excerpt.bsp # JPL ephemeris excerpt (Sun, Moon, Earth, Mercury, 1900–2100)
├── scripts/build_audio.py  # Rebuilds static/audio/ from the CC0 recordings
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
| `APP_ACCESS_PIN` | No | Passphrase (or PIN) required to unlock the app. Leave empty to disable the gatekeeper. |

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

Open [http://localhost:8000](http://localhost:8000) in your browser. If you set `APP_ACCESS_PIN`, enter the passphrase to unlock the sanctuary.

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
| `APP_ACCESS_PIN` | Recommended | Passphrase required by the gatekeeper screen. Without it, the deployed app is open to anyone. Use four or more random words in plain ASCII, e.g. `velvet comet harbor lantern`; case and extra spaces are ignored. |
| `TRUSTED_PROXY_HOPS` | No | How many proxies append to `X-Forwarded-For` (default `1`). The client IP for rate limiting is read this many entries from the right. Set `0` to ignore the header. |

> If you change dependencies, regenerate `requirements.txt` from the lockfile (`--no-dev` keeps pytest out of production):
> `uv export --no-emit-project --no-hashes --no-dev --format requirements-txt > requirements.txt`

---

## 📡 API Reference

### `POST /api/verify-pin`

Checks the passphrase before letting the user past the gatekeeper screen. Matching ignores case and extra spaces.

- **Headers:** `x-app-pin: <PIN>`
- **Responses:**
  - `200` `{"status": "unlocked", "pin_required": true}` when the PIN matches.
  - `200` `{"status": "unlocked", "pin_required": false}` when no `APP_ACCESS_PIN` is configured.
  - `401` when the PIN is wrong.
  - `429` after 5 attempts in a minute from the same IP.

### `GET /api/sky`

The current sky and today's panchang, shown in the UI. No PIN required.

- **Query:** `local_date` (optional, `YYYY-MM-DD`), which sets the vara (weekday).

```json
{
  "moon": {"name": "Waning Gibbous", "emoji": "🌖", "fraction": 0.6512},
  "season": "Scorpio",
  "mercury_retrograde": false,
  "panchang": {
    "tithi": {"number": 20, "name": "Panchami", "devanagari": "पंचमी", "paksha": "Krishna", "paksha_devanagari": "कृष्ण", "paksha_meaning": "the dark, waning fortnight", "observance": null},
    "vara": {"name": "Shukravara", "devanagari": "शुक्रवार", "lord": "Shukra (Venus)"},
    "nakshatra": {"name": "Ardra", "devanagari": "आर्द्रा", "deity": "Rudra, the storm", "symbol": "a teardrop", "theme": "storms that clear the air", "lord": "Rahu (north lunar node)"},
    "yoga": {"name": "Shiva", "devanagari": "शिव", "meaning": "auspiciousness", "inauspicious": false},
    "karana": {"name": "Taitila", "devanagari": "तैतिल", "bhadra": false},
    "moon_rashi": "Mithuna",
    "tithi_ends": "2026-10-30T13:55+00:00",
    "nakshatra_ends": "2026-10-31T01:42+00:00"
  }
}
```

`fraction` is the position in the lunar cycle: `0` is a new moon and `0.5` is a full moon. `season` is the Sun's current (tropical) sign. The panchang is for this moment; traditional calendars fix each day's tithi at sunrise, so around a change they can differ by a day. `observance` names Ekadashi, Pradosh, Purnima, Amavasya and similar days, and `bhadra` is true during Vishti karana.

### `POST /api/insights`

Works out signs, birth card and numbers from a profile, plus the card of the day. Nothing is stored. No PIN required.

- **Body:** `profile` (optional, same shape as in `/api/chat`) and `local_date` (optional, `YYYY-MM-DD`, so the card of the day changes at the user's midnight).
- **Response:** `insights` is `null` without a birth date. Without a profile, everyone gets the same card of the day.
  ```json
  {
    "insights": {
      "sun": {"sign": "Cancer", "element": "water"},
      "moon": {"sign": "Aries", "element": "fire"},
      "rising": {"sign": "Scorpio", "element": "water"},
      "birth_cards": ["The Hierophant"],
      "life_path": 5,
      "life_path_theme": "freedom and change",
      "personal_year": 5,
      "personal_year_theme": "change, freedom and adventure",
      "personal_cards": [
        {"card": "The Hierophant", "reason": "your birth card", "image": "/static/cards/the-hierophant.webp", "meaning": "..."}
      ],
      "vedic": {
        "rashi": {"name": "Meena", "devanagari": "मीन", "western": "Pisces", "element": "water", "lord": "Guru (Jupiter)"},
        "nakshatra": {"name": "Revati", "devanagari": "रेवती", "deity": "Pushan, guardian of journeys", "symbol": "a fish", "theme": "safe passage and completion", "lord": "Budh (Mercury)", "pada": 4},
        "sun": {"name": "Mithuna", "devanagari": "मिथुन", "western": "Gemini", "element": "air", "lord": "Budh (Mercury)"},
        "lagna": {"name": "Tula", "devanagari": "तुला", "western": "Libra", "element": "air", "lord": "Shukra (Venus)"}
      }
    },
    "daily_card": {"position": "Your card for today", "card": "The Star", "orientation": "upright", "meaning": "...", "image": "/static/cards/the-star.webp"}
  }
  ```
  A sign that changed during a birthday with no birth time comes back with `"alternatives": ["Pisces", "Aries"]`. `rising` and `vedic.lagna` need both birth time and place, and `vedic.nakshatra.pada` needs a birth time. Without one, a rashi or nakshatra that changed during the birthday comes back as `{"alternatives": [...]}`.

### `POST /api/chat`

Main conversational endpoint. Runs the GPT-4o function-calling loop and returns the reading.

- **Headers:** `Content-Type: application/json`, `x-app-pin: <PIN>`
- **Body:**
  - `message`: 1–1,000 characters.
  - `history`: up to 20 messages with role `user` or `assistant`, each up to 8,000 characters. Only the last 6 are sent to the model.
  - `new_reading`: `true` for a fresh question, which must consult an oracle. `false` (the default) for a follow-up, which is answered from the cards or cowries already cast.
  - `watched`: optional, `true` if a watcher was in the dark, uncaught, when the question was asked. The reader adds one gentle line.
  - `oracle`: for a new reading, `"tarot"` (draw a spread the model sizes to the question), `"kaudi"` (cast the cowries) or `"auto"` (the default: the model picks one).
  - `local_hour`: optional, `0`–`23`. The user's local hour, used for the witching-hour tone.
  - `local_date`: optional, `YYYY-MM-DD`, for the personal year.
  - `profile`: optional. `name` (up to 40 characters), `birth_date`, `birth_time` (`HH:MM`), `timezone` (IANA, e.g. `Asia/Kolkata`), `latitude` and `longitude`. Every field is optional. Birth details are used only to derive traits and are never sent to OpenAI.
  - `recent_readings`: optional, up to 5 journal summaries, most recent first, each with `date`, `question` (up to 300 characters), `cards` (`card`, `orientation`, `position`) or `kaudi` (`position`, `aya`, `remainder`), and `tldr` (up to 400 characters).
  ```json
  {
    "message": "Should I take the new job offer?",
    "history": [],
    "new_reading": true,
    "local_hour": 21,
    "local_date": "2026-10-15",
    "profile": {"name": "Ajay", "birth_date": "1990-07-15"},
    "recent_readings": []
  }
  ```
- **Response:** `spread` is the spread that was drawn, or `null` if none was. `cards` is empty when nothing was drawn, and `tldr` is `null` if the model didn't include one. A card that is personally significant to the querent has a `personal` field, e.g. `"Your birth card"`.
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
- **Errors:** `401` invalid PIN, `422` invalid body (empty or too-long message, unknown role, invalid `local_hour`, profile or journal fields out of range), `429` rate limit exceeded (5 requests/minute per IP), `500` missing API key or a failed reading (details are logged on the server, not returned).

  For a kaudi reading, `cards` is empty, `spread` is `null`, and `kaudi` holds the casting (otherwise `kaudi` is `null`):
  ```json
  "kaudi": {
    "heaps": [
      {"position": "What has been", "count": 17, "remainder": 1, "aya": "Dhwaja", "devanagari": "ध्वज", "symbol": "the flag", "meaning": "victory, honour and a cause raised high", "favourable": true}
    ],
    "leaning": "The shells lean kindly, with one heap asking for care."
  }
  ```

---

## 🎨 Credits

Card artwork is the original 1909 Rider-Waite-Smith deck illustrated by **Pamela Colman Smith**, which is in the public domain. The scans come from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)) and were resized and converted to WebP for this app.

The sound recordings are from Freesound, all released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/), and cut and levelled for this app by `scripts/build_audio.py` (`uv run python scripts/build_audio.py`, needs ffmpeg):

- Tanpura: ["Tanpura in E"](https://freesound.org/s/148850/) by iluppai
- Temple bell: ["Ghanta-Leather-Mallet-2015-05-16"](https://freesound.org/s/274316/) by the_very_Real_Horst
- Breaths: ["breath"](https://freesound.org/s/619900/) by zagor76 and ["Spooky Breath"](https://freesound.org/s/341751/) by pqr
- Ghungroo: ["FX Indian Ghungroo Anklet"](https://freesound.org/s/700521/) by bashrambali

Planetary positions use NASA JPL's [DE440s](https://ssd.jpl.nasa.gov/planets/eph_export.html) ephemeris through [Skyfield](https://rhodesmill.org/skyfield/). Vedic positions subtract the Lahiri (Chitrapaksha) ayanamsa. Birth-place search uses the [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api).

Readings are generated by AI and are for entertainment and reflection only.
