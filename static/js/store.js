// What lives on this device: the family (people and their birth details), who the app is
// looking at right now, where you are, and preferences. The server stores nothing.
import { storage } from "./util.js";

const PEOPLE_KEY = "tarot_people";
const SUBJECT_KEY = "tarot_subject";
const HERE_KEY = "tarot_here";
const LEGACY_PROFILE_KEY = "tarot_profile";

export const RELATIONS = [
    ["self", "Me"],
    ["spouse", "Spouse"],
    ["mother", "Mother"],
    ["father", "Father"],
    ["son", "Son"],
    ["daughter", "Daughter"],
    ["brother", "Brother"],
    ["sister", "Sister"],
    ["grandparent", "Grandparent"],
    ["grandchild", "Grandchild"],
    ["friend", "Friend"],
    ["proposal", "Marriage proposal"],
    ["other", "Other"],
];
export const relationLabel = (key) => (RELATIONS.find(([k]) => k === key) || [key, key])[1];

const listeners = new Set();

// Called with the event name: "people", "subject", "here", "settings"
export function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit(what) {
    for (const fn of listeners) fn(what);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// --- People ---

// The single-profile app kept one profile; it becomes "Me"
function migrate() {
    if (storage.get(PEOPLE_KEY) !== null) return;
    const old = storage.json(LEGACY_PROFILE_KEY, null);
    if (!old) return;
    const me = {
        id: newId(),
        name: old.name || "Me",
        relation: "self",
        birth_date: old.birth_date || null,
        birth_time: old.birth_time || null,
        place: old.place ? { ...old.place, name: old.place.label || old.place.name } : null,
        events: [],
    };
    storage.setJson(PEOPLE_KEY, [me]);
    storage.set(SUBJECT_KEY, me.id);
}
migrate();

export function people() {
    const list = storage.json(PEOPLE_KEY, []);
    return Array.isArray(list) ? list : [];
}

export function person(id) {
    return people().find((p) => p.id === id) || null;
}

export function self() {
    return people().find((p) => p.relation === "self") || null;
}

export function savePerson(p) {
    const list = people();
    const record = { events: [], ...p, id: p.id || newId() };
    // Only one "Me"
    if (record.relation === "self") {
        for (const other of list) if (other.id !== record.id && other.relation === "self") other.relation = "other";
    }
    const i = list.findIndex((x) => x.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
    storage.setJson(PEOPLE_KEY, list);
    if (!subject()) setSubject(record.id);
    emit("people");
    return record;
}

export function removePerson(id) {
    storage.setJson(PEOPLE_KEY, people().filter((p) => p.id !== id));
    if (storage.get(SUBJECT_KEY) === id) storage.remove(SUBJECT_KEY);
    emit("people");
    emit("subject");
}

export function forgetEverything() {
    for (const key of [PEOPLE_KEY, SUBJECT_KEY, HERE_KEY, LEGACY_PROFILE_KEY, "tarot_journal"]) storage.remove(key);
    emit("people");
    emit("subject");
}

// Who Today, Ask and the Timeline are about (falls back to "Me", then anyone)
export function subject() {
    const id = storage.get(SUBJECT_KEY);
    return person(id) || self() || people()[0] || null;
}

export function setSubject(id) {
    storage.set(SUBJECT_KEY, id);
    emit("subject");
}

// --- Life events ---

export function addEvent(personId, event) {
    const p = person(personId);
    if (!p) return;
    p.events = [...(p.events || []), { ...event, id: newId() }];
    savePerson(p);
}

export function removeEvent(personId, eventId) {
    const p = person(personId);
    if (!p) return;
    p.events = (p.events || []).filter((e) => e.id !== eventId);
    savePerson(p);
}

// The shape the server expects
export function toProfile(p) {
    if (!p) return null;
    return {
        name: p.name || null,
        relation: p.relation || null,
        birth_date: p.birth_date || null,
        birth_time: p.birth_time || null,
        timezone: p.place?.timezone || null,
        latitude: p.place?.latitude ?? null,
        longitude: p.place?.longitude ?? null,
        events: (p.events || []).slice(0, 40).map(({ when, label }) => ({ when, label: label.slice(0, 80) })),
    };
}

export const hasBirthDate = (p) => !!p?.birth_date;
export const hasChart = (p) => !!(p?.birth_date && p?.birth_time && p?.place);

// --- Where you are now: for sunrise, Rahu Kaal and the calendar ---

export function here() {
    const saved = storage.json(HERE_KEY, null);
    if (saved) return saved;
    // Until set, assume the birth place of "Me"
    const me = self();
    return me?.place ? { ...me.place, assumed: true } : null;
}

export function setHere(place) {
    storage.setJson(HERE_KEY, place);
    emit("here");
}

// --- Settings ---

export const LANGUAGES = [
    ["en", "English"],
    ["hi", "हिन्दी Hindi"],
    ["kn", "ಕನ್ನಡ Kannada"],
    ["ta", "தமிழ் Tamil"],
    ["te", "తెలుగు Telugu"],
    ["ml", "മലയാളം Malayalam"],
    ["mr", "मराठी Marathi"],
    ["gu", "ગુજરાતી Gujarati"],
    ["bn", "বাংলা Bengali"],
];

const SETTINGS = {
    language: ["tarot_language", "en"],
    textSize: ["tarot_text_size", "normal"],
    theme: ["tarot_theme", "auto"],
    ritual: ["tarot_ritual", "on"],
    method: ["tarot_oracle", "auto"],
};

export function setting(name) {
    const [key, fallback] = SETTINGS[name];
    return storage.get(key) || fallback;
}

export function setSetting(name, value) {
    storage.set(SETTINGS[name][0], value);
    if (name === "theme") document.documentElement.dataset.theme = value;
    if (name === "textSize") document.documentElement.dataset.size = value;
    emit("settings");
}
