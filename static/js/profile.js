// The querent's profile: kept only in this browser. Birth details go to our server
// (never stored there) to work out signs and numbers; only those reach the oracle.
import { el, storage } from "./util.js";
import { infoButton } from "./infotip.js";

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

// What each part of the portrait means, for its ⓘ button: [title, explanation]
const INFO = {
    sun: [
        "Sun sign",
        "Western astrology: the sign the Sun was in when you were born. It speaks of your core self, your will and what gives you life.",
    ],
    moon: [
        "Moon sign",
        "Western astrology: the sign the Moon was in at your birth. Your feelings, instincts and what comforts you. The Moon changes sign every two or three days, so a birth time can matter.",
    ],
    rising: [
        "Rising sign",
        "The sign rising on the eastern horizon at the moment you were born, also called the ascendant. How you meet the world and the first impression you give. It changes about every two hours, so it needs your birth time and place.",
    ],
    jyotish: [
        "Jyotish",
        "Vedic astrology, as used in Indian horoscopes. It measures the zodiac against the fixed stars (the sidereal zodiac), which today sits about 24° behind the Western one, so your Vedic signs often differ from your Western signs.",
    ],
    rashi: [
        "Rashi",
        "Your Moon sign in Vedic astrology: the sign most people in India mean by \"my rashi\". It's used for daily horoscopes, for matching kundlis and in naming. It often differs from your Western Moon sign.",
    ],
    nakshatra: [
        "Nakshatra",
        "Your janma nakshatra: which of the 27 lunar mansions (each 13°20′ of the sky) the Moon was in when you were born. Each has its own deity, symbol and ruling graha, and four quarters called padas. It colours your temperament, traditionally suggests the first syllable of a name, and sets the order of the planetary periods (dashas) of your life.",
    ],
    lagna: [
        "Lagna",
        "The Vedic ascendant: the sign rising in the east at your birth, measured against the stars. It is the first house of your chart: your body, your personality and the direction of your life. It needs your birth time and place.",
    ],
    cards: [
        "Your cards",
        "Tarot cards tied to you. Your birth card comes from adding up the digits of your birth date (Mary K. Greer's method), and each certain Western sign has a Major Arcana card (Scorpio and Death, for example). When one of them appears in a reading, it glows.",
    ],
    life_path: [
        "Life path",
        "Western numerology: your whole birth date reduced to a single number (11, 22 and 33 are kept as master numbers). The main theme and lesson of your life.",
    ],
    personal_year: [
        "Personal year",
        "Your birth day and month added to this year, reduced to one number. The theme of this year for you, in a cycle of nine. It changes on 1 January.",
    ],
    moolank: [
        "Moolank",
        "Indian numerology: the day you were born, reduced to one number (your root or 'driver' number). How you see yourself and how you act on instinct. Each number is ruled by a graha.",
    ],
    bhagyank: [
        "Bhagyank",
        "Indian numerology: every digit of your birth date added together and reduced (your destiny or 'conductor' number). The path life tends to lead you along. Each number is ruled by a graha.",
    ],
    name_number: [
        "Name number",
        "Chaldean numerology: each letter of the name you gave is worth 1 to 8, and they're added up and reduced. How the name you go by shapes the way others see you. Only English letters are counted.",
    ],
    lo_shu: [
        "Lo Shu grid",
        "An ancient 3×3 magic square (every row, column and diagonal adds up to 15), widely used in Indian numerology. The digits of your birth date, with your Bhagyank (and Moolank, if you were born on a two-digit day), are placed in it. Repeated numbers are strengths, missing ones are qualities to grow into, and a complete line is a 'plane'.",
    ],
};

// A label with its ⓘ button
function labelled(cls, text, key) {
    const node = el("div", cls, text);
    if (INFO[key]) node.append(" ", infoButton(...INFO[key]));
    return node;
}

// A tile still waiting for details: tapping its prompt opens the form
function emptyTile(className, glyph, label, key, onAddDetails) {
    const tile = el("div", `${className} empty`);
    const add = el("button", "sign-hint add-details", "Add birth time & place to reveal");
    add.type = "button";
    add.addEventListener("click", onAddDetails);
    tile.append(glyph, labelled("sign-label", label, key), add);
    return reveal(tile);
}

