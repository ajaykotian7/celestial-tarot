# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uv sync                                         # install deps (Python 3.14, fetched by uv)
uv run uvicorn app:app --reload --port 8000     # run locally at http://localhost:8000
uv run pytest                                   # full suite (OpenAI is mocked; no key needed)
uv run pytest tests/test_app.py::test_chat_draws_cards_via_tool_call   # single test
uv run pytest -k witching                       # tests matching a name
uv run python scripts/build_audio.py            # rebuild static/audio/ from its CC0 Freesound sources (needs ffmpeg)
```

There is no linter, formatter or JS build step configured. The frontend is plain ES modules served from `static/`; a quick JS syntax check is `node --input-type=module --check < static/js/<file>.js` (plain `node --check` fails on the `import` statements).

After changing dependencies, regenerate the Render requirements file (Render installs from `requirements.txt`, not the lockfile):

```bash
uv export --no-emit-project --no-hashes --no-dev --format requirements-txt > requirements.txt
```

Env vars (`.env`, see `.env.example`): `OPENAI_API_KEY` (or fallback `MY_OPEN_AI_KEY`), `APP_ACCESS_PIN` (empty disables the gate), `TRUSTED_PROXY_HOPS` (default 1, for Render's proxy).

## Architecture

FastAPI backend (flat modules at the repo root) + a vanilla-JS single page in `static/`. **The server is stateless**: profile, journal, PIN and preferences live only in the browser's `localStorage` and are sent with each request. Rate-limit dicts in `app.py` are the only in-memory state.

### Backend modules

- `app.py`: endpoints, Pydantic request models (which carry all the input caps), guardrails (PIN via `hmac.compare_digest`, sliding-window per-IP rate limits), prompt assembly and the OpenAI agent loop.
- `tarot_engine.py`: the deck (`TAROT_DECK`, keyed by lowercase name such as `"the tower"` or `"five of cups"`), `SPREADS` (spread id → ordered position names), the tool functions and the `tarot_tools` OpenAI schemas. The `draw_spread` enum is generated from `SPREADS`, so adding a spread means adding it there and describing it in the tool description and `NEW_READING_PROMPT` in `app.py`. Image paths are derived from the key (`static/cards/<key-with-dashes>.webp`).
- `astrology.py`: Skyfield + the bundled `data/de440s-excerpt.bsp` ephemeris (valid 1900–2099). Birth chart (sun, moon, rising) and `current_sky()` (season, Mercury retrograde). Without a birth time, a sign that changed during the birthday returns `alternatives` (a cusp) instead of a guess.
- `celestial.py`: arithmetic moon phase and witching-hour check (local hours 0–3).
- `jyotish.py`: Vedic layer on the same ephemeris: sidereal longitude = tropical − Lahiri ayanamsa (linear from J2000). `vedic_chart()` (moon rashi, janma nakshatra + pada, sidereal sun, lagna; `lru_cache`d, so callers copy before mutating) and `panchang()` (tithi, vara, nakshatra, yoga, karana for *this instant*, plus end times found by secant iteration). Without a birth time it samples the birth window hourly and returns `{"alternatives": [...]}`, as `astrology.py` does for cusps; `astrology.birth_moment()` is the shared window helper. Name tables carry Devanagari; tests pin real dates (Sankrantis, Paush Purnima, Diwali 2024).
- `kaudi.py`: `cast_kaudi` tool (random handful of 108 cowries → three heaps → remainder mod 8 → one of the eight ayas; odd = favourable) and its `kaudi_tool` schema.
- `personal.py`: numerology (life path, personal year), birth cards, `SIGN_CARDS` mapping, deterministic card of the day, and `derive_insights()`, which returns `personal_cards` as `{deck_key: reason}`.

### `/api/chat` flow

1. `insights_for()` derives traits from the profile. Failures are logged and return `None`, so a bad profile never breaks a reading.
2. `build_system_prompt()` stacks: base `SYSTEM_PROMPT` + moon/season/Mercury + `panchang_prompt()` + new-reading or follow-up instructions + witching-hour tone + `profile_prompt()` + `journal_prompt()` (recent readings, with recurring cards counted).
3. First completion: `tool_settings()` picks the tools. A new reading must consult one oracle: `oracle="tarot"`/`"kaudi"` forces `draw_spread`/`cast_kaudi`; `"auto"` offers both with `tool_choice="required"` and `parallel_tool_calls=False`. Follow-ups get all tools with `auto`.
4. Every tool call gets a tool response via `run_tool()`, even on bad args or an unknown tool (OpenAI rejects the follow-up otherwise). Drawn cards are tagged with `personal` by `mark_personal_cards()` **before** the model sees them, so it can call them out.
5. Second completion writes the reading (higher token cap for `celtic_cross`). `split_tldr()` pulls the `<tldr>...</tldr>` block out into the `tldr` response field.
6. Any exception becomes a generic 500; details go only to the server log.

Privacy invariant: raw birth date/time/place are used only to derive traits and must never be logged or placed in a prompt. Only the name and derived traits reach OpenAI.

### Frontend (`static/js/`)

`main.js` owns app flow (including the oracle picker, heartbeat during readings, and the "while you were away" visibility handler) and imports the other modules: `kaudi.js` (cowrie heaps on the table), `profile.js` and `journal.js` (localStorage-backed panels; `journal.recentForOracle()` builds `recent_readings`), `panchang.js` (header button + panel from `/api/sky`), `cards.js` (deal/flip/lightbox), `ritual.js`, `sigil.js` (deterministic sigil SVG from a question, used by the ritual and journal), `sky.js` and `sanctum.js` (canvases), `sound.js` (Web Audio; CC0 recordings in `static/audio/` load on first sound and replace synthesised stand-ins: `tanpura-loop.mp3` must loop over `TANPURA_LOOP` (one cycle padded with its own continuation, so it's seamless despite MP3 encoder delay), `breaths.mp3` and `ghungroo-steps.mp3` are slot sprites whose offsets live in `BREATHS` / one-second ghungroo slots, `temple-bell.mp3` is the takeaway chime; all four are built by `scripts/build_audio.py`, which holds the sources and cut points), `tour.js` (coachmarks; steps are defined in `main.js` `tourSteps()`), `util.js`.

- Layering: `#sky-canvas`, the mist and `#sanctum-canvas` (darkness, carvings, eyes) sit at z-index 0 under the page (z 1). `.lantern-veil` (z 900) dims the page away from the lamp; `#watchers-canvas` (z 950) holds the eyes (kinds in `WATCHERS`; `harmless` ones don't count for `isWatched()`) and bats, which `sanctum.js` keeps asleep until `wake()` (on unlock); `omens.js` schedules bats/drafts only while `isQuiet()`; panels and the ritual (1000), lightbox (1001), tour (2000) and gate (99999) sit above it. `sanctum.js` publishes the lamp as `--lamp-x/-y/-r` on `:root`, which the veil and the gate background use.
- Theme is a dark temple (basalt, bronze, lamplight); body classes `witching` (local 0–3h) and `amavasya` (tithi 30) change mood, and `sky`/`sanctum` each have a matching `setMood`/`setDepth`.
- The tour re-runs for everyone when `TOUR_VERSION` in `main.js` changes; bump it for releases worth a fresh look.
- SVG elements have no `.hidden` property: use `toggleAttribute("hidden", …)`.

