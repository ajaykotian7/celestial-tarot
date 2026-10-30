// A sigil carved from the querent's question, by the old method: drop the vowels and
// repeated letters, turn what's left into numbers, and trace them across the Lo Shu
// square. The same question always gives the same sigil.
const SVG_NS = "http://www.w3.org/2000/svg";

// Cell (column, row) of each number in the Lo Shu square:
//   4 9 2
//   3 5 7
//   8 1 6
const LO_SHU = {
    4: [0, 0], 9: [1, 0], 2: [2, 0],
    3: [0, 1], 5: [1, 1], 7: [2, 1],
    8: [0, 2], 1: [1, 2], 6: [2, 2],
};
const CELL = 46;
const VOWELS = new Set("aeiou");
// One mark on the rim for each of the 27 nakshatras
const RIM_MARKS = 27;

// Pythagorean values for Latin letters (A, J, S = 1 … I, R = 9); other scripts,
// such as Devanagari, by code point
function letterNumber(ch) {
    const code = ch.codePointAt(0);
    if (ch >= "a" && ch <= "z") return ((code - 97) % 9) + 1;
    return (code % 9) + 1;
}

function sigilNumbers(text) {
    const seen = new Set();
    const numbers = [];
    for (const ch of text.normalize("NFC").toLowerCase()) {
        // Letters only: Devanagari vowel signs are marks, so they drop out too
        if (!/\p{L}/u.test(ch) || VOWELS.has(ch) || seen.has(ch)) continue;
        seen.add(ch);
        const n = letterNumber(ch);
        if (numbers.at(-1) !== n) numbers.push(n);
    }
    return numbers.length ? numbers : [5];
}

// Seeded from the question, so the curves are the same every time
function seededRandom(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return () => {
        h ^= h << 13;
        h ^= h >>> 17;
        h ^= h << 5;
        return (h >>> 0) / 4294967296;
    };
}

function add(parent, tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.append(node);
    return node;
}

const fmt = (n) => n.toFixed(1);

function trace(numbers, random) {
    // Each number has one spot near its cell, so returning to it meets the same point
    const spots = {};
    for (const n of new Set(numbers)) {
        const [c, r] = LO_SHU[n];
        spots[n] = [100 + (c - 1) * CELL + (random() - 0.5) * 14, 100 + (r - 1) * CELL + (random() - 0.5) * 14];
    }
    const points = numbers.map((n) => spots[n]);
    let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`;
    let control = points[0];
    for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const bend = (random() - 0.5) * 0.8;
        control = [(x0 + x1) / 2 - (y1 - y0) * bend, (y0 + y1) / 2 + (x1 - x0) * bend];
        d += ` Q ${fmt(control[0])} ${fmt(control[1])} ${fmt(x1)} ${fmt(y1)}`;
    }
    return { d, points, control };
}

// Draws the sigil for `text` into an <svg>. frame: the rim and the faint Lo Shu grid.
export function drawSigil(svg, text, { frame = true } = {}) {
    const random = seededRandom(text);
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.replaceChildren();

    if (frame) {
        add(svg, "circle", { cx: 100, cy: 100, r: 94, class: "sigil-ring" });
        add(svg, "circle", { cx: 100, cy: 100, r: 86, class: "sigil-ring" });
        for (let i = 0; i < RIM_MARKS; i++) {
            const a = (i / RIM_MARKS) * Math.PI * 2 - Math.PI / 2;
            const [c, s] = [Math.cos(a), Math.sin(a)];
            add(svg, "line", {
                x1: fmt(100 + c * 87.5), y1: fmt(100 + s * 87.5),
                x2: fmt(100 + c * 92.5), y2: fmt(100 + s * 92.5),
                class: "sigil-tick",
            });
        }
        for (const k of [-0.5, 0.5]) {
            const at = fmt(100 + k * CELL);
            add(svg, "line", { x1: at, y1: 31, x2: at, y2: 169, class: "sigil-grid" });
            add(svg, "line", { x1: 31, y1: at, x2: 169, y2: at, class: "sigil-grid" });
        }
    }

    const { d, points, control } = trace(sigilNumbers(text), random);
    const [sx, sy] = points[0];
    const [ex, ey] = points.at(-1);
    add(svg, "circle", { cx: fmt(sx), cy: fmt(sy), r: 5, pathLength: 1, class: "sigil-line sigil-start" });
    add(svg, "path", { d, pathLength: 1, class: "sigil-line sigil-path" });
    if (points.length > 1) {
        // The closing bar crosses the end of the line
        const [dx, dy] = [ex - control[0], ey - control[1]];
        const len = Math.hypot(dx, dy) || 1;
        const [px, py] = [(-dy / len) * 9, (dx / len) * 9];
        add(svg, "line", {
            x1: fmt(ex - px), y1: fmt(ey - py), x2: fmt(ex + px), y2: fmt(ey + py),
            pathLength: 1,
            class: "sigil-line sigil-end",
        });
    }
    return svg;
}

export function createSigil(text, options) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    return drawSigil(svg, text, options);
}
