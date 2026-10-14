// Animated night sky behind the page: twinkling stars, drifting dust motes,
// the occasional shooting star, and the moon drawn in its current phase.
// With reduced motion the sky is drawn once and stays still.
import { prefersReducedMotion, onReducedMotionChange } from "./util.js";

const PALETTE = {
    calm: { mote: "212, 175, 55", star: "230, 232, 242" },
    witching: { mote: "214, 72, 88", star: "240, 214, 222" },
};

export function startSky(canvas) {
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let stars = [];
    let motes = [];
    let shootingStar = null;
    let nextShootingStarAt = performance.now() + 8000;
    let moonFraction = null;
    let colors = PALETTE.calm;
    let frame = null;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const starCount = Math.min(240, Math.round((width * height) / 4500));
        stars = Array.from({ length: starCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.1 + 0.25,
            base: Math.random() * 0.5 + 0.25,
            speed: Math.random() * 0.0015 + 0.0004,
            phase: Math.random() * Math.PI * 2,
        }));
        const moteCount = Math.min(36, Math.round(width / 28));
        motes = Array.from({ length: moteCount }, () => newMote(true));
        if (prefersReducedMotion()) draw(performance.now());
    }

    function newMote(anywhere) {
        return {
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : height + 10,
            r: Math.random() * 1.6 + 0.6,
            vx: (Math.random() - 0.5) * 0.12,
            vy: -(Math.random() * 0.18 + 0.05),
            alpha: Math.random() * 0.35 + 0.1,
            wobble: Math.random() * Math.PI * 2,
        };
    }

    function drawMoon() {
        if (moonFraction === null) return;
        const r = width < 600 ? 16 : 24;
        const cx = width - r - (width < 600 ? 22 : 48);
        const cy = width < 600 ? 108 : 120;

        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 4);
        glow.addColorStop(0, "rgba(243, 234, 210, 0.16)");
        glow.addColorStop(1, "rgba(243, 234, 210, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);

        // Unlit disc, faintly visible (earthshine)
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(60, 62, 84, 0.55)";
        ctx.fill();

        // Lit part: a half disc on the lit side, closed by an elliptical terminator.
        // Waxing moons are lit on the right, waning on the left (northern hemisphere).
        const waxing = moonFraction < 0.5;
        const k = Math.cos(moonFraction * 2 * Math.PI); // 1 = new, -1 = full
        const crescent = k > 0;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
        ctx.ellipse(cx, cy, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, waxing === crescent);
        ctx.closePath();
        ctx.fillStyle = "rgba(243, 234, 210, 0.95)";
        ctx.fill();
    }

    function draw(now) {
        ctx.clearRect(0, 0, width, height);
        const still = prefersReducedMotion();

        for (const s of stars) {
            const twinkle = still ? 0 : Math.sin(now * s.speed + s.phase) * 0.25;
            ctx.globalAlpha = Math.max(0.05, s.base + twinkle);
            ctx.fillStyle = `rgb(${colors.star})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        drawMoon();

        for (const m of motes) {
            if (!still) {
                m.wobble += 0.01;
                m.x += m.vx + Math.sin(m.wobble) * 0.08;
                m.y += m.vy;
                if (m.y < -10) Object.assign(m, newMote(false));
            }
            const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
            glow.addColorStop(0, `rgba(${colors.mote}, ${m.alpha})`);
            glow.addColorStop(1, `rgba(${colors.mote}, 0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(m.x - m.r * 4, m.y - m.r * 4, m.r * 8, m.r * 8);
        }

        if (!still) drawShootingStar(now);
    }

    function drawShootingStar(now) {
        if (!shootingStar && now > nextShootingStarAt) {
            shootingStar = {
                x: Math.random() * width * 0.7 + width * 0.15,
                y: Math.random() * height * 0.3,
                vx: -(Math.random() * 4 + 6),
                vy: Math.random() * 2 + 2.5,
                life: 0,
            };
        }
        if (!shootingStar) return;

        const s = shootingStar;
        s.x += s.vx;
        s.y += s.vy;
        s.life += 1;
        const fade = Math.max(0, 1 - s.life / 45);
        const tail = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 10, s.y - s.vy * 10);
        tail.addColorStop(0, `rgba(255, 250, 235, ${0.9 * fade})`);
        tail.addColorStop(1, "rgba(255, 250, 235, 0)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 10, s.y - s.vy * 10);
        ctx.stroke();

        if (fade === 0) {
            shootingStar = null;
            nextShootingStarAt = now + 12000 + Math.random() * 18000;
        }
    }

    function loop(now) {
        draw(now);
        frame = requestAnimationFrame(loop);
    }

    function applyMotionPreference(reduced) {
        cancelAnimationFrame(frame);
        if (reduced) draw(performance.now());
        else frame = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    onReducedMotionChange(applyMotionPreference);
    resize();
    applyMotionPreference(prefersReducedMotion());

    return {
        setMoon(fraction) {
            moonFraction = fraction;
            if (prefersReducedMotion()) draw(performance.now());
        },
        setMood(mood) {
            colors = PALETTE[mood] || PALETTE.calm;
            if (prefersReducedMotion()) draw(performance.now());
        },
    };
}
