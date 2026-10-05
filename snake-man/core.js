// SNAKE-MAN · core
// Configuration, math, torus geometry, the seeded RNG and the event bus. Depends on nothing.
//
// Module layout: every file is a plain script (so the game still runs from file:// and inside
// the Android WebView) wrapped in a closure that publishes one small API on window.SM.
// Load order is set in snake-man.html; a module may call into a later one only at run time.
'use strict';
window.SM = window.SM || {};
(() => {
    // --- CONFIG ---
    const GRID_SIZE = 20;
    const W = 600;                // canvas height in px (and width on one screen)
    const VIEW = W / GRID_SIZE;   // 30 tiles visible top to bottom
    // Two screens (the Thor, see dual.js): the top screen is the game alone, so the canvas widens to
    // its shape and shows more of the map sideways. Decided once, before anything is drawn.
    const DUAL = new URLSearchParams(location.search).has('dual')
        || (() => { try { return !!(window.SnakeManApp && SnakeManApp.dual && SnakeManApp.dual()); } catch (e) { return false; } })();
    const CW = DUAL ? 1060 : W;   // canvas width in px (1060x600 is about the Thor's 16:9)
    const TILE_COUNT = 90;        // the world is 90x90 tiles and wraps on both axes
    const MIN_CORRIDOR = 3;       // narrowest gap between walls, in tiles (room to juke a lunge)
    const CHUNK = 10;             // map design and ghost spawning both work in 10x10-tile chunks

    const TIME_LIMIT_MS = 5 * 60 * 1000;
    const START_LIVES = 3;
    const MAX_LIVES   = 5;        // the healing ladder can bank lives up to here

    const LUNGE_OVERSHOOT = 2;
    const DAZE_MS        = 1600;
    const DAZE_STEP_MS   = 480;
    const INVULN_MS      = 2000;

    const RAINBOW_COUNT      = 2;      // rainbow pellets on the map at once
    const RAINBOW_RESPAWN_MS = 25000;  // an eaten one comes back somewhere else after this
    const EVOLVE_MS          = 20000;  // the weakest ghost quietly molts this often

    const FRUIT_EVERY = 50;            // a fruit appears every this many pellets eaten
    const FRUIT_MS    = 15000;         // ...and rots away if you don't reach it in time
    const BOOST_MS    = 10000;         // eating it doubles every score for this long

    // --- MATH ---
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = t => Math.max(0, Math.min(1, t));
    const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

    // --- TORUS HELPERS ---
    const N = TILE_COUNT;
    const wrap = v => ((v % N) + N) % N;
    const idx = (x, y) => wrap(y) * N + wrap(x);
    function wdelta(a, b) { // shortest signed step from a to b around the ring
        let d = wrap(b - a);
        if (d > N / 2) d -= N;
        return d;
    }
    function wdeltaF(a, b) { // same, for fractional positions (camera, animation)
        let d = (b - a) % N;
        if (d > N / 2) d -= N;
        if (d < -N / 2) d += N;
        return d;
    }
    const tdist = (ax, ay, bx, by) => Math.abs(wdelta(ax, bx)) + Math.abs(wdelta(ay, by));
    const CN = N / CHUNK;                                        // chunks per side (9)
    const chunkOf = v => Math.floor(wrap(v) / CHUNK);
    const cdist = (a, b) => { const d = Math.abs(a - b) % CN; return Math.min(d, CN - d); };
    const ckey = (cx, cy) => cx * CN + cy;                       // chunk id
    const ckeyDist = (a, b) => Math.max(cdist(a / CN | 0, b / CN | 0), cdist(a % CN, b % CN));
    const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    const dirIndex = d => DIRS.findIndex(o => o.x === d.x && o.y === d.y);

    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // --- STORAGE (localStorage can be missing or throw: private windows, some WebViews) ---
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    };

    // --- EVENT BUS ---
    // The rules announce what happened (eat, dodge, bonk, hit, dash...) and whoever cares listens:
    // the healing ladder, the Turncoat meter, the FX. Keeps the systems from knowing each other.
    const handlers = new Map();
    function on(ev, fn) {
        if (!handlers.has(ev)) handlers.set(ev, []);
        handlers.get(ev).push(fn);
    }
    function emit(ev, data) {
        const hs = handlers.get(ev);
        if (hs) for (const fn of hs) fn(data);
    }

    SM.core = {
        GRID_SIZE, W, CW, DUAL, VIEW, N, MIN_CORRIDOR, CHUNK, CN,
        TIME_LIMIT_MS, START_LIVES, MAX_LIVES,
        LUNGE_OVERSHOOT, DAZE_MS, DAZE_STEP_MS, INVULN_MS,
        RAINBOW_COUNT, RAINBOW_RESPAWN_MS, EVOLVE_MS, FRUIT_EVERY, FRUIT_MS, BOOST_MS,
        lerp, clamp01, smooth,
        wrap, idx, wdelta, wdeltaF, tdist, chunkOf, cdist, ckey, ckeyDist, DIRS, dirIndex,
        mulberry32, store, on, emit,
    };
})();
