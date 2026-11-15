// The jataka: a Vedic birth chart, drawn in the South Indian style, with the dashas,
// Shani's transits around the Moon, gochar, doshas and yogas. The server works it out
// from the birth details; the full chart is shown only on this device (the reader gets
// a summary in words).
import { el, sleep, prefersReducedMotion, deva, ordinal, parseDate, monthYear } from "./util.js";

// South Indian chart: the rashis sit in fixed boxes around the edge, Meena top-left,
// running clockwise. [row, column] for each sign index (Mesha = 0).
const SOUTH_CELLS = {
    11: [1, 1], 0: [1, 2], 1: [1, 3], 2: [1, 4],
    10: [2, 1], 3: [2, 4],
    9: [3, 1], 4: [3, 4],
    8: [4, 1], 7: [4, 2], 6: [4, 3], 5: [4, 4],
};
const RASHI_NAMES = [
    "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
    "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
];
const VARGAS = {
    rasi: { title: "Rasi", devanagari: "राशि" },
    navamsa: { title: "Navamsa", devanagari: "नवांश" },
};
const STATUS_LABELS = { present: "Present", mild: "Mild", cancelled: "Cancelled", absent: "Not present" };

const fullDate = (iso) =>
    parseDate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const span = (p) => `${monthYear(p.start)} – ${monthYear(p.end)}`;

// 12.34 -> "12°20′"
function dms(degree) {
    const whole = Math.floor(degree);
    return `${whole}°${String(Math.floor((degree - whole) * 60)).padStart(2, "0")}′`;
}

// --- The South Indian chart ---

// varga: "rasi" or "navamsa". lords: graha keys to light up (the running dasha).
// caption: a line in the middle. pending: grahas start hidden, for revealChart.
export function southChart(jataka, { varga = "rasi", lords = [], caption = null, pending = false } = {}) {
    const signOf = (g) => (varga === "navamsa" ? g.navamsa : g.sign);
    const lagnaSign = varga === "navamsa" ? jataka.lagna.navamsa : jataka.lagna.sign;
    const chart = el("div", "south-chart");
    chart.setAttribute("role", "img");

    const described = [`Lagna in ${RASHI_NAMES[lagnaSign]}`];
    for (let sign = 0; sign < 12; sign++) {
        const [row, col] = SOUTH_CELLS[sign];
        const cell = el("div", "chart-house");
        cell.style.gridRow = row;
        cell.style.gridColumn = col;
        if (sign === lagnaSign) {
            cell.classList.add("lagna");
            cell.append(el("span", "chart-graha chart-lagna", "La"));
        }
        for (const g of jataka.grahas.filter((x) => signOf(x) === sign)) {
            const item = el("span", "chart-graha", g.short);
            item.title = `${g.name}${g.retrograde && !["rahu", "ketu"].includes(g.key) ? ", retrograde" : ""}`;
            if (lords.includes(g.key)) item.classList.add("lord");
            if (pending) item.classList.add("pending");
            if (g.retrograde && !["rahu", "ketu"].includes(g.key)) item.append(el("sup", null, "R"));
            if (varga === "rasi") item.append(el("small", "chart-degree", `${Math.floor(g.degree)}°`));
            cell.append(item);
            described.push(`${g.name} in ${RASHI_NAMES[sign]}`);
        }
        cell.append(el("span", "chart-sign", RASHI_NAMES[sign]));
        chart.append(cell);
    }

    const centre = el("div", "chart-centre");
    centre.append(el("div", "chart-title", VARGAS[varga].title), deva(VARGAS[varga].devanagari, "deva chart-deva"));
    if (caption) centre.append(el("div", "chart-caption", caption));
    chart.append(centre);
    chart.setAttribute("aria-label", `South Indian ${VARGAS[varga].title} chart. ${described.join(", ")}.`);
    return chart;
}

export const lordKeys = (jataka, names) =>
    names.map((name) => jataka.grahas.find((g) => g.name === name)?.key).filter(Boolean);

// On the table, after a jataka reading: the grahas take their places one by one,
// with the running dasha lords lit. onPlace(i) as each graha appears.
export async function revealJataka(tray, legend, jataka, dasha, { onPlace } = {}) {
    const reduced = prefersReducedMotion();
    const names = [dasha.mahadasha, dasha.antardasha].filter(Boolean);
    tray.className = "cards-tray layout-jataka";
    const chart = southChart(jataka, {
        lords: lordKeys(jataka, names),
        caption: names.join(" · "),
        pending: !reduced,
    });
    tray.replaceChildren(chart);
    legend.replaceChildren(
        el(
            "li",
            "jataka-legend",
            [
                dasha.mahadasha && `${dasha.mahadasha} mahadasha`,
                dasha.antardasha && `${dasha.antardasha} antardasha`,
                dasha.pratyantardasha && `${dasha.pratyantardasha} pratyantardasha`,
            ]
                .filter(Boolean)
                .join(" · ")
        )
    );
    if (reduced) return;
    const items = [...chart.querySelectorAll(".chart-graha.pending")];
    for (const [i, item] of items.entries()) {
        await sleep(260);
        item.classList.remove("pending");
        onPlace?.(i);
    }
    await sleep(400);
}

