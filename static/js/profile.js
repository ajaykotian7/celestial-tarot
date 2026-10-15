// The querent's profile: kept only in this browser. Birth details go to our server
// (never stored there) to work out signs and numbers; only those reach the oracle.
import { el, storage } from "./util.js";

const PROFILE_KEY = "tarot_profile";
// Renamed from "tarot_profile_prompted", which was set even when the panel failed to open
const PROMPTED_KEY = "tarot_profile_offered";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

const $ = (id) => document.getElementById(id);
// namedItem, not form.elements.<name>: built-in properties like `length` would win
const field = (name) => $("profile-form").elements.namedItem(name);

export function load() {
    try {
        return JSON.parse(storage.get(PROFILE_KEY)) || null;
    } catch {
        return null;
    }
}

function save(profile) {
    storage.set(PROFILE_KEY, JSON.stringify(profile));
}

export function forget() {
    storage.remove(PROFILE_KEY);
}

export function shouldPrompt() {
    return !load() && storage.get(PROMPTED_KEY) !== "1";
}

export function markPrompted() {
    storage.set(PROMPTED_KEY, "1");
}

// The shape /api/chat and /api/insights expect
export function toRequest(profile = load()) {
    if (!profile) return null;
    return {
        name: profile.name || null,
        birth_date: profile.birth_date || null,
        birth_time: profile.birth_time || null,
        timezone: profile.place?.timezone || null,
        latitude: profile.place?.latitude ?? null,
        longitude: profile.place?.longitude ?? null,
    };
}

export function localDate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- The portrait: what the cards know ---

