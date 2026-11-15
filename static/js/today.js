// Today: the day as an almanac sees it, for where you are, and how it sits with the
// person the app is looking at.
import {
    el, button, svgEl, deva, fmtTime, span, fmtDate, localDate, ordinal, loading, toast, prefersReducedMotion,
} from "./util.js";
import * as store from "./store.js";
import { post, placeBody } from "./api.js";
import { openSheet, closeSheet } from "./sheet.js";
import { placePicker } from "./places.js";
import { openLightbox } from "./cards.js";
import { kolam } from "./kolam.js";
import * as sound from "./sound.js";

const $ = (id) => document.getElementById(id);
let ctx = null;
let day = null;
let timer = null;

export function init(context) {
    ctx = context;
}

export async function render() {
    const root = $("tab-today");
    clearInterval(timer);
    const here = store.here();
    if (!here) {
        root.replaceChildren(askForPlace());
        return;
    }
    root.replaceChildren(loading());
    const person = store.subject();
    try {
        day = await post("/api/day", {
            place: placeBody(here),
            local_date: localDate(),
            profile: store.hasBirthDate(person) ? store.toProfile(person) : null,
        });
    } catch (e) {
        root.replaceChildren(el("p", "error-text", e.message));
        return;
    }
    const tz = here.timezone;
    root.replaceChildren(
        hero(day, here),
        festivalBanner(day),
        wheelCard(day, tz),
        personalCard(day, person),
        panchangCard(day, tz),
        comingCard(day),
        dailyCardCard(day)
    );
    timer = setInterval(() => updateNow(tz), 60_000);
}

function askForPlace() {
    const box = el("div", "empty card");
    box.append(
        kolam({ petals: 8 }),
        el("h2", null, "Where are you today?"),
        el("p", "muted", "Sunrise, Rahu Kaal and the panchang depend on where you are."),
        button("Set your place", "btn", choosePlace)
    );
    return box;
}

function choosePlace() {
    let picked = null;
    const picker = placePicker({ label: "Where you are now", locate: true, onChange: (p) => (picked = p) });
    const save = button("Save", "btn wide", () => {
        if (!picked) return toast("Choose a place first");
        store.setHere(picked);
        closeSheet();
    });
    openSheet("Where are you?", [picker.node, el("br"), save]);
}

// --- The top of the page ---

function moonSvg(fraction) {
    const R = 16;
    const svg = svgEl("svg", { viewBox: "-18 -18 36 36", class: "moon-svg", "aria-hidden": "true" });
    svgEl("circle", { r: R, class: "moon-dark" }, svg);
    const k = Math.cos(2 * Math.PI * fraction);
    const rx = Math.abs(k) * R;
    const waxing = fraction < 0.5;
    const crescent = k > 0;
    const outer = waxing ? `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}` : `M0 ${-R}A${R} ${R} 0 0 0 0 ${R}`;
    const sweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
    svgEl("path", { d: `${outer}A${rx.toFixed(2)} ${R} 0 0 ${sweep} 0 ${-R}Z`, class: "moon-lit" }, svg);
    return svg;
}

function hero(d, here) {
    const box = el("div", "hero");
    const { tithi, vara } = d.panchang;
    const tithiName = [15, 30].includes(tithi.number) ? tithi.name : `${tithi.paksha} ${tithi.name}`;
    const tithiDeva = [15, 30].includes(tithi.number) ? tithi.devanagari : `${tithi.paksha_devanagari} ${tithi.devanagari}`;
    const dateLine = el("div", "date-line");
    dateLine.append(
        `${fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })} · ${vara.name} `,
        deva(vara.devanagari)
    );
    const name = el("div", "tithi-name");
    name.append(moonSvg(d.moon.fraction), " ", tithiName);
    const sub = el("div", "tithi-deva");
    sub.append(deva(tithiDeva), d.month ? ` · ${d.month} masa` : "");
    const place = el("div", "place-line");
    place.append(`📍 ${here.name}`, button(here.assumed ? "set where you are" : "change", "link-btn", choosePlace));
    box.append(dateLine, name, sub, place);
    return box;
}

function festivalBanner(d) {
    const items = d.today.filter((i) => ["festival", "fast", "sankranti"].includes(i.kind));
    if (!items.length) return document.createComment("no festival today");
    const box = el("div", "festival-banner");
    const text = el("div");
    text.append(el("strong", null, items.map((i) => i.name).join(" · ")));
    const notes = items.map((i) => i.note).filter(Boolean);
    if (notes.length) text.append(el("div", "item-note", notes.join("; ")));
    box.append(el("span", "diya-icon", "🪔"), text);
    return box;
}

