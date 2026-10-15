// Ambient drone and sound effects, synthesised with the Web Audio API (no audio files).
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

// Low, slowly breathing drone with a faint high shimmer
function startDrone() {
    if (drone) return;

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

    drone = [sweep, tremolo, ...voices, ...bells];
}

function canPlay() {
    return enabled && ctx && ctx.state === "running";
}

function noiseBurst({ at, duration, filterType, from, to, peak }) {
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
    src.connect(filter).connect(gain).connect(master);
    src.start(at);
    src.stop(at + duration + 0.05);
}

function tone({ at, freq, duration, peak, type = "sine" }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
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
export function chime() {
    if (!canPlay()) return;
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
