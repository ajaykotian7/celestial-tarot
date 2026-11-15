// Timeline: a life laid out year by year. Mahadashas and antardashas, Sade Sati and
// Dhaiya, Guru's passage through the signs, and the events the family adds, with a
// line for today. Tap a period for what it means, or to ask about it.
import { el, button, parseDate, fmtDate, monthYear, ordinal, loading, toast, localDate } from "./util.js";
import * as store from "./store.js";
import { insightsFor } from "./api.js";
import { openSheet, closeSheet, confirmSheet } from "./sheet.js";
import { kolam } from "./kolam.js";

const $ = (id) => document.getElementById(id);
const PX_PER_YEAR = 44;
const YEARS_SHOWN = 90;

const LORDS = {
    Surya: { colour: "#d0672a", meaning: "authority, the father, government, recognition and vitality" },
    Chandra: { colour: "#6d84b4", meaning: "the mind, the mother, home, feelings and public life" },
    Mangal: { colour: "#b8322a", meaning: "energy, courage, property, siblings and competition" },
    Budh: { colour: "#3f8f5a", meaning: "learning, business, communication and skills" },
    Guru: { colour: "#d39b16", meaning: "wisdom, growth, children, teachers and good fortune" },
    Shukra: { colour: "#c4588f", meaning: "love, marriage, comfort, the arts and vehicles" },
    Shani: { colour: "#4a4f6e", meaning: "discipline, hard work, endurance, and delays that build" },
    Rahu: { colour: "#6b4e8f", meaning: "ambition, foreign lands, technology and the unconventional" },
    Ketu: { colour: "#8a6a4a", meaning: "detachment, spirituality, research and letting go" },
};
const KEY_OF = {
    Surya: "sun", Chandra: "moon", Mangal: "mars", Budh: "mercury", Guru: "jupiter",
    Shukra: "venus", Shani: "saturn", Rahu: "rahu", Ketu: "ketu",
};
const HOUSES = {
    1: "self and health", 2: "wealth, family and speech", 3: "courage, siblings and short journeys",
    4: "home, mother, property and peace", 5: "children, creativity and studies", 6: "work, service, health and rivals",
    7: "marriage and partnerships", 8: "change, hidden matters and longevity", 9: "fortune, father, dharma and long journeys",
    10: "career and standing", 11: "gains, friends and wishes", 12: "expenses, foreign lands, rest and moksha",
};

let ctx = null;

export function init(context) {
    ctx = context;
}

const yearOf = (iso) => {
    const d = parseDate(iso);
    const start = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + (d - start) / (365.25 * 864e5);
};

export async function render() {
    const root = $("tab-timeline");
    const person = store.subject();
    if (!person || !store.hasBirthDate(person)) {
        const empty = el("div", "empty card");
        empty.append(
            kolam(),
            el("h2", null, "A life, year by year"),
            el("p", "muted", person ? `Add ${person.name}'s birth date to see their timeline.` : "Add someone in Family first."),
            button(person ? "Add birth details" : "Add someone", "btn", () =>
                ctx.go("family", person ? { edit: person.id } : { add: true })
            )
        );
        root.replaceChildren(empty);
        return;
    }
    root.replaceChildren(loading());
    let insights;
    try {
        insights = (await insightsFor(person)).insights;
    } catch (e) {
        root.replaceChildren(el("p", "error-text", e.message));
        return;
    }
    if (!insights) {
        root.replaceChildren(el("p", "muted", "This birth date is outside what the app can read (1900–2099)."));
        return;
    }
    draw(root, person, insights);
}