function signTile(symbol, label, placement, onAddDetails, key) {
    if (!placement) return emptyTile("sign-tile", el("div", "sign-glyph", symbol), label, key, onAddDetails);

    const tile = el("div", "sign-tile");
    if (placement.alternatives) {
        tile.classList.add("cusp");
        tile.append(
            el("div", "sign-glyph", placement.alternatives.map((s) => GLYPHS[s]).join(" ")),
            labelled("sign-label", label, key),
            el("div", "sign-name", placement.alternatives.join(" / ")),
            el("div", "sign-hint", "On the cusp: add your birth time")
        );
    } else {
        tile.classList.add(`element-${placement.element}`);
        tile.append(
            el("div", "sign-glyph", GLYPHS[placement.sign]),
            labelled("sign-label", label, key),
            el("div", "sign-name", placement.sign),
            el("div", "sign-element", capitalize(placement.element))
        );
    }
    return reveal(tile);
}

function numberTile(number, label, theme, key) {
    const tile = el("div", "number-tile");
    tile.append(
        el("div", "number-value", String(number)),
        labelled("number-label", label, key),
        el("div", "number-theme", capitalize(theme))
    );
    return reveal(tile);
}

// Devanagari text, marked as Sanskrit so it gets the right font and pronunciation
const deva = (node) => {
    node.lang = "sa";
    return node;
};
const graha = (lord) => lord.split(" ")[0];

function vedicTile(label, concept, placement, describe, onAddDetails, key) {
    if (!placement) {
        return emptyTile("sign-tile vedic-tile", deva(el("div", "sign-glyph deva", concept)), label, key, onAddDetails);
    }

    const tile = el("div", "sign-tile vedic-tile");
    if (placement.alternatives) {
        tile.classList.add("cusp");
        tile.append(
            deva(el("div", "sign-glyph deva", concept)),
            el("div", "sign-label", label),
            el("div", "sign-name", placement.alternatives.join(" / ")),
            el("div", "sign-hint", "Add your birth time to settle it")
        );
    } else {
        if (placement.element) tile.classList.add(`element-${placement.element}`);
        tile.append(
            deva(el("div", "sign-glyph deva", placement.devanagari)),
            el("div", "sign-label", label),
            el("div", "sign-name", placement.name),
            el("div", "sign-element", describe(placement))
        );
    }
    return reveal(tile);
}

function vedicSection(insights, vedic, onAddDetails) {
    const section = el("div", "portrait-section");
    const title = el("div", "portrait-section-title", "In the Vedic sky ");
    title.append(deva(el("span", "deva", "ज्योतिष")), " ", infoButton(...INFO.jyotish));
    section.append(reveal(title));

    const tiles = el("div", "sign-tiles");
    tiles.append(
        vedicTile("Rashi · Moon", "राशि", vedic.rashi, (p) => `${p.western} · ${graha(p.lord)}`, onAddDetails, "rashi"),
        vedicTile(
            "Nakshatra",
            "नक्षत्र",
            vedic.nakshatra,
            (p) => (p.pada ? `Pada ${p.pada} · ${graha(p.lord)}` : graha(p.lord)),
            onAddDetails,
            "nakshatra"
        ),
        vedicTile("Lagna", "लग्न", vedic.lagna, (p) => p.western, onAddDetails, "lagna")
    );
    section.append(tiles);

    const n = vedic.nakshatra;
    if (!n.alternatives) {
        section.append(
            reveal(
                el(
                    "p",
                    "vedic-note",
                    `${n.name}${n.pada ? `, pada ${n.pada}` : ""}: its deity is ${n.deity}, its symbol ` +
                        `${n.symbol}, and it is ruled by ${n.lord}. A nakshatra of ${n.theme}.`
                )
            )
        );
    }

    const sun = vedic.sun;
    const western = insights.sun;
    if (sun && !sun.alternatives && western && !western.alternatives && sun.western !== western.sign) {
        section.append(
            reveal(
                el(
                    "p",
                    "hint",
                    `Your Sun is in ${western.sign} in the Western sky but in ${sun.name} (${sun.western}) ` +
                        "in the Vedic one: the sidereal zodiac sits about 24° behind."
                )
            )
        );
    }
    return section;
}

