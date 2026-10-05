// SNAKE-MAN · fx
// The animation layer. The rules move things a whole tile per tick; everything that should
// read as motion *between* ticks lives here, in world coordinates (fractional tiles):
//   popups     floating text
//   particles  bits with a height z, so dirt and sparks arc and land (pseudo-3D)
//   effects    timed tweens: { dur, delay, layer, draw(k, e, now) } with k eased 0 → 1
// FX time only advances while the game is running, so a pause freezes it mid-motion.
'use strict';
(() => {
    const { GRID_SIZE } = SM.core;
    const { ctx, P, snap, sx, sy, onScreen } = SM.view;

    const ease = {
        linear: t => t,
        inQuad: t => t * t,
        outQuad: t => t * (2 - t),
        outCubic: t => 1 - (1 - t) ** 3,
        inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
        outBack: t => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
    };

    let popups = [], parts = [], effects = [];

    function popup(x, y, text, color) {
        popups.push({ x, y, text, color, t: 0 });
    }

    // Throw n particles from (x, y). Speeds are in tiles/s; up is the launch speed in z.
    function burst(x, y, { n = 8, colors = ['#fff'], speed = 3, up = 6, life = 600, dir = null, spread = Math.PI * 2 } = {}) {
        const base = dir ? Math.atan2(dir.y, dir.x) : 0;
        for (let i = 0; i < n; i++) {
            const a = base + (Math.random() - 0.5) * spread, v = speed * (0.4 + Math.random() * 0.8);
            parts.push({
                x, y, z: 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up * (0.5 + Math.random() * 0.7),
                t: 0, life: life * (0.6 + Math.random() * 0.6), color: colors[i % colors.length],
            });
        }
    }

    function play(e) {
        e.t = -(e.delay || 0);
        e.layer = e.layer || 'over';
        e.ease = e.ease || ease.linear;
        effects.push(e);
        return e;
    }

    function clear() { popups = []; parts = []; effects = []; }

    function update(dt) {
        const s = dt / 1000;
        popups = popups.filter(p => (p.t += dt) < 900);
        for (const p of parts) {
            p.t += dt;
            p.x += p.vx * s; p.y += p.vy * s;
            p.vz -= 30 * s; p.z += p.vz * s;
            if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }   // land and skid
        }
        parts = parts.filter(p => p.t < p.life);
        for (const e of effects) e.t += dt;
        effects = effects.filter(e => e.t < e.dur);
    }

    // layer: 'floor' (under walls and shadows), 'over' (above the actors)
    function draw(layer, now) {
        for (const e of effects) {
            if (e.layer !== layer || e.t < 0) continue;
            e.draw(e.ease(Math.min(1, e.t / e.dur)), e, now);
        }
        if (layer !== 'over') return;
        for (const p of parts) {
            if (!onScreen(p.x, p.y)) continue;
            ctx.globalAlpha = Math.min(1, 2 * (1 - p.t / p.life));
            ctx.fillStyle = p.color;
            ctx.fillRect(snap(sx(p.x)) - P / 2, snap(sy(p.y) - p.z * GRID_SIZE) - P / 2, P, P);
        }
        ctx.globalAlpha = 1;
        for (const p of popups) {
            ctx.globalAlpha = 1 - p.t / 900;
            SM.gfx.pixelText(p.text, sx(p.x), sy(p.y) - GRID_SIZE / 2 - p.t / 30, 10, p.color);
        }
        ctx.globalAlpha = 1;
    }

    SM.fx = { ease, popup, burst, play, clear, update, draw };
})();
