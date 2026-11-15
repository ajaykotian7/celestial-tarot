# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uv sync                                         # install deps (Python 3.14, fetched by uv)
uv run uvicorn app:app --reload --port 8000     # run locally at http://localhost:8000
uv run pytest                                   # full suite (OpenAI is mocked; no key needed)
uv run pytest tests/test_app.py::test_chat_draws_cards_via_tool_call   # single test
uv run pytest -k festivals                      # tests matching a name
uv run python scripts/build_audio.py            # rebuild static/audio/ from its CC0 Freesound sources (needs ffmpeg)
```

There is no linter, formatter or JS build step configured. The frontend is plain ES modules served from `static/`; a quick JS syntax check is `node --input-type=module --check < static/js/<file>.js` (plain `node --check` fails on the `import` statements). Syntax checks don't catch a misnamed import, so also check that every `import { x } from "./y.js"` names a real export of `y.js`.

After changing dependencies, regenerate the Render requirements file (Render installs from `requirements.txt`, not the lockfile):

```bash
uv export --no-emit-project --no-hashes --no-dev --format requirements-txt > requirements.txt
```

Env vars (`.env`, see `.env.example`): `OPENAI_API_KEY` (or fallback `MY_OPEN_AI_KEY`), `APP_ACCESS_PIN` (empty disables the gate), `TRUSTED_PROXY_HOPS` (default 1, for Render's proxy).

## Architecture

"Celestial": a family almanac and reader. FastAPI backend (flat modules at the repo root) + a vanilla-JS installable single page in `static/` with five tabs (Today, Ask, Timeline, Family, Calendar). **The server is stateless**: people (birth details, life events), the journal, PIN and preferences live only in the browser's `localStorage` and are sent with each request. Rate-limit dicts in `app.py` and `lru_cache`s are the only in-memory state.

### Backend modules

- `app.py`: endpoints, Pydantic request models (which carry all the input caps), guardrails (PIN via `hmac.compare_digest`, `require_pin()` on every endpoint that does real work, sliding-window per-IP rate limits), prompt assembly and the OpenAI agent loop. `/sw.js` and `/manifest.webmanifest` are served from the root.
- `tarot_engine.py`: the deck (`TAROT_DECK`, keyed by lowercase name such as `"the tower"`), `SPREADS`, the tool functions and the `tarot_tools` OpenAI schemas. The `draw_spread` enum is generated from `SPREADS`. Image paths are derived from the key (`static/cards/<key-with-dashes>.webp`).
- `astrology.py`: Skyfield + the bundled `data/de440s-excerpt.bsp` ephemeris (valid 1900–2099; Sun, Moon, Earth, and Mercury to Saturn as barycenters, so no Uranus or beyond; `BODIES` maps names to targets). Western signs, `birth_moment()` (the shared birth-window helper) and `current_sky()`.
- `jyotish.py`: sidereal longitude = tropical − Lahiri ayanamsa (linear from J2000). `vedic_chart()` (moon rashi, janma nakshatra + pada, lagna; `lru_cache`d, so callers copy before mutating) and `panchang()` for an instant (end times by secant iteration). Without a birth time it returns `{"alternatives": [...]}` for anything that changed that day.
- `kundali.py`: the jataka (needs birth time **and** place, else `None`). Grahas (Rahu/Ketu are the *mean* node, matching Drik Panchang), whole-sign houses, navamsa, `house_lordships()`, Vimshottari dasha (365.25-day years) to pratyantar, `sign_ingresses()` (vectorised search via `_series()`, which batches Skyfield vectors by `SERIES_BATCH` because each instant costs ~45 KB and Render has 512 MB; dates in IST, `lru_cache`d per graha, warmed in `app.lifespan`) for Sade Sati/Dhaiya/Guru periods/gochar, `doshas()` (16, each `present`/`mild`/`cancelled`/`absent` with reasons) and `yogas()`. `doshas`/`yogas` take a plain chart dict, so tests build charts by hand. `moon_timeline()` needs only the Moon's sign. `jataka_summary()` is the only form that reaches OpenAI: signs, houses and lordships, no degrees, no date in the birth year.
- `muhurta.py`: `sun_times()` (Skyfield almanac sunrise/sunset for a place, 6 am/6 pm stand-ins near the poles), `day_periods()` (Rahu Kaal/Yamaganda/Gulika by weekday eighths, Abhijit, 16 choghadiyas), vectorised `limbs_at()`, `personal_day()` (Chandra bala, Tara bala, Chandrashtama), `muhurat()` scoring per activity (`ACTIVITIES`) with `good_windows()`.
- `festivals.py`: `calendar()` for a place: amanta lunar months (named by the Sun's sign at the new moon; no sankranti in the month = adhika, and festivals skip adhika months), `FESTIVALS` and monthly `OBSERVANCES` kept on the first day whose observance time (sunrise, forenoon, midday, afternoon, pradosh, midnight, moonrise) is in the tithi, sankrantis by civil date, and with a person: Chandrashtama and personal events from the jataka. Tests pin published 2024–25 dates (Diwali 2024-10-31, Holi 2025-03-14, Ekadashis); change a festival's observance time only against published dates.
- `matching.py`: Ashtakoota guna milan (tables as most Indian software uses them; the yoni table is symmetric with sworn enemies at 0).
- `kaudi.py`: `cast_kaudi` tool and its `kaudi_tool` schema.
- `personal.py`: numerology, birth cards, card of the day, and `derive_insights()` (also attaches `jataka` and `timeline`; a failing jataka is logged and left `None`).
- `celestial.py`: arithmetic moon phase (`is_witching_hour` is no longer used by the app).

### `/api/chat` flow

1. `insights_for()` derives traits from the profile of the person the question is about. Failures are logged and return `None`.
2. `build_system_prompt()` stacks: base `SYSTEM_PROMPT` + moon/season/Mercury + `panchang_prompt()` + new-reading or follow-up instructions + `COMBINED_READING` (auto with a jataka) + topic + `subject_prompt()` (when `asker` asks about someone else) + `profile_prompt()` (incl. life events) + `jataka_prompt()` (summary + `JATAKA_GUIDE`, when `reads_jataka()`) + `journal_prompt()` + the reading language.
3. The jataka needs no tool: it is in the prompt. `tool_settings()`: `auto` offers `draw_spread`/`cast_kaudi` with `tool_choice="required"`, `tarot`/`kaudi` force theirs, `jataka` has no tools (one completion), follow-ups get all tools with `auto`. `oracle="jataka"` without a jataka returns `NO_JATAKA_REPLY` without calling OpenAI.
4. Every tool call gets a tool response via `run_tool()`. Drawn cards are tagged `personal` **before** the model sees them.
5. Second completion writes the reading (`LONG_COMPLETION_TOKENS` for a Celtic Cross, a jataka in a new reading, or a non-English language). `split_tldr()` pulls out the `<tldr>`.
6. OpenAI auth/permission errors → 503 `KEY_PROBLEM`, quota → `OUT_OF_CREDIT`, rate limit → `TOO_BUSY`; anything else a generic 500. Details go only to the server log.

Privacy invariant: raw birth date/time/place are used only to derive traits and must never be logged or placed in a prompt. Only names, derived traits, life events the family typed, and `jataka_summary()` reach OpenAI. The full jataka goes only to the browser via `/api/insights`.

### Frontend (`static/js/`)

`main.js` is the shell: the gate, `go(tab, options)` (hash routing), the person picker, settings sheet, tour (`TOUR_VERSION`; bump for releases worth a fresh look) and service-worker registration. Each tab module exports `init(ctx)` and `render(options)`; `ctx` has `go`, `pickPerson`, `current`.

- `store.js`: people (`tarot_people`, migrated once from the old single `tarot_profile` as "Me"), the subject (who Today/Ask/Timeline are about), `here()` (where you are now, defaulting to Me's birth place, flagged `assumed`), settings, and `onChange(fn)` events (`people`, `subject`, `here`, `settings`) that main.js uses to re-render the current tab. `toProfile()` is the server's shape.
- `api.js`: `post()` adds the PIN and reloads to the gate on 401; `insightsFor(person)` caches `/api/insights` per person and day.
- Tabs: `today.js` (the SVG day wheel maps sunrise→sunset over the top half and sunset→next sunrise under it, so the eight day/night choghadiyas are equal arcs; `updateNow()` runs each minute), `ask.js` (the reading flow: ritual while the request is in flight, cards/cowries/chart reveal, journal per person, follow-ups; resets when the subject changes), `timeline.js` (absolutely positioned lanes, `PX_PER_YEAR`), `family.js` (list, person page, add/edit form `openForm()`, matching), `calendar.js` (month grid, agenda, `.ics` export, muhurat finder).
- Shared: `jataka.js` (`southChart()`, `chartSection()` with Rasi/Navamsa, `jatakaSections()`, `revealJataka()`), `journal.js` (entries carry `person`; entries without one belong to Me), `share.js` (canvas share image, text, `printNode()` via `#print-area` and `body.printing`), `sheet.js` (one bottom sheet; `confirmSheet()`), `places.js` (Open-Meteo search, "use my location"), `kolam.js`, `cards.js`, `kaudi.js`, `ritual.js`, `sigil.js`, `sound.js` (tanpura, bell, breaths; the rest synthesised), `tour.js`, `util.js`.
- `sw.js`: network-first for the app's own code (so deploys arrive at once), cache-first for cards/audio/icons/fonts, never the API. Bump `CACHE` when the shell file list changes.

