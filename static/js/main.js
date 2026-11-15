// Celestial: the app shell. The gate, the five tabs, who the app is looking at, and
// settings. Each tab lives in its own module.
import { el, button, storage, avatar, toast, sleep } from "./util.js";
import * as store from "./store.js";
import { verifyPin, PIN_KEY } from "./api.js";
import * as sound from "./sound.js";
import { closeLightbox } from "./cards.js";
import { openSheet, closeSheet, initSheet, confirmSheet } from "./sheet.js";
import { placePicker } from "./places.js";
import { drawKolam, kolam } from "./kolam.js";
import { runTour } from "./tour.js";
import * as today from "./today.js";
import * as ask from "./ask.js";
import * as timeline from "./timeline.js";
import * as family from "./family.js";
import * as calendar from "./calendar.js";

const $ = (id) => document.getElementById(id);

const TABS = {
    today: { module: today, title: "Today" },
    ask: { module: ask, title: "Ask" },
    timeline: { module: timeline, title: "Timeline" },
    family: { module: family, title: "Family" },
    calendar: { module: calendar, title: "Calendar" },
};
const TOUR_KEY = "tarot_tour_seen";
// Bump for a release worth a fresh look: everyone sees the tour once more
const TOUR_VERSION = "4";

let currentTab = "today";

const context = {
    go,
    pickPerson,
    current: () => currentTab,
};

// --- Tabs ---

function go(tab, options = {}) {
    if (!TABS[tab]) tab = "today";
    currentTab = tab;
    closeSheet();
    for (const name of Object.keys(TABS)) {
        $(`tab-${name}`).hidden = name !== tab;
        const btn = $(`tab-btn-${name}`);
        if (name === tab) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
    }
    $("header-title").textContent = TABS[tab].title;
    if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
    window.scrollTo(0, 0);
    TABS[tab].module.render(options);
}

function renderHeader() {
    const person = store.subject();
    const fresh = avatar(person);
    fresh.id = "person-avatar";
    $("person-avatar").replaceWith(fresh);
    $("person-name").textContent = person ? person.name : "Add someone";
}

// Who Today, Ask and the Timeline are about
function pickPerson() {
    const people = store.people();
    const subject = store.subject();
    const list = el("div", "people");
    for (const p of people) {
        const card = button("", `person-card${subject?.id === p.id ? " selected" : ""}`, () => {
            closeSheet();
            store.setSubject(p.id);
        });
        const text = el("div", "grow");
        text.append(el("div", "name", p.name), el("div", "meta", store.relationLabel(p.relation)));
        card.append(avatar(p, "avatar big"), text);
        list.append(card);
    }
    const add = button("+ Add someone", "btn wide", () => {
        closeSheet();
        family.openForm(null);
    });
    add.style.marginTop = "12px";
    openSheet("Who is this for?", [list, add]);
}

// --- Settings ---

function switchRow(label, on, onToggle) {
    const row = el("div", "switch-row");
    const sw = button("", "switch", () => {
        const next = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", String(next));
        onToggle(next);
    });
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(on));
    sw.setAttribute("aria-label", label);
    row.append(el("span", null, label), sw);
    return row;
}

function segmented(options, current, onPick) {
    const seg = el("div", "seg");
    for (const [value, label] of options) {
        const b = button(label, null, () => {
            for (const x of seg.children) x.setAttribute("aria-pressed", String(x === b));
            onPick(value);
        });
        b.setAttribute("aria-pressed", String(value === current));
        seg.append(b);
    }
    return seg;
}

