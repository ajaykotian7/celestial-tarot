// The reading journal: past readings, kept only in this browser, per person. The last
// few for a person are summarised for the reader so it can notice recurring cards and
// themes.
import { el, button, storage, fmtDate } from "./util.js";
import { createSigil } from "./sigil.js";

const JOURNAL_KEY = "tarot_journal";
const MAX_ENTRIES = 200;
// Matches the server's limits for recent_readings
const SENT_TO_ORACLE = 5;
const MAX_QUESTION = 300;
const MAX_TLDR = 400;
const MAX_NAME = 40;
const MAX_DASHA = 60;

export function load() {
    const entries = storage.json(JOURNAL_KEY, []);
    return Array.isArray(entries) ? entries : [];
}

function save(entries) {
    storage.setJson(JOURNAL_KEY, entries.slice(0, MAX_ENTRIES));
}

// Readings from before family profiles belong to whoever "Me" is
const belongsTo = (entry, personId, selfId) => (entry.person || selfId) === personId;

export function forPerson(personId, selfId) {
    return load().filter((e) => belongsTo(e, personId, selfId));
}

// A reading: tarot cards, a kaudi casting (the three heaps), and/or the dasha the
// jataka was read in (e.g. "Chandra–Budh")
export function add({ person, date, question, spread, cards = [], kaudi = null, jataka = null, tldr, reply }) {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        person,
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
        jataka: jataka || null,
        tldr: tldr || null,
        reply: reply ? reply.slice(0, 6000) : null,
    };
    save([entry, ...load()]);
    return entry;
}

function remove(id) {
    save(load().filter((e) => e.id !== id));
}

const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Most recent first, trimmed to what the server accepts
export function recentForOracle(personId, selfId) {
    return forPerson(personId, selfId)
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
            jataka: clip(e.jataka, MAX_DASHA) || null,
            tldr: clip(e.tldr, MAX_TLDR),
        }));
}

// The journal list for one person. onCardClick(card) opens a card; onOpen(entry) shows
// a past reading in full.
export function render(list, empty, count, personId, selfId, { onCardClick, onOpen }) {
    const entries = forPerson(personId, selfId);
    empty.hidden = entries.length > 0;
    count.textContent = entries.length ? `${entries.length}` : "";
    list.replaceChildren(
        ...entries.map((entry) => {
            const item = el("li", "journal-entry");
            const head = el("div", "journal-head");
            const mark = createSigil(entry.question, { frame: false });
            mark.setAttribute("class", "journal-sigil");
            head.append(mark, el("span", "journal-date", fmtDate(entry.date)));
            const del = button("✕", "journal-delete", () => {
                remove(entry.id);
                render(list, empty, count, personId, selfId, { onCardClick, onOpen });
            });
            del.setAttribute("aria-label", "Delete this reading");
            head.append(del);

            const thumbs = el("div", "journal-thumbs");
            if (entry.jataka) thumbs.append(el("span", "journal-aya", `🪐 ${entry.jataka} dasha`));
            for (const h of entry.kaudi || []) {
                const chip = el("span", `journal-aya ${h.favourable ? "favourable" : "testing"}`, `🐚 ${h.aya}`);
                chip.title = `${h.position}: ${h.remainder} remain`;
                thumbs.append(chip);
            }
            for (const c of entry.cards || []) {
                const thumb = button("", "journal-thumb", () => onCardClick(c));
                thumb.setAttribute("aria-label", `${c.position}: ${c.card}, ${c.orientation}`);
                if (c.personal) thumb.classList.add("personal");
                const img = el("img");
                img.src = c.image || "";
                img.alt = "";
                img.loading = "lazy";
                if (c.orientation === "reversed") img.classList.add("reversed");
                thumb.append(img);
                thumbs.append(thumb);
            }

            const question = el("p", "journal-question", `“${entry.question}”`);
            item.append(head, question, thumbs);
            if (entry.tldr) item.append(el("p", "journal-tldr", entry.tldr));
            if (entry.reply) item.append(button("Read again", "link-btn", () => onOpen(entry)));
            return item;
        })
    );
}
