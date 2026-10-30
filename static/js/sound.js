// Ambient sound and effects with the Web Audio API. Four public-domain (CC0) recordings
// in static/audio/ (tanpura drone, temple bell, breaths, ghungroo) load once sound is on;
// everything else is synthesised, and synthesised stand-ins play until a recording loads.
// Sound is off by default. Browsers only allow audio after a user gesture, so the
// AudioContext is created lazily from a click or tap.
import { storage } from "./util.js";

const STORAGE_KEY = "tarot_sound";
const MASTER_VOLUME = 0.8;

let enabled = storage.get(STORAGE_KEY) === "on";
let ctx = null;
let master = null;
let noise = null;
let drone = null;

export function isEnabled() {
    return enabled;
}

export function setEnabled(on) {
    enabled = on;
    storage.set(STORAGE_KEY, on ? "on" : "off");
    if (on) {
        start();
    } else if (ctx) {
        fadeMaster(0, 0.6);
    }
}

// Call from any user gesture: starts audio if the user turned sound on in an earlier visit
export function onUserGesture() {
    if (enabled) start();
}

function start() {
    if (!ensureContext()) return;
    ctx.resume();
    startDrone();
    fadeMaster(MASTER_VOLUME, 1.5);
}

function ensureContext() {
    if (ctx) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // One second of white noise, reused by every effect
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    loadRecordings();

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) ctx.suspend();
        else if (enabled) ctx.resume();
    });
    return true;
}

function fadeMaster(target, seconds) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + seconds);
}

// The drone: a tanpura once its recording has loaded, a synthesised drone until then
function startDrone() {
    if (drone) return;
    drone = recordings.tanpura ? startTanpura() : startSynthDrone();
}

// The tanpura arrived while the synthesised drone was playing: crossfade to it
function upgradeDrone() {
    if (!drone || drone.tanpura) return;
    const old = drone;
    const at = ctx.currentTime;
    old.out.gain.cancelScheduledValues(at);
    old.out.gain.setValueAtTime(old.out.gain.value, at);
    old.out.gain.linearRampToValueAtTime(0, at + 4);
    old.nodes.forEach((n) => n.stop(at + 4.1));
    drone = startTanpura();
}

const TANPURA_LEVEL = 0.6;
// The loop is one tanpura cycle, padded with its own continuation (see static/audio)
const TANPURA_LOOP = [0.15, 18.65];

function startTanpura() {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(TANPURA_LEVEL, ctx.currentTime + 4);
    out.connect(master);
    const src = ctx.createBufferSource();
    src.buffer = recordings.tanpura;
    src.loop = true;
    [src.loopStart, src.loopEnd] = TANPURA_LOOP;
    src.connect(out);
    src.start(ctx.currentTime, TANPURA_LOOP[0]);
    return { tanpura: true, out, nodes: [src] };
}

// Low, slowly breathing synthesised drone with a faint high shimmer
function startSynthDrone() {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 4);
    out.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.8;
    filter.connect(out);

    // The filter opens and closes over ~16 seconds, like slow breathing
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.06;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 180;
    sweep.connect(sweepDepth).connect(filter.frequency);
    sweep.start();

    const voices = [
        [55.0, "sawtooth", 0.22],
        [55.35, "sawtooth", 0.22],
        [82.41, "triangle", 0.3],
        [110.2, "triangle", 0.12],
    ].map(([freq, type, level]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.value = level;
        osc.connect(gain).connect(filter);
        osc.start();
        return osc;
    });

    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.012;
    shimmer.connect(out);
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 0.18;
    const tremoloDepth = ctx.createGain();
    tremoloDepth.gain.value = 0.01;
    tremolo.connect(tremoloDepth).connect(shimmer.gain);
    tremolo.start();
    const bells = [659.25, 987.77].map((freq) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(shimmer);
        osc.start();
        return osc;
    });

    return { out, nodes: [sweep, tremolo, ...voices, ...bells] };
}

function canPlay() {
    return enabled && ctx && ctx.state === "running";
}

// `out` lets an effect go through a panner instead of straight to the master
function noiseBurst({ at, duration, filterType, from, to, peak, out = master }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(at);
    src.stop(at + duration + 0.05);
}

function tone({ at, freq, duration, peak, type = "sine", out = master }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.05);
}

// A stereo position (-1 left … 1 right) for one effect; centre where unsupported
function panner(pan) {
    if (!ctx.createStereoPanner) return master;
    const node = ctx.createStereoPanner();
    node.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(master);
    return node;
}

function loopedNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    return src;
}

// A riffle of cards
export function shuffle() {
    if (!canPlay()) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
        noiseBurst({
            at: now + i * 0.065 + Math.random() * 0.02,
            duration: 0.06,
            filterType: "bandpass",
            from: 2600,
            to: 1800,
            peak: 0.22,
        });
    }
}

// A card turned over: a soft swish and a muted tap
export function flip() {
    if (!canPlay()) return;
    const now = ctx.currentTime;
    noiseBurst({ at: now, duration: 0.2, filterType: "bandpass", from: 700, to: 3200, peak: 0.28 });
    tone({ at: now + 0.16, freq: 140, duration: 0.09, peak: 0.12 });
}

