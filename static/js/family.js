// Family: everyone whose chart the app keeps (on this device only), each person's
// jataka and traits, and kundali matching between two people.
import { el, button, avatar, deva, fmtDate, loading, toast, svgEl, sleep, prefersReducedMotion } from "./util.js";
import * as store from "./store.js";
import { post, insightsFor } from "./api.js";
import { openSheet, closeSheet, confirmSheet } from "./sheet.js";
import { placePicker } from "./places.js";
import { chartSection, jatakaSections } from "./jataka.js";
import { openLightbox } from "./cards.js";
import { kolam } from "./kolam.js";
import { printNode, shareText } from "./share.js";

const $ = (id) => document.getElementById(id);
let ctx = null;
let view = { kind: "list" };

export function init(context) {
    ctx = context;
}

export function render(options = {}) {
    if (options.person) view = { kind: "person", id: options.person };
    else if (options.match) view = { kind: "match" };
    else if (!options.keep) view = { kind: "list" };
    if (options.add) openForm(null);
    if (options.edit) openForm(store.person(options.edit));
    draw();
}

function draw() {
    const root = $("tab-family");
    if (view.kind === "person" && store.person(view.id)) return drawPerson(root, store.person(view.id));
    if (view.kind === "match") return drawMatch(root);
    drawList(root);
}

// --- The list ---

async function summaryLine(person, node) {
    if (!store.hasBirthDate(person)) {
        node.textContent = "Add a birth date to see their chart";
        return;
    }
    try {
        const { insights } = await insightsFor(person);
        const v = insights?.vedic;
        const bits = [];
        if (v?.rashi?.name) bits.push(`${v.rashi.name} rashi`);
        if (v?.nakshatra?.name) bits.push(v.nakshatra.name);
        const now = insights?.jataka?.dasha?.current;
        if (now) bits.push(`${now.mahadasha.lord}–${now.antardasha.lord} dasha`);
        if (insights?.timeline?.sade_sati?.current) bits.push("Sade Sati");
        node.textContent = bits.join(" · ") || "Birth time and place show more";
    } catch {
        node.textContent = "";
    }
}

function drawList(root) {
    const people = store.people();
    const subject = store.subject();
    const parts = [];
    if (!people.length) {
        const empty = el("div", "empty card");
        empty.append(
            kolam(),
            el("h2", null, "Start with yourself"),
            el("p", "muted", "Add your birth details, then your family's. Everything stays on this device."),
            button("Add yourself", "btn", () => openForm(null, { relation: "self" }))
        );
        root.replaceChildren(empty);
        return;
    }
    const list = el("div", "people");
    for (const p of people) {
        const card = button("", `person-card${subject?.id === p.id ? " selected" : ""}`, () => {
            view = { kind: "person", id: p.id };
            draw();
        });
        const text = el("div", "grow");
        const meta = el("div", "meta", "…");
        text.append(el("div", "name", `${p.name}${p.relation ? ` · ${store.relationLabel(p.relation)}` : ""}`), meta);
        card.append(avatar(p, "avatar big"), text, el("span", "muted", "›"));
        summaryLine(p, meta);
        list.append(card);
    }
    const actions = el("div", "action-row");
    actions.style.marginTop = "14px";
    actions.append(
        button("+ Add someone", "btn", () => openForm(null)),
        button("💍 Match two charts", "btn ghost", () => {
            view = { kind: "match" };
            draw();
        })
    );
    parts.push(list, actions, el("p", "hint", "Birth details stay on this device. Only derived signs and numbers reach the reader."));
    root.replaceChildren(...parts);
}

// --- A person ---

function tile(label, value, devanagari) {
    const box = el("div", "tile");
    if (devanagari) box.append(deva(devanagari));
    box.append(el("div", "tile-value", value), el("div", "tile-label", label));
    return box;
}

