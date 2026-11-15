// Ask: one consultation. The reader decides how to answer (the jataka for timing, with
// the cards or cowries for guidance), or you choose one way. Questions can be about
// anyone in the family.
import { el, button, buzz, localDate, avatar, toast } from "./util.js";
import * as store from "./store.js";
import { post, insightsFor } from "./api.js";
import * as sound from "./sound.js";
import { revealSpread, clearSpread, openLightbox } from "./cards.js";
import { revealKaudi } from "./kaudi.js";
import { revealJataka } from "./jataka.js";
import { runRitual } from "./ritual.js";
import * as journal from "./journal.js";
import { openSheet } from "./sheet.js";
import { shareReading, readingText } from "./share.js";

const $ = (id) => document.getElementById(id);

// The server only sends the last 6 messages to the model, so don't send more
const MAX_HISTORY_MESSAGES = 6;

export const TOPICS = [
    ["career", "💼 Career"],
    ["money", "💰 Money"],
    ["marriage", "💍 Marriage"],
    ["love", "❤️ Love"],
    ["health", "🌿 Health"],
    ["family", "🏠 Family"],
    ["children", "👶 Children"],
    ["studies", "📚 Studies"],
    ["travel", "✈️ Travel"],
    ["home", "🏡 Home & property"],
    ["spiritual", "🪔 Spiritual"],
];

const SUGGESTIONS = {
    null: ["What does this year hold?", "What should I focus on right now?", "When will things get easier?"],
    career: ["When will I get a better job?", "Is this a good time to change jobs?", "Will my business grow?"],
    money: ["When will my finances improve?", "Is this a good time to invest or buy?", "How can I reduce my debts?"],
    marriage: ["When will marriage happen?", "Is this proposal a good match?", "How can we bring more peace at home?"],
    love: ["Where is this relationship going?", "How can I heal after a breakup?", "What do I need to see about them?"],
    health: ["How can I take better care of myself this year?", "What does this period ask of my health?"],
    family: ["How can I support my parents now?", "How can we resolve the tension at home?"],
    children: ["When might we be blessed with a child?", "How can I guide my child this year?"],
    studies: ["How will my exams go?", "Which course should I choose?", "Is studying abroad right for me?"],
    travel: ["Will I settle abroad?", "Is this a good time to travel?"],
    home: ["When can we buy a house?", "Is this a good time to move?"],
    spiritual: ["What is my path right now?", "Which practice would help me most?"],
};

const METHODS = [
    ["auto", "Reader decides"],
    ["tarot", "🃏 Cards"],
    ["kaudi", "🐚 Kaudi"],
    ["jataka", "🪐 Jataka"],
];
const WAITING = {
    auto: "The reader is listening…",
    tarot: "Shuffling the deck…",
    kaudi: "Gathering the cowries…",
    jataka: "The grahas take their places…",
};

let ctx = null;
let topic = null;
const history = [];
let tableFull = false;
let busy = false;
let last = null;

export function init(context) {
    ctx = context;
    $("ask-btn").addEventListener("click", () => ask($("question").value, true));
    $("question").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask($("question").value, true);
    });
    $("follow-up").addEventListener("submit", (e) => {
        e.preventDefault();
        ask($("follow-up-input").value, false);
    });
    $("new-btn").addEventListener("click", reset);
    $("share-btn").addEventListener("click", () => last && shareReading(last));
    $("copy-btn").addEventListener("click", async () => {
        if (!last) return;
        try {
            await navigator.clipboard.writeText(readingText(last));
            toast("Copied");
        } catch {
            toast("Couldn't copy here");
        }
    });
    $("ask-person").addEventListener("click", () => ctx.pickPerson());
    renderTopics();
    renderMethod();
}

let readingFor = null;

export function render({ question, topic: chosen } = {}) {
    const person = store.subject();
    // A reading belongs to the person it was about
    if (tableFull && readingFor !== person?.id) reset();
    readingFor = person?.id || null;
    const chip = $("ask-person");
    chip.replaceChildren();
    if (person) {
        chip.append(avatar(person), person.name, " ▾");
        chip.querySelector(".avatar").style.width = chip.querySelector(".avatar").style.height = "24px";
    } else {
        chip.append("Add someone ▾");
    }
    if (chosen !== undefined) {
        topic = chosen;
        renderTopics();
    }
    if (question) {
        if (tableFull) reset();
        $("question").value = question;
        $("question").focus();
    }
    renderJournal();
}

