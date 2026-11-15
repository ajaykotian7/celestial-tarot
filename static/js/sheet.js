// One bottom sheet, reused for pickers, forms and details. Opening a new sheet replaces
// the one that is open.
import { el } from "./util.js";

const $ = (id) => document.getElementById(id);
let lastFocus = null;
let onClose = null;

export function openSheet(title, content, { onClosed } = {}) {
    if ($("sheet").hidden) lastFocus = document.activeElement;
    onClose = onClosed || null;
    $("sheet-title").textContent = title;
    const body = $("sheet-body");
    body.replaceChildren(...(Array.isArray(content) ? content : [content]));
    $("sheet").hidden = false;
    $("sheet").querySelector(".sheet").scrollTop = 0;
    // Focus the first field, or the close button
    (body.querySelector("input, select, textarea") || $("sheet-close")).focus({ preventScroll: true });
}

export function closeSheet() {
    if ($("sheet").hidden) return false;
    $("sheet").hidden = true;
    $("sheet-body").replaceChildren();
    const done = onClose;
    onClose = null;
    done?.();
    lastFocus?.focus?.({ preventScroll: true });
    return true;
}

export function isOpen() {
    return !$("sheet").hidden;
}

export function initSheet() {
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet").addEventListener("click", (e) => {
        if (e.target === $("sheet")) closeSheet();
    });
}

// A yes/no question in the sheet; resolves true or false
export function confirmSheet(title, text, yes = "Yes", danger = false) {
    return new Promise((resolve) => {
        let answered = false;
        const answer = (value) => {
            answered = true;
            closeSheet();
            resolve(value);
        };
        const ok = el("button", "btn", yes);
        ok.type = "button";
        if (danger) ok.style.background = "var(--caution)";
        ok.addEventListener("click", () => answer(true));
        const no = el("button", "btn ghost", "Cancel");
        no.type = "button";
        no.addEventListener("click", () => answer(false));
        const row = el("div", "action-row");
        row.append(ok, no);
        openSheet(title, [el("p", null, text), el("br"), row], {
            onClosed: () => {
                if (!answered) resolve(false);
            },
        });
    });
}
