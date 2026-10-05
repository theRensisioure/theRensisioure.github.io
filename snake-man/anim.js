// SNAKE-MAN · anim
// Sixteen-frame animation. Every event the rules announce, and every actor on screen, gets a
// cycle of exactly 16 frames, stepped rather than tweened so it reads as hand-timed pixel art.
//   events   play(at, ms, draw) runs 16 frames over ms, pinned to a point or following an actor
//   actors   cycle(now, ms, phase) loops 16 frames: ghosts hover, pellets breathe
//   dither   a 4x4 Bayer matrix holds 16 thresholds, so dissolves take exactly 16 steps
// And the sighting shock: the first time a ghost comes into view it arcs a bolt into you, you
// stagger (a slightly slower step) and it swells, and both settle back within one second.
// Emits: 'sighted' (a ghost seen for the first time since it was placed).
'use strict';
(() => {
    const { GRID_SIZE, W, on, emit } = SM.core;
    const G = SM.G, fx = SM.fx, gfx = SM.gfx;
    const { ctx, P, snap, sx, sy, onScreen } = SM.view;
    const { pixelLine, pixelRing } = gfx;

    const FRAMES = 16;
    const frameOf = k => Math.min(FRAMES - 1, Math.floor(k * FRAMES));
    const cycle = (now, periodMs, phase = 0) => ((Math.floor(now / periodMs * FRAMES) + phase) % FRAMES + FRAMES) % FRAMES;
    const fade = f => 1 - f / FRAMES;   // alpha that runs out on the last frame
    const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

    // --- IDLE CYCLES (sub-pixel offsets, one entry per frame) ---
    const HOVER = [0, 0, -1, -1, -1, -2, -2, -2, -2, -2, -1, -1, -1, 0, 0, 0];   // ghosts float
    const BREATHE = [0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0];      // pellets
    const hover = (g, now) => g.state === 'lunge' ? 0 : HOVER[cycle(now, 1100, Math.floor(g.pace.phase * 16))] * P;
    const breathe = (p, now) => BREATHE[cycle(now, 1400, p.x * 3 + p.y * 5)] * P;

    // --- EVENT ANIMATIONS ---
    // at: {x, y} copied for a fixed spot, or a live object (a ghost, HEAD) to follow it.
    function play(at, ms, draw, layer = 'over') {
        return fx.play({
            dur: ms, layer,
            draw: (k, e, now) => {
                if (!onScreen(at.x, at.y)) return;
                draw(frameOf(k), sx(at.x), sy(at.y), now);
            },
        });
    }
    const HEAD = { get x() { return G.snake[0].x; }, get y() { return G.snake[0].y; } };
    const spot = p => ({ x: p.x, y: p.y });

    // Ordered dissolve: frame f hides the cells whose Bayer threshold is below f + 1.
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = GRID_SIZE * 2;
    const tctx = tmp.getContext('2d');
    function dissolve(spr, x, y, f) {
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.drawImage(spr, 0, 0);
        const n = spr.width / P;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            if (BAYER[(j & 3) * 4 + (i & 3)] <= f) tctx.clearRect(i * P, j * P, P, P);
        }
        ctx.drawImage(tmp, 0, 0, spr.width, spr.height, snap(x), snap(y), spr.width, spr.height);
    }

    // A four-point pixel star.
    function star(x, y, r, color) {
        ctx.fillStyle = color;
        ctx.fillRect(snap(x) - P / 2, snap(y) - P / 2, P, P);
        for (let k = 1; k <= r; k++) {
            ctx.fillRect(snap(x + k * P) - P / 2, snap(y) - P / 2, P, P);
            ctx.fillRect(snap(x - k * P) - P / 2, snap(y) - P / 2, P, P);
            ctx.fillRect(snap(x) - P / 2, snap(y + k * P) - P / 2, P, P);
            ctx.fillRect(snap(x) - P / 2, snap(y - k * P) - P / 2, P, P);
        }
    }

    // A jagged bolt from (x0, y0) to (x1, y1), re-forked every frame.
    function bolt(x0, y0, x1, y1, f, seed, color, every = 1) {
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, SEGS = 7;
        let px = x0, py = y0;
        for (let s = 1; s <= SEGS; s++) {
            const t = s / SEGS, amp = s === SEGS ? 0 : (hash(seed + f * 31 + s) - 0.5) * GRID_SIZE * 1.4;
            const qx = x0 + dx * t + nx * amp, qy = y0 + dy * t + ny * amp;
            pixelLine(px, py, qx, qy, color, every);
            px = qx; py = qy;
        }
    }

    on('eat', e => {
        if (e.rainbow) return;   // 'prism' has its own
        play(spot(e), 320, (f, x, y) => { ctx.globalAlpha = fade(f); pixelRing(x, y, 3 + f * 0.8, '#ffd700'); ctx.globalAlpha = 1; });
    });
    on('prism', p => play(spot(p), 800, (f, x, y) => {
        ctx.globalAlpha = fade(f);
        for (let r = 0; r < 3; r++) pixelRing(x, y, 8 + f * 22 - r * 6, gfx.rgbStr(gfx.hsl((f * 22.5 + r * 60) % 360)));
        ctx.globalAlpha = 1;
    }));
    on('ghostEaten', g => {
        const spr = gfx.ghostSprite(g.color, 0, 4, 'daze', SM.ghosts.tier(g), g.immune);
        play(spot(g), 480, (f, x, y) => dissolve(spr, x - GRID_SIZE / 2, y - GRID_SIZE / 2 - f * P, f));
    });
    on('hit', () => play(HEAD, 480, (f, x, y) => {
        ctx.globalAlpha = fade(f);
        pixelRing(x, y, Math.max(2, 48 - f * 3), '#f33');
        pixelRing(x, y, Math.max(2, 36 - f * 2.25), '#faa');
        ctx.globalAlpha = 1;
    }));
    on('dash', () => play(spot(G.snake[0]), 400, (f, x, y) => {
        ctx.globalAlpha = fade(f);
        const r = 4 + Math.min(f, 8) * 2;
        for (let a = 0; a < 8; a++) {
            const ang = a / 8 * Math.PI * 2 + 0.3;
            pixelLine(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, x + Math.cos(ang) * r, y + Math.sin(ang) * r, '#6b4a2b');
        }
        ctx.globalAlpha = 1;
    }, 'floor'));
    on('surfaced', () => play(spot(G.snake[0]), 400, (f, x, y) => {
        ctx.globalAlpha = fade(f); pixelRing(x, y, 6 + f * 2.5, '#c89c62'); ctx.globalAlpha = 1;
    }, 'floor'));
    on('bonk', g => play(g, 800, (f, x, y) => {   // one full orbit of dizzy stars over its head
        for (let s = 0; s < 3; s++) {
            const a = (f / FRAMES + s / 3) * Math.PI * 2;
            star(x + Math.cos(a) * 9, y - GRID_SIZE * 0.7 + Math.sin(a) * 3, f % 4 < 2 ? 1 : 0, s ? '#fff' : '#ff3');
        }
    }));
    on('dodge', g => {
        if (g.state !== 'daze' || g.traitor) return;
        play(HEAD, 320, (f, x, y) => {
            ctx.globalAlpha = fade(f);
            const r = 6 + f * 1.5;
            for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) star(x + ux * r, y + uy * r, f < 8 ? 1 : 0, '#fff');
            ctx.globalAlpha = 1;
        });
    });
    on('snip', () => play(spot(G.snake[G.snake.length - 1]), 400, (f, x, y) => {
        const r = Math.min(f, 6) * 2;
        ctx.globalAlpha = fade(f);
        pixelLine(x - r, y - r, x + r, y + r, '#f66');
        pixelLine(x - r, y + r, x + r, y - r, '#fff');
        ctx.globalAlpha = 1;
    }));
    on('betrayed', o => play(o, 640, (f, x, y) => {
        ctx.globalAlpha = fade(f);
        pixelRing(x, y, 4 + (f % 8) * 2, SM.coat.TRAITOR_COLOR);
        ctx.globalAlpha = 1;
    }));
    on('heal', () => play(HEAD, 800, (f, x, y) => {
        ctx.globalAlpha = fade(f);
        for (let s = 0; s < 3; s++) star(x + (s - 1) * 10, y - f * 2 - s * 6, 1, s === 1 ? '#fff' : '#ff5577');
        ctx.globalAlpha = 1;
    }));
    on('placed', () => play(HEAD, 480, (f, x, y) => {   // spawn beam: pixels converge on you
        ctx.globalAlpha = 0.4 + 0.6 * f / FRAMES;
        for (let a = 0; a < 8; a++) {
            const ang = a / 8 * Math.PI * 2 + f * 0.2, r = (FRAMES - f) * 3;
            ctx.fillStyle = a % 2 ? '#0ff' : '#fff';
            ctx.fillRect(snap(x + Math.cos(ang) * r) - P / 2, snap(y + Math.sin(ang) * r) - P / 2, P, P);
        }
        ctx.globalAlpha = 1;
    }));

    // --- THE SIGHTING SHOCK ---
    const SHOCK_MS = 1000;    // everything settles within a second
    const SHOCK_DRAG = 0.22;  // step time +22% at the jolt, easing back to normal
    const SWELL = 0.9;        // the ghost looms 90% bigger at first sight
    let shockT = 0;

    function sight(g) {
        g.sighted = true;
        g.swell = SHOCK_MS;
        shockT = SHOCK_MS;
        emit('sighted', g);
        const seed = Math.random() * 1000;
        play(g, SHOCK_MS, (f, x, y) => {   // the bolt: white-hot, then flickering out by frame 8
            if (f >= 8) return;
            const hx = sx(HEAD.x), hy = sy(HEAD.y);
            ctx.globalAlpha = f < 3 ? 1 : (f % 2 ? 0.3 : 0.8);
            bolt(x, y, hx, hy, f, seed, g.color, f < 3 ? 1 : 2);
            bolt(x, y, hx, hy, f, seed + 7, '#fff', f < 3 ? 1 : 3);
            ctx.globalAlpha = 1;
        });
        play(HEAD, SHOCK_MS, (f, x, y) => {  // sparks crawl over you while you're staggered
            ctx.globalAlpha = fade(f);
            for (let s = 0; s < 4; s++) {
                const a = hash(seed + f * 5 + s) * Math.PI * 2, r = GRID_SIZE * (0.4 + 0.4 * hash(seed + f + s * 3));
                ctx.fillStyle = s % 2 ? '#fff' : '#9ff';
                ctx.fillRect(snap(x + Math.cos(a) * r) - P / 2, snap(y + Math.sin(a) * r) - P / 2, P, P);
            }
            ctx.globalAlpha = 1;
        });
    }

    // Runs every tick while playing: spot new ghosts and let the shock wear off.
    function tick(dt) {
        shockT = Math.max(0, shockT - dt);
        for (const g of G.ghosts) {
            if (g.swell > 0) g.swell = Math.max(0, g.swell - dt);
            if (!g.active || g.sighted || g.fade < 0.3 || g.vis < 0.5 || !onScreen(g.x, g.y)) continue;
            if (g.traitor || g.state === 'daze') { g.sighted = true; continue; }   // no threat, no shock
            sight(g);
        }
    }

    // Player step-time multiplier: 1 + DRAG at the jolt, back to 1 as the second runs out.
    const drag = () => 1 + SHOCK_DRAG * (shockT / SHOCK_MS) ** 2;

    // Ghost draw scale: 16 frames from full swell back to normal size, overshooting a touch.
    function swell(g) {
        if (!(g.swell > 0)) return 1;
        const k = (FRAMES - 1 - frameOf(g.swell / SHOCK_MS)) / (FRAMES - 1);
        return 1 + SWELL * (1 - fx.ease.outBack(k));
    }
    // The first two frames of the swell flash white.
    const swellFlash = g => g.swell > SHOCK_MS * (1 - 2 / FRAMES);

    // Screen jolt at the moment of sight (in px): a four-frame shudder.
    function jolt() {
        const f = frameOf(1 - shockT / SHOCK_MS);
        if (shockT <= 0 || f >= 4) return { x: 0, y: 0 };
        return { x: [2, -2, 2, 0][f], y: [0, 2, -2, 0][f] };
    }

    function reset() { shockT = 0; }

    SM.anim = { FRAMES, frameOf, cycle, play, dissolve, hover, breathe, tick, drag, swell, swellFlash, jolt, reset };
})();