// --- The full jataka, section by section ---

function heading(text, devanagari) {
    const h = el("h3", "jataka-heading", text);
    if (devanagari) h.append(" ", deva(devanagari));
    return h;
}

function grahaTable(jataka) {
    const table = el("table", "graha-table");
    const head = el("tr");
    for (const label of ["Graha", "Rashi", "Degree", "Nakshatra", "House", ""]) head.append(el("th", null, label));
    table.append(el("thead"), el("tbody"));
    table.tHead.append(head);

    const lagna = el("tr", "lagna-row");
    lagna.append(
        el("td", null, "Lagna"),
        el("td", null, jataka.lagna.name),
        el("td", null, dms(jataka.lagna.degree)),
        el("td", null, `${jataka.lagna.nakshatra} ${jataka.lagna.pada}`),
        el("td", null, "1"),
        el("td")
    );
    table.tBodies[0].append(lagna);

    for (const g of jataka.grahas) {
        const row = el("tr");
        const name = el("td");
        name.append(g.name, " ", deva(g.devanagari, "deva graha-deva"));
        const notes = [
            g.dignity,
            g.retrograde && !["rahu", "ketu"].includes(g.key) ? "retrograde" : null,
            g.combust ? "combust" : null,
        ].filter(Boolean);
        row.append(
            name,
            el("td", null, g.rashi),
            el("td", null, dms(g.degree)),
            el("td", null, `${g.nakshatra} ${g.pada}`),
            el("td", null, String(g.house)),
            el("td", "graha-notes", notes.join(", "))
        );
        table.tBodies[0].append(row);
    }
    const wrap = el("div", "table-scroll");
    wrap.append(table);
    return wrap;
}

function dashaSection(dasha) {
    const section = el("section", "jataka-section");
    section.append(heading("Vimshottari dasha", "विंशोत्तरी दशा"));
    const now = dasha.current;
    if (now) {
        const box = el("div", "dasha-now");
        for (const [level, label] of [
            ["mahadasha", "Mahadasha"],
            ["antardasha", "Antardasha"],
            ["pratyantardasha", "Pratyantar"],
        ]) {
            const p = now[level];
            const row = el("div", "dasha-now-row");
            row.append(el("span", "dasha-level", label), el("span", "dasha-lord", p.lord), el("span", "dasha-until", `until ${fullDate(p.end)}`));
            box.append(row);
        }
        section.append(box);
    }

    const today = new Date();
    for (const md of dasha.mahadashas) {
        const isNow = now && md.start === now.mahadasha.start;
        const past = parseDate(md.end) <= today;
        const details = el("details", `dasha-md${isNow ? " current" : ""}${past ? " past" : ""}`);
        details.open = !!isNow;
        const summary = el("summary");
        summary.append(el("span", "dasha-lord", md.lord), el("span", "dasha-span", span(md)));
        details.append(summary);
        const list = el("ol", "dasha-ads");
        for (const ad of md.antardashas) {
            const adNow = now && ad.start === now.antardasha.start;
            const item = el("li", `${adNow ? "current" : ""}${parseDate(ad.end) <= today ? " past" : ""}`.trim());
            item.append(el("span", null, `${md.lord}–${ad.lord}`), el("span", "dasha-span", span(ad)));
            list.append(item);
        }
        details.append(list);
        section.append(details);
    }
    return section;
}

function shaniSection(sadeSati) {
    const section = el("section", "jataka-section");
    section.append(heading("Sade Sati and Dhaiya", "साढ़े साती"));
    const now = sadeSati.current;
    section.append(
        el(
            "p",
            "jataka-line",
            now
                ? `Sade Sati is running, in its ${now.phase} phase, until ${fullDate(now.end)}.`
                : "Sade Sati is not running now."
        )
    );
    if (sadeSati.current_dhaiya) {
        section.append(
            el("p", "jataka-line", `${sadeSati.current_dhaiya.kind} is running until ${fullDate(sadeSati.current_dhaiya.end)}.`)
        );
    }
    const today = new Date();
    const periods = (list, label) => {
        if (!list.length) return null;
        const box = el("div", "period-list");
        box.append(el("div", "insights-title", label));
        const row = el("div", "chip-row");
        for (const p of list) {
            const chip = el("span", "chip", `${parseDate(p.start).getFullYear()}–${parseDate(p.end).getFullYear()}`);
            chip.title = `${fullDate(p.start)} to ${fullDate(p.end)}${p.kind ? `: ${p.kind}` : ""}`;
            if (parseDate(p.start) <= today && today < parseDate(p.end)) chip.classList.add("now");
            else if (parseDate(p.end) <= today) chip.classList.add("past");
            row.append(chip);
        }
        box.append(row);
        return box;
    };
    for (const node of [
        periods(sadeSati.periods, "Sade Sati in your lifetime"),
        periods(sadeSati.dhaiya, "Dhaiya (Kantaka and Ashtama Shani)"),
    ]) {
        if (node) section.append(node);
    }
    return section;
}