// --- The day wheel ---
// Sunrise on the left, sunset on the right; the day's eight choghadiyas arc over the
// top and the night's under the bottom. Rahu Kaal and the other periods ride outside.

const R_OUT = 128;
const R_IN = 92;
const R_KAAL = 142;

function angleOf(time, d) {
    const t = new Date(time).getTime();
    const rise = new Date(d.sunrise).getTime();
    const set = new Date(d.sunset).getTime();
    const next = new Date(d.next_sunrise).getTime();
    if (t < rise || t > next) return null;
    if (t <= set) return Math.PI - ((t - rise) / (set - rise)) * Math.PI;
    return -((t - set) / (next - set)) * Math.PI;
}

const pt = (a, r) => [r * Math.cos(a), -r * Math.sin(a)];
const f = (n) => n.toFixed(2);

function sector(a1, a2, r1, r2) {
    const large = a1 - a2 > Math.PI ? 1 : 0;
    const [x1, y1] = pt(a1, r2);
    const [x2, y2] = pt(a2, r2);
    const [x3, y3] = pt(a2, r1);
    const [x4, y4] = pt(a1, r1);
    return `M${f(x1)} ${f(y1)}A${r2} ${r2} 0 ${large} 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 ${large} 0 ${f(x4)} ${f(y4)}Z`;
}

