// The reading journal: past readings saved only in this browser. The last few are
// summarised for the oracle so it can notice recurring cards and themes.
import { el, storage } from "./util.js";
import { createSigil } from "./sigil.js";

const JOURNAL_KEY = "tarot_journal";
const MAX_ENTRIES = 100;
// Matches the server's limits for recent_readings
const SENT_TO_ORACLE = 5;
const MAX_QUESTION = 300;
const MAX_TLDR = 400;
const MAX_NAME = 40;

const $ = (id) => document.getElementById(id);

export function load() {
    try {
        const entries = JSON.parse(storage.get(JOURNAL_KEY));
        return Array.isArray(entries) ? entries : [];
    } catch {
        return [];
    }
}

function save(entries) {
    storage.set(JOURNAL_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function forget() {
    storage.remove(JOURNAL_KEY);
}

// A tarot reading (cards) or a kaudi casting (kaudi: the three heaps)
export function add({ date, question, spread, cards = [], kaudi = null, tldr }) {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date,
        question,
        spread,
        kaudi: kaudi && kaudi.map(({ position, aya, devanagari, remainder, favourable }) => ({
            position,
            aya,
            devanagari,
            remainder,
            favourable,
        })),
        cards: cards.map(({ position, card, orientation, meaning, image, personal }) => ({
            position,
            card,
            orientation,
            meaning,
            image,
            personal,
        })),
        tldr: tldr || null,
    };
    save([entry, ...load()]);
}

function remove(id) {
    save(load().filter((e) => e.id !== id));
}

const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Most recent first, trimmed to what the server accepts
export function recentForOracle() {
    return load()
        .slice(0, SENT_TO_ORACLE)
        .map((e) => ({
            date: e.date,
            question: clip(e.question, MAX_QUESTION),
            cards: (e.cards || []).slice(0, 10).map((c) => ({
                card: clip(c.card, MAX_NAME),
                orientation: c.orientation,
                position: clip(c.position, MAX_NAME),
            })),
            kaudi: (e.kaudi || []).slice(0, 3).map((h) => ({
                position: clip(h.position, MAX_NAME),
                aya: h.aya,
                remainder: h.remainder,
            })),
            tldr: clip(e.tldr, MAX_TLDR),
        }));
}

function recurringCards(entries) {
    const counts = new Map();
    for (const e of entries) for (const c of e.cards || []) counts.set(c.card, (counts.get(c.card) || 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
}

function formatDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

// --- The journal panel ---

let openCard = () => {};
let lastFocus = null;

function render() {
    const entries = load();
    const list = $("journal-list");
    $("journal-empty").hidden = entries.length > 0;

    const recurring = recurringCards(entries).slice(0, 8);
    const recurringBox = $("journal-recurring");
    recurringBox.hidden = recurring.length === 0;
    recurringBox.replaceChildren(
        el("div", "insights-title", "Cards that keep finding you"),
        el("div", "chip-row", null)
    );
    recurringBox.lastChild.append(...recurring.map(([card, n]) => el("span", "chip", `${card} ×${n}`)));

    list.replaceChildren(
        ...entries.map((entry) => {
            const item = el("li", "journal-entry");
            const head = el("div", "journal-head");
            const mark = createSigil(entry.question, { frame: false });
            mark.setAttribute("class", "journal-sigil");
            head.append(mark, el("span", "journal-date", formatDate(entry.date)));
            const del = el("button", "journal-delete", "✕");
            del.type = "button";
            del.setAttribute("aria-label", "Delete this reading");
            del.addEventListener("click", () => {
                remove(entry.id);
                render();
            });
            head.append(del);

            const thumbs = el("div", "journal-thumbs");
            for (const h of entry.kaudi || []) {
                const chip = el("span", `journal-aya ${h.favourable ? "favourable" : "testing"}`);
                chip.title = `${h.position}: ${h.remainder} remain`;
                chip.append(`🐚 ${h.aya}`);
                thumbs.append(chip);
            }
            for (const c of entry.cards || []) {
                const thumb = el("button", "journal-thumb");
                thumb.type = "button";
                thumb.setAttribute("aria-label", `${c.position}: ${c.card}, ${c.orientation}`);
                if (c.personal) thumb.classList.add("personal");
                const img = el("img");
                img.src = c.image || "";
                img.alt = "";
                img.loading = "lazy";
                if (c.orientation === "reversed") img.classList.add("reversed");
                thumb.append(img);
                thumb.addEventListener("click", () => openCard(c));
                thumbs.append(thumb);
            }

            item.append(head, el("p", "journal-question", `“${entry.question}”`), thumbs);
            if (entry.tldr) item.append(el("p", "journal-tldr", entry.tldr));
            return item;
        })
    );
}

export function openPanel() {
    render();
    lastFocus = document.activeElement;
    $("journal-panel").hidden = false;
    $("journal-close").focus();
}

export function closePanel() {
    if ($("journal-panel").hidden) return;
    $("journal-panel").hidden = true;
    lastFocus?.focus?.();
}

export function initPanel({ onCardClick }) {
    openCard = onCardClick;
    $("journal-close").addEventListener("click", closePanel);
    $("journal-panel").addEventListener("click", (e) => {
        if (e.target === $("journal-panel")) closePanel();
    });
}