function draw(root, person, insights) {
    const jataka = insights.jataka;
    const timeline = insights.timeline;
    const born = yearOf(person.birth_date);
    const first = Math.floor(born);
    const last = Math.min(first + YEARS_SHOWN, 2099);
    const height = (last - first + 1) * PX_PER_YEAR;
    const y = (iso) => Math.max(0, (yearOf(iso) - first) * PX_PER_YEAR);
    const today = localDate();

    const intro = el("div", "card");
    const head = el("div", "card-head");
    head.append(el("h3", null, `${person.name}'s timeline`), button("+ Life event", "btn small", () => addEvent(person)));
    intro.append(
        head,
        el(
            "p",
            "hint",
            jataka
                ? "Dashas, Sade Sati and Guru's transits. Add events from their life, and the reader will connect them to the periods. Tap anything for more."
                : "Sade Sati and Guru's transits. Add a birth time and place for the dashas."
        )
    );

    const legend = el("div", "tl-legend");
    legend.append(el("span", null, "Year"), el("span", null, "Dasha"), el("span", null, "Antardasha"), el("span", null, "Shani"), el("span", null, "Guru"));

    const tl = el("div", "tl");
    tl.style.height = `${height}px`;
    const years = el("div", "tl-years");
    for (let yr = first; yr <= last; yr++) {
        const mark = el("div", `tl-year${yr % 10 === 0 ? " decade" : ""}`, String(yr));
        mark.style.top = `${(yr - first) * PX_PER_YEAR}px`;
        years.append(mark);
    }
    const lanes = [el("div", "tl-lane"), el("div", "tl-lane"), el("div", "tl-lane"), el("div", "tl-lane")];
    const place = (lane, node, start, end) => {
        const top = y(start);
        node.style.top = `${top}px`;
        node.style.height = `${Math.max(3, y(end) - top - 1)}px`;
        lanes[lane].append(node);
    };

    if (jataka) {
        for (const md of jataka.dasha.mahadashas) {
            if (yearOf(md.start) > last) continue;
            const band = button(md.lord, "tl-band md", () => periodSheet(person, jataka, md, null));
            band.style.background = LORDS[md.lord].colour;
            place(0, band, md.start < person.birth_date ? person.birth_date : md.start, md.end);
            for (const ad of md.antardashas) {
                if (ad.end <= person.birth_date || yearOf(ad.start) > last) continue;
                const now = ad.start <= today && today < ad.end;
                const b = button(ad.lord, `tl-band ad${now ? " current" : ad.end <= today ? " past" : ""}`, () =>
                    periodSheet(person, jataka, md, ad)
                );
                b.style.borderLeft = `4px solid ${LORDS[ad.lord].colour}`;
                place(1, b, ad.start < person.birth_date ? person.birth_date : ad.start, ad.end);
            }
        }
    } else {
        const note = el("div", "hint", "Add a birth time and place for the dashas");
        note.style.cssText = "position:sticky;top:120px;padding:4px;writing-mode:vertical-rl;margin:auto";
        lanes[0].append(note);
    }

    if (timeline) {
        for (const p of timeline.sade_sati.periods) {
            const band = button("Sade Sati", "tl-band sade", () =>
                infoSheet("Sade Sati", `${fmtDate(p.start)} – ${fmtDate(p.end)}`,
                    "Seven and a half years of Shani passing the 12th, 1st and 2nd from the birth Moon: a time of hard work, patience and maturing, not only of trouble.",
                    person, `What did (or will) Sade Sati from ${monthYear(p.start)} to ${monthYear(p.end)} mean for ${who(person)}?`)
            );
            place(2, band, p.start, p.end);
        }
        for (const p of timeline.sade_sati.dhaiya) {
            const band = button("Dhaiya", "tl-band sade dhaiya", () =>
                infoSheet(p.kind, `${fmtDate(p.start)} – ${fmtDate(p.end)}`,
                    "Two and a half years of Shani in the 4th or 8th from the birth Moon: home, health and patience come into focus.",
                    person, `What did (or will) Shani's ${p.kind} from ${monthYear(p.start)} mean for ${who(person)}?`)
            );
            place(2, band, p.start, p.end);
        }
        for (const g of timeline.guru) {
            const band = button(g.favourable ? `${ordinal(g.from_moon)}` : "", `tl-band guru${g.favourable ? "" : " quiet"}`, () =>
                infoSheet(`Guru in ${g.rashi}`, `${fmtDate(g.start)} – ${fmtDate(g.end)}`,
                    `Guru in the ${ordinal(g.from_moon)} from the birth Moon, the house of ${HOUSES[g.from_moon]}. ` +
                        (g.favourable ? "Traditionally a favourable placement: growth and blessings in this area." : "A quieter placement for Guru."),
                    person, `What does Guru's transit through ${g.rashi} (${monthYear(g.start)} – ${monthYear(g.end)}) bring for ${who(person)}?`)
            );
            place(3, band, g.start < person.birth_date ? person.birth_date : g.start, g.end);
        }
    }

    tl.append(years, ...lanes);

    // Today
    if (today >= person.birth_date) {
        const now = el("div", "tl-now");
        now.append(el("span", null, "Today"));
        now.style.top = `${y(today)}px`;
        tl.append(now);
    }

    // Life events
    for (const e of person.events || []) {
        const iso = e.when.length === 4 ? `${e.when}-07-01` : `${e.when}-15`;
        const pin = button("", "tl-event", () => eventSheet(person, e));
        pin.append(el("span", "pin"), el("span", "label", `${e.when} · ${e.label}`));
        pin.style.top = `${y(iso)}px`;
        tl.append(pin);
    }

    root.replaceChildren(intro, legend, tl);
    // Start near today
    requestAnimationFrame(() => {
        const target = tl.getBoundingClientRect().top + window.scrollY + y(today) - window.innerHeight / 3;
        window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    });
}

