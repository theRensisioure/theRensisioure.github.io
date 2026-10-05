// SNAKE-MAN · map
// The seeded world (walls, highways, districts), the staged domain fences, and line of sight.
// Emits 'map' whenever the layout or the fences change so the minimap can redraw.
'use strict';
(() => {
    const { N, CN, CHUNK, MIN_CORRIDOR, wrap, idx, ckey, chunkOf, ckeyDist, DIRS, mulberry32, store, emit } = SM.core;

    // walls[]: 0 open, 1 wall, 2 zone fence. Fences block movement but not sight.
    const walls = new Uint8Array(N * N);
    const isWall = (x, y) => walls[idx(x, y)] !== 0;
    const isOpaque = (x, y) => walls[idx(x, y)] === 1;
    const isFence = (x, y) => walls[idx(x, y)] === 2;
    let rng = Math.random;   // seeded; keeps running after generation so the opening is fixed too

    // --- MAP DESIGN PROCEDURE ---
    // The map is built in stages, each with a job, instead of scattering random pieces:
    //   1. HIGHWAYS  – three wide roads each way. On the torus they close into loops, so there is
    //                  always a way through, and their long sightlines are where lunges hurt most.
    //   2. DISTRICTS – every 10x10 chunk gets a role:
    //        PLAZA   open ground with one landmark: room to fight, eat, and get your bearings.
    //                Spread out by farthest-point sampling so one is never far away.
    //        WARREN  dense, short sightlines: ambush country. Rainbow pellets hide here.
    //        PILLARS a regular lattice of 2x2 posts: cover that chops up sightlines.
    //        YARDS   a loose scatter between the others.
    //   3. DRESSING  – each district places only its own kind of piece, inside its own chunks,
    //                  and every piece keeps MIN_CORRIDOR open tiles from every other.
    //   4. VALIDATE  – flood-fill from a highway; any unreachable pocket is filled in.
    // Content then follows the design: you start in a plaza, rainbows spawn in warrens, and
    // ghosts prefer to spawn anywhere but plazas.
    const D_PLAZA = 0, D_WARREN = 1, D_PILLARS = 2, D_YARDS = 3;
    const district = new Uint8Array(CN * CN);
    const road = new Uint8Array(N * N);
    const districtAt = (x, y) => district[ckey(chunkOf(x), chunkOf(y))];
    const isRoad = (x, y) => road[idx(x, y)] === 1;
    let plazas = [];
    const PLAZA_COUNT = 6, WARREN_SEEDS = 4, PILLAR_SEEDS = 3;
    let mapStats = {};
    let hwOff = 0;   // where the first highway starts (blocks between highways are N/3 = 30 apart)

    function generate(seed) {
        rng = mulberry32(seed);
        walls.fill(0); road.fill(0);
        const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
        const gap = MIN_CORRIDOR;

        // 1. HIGHWAYS
        const HW = MIN_CORRIDOR + 1, off = ri(0, N / 3 - 1);
        hwOff = off;
        for (let k = 0; k < 3; k++) {
            const at = off + k * N / 3;
            for (let w = 0; w < HW; w++) for (let i = 0; i < N; i++) { road[idx(i, at + w)] = 1; road[idx(at + w, i)] = 1; }
        }

        // 2. DISTRICTS
        const all = Array.from({ length: CN * CN }, (_, k) => k);
        const nearest = (k, set) => set.reduce((m, s) => Math.min(m, ckeyDist(k, s)), Infinity);
        plazas = [ri(0, CN * CN - 1)];
        while (plazas.length < PLAZA_COUNT) {   // farthest-point sampling
            let best = -1, bestD = -1;
            for (const k of all) {
                if (plazas.includes(k)) continue;
                const d = nearest(k, plazas) + rng() * 0.5;
                if (d > bestD) { bestD = d; best = k; }
            }
            plazas.push(best);
        }
        const rest = all.filter(k => !plazas.includes(k));
        const pickSeeds = n => Array.from({ length: n }, () => rest[ri(0, rest.length - 1)]);
        const warrenSeeds = pickSeeds(WARREN_SEEDS), pillarSeeds = pickSeeds(PILLAR_SEEDS);
        for (const k of all) {
            district[k] = plazas.includes(k) ? D_PLAZA
                : nearest(k, warrenSeeds) <= 1 ? D_WARREN
                : nearest(k, pillarSeeds) <= 1 ? D_PILLARS
                : D_YARDS;
        }

        // 3. DRESSING
        const fits = (cells, d) => cells.every(([x, y]) => {
            if (road[idx(x, y)] || districtAt(x, y) !== d) return false;
            for (let dx = -gap; dx <= gap; dx++) for (let dy = -gap; dy <= gap; dy++) if (isWall(x + dx, y + dy)) return false;
            return true;
        });
        const place = (cells, d) => { if (!fits(cells, d)) return false; cells.forEach(([x, y]) => { walls[idx(x, y)] = 1; }); return true; };
        const at = (ox, oy, cells) => cells.map(([dx, dy]) => [ox + dx, oy + dy]);

        const bar   = () => { const l = ri(3, 8), v = rng() < .5; return Array.from({ length: l }, (_, i) => v ? [0, i] : [i, 0]); };
        const ell   = () => { const a = ri(3, 6), b = ri(3, 6), sx = rng() < .5 ? 1 : -1, sy = rng() < .5 ? 1 : -1;
                              const c = []; for (let i = 0; i < a; i++) c.push([i * sx, 0]); for (let j = 1; j < b; j++) c.push([(a - 1) * sx, j * sy]); return c; };
        const block = () => { const w = ri(2, 3), h = ri(2, 3); const c = []; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) c.push([i, j]); return c; };
        const plus  = (r = ri(1, 2)) => { const c = [[0, 0]]; for (let i = 1; i <= r; i++) c.push([i, 0], [-i, 0], [0, i], [0, -i]); return c; };
        const cup   = () => { const w = ri(gap + 2, gap + 4), h = ri(2, 3), flip = rng() < .5 ? 1 : -1;   // U: its inside is a corridor too
                              const c = []; for (let i = 0; i < w; i++) c.push([i, 0]); for (let j = 1; j < h; j++) c.push([0, j * flip], [w - 1, j * flip]); return c; };
        // Landmark: a square ring with a MIN_CORRIDOR-wide gate in the middle of each side.
        const ring  = () => { const arm = 2, L = arm * 2 + gap, c = [];
                              for (let i = 0; i < L; i++) if (i < arm || i >= L - arm) c.push([i, 0], [i, L - 1], [0, i], [L - 1, i]);
                              return [...new Set(c.map(String))].map(s => s.split(',').map(Number)); };

        const chunksOf = d => all.filter(k => district[k] === d);
        const origin = k => [(k / CN | 0) * CHUNK, (k % CN) * CHUNK];

        // warrens: a braided maze on one global lattice. Walls are 1 wide between posts every
        // MIN_CORRIDOR+1 tiles, so every hall is exactly MIN_CORRIDOR wide. A randomized DFS
        // carves a spanning tree (every cell reachable, nothing boxed in), then about half the
        // dead ends are knocked through so there are loops to escape along. Edges facing other
        // districts are walled half the time, so warrens have several mouths.
        // The lattice stops short of the torus seam so the last hall isn't pinched.
        const ms = gap + 1, mx = ri(0, ms - 1), my = ri(0, ms - 1), cellsPer = Math.floor(N / ms) - 1;
        const inWarren = (x, y) => !road[idx(x, y)] && districtAt(x, y) === D_WARREN;
        // a cell counts if its open interior is warren; its walls get clipped where they'd hit a
        // highway, so the maze runs right up to the roads that slice through every warren
        const valid = (i, j) => {
            if (i < 0 || j < 0 || i >= cellsPer || j >= cellsPer) return false;
            const x0 = mx + i * ms, y0 = my + j * ms;
            for (let y = y0 + 1; y < y0 + ms; y++) for (let x = x0 + 1; x < x0 + ms; x++) if (!inWarren(x, y)) return false;
            return true;
        };
        const edge = new Map();   // 'h,i,j' = top wall of cell (i,j); 'v,i,j' = left wall of cell (i,j)
        const sides = (i, j) => [                       // [key, neighbour i, neighbour j]
            ['h,' + i + ',' + j, i, j - 1], ['h,' + i + ',' + (j + 1), i, j + 1],
            ['v,' + i + ',' + j, i - 1, j], ['v,' + (i + 1) + ',' + j, i + 1, j]];
        const cellsList = [];
        for (let j = 0; j < cellsPer; j++) for (let i = 0; i < cellsPer; i++) if (valid(i, j)) cellsList.push([i, j]);
        for (const [i, j] of cellsList) for (const [key, ni, nj] of sides(i, j)) {
            if (!edge.has(key)) edge.set(key, valid(ni, nj) ? true : rng() < 0.5);
        }
        const seenCell = new Set();
        for (const [si, sj] of cellsList) {                 // carve (one tree per warren blob)
            if (seenCell.has(si + ',' + sj)) continue;
            const stack = [[si, sj]]; seenCell.add(si + ',' + sj);
            while (stack.length) {
                const [i, j] = stack[stack.length - 1];
                const next = sides(i, j).filter(([, ni, nj]) => valid(ni, nj) && !seenCell.has(ni + ',' + nj));
                if (!next.length) { stack.pop(); continue; }
                const [key, ni, nj] = next[ri(0, next.length - 1)];
                edge.set(key, false);
                seenCell.add(ni + ',' + nj);
                stack.push([ni, nj]);
            }
        }
        for (const [i, j] of cellsList) {                   // braid: open ~half the dead ends
            const closed = sides(i, j).filter(([key]) => edge.get(key));
            if (closed.length >= 3 && rng() < 0.5) edge.set(closed[ri(0, closed.length - 1)][0], false);
        }
        for (const [key, on] of edge) {
            if (!on) continue;
            const [o, i, j] = key.split(','), x = mx + +i * ms, y = my + +j * ms;
            for (let k = 0; k <= ms; k++) {
                const wx = o === 'h' ? x + k : x, wy = o === 'h' ? y : y + k;
                if (inWarren(wx, wy)) walls[idx(wx, wy)] = 1;
            }
        }

        // plazas: one landmark each, as close to the chunk centre as the highways allow
        for (const k of chunksOf(D_PLAZA)) {
            const [x0, y0] = origin(k);
            // big landmark first; if a highway cuts the chunk, fall back to smaller ones
            const big = rng() < 0.5 ? [ring, () => plus(3)] : [() => plus(3), ring];
            const pillbox = () => { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.push([i, j]); return c; };
            const options = [...big, () => plus(2), pillbox, () => plus(1)];
            done: for (const make of options) for (let t = 0; t < 16; t++) {
                const shape = make();
                const lo = Math.min(...shape.map(([dx]) => dx)), size = 1 + Math.max(...shape.map(([dx]) => dx)) - lo; // square shapes
                const slack = Math.max(0, CHUNK - size);
                const ox = x0 - lo + ri(0, slack), oy = y0 - lo + ri(0, slack);
                if (place(at(ox, oy, shape), D_PLAZA)) break done;
            }
        }
        // pillars: one global lattice (so neighbouring pillar chunks line up), ~30% posts missing.
        // Alternate rows are staggered like bricks: long horizontal lanes, broken vertical ones.
        const step = gap + 2, px = ri(0, step - 1), py = ri(0, step - 1);
        const mod = (v, m) => ((v % m) + m) % m;
        for (const k of chunksOf(D_PILLARS)) {
            const [x0, y0] = origin(k);
            for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
                if (mod(y - py, step)) continue;
                const stagger = Math.floor(mod(y - py, N) / step) % 2 ? Math.ceil(step / 2) : 0;
                if (mod(x - px - stagger, step) || rng() < 0.3) continue;
                place(at(x, y, [[0, 0], [1, 0], [0, 1], [1, 1]]), D_PILLARS);
            }
        }
        // yards: a loose scatter of pieces
        const dress = (d, palette, want) => {
            for (const k of chunksOf(d)) {
                const [x0, y0] = origin(k);
                for (let n = 0, t = 0; n < want && t < 60; t++) {
                    const shape = palette[ri(0, palette.length - 1)]();
                    if (place(at(x0 + ri(0, CHUNK - 1), y0 + ri(0, CHUNK - 1), shape), d)) n++;
                }
            }
        };
        dress(D_YARDS, [bar, plus, block, ell, cup], 3);

        // 4. VALIDATE: flood-fill the open ground from a highway; seal anything unreachable.
        const seen = new Uint8Array(N * N), q = [idx(off, off)];
        seen[q[0]] = 1;
        while (q.length) {
            const c = q.pop(), cx = c % N, cy = (c / N) | 0;
            for (const d of DIRS) {
                const ni = idx(cx + d.x, cy + d.y);
                if (!seen[ni] && !walls[ni]) { seen[ni] = 1; q.push(ni); }
            }
        }
        let sealed = 0;
        for (let i = 0; i < N * N; i++) if (!walls[i] && !seen[i]) { walls[i] = 1; sealed++; }
        mapStats = { walls: walls.reduce((s, v) => s + v, 0), sealed };

        emit('map');
    }

    // --- STAGED DOMAIN ---
    // You start fenced into the highway block around your starting plaza. Eating pellets opens the
    // world in stages, a block at a time along the highway grid, until the fences are gone. The
    // domain always runs from one highway to the far side of another, so a fence only ever sits
    // just outside a wide, wall-free road and can't pinch a corridor or seal a pocket.
    const BLOCK = N / 3;
    const STAGES = [                // domain size in blocks, pellets eaten to get there, pellet target
        { bw: 1, bh: 1, at: 0,  food: 25 },
        { bw: 2, bh: 1, at: 15, food: 35 },
        { bw: 2, bh: 2, at: 40, food: 45 },
        { bw: 3, bh: 3, at: 75, food: 60 },   // the whole torus: no fences
    ];
    let stage = 0;
    const dom = { bx: 0, by: 0, sx: 1, sy: 1 };   // start block and which way it grows
    const inRange = (v, s, l) => wrap(v - s) < l;
    function domainRect() {
        const st = STAGES[stage];
        if (st.bw >= 3) return null;
        const x0 = hwOff + BLOCK * (dom.sx > 0 ? dom.bx : dom.bx - (st.bw - 1));
        const y0 = hwOff + BLOCK * (dom.sy > 0 ? dom.by : dom.by - (st.bh - 1));
        // from the start of one highway to the end of the highway past the last block
        return { x: x0, y: y0, w: st.bw * BLOCK + MIN_CORRIDOR + 1, h: st.bh * BLOCK + MIN_CORRIDOR + 1 };
    }
    let domCache = null;   // domainRect() for the current stage (null = whole world)
    function inDomain(x, y) {
        const r = domCache;
        return !r || (inRange(x, r.x, r.w) && inRange(y, r.y, r.h));
    }
    function buildFence() {
        for (let i = 0; i < N * N; i++) if (walls[i] === 2) walls[i] = 0;
        const r = domCache = domainRect();
        if (r) {
            const post = (x, y) => { const i = idx(x, y); if (walls[i] === 0) walls[i] = 2; };
            for (let k = -1; k <= r.w; k++) { post(r.x + k, r.y - 1); post(r.x + k, r.y + r.h); }
            for (let k = -1; k <= r.h; k++) { post(r.x - 1, r.y + k); post(r.x + r.w, r.y + k); }
        }
        emit('map');
    }
    function setupDomain(sx, sy, rand) {
        stage = 0;
        dom.bx = Math.floor(wrap(sx - hwOff) / BLOCK);
        dom.by = Math.floor(wrap(sy - hwOff) / BLOCK);
        dom.sx = rand() < 0.5 ? 1 : -1;
        dom.sy = rand() < 0.5 ? 1 : -1;
        buildFence();
    }
    // Open the fences as far as `eaten` pellets allow. Returns true if the domain grew.
    function growTo(eaten) {
        let grew = false;
        while (stage < STAGES.length - 1 && eaten >= STAGES[stage + 1].at) { stage++; grew = true; }
        if (grew) buildFence();
        return grew;
    }

    // Can (ax, ay) see (bx, by)? March the torus-shortest segment and stop at the first wall.
    function lineOfSight(ax, ay, bx, by) {
        const dx = SM.core.wdelta(ax, bx), dy = SM.core.wdelta(ay, by);
        const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3);
        for (let k = 1; k < n; k++) {
            const t = k / n;
            if (isOpaque(Math.round(ax + dx * t), Math.round(ay + dy * t))) return false;
        }
        return true;
    }

    function loadSeed() {
        return parseInt(store.get('snakeman-seed'), 10) || newSeed();
    }
    function newSeed() {
        const s = 1 + Math.floor(Math.random() * 999999);
        store.set('snakeman-seed', s);
        return s;
    }

    SM.map = {
        D_PLAZA, D_WARREN, D_PILLARS, D_YARDS, STAGES,
        walls, district, road,
        isWall, isOpaque, isFence, isRoad, districtAt,
        generate, setupDomain, growTo, domainRect, inDomain, lineOfSight, loadSeed, newSeed,
        get rng() { return rng; },
        get plazas() { return plazas; },
        get stage() { return stage; },
        get stats() { return mapStats; },
    };
})();
