// SNAKE-MAN · ghosts
// The four hunters: how they read you, wind up and lunge; their genes and evolution; their
// speed profiles; and the chunk director that spawns and culls them around the player.
// Emits: 'bonk' (lunge hit a wall), 'dodge' (a lunge at you ended without landing),
//        'snip' (a lunge cut your tail), 'betrayed' (a traitor dazed one of its own).
'use strict';
(() => {
    const { N, CN, CHUNK, LUNGE_OVERSHOOT, DAZE_MS, DAZE_STEP_MS, EVOLVE_MS,
            lerp, wrap, idx, wdelta, tdist, chunkOf, cdist, ckey, DIRS, emit } = SM.core;
    const G = SM.G, M = SM.map, K = SM.kin, D = SM.dial;
    const fx = SM.fx;
    const head = () => G.snake[0];
    const disguised = () => SM.coat.disguised;

    // --- PATHFINDING (BFS on the torus, walls block) ---
    const bfsDist = new Int16Array(N * N).fill(-1);
    const bfsQueue = new Int32Array(N * N);

    // Distance field outward from the target, stopping once the ghost's neighbours are known.
    function bfsFrom(tx, ty, gx, gy) {
        let qh = 0, qt = 0;
        const start = idx(tx, ty), gi = idx(gx, gy);
        bfsDist[start] = 0; bfsQueue[qt++] = start;
        let gd = -1, budget = 6000;
        while (qh < qt && budget-- > 0) {
            const c = bfsQueue[qh++], cd = bfsDist[c];
            if (gd >= 0 && cd > gd + 1) break;
            if (c === gi) gd = cd;
            const cx = c % N, cy = (c / N) | 0;
            for (const d of DIRS) {
                const ni = idx(cx + d.x, cy + d.y);
                if (bfsDist[ni] !== -1 || M.walls[ni]) continue;
                bfsDist[ni] = cd + 1;
                bfsQueue[qt++] = ni;
            }
        }
        return qt;
    }
    function bfsReset(qt) { for (let i = 0; i < qt; i++) bfsDist[bfsQueue[i]] = -1; }

    // --- GHOSTS ---
    const GHOST_DEFS = [
        { name: 'BLINKY', color: '#FF0000', hunt: g => K.toCell(K.predict(0, 0)),   aimOrder: 0 },
        { name: 'PINKY',  color: '#FFB8FF', hunt: g => K.toCell(K.predict(1, 4)),   aimOrder: 1 },
        { name: 'INKY',   color: '#00FFFF', hunt: g => K.toCell(K.predict(2, 6)),   aimOrder: 2 },
        { name: 'CLYDE',  color: '#FFB800', hunt: g => K.toCell(K.trailCentroid()), aimOrder: 1, late: true },
    ];

    // immune: the one armored ghost. Rainbows don't turn it blue and it can never be eaten.
    function makeGhost(def, immune = false) {
        const g = {
            ...def, x: 0, y: 0, dir: { x: 1, y: 0 },
            state: 'hunt', t: 0, acc: 0, cool: 0,
            target: { x: 0, y: 0 }, wp: null, locked: false, lungeLeft: 0,
            trail: [], active: true, fade: 0, vis: 0, farFor: 0,
            traitor: 0, victim: null,   // ms left fighting for the player (see TURNCOAT)
            dug: false,                 // you burrowed under this lunge (see DASH)
            immune,
            genes: {}, gen: 1, fit: 0, born: D.playedMs(),
            pace: null, life: 0,        // speed profile and age in ms (see SPEED PROFILES)
        };
        for (const k of GENES) g.genes[k] = 0.15 + Math.random() * 0.2;
        assignPace(g);
        return g;
    }

    // --- SPEED PROFILES ---
    // Every ghost gets its own speed per state (hunt, patrol, lunge, daze), and the pack is dealt
    // them on purpose rather than rolled: each archetype has a target share of the pack, a new
    // ghost takes whichever archetype is most under-represented, and within an archetype values
    // are spread along a golden-ratio sequence so no two instances land on the same numbers.
    // The pack averages out near 1.0 so the difficulty dial keeps its calibration.
    //
    // Speed also varies inside a state. A hunting ghost surges while it closes into lunge range
    // (burst), eases off to stalk when it's in range but can't strike yet (stalk), and breathes
    // on its own period and phase (rhythm) so the pack never moves in lockstep.
    const PACES = [
        //           share  hunt          patrol       lunge        daze         burst stalk rhythm
        { name: 'SPRINTER', share: 0.20, hunt: [1.18, 1.32], patrol: [1.00, 1.12], lunge: [1.10, 1.20], daze: [1.10, 1.25], burst: 0.30, stalk: 0.05, rhythm: [0.06, 0.10] },
        { name: 'STRIDER',  share: 0.40, hunt: [0.94, 1.08], patrol: [0.90, 1.00], lunge: [0.96, 1.06], daze: [0.95, 1.05], burst: 0.18, stalk: 0.15, rhythm: [0.08, 0.14] },
        { name: 'STALKER',  share: 0.25, hunt: [0.80, 0.92], patrol: [0.75, 0.85], lunge: [1.12, 1.24], daze: [0.90, 1.00], burst: 0.45, stalk: 0.35, rhythm: [0.10, 0.16] },
        { name: 'LURKER',   share: 0.15, hunt: [0.68, 0.80], patrol: [0.60, 0.72], lunge: [0.90, 1.00], daze: [0.80, 0.90], burst: 0.10, stalk: 0.20, rhythm: [0.16, 0.24] },
    ];
    const PHI = 0.6180339887;
    const paceSeq = PACES.map(() => Math.random());   // one low-discrepancy sequence per archetype

    function assignPace(g) {
        const live = G.ghosts.filter(o => o.active && o !== g && o.pace);
        const n = live.length + 1;
        const deficit = p => p.share * n - live.filter(o => o.pace.kind === p.name).length;
        const band = PACES.reduce((a, b) => deficit(b) > deficit(a) + 1e-9 ? b : a);
        const bi = PACES.indexOf(band);
        paceSeq[bi] = (paceSeq[bi] + PHI) % 1;
        const u = paceSeq[bi], at = ([lo, hi], off = 0) => lerp(lo, hi, (u + off) % 1);
        g.pace = {
            kind: band.name,
            hunt: at(band.hunt), patrol: at(band.patrol, 0.37), lunge: at(band.lunge, 0.71), daze: at(band.daze, 0.19),
            burst: band.burst, stalk: band.stalk,
            rhythm: at(band.rhythm, 0.53), period: 1800 + Math.random() * 2400, phase: Math.random() * Math.PI * 2,
        };
    }

    // How fast g moves right now, as a multiplier on its base step rate.
    function paceNow(g, mode, dist) {
        const p = g.pace;
        let m = p[mode];
        if (mode === 'hunt') {
            const r = attackRange(g);
            if (dist > r && dist <= r + 8) m *= 1 + p.burst * (1 - (dist - r) / 8);   // closing in
            else if (dist <= r && (g.cool > 0 || attackers() >= D.maxAttackers())) m *= 1 - p.stalk;  // holding
        }
        return m * (1 + p.rhythm * Math.sin(g.life / p.period * Math.PI * 2 + p.phase));
    }

    // --- PROCEDURAL EVOLUTION ---
    // Each ghost carries five genes in 0..1 (0 = timid, 1 = deadly). A ghost that lands hits
    // earns fitness. New ghosts are bred from fit survivors and from the gene pool that
    // despawned ghosts leave behind; an eaten ghost's genes are simply lost.
    const GENES = ['speed', 'wind', 'reach', 'sense', 'nerve'];
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
    const geneCap = () => 0.4 + 0.6 * D.heatE();   // evolution can't outrun the difficulty dial
    const GENE_POOL_MAX = 16;
    let genePool = [];                             // { genes, gen, worth } of despawned ghosts

    function archive(g) {
        genePool.push({ genes: { ...g.genes }, gen: g.gen, worth: fitRate(g) });
        if (genePool.length > GENE_POOL_MAX) {
            genePool.sort((a, b) => b.worth - a.worth);
            genePool.length = GENE_POOL_MAX;
        }
    }

    function breed(child) {
        const pool = G.ghosts.filter(o => o.active && o !== child)
            .map(o => ({ genes: o.genes, gen: o.gen, worth: fitRate(o) }))
            .concat(genePool);
        const pick = () => pool[Math.floor(Math.random() * pool.length)];
        let parent = child, mate = child;
        if (pool.length) {
            const worth = o => o.worth + o.gen * 0.1;
            parent = [pick(), pick(), pick()].reduce((a, b) => worth(b) > worth(a) ? b : a);   // tournament of three
            mate = pick();
        }
        const cap = geneCap(), drift = lerp(0.04, 0.1, D.heatE());
        for (const k of GENES) {
            const v = Math.random() < 0.7 ? parent.genes[k] : mate.genes[k];
            child.genes[k] = Math.max(0, Math.min(cap, v + gauss() * 0.15 + drift));
        }
        child.gen = parent.gen + 1;
        child.fit = 0;
        child.born = D.playedMs();
    }

    // hits earned per minute alive: a fair way to compare a veteran with a newborn
    const fitRate = g => g.fit / ((D.playedMs() - g.born) / 60000 + 0.5);

    // 0-3: how far this ghost's genome has drifted toward deadly (shown in its eyes).
    function tier(g) {
        const avg = GENES.reduce((s, k) => s + g.genes[k], 0) / GENES.length;
        return avg > 0.75 ? 3 : avg > 0.55 ? 2 : avg > 0.38 ? 1 : 0;
    }

    // Everything a ghost does is its genes on top of the current heat.
    const huntStepMs  = g => Math.max(160, lerp(440, 210, D.heatE()) / lerp(0.85, 1.25, g.genes.speed));
    const aimMs       = g => lerp(1400, 900, D.heatE()) * lerp(1.15, 0.8, g.genes.wind);
    const lockMs      = g => Math.min(aimMs(g) * 0.45, lerp(520, 330, D.heatE()));
    const attackRange = g => Math.round(lerp(7, 12, D.heatE()) * lerp(0.85, 1.25, g.genes.reach));
    const lungeMax    = g => Math.round(lerp(12, 17, D.heatE()) * lerp(0.85, 1.2, g.genes.reach));
    const huntRadius  = g => Math.round(lerp(18, 28, D.heatE()) * lerp(0.85, 1.3, g.genes.sense));
    const coolMul     = g => lerp(1.6, 0.85, D.heatE()) * lerp(1.2, 0.8, g.genes.nerve);
    // The profile's step times. A hunting ghost never outpaces the player: you can always run.
    const moveStepMs  = (g, mode, dist) => Math.max(D.playerStepMs() * 1.1, huntStepMs(g) / paceNow(g, mode, dist));
    const lungeStepOf = g => Math.max(60, D.lungeStepMs() / g.pace.lunge);
    const dazeStepOf  = g => DAZE_STEP_MS / g.pace.daze;

    function occupied(x, y, except) {
        return G.ghosts.some(o => o !== except && o.active && o.x === x && o.y === y);
    }

    // --- CHUNK DIRECTOR (Minecraft-style mob spawning) ---
    // The world is 9x9 chunks of 10x10 tiles. Ghosts only exist near the player: they spawn in
    // the ring of chunks just outside the 30x30 view (emptiest chunks first, so they surround
    // you instead of bunching up), and despawn once they're left far behind and unseen. How
    // many exist at once follows the silent heat dial.
    const SPAWN_RING   = 2;       // chunk distance new ghosts appear at
    const DESPAWN_RING = 3;       // unseen, idle ghosts this far out get culled...
    const DESPAWN_MS   = 2500;    // ...after lingering there this long
    const CHUNK_CAP    = 2;       // at most this many ghosts share a chunk when spawning
    function chunkDist(x, y) {
        const h = head();
        return Math.max(cdist(chunkOf(x), chunkOf(h.x)), cdist(chunkOf(y), chunkOf(h.y)));
    }
    const ghostCap     = () => Math.round(lerp(5, 14, D.heatE()));
    const spawnEveryMs = () => lerp(1500, 600, D.heatE());
    let spawnAcc = 0, evoAcc = 0;

    function resetGhost(g) {
        g.dir = DIRS[Math.floor(Math.random() * 4)];
        g.state = 'hunt'; g.t = 0; g.acc = 0; g.locked = false; g.trail = []; g.wp = null;
        g.fade = 0; g.farFor = 0;
        g.sighted = false; g.swell = 0;   // a fresh appearance: it can shock you again (see anim.js)
        g.cool = (1500 + Math.random() * 2500) * coolMul(g);
    }

    // Put g on an open tile in the emptiest chunk of the spawn ring, out of the player's sight.
    function placeInRing(g) {
        const h = head(), hx = chunkOf(h.x), hy = chunkOf(h.y);
        const counts = new Map();
        G.ghosts.forEach(o => {
            if (o === g || !o.active) return;
            const k = chunkOf(o.x) * CN + chunkOf(o.y);
            counts.set(k, (counts.get(k) || 0) + 1);
        });
        const ring = [];
        for (let dy = -SPAWN_RING; dy <= SPAWN_RING; dy++) for (let dx = -SPAWN_RING; dx <= SPAWN_RING; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== SPAWN_RING) continue;
            const cx = (hx + dx + CN) % CN, cy = (hy + dy + CN) % CN;
            const n = counts.get(cx * CN + cy) || 0;
            // ghosts come out of the warrens and pillar fields, rarely the open plazas
            const pref = [1.2, -0.3, 0, 0.2][M.district[ckey(cx, cy)]];
            if (n < CHUNK_CAP) ring.push({ cx, cy, n: n + pref + Math.random() * 0.9 });
        }
        ring.sort((a, b) => a.n - b.n);
        const ok = (x, y, minD) => !M.isWall(x, y) && M.inDomain(x, y) && !occupied(x, y, g)
            && tdist(x, y, h.x, h.y) >= minD && !(SM.view.onScreen(x, y) && M.lineOfSight(h.x, h.y, x, y));
        const put = (x, y) => { g.x = wrap(x); g.y = wrap(y); resetGhost(g); return true; };
        for (const c of ring) {
            for (let tries = 0; tries < 30; tries++) {
                const x = c.cx * CHUNK + Math.floor(Math.random() * CHUNK);
                const y = c.cy * CHUNK + Math.floor(Math.random() * CHUNK);
                if (ok(x, y, 16)) return put(x, y);
            }
        }
        // The ring can lie outside a small early domain: fall back to anywhere in the domain
        // that's out of sight.
        const r = M.domainRect() || { x: 0, y: 0, w: N, h: N };
        for (let tries = 0; tries < 200; tries++) {
            const x = r.x + Math.floor(Math.random() * r.w), y = r.y + Math.floor(Math.random() * r.h);
            if (ok(x, y, 12)) return put(x, y);
        }
        return false;
    }

    // Pick the least-represented ghost type (CLYDE only once the heat is up).
    function pickType() {
        const types = GHOST_DEFS.filter(d => !d.late || D.heat() >= 0.32);
        const count = d => G.ghosts.filter(g => g.active && g.name === d.name).length + Math.random() * 0.9;
        return types.reduce((a, b) => count(b) < count(a) ? b : a);
    }

    function spawn(immune = false) {
        const g = makeGhost(immune ? GHOST_DEFS[0] : pickType(), immune);
        if (!immune) breed(g);
        if (!placeInRing(g)) return false;
        G.ghosts.push(g);
        return true;
    }

    // Fresh run: the armored ghost plus the opening cap, around the start.
    function reset() {
        G.ghosts = []; genePool = []; spawnAcc = 0; evoAcc = 0;
        spawn(true);
        while (G.ghosts.length < ghostCap() && spawn());
    }

    function direct(dt) {
        G.ghosts = G.ghosts.filter(g => g.active);   // drop eaten ghosts
        for (const g of G.ghosts) {
            const idle = g.state === 'hunt' || g.state === 'daze';
            g.farFor = idle && g.vis < 0.05 && chunkDist(g.x, g.y) >= DESPAWN_RING ? g.farFor + dt : 0;
            if (g.farFor < DESPAWN_MS) continue;
            if (g.immune) { placeInRing(g); continue; }   // the armored ghost never leaves: it follows you
            archive(g);
            g.active = false;
        }
        G.ghosts = G.ghosts.filter(g => g.active);
        spawnAcc += dt;
        if (G.ghosts.length < ghostCap() && spawnAcc >= spawnEveryMs()) {
            spawnAcc = 0;
            spawn();
        }
        evoAcc += dt;
        if (evoAcc >= EVOLVE_MS) { evoAcc = 0; evolveWeakest(); }
    }

    // Every so often the weakest ghost the player can't currently see molts into a fitter form.
    // Newborns get a grace period so the same ghost isn't molted over and over.
    function evolveWeakest() {
        const pool = G.ghosts.filter(g => g.active && g.state === 'hunt' && g.vis < 0.1 && D.playedMs() - g.born >= 2 * EVOLVE_MS);
        if (!pool.length) return;
        pool.sort((a, b) => fitRate(a) - fitRate(b) || a.gen - b.gen);
        breed(pool[0]);
        emit('evolve', { gen: pool[0].gen });
    }

    function attackers() {
        return G.ghosts.filter(g => g.active && !g.traitor && (g.state === 'aim' || g.state === 'lunge')).length;
    }

    // --- TRAITORS (see coat.js) ---
    function pickVictim(g) {
        let best = null, bd = Infinity;
        for (const o of G.ghosts) {
            if (o === g || !o.active || o.traitor || o.state === 'daze') continue;
            const d = tdist(g.x, g.y, o.x, o.y);
            if (d < bd) { bd = d; best = o; }
        }
        return best;
    }
    function huntAsTraitor(g, dt) {
        const v = g.victim;
        if (!v || !v.active || v.traitor || v.state === 'daze') g.victim = pickVictim(g);
        g.acc += dt;
        const step = huntStepMs(g) * 0.45;                // traitors hurry: they have seconds to act
        if (g.acc >= step) { g.acc -= step; if (g.victim) moveGhost(g, { x: g.victim.x, y: g.victim.y }); }
        if (g.victim && g.cool <= 0 && tdist(g.x, g.y, g.victim.x, g.victim.y) <= attackRange(g) + 5) enterState(g, 'aim');
    }
    // Where to aim: a traitor aims at its victim, everyone else at the player's predicted path.
    function aimTarget(g, remainMs) {
        if (!g.traitor) return interceptTarget(g, remainMs);
        return g.victim && g.victim.active ? { x: g.victim.x, y: g.victim.y } : g.target;
    }

    // Solve for an intercept: where will the player be when my lunge can get there?
    function interceptTarget(g, remainMs) {
        const delay = remainMs / D.playerStepMs();         // player steps before I launch
        const speed = D.playerStepMs() / lungeStepOf(g);   // my tiles per player step
        let T = delay, cell = K.toCell(K.predict(g.aimOrder, T));
        for (let i = 0; i < 5; i++) {
            const d = tdist(g.x, g.y, cell.x, cell.y);
            T = Math.min(20, delay + d / speed);
            cell = K.toCell(K.predict(g.aimOrder, T));
        }
        // don't aim into a wall: back off along the predicted path
        for (let k = T; M.isWall(cell.x, cell.y) && k > 0; k -= 0.5) cell = K.toCell(K.predict(g.aimOrder, k));
        return cell;
    }

    function stepGhostTo(g, d) {
        g.trail.unshift({ x: g.x, y: g.y });
        if (g.trail.length > 4) g.trail.pop();
        g.dir = d;
        g.x = wrap(g.x + d.x);
        g.y = wrap(g.y + d.y);
    }

    // Path toward a target around walls (or flee from the head when dazed).
    function moveGhost(g, target, { flee = false } = {}) {
        let qt = 0;
        if (!flee) qt = bfsFrom(target.x, target.y, g.x, g.y);
        const h = head();
        let best = null, bestScore = Infinity;
        for (const d of DIRS) {
            const nx = wrap(g.x + d.x), ny = wrap(g.y + d.y);
            if (M.isWall(nx, ny) || occupied(nx, ny, g)) continue;
            let s;
            if (flee) s = -tdist(nx, ny, h.x, h.y);
            else {
                const bd = bfsDist[idx(nx, ny)];
                s = bd >= 0 ? bd : 10000 + tdist(nx, ny, target.x, target.y);
            }
            if (d.x === -g.dir.x && d.y === -g.dir.y) s += 0.5; // arcade rule: avoid reversing
            s += Math.random() * 0.1;
            if (s < bestScore) { bestScore = s; best = d; }
        }
        if (qt) bfsReset(qt);
        if (best) stepGhostTo(g, best);
    }

    function enterState(g, s) {
        g.state = s; g.t = 0; g.acc = 0;
        if (s === 'aim') {
            g.locked = false; g.dug = false;
            // fixed for this wind-up so the telegraph stays honest (traitors strike faster)
            g.aimMs = aimMs(g) * (g.traitor ? 0.6 : 1); g.lockMs = Math.min(lockMs(g), g.aimMs * 0.45);
            g.target = aimTarget(g, g.aimMs);
        }
        if (s === 'lunge') { g.lungeLeft = Math.min(lungeMax(g) + (g.traitor ? 6 : 0), tdist(g.x, g.y, g.target.x, g.target.y) + LUNGE_OVERSHOOT); }
        if (s === 'hunt') { g.trail = []; }
        if (s === 'daze') { g.dazeFor = g.immune ? DAZE_MS : Math.max(DAZE_MS, G.prism); }
    }

    function lungeStep(g) {
        // a traitor's lunge homes in on its victim, so the sabotage pays off
        if (g.traitor && g.victim && g.victim.active) g.target = { x: g.victim.x, y: g.victim.y };
        let d = g.dir;
        if (g.x !== g.target.x || g.y !== g.target.y) {
            const dx = wdelta(g.x, g.target.x), dy = wdelta(g.y, g.target.y);
            const opts = [];
            if (dx) opts.push({ x: Math.sign(dx), y: 0, w: Math.abs(dx) });
            if (dy) opts.push({ x: 0, y: Math.sign(dy), w: Math.abs(dy) });
            opts.sort((a, b) => b.w - a.w);
            d = opts.find(o => !M.isWall(g.x + o.x, g.y + o.y)) || opts[0];
            d = { x: d.x, y: d.y };
        }
        if (M.isWall(g.x + d.x, g.y + d.y)) { // straight into a wall
            fx.popup(g.x, g.y, 'BONK', g.color);
            fx.burst(g.x + d.x * 0.5, g.y + d.y * 0.5, { n: 6, colors: ['#9a9aff', '#fff', g.color], speed: 2.5, up: 5, life: 400 });
            enterState(g, 'daze');
            if (!g.traitor) { emit('bonk', g); emit('dodge', g); }
            return;
        }
        stepGhostTo(g, d);
        g.lungeLeft--;

        if (g.traitor) {   // a traitor's lunge dazes any old teammate it passes through, and never hurts you
            for (const o of G.ghosts) {
                if (o === g || !o.active || o.traitor || o.state === 'daze' || o.x !== g.x || o.y !== g.y) continue;
                enterState(o, 'daze');
                o.dazeFor = Math.max(o.dazeFor, 3500);
                fx.popup(o.x, o.y, 'BETRAYED', SM.coat.TRAITOR_COLOR);
                emit('betrayed', o);
            }
            if (g.lungeLeft <= 0) { enterState(g, 'hunt'); g.cool = 600; }
            return;
        }

        if (SM.player.checkContacts() || !g.active) return;

        // Lunging into the body: ghost bonks off, tail gets severed. Underground segments are
        // out of reach.
        const S = G.snake;
        for (let i = 1; i < S.length; i++) {
            if (S[i].under || S[i].x !== g.x || S[i].y !== g.y) continue;
            if (G.invuln <= 0 && !SM.special.deadly() && S.length > 2) {
                const lost = S.length - Math.max(2, i);
                S.length = Math.max(2, i);
                if (lost > 0) { fx.popup(g.x, g.y, 'SNIP -' + lost, '#f66'); g.fit += 1; emit('snip', lost); }
            }
            enterState(g, 'daze');
            return;
        }
        if (g.lungeLeft <= 0) {
            const h = head();
            if (tdist(g.x, g.y, h.x, h.y) <= 2) g.fit += 0.5;   // near miss still counts for something
            enterState(g, 'daze');
            emit('dodge', g);
        }
    }

    function updateGhost(g, dt) {
        if (!g.active) return;
        if (g.frozen > 0) return;   // frozen solid (FREEZE, see special.js): time stands still for it
        g.t += dt;
        g.life += dt;
        g.cool -= dt;
        if (g.fade < 1) g.fade = Math.min(1, g.fade + dt / 800);

        switch (g.state) {
            case 'hunt': {
                if (g.traitor) { huntAsTraitor(g, dt); break; }
                const h = head();
                const d = disguised() ? Infinity : tdist(g.x, g.y, h.x, h.y);   // in disguise you're one of them
                let mode = 'hunt';
                if (d <= huntRadius(g)) {
                    g.target = g.hunt(g); g.wp = null;
                } else { // patrol: wander between random waypoints, drifting toward the player's neighbourhood
                    mode = 'patrol';
                    if (!g.wp || (g.x === g.wp.x && g.y === g.wp.y) || g.t > 12000) {
                        g.t = 0;
                        const c = Math.random() < 0.6 ? h : g;
                        g.wp = { x: h.x, y: h.y };
                        for (let tries = 0; tries < 50; tries++) {
                            const wp = { x: wrap(c.x + Math.floor(Math.random() * 29) - 14), y: wrap(c.y + Math.floor(Math.random() * 29) - 14) };
                            if (!M.isWall(wp.x, wp.y) && M.inDomain(wp.x, wp.y)) { g.wp = wp; break; }
                        }
                    }
                    g.target = g.wp;
                }
                g.acc += dt;
                const step = moveStepMs(g, mode, d);
                if (g.acc >= step) {
                    g.acc -= step;
                    moveGhost(g, g.target);
                    if (SM.player.checkContacts() || !g.active) return;
                }
                if (g.cool <= 0 && G.invuln <= 0 && d <= attackRange(g) && attackers() < D.maxAttackers()) {
                    enterState(g, 'aim');
                }
                break;
            }
            case 'aim': {
                if (g.t < g.aimMs - g.lockMs) {
                    g.target = aimTarget(g, g.aimMs - g.t);
                } else {
                    g.locked = true;
                }
                if (g.t >= g.aimMs) enterState(g, 'lunge');
                break;
            }
            case 'lunge': {
                g.acc += dt;
                const step = lungeStepOf(g);
                while (g.acc >= step && g.state === 'lunge' && g.active && G.mode === 'play') {
                    g.acc -= step;
                    lungeStep(g);
                }
                break;
            }
            case 'daze': {
                g.acc += dt;
                const step = dazeStepOf(g);
                if (g.acc >= step) {
                    g.acc -= step;
                    moveGhost(g, head(), { flee: true });
                    if (SM.player.checkContacts() || !g.active) return;
                }
                if (g.t >= g.dazeFor) {
                    enterState(g, 'hunt');
                    g.cool = (2200 + Math.random() * 2000) * coolMul(g);
                }
                break;
            }
        }
    }

    // Returns false if the run ended while they moved.
    function update(dt) {
        for (const g of G.ghosts) {
            updateGhost(g, dt);
            if (G.mode !== 'play') return false;
        }
        return true;
    }

    SM.ghosts = {
        GHOST_DEFS, PACES,
        reset, update, direct, spawn, placeInRing, enterState, tier, attackers,
        attackRange, huntStepMs, lungeStepOf,
    };
})();