function arc(a1, a2, r) {
    const [x1, y1] = pt(a1, r);
    const [x2, y2] = pt(a2, r);
    return `M${f(x1)} ${f(y1)}A${r} ${r} 0 ${a1 - a2 > Math.PI ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
}

function wheelCard(d, tz) {
    const card = el("section", "card");
    const head = el("div", "card-head");
    head.append(el("h3", null, "The day"), el("span", "muted", `Sunrise ${fmtTime(d.sunrise, tz)} · Sunset ${fmtTime(d.sunset, tz)}`));

    const svg = svgEl("svg", { viewBox: "-165 -165 330 330", class: "day-wheel", id: "day-wheel", role: "img" });
    svg.setAttribute("aria-label", "The day wheel: choghadiyas from sunrise to the next sunrise, with Rahu Kaal marked");
    svgEl("line", { x1: -158, y1: 0, x2: 158, y2: 0, class: "horizon" }, svg);
    for (const c of d.periods.choghadiya) {
        const a1 = angleOf(c.start, d);
        const a2 = angleOf(c.end, d);
        if (a1 === null || a2 === null) continue;
        const seg = svgEl("path", { d: sector(a1, a2, R_IN, R_OUT), class: `chog ${c.quality}${c.part === "night" ? " night" : ""}` }, svg);
        seg.dataset.start = c.start;
        seg.dataset.end = c.end;
        const title = svgEl("title", {}, seg);
        title.textContent = `${c.name} (${c.part}): ${span(c.start, c.end, tz)}`;
        seg.addEventListener("click", () => toast(`${c.name}, ${span(c.start, c.end, tz)}: ${c.meaning}`, 4200));
        // Name each segment
        const mid = (a1 + a2) / 2;
        const [lx, ly] = pt(mid, (R_IN + R_OUT) / 2);
        const label = svgEl("text", { x: f(lx), y: f(ly + 3), "text-anchor": "middle", class: "wheel-label" }, svg);
        label.textContent = c.name;
        label.style.pointerEvents = "none";
    }
    const kaals = [
        ["rahu_kaal", "rahu", "Rahu Kaal"],
        ["yamaganda", "yama", "Yamaganda"],
        ["gulika", "gulika", "Gulika"],
        ["abhijit", "abhijit", "Abhijit"],
    ];
    for (const [key, cls] of kaals) {
        const p = d.periods[key];
        if (!p) continue;
        svgEl("path", { d: arc(angleOf(p.start, d), angleOf(p.end, d), R_KAAL), class: `kaal ${cls}` }, svg);
    }
    const sr = svgEl("text", { x: -150, y: 16, class: "wheel-label", "text-anchor": "start" }, svg);
    sr.textContent = "sunrise";
    const ss = svgEl("text", { x: 150, y: 16, class: "wheel-label", "text-anchor": "end" }, svg);
    ss.textContent = "sunset";

    const marker = svgEl("g", { class: "now-marker", id: "now-marker" }, svg);
    svgEl("circle", { r: 9, class: "now-sun", id: "now-dot" }, marker);
    const centre = svgEl("g", { id: "wheel-centre" }, svg);
    svgEl("text", { y: -8, "text-anchor": "middle", class: "center-name", id: "now-name" }, centre);
    svgEl("text", { y: 12, "text-anchor": "middle", class: "center-sub", id: "now-sub" }, centre);
    svgEl("text", { y: 30, "text-anchor": "middle", class: "center-alert", id: "now-alert" }, centre);

    const legend = el("div", "wheel-legend");
    for (const [colour, label] of [
        ["var(--leaf)", "good"],
        ["var(--haldi)", "neutral"],
        ["var(--caution)", "avoid"],
        ["var(--kumkum)", "Rahu Kaal"],
        ["var(--haldi)", "Abhijit"],
    ]) {
        const item = el("span");
        const swatch = el("i");
        swatch.style.background = colour;
        item.append(swatch, label);
        legend.append(item);
    }

    const periods = el("div", "periods");
    for (const [key, cls, label] of kaals) {
        const p = d.periods[key];
        const box = el("div", `period ${cls}`);
        box.append(el("div", "label", label), el("div", "time", p ? span(p.start, p.end, tz) : "Not today (Wednesday)"));
        periods.append(box);
    }
    const wrap = el("div", "wheel-wrap");
    wrap.append(svg);
    card.append(head, wrap, legend, el("br"), periods);
    // After it is in the page
    requestAnimationFrame(() => updateNow(tz));
    return card;
}

function updateNow(tz) {
    if (!day || !$("now-marker")) return;
    const now = new Date();
    const a = angleOf(now, day);
    const marker = $("now-marker");
    const nameNode = $("now-name");
    const sub = $("now-sub");
    const alert = $("now-alert");
    for (const seg of document.querySelectorAll("#day-wheel .chog")) {
        seg.classList.toggle("current", new Date(seg.dataset.start) <= now && now < new Date(seg.dataset.end));
    }
    if (a === null) {
        marker.setAttribute("visibility", "hidden");
        nameNode.textContent = now < new Date(day.sunrise) ? "Before dawn" : "A new day";
        sub.textContent = `Sunrise ${fmtTime(day.sunrise, tz)}`;
        alert.textContent = "";
        return;
    }
    const [x, y] = pt(a, (R_IN + R_OUT) / 2);
    marker.setAttribute("visibility", "visible");
    marker.setAttribute("transform", `translate(${f(x)} ${f(y)})`);
    $("now-dot").setAttribute("class", a >= 0 ? "now-sun" : "now-moon");
    const current = day.periods.choghadiya.find((c) => new Date(c.start) <= now && now < new Date(c.end));
    nameNode.textContent = current ? current.name : "";
    sub.textContent = current ? `${current.quality === "bad" ? "avoid new starts" : current.meaning.split(":")[0]} · till ${fmtTime(current.end, tz)}` : "";
    const rahu = day.periods.rahu_kaal;
    const [rs, re] = [new Date(rahu.start), new Date(rahu.end)];
    if (now >= rs && now < re) alert.textContent = `Rahu Kaal now, till ${fmtTime(rahu.end, tz)}`;
    else if (now < rs) alert.textContent = `Rahu Kaal ${span(rahu.start, rahu.end, tz)}`;
    else alert.textContent = "Rahu Kaal is over";
}

// --- For the person ---

const MOODS = { good: "A good day", mixed: "A mixed day", testing: "A day for patience", caution: "Go gently" };

function personalCard(d, person) {
    const card = el("section", "card");
    if (!person) {
        card.append(
            el("h3", null, "For you"),
            el("p", "muted", "Add yourself in Family to see how each day sits with your birth Moon."),
            button("Add yourself", "btn small", () => ctx.go("family", { add: true }))
        );
        return card;
    }
    if (!d.personal) {
        card.append(
            el("h3", null, `For ${person.name}`),
            el(
                "p",
                "muted",
                store.hasBirthDate(person)
                    ? "The birth Moon is uncertain without a birth time; add one in Family to see the day for them."
                    : "Add a birth date in Family to see how today sits with them."
            ),
            button("Open in Family", "btn small ghost", () => ctx.go("family", { person: person.id }))
        );
        return card;
    }
    const p = d.personal;
    const head = el("div", "mood-head");
    head.append(el("h3", null, `For ${person.name}`), el("span", `badge ${p.mood}`, MOODS[p.mood]));
    const facts = el("div", "facts");
    const fact = (label, value) => {
        const node = el("span", "fact");
        node.append(`${label} `, el("strong", null, value));
        facts.append(node);
    };
    fact("Moon in", `${ordinal(p.moon_house)} from birth Moon`);
    fact("Tara", p.tara);
    if (d.dasha) fact("Dasha", `${d.dasha.mahadasha}–${d.dasha.antardasha}`);
    if (d.sade_sati) fact("Sade Sati", `${d.sade_sati.phase} phase`);
    const ask = button("Ask about today", "btn small", () =>
        ctx.go("ask", { question: `How is today for ${person.relation === "self" ? "me" : person.name}, and what should I keep in mind?` })
    );
    const actions = el("div", "reading-actions");
    actions.append(ask);
    card.append(head, el("p", "guidance", p.guidance), facts, actions);
    return card;
}

function limb(label, name, devanagari, ...details) {
    const row = el("div", "limb");
    const value = el("div", "limb-name");
    value.append(name, deva(devanagari));
    row.append(el("div", "limb-label", label), value);
    for (const text of details.filter(Boolean)) row.append(el("div", "limb-detail", text));
    return row;
}

function panchangCard(d, tz) {
    const { tithi, vara, nakshatra, yoga, karana } = d.panchang;
    const card = el("section", "card");
    const head = el("div", "card-head");
    const title = el("h3", null, "Panchang ");
    title.append(deva("पञ्चाङ्ग"));
    head.append(title, el("span", "muted", "at sunrise"));
    const tithiName = [15, 30].includes(tithi.number) ? tithi.name : `${tithi.paksha} ${tithi.name}`;
    const until = (iso) => {
        const end = new Date(iso);
        const same = end.toDateString() === new Date(d.sunrise).toDateString();
        return `until ${fmtTime(iso, tz)}${same ? "" : `, ${end.toLocaleDateString(undefined, { weekday: "short", timeZone: tz })}`}`;
    };
    const limbs = el("div", "limbs");
    limbs.append(
        limb("Tithi", tithiName, tithi.devanagari, `${tithi.paksha_meaning}, ${until(d.panchang.tithi_ends)}`),
        limb("Vara", vara.name, vara.devanagari, `the day of ${vara.lord}`),
        limb("Nakshatra", nakshatra.name, nakshatra.devanagari, `${until(d.panchang.nakshatra_ends)} · ${nakshatra.theme}`),
        limb("Yoga", yoga.name, yoga.devanagari, `“${yoga.meaning}”${yoga.inauspicious ? ", a testing yoga" : ""}`),
        limb("Karana", karana.name, karana.devanagari, karana.bhadra ? "Bhadra: avoided for new beginnings" : null)
    );
    card.append(head, limbs);
    if (d.approximate) card.append(el("p", "hint", "The Sun doesn't rise or set here today, so 6 am and 6 pm stand in."));
    return card;
}

function comingCard(d) {
    const card = el("section", "card");
    card.append(el("h3", null, "Coming up this week"));
    if (!d.coming.length) {
        card.append(el("p", "muted", "No festivals or fasts in the next week."));
        return card;
    }
    for (const c of d.coming) {
        const row = el("div", "coming-day");
        const chip = el("div", "date-chip");
        chip.append(el("b", null, String(Number(c.date.slice(8, 10)))), el("small", null, fmtDate(c.date, { weekday: "short" })));
        const items = el("div");
        for (const item of c.items) {
            items.append(el("div", `item-name ${item.kind}`, item.name));
            if (item.note) items.append(el("div", "item-note", item.note));
        }
        row.append(chip, items);
        card.append(row);
    }
    card.append(button("Open the calendar", "link-btn", () => ctx.go("calendar")));
    return card;
}

function dailyCardCard(d) {
    const card = el("section", "card");
    const c = d.daily_card;
    const flip = button("", "daily-card");
    flip.setAttribute("aria-label", "Turn over your card for today");
    if (c.orientation === "reversed") flip.classList.add("reversed");
    const inner = el("div", "card-inner");
    const back = el("div", "card-face card-back-art");
    const front = el("div", "card-face card-front");
    const img = el("img");
    img.src = c.image;
    img.alt = "";
    front.append(img);
    inner.append(back, front);
    flip.append(inner);
    const text = el("div");
    const name = el("h3", null, "A card for today");
    const meaning = el("p", "muted", "Tap the card to turn it over.");
    text.append(name, meaning);
    flip.addEventListener("click", () => {
        if (flip.classList.contains("is-flipped")) return openLightbox(c);
        flip.classList.add("is-flipped");
        sound.flip();
        setTimeout(
            () => {
                name.textContent = `${c.card}${c.orientation === "reversed" ? " (reversed)" : ""}`;
                meaning.textContent = c.meaning;
                flip.setAttribute("aria-label", `${c.card}. Show it larger.`);
            },
            prefersReducedMotion() ? 0 : 400
        );
    });
    const row = el("div", "daily");
    row.append(flip, text);
    card.append(row);
    return card;
}

export function stop() {
    clearInterval(timer);
}