async function drawPerson(root, person) {
    const back = button("‹ Family", "back-btn", () => {
        view = { kind: "list" };
        draw();
    });
    const head = el("div", "person-head");
    const title = el("div");
    const born = [
        person.birth_date && fmtDate(person.birth_date),
        person.birth_time,
        person.place?.name,
    ].filter(Boolean);
    title.append(
        el("h2", null, person.name),
        el("div", "muted", [store.relationLabel(person.relation), ...born].filter(Boolean).join(" · "))
    );
    head.append(avatar(person, "avatar big"), title);

    const actions = el("div", "action-row no-print");
    actions.append(
        button("Ask about them", "btn small", () => {
            store.setSubject(person.id);
            ctx.go("ask");
        }),
        button("Timeline", "btn small ghost", () => {
            store.setSubject(person.id);
            ctx.go("timeline");
        }),
        button("Edit", "btn small ghost", () => openForm(person))
    );
    const body = el("div", "stack");
    root.replaceChildren(back, head, actions, body);

    if (!store.hasBirthDate(person)) {
        body.append(el("p", "muted", "Add a birth date to see their rashi, nakshatra and numbers; add the time and place for the full jataka."));
        return;
    }
    body.append(loading());
    let data;
    try {
        data = await insightsFor(person);
    } catch (e) {
        body.replaceChildren(el("p", "error-text", e.message));
        return;
    }
    const insights = data.insights;
    body.replaceChildren();
    if (!insights) {
        body.append(el("p", "muted", "This birth date is outside what the app can read (1900–2099)."));
        return;
    }
    const v = insights.vedic;

    // Vedic basics
    const basics = el("section", "card");
    const tiles = el("div", "tiles");
    const rashi = v?.rashi?.name ? v.rashi : null;
    const nak = v?.nakshatra?.name ? v.nakshatra : null;
    tiles.append(
        tile("Rashi (Moon)", rashi ? rashi.name : (v?.rashi?.alternatives || []).join(" / "), rashi?.devanagari),
        tile("Nakshatra", nak ? `${nak.name}${nak.pada ? ` ${nak.pada}` : ""}` : (v?.nakshatra?.alternatives || []).join(" / "), nak?.devanagari),
        tile("Lagna", v?.lagna?.name || "needs time & place", v?.lagna?.devanagari)
    );
    basics.append(el("h3", null, "In the Vedic sky"), el("br"), tiles);
    if (nak?.deity) basics.append(el("p", "hint", `${nak.name}: deity ${nak.deity}, symbol ${nak.symbol}, ruled by ${nak.lord}; a nakshatra of ${nak.theme}.`));
    if (!rashi || !nak) basics.append(el("p", "hint", "The Moon moved that day; a birth time settles it."));
    body.append(basics);

    // The jataka
    if (insights.jataka) {
        const chartCard = el("section", "card");
        chartCard.append(chartSection(insights.jataka, `${person.name} · ${insights.jataka.lagna.name} lagna`), ...jatakaSections(insights.jataka));
        const print = button("🖨 Print or save as PDF for the jyotishi", "link-btn no-print", () => printNode(printable(person, chartCard)));
        chartCard.append(print);
        body.append(chartCard);
    } else {
        const hint = el("section", "card");
        hint.append(
            el("h3", null, "The full jataka"),
            el("p", "muted", "Add the birth time and place to see the chart, dashas, doshas and yogas."),
            button("Add them", "btn small", () => openForm(person))
        );
        body.append(hint);
    }

    // Western signs, numbers and personal cards
    const more = el("section", "card");
    const west = el("div", "tiles");
    const sign = (p) => (p ? (p.alternatives ? p.alternatives.join(" / ") : p.sign) : "—");
    west.append(tile("Sun", sign(insights.sun)), tile("Moon", sign(insights.moon)), tile("Rising", sign(insights.rising)));
    const n = insights.numerology;
    const numbers = el("div", "tiles");
    numbers.style.marginTop = "8px";
    numbers.append(
        tile("Moolank", `${n.moolank.number}`, null),
        tile("Bhagyank", `${n.bhagyank.number}`, null),
        tile("Life path", `${insights.life_path}`, null)
    );
    more.append(el("h3", null, "Signs and numbers"), el("br"), west, numbers);
    more.append(
        el(
            "p",
            "hint",
            `Moolank ${n.moolank.number} (${n.moolank.graha}), Bhagyank ${n.bhagyank.number} (${n.bhagyank.graha}). ` +
                `Personal year ${insights.personal_year}: ${insights.personal_year_theme}.` +
                (n.lo_shu.missing.length ? ` Missing from the Lo Shu grid: ${n.lo_shu.missing.join(", ")}.` : "")
        )
    );
    const cards = el("div", "chip-row");
    cards.style.marginTop = "8px";
    for (const c of insights.personal_cards) {
        cards.append(button(`🃏 ${c.card}`, "chip", () => openLightbox({ ...c, position: c.reason, orientation: "upright" })));
    }
    more.append(el("p", "hint", "Their cards (birth card and sign cards):"), cards);
    body.append(more);

    const remove = button(`Remove ${person.name} from this device`, "link-btn danger no-print", async () => {
        if (await confirmSheet(`Remove ${person.name}?`, "Their details and readings stay only on this device; this removes them.", "Remove", true)) {
            store.removePerson(person.id);
            view = { kind: "list" };
            draw();
        }
    });
    body.append(remove);
}

