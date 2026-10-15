import { el, storage, buzz, sleep } from "./util.js";
import * as sound from "./sound.js";
import { startSky } from "./sky.js";
import { revealSpread, clearSpread, openLightbox, closeLightbox } from "./cards.js";
import { runRitual } from "./ritual.js";
import * as profile from "./profile.js";
import * as journal from "./journal.js";
import { runTour } from "./tour.js";

// The server only sends the last 6 messages to the model, so don't send more
const MAX_HISTORY_MESSAGES = 6;
const WITCHING_HOURS = [0, 1, 2, 3];
const DEFAULT_PLACEHOLDER = "Ask the cards...";
const FOLLOW_UP_PLACEHOLDER = "Ask about your cards...";
const INTRO_TEXT =
    'Ask your question, such as: "What energy surrounds my next career move?" ' +
    "The oracle will choose how many cards to draw.";

const TOUR_KEY = "tarot_tour_seen";

const history = [];
// While cards are on the table, questions are follow-ups about them (no new draw)
let cardsOnTable = false;
let ritualEnabled = storage.get("tarot_ritual") !== "off";
// Derived from the profile by the server: signs, birth card, numbers
let insights = null;
let dailyCard = null;
let insightsReady = Promise.resolve();

const $ = (id) => document.getElementById(id);
const sky = startSky($("sky-canvas"));

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
            showBlockerError("Invalid PIN. Access denied.");
        }
    } catch {
        showBlockerError("Could not reach oracle server.");
    } finally {
        btn.disabled = false;
        btn.textContent = "ENTER SANCTUARY";
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
            title: "Welcome to the sanctuary",
            text: "A quick look around before your first reading. It takes half a minute.",
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
            target: "#moon-label",
            title: "Tonight's sky",
            text:
                "The real moon phase and astrological season colour every reading. ☿ ℞ appears when " +
                "Mercury is retrograde. After midnight, the witching hour turns the sanctuary red.",
        },
        {
            target: "#ritual-toggle",
            title: "✦ The ritual",
            text:
                "Before a reading you'll hold your question, breathe, and cut the deck. Tap here to " +
                "turn the ritual off and go straight to the cards.",
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
                      "Your signs, birth card and numbers live here, and you can edit them any time. " +
                      "When one of your cards appears in a reading, it glows.",
              }
            : {
                  target: "#profile-btn",
                  title: "☉ Let the cards know you",
                  text:
                      "Share your birth date and the oracle will know your signs and birth card. When " +
                      "one of your cards appears in a reading, it glows. It's optional and stays on " +
                      "this device.",
                  finish: [
                      { label: "Tell the cards about me", action: "profile", primary: true },
                      { label: "Maybe later", action: "done" },
                  ],
              },
    ];
}

async function startTour() {
    const result = await runTour(tourSteps());
    storage.set(TOUR_KEY, "1");
    // The tour ends with the profile invitation, so don't pop the profile up separately
    profile.markPrompted();
    if (result === "profile") profile.openPanel(insights);
    else $("user-input").focus();
}

// After unlocking: the guide once (including for people who unlocked before it existed),
// otherwise the one-time profile invitation
async function welcome() {
    if (storage.get(TOUR_KEY) !== "1") {
        // Give the card of the day a moment to load, so its step can be shown
        await Promise.race([insightsReady, sleep(1500)]);
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
        const res = await fetch("/api/sky");
        if (!res.ok) return;
        const { moon, season, mercury_retrograde } = await res.json();
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
    $("user-input").placeholder = value ? FOLLOW_UP_PLACEHOLDER : DEFAULT_PLACEHOLDER;
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

async function fetchReading(message, newReading) {
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
    btn.disabled = true;
    input.disabled = true;
    tldrBox.style.display = "none";
    if (newReading) clearSpread($("cards-tray"), $("spread-legend"));
    chat.replaceChildren(
        el(
            "span",
            "status-msg",
            newReading
                ? "Shuffling the deck and channeling guidance..."
                : "The oracle contemplates your cards..."
        )
    );

    // Start the reading now; the ritual plays while it is on its way
    const reading = fetchReading(text, newReading).then(
        (data) => ({ data }),
        (error) => ({ error })
    );

    if (newReading && ritualEnabled) await runRitual(text);

    const shuffleTimer = newReading ? showShuffler() : null;
    const { data, error } = await reading;
    hideShuffler(shuffleTimer);

    try {
        if (error) throw error;

        if (data.cards && data.cards.length > 0) {
            await revealSpread($("cards-tray"), $("spread-legend"), data.cards, data.spread, {
                onFlip: (i) => {
                    sound.flip();
                    if (data.cards[i].personal) {
                        sound.personal();
                        buzz([15, 80, 30]);
                    } else {
                        buzz(15);
                    }
                },
            });
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

        if (data.cards && data.cards.length > 0) {
            journal.add({
                date: profile.localDate(),
                question: text,
                spread: data.spread,
                cards: data.cards,
                tldr: data.tldr,
            });
            setCardsOnTable(true);
        }
    } catch (err) {
        chat.replaceChildren(el("span", "error-text", `Oracle disrupted: ${err.message}`));
    } finally {
        btn.disabled = false;
        input.disabled = false;
        input.value = "";
        input.focus();
    }
}

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

$("lightbox").addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Close the topmost layer only: the card view can sit above the journal
    if (closeLightbox()) return;
    profile.closePanel();
    journal.closePanel();
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

// Browsers only allow audio after a user gesture
document.addEventListener("pointerdown", sound.onUserGesture, { once: true });
document.addEventListener("keydown", sound.onUserGesture, { once: true });

renderToggles();
startNewReading();
applyWitchingHour();
loadSky();
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
