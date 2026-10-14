// The pre-reading ritual: hold the question, breathe, cut the deck, choose a pile.
// It is ceremony only (the server draws the cards at random), and it runs while the
// reading is being fetched, so it fills the wait rather than adding to it.
import { sleep } from "./util.js";
import * as sound from "./sound.js";

const BREATH_SECONDS = 4;

export function runRitual(question) {
    const overlay = document.getElementById("ritual");
    const questionEl = document.getElementById("ritual-question");
    const instruction = document.getElementById("ritual-instruction");
    const orb = document.getElementById("breath-orb");
    const deck = document.getElementById("cut-deck");
    const piles = [...deck.querySelectorAll(".pile")];
    const skipBtn = document.getElementById("ritual-skip");

    let skip;
    const skipped = new Promise((resolve) => (skip = resolve));
    let isSkipped = false;
    skipped.then(() => (isSkipped = true));

    const onKey = (e) => {
        if (e.key === "Escape") skip();
    };
    skipBtn.onclick = skip;
    document.addEventListener("keydown", onKey);

    const wait = (ms) => Promise.race([sleep(ms), skipped]);
    const waitForClick = (targets) =>
        Promise.race([
            new Promise((resolve) => {
                for (const t of targets) t.onclick = () => resolve(t);
            }),
            skipped,
        ]);
    const say = (text) => (instruction.textContent = text);

    async function sequence() {
        questionEl.textContent = `“${question}”`;
        orb.className = "breath-orb";
        orb.hidden = false;
        deck.hidden = true;
        deck.className = "cut-deck";
        piles.forEach((p) => p.classList.remove("chosen"));
        overlay.hidden = false;
        // Next frame, so the fade-in transition runs
        requestAnimationFrame(() => overlay.classList.add("visible"));

        say("Hold your question in mind…");
        await wait(2500);
        if (isSkipped) return;

        orb.classList.add("inhale");
        say("Breathe in…");
        await wait(BREATH_SECONDS * 1000);
        if (isSkipped) return;

        orb.classList.replace("inhale", "exhale");
        say("…and breathe out.");
        await wait(BREATH_SECONDS * 1000);
        if (isSkipped) return;

        orb.hidden = true;
        deck.hidden = false;
        say("Tap the deck to cut it.");
        await waitForClick(piles);
        if (isSkipped) return;

        sound.cut();
        deck.classList.add("cut");
        say("Choose a pile.");
        const chosen = await waitForClick(piles);
        if (isSkipped) return;

        sound.flip();
        chosen.classList.add("chosen");
        deck.classList.add("decided");
        say("The deck remembers your touch…");
        await wait(1400);
    }

    return sequence().finally(async () => {
        document.removeEventListener("keydown", onKey);
        piles.forEach((p) => (p.onclick = null));
        overlay.classList.remove("visible");
        await sleep(400);
        overlay.hidden = true;
    });
}
