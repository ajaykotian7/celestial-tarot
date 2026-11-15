// Kolam: a grid of dots and a line looping around them, drawn in one stroke as the
// threshold kolams are each morning. Purely decorative.
import { svgEl, prefersReducedMotion } from "./util.js";

// petals: how many loops round the centre; dots: rings of pulli
export function drawKolam(svg, { petals = 8, size = 120 } = {}) {
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.replaceChildren();
    const c = size / 2;
    const r = size * 0.42;

    // The pulli: a centre dot and rings around it
    let i = 0;
    svgEl("circle", { cx: c, cy: c, r: 2.2, class: "kolam-dot", style: `--i:${i++}` }, svg);
    for (const [ring, count] of [[0.3, petals], [0.62, petals]]) {
        for (let k = 0; k < count; k++) {
            const a = ((k + (ring > 0.5 ? 0.5 : 0)) / count) * Math.PI * 2;
            svgEl(
                "circle",
                { cx: c + Math.cos(a) * r * ring, cy: c + Math.sin(a) * r * ring, r: 2, class: "kolam-dot", style: `--i:${i++}` },
                svg
            );
        }
    }

    // The line: a rose curve weaving between the dots, then a ring of small loops
    const steps = 720;
    let d = "";
    for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * Math.PI * 2;
        const rr = r * (0.55 + 0.45 * Math.cos((petals / 2) * t) ** 2) * (0.78 + 0.22 * Math.cos(petals * t));
        d += `${s ? "L" : "M"}${(c + rr * Math.cos(t)).toFixed(2)} ${(c + rr * Math.sin(t)).toFixed(2)}`;
    }
    const path = svgEl("path", { d, class: "kolam-line", pathLength: 1 }, svg);
    if (prefersReducedMotion()) path.style.strokeDashoffset = "0";
    return svg;
}

export function kolam(options) {
    const svg = svgEl("svg", { class: "kolam", "aria-hidden": "true" });
    return drawKolam(svg, options);
}
