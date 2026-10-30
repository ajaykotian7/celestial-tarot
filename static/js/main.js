import { el, storage, buzz, sleep } from "./util.js";
import * as sound from "./sound.js";
import { startSky } from "./sky.js";
import { revealSpread, clearSpread, openLightbox, closeLightbox } from "./cards.js";
import { runRitual } from "./ritual.js";
import * as profile from "./profile.js";
import * as journal from "./journal.js";
import { runTour } from "./tour.js";
import { startSanctum } from "./sanctum.js";
import * as panchang from "./panchang.js";
import { revealKaudi } from "./kaudi.js";
import { startOmens } from "./omens.js";
import * as infotip from "./infotip.js";

// The server only sends the last 6 messages to the model, so don't send more
const MAX_HISTORY_MESSAGES = 6;
const WITCHING_HOURS = [0, 1, 2, 3];
const PLACEHOLDERS = { auto: "Ask the oracle...", tarot: "Ask the cards...", kaudi: "Ask the shells..." };
const FOLLOW_UP_PLACEHOLDER = "Ask more about your reading...";
const WAITING = {
    auto: "The oracle listens...",
    tarot: "Shuffling the deck and channeling guidance...",
    kaudi: "Gathering the cowries...",
};
const INTRO_TEXT =
    'Ask your question, such as: "What energy surrounds my next career move?" ' +
    "The oracle will choose how many cards to draw.";

const TOUR_KEY = "tarot_tour_seen";
// Bump for a release worth a fresh look: everyone sees the tour once more
const TOUR_VERSION = "2";

const history = [];
// While cards are on the table, questions are follow-ups about them (no new draw)
let cardsOnTable = false;
let ritualEnabled = storage.get("tarot_ritual") !== "off";
// Which oracle answers a new question: let it choose, the cards, or the cowries
let oracle = ["auto", "tarot", "kaudi"].includes(storage.get("tarot_oracle")) ? storage.get("tarot_oracle") : "auto";
// Derived from the profile by the server: signs, birth card, numbers
let insights = null;
let dailyCard = null;
let insightsReady = Promise.resolve();
let skyReady = Promise.resolve();

const $ = (id) => document.getElementById(id);
const sky = startSky($("sky-canvas"));
// Where the watchers creep: toward the cards on the table, or the question being written
function readingFocus() {
    const tray = $("cards-tray");
    const r = (tray.childElementCount ? tray : $("user-input")).getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// When something watches from the dark, a breath close by; caught in the light, a gasp
const sanctum = startSanctum($("sanctum-canvas"), $("lantern-veil"), {
    watchers: $("watchers-canvas"),
    focus: readingFocus,
    // Each kind of watcher arrives with its own sound; the temple cat makes none
    onWatch: ({ kind, pan }) => {
        if (kind === "ember") sound.ghungroo({ pan, steps: 4, approaching: true });
        else if (kind === "serpent") sound.hiss({ pan });
        else if (kind === "pale") sound.breath({ watcher: true, seconds: 2.6, peak: 0.035, pan });
    },
    onFlee: ({ kind, pan }) => {
        if (kind === "ember") sound.ghungroo({ pan, steps: 5, pace: 0.18, peak: 0.35 });
        sound.gasp();
    },
});
let readingInProgress = false;

// --- GATEKEEPER VALIDATION ---

async function verifyPinWithServer(pin) {
    const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "x-app-pin": pin || "" },
    });
    return res.status;
}

async function attemptUnlock() {
    const pinInput = $("gatekeeper-pin");
    const btn = $("unlock-btn");
    const pin = pinInput.value.trim();

    // HTTP headers only carry plain ASCII; fetch would throw on anything else
    if (/[^\x20-\x7E]/.test(pin)) {
        showBlockerError("Use only plain letters, numbers and spaces.");
        return;
    }

    $("blocker-error").style.display = "none";
    btn.disabled = true;
    btn.textContent = "VERIFYING...";

    try {
        const status = await verifyPinWithServer(pin);
        if (status === 200) {
            storage.set("tarot_pin", pin);
            unlockUI();
        } else if (status === 429) {
            showBlockerError("Too many attempts. Wait a minute and try again.");
        } else {
            showBlockerError("Invalid passphrase. Access denied.");
        }
    } catch {
        showBlockerError("Could not reach oracle server.");
    } finally {
        btn.disabled = false;
        btn.textContent = "ENTER THE SANCTUM";
    }
}

