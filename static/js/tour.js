// A coachmark tour: dims the page, spotlights one control at a time, and explains it
// in a bubble beside it. Steps whose target isn't on screen are skipped.
import { el, prefersReducedMotion, sleep } from "./util.js";

const GAP = 14; // between the spotlight and the bubble
const MARGIN = 12; // from the screen edges
const PAD = 6; // around the spotlit element

function visibleTarget(selector) {
    if (!selector) return null;
    const node = document.querySelector(selector);
    if (!node || node.hidden || node.closest("[hidden]")) return null;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? node : null;
}

/*
 * steps: [{ target, title, text, extra?, finish? }]
 *   target: CSS selector, or null for a centred step
 *   extra:  { label, onClick } — an inline action, e.g. turning sound on
 *   finish: [{ label, action, primary? }] — buttons that end the tour
 * Resolves with the chosen finish action, "done" or "skipped".
 */
export function runTour(steps) {
    const active = steps.filter((s) => !s.target || visibleTarget(s.target));

    const layer = el("div", "tour");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", "Guided tour");
    const spotlight = el("div", "tour-spotlight");
    const bubble = el("div", "tour-bubble");
    bubble.setAttribute("aria-live", "polite");
    layer.append(spotlight, bubble);
    document.body.append(layer);

    let index = 0;
    let finish;
    const finished = new Promise((resolve) => (finish = resolve));

    function place() {
        const step = active[index];
        const target = visibleTarget(step.target);
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        // Set the layout class before measuring: centred bubbles are wider
        bubble.className = target ? "tour-bubble" : "tour-bubble centered";
        const bw = bubble.offsetWidth;
        const bh = bubble.offsetHeight;

        if (!target) {
            // Centred step: a zero-size spotlight still dims the whole page
            Object.assign(spotlight.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: "0px", height: "0px" });
            Object.assign(bubble.style, {
                left: `${Math.max(MARGIN, (vw - bw) / 2)}px`,
                top: `${Math.max(MARGIN, (vh - bh) / 2)}px`,
            });
            return;
        }

        const r = target.getBoundingClientRect();
        const spot = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        Object.assign(spotlight.style, {
            left: `${spot.left}px`,
            top: `${spot.top}px`,
            width: `${spot.width}px`,
            height: `${spot.height}px`,
        });

        // Below the target if it fits, otherwise above
        let top = spot.top + spot.height + GAP;
        let side = "below";
        if (top + bh > vh - MARGIN && spot.top - GAP - bh >= MARGIN) {
            top = spot.top - GAP - bh;
            side = "above";
        }
        top = Math.min(Math.max(top, MARGIN), vh - bh - MARGIN);
        const centre = r.left + r.width / 2;
        const left = Math.min(Math.max(centre - bw / 2, MARGIN), vw - bw - MARGIN);
        bubble.classList.add(side);
        bubble.style.setProperty("--arrow-x", `${Math.min(Math.max(centre - left, 20), bw - 20)}px`);
        Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
    }

    function button(label, className, onClick) {
        const btn = el("button", className, label);
        btn.type = "button";
        btn.addEventListener("click", onClick);
        return btn;
    }

    function close(result) {
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place, true);
        document.removeEventListener("keydown", onKey);
        layer.classList.add("leaving");
        setTimeout(() => layer.remove(), prefersReducedMotion() ? 0 : 250);
        finish(result);
    }

    async function show(i) {
        index = i;
        const step = active[index];
        const last = index === active.length - 1;

        const actions = el("div", "tour-actions");
        if (step.finish) {
            for (const f of step.finish) {
                actions.append(button(f.label, f.primary ? "tour-next" : "tour-secondary", () => close(f.action)));
            }
        } else {
            if (index > 0) actions.append(button("Back", "tour-secondary", () => show(index - 1)));
            actions.append(button(last ? "Done" : "Next", "tour-next", () => (last ? close("done") : show(index + 1))));
        }

        const head = el("div", "tour-head");
        head.append(el("span", "tour-count", `${index + 1} of ${active.length}`));
        if (!step.finish) head.append(button("Skip tour", "tour-skip", () => close("skipped")));

        bubble.replaceChildren(head, el("h3", "tour-title", step.title), el("p", "tour-text", step.text));
        if (step.extra) {
            const extra = button(step.extra.label, "tour-extra", () => {
                step.extra.onClick();
                extra.textContent = step.extra.doneLabel || "✓";
                extra.disabled = true;
            });
            bubble.append(extra);
        }
        bubble.append(actions);

        const target = visibleTarget(step.target);
        if (target) {
            target.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
            await sleep(prefersReducedMotion() ? 0 : 300);
        }
        place();
        actions.querySelector(".tour-next")?.focus();
    }

    const onKey = (e) => {
        if (e.key === "Escape") close("skipped");
        else if (e.key === "ArrowRight" && !active[index].finish && index < active.length - 1) show(index + 1);
        else if (e.key === "ArrowLeft" && index > 0) show(index - 1);
    };

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => layer.classList.add("visible"));
    show(0);
    return finished;
}