// Cutting the deck: a lower, longer sweep
export function cut() {
    if (!canPlay()) return;
    noiseBurst({
        at: ctx.currentTime,
        duration: 0.45,
        filterType: "lowpass",
        from: 3000,
        to: 400,
        peak: 0.25,
    });
}

// A rising shimmer when a personally significant card turns over
export function personal() {
    if (!canPlay()) return;
    const now = ctx.currentTime;
    [659.25, 830.61, 987.77, 1318.51].forEach((freq, i) => {
        tone({ at: now + 0.25 + i * 0.09, freq, duration: 1.6, peak: 0.07 });
    });
}

// A bell for the core takeaway
// A temple bell for the core takeaway: the ghanta rung four times, dying away
const BELL_LEVEL = 0.9;

export function chime() {
    if (!canPlay()) return;
    if (recordings.bell) return play(recordings.bell, { level: BELL_LEVEL });
    const now = ctx.currentTime;
    const partials = [
        [1, 0.22],
        [2, 0.08],
        [2.76, 0.07],
        [5.4, 0.03],
    ];
    [523.25, 783.99].forEach((base, n) => {
        for (const [ratio, peak] of partials) {
            tone({ at: now + n * 0.14, freq: base * ratio, duration: 3.2 - ratio * 0.3, peak });
        }
    });
}

// --- Heartbeat: a low lub-dub, felt more than heard. It quickens as the cards turn. ---

let heartTimer = null;
let heartRate = 58;

function thump(at, peak) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(64, at);
    osc.frequency.exponentialRampToValueAtTime(36, at + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 0.3);
    // A muffled knock on top, so small phone speakers carry it too
    noiseBurst({ at, duration: 0.07, filterType: "lowpass", from: 420, to: 140, peak: peak * 0.18 });
}

function beat() {
    if (canPlay()) {
        const at = ctx.currentTime + 0.02;
        thump(at, 0.5);
        // The second beat draws closer as the heart quickens
        thump(at + 0.3 * Math.sqrt(60 / heartRate), 0.32);
    }
    heartTimer = setTimeout(beat, 60000 / heartRate);
}

export function startHeartbeat(bpm = 58) {
    heartRate = bpm;
    if (!heartTimer) beat();
}

export function quickenHeartbeat(by = 6, max = 112) {
    heartRate = Math.min(max, heartRate + by);
}

export function stopHeartbeat() {
    clearTimeout(heartTimer);
    heartTimer = null;
}

// --- Breath: filtered noise that rises (in) or falls away (out) ---

// Slots in breaths.mp3: [offset, duration] in seconds
const BREATHS = { in: [0, 3.3], out: [5, 3.7], watcher: [10, 5], gasp: [15, 0.65] };