function gocharSection(transits) {
    const section = el("section", "jataka-section");
    section.append(heading("Gochar today", "गोचर"));
    const list = el("ul", "gochar-list");
    for (const t of transits) {
        const item = el("li");
        item.append(
            el("span", "dasha-lord", t.name),
            el(
                "span",
                null,
                ` in ${t.rashi}: ${ordinal(t.from_moon)} from your Moon, ${ordinal(t.from_lagna)} from your lagna` +
                    (t.until ? `, until ${monthYear(t.until)}` : "")
            )
        );
        list.append(item);
    }
    section.append(list);
    return section;
}

function doshaCard(d) {
    const card = el("article", `dosha ${d.status}`);
    const head = el("div", "dosha-head");
    head.append(el("span", "dosha-name", d.name), deva(d.devanagari), el("span", `dosha-status status-${d.status}`, STATUS_LABELS[d.status]));
    card.append(head, el("p", "dosha-detail", d.detail));
    if (d.cancellations.length) {
        card.append(el("p", "dosha-cancel", `Eased or cancelled: ${d.cancellations.join("; ")}.`));
    }
    if (d.note) card.append(el("p", "hint", d.note));
    return card;
}

function doshaSection(doshas) {
    const section = el("section", "jataka-section");
    section.append(
        heading("Doshas", "दोष"),
        el(
            "p",
            "hint",
            "Checked by the most commonly used rules. Jyotishis weigh these differently, and many " +
                "doshas are eased by other placements; your family jyotishi's reading comes first."
        )
    );
    const found = doshas.filter((d) => d.status !== "absent");
    const absent = doshas.filter((d) => d.status === "absent");
    const list = el("div", "dosha-list");
    list.append(...found.map(doshaCard));
    if (!found.length) list.append(el("p", "jataka-line", "No doshas found by these rules."));
    section.append(list);
    if (absent.length) {
        const details = el("details", "dosha-absent");
        details.append(el("summary", null, `Not present (${absent.length}): ${absent.map((d) => d.name).join(", ")}`));
        const inner = el("div", "dosha-list");
        inner.append(...absent.map(doshaCard));
        details.append(inner);
        section.append(details);
    }
    return section;
}

function yogaSection(yogas) {
    const section = el("section", "jataka-section");
    section.append(heading("Yogas", "योग"));
    if (!yogas.length) {
        section.append(el("p", "jataka-line", "None of the yogas checked here are formed."));
        return section;
    }
    const list = el("ul", "yoga-list");
    for (const y of yogas) {
        const item = el("li");
        const name = el("div", "dosha-head");
        name.append(el("span", "dosha-name", y.name), deva(y.devanagari));
        item.append(name, el("p", "dosha-detail", y.detail));
        list.append(item);
    }
    section.append(list);
    return section;
}

// The chart with a Rasi / Navamsa switch
export function chartSection(jataka, caption) {
    const section = el("section", "jataka-section chart-section");
    const toggle = el("div", "seg");
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Chart");
    const now = jataka.dasha.current;
    const names = now ? [now.mahadasha.lord, now.antardasha.lord] : [];
    let chart = null;
    const draw = (varga) => {
        const next = southChart(jataka, { varga, lords: lordKeys(jataka, names), caption });
        if (chart) chart.replaceWith(next);
        chart = next;
        for (const b of toggle.children) b.setAttribute("aria-pressed", String(b.dataset.varga === varga));
    };
    for (const [key, { title }] of Object.entries(VARGAS)) {
        const btn = el("button", null, title);
        btn.type = "button";
        btn.dataset.varga = key;
        btn.addEventListener("click", () => draw(key));
        toggle.append(btn);
    }
    section.append(toggle);
    draw("rasi");
    section.insertBefore(chart, null);
    section.append(el("p", "hint chart-key", "La = lagna · R = retrograde · the running dasha lords are marked"));
    return section;
}

// Everything below the chart, for a person's page
export function jatakaSections(jataka) {
    return [
        heading("The grahas", "ग्रह"),
        grahaTable(jataka),
        dashaSection(jataka.dasha),
        shaniSection(jataka.sade_sati),
        gocharSection(jataka.transits),
        doshaSection(jataka.doshas),
        yogaSection(jataka.yogas),
        el(
            "p",
            "hint",
            `Worked out with the ${jataka.conventions}. If your jyotishi's chart differs slightly, these choices are usually why.`
        ),
    ];
}

export { doshaSection, yogaSection, dashaSection, shaniSection };