const who = (person) => (person.relation === "self" ? "me" : person.name);

function periodSheet(person, jataka, md, ad) {
    const lord = ad ? ad.lord : md.lord;
    const key = KEY_OF[lord];
    const g = jataka.grahas.find((x) => x.key === key);
    const rules = (jataka.lordships?.[key] || []).map((h) => `the ${ordinal(h)} (${HOUSES[h]})`);
    const title = ad ? `${md.lord}–${ad.lord}` : `${md.lord} mahadasha`;
    const period = ad || md;
    const lines = [
        `${lord} brings ${LORDS[lord].meaning}.`,
        g ? `In ${person.name}'s chart ${lord} sits in ${g.rashi}, the ${ordinal(g.house)} house (${HOUSES[g.house]})${g.dignity ? `, ${g.dignity}` : ""}.` : "",
        rules.length ? `It rules ${rules.join(" and ")}.` : "",
        ad ? `This antardasha runs within the ${md.lord} mahadasha (${monthYear(md.start)} – ${monthYear(md.end)}).` : "",
    ].filter(Boolean);
    infoSheet(title, `${fmtDate(period.start)} – ${fmtDate(period.end)}`, lines.join(" "), person,
        `What did (or will) the ${title}${ad ? " period" : ""} (${monthYear(period.start)} – ${monthYear(period.end)}) mean for ${who(person)}?`);
}

function infoSheet(title, when, text, person, question) {
    const box = el("div", "period-detail");
    box.append(
        el("p", "eyebrow", when),
        el("p", "meaning", text),
        el("br"),
        button("Ask the reader about this", "btn", () => {
            closeSheet();
            store.setSubject(person.id);
            ctx.go("ask", { question });
        })
    );
    openSheet(title, box);
}

function addEvent(person) {
    const form = el("form", "form");
    const when = el("input");
    when.type = "month";
    when.required = true;
    when.max = localDate().slice(0, 7).replace(/^(\d{4})/, (y) => String(Number(y) + 20));
    const label = el("input");
    label.maxLength = 80;
    label.required = true;
    label.placeholder = "e.g. got married, changed jobs, moved city";
    const whenField = el("label", "field");
    whenField.append("When (month and year)", when);
    const labelField = el("label", "field");
    labelField.append("What happened", label);
    const save = el("button", "btn wide", "Add to the timeline");
    save.type = "submit";
    form.append(
        whenField,
        labelField,
        el("p", "hint", "Events stay on this device. The reader sees them, to connect the periods to real life."),
        save
    );
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!when.value || !label.value.trim()) return;
        store.addEvent(person.id, { when: when.value, label: label.value.trim() });
        closeSheet();
        toast("Added");
    });
    openSheet("A life event", form);
}

function eventSheet(person, event) {
    const box = el("div");
    box.append(
        el("p", "eyebrow", event.when),
        el("p", "meaning", event.label),
        el("br"),
        button("Ask how this fits the chart", "btn", () => {
            closeSheet();
            store.setSubject(person.id);
            ctx.go("ask", { question: `In ${event.when}, ${event.label}. What was happening in the chart then, and what does it point to now?` });
        }),
        el("br"),
        button("Remove this event", "link-btn danger", async () => {
            if (await confirmSheet("Remove this event?", event.label, "Remove", true)) store.removeEvent(person.id, event.id);
        })
    );
    openSheet("Life event", box);
}