- Theme: cream/kumkum/haldi tokens on `:root`, dark under `[data-theme="dark"]` and `prefers-color-scheme` with `[data-theme="auto"]`; `data-size` scales text for elders. The ritual and lightbox are always dark (they redefine `--text`/`--accent` locally). Day-wheel segments are `.chog` (not `.seg`, which is the segmented control).
- Times from the server carry the place's offset; format them with `fmtTime(iso, place.timezone)`.
- Some limits are duplicated client and server side and must stay in sync: history length (6 in `ask.js` vs `HISTORY_MESSAGES_SENT_TO_MODEL`), the journal/profile/event caps vs the Pydantic models, and `LANGUAGES`/topics/activities lists.
- Model output and user text are always rendered as text (`util.el()` / `textContent`), never `innerHTML`.
- Wrap all `localStorage` access with `util.storage`. Keys are prefixed `tarot_` (kept from the old app so data carries over).
- Respect `prefersReducedMotion()` for new animations.

### Tests

`tests/test_app.py` swaps `app_module.client` for a `FakeCompletions` that returns queued responses in order and records the messages sent to it. Use `fake_openai(monkeypatch, completion(...), ...)` with `tool_call(...)` / `draw_call(...)` helpers. An autouse fixture fixes the PIN (`"2468"`), sets `client=None` and clears the rate-limit stores. `test_kundali.py`, `test_muhurta.py`, `test_festivals.py` and `test_matching.py` pin real dates and hand-built charts.

## Working conventions

- The user checks UI changes in the browser themselves. Don't drive the app with a headless browser. After frontend changes, run static checks, say plainly what wasn't browser-tested, and list what to try.
- Keep `README.md` (features list and API reference) in step with user-visible or API changes; previous commits update it alongside features.
