// SNAKE-MAN · dash
// DASH (Shift): the snake burrows. A dash is a burst of fast steps taken underground: the head
// dives into a hole, a mound of earth races ahead, and it bursts up again a few tiles on.
// Underground you pass beneath blue walls, ghosts and your own body, and nothing can touch
// you. Zone fences go down to bedrock, so a tunnel stops short of them, and you only come up
// on open ground. The body keeps threading through the tunnel after you surface; each hole
// caves in once the last of you is through it.
// Emits: 'dash' (going under), 'surfaced' ({ walls, len } once you're up).
'use strict';
(() => {
    const { GRID_SIZE, wrap, emit, on } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;
    const { ctx, sx, sy, snap, onScreen } = SM.view;

    const DASH_MIN = 2;         // shortest dash worth taking
    const DIVE_MS = 110;        // head sinking into the hole (you hold still, already safe)
    const BURROW_STEP_MS = 34;  // per tile underground (about 3-4x walking pace)
    const EMERGE_MS = 260;      // head popping back out (you're already moving again)
    const DIRT = ['#7a5530', '#a57c4a', '#4a3220', '#c89c62'];
    const GRIT = ['#5050f0', '#9a9aff', '#1c1c88'];

    let cool = 0;
    let run = null;      // the dash in progress: { dir, path, k, acc, phase: dive|burrow, t, tun, walls }
    let tunnels = [];    // { id, entry, exit, dir, entryOpen, exitOpen, age }
    let emergeT = 0;     // ms left on the head's pop-up
    let nextTun = 1;

    function reset() { cool = 0; run = null; tunnels = []; emergeT = 0; }

    // The farthest landing in reach that's open ground and not somewhere your body still is.
    function plan() {
        const S = G.snake, h = S[0], d = G.direction, path = [];
        const reach = SM.skills.stat('digReach');   // how far a dash reaches (BURROW)
        for (let k = 1; k <= reach; k++) {
            const x = wrap(h.x + d.x * k), y = wrap(h.y + d.y * k);
            if (M.isFence(x, y) || !M.inDomain(x, y)) break;
            path.push({ x, y });
        }
        for (let k = path.length; k >= DASH_MIN; k--) {
            const c = path[k - 1];
            if (M.isWall(c.x, c.y)) continue;
            // after k steps the last k segments have moved on; the rest are still where they are
            if (S.slice(0, Math.max(0, S.length - k)).some(s => !s.under && s.x === c.x && s.y === c.y)) continue;
            return path.slice(0, k);
        }
        return null;
    }

    function start() {
        if (G.mode !== 'play' || run || cool > 0) return false;
        if (G.inputQueue.length) G.direction = G.inputQueue.shift();   // arrow + Shift dashes the new way
        const h = G.snake[0], path = plan();
        if (!path) { fx.popup(h.x, h.y - 1, 'NO ROOM', DIRT[1]); cool = 300; return false; }
        const id = nextTun++, dir = { x: G.direction.x, y: G.direction.y };
        h.entry = id;
        run = { dir, path, k: 0, acc: 0, phase: 'dive', t: 0, tun: id, walls: path.filter(c => M.isOpaque(c.x, c.y)).length };
        tunnels.push({ id, entry: { x: h.x, y: h.y }, exit: path[path.length - 1], dir, entryOpen: true, exitOpen: false, age: 0 });
        // lunges already in the air (or locked on) are about to hit dirt
        G.ghosts.forEach(g => { if (g.state === 'lunge' || (g.state === 'aim' && g.locked)) g.dug = true; });
        fx.burst(h.x, h.y, { n: 10, colors: DIRT, speed: 2.5, up: 6, life: 500 });
        emit('dash', { len: path.length, walls: run.walls });
        return true;
    }

    // Advance the dash in progress (the player's movement is ours while it runs).
    function update(dt) {
        const r = run;
        if (r.phase === 'dive') {
            r.t += dt;
            if (r.t < DIVE_MS) return;
            dt = r.t - DIVE_MS;
            r.phase = 'burrow';
        }
        r.acc += dt;
        while (run && r.acc >= BURROW_STEP_MS && r.k < r.path.length) {
            r.acc -= BURROW_STEP_MS;
            r.k++;
            const last = r.k === r.path.length;
            const seg = SM.player.advance(r.dir, { under: !last, tun: r.tun });
            if (last) { surface(seg); break; }
            if (M.isOpaque(seg.x, seg.y)) {   // the wall above shudders and sheds grit
                fx.burst(seg.x, seg.y - 0.3, { n: 3, colors: GRIT, speed: 1.5, up: 4, life: 350 });
            } else {
                fx.burst(seg.x, seg.y, { n: 2, colors: DIRT, speed: 1.2, up: 3, life: 300 });
            }
        }
    }

    function surface(seg) {
        const r = run, t = tunnels.find(o => o.id === r.tun);
        seg.exit = r.tun;
        if (t) { t.exitOpen = true; t.age = 0; }
        run = null;
        cool = SM.skills.stat('digCoolMs') * G.digCoolMul;   // IDLE mode's DIG upgrade
        emergeT = EMERGE_MS;
        fx.burst(seg.x, seg.y, { n: 18, colors: DIRT, speed: 3.5, up: 9, life: 750 });
        emit('surfaced', { walls: r.walls, len: r.path.length });
        SM.player.checkContacts(true);   // you come up where you come up
    }

    // Timers and hole bookkeeping; runs every tick while playing.
    function tick(dt) {
        cool = Math.max(0, cool - dt);
        emergeT = Math.max(0, emergeT - dt);
        const S = G.snake;
        for (const t of tunnels) {
            t.age += dt;
            if (run && run.tun === t.id) continue;
            if (t.entryOpen && !S.some(s => s.entry === t.id)) { t.entryOpen = false; cave(t.entry); }
            if (t.exitOpen && !S.some(s => s.under && s.tun === t.id)) { t.exitOpen = false; cave(t.exit); }
        }
        tunnels = tunnels.filter(t => t.entryOpen || t.exitOpen || (run && run.tun === t.id));
    }

    // A hole caves in: it shrinks shut with a puff of dust.
    function cave(c) {
        fx.burst(c.x, c.y, { n: 6, colors: DIRT, speed: 1.2, up: 3, life: 400 });
        fx.play({
            dur: 260, layer: 'floor', ease: fx.ease.inQuad,
            draw: k => drawHole(c, Math.round(4 * (1 - k))),
        });
    }

    // --- DRAWING ---
    function drawHole(c, open) {
        if (open <= 0 || !onScreen(c.x, c.y)) return;
        ctx.drawImage(SM.gfx.holeSprite(open), snap(sx(c.x) - GRID_SIZE / 2), snap(sy(c.y) - GRID_SIZE / 2));
    }

    // Floor layer: holes, the ridge over segments still underground, and the racing mound.
    // Walls are drawn after this, so anything passing under a wall is hidden by it.
    function drawFloor(now) {
        for (const t of tunnels) {
            if (t.entryOpen) drawHole(t.entry, Math.min(4, 1 + Math.floor(t.age / 25)));
            if (t.exitOpen) drawHole(t.exit, Math.min(4, 2 + Math.floor(t.age / 30)));
        }
        const S = G.snake;
        for (let i = run ? 1 : 0; i < S.length; i++) {
            const s = S[i];
            if (!s.under || M.isWall(s.x, s.y) || !onScreen(s.x, s.y)) continue;
            ctx.drawImage(SM.gfx.ridgeSprite((s.x + s.y) & 3), snap(sx(s.x) - GRID_SIZE / 2), snap(sy(s.y) - GRID_SIZE / 2));
        }
        if (run && run.phase === 'burrow') {
            const f = Math.min(run.path.length - 1, run.k + run.acc / BURROW_STEP_MS);
            const t = tunnels.find(o => o.id === run.tun), e = t ? t.entry : S[0];
            const x = e.x + run.dir.x * f, y = e.y + run.dir.y * f;
            const shake = Math.floor(now / 40) % 2;
            ctx.drawImage(SM.gfx.moundSprite(shake), snap(sx(x) - GRID_SIZE / 2), snap(sy(y) - GRID_SIZE / 2 - shake * 2));
        }
    }

    // How to draw the head right now: hidden underground, sinking into the entry hole
    // (sink 0 → 1), or springing out of the exit (pop 0 → 1).
    function headPose() {
        if (run) return run.phase === 'dive' ? { sink: Math.min(1, run.t / DIVE_MS) } : { hidden: true };
        if (emergeT > 0) return { pop: 1 - emergeT / EMERGE_MS };
        return null;
    }

    on('placed', () => { run = null; });

    SM.dash = {
        reset, start, update, tick, drawFloor, headPose,
        get busy() { return !!run; },
        get shielded() { return !!run; },
        get cool() { return cool; },
    };
})();