function renderTopics() {
    const box = $("topic-chips");
    box.replaceChildren(
        ...TOPICS.map(([key, label]) => {
            const chip = button(label, "chip", () => {
                topic = topic === key ? null : key;
                renderTopics();
            });
            chip.setAttribute("aria-pressed", String(topic === key));
            return chip;
        })
    );
    $("suggestions").replaceChildren(
        ...(SUGGESTIONS[topic] || SUGGESTIONS.null).map((text) =>
            button(text, "suggestion", () => {
                $("question").value = text;
                $("question").focus();
            })
        )
    );
}

function renderMethod() {
    const box = $("method");
    const current = store.setting("method");
    box.replaceChildren(
        ...METHODS.map(([key, label]) => {
            const b = button(label, null, () => {
                store.setSetting("method", key);
                renderMethod();
            });
            b.setAttribute("aria-pressed", String(current === key));
            return b;
        })
    );
}

function renderJournal() {
    const person = store.subject();
    if (!person) {
        $("journal-list").replaceChildren();
        $("journal-empty").hidden = false;
        return;
    }
    journal.render($("journal-list"), $("journal-empty"), $("journal-count"), person.id, store.self()?.id, {
        onCardClick: openLightbox,
        onOpen: showPast,
    });
}

function showPast(entry) {
    const parts = [el("p", "muted", `“${entry.question}”`)];
    if (entry.tldr) {
        const box = el("div", "tldr-box");
        box.append(el("div", "eyebrow", "The takeaway"), el("div", "tldr-text", entry.tldr));
        parts.push(box);
    }
    parts.push(el("div", "narrative", entry.reply || ""));
    const share = button("Share", "btn small ghost", () =>
        shareReading({ ...entry, personName: store.person(entry.person)?.name })
    );
    const row = el("div", "reading-actions");
    row.append(share);
    parts.push(row);
    openSheet(new Date(entry.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }), parts);
}

function reset() {
    clearSpread($("cards-tray"), $("spread-legend"));
    $("tldr-box").hidden = true;
    $("dasha-ribbon").hidden = true;
    $("chat-output").replaceChildren();
    $("reading-actions").hidden = true;
    $("follow-up").hidden = true;
    $("idle").hidden = false;
    $("question").value = "";
    history.length = 0;
    tableFull = false;
    last = null;
    $("question").focus();
}

function asker(person) {
    const me = store.self();
    return person && me && person.id !== me.id ? me.name : null;
}

async function fetchReading(message, newReading, person, method) {
    return post("/api/chat", {
        message,
        history,
        new_reading: newReading,
        oracle: method,
        local_date: localDate(),
        profile: store.toProfile(person),
        asker: asker(person),
        topic,
        language: store.setting("language"),
        recent_readings: person ? journal.recentForOracle(person.id, store.self()?.id) : [],
    });
}

