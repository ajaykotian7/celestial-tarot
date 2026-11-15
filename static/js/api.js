// Talking to our server. Every request carries the passphrase; a 401 means it changed,
// so the app locks itself again.
import { storage, localDate } from "./util.js";
import { toProfile } from "./store.js";

export const PIN_KEY = "tarot_pin";

export class ApiError extends Error {}

export async function post(path, body) {
    let res;
    try {
        res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-app-pin": storage.get(PIN_KEY) || "" },
            body: JSON.stringify(body),
        });
    } catch {
        throw new ApiError("Couldn't reach the server. Check your connection.");
    }
    if (res.status === 401 && path !== "/api/verify-pin") {
        storage.remove(PIN_KEY);
        location.reload();
        throw new ApiError("Locked.");
    }
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 422 validation errors return `detail` as a list, not a string
        throw new ApiError(typeof data.detail === "string" ? data.detail : `Server error (${res.status})`);
    }
    return res.json();
}

export async function verifyPin(pin) {
    const res = await fetch("/api/verify-pin", { method: "POST", headers: { "x-app-pin": pin || "" } });
    return res.status;
}

// Insights per person and day, cached for the session: they only change with the
// birth details or the date
const insightCache = new Map();

export function insightsFor(person) {
    const profile = toProfile(person);
    const key = JSON.stringify({ ...profile, events: undefined, date: localDate() });
    if (!insightCache.has(key)) {
        const request = post("/api/insights", { profile, local_date: localDate() }).catch((e) => {
            insightCache.delete(key);
            throw e;
        });
        insightCache.set(key, request);
    }
    return insightCache.get(key);
}

export const placeBody = (place) => ({
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
});