function openSettings() {
    const group = (title, ...nodes) => {
        const box = el("div", "settings-group");
        box.append(el("strong", null, title), ...nodes);
        return box;
    };
    const language = el("select", "input");
    for (const [code, label] of store.LANGUAGES) {
        const opt = el("option", null, label);
        opt.value = code;
        language.append(opt);
    }
    language.value = store.setting("language");
    language.addEventListener("change", () => store.setSetting("language", language.value));

    const here = store.here();
    const place = el("div", "switch-row");
    place.append(
        el("span", null, here ? `📍 ${here.name}${here.assumed ? " (birth place)" : ""}` : "Not set"),
        button("Change", "btn small ghost", choosePlace)
    );

    openSheet("Settings", [
        group("Readings in", language, el("p", "hint", "The reader answers in this language.")),
        group(
            "Text size",
            segmented([["normal", "A"], ["large", "A+"], ["larger", "A++"]], store.setting("textSize"), (v) => store.setSetting("textSize", v))
        ),
        group(
            "Look",
            segmented([["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], store.setting("theme"), (v) => store.setSetting("theme", v))
        ),
        group(
            "Experience",
            switchRow("Sound (tanpura, bell)", sound.isEnabled(), (on) => sound.setEnabled(on)),
            switchRow("Ritual before readings", store.setting("ritual") === "on", (on) => store.setSetting("ritual", on ? "on" : "off"))
        ),
        group("Where you are now", place, el("p", "hint", "Sunrise, Rahu Kaal and the calendar are worked out for this place.")),
        group(
            "More",
            button("✦ How this works", "link-btn", () => {
                closeSheet();
                startTour();
            }),
            button("🔒 Lock the app", "link-btn", lock),
            button("Erase everything on this device", "link-btn danger", async () => {
                if (await confirmSheet("Erase everything?", "All people, birth details, events and readings on this device will be deleted.", "Erase", true)) {
                    store.forgetEverything();
                    toast("Everything was erased from this device");
                    go("today");
                }
            })
        ),
    ]);
}

function choosePlace() {
    let picked = null;
    const picker = placePicker({ label: "Where you are now", locate: true, onChange: (p) => (picked = p) });
    const save = button("Save", "btn wide", () => {
        if (!picked) return toast("Choose a place first");
        closeSheet();
        store.setHere(picked);
    });
    openSheet("Where are you?", [picker.node, el("br"), save]);
}

function lock() {
    storage.remove(PIN_KEY);
    location.reload();
}

// --- First run and the tour ---

function tourSteps() {
    return [
        {
            target: null,
            title: "Welcome to Celestial",
            text:
                "Your family's almanac: today's panchang and Rahu Kaal, everyone's jataka, matching, " +
                "muhurats and festivals, and a reader who answers your questions. A minute's look around.",
        },
        {
            target: "#day-wheel",
            title: "The day wheel",
            text:
                "Sunrise on the left, sunset on the right. The day's choghadiyas arc over the top and the " +
                "night's below: green is good, red is to avoid. Rahu Kaal is the red band outside, and the " +
                "dot shows where you are in the day.",
        },
        {
            target: "#person-btn",
            title: "Who it's for",
            text: "Switch between family members here. Today, Ask and the Timeline follow whoever you choose.",
        },
        {
            target: "#tab-btn-ask",
            title: "Ask",
            text:
                "Ask anything, about yourself or someone in the family. The reader reads their jataka for timing " +
                "and the cards or cowries for guidance, in the language you choose.",
        },
        {
            target: "#tab-btn-timeline",
            title: "Timeline",
            text: "A whole life, year by year: dashas, Sade Sati and Guru's transits. Add events and see how they line up.",
        },
        {
            target: "#tab-btn-family",
            title: "Family",
            text: "Everyone's chart in the South Indian style, their doshas and yogas, and kundali matching.",
        },
        {
            target: "#tab-btn-calendar",
            title: "Calendar",
            text: "Festivals, fasts, each person's important dates, and good days for new beginnings.",
        },
        {
            target: "#settings-btn",
            title: "Settings",
            text: "Reading language, bigger text, dark or light, sound, and where you are.",
        },
    ];
}

async function startTour() {
    if (currentTab !== "today") go("today");
    await sleep(800);
    await runTour(tourSteps());
    storage.set(TOUR_KEY, TOUR_VERSION);
}

function welcome() {
    const box = el("div", "empty");
    box.append(
        kolam({ petals: 12 }),
        el("p", null, "Start with your own birth details. Then add your family: parents, children, anyone you ask about."),
        button("Add yourself", "btn", () => {
            closeSheet();
            family.openForm(null, { relation: "self" });
        }),
        button("Look around first", "link-btn", closeSheet)
    );
    openSheet("Namaste 🙏", box);
}

// --- The gate ---

async function unlock() {
    const gate = $("gate");
    gate.style.opacity = "0";
    $("app").hidden = false;
    setTimeout(() => (gate.hidden = true), 400);
    const tab = location.hash.slice(1);
    go(TABS[tab] ? tab : "today");
    renderHeader();
    if (storage.get(TOUR_KEY) !== TOUR_VERSION) await startTour();
    if (!store.people().length) welcome();
}

async function tryPin(pin) {
    if (/[^\x20-\x7E]/.test(pin)) {
        $("gate-error").textContent = "Use only plain letters, numbers and spaces.";
        return;
    }
    $("gate-btn").disabled = true;
    try {
        const status = await verifyPin(pin);
        if (status === 200) {
            storage.set(PIN_KEY, pin);
            unlock();
        } else if (status === 429) {
            $("gate-error").textContent = "Too many attempts. Wait a minute and try again.";
        } else {
            $("gate-error").textContent = "That isn't the passphrase.";
            $("gate-pin").value = "";
        }
    } catch {
        $("gate-error").textContent = "Couldn't reach the server.";
    } finally {
        $("gate-btn").disabled = false;
    }
}

// --- Wiring ---

initSheet();
for (const name of Object.keys(TABS)) {
    TABS[name].module.init?.(context);
    $(`tab-btn-${name}`).addEventListener("click", () => go(name));
}
$("person-btn").addEventListener("click", pickPerson);
$("settings-btn").addEventListener("click", openSettings);
$("lightbox").addEventListener("click", closeLightbox);
$("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    tryPin($("gate-pin").value.trim());
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (closeLightbox()) return;
    closeSheet();
});

store.onChange((what) => {
    if (what === "people" || what === "subject") renderHeader();
    if (what === "settings") return;
    if (what === "here" && !["today", "calendar"].includes(currentTab)) return;
    TABS[currentTab].module.render({ keep: true });
});

// Browsers only allow audio after a user gesture
document.addEventListener("pointerdown", sound.onUserGesture, { once: true });
document.addEventListener("keydown", sound.onUserGesture, { once: true });

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}

drawKolam($("gate-kolam"), { petals: 8 });
(async () => {
    const pin = storage.get(PIN_KEY);
    try {
        // With no passphrase configured on the server, any (or no) passphrase opens it
        if ((await verifyPin(pin || "")) === 200) {
            unlock();
            return;
        }
    } catch {
        /* show the gate */
    }
    $("gate-pin").focus();
})();
