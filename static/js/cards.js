// Rendering and revealing drawn cards: deal face-down, then flip one at a time.
import { el, sleep, prefersReducedMotion } from "./util.js";

const LAYOUTS = {
    single_card: "single",
    past_present_future: "row",
    situation_obstacle_advice: "row",
    celtic_cross: "celtic",
};

function layoutFor(spread, count) {
    if (LAYOUTS[spread]) return LAYOUTS[spread];
    if (count === 1) return "single";
    if (count >= 10) return "celtic";
    return "row";
}

function describe(card) {
    const reversed = card.orientation === "reversed" ? ", reversed" : "";
    const personal = card.personal ? `. ${card.personal}` : "";
    return `${card.position}: ${card.card}${reversed}${personal}`;
}

function buildCard(card, index, layout) {
    const node = el("button", "tarot-card");
    node.type = "button";
    node.style.setProperty("--i", index);
    node.setAttribute("aria-label", "Face-down card");
    if (card.orientation === "reversed") node.classList.add("reversed");
    if (card.personal) node.classList.add("personal");
    if (layout === "celtic") {
        node.style.gridArea = `c${index === 1 ? 1 : index + 1}`;
        if (index === 1) node.classList.add("crossing");
    }

    const inner = el("div", "card-inner");
    const back = el("div", "card-face card-back card-back-art");
    const front = el("div", "card-face card-front");
    // Shown if the artwork fails to load
    front.append(el("span", "card-fallback", card.card));
    if (card.image) {
        const img = el("img");
        img.src = card.image;
        img.alt = "";
        img.decoding = "async";
        img.addEventListener("error", () => img.remove());
        front.append(img);
    }
    inner.append(back, front);
    node.append(inner);

    if (layout === "celtic") {
        node.append(el("span", "card-number", String(index + 1)));
    } else {
        const caption = el("div", "card-caption");
        caption.append(
            el("div", "card-pos", card.position),
            el("div", "card-title", card.card),
            el("div", "card-orient", card.orientation)
        );
        if (card.personal) caption.append(el("div", "card-personal", `★ ${card.personal}`));
        node.append(caption);
    }

    node.addEventListener("click", () => {
        if (node.classList.contains("is-flipped")) openLightbox(card);
    });
    return node;
}

function preload(cards, timeoutMs) {
    const loads = cards
        .filter((c) => c.image)
        .map((c) => {
            const img = new Image();
            img.src = c.image;
            return img.decode().catch(() => {});
        });
    return Promise.race([Promise.all(loads), sleep(timeoutMs)]);
}

// Lay the cards on the table face-down, then turn them over one by one.
// onFlip runs as each card turns (sound, haptics).
export async function revealSpread(tray, legend, cards, spread, { onFlip } = {}) {
    const layout = layoutFor(spread, cards.length);
    const reduced = prefersReducedMotion();
    tray.className = `cards-tray layout-${layout}`;

    const nodes = cards.map((c, i) => buildCard(c, i, layout));
    tray.replaceChildren(...nodes);
    legend.replaceChildren();

    // Let the deal animation play while the artwork loads
    await Promise.all([preload(cards, 4000), sleep(reduced ? 0 : 500 + cards.length * 90)]);

    const pause = reduced ? 150 : layout === "celtic" ? 420 : 750;
    for (const [i, node] of nodes.entries()) {
        node.classList.add("is-flipped");
        node.setAttribute("aria-label", `${describe(cards[i])}. Show card details.`);
        onFlip?.(i);
        await sleep(pause);
    }

    if (layout === "celtic") {
        legend.replaceChildren(
            ...cards.map((c, i) => {
                const item = el("li");
                const link = el("button", "legend-link");
                link.type = "button";
                link.append(
                    el("span", "legend-num", `${i + 1}.`),
                    el("strong", null, c.position),
                    ` — ${c.card}`,
                    el("em", null, c.orientation === "reversed" ? " (reversed)" : "")
                );
                if (c.personal) link.append(el("span", "legend-personal", ` ★ ${c.personal}`));
                link.addEventListener("click", () => openLightbox(c));
                item.append(link);
                return item;
            })
        );
    }
    await sleep(reduced ? 0 : 500);
}

export function clearSpread(tray, legend) {
    tray.replaceChildren();
    tray.className = "cards-tray";
    legend.replaceChildren();
}

// --- Enlarged card view ---

let lastFocus = null;

export function openLightbox(card) {
    const box = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    img.src = card.image || "";
    img.alt = `${card.card}${card.orientation === "reversed" ? " (reversed)" : ""}`;
    img.classList.toggle("reversed", card.orientation === "reversed");
    document.getElementById("lightbox-pos").textContent = card.position;
    document.getElementById("lightbox-name").textContent = card.card;
    document.getElementById("lightbox-orient").textContent = card.orientation;
    document.getElementById("lightbox-meaning").textContent = card.meaning || "";
    const personal = document.getElementById("lightbox-personal");
    personal.textContent = card.personal ? `★ ${card.personal}` : "";
    personal.hidden = !card.personal;

    lastFocus = document.activeElement;
    box.hidden = false;
    document.getElementById("lightbox-close").focus();
}

// Returns true if it was open
export function closeLightbox() {
    const box = document.getElementById("lightbox");
    if (box.hidden) return false;
    box.hidden = true;
    lastFocus?.focus?.();
    return true;
}