function showBlockerError(msg) {
    const errEl = $("blocker-error");
    errEl.textContent = msg;
    errEl.style.display = "block";
    const pinInput = $("gatekeeper-pin");
    pinInput.value = "";
    pinInput.focus();
}

function unlockUI() {
    const blocker = $("blocker-screen");
    blocker.style.opacity = "0";
    setTimeout(() => {
        blocker.style.visibility = "hidden";
        blocker.style.display = "none";
        sanctum.wake();
        startOmens(sanctum, {
            isQuiet: () => !readingInProgress && $("ritual").hidden,
        });
        $("user-input").focus();
        welcome();
    }, 400);
}

// --- FIRST-RUN GUIDE ---

function tourSteps() {
    const hasProfile = !!profile.load();
    return [
        {
            target: null,
            title: "Welcome to the sanctum",
            text:
                "It is dark in here. Your lamp follows your finger or cursor, so carry it wherever " +
                "you want to see. A quick look around takes half a minute.",
        },
        {
            target: null,
            title: "Watchers in the dark",
            text:
                "Not everything in this sanctum wishes you well. Eyes gather in the dark, drawn to " +
                "your questions, and creep toward your reading. Carry your light to them (move your " +
                "cursor, or tap near them) and they flee. Leave them watching when you ask, and they " +
                "may cloud what the oracle sees. Listen for anklet bells. Not every pair means harm: " +
                "the temple cat comes and goes as it pleases.",
        },
        {
            target: ".input-bar",
            title: "Ask your question",
            text:
                "Ask anything on your mind. The oracle decides how many cards it deserves: one for a " +
                "simple question, three for most, the ten-card Celtic Cross for the deepest. Then ask " +
                "follow-ups about the same cards, or start a ✦ New reading.",
        },
        {
            target: "#oracle-picker",
            title: "Choose your oracle",
            text:
                "🃏 Cards are the tarot. 🐚 Kaudi casts cowrie shells into three heaps for what has " +
                "been, what is, and what is coming. Or let the oracle choose the one your question needs.",
        },
        {
            target: "#moon-label",
            title: "Tonight's sky",
            text:
                "The real moon phase and astrological season colour every reading. ☿ ℞ appears when " +
                "Mercury is retrograde. After midnight, the witching hour turns the sanctuary red.",
        },
        {
            target: "#panchang-btn",
            title: "🪔 Today's panchang",
            text:
                "Today's tithi, nakshatra, yoga and karana, read from the real sky. Tap it for the " +
                "full panchang. The oracle weaves it into your readings.",
        },
        {
            target: "#ritual-toggle",
            title: "✦ The ritual",
            text:
                "Before a reading your question is carved into a sigil, then you breathe and cut the " +
                "deck. Tap here to turn the ritual off and go straight to the cards.",
        },
        {
            target: "#sound-toggle",
            title: "Sound",
            text:
                "Sound starts off. Turn it on for a low ambient drone and the sounds of shuffling " +
                "and turning cards. Tap here any time to switch it.",
            extra: sound.isEnabled()
                ? undefined
                : {
                      label: "🔊 Turn sound on",
                      doneLabel: "🔊 Sound is on",
                      onClick: () => {
                          sound.setEnabled(true);
                          renderToggles();
                      },
                  },
        },
        {
            target: "#daily-card-btn",
            title: "Your card for today",
            text: "A card drawn just for you. It stays the same all day and changes at midnight.",
        },
        {
            target: "#journal-btn",
            title: "📖 Your journal",
            text:
                "Every reading is kept here, only on this device. The oracle remembers your last " +
                "few and notices the cards that keep returning.",
        },
        hasProfile
            ? {
                  target: "#profile-btn",
                  title: "☉ You",
                  text:
                      "Your rashi, nakshatra, signs, birth card and numbers live here, and you can " +
                      "edit them any time. When one of your cards appears in a reading, it glows.",
              }
            : {
                  target: "#profile-btn",
                  title: "☉ Let the cards know you",
                  text:
                      "Share your birth date and the oracle will know your rashi, nakshatra, signs and " +
                      "birth card. When one of your cards appears in a reading, it glows. It's optional " +
                      "and stays on this device.",
                  finish: [
                      { label: "Tell the cards about me", action: "profile", primary: true },
                      { label: "Maybe later", action: "done" },
                  ],
              },
    ];
}

