// Rare omens in the sanctum: bats crossing the lamplight, or a draft that nearly puts
// the lamp out. At most one every 40-90 seconds, and only while nothing else is going
// on (isQuiet), so they unsettle rather than distract.
import * as sound from "./sound.js";

const EVERY = [40000, 90000];

const rand = (a, b) => a + Math.random() * (b - a);

export function startOmens(sanctum, { isQuiet }) {
    function omen() {
        if (!document.hidden && isQuiet()) {
            const flight = Math.random() < 0.55 && sanctum.bats();
            if (flight) {
                const side = flight.fromLeft ? -0.9 : 0.9;
                sound.wings({ from: side, to: -side, seconds: flight.seconds });
            } else {
                sound.wind({ pan: rand(-0.8, 0.8) });
                // The gust reaches the flame a moment after it is heard
                setTimeout(() => sanctum.draft(), 600);
            }
        }
        setTimeout(omen, rand(...EVERY));
    }
    setTimeout(omen, rand(...EVERY));
}
