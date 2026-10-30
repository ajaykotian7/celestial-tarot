// Small ⓘ buttons that explain a term in a popover. A tap or click opens it (hover
// doesn't exist on phones); tapping elsewhere, scrolling or Escape closes it.
import { el } from "./util.js";

const GAP = 8;
const MARGIN = 12;

let open = null;

export function infoButton(title, text) {
    const btn = el("button", "info-btn", "i");
    btn.type = "button";
    btn.setAttribute("aria-label", `About ${title}`);
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", (e) => {
        // Inside a tile or panel, the tap is for the popover only
        e.stopPropagation();
        const same = open?.button === btn;
        close();
        if (!same) show(btn, title, text);
    });
    return btn;
}

function show(button, title, text) {
    const pop = el("div", "info-pop");
    pop.id = "info-pop";
    pop.setAttribute("role", "note");
    pop.append(el("strong", null, title), el("p", null, text));
    document.body.append(pop);

    // Below the button if it fits, otherwise above; never off the screen's edges
    const rect = button.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - w / 2), vw - w - MARGIN);
    const below = rect.bottom + GAP;
    const top = below + h <= vh - MARGIN ? below : Math.max(MARGIN, rect.top - GAP - h);
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px` });

    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-describedby", pop.id);
    open = { button, pop };
}

// Returns whether a popover was open, so Escape can close only the topmost layer
export function close() {
    if (!open) return false;
    open.pop.remove();
    open.button.setAttribute("aria-expanded", "false");
    open.button.removeAttribute("aria-describedby");
    open = null;
    return true;
}

document.addEventListener("click", (e) => {
    if (open && !open.pop.contains(e.target)) close();
});
document.addEventListener("scroll", close, true);
window.addEventListener("resize", close);
