// SNAKE-MAN · autopilot
// AUTO (I key, the AUTO button, or the right-stick click): a bot plays for you and the runs
// chain on their own, so the idle layer keeps earning. It drives through the same verbs a
// player has (pressDir, DIG, COAT) and sees only what's on the map.
//
// Each time the snake is about to step, a breadth-first search over the torus finds the best
// pellet in reach, with walls, your body and the space around hostile ghosts blocked off, and
// every lunge corridor treated as a wall. Rainbows, fruit and (during a prism) dazed ghosts are
// worth a detour. No route? It relaxes the ghost buffer, then digs, then takes the roomiest way.
// Touch the controls and it lets go; it takes back over after HANDS_OFF_MS of quiet.
'use strict';
(() => {
    const { N, DIRS, LUNGE_OVERSHOOT, wrap, idx, tdist, wdelta } = SM.core;
    const G = SM.G, M = SM.map, PL = SM.pellets;

    const HANDS_OFF_MS = 5000;
    const START_DELAY_MS = 1200, RESTART_DELAY_MS = 3000, NEW_MAP_EVERY = 3;
    const BONUS = { [PL.YELLOW]: 0, [PL.RAINBOW]: 14, [PL.FRUIT]: 24 };
    const EDIBLE_BONUS = 18;
    const MAX_BONUS = 24;

    let on = false, driving = false;
    let handsUntil = 0, waitT = 0, runs = 0, hidPaused = false;
    let lastHead = -1, thinkT = 0;   // think once per step, or every THINK_MS if standing still
    const THINK_MS = 150;

    // --- THE MAP AS THE BOT SEES IT ---
    const blocked = new Uint8Array(N * N);   // 1 wall/body, 2 near a ghost, 3 lunge corridor
    const dist = new Int16Array(N * N);
    const first = new Int8Array(N * N);      // the first step (DIRS index) on the way here
    const queue = new Int32Array(N * N);

    const sight = () => SM.idle ? SM.idle.level('sight') : 0;
    const hostile = g => g.active && !g.traitor && !(g.state === 'daze')
        && !(SM.coat.disguised && g.state === 'hunt');
    const edible = g => g.active && g.state === 'daze' && !g.immune;

    function mark(x, y, v) { const i = idx(x, y); if (blocked[i] < v && blocked[i] !== 1) blocked[i] = v; }

    function buildMap() {
        blocked.fill(0);
        for (let i = 0; i < N * N; i++) if (M.walls[i]) blocked[i] = 1;
        const S = G.snake;
        for (let k = 1; k < S.length - 1; k++) if (!S[k].under) blocked[idx(S[k].x, S[k].y)] = 1;   // the tail tip moves on
        const r = 1 + Math.min(2, sight());
        for (const g of G.ghosts) {
            if (!hostile(g)) continue;
            if (g.state === 'aim' || g.state === 'lunge') {
                // the corridor from the ghost through its target and a little past
                const dx = wdelta(g.x, g.target.x), dy = wdelta(g.y, g.target.y);
                const len = Math.abs(dx) + Math.abs(dy) + LUNGE_OVERSHOOT + 1;
                const sx = Math.sign(dx), sy = Math.sign(dy);
                let x = g.x, y = g.y;
                for (let k = 0; k <= len; k++) {
                    mark(x, y, 3);
                    for (const d of DIRS) mark(x + d.x, y + d.y, 3);
                    // walk the longer axis first, like the lunge does
                    if (Math.abs(wdelta(x, g.target.x)) >= Math.abs(wdelta(y, g.target.y)) && sx) x = wrap(x + sx);
                    else if (sy) y = wrap(y + sy);
                    else x = wrap(x + sx);
                }
            }
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
                if (Math.abs(dx) + Math.abs(dy) <= r) mark(g.x + dx, g.y + dy, 2);
        }
    }

    // Search outward from the head. `allow` is the highest blocked value we're willing to cross.
    // Returns { dir, dist, x, y } for the best target, or the roomiest first step if none is in reach.
    function search(allow) {
        const S = G.snake, h = S[0], depth = 22 + 12 * sight();
        dist.fill(-1);
        const back = { x: -G.direction.x, y: -G.direction.y };
        const edibles = G.prism > 0 ? G.ghosts.filter(edible) : [];
        let qh = 0, qt = 0, best = null, bestV = Infinity, far = null;
        dist[idx(h.x, h.y)] = 0;
        for (let d = 0; d < 4; d++) {
            const o = DIRS[d];
            if (o.x === back.x && o.y === back.y) continue;
            const x = wrap(h.x + o.x), y = wrap(h.y + o.y), i = idx(x, y);
            if (blocked[i] === 1 || blocked[i] > allow) continue;
            dist[i] = 1; first[i] = d; queue[qt++] = i;
        }
        while (qh < qt) {
            const i = queue[qh++], x = i % N, y = (i / N) | 0, dd = dist[i];
            if (dd - MAX_BONUS > bestV) break;
            far = i;
            const kind = PL.at(x, y);
            let v = Infinity;
            if (kind) v = dd - BONUS[kind];
            if (edibles.length && edibles.some(g => g.x === x && g.y === y)) v = Math.min(v, dd - EDIBLE_BONUS);
            if (v < bestV) { bestV = v; best = i; }
            if (dd >= depth) continue;
            for (const o of DIRS) {
                const j = idx(x + o.x, y + o.y);
                if (dist[j] >= 0 || blocked[j] === 1 || blocked[j] > allow) continue;
                dist[j] = dd + 1; first[j] = first[i]; queue[qt++] = j;
            }
        }
        const pick = best ?? far;
        if (pick == null) return null;
        return { dir: first[pick], dist: dist[pick], x: pick % N, y: (pick / N) | 0, target: best != null };
    }

    // Is there a pellet straight ahead, past a wall, that's a long way round? Then dig.
    function shortcut() {
        const h = G.snake[0], d = G.direction;
        let wall = false;
        for (let k = 1; k <= 6; k++) {
            const x = wrap(h.x + d.x * k), y = wrap(h.y + d.y * k);
            if (M.isFence(x, y)) return false;
            if (M.isWall(x, y)) { wall = true; continue; }
            if (wall && PL.at(x, y)) { const j = dist[idx(x, y)]; return j < 0 || j > k + 8; }
        }
        return false;
    }

    function press(fn) { driving = true; try { fn(); } finally { driving = false; } }

    // One decision, made whenever the snake has no turn queued.
    function think() {
        const h = G.snake[0];
        buildMap();
        const danger = blocked[idx(h.x, h.y)] === 3;   // standing in a lunge corridor
        const plan = search(0) || search(2) || search(3);

        // Coat up when the hunters crowd in; drop it before suspicion turns into an ambush.
        const near = G.ghosts.filter(g => g.active && !g.traitor && g.state === 'hunt' && tdist(g.x, g.y, h.x, h.y) <= 7).length;
        if (!SM.coat.disguised && SM.coat.cool <= 0 && near >= 2) press(() => SM.coat.toggle());
        else if (SM.coat.disguised && SM.coat.suspicion > 0.7) press(() => SM.coat.toggle());

        const canDig = SM.dash.cool <= 0 && !SM.dash.busy;
        if (!plan) { if (canDig) press(() => SM.dash.start()); return; }   // boxed in: go under
        const d = DIRS[plan.dir];
        const ahead = d.x === G.direction.x && d.y === G.direction.y;
        if (canDig && ahead && (danger || shortcut())) { press(() => SM.dash.start()); return; }
        if (!ahead) press(() => SM.input.pressDir(d));
    }

    // --- THE RUN CHAIN ---
    function tick(dt) {
        if (!on) return;
        if (performance.now() < handsUntil) { waitT = 0; return; }
        if (hidPaused && !document.hidden && G.mode === 'paused') { hidPaused = false; G.mode = 'play'; }
        if (G.mode === 'ready') {
            if ((waitT += dt) > START_DELAY_MS) { waitT = 0; press(() => SM.input.pressDir(G.direction)); }
        } else if (G.mode === 'over') {
            if ((waitT += dt) > RESTART_DELAY_MS) { waitT = 0; runs++; SM.game.restart(runs % NEW_MAP_EVERY === 0); }
        } else if (G.mode === 'play') {
            waitT = 0;
            const h = idx(G.snake[0].x, G.snake[0].y);
            thinkT += dt;
            if (!SM.dash.busy && !G.inputQueue.length && (h !== lastHead || thinkT > THINK_MS)) {
                lastHead = h; thinkT = 0;
                think();
            }
        }
    }

    // The app pausing on its way to the background shouldn't end an idle session.
    const appHidden = window.onAppHidden;
    window.onAppHidden = () => { if (on && G.mode === 'play') hidPaused = true; appHidden(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && on && G.mode === 'play') hidPaused = true; });

    const inIdle = () => SM.modes.id === 'idle';
    function toggle() {
        if (!on && !inIdle()) return;          // AUTO belongs to IDLE mode
        on = !on;
        handsUntil = 0; waitT = 0;
        SM.fx.popup(G.snake[0].x, G.snake[0].y - 1, on ? 'AUTO ON' : 'AUTO OFF', '#0ff');
        if (SM.idle) SM.idle.save();
    }
    // A player's own input: let go for a while.
    function manual() { if (on && !driving) handsUntil = performance.now() + HANDS_OFF_MS; }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(100, now - last);
        last = now;
        if (on && !inIdle()) { on = false; handsUntil = 0; waitT = 0; }   // left IDLE mode: take the wheel back
        tick(dt);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    if (SM.idle && SM.idle.autoWasOn && inIdle()) on = true;   // pick the idle session back up

    SM.auto = {
        toggle, manual,
        get on() { return on; },
        get driving() { return driving; },
        get handsOn() { return on && performance.now() < handsUntil; },
    };
})();