async function startTour() {
    const result = await runTour(tourSteps());
    storage.set(TOUR_KEY, TOUR_VERSION);
    // The tour ends with the profile invitation, so don't pop the profile up separately
    profile.markPrompted();
    if (result === "profile") profile.openPanel(insights);
    else $("user-input").focus();
}

// After unlocking: the guide once (including for people who unlocked before it existed),
// otherwise the one-time profile invitation
async function welcome() {
    if (storage.get(TOUR_KEY) !== TOUR_VERSION) {
        // Give the card of the day and the panchang a moment to load, so their steps can be shown
        await Promise.race([Promise.all([insightsReady, skyReady]), sleep(1500)]);
        startTour();
    } else if (profile.shouldPrompt()) {
        profile.openPanel(insights);
        profile.markPrompted();
    }
}

function relockSanctuary() {
    storage.remove("tarot_pin");
    location.reload();
}

// --- ATMOSPHERE: moon, witching hour, toggles ---

async function loadSky() {
    try {
        const res = await fetch(`/api/sky?local_date=${profile.localDate()}`);
        if (!res.ok) return;
        const { moon, season, mercury_retrograde, panchang: today } = await res.json();
        panchang.show(today);
        if (today?.tithi.number === 30) applyAmavasya();
        $("moon-emoji").textContent = moon.emoji;
        $("moon-name").textContent = `${moon.name} · ${season} season`;
        $("moon-label").title = `Tonight's moon: ${moon.name}. The Sun is in ${season}.`;
        $("retrograde-badge").hidden = !mercury_retrograde;
        sky.setMoon(moon.fraction);
    } catch {
        /* the sky simply has no moon tonight */
    }
}

// Signs and numbers for the profile panel, and the card of the day
async function loadInsights() {
    try {
        const res = await fetch("/api/insights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: profile.toRequest(), local_date: profile.localDate() }),
        });
        if (!res.ok) return;
        const data = await res.json();
        insights = data.insights;
        dailyCard = data.daily_card;
        $("daily-card-btn").hidden = !dailyCard;
    } catch {
        /* the profile panel just won't show derived insights */
    }
}

function applyWitchingHour() {
    if (!WITCHING_HOURS.includes(new Date().getHours())) return;
    document.body.classList.add("witching");
    $("tagline").textContent = "The witching hour is upon you. The veil is thin…";
    sky.setMood("witching");
    sanctum.setMood("witching");
}

// A moonless night: the sanctum grows darker, and more things watch
function applyAmavasya() {
    document.body.classList.add("amavasya");
    sanctum.setDepth("amavasya");
    if (!document.body.classList.contains("witching")) {
        $("tagline").textContent = "Amavasya. No moon tonight, and the lamps burn low…";
    }
}

function renderToggles() {
    const on = sound.isEnabled();
    const soundBtn = $("sound-toggle");
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.querySelector(".pill-icon").textContent = on ? "🔊" : "🔇";
    soundBtn.querySelector(".pill-label").textContent = on ? "Sound on" : "Sound off";

    const ritualBtn = $("ritual-toggle");
    ritualBtn.setAttribute("aria-pressed", String(ritualEnabled));
    ritualBtn.querySelector(".pill-label").textContent = ritualEnabled ? "Ritual on" : "Ritual off";
}

function setCardsOnTable(value) {
    cardsOnTable = value;
    $("new-reading-btn").hidden = !value;
    // The oracle is chosen for a new question only
    $("oracle-picker").hidden = value;
    $("user-input").placeholder = value ? FOLLOW_UP_PLACEHOLDER : PLACEHOLDERS[oracle];
}

function renderOracle() {
    for (const btn of $("oracle-picker").querySelectorAll("button")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.oracle === oracle));
    }
    if (!cardsOnTable) $("user-input").placeholder = PLACEHOLDERS[oracle];
}

// Clear the table so the next question draws fresh cards
function startNewReading() {
    clearSpread($("cards-tray"), $("spread-legend"));
    $("tldr-box").style.display = "none";
    $("chat-output").replaceChildren(el("em", null, INTRO_TEXT));
    history.length = 0;
    setCardsOnTable(false);
    $("user-input").focus();
}

// --- MAIN TAROT INQUIRY FLOW ---

