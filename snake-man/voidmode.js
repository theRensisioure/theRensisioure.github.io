// SNAKE-MAN · voidmode
// VOID GATES, used by the VOID and SEASONAL game modes (modes.js decides which modes have
// them, how many, and how long the void lasts; ZOMBIES is zombies.js). The map grows gates:
// black-and-white posts with a flickering bar between them. Drive through one and the world
// drops into the VOID for a few seconds: everything goes black and white, nothing can hurt
// you, and every ghost that comes near you is killed automatically (AUTO KILL). The armored
// ghost can't die, so it's banished to the edge of the map instead. A used gate collapses and
// a new one opens somewhere else a little later.
// Gate runs are filed on their mode's own score board, since the gates make big scores easier.
// Emits: 'gate' (you went through one), 'void' ({ on }).
'use strict';
(() => {
    const { N, idx, wrap, tdist, emit } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;

    const KILL_RANGE = 3;         // auto kill reaches this far (in tiles, around the torus)
    const REOPEN_MS = 12000;      // a used gate opens again elsewhere after this

    let gates = [];               // { x, y, open: 0 → 1 (fading in) }
    let reopen = [];              // ms until each used gate comes back

    // Whether this mode has gates; how many are open at once and how long the void lasts.
    const on = () => SM.modes.has('gates');
    const cfg = () => SM.modes.gates() || { count: 0, voidMs: 0 };

    // Switching modes lives in modes.js now; kept so older callers still work.
    const toggle = () => SM.modes.next();

    function place() {
        const h = G.snake[0], r = M.domainRect() || { x: 0, y: 0, w: N, h: N };
        for (let tries = 0; tries < 800; tries++) {
            const x = wrap(r.x + Math.floor(Math.random() * r.w)), y = wrap(r.y + Math.floor(Math.random() * r.h));
            if (M.isWall(x, y) || !M.inDomain(x, y) || SM.pellets.at(x, y) || tdist(x, y, h.x, h.y) < 10) continue;
            if (gates.some(g => tdist(g.x, g.y, x, y) < 15)) continue;
            gates.push({ x, y, open: 0 });
            return;
        }
    }

    function reset() {
        gates = []; reopen = []; G.voidT = 0;
        if (!on()) return;
        for (let i = 0; i < cfg().count; i++) place();
    }

    function enter(gt) {
        gates = gates.filter(o => o !== gt);
        reopen.push(REOPEN_MS);
        const was = G.voidT > 0;
        G.voidT = cfg().voidMs;
        fx.popup(gt.x, gt.y - 1.5, 'VOID!', '#fff');
        fx.burst(gt.x, gt.y, { n: 24, colors: ['#fff', '#000', '#888'], speed: 4, up: 10, life: 900 });
        emit('gate', gt);
        if (!was) emit('void', { on: true });
    }

    function update(dt) {
        if (!on()) return;
        for (const gt of gates) gt.open = Math.min(1, gt.open + dt / 600);
        reopen = reopen.map(t => t - dt);
        while (reopen.length && reopen[0] <= 0) { reopen.shift(); place(); }

        const h = G.snake[0];
        if (!h.under) {
            const gt = gates.find(o => o.x === h.x && o.y === h.y && o.open >= 1);
            if (gt) enter(gt);
        }

        if (G.voidT <= 0) return;
        G.voidT = Math.max(0, G.voidT - dt);
        if (G.voidT === 0) { emit('void', { on: false }); return; }
        // AUTO KILL: anything that strays close dies
        for (const g of G.ghosts) {
            if (g.active && !g.traitor && tdist(g.x, g.y, h.x, h.y) <= KILL_RANGE) SM.special.kill(g, 'void');
        }
    }

    // --- DRAWING ---
    // A gate: two posts, one white and one black, with a flickering checker bar across.
    function drawGates(now) {
        if (!on()) return;
        const { ctx, sx, sy, snap, onScreen, P } = SM.view, s = SM.core.GRID_SIZE;
        for (const gt of gates) {
            if (!onScreen(gt.x, gt.y)) continue;
            const L = snap(sx(gt.x) - s / 2), T = snap(sy(gt.y) - s / 2), f = Math.floor(now / 80);
            ctx.save();
            ctx.globalAlpha = gt.open;
            ctx.fillStyle = '#fff'; ctx.fillRect(L, T - 2 * P, 2 * P, s + 2 * P);
            ctx.fillStyle = '#000'; ctx.fillRect(L + s - 2 * P, T - 2 * P, 2 * P, s + 2 * P);
            ctx.fillStyle = '#666'; ctx.fillRect(L + s - P, T - 2 * P, P, s + 2 * P);   // the black post's rim
            for (let j = 0; j < s / P; j++) for (let i = 2; i < s / P - 2; i++) {
                if ((i + j + f) % 2) continue;
                ctx.fillStyle = (i * 7 + j * 3 + f) % 5 < 2 ? '#fff' : '#222';
                ctx.fillRect(L + i * P, T + j * P, P, P);
            }
            ctx.restore();
        }
    }

    // Gates on the minimap, so you can find them.
    function drawMinimap(ox, oy, s, now) {
        if (!on()) return;
        const { ctx } = SM.view;
        ctx.fillStyle = Math.floor(now / 300) % 2 ? '#fff' : '#888';
        for (const gt of gates) ctx.fillRect(ox + gt.x * s - 2, oy + gt.y * s - 2, 5, 5);
    }

    // The screen filter while the void is on: black and white, flickering back to colour as it ends.
    const filter = now => G.voidT > 0 && !(G.voidT < 1500 && Math.floor(now / 120) % 2) ? 'grayscale(1) contrast(1.6)' : 'none';

    SM.voidmode = {
        KILL_RANGE,
        toggle, reset, update, drawGates, drawMinimap, filter,
        get on() { return on(); },
        get gates() { return gates; },
    };
})();
