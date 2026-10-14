// Shared helpers for the Celestial Tarot frontend.

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReducedMotion() {
    return motionQuery.matches;
}

export function onReducedMotionChange(callback) {
    motionQuery.addEventListener("change", () => callback(motionQuery.matches));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build an element with plain-text content (never parsed as HTML)
export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
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
};

// Haptic tick on supporting devices (Android browsers; iOS Safari has no vibrate API)
export function buzz(pattern) {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        /* unsupported */
    }
}