// The Lo Shu square, read row by row
const LO_SHU_ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6];

function numerologySection(numbers) {
    const section = el("div", "portrait-section");
    section.append(reveal(el("div", "portrait-section-title", "Your numbers")));

    const tiles = el("div", "number-tiles");
    tiles.append(
        numberTile(numbers.moolank.number, "Moolank", `root number · ${numbers.moolank.graha}`, "moolank"),
        numberTile(numbers.bhagyank.number, "Bhagyank", `destiny number · ${numbers.bhagyank.graha}`, "bhagyank")
    );
    if (numbers.name_number) {
        tiles.append(
            numberTile(numbers.name_number.number, "Name number", `Chaldean · ${numbers.name_number.graha}`, "name_number")
        );
    }
    section.append(tiles);

    const { counts, missing, planes } = numbers.lo_shu;
    const areas = numbers.lo_shu_areas;
    const grid = el("div", "lo-shu");
    grid.setAttribute("role", "img");
    grid.setAttribute(
        "aria-label",
        `Lo Shu grid. Present: ${LO_SHU_ORDER.filter((n) => counts[n - 1]).join(", ")}. Missing: ${missing.join(", ") || "none"}.`
    );
    for (const n of LO_SHU_ORDER) {
        const count = counts[n - 1];
        const cell = el("div", count ? "lo-shu-cell" : "lo-shu-cell missing", count ? String(n).repeat(count) : String(n));
        cell.title = `${n}: ${areas[n]}${count ? "" : " (missing)"}`;
        grid.append(cell);
    }
    const loShu = el("div", "lo-shu-wrap");
    loShu.append(labelled("lo-shu-caption", "Your Lo Shu grid", "lo_shu"), grid);
    section.append(reveal(loShu));

    if (planes.length) {
        section.append(
            reveal(el("p", "vedic-note", `Complete: ${planes.map((p) => `the ${p.name} (${p.meaning})`).join(", ")}.`))
        );
    }
    if (missing.length) {
        section.append(
            reveal(
                el(
                    "p",
                    "hint",
                    `Missing numbers are qualities to grow into: ${missing.map((n) => `${n}, ${areas[n]}`).join("; ")}.`
                )
            )
        );
    }
    return section;
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
        prompt.textContent =
            "Add your birth date to reveal your rashi, your nakshatra, your signs, your birth card and your numbers.";
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
    const vedicLine = [
        insights.vedic?.rashi.name && `${insights.vedic.rashi.name} rashi`,
        insights.vedic?.nakshatra.name && `${insights.vedic.nakshatra.name} nakshatra`,
    ].filter(Boolean);
    if (vedicLine.length) head.append(reveal(el("div", "portrait-tagline vedic-line", vedicLine.join(" · "))));

    const tiles = el("div", "sign-tiles");
    tiles.append(
        signTile("☉", "Sun", insights.sun, onAddDetails, "sun"),
        signTile("☽", "Moon", insights.moon, onAddDetails, "moon"),
        signTile("↑", "Rising", insights.rising, onAddDetails, "rising")
    );
    body.append(tiles);

    if (insights.vedic) body.append(vedicSection(insights, insights.vedic, onAddDetails));

    const cardsSection = el("div", "portrait-section");
    cardsSection.append(reveal(labelled("portrait-section-title", "Cards that are yours", "cards")));
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
        numberTile(insights.life_path, "Life path", insights.life_path_theme, "life_path"),
        numberTile(
            insights.personal_year,
            `Personal year ${new Date().getFullYear()}`,
            insights.personal_year_theme,
            "personal_year"
        )
    );
    body.append(numbers);

    if (insights.numerology) body.append(numerologySection(insights.numerology));
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
