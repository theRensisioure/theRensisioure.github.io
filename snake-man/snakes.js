// SNAKE-MAN · snakes
// SNAKE AI: other snakes in the world. Two kinds:
//   ENEMY SNAKES  (orange) appear during the SNAKE WAR (missions 18-28, campaign.js). They path-find
//                 to you and bite. An enemy head touching you costs a life; run your head into
//                 their body and you OUCH (no life lost, like biting yourself). Head to head, the
//                 longer snake wins. GHOSTBANE, a VOID and a DASH kill anything you touch.
//                 The SNAKE KING (mission 28) is a long gold one.
//   THE ALLY      (green) joins you for good once you cross mission 23. It follows you, hunts the
//                 nearest ghost or enemy snake and kills what it touches. It can't hurt you.
// Snakes walk the same walls you do. They find their way with a bounded breadth-first search.
// Emits: 'snakeKilled' ({ how, king }), 'allyKill' (the ally killed a ghost).
'use strict';
(() => {
    const { N, wrap, tdist, idx, DIRS, on, emit } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;

    const ENEMY = { head: '#ff7a33', body: '#c8431a', len: 7 };
    const KING = { head: '#ffd24a', body: '#b8860b', len: 16 };
    const ALLY = { head: '#6cffc0', body: '#1fae7a', len: 8 };
    const BFS_LIMIT = 1800;
    const SPAWN_EVERY_MS = 5000;

    let list = [];          // { ally, king, col, body: [{x,y}], dir, grow, acc, stun, flank, ms }
    let spawnT = 0, kingDone = false;

    // --- PATH-FINDING ---
    const seen = new Int32Array(N * N), first = new Int8Array(N * N);
    const qx = new Int16Array(BFS_LIMIT + 8), qy = new Int16Array(BFS_LIMIT + 8);
    let stamp = 0;

    // A cell a snake can't enter: walls, and every snake's body (the tail tip moves away). The
    // ally also keeps off your body; enemies may bite it.
    function blocked(s, x, y) {
        if (M.isWall(x, y)) return true;
        for (const o of list) {
            const n = o.body.length - 1;
            for (let i = 0; i < n; i++) if (o.body[i].x === x && o.body[i].y === y) return true;
        }
        if (s.ally && G.snake.some((c, i) => i > 0 && c.x === x && c.y === y)) return true;
        return false;
    }

    // The direction of the first step toward (tx, ty), or the way that ends up nearest it.
    function route(s, tx, ty) {
        const h = s.body[0];
        stamp++;
        let qh = 0, qt = 0, best = -1, bestD = Infinity;
        const consider = (x, y, di) => {
            const i = idx(x, y);
            if (seen[i] === stamp || blocked(s, x, y)) return;
            seen[i] = stamp; first[i] = di; qx[qt] = x; qy[qt] = y; qt++;
            const d = tdist(x, y, tx, ty);
            if (d < bestD) { bestD = d; best = di; }
        };
        seen[idx(h.x, h.y)] = stamp;
        DIRS.forEach((d, di) => { if (!(d.x === -s.dir.x && d.y === -s.dir.y)) consider(wrap(h.x + d.x), wrap(h.y + d.y), di); });
        while (qh < qt && qt < BFS_LIMIT && bestD > 0) {
            const x = qx[qh], y = qy[qh]; qh++;
            const di = first[idx(x, y)];
            for (const d of DIRS) consider(wrap(x + d.x), wrap(y + d.y), di);
        }
        return best < 0 ? null : DIRS[best];
    }

    // --- SPAWNING ---
    function make(opt, sp) {
        return {
            ally: !!opt.ally, king: !!opt.king, col: opt.col, dir: { x: sp.d.x, y: sp.d.y },
            body: [0, 1, 2].map(k => ({ x: wrap(sp.x - sp.d.x * k), y: wrap(sp.y - sp.d.y * k) })),
            grow: opt.col.len - 3, acc: 0, stun: 0, ms: 0,
            flank: !opt.ally && Math.random() < 0.5,       // some cut you off instead of chasing
            step: 0,
        };
    }

    function spawn(opt) {
        const h = G.snake[0];
        for (let tries = 0; tries < 6; tries++) {
            const sp = SM.player.findSpawn(h.x, h.y, opt.ally ? 5 : 22);
            if (tdist(sp.x, sp.y, h.x, h.y) < (opt.ally ? 2 : 12)) continue;
            if (list.some(o => o.body.some(c => tdist(c.x, c.y, sp.x, sp.y) < 3))) continue;
            const s = make(opt, sp);
            list.push(s);
            return s;
        }
        return null;
    }
    const spawnEnemy = king => {
        const s = spawn(king ? { king: true, col: KING } : { col: ENEMY });
        if (s) fx.popup(s.body[0].x, s.body[0].y - 1, king ? 'THE SNAKE KING!' : 'ENEMY SNAKE', s.col.head);
        return s;
    };
    const ally = () => list.find(s => s.ally);
    function spawnAlly() {
        if (ally()) return;
        const s = spawn({ ally: true, col: ALLY });
        if (s) fx.popup(s.body[0].x, s.body[0].y - 1, 'SNAKE ALLY', ALLY.head);
    }

    function reset() {
        list = []; spawnT = 3000; kingDone = false;
        if (SM.campaign.ally()) spawnAlly();
    }

    // --- DYING ---
    function kill(s, how) {
        const i = list.indexOf(s);
        if (i < 0) return;
        list.splice(i, 1);
        const h = s.body[0];
        fx.burst(h.x, h.y, { n: 18, colors: [s.col.head, s.col.body, '#fff'], speed: 3, up: 8, life: 700 });
        if (how === 'gone' || how === 'crash') return;
        const p = SM.award(s.king ? 500 : 100);
        fx.popup(h.x, h.y - 1, (s.king ? 'KING SLAIN +' : 'SNAKE DOWN +') + p, s.col.head);
        if (s.king) kingDone = true;
        emit('snakeKilled', { how, king: s.king });
    }

    // --- THINKING ---
    function goal(s) {
        const me = G.snake[0];
        if (!s.ally) {
            if (s.flank) {                        // aim two tiles ahead of you
                const ax = wrap(me.x + G.direction.x * 2), ay = wrap(me.y + G.direction.y * 2);
                if (!M.isWall(ax, ay)) return { x: ax, y: ay };
            }
            return me;
        }
        let near = null, nd = 28;
        for (const o of list) if (!o.ally) { const d = tdist(o.body[0].x, o.body[0].y, me.x, me.y); if (d < nd) { nd = d; near = o.body[0]; } }
        if (!near) {
            for (const g of G.ghosts) {
                if (!g.active || g.traitor) continue;
                const d = tdist(g.x, g.y, me.x, me.y);
                if (d < nd) { nd = d; near = g; }
            }
        }
        if (near) return near;
        if (tdist(s.body[0].x, s.body[0].y, me.x, me.y) > 4) return me;   // too far: come back
        return { x: wrap(s.body[0].x + s.dir.x * 6), y: wrap(s.body[0].y + s.dir.y * 6) };   // otherwise cruise
    }

    function stepMs(s) { return SM.dial.playerStepMs() * (s.ally ? 0.9 : s.king ? 1.05 : 1.2); }

    function move(s) {
        if (s.stun > 0) return;
        const g = goal(s);
        const d = route(s, g.x, g.y);
        if (!d) {
            if (s.ally) { relocate(s); return; }
            kill(s, 'crash');                   // boxed in: it dies
            return;
        }
        s.dir = d;
        s.body.unshift({ x: wrap(s.body[0].x + d.x), y: wrap(s.body[0].y + d.y) });
        if (s.grow > 0) s.grow--; else s.body.pop();
        if (s.ally) allyStrikes(s);
    }

    // The ally stuck or left far behind: put it back beside you.
    function relocate(s) {
        const h = G.snake[0], sp = SM.player.findSpawn(h.x, h.y, 5);
        s.body = [0, 1, 2].map(k => ({ x: wrap(sp.x - sp.d.x * k), y: wrap(sp.y - sp.d.y * k) }));
        s.dir = { x: sp.d.x, y: sp.d.y };
        s.grow = Math.max(0, s.col.len - 3);
    }

    function allyStrikes(s) {
        const h = s.body[0];
        for (const g of G.ghosts) {
            if (!g.active || g.traitor || g.x !== h.x || g.y !== h.y) continue;
            SM.special.kill(g, 'ally');
            if (!g.active) emit('allyKill');
        }
        for (const o of list.slice()) {
            if (o.ally) continue;
            if (o.body.some(c => c.x === h.x && c.y === h.y)) kill(o, 'ally');
        }
    }

    // --- TOUCHING YOU ---
    function bite(s) {
        s.stun = 2500;
        fx.popup(G.snake[0].x, G.snake[0].y - 1, 'SNAKE BITE', s.col.head);
        SM.player.loseLife();
    }

    function contacts() {
        const h = G.snake[0];
        if (h.under || SM.dash.shielded) return;
        for (const s of list.slice()) {
            if (s.ally || G.mode !== 'play') continue;
            const sh = s.body[0];
            for (const a of list) if (a.ally && a.body.some(c => c.x === sh.x && c.y === sh.y)) { kill(s, 'ally'); break; }
            if (!list.includes(s)) continue;
            const deadly = SM.special.deadly();
            const headOn = sh.x === h.x && sh.y === h.y;
            const inBody = !headOn && s.body.some((c, i) => i > 0 && c.x === h.x && c.y === h.y);
            if (headOn || inBody) {
                if (deadly || (headOn && G.snake.length > s.body.length)) { kill(s, 'player'); continue; }
                if (headOn && G.invuln <= 0) { bite(s); return; }
                if (inBody && G.invuln <= 0) {                  // you ran into its body: like biting yourself
                    fx.popup(h.x, h.y, 'OUCH', '#fa0');
                    SM.player.respawnNear();
                    G.invuln = 1000;
                    return;
                }
                continue;
            }
            if (s.stun <= 0 && G.snake.some((c, i) => i > 0 && !c.under && c.x === sh.x && c.y === sh.y)) {
                if (deadly) kill(s, 'player');
                else if (G.invuln <= 0) { bite(s); return; }
            }
        }
    }

    // --- THE WAR ---
    function enemies() { return list.filter(s => !s.ally); }
    function wanted() { return SM.campaign.war() ? 2 + Math.min(2, Math.floor((SM.profile.camp() - 17) / 4)) : 0; }

    on('warEnd', () => {
        for (const s of enemies()) kill(s, 'gone');
        const h = G.snake[0];
        fx.popup(h.x, h.y - 2.5, 'THE SNAKE WAR IS WON!', '#ffd24a');
    });
    on('warStart', () => { const h = G.snake[0]; fx.popup(h.x, h.y - 2.5, 'THE SNAKE WAR BEGINS!', '#ff7a33'); });
    on('allyJoined', () => spawnAlly());

    function update(dt) {
        if (SM.campaign.war()) {
            spawnT -= dt;
            const kingOn = SM.profile.camp() >= 27 && !kingDone;
            if (kingOn && !list.some(s => s.king)) spawnEnemy(true);
            else if (spawnT <= 0 && enemies().filter(s => !s.king).length < wanted()) { spawnEnemy(false); spawnT = SPAWN_EVERY_MS; }
        }
        for (const s of list.slice()) {
            s.stun = Math.max(0, s.stun - dt);
            s.acc += dt;
            for (let m = stepMs(s); s.acc >= m && list.includes(s); m = stepMs(s)) {
                s.acc -= m;
                move(s);
            }
            if (s.ally && list.includes(s) && tdist(s.body[0].x, s.body[0].y, G.snake[0].x, G.snake[0].y) > 45) relocate(s);
        }
        const a = ally();
        if (a) {   // ghosts that wander into the ally between its steps
            for (const g of G.ghosts) if (g.active && !g.traitor && g.x === a.body[0].x && g.y === a.body[0].y) allyStrikes(a);
        }
        contacts();
    }

    // --- DRAWING ---
    function draw(now) {
        const { ctx, sx, sy, snap, onScreen, P } = SM.view, s = SM.core.GRID_SIZE;
        for (const o of list) {
            if (o.stun > 0 && Math.floor(now / 90) % 2) continue;
            for (let i = o.body.length - 1; i >= 0; i--) {
                const c = o.body[i];
                if (!onScreen(c.x, c.y)) continue;
                const x = snap(sx(c.x) - s / 2), y = snap(sy(c.y) - s / 2);
                ctx.fillStyle = i ? o.col.body : o.col.head;
                if (i) ctx.fillRect(x + 2 * P / 2, y + 2 * P / 2, s - 2 * P, s - 2 * P);
                else {
                    ctx.fillRect(x, y, s, s);
                    ctx.fillStyle = '#fff';       // eyes on the side it faces
                    const ex = o.dir.x * 4, ey = o.dir.y * 4, px = o.dir.y ? 4 : 0, py = o.dir.x ? 4 : 0;
                    ctx.fillRect(x + s / 2 - 2 + ex + px, y + s / 2 - 2 + ey + py, 4, 4);
                    ctx.fillRect(x + s / 2 - 2 + ex - px, y + s / 2 - 2 + ey - py, 4, 4);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x + s / 2 - 1 + ex + px, y + s / 2 - 1 + ey + py, 2, 2);
                    ctx.fillRect(x + s / 2 - 1 + ex - px, y + s / 2 - 1 + ey - py, 2, 2);
                    if (o.king) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 2, y - 4, s - 4, 4); }
                }
            }
        }
    }

    // The war banner, top centre.
    function hud(now) {
        if (!SM.campaign.war()) return;
        const { pixelText } = SM.gfx, W = SM.core.CW;
        const n = enemies().length;
        pixelText('SNAKE WAR' + (n ? '  ' + n + ' SNAKE' + (n > 1 ? 'S' : '') + ' HUNTING' : ''), W / 2, 22, 8,
            Math.floor(now / 400) % 2 ? '#ff7a33' : '#ffd24a', '#000');
    }

    SM.snakes = {
        reset, update, draw, hud, spawnAlly, spawnEnemy,
        get list() { return list; },
        get ally() { return ally(); },
    };
})();
