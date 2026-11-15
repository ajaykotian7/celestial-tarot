// City search (Open-Meteo, straight from the browser) with a "use my location" option.
import { el, button } from "./util.js";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

/*
 * A place picker: a search box, results, and the chosen place.
 * onChange(place | null), where place = { name, latitude, longitude, timezone }.
 * locate: offer "Use my location" (for where you are now, not a birth place).
 */
export function placePicker({ value = null, onChange, label = "Place", locate = false } = {}) {
    let chosen = value;
    let timer = null;
    const wrap = el("div", "field");
    const id = `place-${Math.random().toString(36).slice(2, 7)}`;
    const lab = el("label", null, label);
    lab.htmlFor = id;
    const input = el("input");
    input.id = id;
    input.type = "text";
    input.placeholder = "Search a city…";
    input.autocomplete = "off";
    const results = el("ul", "place-results");
    const chosenRow = el("div", "place-chosen");
    const chosenLabel = el("span");
    const clear = button("✕", null, () => {
        show(null);
        input.focus();
    });
    clear.setAttribute("aria-label", "Clear place");
    chosenRow.append(chosenLabel, clear);
    wrap.append(lab, input, chosenRow, results);

    if (locate) {
        const here = button("📍 Use my location", "link-btn", () => {
            if (!navigator.geolocation) return;
            here.textContent = "Finding you…";
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    here.textContent = "📍 Use my location";
                    show({
                        name: "My location",
                        latitude: Math.round(pos.coords.latitude * 1000) / 1000,
                        longitude: Math.round(pos.coords.longitude * 1000) / 1000,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    });
                },
                () => (here.textContent = "Couldn't get your location; search instead"),
                { timeout: 10000 }
            );
        });
        here.style.alignSelf = "flex-start";
        wrap.append(here);
    }

    function show(place) {
        chosen = place;
        chosenRow.hidden = !place;
        input.hidden = !!place;
        results.replaceChildren();
        if (place) chosenLabel.textContent = `📍 ${place.name}`;
        onChange?.(place);
    }

    async function search(query) {
        if (query.trim().length < 2) {
            results.replaceChildren();
            return;
        }
        try {
            const url = `${GEOCODE_URL}?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
            const data = await (await fetch(url)).json();
            const places = (data.results || []).filter((r) => r.timezone);
            results.replaceChildren(
                ...places.map((r) => {
                    const name = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
                    const item = el("li");
                    item.append(
                        button(name, "place-option", () =>
                            show({ name, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone })
                        )
                    );
                    return item;
                })
            );
            if (!places.length) results.append(el("li", "hint", "No places found."));
        } catch {
            results.replaceChildren(el("li", "hint", "Place search is unavailable right now."));
        }
    }

    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => search(input.value), 350);
    });
    chosenRow.hidden = true;
    if (value) {
        chosen = value;
        chosenRow.hidden = false;
        input.hidden = true;
        chosenLabel.textContent = `📍 ${value.name}`;
    }
    return { node: wrap, get value() { return chosen; } };
}
