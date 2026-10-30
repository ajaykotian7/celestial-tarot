// The pre-reading ritual: the question is carved into a sigil, then breathe, cut the
// deck and choose a pile (or, for the cowries, let the shells fall).
// It is ceremony only (the server draws the cards at random), and it runs while the
// reading is being fetched, so it fills the wait rather than adding to it.
import { sleep } from "./util.js";
import * as sound from "./sound.js";
import { drawSigil } from "./sigil.js";

const BREATH_SECONDS = 4;

// oracle: "tarot", "kaudi", or "auto", in which case chosen resolves to the oracle the
// reading actually used ("tarot", "kaudi", or null if it failed) and the ritual waits
// for it before its last step, so the cut matches what is revealed.
export function runRitual(question, { oracle = "auto", chosen = Promise.resolve(null) } = {}) {
    const overlay = document.getElementById("ritual");
    const questionEl = document.getElementById("ritual-question");
    const instruction = document.getElementById("ritual-instruction");
    const orb = document.getElementById("breath-orb");
    const sigil = document.getElementById("ritual-sigil");
    const deck = document.getElementById("cut-deck");
    const piles = [...deck.querySelectorAll(".pile")];
    const skipBtn = document.getElementById("ritual-skip");
    const castBtn = document.getElementById("ritual-cast");

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
        orb.className = "breath-orb dim";
        orb.hidden = false;
        drawSigil(sigil, question);
        sigil.setAttribute("class", "sigil");
        sigil.toggleAttribute("hidden", false);
        deck.hidden = true;
        castBtn.hidden = true;
        deck.className = "cut-deck";
        piles.forEach((p) => p.classList.remove("chosen"));
        overlay.hidden = false;
        // Next frame, so the fade-in transition runs
        requestAnimationFrame(() => overlay.classList.add("visible"));

        say("Your question is carved into the stone…");
        // Next frame, so the carving animation starts from nothing
        requestAnimationFrame(() => sigil.classList.add("carving"));
        await wait(3400);
        if (isSkipped) return;

        orb.classList.replace("dim", "inhale");
        sigil.classList.add("lit");
        sound.breath({ inhale: true, seconds: BREATH_SECONDS });
        say("Breathe in…");
        await wait(BREATH_SECONDS * 1000);
        if (isSkipped) return;

        orb.classList.replace("inhale", "exhale");
        sigil.classList.remove("lit");
        sound.breath({ inhale: false, seconds: BREATH_SECONDS });
        say("…and breathe out.");
        await wait(BREATH_SECONDS * 1000);
        if (isSkipped) return;

        // The sigil sinks into the deck
        sigil.classList.add("sinking");
        await wait(700);
        if (isSkipped) return;

        sigil.toggleAttribute("hidden", true);

        let finale = oracle;
        if (oracle === "auto") {
            orb.className = "breath-orb dim waiting";
            say("The oracle is choosing…");
            finale = await Promise.race([chosen, skipped]);
            if (isSkipped || !finale) return;
            say(finale === "kaudi" ? "The oracle has chosen the cowries." : "The oracle has chosen the cards.");
            await wait(1300);
            if (isSkipped) return;
        }
        orb.hidden = true;

        if (finale === "kaudi") {
            castBtn.hidden = false;
            say("Cup the cowries in your hands…");
            await waitForClick([castBtn]);
            if (isSkipped) return;
            sound.cowries();
            castBtn.classList.add("released");
            say("The shells have fallen.");
            await wait(1400);
            return;
        }

        deck.hidden = false;
        say("Tap the deck to cut it.");
        await waitForClick(piles);
        if (isSkipped) return;

        sound.cut();
        deck.classList.add("cut");
        say("Choose a pile.");
        const pile = await waitForClick(piles);
        if (isSkipped) return;

        sound.flip();
        pile.classList.add("chosen");
        deck.classList.add("decided");
        say("The deck remembers your touch…");
        await wait(1400);
    }

    return sequence().finally(async () => {
        document.removeEventListener("keydown", onKey);
        piles.forEach((p) => (p.onclick = null));
        castBtn.onclick = null;
        castBtn.classList.remove("released");
        overlay.classList.remove("visible");
        await sleep(400);
        overlay.hidden = true;
    });
}