function printable(person, chartCard) {
    const page = el("div");
    page.append(
        el("h1", null, `Jataka of ${person.name}`),
        el(
            "p",
            null,
            [person.birth_date && fmtDate(person.birth_date, { day: "numeric", month: "long", year: "numeric" }), person.birth_time, person.place?.name]
                .filter(Boolean)
                .join(" · ")
        ),
        chartCard.cloneNode(true)
    );
    // Open every dasha so the whole timeline prints
    for (const d of page.querySelectorAll("details")) d.open = true;
    return page;
}

// --- The add / edit form ---

export function openForm(person, preset = {}) {
    const isNew = !person;
    const data = person ? { ...person } : { relation: store.self() ? "other" : "self", ...preset };
    const form = el("form", "form");
    const field = (label, input, note) => {
        const wrap = el("label", "field");
        wrap.append(label);
        if (note) wrap.append(el("em", null, note));
        wrap.append(input);
        return wrap;
    };
    const name = el("input");
    name.required = true;
    name.maxLength = 40;
    name.value = data.name || "";
    const relation = el("select");
    for (const [key, label] of store.RELATIONS) {
        const opt = el("option", null, label);
        opt.value = key;
        relation.append(opt);
    }
    relation.value = data.relation || "other";
    const date = el("input");
    date.type = "date";
    date.min = "1900-01-03";
    date.value = data.birth_date || "";
    const timeInput = el("input");
    timeInput.type = "time";
    timeInput.value = data.birth_time || "";
    let place = data.place || null;
    const picker = placePicker({ value: place, label: "Birth place", onChange: (p) => (place = p) });

    const row = el("div", "field-row");
    row.append(field("Date of birth", date), field("Birth time", timeInput, "as on the birth certificate"));
    const save = el("button", "btn wide", isNew ? "Save" : "Save changes");
    save.type = "submit";
    form.append(
        field("Name", name),
        field("Who are they to you?", relation),
        row,
        picker.node,
        el("p", "hint", "Time and place make the full jataka possible: lagna, houses, dashas and doshas."),
        save
    );
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!name.value.trim()) return name.focus();
        const saved = store.savePerson({
            ...data,
            name: name.value.trim().slice(0, 40),
            relation: relation.value,
            birth_date: date.value || null,
            birth_time: timeInput.value || null,
            place,
        });
        if (isNew && !store.subject()) store.setSubject(saved.id);
        closeSheet();
        toast(isNew ? `${saved.name} added` : "Saved");
        view = { kind: "person", id: saved.id };
        if (ctx.current() === "family") draw();
    });
    openSheet(isNew ? "Add someone" : `Edit ${person.name}`, form);
}

// --- Kundali matching ---

let match = { bride: null, groom: null };

function personSelect(label, key) {
    const wrap = el("label", "field");
    const select = el("select");
    const none = el("option", null, "Choose…");
    none.value = "";
    select.append(none);
    for (const p of store.people().filter((x) => x.birth_date)) {
        const opt = el("option", null, `${p.name}${p.relation ? ` (${store.relationLabel(p.relation)})` : ""}`);
        opt.value = p.id;
        select.append(opt);
    }
    select.value = match[key] || "";
    select.addEventListener("change", () => (match[key] = select.value || null));
    wrap.append(label, select);
    return wrap;
}

function drawMatch(root) {
    const back = button("‹ Family", "back-btn", () => {
        view = { kind: "list" };
        draw();
    });
    const card = el("section", "card");
    const row = el("div", "field-row");
    row.append(personSelect("Bride (kanya)", "bride"), personSelect("Groom (vara)", "groom"));
    const result = el("div");
    const go = button("Match", "btn wide", () => runMatch(result));
    card.append(
        el("h2", null, "Kundali matching"),
        el("p", "muted", "Ashtakoota guna milan: the 36-point match of the two birth Moons."),
        el("br"),
        row,
        el("br"),
        go,
        button("+ Add a proposal's details", "link-btn", () => openForm(null, { relation: "proposal" }))
    );
    root.replaceChildren(back, card, result);
}