async function fetchReading(message, newReading, watched) {
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-app-pin": storage.get("tarot_pin") || "",
        },
        body: JSON.stringify({
            message,
            history,
            new_reading: newReading,
            oracle,
            watched,
            local_hour: new Date().getHours(),
            local_date: profile.localDate(),
            profile: profile.toRequest(),
            recent_readings: journal.recentForOracle(),
        }),
    });

    if (res.status === 401) {
        relockSanctuary();
        throw new Error("Your access PIN is no longer valid.");
    }
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // 422 validation errors return `detail` as a list, not a string
        const detail = typeof errData.detail === "string" ? errData.detail : null;
        throw new Error(detail || `Server error (${res.status})`);
    }
    return res.json();
}

function showShuffler() {
    $("shuffler").style.display = "flex";
    sound.shuffle();
    // Matches the 1.2s CSS shuffle cycle
    return setInterval(sound.shuffle, 1200);
}

function hideShuffler(timer) {
    clearInterval(timer);
    $("shuffler").style.display = "none";
}

async function sendInquiry() {
    const input = $("user-input");
    const btn = $("send-btn");
    const chat = $("chat-output");
    const tldrBox = $("tldr-box");
    const text = input.value.trim();
    if (!text) return;

    const newReading = !cardsOnTable;
    readingInProgress = true;
    // A watcher left in the dark as the question is asked clouds the reading
    const watched = newReading && sanctum.isWatched();
    btn.disabled = true;
    input.disabled = true;
    tldrBox.style.display = "none";
    if (newReading) {
        clearSpread($("cards-tray"), $("spread-legend"));
        sound.startHeartbeat();
    }
    chat.replaceChildren(
        el("span", "status-msg", newReading ? WAITING[oracle] : "The oracle contemplates your reading...")
    );
    if (watched) chat.append(el("span", "watched-note", " Something is watching."));

    // Start the reading now; the ritual plays while it is on its way
    const reading = fetchReading(text, newReading, watched).then(
        (data) => ({ data }),
        (error) => ({ error })
    );

    // Which oracle the reading used, so an "auto" ritual can end with the right gesture
    const chosen = reading.then(({ data }) => (data?.kaudi ? "kaudi" : data?.cards?.length ? "tarot" : null));
    if (newReading && ritualEnabled) await runRitual(text, { oracle, chosen });

    // The deck is shuffled only when it is known to be the cards
    const shuffleTimer = newReading && oracle === "tarot" ? showShuffler() : null;
    const { data, error } = await reading;
    hideShuffler(shuffleTimer);

    try {
        if (error) throw error;

        if (data.cards && data.cards.length > 0) {
            await revealSpread($("cards-tray"), $("spread-legend"), data.cards, data.spread, {
                onFlip: (i) => {
                    sound.flip();
                    sound.quickenHeartbeat();
                    sanctum.flare();
                    if (data.cards[i].personal) {
                        sound.personal();
                        buzz([15, 80, 30]);
                    } else {
                        buzz(15);
                    }
                },
            });
        }

        if (data.kaudi) {
            await revealKaudi($("cards-tray"), $("spread-legend"), data.kaudi, {
                onCast: () => {
                    sound.cowries();
                    sound.quickenHeartbeat(10);
                    sanctum.flare();
                    buzz([10, 40, 10]);
                },
                onCount: sound.tick,
            });
        }
        sound.stopHeartbeat();
        if (watched) {
            $("spread-legend").append(el("li", "watched-note", "👁 Something watched this reading. Trust what rings true."));
        }

        if (data.tldr) {
            $("tldr-text").textContent = data.tldr;
            tldrBox.style.display = "block";
            sound.chime();
        }

        chat.replaceChildren(el("div", "narrative", data.reply));
        chat.scrollTop = 0;

        history.push({ role: "user", content: text });
        history.push({
            role: "assistant",
            content: (data.tldr ? `[TL;DR: ${data.tldr}]\n` : "") + data.reply,
        });
        if (history.length > MAX_HISTORY_MESSAGES) {
            history.splice(0, history.length - MAX_HISTORY_MESSAGES);
        }

        if (data.cards?.length || data.kaudi) {
            journal.add({
                date: profile.localDate(),
                question: text,
                spread: data.spread,
                cards: data.cards || [],
                kaudi: data.kaudi?.heaps || null,
                tldr: data.tldr,
            });
            setCardsOnTable(true);
        }
    } catch (err) {
        chat.replaceChildren(el("span", "error-text", `Oracle disrupted: ${err.message}`));
    } finally {
        readingInProgress = false;
        sound.stopHeartbeat();
        btn.disabled = false;
        input.disabled = false;
        input.value = "";
        input.focus();
    }
}

// --- WHILE YOU WERE AWAY ---
// Leave the tab for a while and come back: the lamp has guttered, a line has changed,
// and if cards are on the table, one of them has moved.

