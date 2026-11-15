// Calendar: the month as a panchang prints it (tithis, festivals, fasts and
// sankrantis), with the person's own dates (dasha changes, Shani and Guru moving,
// Chandrashtama), a muhurat finder, and export to the phone's calendar.
import { el, button, localDate, parseDate, fmtDate, span, loading, toast } from "./util.js";
import * as store from "./store.js";
import { post, placeBody } from "./api.js";

const $ = (id) => document.getElementById(id);
const KINDS = [
    ["festival", "Festivals"],
    ["fast", "Fasts"],
    ["sankranti", "Sankrantis"],
    ["personal", "Personal"],
    ["caution", "Chandrashtama"],
];
const ACTIVITIES = [
    ["work", "Start a new job or venture"],
    ["travel", "Begin a journey"],
    ["vehicle", "Buy a vehicle"],
    ["home", "Move into a home or buy property"],
    ["study", "Begin studies or a course"],
    ["purchase", "Buy gold, jewellery or valuables"],
];

let ctx = null;
let month = null; // "YYYY-MM"
let chosen = null; // "YYYY-MM-DD"
let days = [];
const shown = new Set(["festival", "fast", "sankranti", "personal", "caution"]);
const cache = new Map();

export function init(context) {
    ctx = context;
}

export async function render() {
    const root = $("tab-calendar");
    const here = store.here();
    if (!here) {
        root.replaceChildren(el("p", "muted", "Set where you are on the Today tab first."));
        return;
    }
    month ||= localDate().slice(0, 7);
    chosen ||= localDate();
    root.replaceChildren(loading());
    await load(here);
    draw(root, here);
}

async function load(here) {
    const person = store.subject();
    const first = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const length = new Date(y, m, 0).getDate();
    const key = JSON.stringify([first, here.latitude, here.longitude, person?.id, person?.birth_date, person?.birth_time]);
    if (!cache.has(key)) {
        cache.set(
            key,
            post("/api/calendar", {
                place: placeBody(here),
                start: first,
                days: length,
                profile: store.hasBirthDate(person) ? store.toProfile(person) : null,
            }).catch((e) => {
                cache.delete(key);
                throw e;
            })
        );
    }
    try {
        days = (await cache.get(key)).days;
    } catch (e) {
        days = [];
        toast(e.message);
    }
}

function shiftMonth(by) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + by, 1);
    month = localDate(d).slice(0, 7);
    chosen = month === localDate().slice(0, 7) ? localDate() : `${month}-01`;
    render();
}

function draw(root, here) {
    const person = store.subject();
    const head = el("div", "month-head");
    const prev = button("‹", "icon-btn", () => shiftMonth(-1));
    prev.setAttribute("aria-label", "Previous month");
    const next = button("›", "icon-btn", () => shiftMonth(1));
    next.setAttribute("aria-label", "Next month");
    head.append(prev, el("h2", null, fmtDate(`${month}-01`, { month: "long", year: "numeric" })), next);

    const filters = el("div", "chip-scroll");
    for (const [kind, label] of KINDS) {
        if ((kind === "personal" || kind === "caution") && !store.hasBirthDate(person)) continue;
        const chip = button(label, "chip", () => {
            if (shown.has(kind)) shown.delete(kind);
            else shown.add(kind);
            draw(root, here);
        });
        chip.setAttribute("aria-pressed", String(shown.has(kind)));
        filters.append(chip);
    }

    const grid = el("div", "month-grid");
    for (const d of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) grid.append(el("div", "dow", d));
    const offset = parseDate(`${month}-01`).getDay();
    for (let i = 0; i < offset; i++) grid.append(el("div"));
    const today = localDate();
    for (const d of days) {
        const cell = button("", "day-cell", () => {
            chosen = d.date;
            draw(root, here);
        });
        if (d.date === today) cell.classList.add("today");
        if (d.date === chosen) cell.classList.add("chosen");
        if (d.tithi.number === 15) cell.classList.add("purnima");
        if (d.tithi.number === 30) cell.classList.add("amavasya");
        const items = d.items.filter((x) => shown.has(x.kind));
        cell.setAttribute("aria-label", `${fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })}, ${d.tithi.paksha} ${d.tithi.name}${items.length ? `: ${items.map((x) => x.name).join(", ")}` : ""}`);
        const dots = el("div", "dots");
        for (const kind of new Set(items.map((x) => x.kind))) dots.append(el("i", kind));
        cell.append(el("span", "num", String(Number(d.date.slice(8)))), el("span", "tithi", `${d.tithi.paksha[0]} ${d.tithi.name.slice(0, 5)}`), dots);
        grid.append(cell);
    }

    const calendarCard = el("section", "card");
    calendarCard.append(head, filters, el("br"), grid);
    root.replaceChildren(calendarCard, dayCard(here), agendaCard(), muhuratCard(here, person));
}

function itemRows(items) {
    const box = el("div");
    for (const item of items) {
        box.append(el("div", `item-name ${item.kind}`, item.name));
        if (item.note) box.append(el("div", "item-note", item.note));
    }
    return box;
}

