// SNAKE-MAN · heal
// THE LADDER: lives don't come back on their own, you climb for them. The ladder is a vertical
// stack of stages, each one a challenge built from something the game already asks of you,
// a little harder than the one below. Clear a rung and you heal a life (past MAX_LIVES it
// banks as points instead) and step up to the next.
//
// The first rungs are fixed, in the order the mechanics show up: eat fast, dodge, burrow,
// bait, feast. Above them the ladder keeps going with random challenges whose numbers keep
// climbing. Progress on a rung is kept when you get hit, except on NO HITS rungs.
// Everything is fed by bus events, so no rule elsewhere knows the ladder exists.
'use strict';
(() => {
    const { MAX_LIVES, GRID_SIZE, on, emit } = SM.core;
    const G = SM.G, D = SM.dial, fx = SM.fx;

    // Challenge kinds. make(tier) → { goal, ...params }; label(c) → the rung's text.
    // Events a kind reacts to: ev[name](c, data) returns how much progress it adds.
    const KINDS = {
        forage: {   // a streak of pellets inside a sliding window
            make: t => ({ goal: 5 + 2 * t, win: 7000 + 1000 * t, times: [] }),
            label: c => `EAT ${c.goal} IN ${c.win / 1000}s`,
            ev: {
                eat(c) {
                    const now = D.playedMs();
                    c.times = c.times.filter(ms => now - ms < c.win).concat(now);
                    return c.times.length - c.have;     // progress is the best streak in the window
                },
            },
            tick(c) {                                   // the window slides: old pellets fall out
                const now = D.playedMs();
                c.times = c.times.filter(ms => now - ms < c.win);
                c.have = c.times.length;
            },
        },
        dodge: {
            make: t => ({ goal: 2 + t }),
            label: c => `DODGE ${c.goal} LUNGES`,
            ev: { dodge: () => 1 },
        },
        tunnel: {
            make: t => ({ goal: 1 + Math.ceil(t / 2) }),
            label: c => `BURROW UNDER ${c.goal} WALL${c.goal > 1 ? 'S' : ''}`,
            ev: { surfaced: (c, d) => d.walls > 0 ? 1 : 0 },
        },
        bonk: {
            make: t => ({ goal: 1 + Math.floor(t / 2) }),
            label: c => `BAIT ${c.goal} INTO A WALL`,
            ev: { bonk: () => 1 },
        },
        feast: {
            make: t => ({ goal: 2 + Math.floor(t / 3) }),
            label: c => `EAT ${c.goal} GHOSTS`,
            ev: { ghostEaten: () => 1 },
        },
        dig: {
            make: t => ({ goal: 1 + Math.floor(t / 4) }),
            label: c => `DIG UNDER ${c.goal} LUNGE${c.goal > 1 ? 'S' : ''}`,
            ev: { dodge: (c, g) => g.dug ? 1 : 0 },
        },
        betray: {
            make: t => ({ goal: 1 + Math.floor(t / 4) }),
            label: c => `BETRAY ${c.goal} GHOST${c.goal > 1 ? 'S' : ''}`,
            ev: { betrayed: () => 1 },
        },
        clean: {    // measured in seconds without a hit
            make: t => ({ goal: 20 + 5 * t }),
            label: c => `NO HITS FOR ${c.goal}s`,
            ev: { hit: c => -c.have },
            tick(c, dt) { c.ms = (c.ms || 0) + dt; c.have = Math.floor(c.ms / 1000); },
            resetOnHit: true,
        },
    };
    const OPENING = ['forage', 'dodge', 'tunnel', 'bonk', 'feast'];
    const RANDOM = ['forage', 'dodge', 'tunnel', 'bonk', 'feast', 'dig', 'betray', 'clean'];

    let rung = 0;       // 0-based stage on the ladder
    let cur = null;     // the current rung's challenge
    let climb = 1;      // 0 → 1 as the ladder scrolls up after a clear (animation)
    let glow = 0;       // ms of celebration on the rung just cleared
    let rungs = [];     // challenges by rung, generated as you climb (so the ones above show)

    function makeRung(i) {
        let kind;
        if (i < OPENING.length) kind = OPENING[i];
        else {
            const prev = rungs[i - 1] && rungs[i - 1].kind;
            const pool = RANDOM.filter(k => k !== prev);
            kind = pool[Math.floor(Math.random() * pool.length)];
        }
        return { kind, have: 0, ...KINDS[kind].make(i) };
    }
    const rungAt = i => rungs[i] || (rungs[i] = makeRung(i));

    function reset() {
        rung = 0; rungs = []; climb = 1; glow = 0;
        cur = rungAt(0);
    }

    function progress(n) {
        if (!cur || G.mode !== 'play' || !n) return;
        cur.have = Math.max(0, cur.have + n);
        if (cur.have >= cur.goal) clear();
    }

    function clear() {
        const h = G.snake[0];
        cur.have = cur.goal;
        if (G.lives < MAX_LIVES) {
            G.lives++;
            fx.popup(h.x, h.y - 1, 'HEALED +1', '#ff5577');
        } else {
            const pts = SM.award(100 * (rung + 1));
            fx.popup(h.x, h.y - 1, 'BANKED +' + pts, '#ff99aa');
        }
        fx.burst(h.x, h.y, { n: 14, colors: ['#ff3355', '#ff99aa', '#fff'], speed: 2, up: 10, life: 800 });
        emit('heal', { rung });
        rung++;
        cur = rungAt(rung);
        climb = 0; glow = 900;
    }

    // Wire every kind's events to the bus once; each only counts toward the current rung.
    const evNames = new Set();
    for (const k of Object.values(KINDS)) for (const e of Object.keys(k.ev)) evNames.add(e);
    for (const e of evNames) {
        on(e, data => {
            if (!cur || G.mode !== 'play') return;
            const f = KINDS[cur.kind].ev[e];
            if (e === 'hit' && KINDS[cur.kind].resetOnHit) { cur.ms = 0; cur.have = 0; return; }
            if (f) progress(f(cur, data));
        });
    }

    function update(dt) {
        const k = KINDS[cur.kind];
        if (k.tick) { k.tick(cur, dt); if (cur.have >= cur.goal) clear(); }
        climb = Math.min(1, climb + dt / 450);
        glow = Math.max(0, glow - dt);
    }

    // --- DRAWING: the ladder, bottom-left of the screen ---
    // Rungs stack upward: the one you cleared last sits at the bottom, the current rung above
    // it (with its progress filling left to right), and the next few dim above that. After a
    // clear the whole ladder slides down a rung, so you watch yourself climb.
    const RX = 10, RW = 34, RH = 16, GAP = 6, BASE = 548, SHOW = 4;
    function draw(now) {
        const { ctx, snap } = SM.view, gfx = SM.gfx;
        const slide = (1 - fx.ease.outBack(climb)) * (RH + GAP);   // ladder slides down as you climb
        ctx.save();
        // rails
        ctx.fillStyle = 'rgba(90,60,40,0.7)';
        ctx.fillRect(RX - 4, BASE - SHOW * (RH + GAP) - 6, 2, SHOW * (RH + GAP) + RH + 8);
        ctx.fillRect(RX + RW + 2, BASE - SHOW * (RH + GAP) - 6, 2, SHOW * (RH + GAP) + RH + 8);
        for (let s = -1; s < SHOW; s++) {
            const i = rung + s;
            if (i < 0) continue;
            const y = snap(BASE - (s + 1) * (RH + GAP) + slide);
            if (y < BASE - SHOW * (RH + GAP) - 4 || y > BASE + 4) continue;
            const c = rungAt(i), done = i < rung, current = i === rung;
            ctx.globalAlpha = done ? 0.75 : current ? 1 : Math.max(0.2, 0.55 - s * 0.12);
            ctx.fillStyle = current ? '#221018' : '#0c0c10';
            ctx.fillRect(RX, y, RW, RH);
            if (current) {   // progress fill
                ctx.fillStyle = '#b02848';
                ctx.fillRect(RX, y, snap(RW * Math.min(1, c.have / c.goal)), RH);
            }
            ctx.fillStyle = done ? (glow > 0 && i === rung - 1 && Math.floor(now / 90) % 2 ? '#fff' : '#ff3355')
                          : current ? '#ffd0dc' : '#555';
            ctx.fillRect(RX, y, RW, 2); ctx.fillRect(RX, y + RH - 2, RW, 2);
            ctx.drawImage(gfx.heartSprite(done), RX + 2, y - 2);
            gfx.pixelText(String(i + 1), RX + RW - 7, y + 12, 8, done ? '#fff' : current ? '#fff' : '#777', '#000');
            if (current) {
                const txt = KINDS[c.kind].label(c) + '  ' + Math.min(c.have, c.goal) + '/' + c.goal;
                gfx.pixelText(txt, RX + RW + 12, y + 12, 8, '#ffd0dc', '#300', 'left');
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    SM.heal = {
        reset, update, draw, KINDS,
        get rung() { return rung; },
        get current() { return cur; },
        label: c => KINDS[c.kind].label(c),
    };
})();
