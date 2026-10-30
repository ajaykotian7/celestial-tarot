// The sanctum: the page sits in the dark of an old temple's inner chamber, lit only
// by the lamp the querent carries. The lamp follows the pointer, a finger, or keyboard
// focus; its light reveals carvings on the walls. Watchers gather in the dark: eyes
// that creep toward the reading and wait at the edge of the light until the lamp is
// carried to them. They are drawn above the page, so they can't hide behind it.
// With reduced motion the lamp holds still and steady, and nothing watches.
import { prefersReducedMotion, onReducedMotionChange } from "./util.js";

const MOODS = {
    calm: { light: "255, 172, 88", eyes: "255, 190, 105", dark: "5, 3, 2" },
    witching: { light: "255, 104, 92", eyes: "255, 54, 64", dark: "7, 1, 3" },
};

// How dark the chamber is beyond the lamp, and how often eyes appear (ms)
const DEPTHS = {
    normal: { darkness: 0.86, reach: 1, eyesEvery: [15000, 35000] },
    amavasya: { darkness: 0.93, reach: 0.82, eyesEvery: [8000, 20000] },
};

// The kinds of watcher. color: null takes the mood's (amber, or red after midnight).
// pupil: slit width and height as fractions of the eye, or null for blank eyes.
// The temple cat means no harm: it doesn't creep, doesn't cloud readings, and when
// the light finds it, it simply wanders off.
const WATCHERS = [
    { kind: "ember", weight: 4, color: null, size: [4.5, 8], gap: 3.4, open: 0.55, pupil: [0.22, 0.5], blink: 170 },
    { kind: "serpent", weight: 2.5, color: "190, 222, 92", size: [4, 6.5], gap: 3, open: 0.38, pupil: [0.08, 0.4], blink: 0 },
    { kind: "pale", weight: 2, color: "226, 230, 236", size: [3.5, 5.5], gap: 2.6, open: 0.5, pupil: null, blink: 120 },
    { kind: "cat", weight: 1.5, color: "150, 222, 118", size: [5, 7.5], gap: 3.1, open: 0.8, pupil: [0.16, 0.72], blink: 420, harmless: true },
];

function pickWatcher() {
    let roll = Math.random() * WATCHERS.reduce((sum, w) => sum + w.weight, 0);
    return WATCHERS.find((w) => (roll -= w.weight) < 0) || WATCHERS[0];
}

const coarsePointer = window.matchMedia("(pointer: coarse)");

// watchers: the canvas above the page for the eyes (and bats). focus() gives the point
// they creep toward (the reading), or null. onWatch({ kind, pan }) runs when eyes
// appear, onFlee({ kind, pan }) when the lamp catches them; pan is -1 (left) to 1.

