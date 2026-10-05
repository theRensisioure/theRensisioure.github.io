// SNAKE-MAN · pellets
// Yellow dots and rainbow gems. They only appear inside the open domain. Yellow ones are
// weighted toward the dangerous districts (they stack up in warrens); rainbow ones want a
// warren outright, and an eaten one comes back somewhere else after a while.
'use strict';
(() => {
    const { N, idx, wrap, tdist, RAINBOW_RESPAWN_MS, FRUIT_EVERY, FRUIT_MS } = SM.core;
    const G = SM.G, M = SM.map;

    // grid: 0 empty, 1 yellow pellet, 2 rainbow pellet, 3 fruit
    const YELLOW = 1, RAINBOW = 2, FRUIT = 3;
    const grid = new Uint8Array(N * N);
    let list = [];
    let rainbowTimers = [];   // ms until each eaten rainbow pellet reappears
    let fruit = null;         // { x, y, t } the one fruit on the map, t = ms until it rots

    // Pellets pile up where it's dangerous: plaza, warren, pillars, yards (highways get ROAD).
    const WEIGHT = [0.5, 3, 2, 1], WEIGHT_ROAD = 0.7, WEIGHT_MAX = 3;
    const weight = (x, y) => M.isRoad(x, y) ? WEIGHT_ROAD : WEIGHT[M.districtAt(x, y)];

    function reset() { grid.fill(0); list = []; rainbowTimers = []; fruit = null; }

    function spawn(rand = Math.random, minDist = 10, rainbow = false, kind = rainbow ? RAINBOW : YELLOW) {
        const h = G.snake[0], r = M.domainRect() || { x: 0, y: 0, w: N, h: N };
        for (let tries = 0; tries < 1500; tries++) {
            const x = wrap(r.x + Math.floor(rand() * r.w)), y = wrap(r.y + Math.floor(rand() * r.h));
            const i = idx(x, y);
            if (M.walls[i] || grid[i]) continue;
            if (tdist(x, y, h.x, h.y) < minDist) continue;
            if (G.snake.some(s => s.x === x && s.y === y)) continue;
            if (kind === RAINBOW) { if (tries < 800 && (M.isRoad(x, y) || M.districtAt(x, y) !== M.D_WARREN)) continue; }
            else if (kind === YELLOW && rand() * WEIGHT_MAX > weight(x, y)) continue;
            grid[i] = kind;
            const p = { x, y, rainbow: kind === RAINBOW, fruit: kind === FRUIT };
            list.push(p);
            return p;
        }
    }

    const at = (x, y) => grid[idx(x, y)];

    // Remove the pellet at (x, y) and return its kind. Yellow ones are replaced at once,
    // rainbow ones after RAINBOW_RESPAWN_MS, fruit only when the pellet count earns another.
    function take(x, y) {
        const i = idx(x, y), kind = grid[i];
        if (!kind) return 0;
        grid[i] = 0;
        list = list.filter(p => p.x !== x || p.y !== y);
        if (kind === RAINBOW) rainbowTimers.push(RAINBOW_RESPAWN_MS);
        else if (kind === FRUIT) fruit = null;
        else spawn();
        return kind;
    }

    // Top the yellow pellets up to `target` (the domain just grew).
    function fillTo(target) {
        for (let i = list.filter(p => !p.rainbow && !p.fruit).length; i < target; i++) spawn(Math.random, 12);
    }

    // --- FRUIT ---
    // Every FRUIT_EVERY pellets a fruit drops somewhere a short run away. It rots after FRUIT_MS;
    // an uneaten one is simply gone (the next one comes at the next multiple).
    SM.core.on('eat', e => {
        if (e.kind !== YELLOW || G.eaten % FRUIT_EVERY || fruit) return;
        const p = spawn(Math.random, 8, false, FRUIT);
        if (p) { fruit = { x: p.x, y: p.y, t: FRUIT_MS }; SM.core.emit('fruit', fruit); }
    });

    function update(dt) {
        rainbowTimers = rainbowTimers.map(t => t - dt);
        while (rainbowTimers.length && rainbowTimers[0] <= 0) { rainbowTimers.shift(); spawn(Math.random, 15, true); }
        if (fruit && (fruit.t -= dt) <= 0) {
            grid[idx(fruit.x, fruit.y)] = 0;
            list = list.filter(p => !p.fruit);
            fruit = null;
        }
    }

    SM.pellets = { YELLOW, RAINBOW, FRUIT, reset, spawn, at, take, fillTo, update, get list() { return list; }, get fruit() { return fruit; } };
})();
