// Today's panchang: the five limbs of the day (tithi, vara, nakshatra, yoga, karana),
// worked out by the server from the real sky for this moment.
import { el } from "./util.js";

const $ = (id) => document.getElementById(id);

let today = null;
let lastFocus = null;

function tithiName(tithi) {
    // Purnima and Amavasya end their fortnights and need no paksha
    return [15, 30].includes(tithi.number) ? tithi.name : `${tithi.paksha} ${tithi.name}`;
}

function tithiDevanagari(tithi) {
    return [15, 30].includes(tithi.number) ? tithi.devanagari : `${tithi.paksha_devanagari} ${tithi.devanagari}`;
}

// "until 7:25 pm", or "until 7:12 am tomorrow"
function until(iso) {
    const end = new Date(iso);
    const time = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const days = Math.round(
        (new Date(end.toDateString()) - new Date(new Date().toDateString())) / 86400000
    );
    if (days === 0) return `until ${time}`;
    if (days === 1) return `until ${time} tomorrow`;
    return `until ${time}, ${end.toLocaleDateString([], { weekday: "long" })}`;
}

function limb(label, name, devanagari, ...details) {
    const row = el("div", "limb");
    const head = el("div", "limb-head");
    head.append(el("span", "limb-label", label), el("span", "limb-name", name));
    const deva = el("span", "limb-deva deva", devanagari);
    deva.lang = "sa";
    head.append(deva);
    row.append(head);
    for (const text of details.filter(Boolean)) row.append(el("p", "limb-detail", text));
    return row;
}

function render() {
    const { tithi, vara, nakshatra, yoga, karana } = today;
    const body = $("panchang-body");
    body.replaceChildren();

    if (tithi.observance) body.append(el("p", "observance", `🪔 ${tithi.observance}`));

    const day = ((tithi.number - 1) % 15) + 1;
    body.append(
        limb(
            "Tithi",
            tithiName(tithi),
            tithiDevanagari(tithi),
            `Lunar day ${day} of ${tithi.paksha_meaning}, ${until(today.tithi_ends)}.`
        ),
        limb("Vara", vara.name, vara.devanagari, `The day of ${vara.lord}.`),
        limb(
            "Nakshatra",
            nakshatra.name,
            nakshatra.devanagari,
            `The Moon's mansion ${until(today.nakshatra_ends)}, in ${today.moon_rashi} rashi.`,
            `Deity ${nakshatra.deity} · symbol ${nakshatra.symbol} · ruled by ${nakshatra.lord}.`,
            `A time of ${nakshatra.theme}.`
        ),
        limb(
            "Yoga",
            yoga.name,
            yoga.devanagari,
            `“${yoga.meaning}”${yoga.inauspicious ? ", traditionally a testing yoga" : ""}.`
        ),
        limb(
            "Karana",
            karana.name,
            karana.devanagari,
            karana.bhadra ? "Also called Bhadra, traditionally avoided for new beginnings." : "Half of the lunar day."
        )
    );
}

// The short label under the title, e.g. "🪔 Krishna Panchami · Ardra"
export function show(panchang) {
    today = panchang;
    const btn = $("panchang-btn");
    btn.hidden = !panchang;
    if (!panchang) return;
    $("panchang-btn-label").textContent = `${tithiName(panchang.tithi)} · ${panchang.nakshatra.name}`;
}

export function openPanel() {
    if (!today) return;
    render();
    lastFocus = document.activeElement;
    $("panchang-panel").hidden = false;
    $("panchang-close").focus();
}

export function closePanel() {
    if ($("panchang-panel").hidden) return;
    $("panchang-panel").hidden = true;
    lastFocus?.focus?.();
}

export function initPanel() {
    $("panchang-btn").addEventListener("click", openPanel);
    $("panchang-close").addEventListener("click", closePanel);
    $("panchang-panel").addEventListener("click", (e) => {
        if (e.target === $("panchang-panel")) closePanel();
    });
}