function dayCard(here) {
    const d = days.find((x) => x.date === chosen) || days[0];
    const card = el("section", "card");
    if (!d) return card;
    card.append(
        el("h3", null, fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })),
        el("p", "muted", `${d.month ? `${d.month} masa · ` : ""}${d.tithi.paksha} ${d.tithi.name} · ${d.nakshatra} nakshatra · sunrise ${span(d.sunrise, d.sunset, here.timezone).replace(" – ", ", sunset ")}`)
    );
    const items = d.items.filter((x) => shown.has(x.kind));
    card.append(items.length ? itemRows(items) : el("p", "hint", "Nothing marked on this day."));
    if (d.date >= localDate()) {
        card.append(
            button("Ask about this day", "link-btn", () =>
                ctx.go("ask", { question: `What should I keep in mind on ${fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })}?` })
            )
        );
    }
    return card;
}

function agendaCard() {
    const card = el("section", "card");
    const head = el("div", "card-head");
    head.append(el("h3", null, "This month"), button("📅 Add to my calendar", "btn small ghost", exportIcs));
    card.append(head);
    const list = days.filter((d) => d.items.some((x) => shown.has(x.kind)));
    if (!list.length) card.append(el("p", "muted", "Nothing to show with these filters."));
    for (const d of list) {
        const row = el("div", "agenda-day");
        const chip = el("div", "date-chip");
        chip.append(el("b", null, String(Number(d.date.slice(8)))), el("small", null, fmtDate(d.date, { weekday: "short" })));
        row.append(chip, itemRows(d.items.filter((x) => shown.has(x.kind))));
        card.append(row);
    }
    card.append(el("p", "hint", "Festivals follow the most common observance times; your family calendar may differ by a day."));
    return card;
}

// An .ics file of this month's items, for any calendar app
function exportIcs() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Celestial//Panchang//EN", "CALSCALE:GREGORIAN"];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const escape = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    for (const d of days) {
        for (const item of d.items.filter((x) => shown.has(x.kind))) {
            const start = d.date.replace(/-/g, "");
            const end = localDateNext(d.date).replace(/-/g, "");
            lines.push(
                "BEGIN:VEVENT",
                `UID:${start}-${item.kind}-${encodeURIComponent(item.name).slice(0, 40)}@celestial`,
                `DTSTAMP:${stamp}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${escape(item.name)}`,
                item.note ? `DESCRIPTION:${escape(item.note)}` : null,
                "END:VEVENT"
            );
        }
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.filter(Boolean).join("\r\n")], { type: "text/calendar" });
    const file = new File([blob], `panchang-${month}.ics`, { type: "text/calendar" });
    if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file] }).catch(() => {});
        return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

function localDateNext(iso) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + 1);
    return localDate(d);
}

// --- Muhurat finder ---

let activity = "work";

function muhuratCard(here, person) {
    const card = el("section", "card");
    const select = el("select", "input");
    for (const [key, label] of ACTIVITIES) {
        const opt = el("option", null, label);
        opt.value = key;
        select.append(opt);
    }
    select.value = activity;
    select.addEventListener("change", () => (activity = select.value));
    const results = el("div");
    const forWhom = store.hasBirthDate(person) ? ` for ${person.name}` : "";
    card.append(
        el("h3", null, "Find a good time"),
        el("p", "hint", `The best days in the next two months${forWhom}, from the tithi, nakshatra, weekday${forWhom ? " and their birth Moon" : ""}, with the good hours of each day.`),
        el("br"),
        select,
        el("br"),
        button("Find muhurats", "btn wide", () => find(here, person, results)),
        results
    );
    return card;
}

async function find(here, person, results) {
    results.replaceChildren(loading("Looking through the coming days…"));
    let data;
    try {
        data = await post("/api/muhurat", {
            place: placeBody(here),
            start: localDate(),
            days: 60,
            activity,
            profile: store.hasBirthDate(person) ? store.toProfile(person) : null,
        });
    } catch (e) {
        results.replaceChildren(el("p", "error-text", e.message));
        return;
    }
    if (!data.days.length) {
        results.replaceChildren(el("p", "muted", "No strong days in the next two months; ask your jyotishi."));
        return;
    }
    const list = el("div");
    list.style.marginTop = "10px";
    for (const d of data.days) {
        const row = el("div", "muhurat-day");
        const title = el("div", "card-head");
        const stars = Math.max(1, Math.min(5, Math.round(d.score / 2)));
        title.append(el("strong", null, fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })), el("span", "stars", "★".repeat(stars)));
        const reasons = el("div", "reasons");
        reasons.append(el("div", "muted", `${d.tithi} · ${d.nakshatra}`));
        if (d.reasons.length) reasons.append(el("div", "good", `✓ ${d.reasons.join("; ")}`));
        if (d.cautions.length) reasons.append(el("div", "bad", `• ${d.cautions.join("; ")}`));
        const windows = el("div", "windows");
        for (const w of d.windows) windows.append(el("span", "chip", `${span(w.start, w.end, here.timezone)} · ${w.label.replace(" choghadiya", "")}`));
        row.append(title, reasons, windows, el("div", "item-note", `Avoid Rahu Kaal ${span(d.rahu_kaal.start, d.rahu_kaal.end, here.timezone)}`));
        list.append(row);
    }
    results.replaceChildren(
        list,
        el("p", "hint", "A starting point. For weddings, griha pravesh and other big ceremonies, confirm the muhurat with your jyotishi.")
    );
}