function scoreRing(total) {
    const svg = svgEl("svg", { viewBox: "0 0 120 120", class: "score-ring", role: "img", "aria-label": `${total} of 36 gunas` });
    const r = 50;
    const length = 2 * Math.PI * r;
    svgEl("circle", { cx: 60, cy: 60, r, class: "track" }, svg);
    const fill = svgEl("circle", { cx: 60, cy: 60, r, class: "fill", "stroke-dasharray": length, "stroke-dashoffset": length }, svg);
    const score = svgEl("text", { x: 60, y: 64, "text-anchor": "middle", class: "score" }, svg);
    const of = svgEl("text", { x: 60, y: 82, "text-anchor": "middle", class: "of" }, svg);
    of.textContent = "of 36";
    score.textContent = "0";
    // Fill the ring and count up
    requestAnimationFrame(() => fill.setAttribute("stroke-dashoffset", length * (1 - total / 36)));
    (async () => {
        if (prefersReducedMotion()) {
            score.textContent = String(total);
            return;
        }
        const steps = 30;
        for (let i = 1; i <= steps; i++) {
            score.textContent = String(Math.round((total * i) / steps * 2) / 2);
            await sleep(40);
        }
    })();
    return svg;
}

async function runMatch(result) {
    const bride = store.person(match.bride);
    const groom = store.person(match.groom);
    if (!bride || !groom) return toast("Choose both people");
    if (bride.id === groom.id) return toast("Choose two different people");
    result.replaceChildren(loading("Comparing the two Moons…"));
    let m;
    try {
        m = await post("/api/match", { bride: store.toProfile(bride), groom: store.toProfile(groom) });
    } catch (e) {
        result.replaceChildren(el("p", "error-text", e.message));
        return;
    }
    const card = el("section", "card");
    card.style.marginTop = "14px";
    const top = el("div", "score-wrap");
    const verdict = el("div");
    verdict.append(el("h3", null, `${bride.name} & ${groom.name}`), el("p", null, m.verdict));
    if (m.approximate) verdict.append(el("p", "hint", "Without both birth times, the Moon's position is approximate."));
    top.append(scoreRing(m.total), verdict);
    card.append(top);

    const list = el("div");
    list.style.marginTop = "12px";
    for (const k of m.kootas) {
        const row = el("div", "koota");
        const name = el("div");
        name.append(el("strong", null, k.name), el("span", "muted", ` · ${k.meaning}`));
        row.append(name, el("strong", null, `${k.score} / ${k.max}`));
        const bar = el("div", "bar");
        const fill = el("i", k.score / k.max < 0.5 ? "low" : null);
        fill.style.width = `${(k.score / k.max) * 100}%`;
        bar.append(fill);
        row.append(bar, el("div", "who", `${bride.name}: ${k.bride} · ${groom.name}: ${k.groom}`));
        list.append(row);
    }
    card.append(list);

    if (m.doshas.length) {
        card.append(el("h3", "jataka-heading", "Doshas in the match"));
        for (const d of m.doshas) {
            const box = el("div", "dosha present");
            box.append(el("div", "dosha-name", d.name), el("p", "dosha-detail", d.detail));
            if (d.cancellations.length) box.append(el("p", "dosha-cancel", `Eased: ${d.cancellations.join("; ")}.`));
            card.append(box);
        }
    }
    const mangal = el("div", "facts");
    for (const [label, d, p] of [["Bride", m.mangal.bride, bride], ["Groom", m.mangal.groom, groom]]) {
        const fact = el("span", "fact");
        fact.append(`${p.name}: `, el("strong", null, d ? `Mangal dosha ${d.status === "absent" ? "not present" : d.status}` : "Mangal dosha needs birth time & place"));
        mangal.append(fact);
    }
    card.append(el("h3", "jataka-heading", "Mangal dosha"), mangal);
    card.append(
        el("p", "hint", "Guna milan is one part of matching; families traditionally ask their jyotishi to read both charts in full.")
    );
    const actions = el("div", "reading-actions");
    actions.append(
        button("Ask the reader about this match", "btn small", () => {
            store.setSubject(groom.relation === "self" || groom.relation === "son" || groom.relation === "brother" ? groom.id : bride.id);
            ctx.go("ask", {
                topic: "marriage",
                question: `${bride.name} and ${groom.name} match ${m.total} of 36 gunas${m.doshas.length ? `, with ${m.doshas.map((d) => d.name).join(" and ")}` : ""}. What should we understand about this match?`,
            });
        }),
        button("Share", "btn small ghost", () =>
            shareText(
                "Kundali matching",
                `${bride.name} & ${groom.name}: ${m.total}/36 gunas. ${m.verdict}\n` +
                    m.kootas.map((k) => `${k.name}: ${k.score}/${k.max}`).join("\n")
            )
        )
    );
    card.append(actions);
    result.replaceChildren(card);
}
