// Shared helpers for the Celestial frontend.

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReducedMotion() {
    return motionQuery.matches;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build an element with plain-text content (never parsed as HTML)
export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

// A button with text, a class and a click handler
export function button(text, className, onClick) {
    const node = el("button", className, text);
    node.type = "button";
    if (onClick) node.addEventListener("click", onClick);
    return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.append(node);
    return node;
}

// localStorage can throw (private mode, blocked storage), so every access is guarded
export const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* preference just won't persist */
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            /* nothing to clean up */
        }
    },
    json(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch {
            return fallback;
        }
    },
    setJson(key, value) {
        this.set(key, JSON.stringify(value));
    },
};

// Haptic tick on supporting devices (Android browsers; iOS Safari has no vibrate API)
export function buzz(pattern) {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        /* unsupported */
    }
}

// --- Dates and times ---

export function localDate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-11-15" as a local Date (not UTC midnight)
export function parseDate(iso) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + days);
    return localDate(d);
}

export function fmtDate(iso, options = { day: "numeric", month: "short", year: "numeric" }) {
    return parseDate(iso).toLocaleDateString(undefined, options);
}

export const monthYear = (iso) => fmtDate(iso, { month: "short", year: "numeric" });

// A time from the server (ISO with offset), shown in the place's own time zone
export function fmtTime(iso, timeZone) {
    try {
        return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
    } catch {
        return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
}

export function span(a, b, timeZone) {
    return `${fmtTime(a, timeZone)} – ${fmtTime(b, timeZone)}`;
}

export const ordinal = (n) => `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n] || "th"}`;

// A steady colour for a person's avatar, from their name
export function hueOf(text) {
    let h = 0;
    for (const ch of text || "?") h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}

export function initial(name) {
    return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

export function avatar(person, className = "avatar") {
    const node = el("span", className, initial(person?.name));
    node.style.setProperty("--hue", hueOf(person?.name));
    node.setAttribute("aria-hidden", "true");
    return node;
}

export function deva(text, className = "deva") {
    const node = el("span", className, text);
    node.lang = "sa";
    return node;
}

// --- Toast ---

let toastTimer = null;

export function toast(message, ms = 2600) {
    const node = document.getElementById("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (node.hidden = true), ms);
}

// A small "loading" line
export function loading(text = "Reading the sky…") {
    return el("p", "status-msg", text);
}