const AWAY_SECONDS = 20;
const AWAY_LINES = [
    "You left. The cards didn't.",
    "Something turned in the dark while you were gone.",
    "The lamp burned lower while you were away.",
    "We kept your place. Something else sat in it for a while.",
    "You were missed. Not only by us.",
    "The shells shifted while no one was looking.",
];
let awayAt = null;

function onReturn() {
    // Not while the sanctum is still sealed
    if ($("blocker-screen").style.display !== "none") return;
    const tagline = $("tagline");
    const lines = AWAY_LINES.filter((l) => l !== tagline.textContent);
    tagline.textContent = lines[Math.floor(Math.random() * lines.length)];
    tagline.classList.remove("uncanny");
    void tagline.offsetWidth; // restart the flicker
    tagline.classList.add("uncanny");

    const cards = [...document.querySelectorAll("#cards-tray .tarot-card, #cards-tray .kaudi-heap")];
    if (cards.length) {
        const moved = cards[Math.floor(Math.random() * cards.length)];
        moved.style.setProperty("--nudge", `${(Math.random() < 0.5 ? -1 : 1) * (1 + Math.random())}deg`);
        moved.classList.add("nudged");
    }
    sanctum.relight();
    sound.breath({ inhale: true, seconds: 2.4, peak: 0.05 });
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        awayAt = Date.now();
    } else if (awayAt && Date.now() - awayAt > AWAY_SECONDS * 1000) {
        awayAt = null;
        // After the audio context resumes
        setTimeout(onReturn, 300);
    }
});

// --- WIRING ---

$("unlock-btn").addEventListener("click", attemptUnlock);
$("gatekeeper-pin").addEventListener("keypress", (e) => {
    if (e.key === "Enter") attemptUnlock();
});
$("lock-btn").addEventListener("click", relockSanctuary);
$("send-btn").addEventListener("click", sendInquiry);
$("user-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendInquiry();
});
// Writing a question draws the watchers
$("user-input").addEventListener("input", () => sanctum.beckon());

$("sound-toggle").addEventListener("click", () => {
    sound.setEnabled(!sound.isEnabled());
    renderToggles();
});
$("ritual-toggle").addEventListener("click", () => {
    ritualEnabled = !ritualEnabled;
    storage.set("tarot_ritual", ritualEnabled ? "on" : "off");
    renderToggles();
});
$("new-reading-btn").addEventListener("click", startNewReading);
$("oracle-picker").addEventListener("click", (e) => {
    const choice = e.target.closest("button")?.dataset.oracle;
    if (!choice) return;
    oracle = choice;
    storage.set("tarot_oracle", oracle);
    renderOracle();
});

$("lightbox").addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Close the topmost layer only: an info popover, then the card view (which can sit
    // above the journal), then panels
    if (infotip.close()) return;
    if (closeLightbox()) return;
    profile.closePanel();
    journal.closePanel();
    panchang.closePanel();
});

$("profile-btn").addEventListener("click", () => profile.openPanel(insights));
$("journal-btn").addEventListener("click", journal.openPanel);
$("tour-btn").addEventListener("click", startTour);
$("daily-card-btn").addEventListener("click", () => dailyCard && openLightbox(dailyCard));

profile.initPanel({
    onSaved: async () => {
        await loadInsights();
        profile.showPortrait(insights, { celebrate: true });
        sound.chime();
    },
    onCardClick: openLightbox,
    onForget: async () => {
        profile.forget();
        journal.forget();
        await loadInsights();
        profile.closePanel();
        startNewReading();
        $("chat-output").replaceChildren(
            el("em", null, "Your profile and journal have been erased from this device.")
        );
    },
});
journal.initPanel({ onCardClick: openLightbox });
panchang.initPanel();

// Browsers only allow audio after a user gesture
document.addEventListener("pointerdown", sound.onUserGesture, { once: true });
document.addEventListener("keydown", sound.onUserGesture, { once: true });

renderToggles();
renderOracle();
startNewReading();
applyWitchingHour();
skyReady = loadSky();
insightsReady = loadInsights();

(async () => {
    const storedPin = storage.get("tarot_pin");
    if (storedPin) {
        try {
            if ((await verifyPinWithServer(storedPin)) === 200) {
                unlockUI();
                return;
            }
        } catch {
            /* fall through to the PIN prompt */
        }
    }
    $("gatekeeper-pin").focus();
})();
