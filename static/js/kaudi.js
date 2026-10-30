// Kaudi prashna on the table: three heaps of cowries fall onto the cloth, each is
// counted away in eights, and the shells that remain name the heap's aya.
// The server casts the shells; this only shows them.
import { el, sleep, prefersReducedMotion } from "./util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(parent, tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.append(node);
    return node;
}

// A cowrie, mouth up (the toothed slit) or down (the spotted back)
function cowrie(up) {
    const shell = document.createElementNS(SVG_NS, "svg");
    shell.setAttribute("viewBox", "0 0 24 32");
    shell.setAttribute("aria-hidden", "true");
    svg(shell, "ellipse", { cx: 12, cy: 16, rx: 10, ry: 14, class: "cowrie-body" });
    svg(shell, "ellipse", { cx: 9, cy: 10.5, rx: 3.5, ry: 5.5, class: "cowrie-shine" });
    if (up) {
        svg(shell, "path", { d: "M12 4 C9.6 10 9.6 22 12 28 C14.4 22 14.4 10 12 4 Z", class: "cowrie-mouth" });
        for (let y = 8; y <= 24; y += 2.7) {
            svg(shell, "line", { x1: 10.4, y1: y, x2: 13.6, y2: y, class: "cowrie-tooth" });
        }
    } else {
        for (const [cx, cy, r] of [[8, 19, 1.3], [14.5, 13, 1.1], [15, 21.5, 1.4], [10.5, 25, 0.9], [16.5, 8.5, 0.8]]) {
            svg(shell, "circle", { cx, cy, r, class: "cowrie-spot" });
        }
    }
    return shell;
}

function buildHeap(heap) {
    const node = el("div", `kaudi-heap ${heap.favourable ? "favourable" : "testing"}`);
    const cloth = el("div", "kaudi-cloth");
    const shells = [];
    for (let i = 0; i < heap.count; i++) {
        const wrap = el("span", "cowrie");
        // Clustered toward the middle, as a handful falls
        const r = Math.sqrt(Math.random()) * 42;
        const a = Math.random() * Math.PI * 2;
        wrap.style.left = `${50 + Math.cos(a) * r}%`;
        wrap.style.top = `${50 + Math.sin(a) * r * 0.8}%`;
        wrap.style.setProperty("--turn", `${Math.round(Math.random() * 360)}deg`);
        wrap.style.setProperty("--i", i);
        wrap.append(cowrie(Math.random() < 0.5));
        cloth.append(wrap);
        shells.push(wrap);
    }

    const aya = el("div", "kaudi-aya");
    const deva = el("span", "deva", heap.devanagari);
    deva.lang = "sa";
    aya.append(deva, ` ${heap.aya}`);
    const reading = el("div", "kaudi-reading");
    reading.append(
        el("div", "kaudi-count", `${heap.count} shells · ${heap.remainder} remain`),
        aya,
        el("div", "kaudi-symbol", `${capitalize(heap.symbol)} · ${heap.favourable ? "favourable" : "asks for patience"}`),
        el("p", "kaudi-meaning", capitalize(heap.meaning))
    );
    node.append(el("div", "kaudi-pos", heap.position), cloth, reading);
    return { node, shells };
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// onCast(i) as each heap falls; onCount() as each eight is counted away
export async function revealKaudi(tray, legend, kaudi, { onCast, onCount } = {}) {
    const reduced = prefersReducedMotion();
    tray.className = "cards-tray layout-kaudi";
    const heaps = kaudi.heaps.map(buildHeap);
    tray.replaceChildren(...heaps.map((h) => h.node));
    legend.replaceChildren();

    for (const [i, heap] of heaps.entries()) {
        heap.node.classList.add("cast");
        onCast?.(i);
        await sleep(reduced ? 0 : 900);
    }

    for (const [i, heap] of heaps.entries()) {
        const { remainder } = kaudi.heaps[i];
        const counted = heap.shells.length - remainder;
        for (let start = 0; start < counted; start += 8) {
            heap.shells.slice(start, start + 8).forEach((s) => s.classList.add("counted"));
            onCount?.();
            await sleep(reduced ? 0 : 220);
        }
        heap.shells.slice(counted).forEach((s) => s.classList.add("remains"));
        heap.node.classList.add("read");
        await sleep(reduced ? 0 : 700);
    }

    legend.replaceChildren(el("li", "kaudi-leaning", kaudi.leaning));
    await sleep(reduced ? 0 : 400);
}