export function startSanctum(canvas, veil, { watchers, focus, onWatch, onFlee } = {}) {
    const ctx = canvas.getContext("2d");
    const wctx = watchers.getContext("2d");
    const root = document.documentElement;
    const carvings = document.createElement("canvas");
    let width = 0;
    let height = 0;
    let colors = MOODS.calm;
    let depth = DEPTHS.normal;
    let still = prefersReducedMotion();

    const lamp = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let flareUntil = 0;
    let relitAt = -Infinity;
    let draftAt = -Infinity;
    let bats = [];
    let eyes = null;
    // Nothing watches until the sanctum is entered (see wake)
    let awake = false;
    let nextEyesAt = Infinity;
    let veilKey = "";
    let lastFrame = performance.now();

    const rand = (a, b) => a + Math.random() * (b - a);

    function baseRadius() {
        const short = Math.min(width, height);
        // No hover on phones, so the light reaches further from where the finger left it
        const r = coarsePointer.matches ? short * 0.62 : short * 0.42;
        return Math.max(170, Math.min(r, 420)) * depth.reach;
    }

    // --- Carvings: drawn once per size, then lit by the lamp ---

    function carve(c, path, lineWidth = 1.4) {
        c.lineWidth = lineWidth;
        c.strokeStyle = "rgba(0, 0, 0, 0.65)";
        c.save();
        c.translate(1.2, 1.4);
        path();
        c.stroke();
        c.restore();
        c.strokeStyle = "rgba(226, 184, 128, 0.2)";
        path();
        c.stroke();
    }

    function drawCarvings() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        carvings.width = Math.round(width * dpr);
        carvings.height = Math.round(height * dpr);
        const c = carvings.getContext("2d");
        c.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Worn stone
        for (let i = 0, n = (width * height) / 160; i < n; i++) {
            c.fillStyle = `rgba(${Math.random() < 0.5 ? "190, 150, 105" : "0, 0, 0"}, ${rand(0.03, 0.1)})`;
            c.fillRect(Math.random() * width, Math.random() * height, rand(1, 3), rand(1, 3));
        }

        // Pillars with carved bands and lotus petals
        const pw = Math.max(36, Math.min(width * 0.07, 110));
        for (const x of [width * 0.025, width * 0.975 - pw]) {
            carve(c, () => {
                c.beginPath();
                c.rect(x, -10, pw, height + 20);
            }, 2);
            for (let y = 60; y < height; y += 120) {
                carve(c, () => {
                    c.beginPath();
                    c.moveTo(x, y);
                    c.lineTo(x + pw, y);
                    c.moveTo(x, y + 10);
                    c.lineTo(x + pw, y + 10);
                });
                const petals = Math.max(2, Math.round(pw / 18));
                const step = pw / petals;
                carve(c, () => {
                    c.beginPath();
                    for (let p = 0; p < petals; p++) {
                        const cx = x + step * (p + 0.5);
                        c.moveTo(cx - step / 2, y + 10);
                        c.quadraticCurveTo(cx, y + 34, cx + step / 2, y + 10);
                    }
                });
            }
        }

        // The arch over the doorway
        const ax = width / 2;
        const ar = Math.min(width * 0.46, 560);
        const ay = ar * 0.55;
        for (const r of [ar, ar - 14]) {
            carve(c, () => {
                c.beginPath();
                c.arc(ax, ay, r, Math.PI * 1.04, Math.PI * 1.96);
            }, 1.8);
        }
        carve(c, () => {
            c.beginPath();
            for (let a = Math.PI * 1.08; a < Math.PI * 1.93; a += 0.07) {
                const [x1, y1] = [ax + Math.cos(a) * (ar - 14), ay + Math.sin(a) * (ar - 14)];
                const [x2, y2] = [ax + Math.cos(a) * (ar - 32), ay + Math.sin(a) * (ar - 32)];
                c.moveTo(x1, y1);
                c.lineTo(x2, y2);
            }
        });

        // A yantra on the far wall: bhupura with gates, lotus rings, interlocking triangles
        const yx = width / 2;
        const yy = height * 0.56;
        const ys = Math.min(width, height) * 0.36;
        carve(c, () => {
            c.beginPath();
            const g = ys * 0.22;
            const s = ys;
            c.moveTo(yx - g, yy - s);
            c.lineTo(yx - s, yy - s);
            c.lineTo(yx - s, yy - g);
            c.moveTo(yx - s, yy + g);
            c.lineTo(yx - s, yy + s);
            c.lineTo(yx - g, yy + s);
            c.moveTo(yx + g, yy + s);
            c.lineTo(yx + s, yy + s);
            c.lineTo(yx + s, yy + g);
            c.moveTo(yx + s, yy - g);
            c.lineTo(yx + s, yy - s);
            c.lineTo(yx + g, yy - s);
        }, 1.8);
        for (const [r, petals] of [[ys * 0.9, 16], [ys * 0.72, 8]]) {
            carve(c, () => {
                c.beginPath();
                c.arc(yx, yy, r * 0.82, 0, Math.PI * 2);
                for (let p = 0; p < petals; p++) {
                    const a0 = (p / petals) * Math.PI * 2;
                    const a1 = ((p + 1) / petals) * Math.PI * 2;
                    const am = (a0 + a1) / 2;
                    c.moveTo(yx + Math.cos(a0) * r * 0.82, yy + Math.sin(a0) * r * 0.82);
                    c.quadraticCurveTo(
                        yx + Math.cos(am) * r * 1.12,
                        yy + Math.sin(am) * r * 1.12,
                        yx + Math.cos(a1) * r * 0.82,
                        yy + Math.sin(a1) * r * 0.82
                    );
                }
            });
        }
        carve(c, () => {
            c.beginPath();
            for (let t = 0; t < 9; t++) {
                const up = t % 2 === 0;
                const size = ys * (0.52 - t * 0.045);
                const shift = (up ? -1 : 1) * ys * 0.04 * (t % 3);
                const tip = up ? -size : size;
                c.moveTo(yx, yy + tip + shift);
                c.lineTo(yx - size * 0.87, yy - tip / 2 + shift);
                c.lineTo(yx + size * 0.87, yy - tip / 2 + shift);
                c.closePath();
            }
            c.moveTo(yx + 3, yy);
            c.arc(yx, yy, 3, 0, Math.PI * 2);
        });
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const first = !width;
        width = document.documentElement.clientWidth;
        height = window.innerHeight;
        for (const [c, context] of [[canvas, ctx], [watchers, wctx]]) {
            c.width = Math.round(width * dpr);
            c.height = Math.round(height * dpr);
            c.style.width = `${width}px`;
            c.style.height = `${height}px`;
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        if (first) {
            target.x = lamp.x = width / 2;
            target.y = lamp.y = height * 0.4;
        }
        drawCarvings();
    }

    // --- The watchers in the dark ---

    function spawnEyes(now, radius) {
        for (let tries = 0; tries < 12; tries++) {
            const x = rand(width * 0.06, width * 0.94);
            const y = rand(height * 0.08, height * 0.9);
            if (Math.hypot(x - lamp.x, y - lamp.y) > radius * 1.25 + 40) {
                const type = pickWatcher();
                const size = rand(...type.size);
                // They linger until the light finds them, then give up for a while
                eyes = { type, x, y, size, gap: size * type.gap, born: now, life: rand(20000, 30000), blinkAt: now + rand(1400, 3000) };
                onWatch?.({ kind: type.kind, pan: panOf(x) });
                return;
            }
        }
    }

    const panOf = (x) => (x / width) * 2 - 1;

    function drawEyes(now, radius, dt) {
        if (!eyes) return;
        const { type } = eyes;
        // Creep toward the reading, but stop at the edge of the light and wait there
        const goal = focus?.();
        if (goal && !eyes.fleeing && !type.harmless) {
            const dx = goal.x - eyes.x;
            const dy = goal.y - eyes.y;
            const dist = Math.hypot(dx, dy);
            const step = Math.min(dist, (dt / 1000) * 22);
            const nx = eyes.x + (dx / (dist || 1)) * step;
            const ny = eyes.y + (dy / (dist || 1)) * step;
            if (Math.hypot(nx - lamp.x, ny - lamp.y) > radius * 1.1) {
                eyes.x = nx;
                eyes.y = ny;
            }
        }
        const near = Math.hypot(eyes.x - lamp.x, eyes.y - lamp.y) < radius * 0.95;
        // Caught in the light: gone almost at once (the cat just strolls off)
        const fadeOut = type.harmless ? 1600 : 220;
        if (near && !eyes.fleeing) {
            eyes.fleeing = true;
            if (!type.harmless) onFlee?.({ kind: type.kind, pan: panOf(eyes.x) });
            eyes.life = Math.min(eyes.life, now - eyes.born + fadeOut);
        }
        const age = now - eyes.born;
        if (age > eyes.life) {
            eyes = null;
            nextEyesAt = now + rand(...depth.eyesEvery);
            return;
        }
        const alpha = Math.min(1, age / 1300, (eyes.life - age) / (eyes.fleeing ? fadeOut : 1000));
        // Serpents never blink
        if (type.blink && now > eyes.blinkAt + type.blink) eyes.blinkAt = now + rand(2500, 6000);
        const sinceBlink = Math.abs(now - eyes.blinkAt);
        const open = type.blink && sinceBlink < type.blink ? Math.max(0.08, sinceBlink / type.blink) : 1;
        const color = type.color || colors.eyes;
        // They stare at the reading, not at you
        const seen = goal || lamp;
        const look = Math.atan2(seen.y - eyes.y, seen.x - eyes.x);
        const ctx = wctx;

        for (const side of [-1, 1]) {
            const x = eyes.x + (side * eyes.gap) / 2;
            const halo = ctx.createRadialGradient(x, eyes.y, 0, x, eyes.y, eyes.size * 3);
            halo.addColorStop(0, `rgba(${color}, ${0.25 * alpha})`);
            halo.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = halo;
            ctx.fillRect(x - eyes.size * 3, eyes.y - eyes.size * 3, eyes.size * 6, eyes.size * 6);

            ctx.fillStyle = `rgba(${color}, ${0.85 * alpha})`;
            ctx.beginPath();
            ctx.ellipse(x, eyes.y, eyes.size * 1.4, eyes.size * type.open * open, 0, 0, Math.PI * 2);
            ctx.fill();
            if (!type.pupil) continue;
            const [pw, ph] = type.pupil;
            ctx.fillStyle = `rgba(0, 0, 0, ${0.85 * alpha})`;
            ctx.beginPath();
            ctx.ellipse(
                x + Math.cos(look) * eyes.size * 0.45,
                eyes.y + Math.sin(look) * eyes.size * 0.15,
                eyes.size * pw,
                eyes.size * ph * open,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    // --- Bats crossing the lamplight: dark shapes, seen only against the light ---

    function drawBats(now) {
        bats = bats.filter((b) => now - b.born < b.life);
        for (const b of bats) {
            const t = (now - b.born) / b.life;
            if (t < 0) continue;
            const x = b.x0 + (b.x1 - b.x0) * t;
            const y = b.y0 + (b.y1 - b.y0) * t + Math.sin(t * Math.PI * 3 + b.phase) * 18;
            const s = b.size;
            const f = Math.sin(now * b.flap + b.phase);
            wctx.fillStyle = "rgba(6, 4, 3, 0.88)";
            wctx.beginPath();
            for (const side of [-1, 1]) {
                wctx.moveTo(x, y);
                wctx.quadraticCurveTo(x + side * s * 0.7, y - s * (0.2 + 0.8 * f), x + side * s * 1.7, y - s * 0.5 * f);
                wctx.quadraticCurveTo(x + side * s * 1.1, y + s * 0.05, x + side * s * 0.35, y + s * 0.3);
                wctx.closePath();
            }
            wctx.ellipse(x, y, s * 0.22, s * 0.38, 0, 0, Math.PI * 2);
            wctx.fill();
        }
    }

    // --- Each frame ---

    function draw(now) {
        if (still) {
            lamp.x = target.x;
            lamp.y = target.y;
        } else {
            // Carried, not pinned: the lamp trails the hand and sways a little
            lamp.x += (target.x + Math.sin(now * 0.0007) * 9 - lamp.x) * 0.1;
            lamp.y += (target.y + Math.sin(now * 0.0011) * 6 - lamp.y) * 0.1;
        }
        const flare = now < flareUntil ? 1 + 0.45 * ((flareUntil - now) / 2600) : 1;
        const flicker = still
            ? 1
            : 1 + 0.035 * Math.sin(now * 0.011) + 0.025 * Math.sin(now * 0.027 + 1.3) + (Math.random() - 0.5) * 0.02;
        const dt = Math.min(100, now - lastFrame);
        lastFrame = now;
        // After the lamp has gone out it catches again, slowly
        const relit = Math.min(1, Math.max(0.2, (now - relitAt) / 2800));
        // A draft: the flame bows to an ember in half a second, then recovers
        const sinceDraft = now - draftAt;
        const gust =
            sinceDraft < 500 ? 1 - 0.78 * (sinceDraft / 500) : Math.min(1, 0.22 + 0.78 * ((sinceDraft - 500) / 3200));
        const base = baseRadius() * flare * relit * gust;
        const radius = base * flicker;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(carvings, 0, 0, width, height);

        const dark = ctx.createRadialGradient(lamp.x, lamp.y, radius * 0.06, lamp.x, lamp.y, radius);
        dark.addColorStop(0, `rgba(${colors.dark}, 0)`);
        dark.addColorStop(0.5, `rgba(${colors.dark}, ${depth.darkness * 0.45})`);
        dark.addColorStop(1, `rgba(${colors.dark}, ${depth.darkness})`);
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = "lighter";
        const warm = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, radius * 0.85);
        warm.addColorStop(0, `rgba(${colors.light}, ${0.12 * flicker})`);
        warm.addColorStop(1, `rgba(${colors.light}, 0)`);
        ctx.fillStyle = warm;
        ctx.fillRect(lamp.x - radius, lamp.y - radius, radius * 2, radius * 2);
        ctx.globalCompositeOperation = "source-over";

        wctx.clearRect(0, 0, width, height);
        drawBats(now);
        if (!still) {
            if (awake && !eyes && now > nextEyesAt) spawnEyes(now, radius);
            drawEyes(now, radius, dt);
        }

        // The veil above the page follows the lamp too, without the flicker
        const key = `${Math.round(lamp.x)},${Math.round(lamp.y)},${Math.round(base)}`;
        if (key !== veilKey) {
            veilKey = key;
            root.style.setProperty("--lamp-x", `${lamp.x.toFixed(0)}px`);
            root.style.setProperty("--lamp-y", `${lamp.y.toFixed(0)}px`);
            root.style.setProperty("--lamp-r", `${base.toFixed(0)}px`);
        }

        requestAnimationFrame(draw);
    }

    function moveTo(x, y) {
        target.x = x;
        target.y = y;
    }

    window.addEventListener("pointermove", (e) => moveTo(e.clientX, e.clientY), { passive: true });
    window.addEventListener("pointerdown", (e) => moveTo(e.clientX, e.clientY), { passive: true });
    // Touch scrolling cancels pointer events, so follow the finger while it scrolls too
    window.addEventListener(
        "touchmove",
        (e) => e.touches[0] && moveTo(e.touches[0].clientX, e.touches[0].clientY),
        { passive: true }
    );
    // Keyboard users carry the lamp with focus
    document.addEventListener("focusin", (e) => {
        if (!(e.target instanceof Element) || e.target === document.body) return;
        const rect = e.target.getBoundingClientRect();
        if (rect.width) moveTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    window.addEventListener("resize", resize);
    onReducedMotionChange((reduce) => {
        still = reduce;
        if (reduce) eyes = null;
    });

    veil.hidden = false;
    watchers.hidden = false;
    resize();
    requestAnimationFrame(draw);

    return {
        setMood(mood) {
            colors = MOODS[mood] || MOODS.calm;
        },
        // "amavasya": a moonless night, darker, with more watchers
        setDepth(name) {
            depth = DEPTHS[name] || DEPTHS.normal;
        },
        // The light swells for a moment, e.g. as the cards turn
        flare() {
            flareUntil = performance.now() + 2600;
        },
        // The lamp gutters to almost nothing and slowly catches again
        relight() {
            relitAt = performance.now();
        },
        // The querent has entered: the first watcher comes soon, as visitors may not stay long
        wake() {
            awake = true;
            nextEyesAt = performance.now() + rand(6000, 12000);
        },
        // A question is being written: the watchers come sooner
        beckon() {
            if (!eyes && !still) nextEyesAt = Math.min(nextEyesAt, performance.now() + rand(1500, 4000));
        },
        // Eyes are in the dark, uncaught (the temple cat doesn't count)
        isWatched() {
            return !!eyes && !eyes.fleeing && !eyes.type.harmless;
        },
        // A few bats cross the lamplight. Returns where they fly, for the sound, or null.
        bats() {
            if (still) return null;
            const now = performance.now();
            const fromLeft = Math.random() < 0.5;
            const seconds = rand(1.6, 2.4);
            const count = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                const y = lamp.y + rand(-140, 80);
                bats.push({
                    x0: fromLeft ? -40 : width + 40,
                    x1: fromLeft ? width + 40 : -40,
                    y0: y,
                    y1: y + rand(-120, 60),
                    born: now + i * rand(120, 380),
                    life: seconds * 1000 * rand(0.85, 1.15),
                    size: rand(9, 15),
                    flap: rand(0.035, 0.05),
                    phase: rand(0, Math.PI * 2),
                });
            }
            return { fromLeft, seconds };
        },
        // A gust nearly puts the lamp out
        draft() {
            if (!still) draftAt = performance.now();
        },
    };
}