// Text presentation (U+FE0E) so iOS doesn't swap in coloured emoji
const GLYPHS = {
    Aries: "♈︎",
    Taurus: "♉︎",
    Gemini: "♊︎",
    Cancer: "♋︎",
    Leo: "♌︎",
    Virgo: "♍︎",
    Libra: "♎︎",
    Scorpio: "♏︎",
    Sagittarius: "♐︎",
    Capricorn: "♑︎",
    Aquarius: "♒︎",
    Pisces: "♓︎",
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// "your birth card and the card of your Leo sun" -> "Birth card · Leo sun"
function shortReason(reason) {
    return reason
        .split(" and ")
        .map((part) => capitalize(part.replace(/^the card of your /, "").replace(/^your /, "")))
        .join(" · ");
}

// Every revealed piece fades in one after another (--d is its place in the sequence)
let revealIndex = 0;
function reveal(node) {
    node.classList.add("reveal-item");
    node.style.setProperty("--d", revealIndex++);
    return node;
}

function signTile(symbol, label, placement, onAddDetails) {
    if (!placement) {
        const tile = el("button", "sign-tile empty");
        tile.type = "button";
        tile.append(
            el("div", "sign-glyph", symbol),
            el("div", "sign-label", label),
            el("div", "sign-hint", "Add birth time & place to reveal")
        );
        tile.addEventListener("click", onAddDetails);
        return reveal(tile);
    }

    const tile = el("div", "sign-tile");
    if (placement.alternatives) {
        tile.classList.add("cusp");
        tile.append(
            el("div", "sign-glyph", placement.alternatives.map((s) => GLYPHS[s]).join(" ")),
            el("div", "sign-label", label),
            el("div", "sign-name", placement.alternatives.join(" / ")),
            el("div", "sign-hint", "On the cusp: add your birth time")
        );
    } else {
        tile.classList.add(`element-${placement.element}`);
        tile.append(
            el("div", "sign-glyph", GLYPHS[placement.sign]),
            el("div", "sign-label", label),
            el("div", "sign-name", placement.sign),
            el("div", "sign-element", capitalize(placement.element))
        );
    }
    return reveal(tile);
}

function numberTile(number, label, theme) {
    const tile = el("div", "number-tile");
    tile.append(
        el("div", "number-value", String(number)),
        el("div", "number-label", label),
        el("div", "number-theme", capitalize(theme))
    );
    return reveal(tile);
}

function renderPortrait(profile, insights, { onCardClick, onAddDetails }) {
    revealIndex = 0;
    const body = $("portrait-body");
    body.replaceChildren();

    const head = el("div", "portrait-head");
    head.append(
        reveal(el("div", "portrait-eyebrow", "The cards know you")),
        reveal(el("h2", "portrait-name", profile?.name || "Seeker"))
    );
    body.append(head);

    if (!insights) {
        const prompt = el("button", "portrait-empty");
        prompt.type = "button";
        prompt.textContent = "Add your birth date to reveal your signs, your birth card and your numbers.";
        prompt.addEventListener("click", onAddDetails);
        body.append(reveal(prompt));
        return;
    }

    const certain = [
        insights.sun && !insights.sun.alternatives && `${insights.sun.sign} Sun`,
        insights.moon && !insights.moon.alternatives && `${insights.moon.sign} Moon`,
        insights.rising && `${insights.rising.sign} Rising`,
    ].filter(Boolean);
    if (certain.length) head.append(reveal(el("div", "portrait-tagline", certain.join(" · "))));

    const tiles = el("div", "sign-tiles");
    tiles.append(
        signTile("☉", "Sun", insights.sun, onAddDetails),
        signTile("☽", "Moon", insights.moon, onAddDetails),
        signTile("↑", "Rising", insights.rising, onAddDetails)
    );
    body.append(tiles);

    const cardsSection = el("div", "portrait-section");
    cardsSection.append(reveal(el("div", "portrait-section-title", "Cards that are yours")));
    const cardRow = el("div", "portrait-cards");
    for (const c of insights.personal_cards) {
        const btn = el("button", "portrait-card");
        btn.type = "button";
        btn.setAttribute("aria-label", `${c.card}: ${shortReason(c.reason)}. Show card.`);
        const img = el("img");
        img.src = c.image;
        img.alt = "";
        btn.append(img, el("div", "portrait-card-name", c.card), el("div", "portrait-card-reason", shortReason(c.reason)));
        btn.addEventListener("click", () =>
            onCardClick({
                position: capitalize(c.reason),
                card: c.card,
                orientation: "upright",
                meaning: c.meaning,
                image: c.image,
            })
        );
        cardRow.append(reveal(btn));
    }
    cardsSection.append(cardRow, reveal(el("p", "hint", "When one of these appears in a reading, it will glow.")));
    body.append(cardsSection);

    const numbers = el("div", "number-tiles");
    numbers.append(
        numberTile(insights.life_path, "Life path", insights.life_path_theme),
        numberTile(insights.personal_year, `Personal year ${new Date().getFullYear()}`, insights.personal_year_theme)
    );
    body.append(numbers);
}

// --- The profile panel ---

let chosenPlace = null;
let searchTimer = null;

function showPlace(place) {
    chosenPlace = place;
    $("place-chosen").hidden = !place;
    $("place-input").hidden = !!place;
    $("place-results").replaceChildren();
    if (place) $("place-chosen-label").textContent = `📍 ${place.label}`;
}

async function searchPlaces(query) {
    const results = $("place-results");
    if (query.trim().length < 2) {
        results.replaceChildren();
        return;
    }
    try {
        const url = `${GEOCODE_URL}?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        const places = (data.results || []).filter((r) => r.timezone);
        results.replaceChildren(
            ...places.map((r) => {
                const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
                const item = el("li");
                const btn = el("button", "place-option", label);
                btn.type = "button";
                btn.addEventListener("click", () =>
                    showPlace({
                        label,
                        latitude: r.latitude,
                        longitude: r.longitude,
                        timezone: r.timezone,
                    })
                );
                item.append(btn);
                return item;
            })
        );
        if (!places.length) results.append(el("li", "hint", "No places found."));
    } catch {
        results.replaceChildren(el("li", "hint", "Place search is unavailable right now."));
    }
}

function fillForm(profile) {
    field("name").value = profile?.name || "";
    field("birth_date").value = profile?.birth_date || "";
    field("birth_time").value = profile?.birth_time || "";
    $("place-input").value = "";
    showPlace(profile?.place || null);
}

function readForm() {
    return {
        name: field("name").value.trim().slice(0, 40),
        birth_date: field("birth_date").value || null,
        birth_time: field("birth_time").value || null,
        place: chosenPlace,
    };
}

let lastFocus = null;
let handlers = {};
// The insights last shown, so "Cancel" while editing can go back to the portrait
let shownInsights = null;

function showForm() {
    const existing = load();
    fillForm(existing);
    field("birth_date").max = localDate();
    $("profile-title").textContent = existing ? "Edit your details" : "Let the cards know you";
    $("profile-skip").textContent = existing ? "Cancel" : "Not now";
    $("profile-portrait").hidden = true;
    $("profile-edit").hidden = false;
    field("name").focus();
}

// celebrate: play the reveal animation (right after saving)
export function showPortrait(insights, { celebrate = false } = {}) {
    shownInsights = insights;
    renderPortrait(load(), insights, {
        onCardClick: handlers.onCardClick,
        onAddDetails: showForm,
    });
    const portrait = $("profile-portrait");
    portrait.classList.toggle("celebrate", celebrate);
    $("profile-edit").hidden = true;
    portrait.hidden = false;
    $("profile-panel").querySelector(".panel").scrollTop = 0;
    $("profile-panel").scrollTop = 0;
    $("profile-edit-btn").focus();
}

// With a saved profile, open on the portrait; otherwise on the form
export function openPanel(insights) {
    lastFocus = document.activeElement;
    $("profile-panel").hidden = false;
    if (load()) showPortrait(insights);
    else showForm();
}

export function closePanel() {
    if ($("profile-panel").hidden) return;
    $("profile-panel").hidden = true;
    lastFocus?.focus?.();
}

// onSaved(profile) runs after Save, onForget() after the profile and journal are
// erased, and onCardClick(card) when a card in the portrait is tapped
export function initPanel({ onSaved, onForget, onCardClick }) {
    handlers = { onCardClick };
    $("place-input").addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchPlaces(e.target.value), 350);
    });
    $("place-clear").addEventListener("click", () => {
        showPlace(null);
        $("place-input").focus();
    });
    $("profile-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const profile = readForm();
        save(profile);
        onSaved(profile);
    });
    // "Cancel" while editing an existing profile goes back to the portrait
    $("profile-skip").addEventListener("click", () => {
        if (load()) showPortrait(shownInsights);
        else closePanel();
    });
    $("profile-edit-btn").addEventListener("click", showForm);
    $("profile-close").addEventListener("click", closePanel);
    $("profile-panel").addEventListener("click", (e) => {
        if (e.target === $("profile-panel")) closePanel();
    });
    $("forget-me").addEventListener("click", () => {
        if (!confirm("Erase your profile and reading journal from this device?")) return;
        onForget();
    });
}