- The new-reading vs follow-up switch is client-side state (`cardsOnTable` in `main.js`). Follow-ups only see earlier cards through the assistant's reply text in `history`; the card data itself isn't resent.
- The ritual runs **while** the `/api/chat` request is in flight, filling the wait rather than adding to it.
- Some limits are duplicated client and server side and must stay in sync: history length (6 in `main.js` vs `HISTORY_MESSAGES_SENT_TO_MODEL`), witching hours (`main.js` vs `celestial.py`), and the journal/profile field caps vs the Pydantic models in `app.py`.
- Model output and user text are always rendered as text (`util.el()` / `textContent`), never `innerHTML`.
- Wrap all `localStorage` access with `util.storage`, since it can throw. Keys are prefixed `tarot_`.
- Respect `prefersReducedMotion()` for new animations (the sky freezes, cards fade instead of flipping, and the ritual drops its animations).

### Tests

`tests/test_app.py` swaps `app_module.client` for a `FakeCompletions` that returns queued responses in order and records the messages sent to it. Use `fake_openai(monkeypatch, completion(...), ...)` with `tool_call(...)` / `draw_call(...)` helpers. An autouse fixture fixes the PIN (`"2468"`), sets `client=None` and clears the rate-limit stores for each test.

## Working conventions

- The user checks UI changes in the browser themselves. Don't drive the app with a headless browser. After frontend changes, run static checks, say plainly what wasn't browser-tested, and list what to try.
- Keep `README.md` (features list and API reference) in step with user-visible or API changes; previous commits update it alongside features.