// A recording, or a slot of one, at a level and stereo position
function play(buffer, { offset = 0, duration, level = 1, pan = 0 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(panner(pan));
    src.start(ctx.currentTime, offset, duration);
}

// A breath. watcher: not yours, but something's in the dark (a long, unnatural exhale).
// peak sets loudness (0.06 is a normal breath).
export function breath({ inhale = true, seconds = 3, peak = 0.06, pan = 0, watcher = false } = {}) {
    if (!canPlay()) return;
    if (recordings.breaths) {
        const [offset, duration] = BREATHS[watcher ? "watcher" : inhale ? "in" : "out"];
        return play(recordings.breaths, { offset, duration, level: peak * 10, pan });
    }
    const at = ctx.currentTime;
    const src = loopedNoise();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.6;
    band.frequency.setValueAtTime(inhale ? 520 : 1150, at);
    band.frequency.linearRampToValueAtTime(inhale ? 1250 : 460, at + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + (inhale ? seconds * 0.85 : 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(band).connect(gain).connect(panner(pan));
    src.start(at);
    src.stop(at + seconds + 0.1);
}

// A sharp in-breath, as when something is caught in the light
export function gasp({ pan = 0 } = {}) {
    if (!canPlay()) return;
    if (recordings.breaths) {
        const [offset, duration] = BREATHS.gasp;
        return play(recordings.breaths, { offset, duration, level: 0.6, pan });
    }
    breath({ inhale: true, seconds: 0.8, peak: 0.05, pan });
}

// --- Cowries ---

// A handful of shells falling onto cloth: a rattle of small clicks
export function cowries(count = 30) {
    if (!canPlay()) return;
    const now = ctx.currentTime;
    for (let i = 0; i < Math.min(count, 40); i++) {
        // Most land early, a few skitter after
        const at = now + Math.pow(Math.random(), 1.8) * 0.7;
        noiseBurst({
            at,
            duration: 0.03,
            filterType: "bandpass",
            from: 3600 + Math.random() * 1600,
            to: 2400,
            peak: 0.06 + Math.random() * 0.08,
        });
        tone({ at: at + 0.004, freq: 1700 + Math.random() * 1500, duration: 0.05, peak: 0.015 });
    }
}

// One soft tap, as an eight is counted away
export function tick() {
    if (!canPlay()) return;
    noiseBurst({ at: ctx.currentTime, duration: 0.05, filterType: "bandpass", from: 2400, to: 1500, peak: 0.12 });
}

// --- Recordings ---
// Public-domain (CC0) recordings from Freesound, cut for this app (credits in README):
// tanpura by iluppai, temple bell (ghanta) by the_very_Real_Horst, breaths by zagor76 and
// pqr, ghungroo by bashrambali.

const RECORDINGS = {
    tanpura: "/static/audio/tanpura-loop.mp3",
    bell: "/static/audio/temple-bell.mp3",
    breaths: "/static/audio/breaths.mp3",
    ghungroo: "/static/audio/ghungroo-steps.mp3",
};
const recordings = {};

function loadRecordings() {
    for (const [name, url] of Object.entries(RECORDINGS)) {
        fetch(url)
            .then((res) => res.arrayBuffer())
            // The callback form, for older Safari
            .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
            .then((buffer) => {
                recordings[name] = buffer;
                if (name === "tanpura") upgradeDrone();
            })
            .catch(() => {
                /* the synthesised stand-in carries on */
            });
    }
}

// Ghungroo: seven footsteps, each in its own one-second slot
const GHUNGROO_STEPS = 7;
let echo = null;

// A small stone chamber: two seconds of decaying, darkening noise as the impulse
function makeEcho() {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 2.2);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        let smooth = 0;
        for (let i = 0; i < length; i++) {
            const t = i / rate;
            // Duller as it fades, as stone swallows the highs
            const k = 0.25 + 0.7 * Math.exp(-t * 2);
            smooth += k * ((Math.random() * 2 - 1) - smooth);
            data[i] = smooth * Math.exp(-t * 3.2);
        }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const input = ctx.createGain();
    const output = ctx.createGain();
    output.gain.value = 0.9;
    input.connect(convolver).connect(output).connect(master);
    return input;
}

// Footsteps with anklet bells. Approaching steps start far off (quiet, mostly echo) and
// come closer; otherwise they hurry away.
export function ghungroo({ pan = 0, steps = 4, pace = 0.55, peak = 0.5, approaching = false } = {}) {
    if (!canPlay() || !recordings.ghungroo) return;
    echo ||= makeEcho();
    let at = ctx.currentTime + 0.02;
    for (let step = 0; step < steps; step++) {
        const near = approaching ? (step + 1) / steps : 1 - step / steps;
        const src = ctx.createBufferSource();
        src.buffer = recordings.ghungroo;
        src.playbackRate.value = 0.96 + Math.random() * 0.08;
        // Far away, the highs are lost first
        const air = ctx.createBiquadFilter();
        air.type = "lowpass";
        air.frequency.value = 4500 + near * 5000;
        const level = ctx.createGain();
        level.gain.value = peak * (0.25 + 0.75 * near) * (0.85 + Math.random() * 0.3);
        const dry = ctx.createGain();
        dry.gain.value = 0.3 + 0.7 * near;
        const wet = ctx.createGain();
        wet.gain.value = 0.9 - 0.5 * near;
        // Left foot, right foot
        src.connect(air).connect(level);
        level.connect(dry).connect(panner(pan + (step % 2 ? 0.12 : -0.12)));
        level.connect(wet).connect(echo);
        src.start(at, Math.floor(Math.random() * GHUNGROO_STEPS), 0.98);
        at += pace * (0.85 + Math.random() * 0.3);
    }
}

// A serpent's hiss, slow to rise
export function hiss({ pan = 0, seconds = 1.8, peak = 0.03 } = {}) {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    const src = loopedNoise();
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 3800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + seconds * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(high).connect(gain).connect(panner(pan));
    src.start(at);
    src.stop(at + seconds + 0.1);
}

// Wings beating overhead, crossing from one side to the other
export function wings({ from = -0.9, to = 0.9, seconds = 1.8, peak = 0.09 } = {}) {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    const out = panner(from);
    if (out.pan) out.pan.linearRampToValueAtTime(to, at + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + seconds * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    env.connect(out);
    // Two creatures, beating out of step
    for (const rate of [9 + Math.random() * 2, 12 + Math.random() * 3]) {
        const src = loopedNoise();
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 900 + Math.random() * 500;
        band.Q.value = 0.9;
        const flap = ctx.createGain();
        flap.gain.value = 0.5;
        const beat = ctx.createOscillator();
        beat.frequency.value = rate;
        const depth = ctx.createGain();
        depth.gain.value = 0.5;
        beat.connect(depth).connect(flap.gain);
        src.connect(band).connect(flap).connect(env);
        src.start(at);
        beat.start(at);
        src.stop(at + seconds + 0.1);
        beat.stop(at + seconds + 0.1);
    }
}

// A draft through the corridor
export function wind({ pan = 0, seconds = 3.4, peak = 0.1 } = {}) {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    const src = loopedNoise();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.5;
    band.frequency.setValueAtTime(320, at);
    band.frequency.linearRampToValueAtTime(950, at + seconds * 0.3);
    band.frequency.linearRampToValueAtTime(280, at + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + seconds * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(band).connect(gain).connect(panner(pan));
    src.start(at);
    src.stop(at + seconds + 0.1);
}