function needsChart(person) {
    const box = el("div");
    box.append(
        el("p", null, `A jataka needs ${person ? `${person.name}'s` : "a"} birth date, time and place.`),
        button(person ? `Add them for ${person.name}` : "Add someone", "btn small", () =>
            ctx.go("family", person ? { edit: person.id } : { add: true })
        )
    );
    $("chat-output").replaceChildren(box);
    $("idle").hidden = true;
}

async function ask(text, newReading) {
    text = (text || "").trim();
    if (!text || busy) return;
    const person = store.subject();
    const method = store.setting("method");
    if (newReading && method === "jataka" && !store.hasChart(person)) return needsChart(person);
    if (newReading && tableFull) reset();

    busy = true;
    const askBtn = $("ask-btn");
    askBtn.disabled = true;
    $("idle").hidden = true;
    $("tldr-box").hidden = true;
    $("reading-actions").hidden = true;
    if (newReading) {
        clearSpread($("cards-tray"), $("spread-legend"));
        $("dasha-ribbon").hidden = true;
        sound.startHeartbeat();
    }
    $("chat-output").replaceChildren(el("span", "status-msg", newReading ? WAITING[method] : "The reader is thinking…"));

    const reading = fetchReading(text, newReading, person, method).then(
        (data) => ({ data }),
        (error) => ({ error })
    );
    const chosen = reading.then(({ data }) =>
        data?.kaudi ? "kaudi" : data?.cards?.length ? "tarot" : data?.jataka ? "jataka" : null
    );
    if (newReading && store.setting("ritual") === "on") await runRitual(text, { oracle: method, chosen });

    const shuffling = newReading && method === "tarot";
    let shuffleTimer = null;
    if (shuffling) {
        $("shuffler").style.display = "flex";
        sound.shuffle();
        shuffleTimer = setInterval(sound.shuffle, 1200);
    }
    const { data, error } = await reading;
    clearInterval(shuffleTimer);
    $("shuffler").style.display = "none";

    try {
        if (error) throw error;
        if (data.cards?.length) {
            await revealSpread($("cards-tray"), $("spread-legend"), data.cards, data.spread, {
                onFlip: (i) => {
                    sound.flip();
                    sound.quickenHeartbeat();
                    if (data.cards[i].personal) {
                        sound.personal();
                        buzz([15, 80, 30]);
                    } else {
                        buzz(15);
                    }
                },
            });
        }
        if (data.kaudi) {
            await revealKaudi($("cards-tray"), $("spread-legend"), data.kaudi, {
                onCast: () => {
                    sound.cowries();
                    sound.quickenHeartbeat(10);
                    buzz([10, 40, 10]);
                },
                onCount: sound.tick,
            });
        }
        if (newReading && data.jataka) {
            const insights = person ? (await insightsFor(person).catch(() => null))?.insights : null;
            if (!data.cards?.length && !data.kaudi && insights?.jataka) {
                await revealJataka($("cards-tray"), $("spread-legend"), insights.jataka, data.jataka, {
                    onPlace: () => {
                        sound.tick();
                        buzz(8);
                    },
                });
            } else {
                const ribbon = $("dasha-ribbon");
                ribbon.replaceChildren(
                    "🪐 Read with ",
                    el("b", null, `${data.jataka.mahadasha} mahadasha`),
                    " · ",
                    el("b", null, `${data.jataka.antardasha} antardasha`)
                );
                ribbon.hidden = false;
            }
        }
        sound.stopHeartbeat();

        if (data.tldr) {
            $("tldr-text").textContent = data.tldr;
            $("tldr-box").hidden = false;
            sound.chime();
        }
        $("chat-output").replaceChildren(document.createTextNode(data.reply));

        history.push({ role: "user", content: text });
        history.push({ role: "assistant", content: (data.tldr ? `[TL;DR: ${data.tldr}]\n` : "") + data.reply });
        if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);

        const readSomething = data.cards?.length || data.kaudi || data.jataka;
        if (newReading) {
            last = {
                question: text,
                tldr: data.tldr,
                reply: data.reply,
                cards: data.cards || [],
                kaudi: data.kaudi?.heaps || null,
                jataka: data.jataka ? `${data.jataka.mahadasha}–${data.jataka.antardasha}` : null,
                personName: person?.name,
                date: localDate(),
            };
        } else if (last) {
            last.reply += `\n\n${text}\n${data.reply}`;
        }
        if (newReading && readSomething && person) {
            journal.add({ person: person.id, ...last, kaudi: data.kaudi?.heaps || null, spread: data.spread });
            renderJournal();
        }
        tableFull = tableFull || !!readSomething;
        $("reading-actions").hidden = !last;
        $("follow-up").hidden = !tableFull;
        $("follow-up-input").value = "";
        if (newReading) $("question").value = "";
    } catch (err) {
        $("chat-output").replaceChildren(el("span", "error-text", err.message));
        if (!tableFull) $("idle").hidden = false;
    } finally {
        sound.stopHeartbeat();
        busy = false;
        askBtn.disabled = false;
    }
}
