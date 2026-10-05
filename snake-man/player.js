// SNAKE-MAN · player
// The snake: placing it, steering it, moving it a tile at a time, eating, and getting hurt.
// Emits: 'eat' (a pellet), 'ghostEaten', 'ghostKilled' ({ g, how: 'eat', stealth }), 'hit' (lost a life),
//        'prism' (rainbow eaten), 'boost' (fruit eaten).
'use strict';
(() => {
    const { N, BOOST_MS, DIRS, lerp, wrap, idx, tdist, emit } = SM.core;
    const G = SM.G, M = SM.map, K = SM.kin, D = SM.dial, fx = SM.fx;
    const PL = SM.pellets;

    let acc = 0;   // ms banked toward the next step

    // --- PLACEMENT ---
    // Find an open cell with room behind (for the body) and a clear runway ahead.
    function findSpawn(nx, ny, radius, rand = Math.random) {
        for (let r = radius, tries = 0; tries < 2000; tries++) {
            if (tries === 600) r = N;
            const x = wrap(nx + Math.floor(rand() * (2 * r + 1)) - r);
            const y = wrap(ny + Math.floor(rand() * (2 * r + 1)) - r);
            const d = DIRS[Math.floor(rand() * 4)];
            let ok = true;
            for (let k = -2; k <= 8 && ok; k++) if (M.isWall(x + d.x * k, y + d.y * k) || !M.inDomain(x + d.x * k, y + d.y * k)) ok = false;
            if (!ok) continue;
            if (G.ghosts.some(g => g.active && tdist(g.x, g.y, x, y) < 10)) continue;
            return { x, y, d };
        }
        return { x: 0, y: 0, d: DIRS[0] };
    }

    function place(sp) {
        G.snake = [0, 1, 2].map(k => ({ x: wrap(sp.x - sp.d.x * k), y: wrap(sp.y - sp.d.y * k) }));
        G.direction = { x: sp.d.x, y: sp.d.y };
        G.inputQueue = [];
        K.reset(sp.x, sp.y, G.direction);
        SM.view.cam.x = sp.x; SM.view.cam.y = sp.y;
        acc = 0;
        emit('placed');
    }

    function respawnNear() {
        const h = G.snake[0];
        place(findSpawn(h.x, h.y, 12));
    }

    // --- STEERING ---
    function queueDir(d) {
        const last = G.inputQueue.length ? G.inputQueue[G.inputQueue.length - 1] : G.direction;
        if (d.x === -last.x && d.y === -last.y) return;
        if (d.x === last.x && d.y === last.y) return;
        if (G.inputQueue.length < 2) G.inputQueue.push(d);
    }

    // --- MOVING ---
    // Move the head one tile along d with the body following. Underground moves (a dash) pass
    // beneath everything and eat nothing; tun tags the segment with the tunnel it belongs to.
    function advance(d, { under = false, tun = 0 } = {}) {
        const S = G.snake;
        const head = { x: wrap(S[0].x + d.x), y: wrap(S[0].y + d.y) };
        if (under) head.under = true;
        if (tun) head.tun = tun;
        const kind = under ? 0 : PL.at(head.x, head.y);
        S.unshift(head);
        K.step(d);
        if (kind) eat(head, kind);
        else S.pop();
        return head;
    }

    function eat(at, kind) {
        PL.take(at.x, at.y);
        if (kind === PL.FRUIT) {
            // Fruit grows you like any food but doesn't count toward the zones: it's worth 100
            // and doubles every score for the next BOOST_MS (the 100 itself isn't doubled).
            G.score += 100;
            G.boost = BOOST_MS;
            fx.popup(at.x, at.y - 1, 'x2 SCORE!', '#f33');
            fx.burst(at.x, at.y, { n: 12, colors: ['#f33', '#fff', '#3c3'], speed: 2.5, up: 8, life: 700 });
            emit('boost', at);
            return;
        }
        if (kind === PL.RAINBOW) {
            SM.award(30);
            triggerPrism(at);
        } else {
            SM.award(10);
        }
        G.eaten++;
        if (M.growTo(G.eaten)) {
            PL.fillTo(M.STAGES[M.stage].food);
            fx.popup(at.x, at.y - 1, M.stage === M.STAGES.length - 1 ? 'THE FENCES FALL' : 'ZONE ' + (M.stage + 1), '#f6f');
        }
        emit('eat', { x: at.x, y: at.y, kind, rainbow: kind === PL.RAINBOW });
    }

    // A rainbow pellet turns every ghost blue and edible — except the armored one.
    function triggerPrism(at) {
        G.prism = lerp(7000, 4500, D.heatE()) * SM.skills.stat('prismMul');   // HUNT
        G.prismChain = 0;
        G.ghosts.forEach(g => {
            if (!g.active || g.immune) return;
            SM.ghosts.enterState(g, 'daze');
        });
        fx.popup(at.x, at.y - 1, 'PRISM!', '#fff');
        emit('prism', at);
    }

    function step() {
        if (G.inputQueue.length) G.direction = G.inputQueue.shift();
        const S = G.snake, d = G.direction;

        // --- THE TOROIDAL WRAP LOGIC ---
        const head = { x: wrap(S[0].x + d.x), y: wrap(S[0].y + d.y) };

        // Easy mode: a wall bumper turns you left or right instead of crashing, while any last.
        if (M.isWall(head.x, head.y) && G.bumpers > 0) {
            const free = SM.core.DIRS.filter(o => o.x !== -d.x || o.y !== -d.y).filter(o => o !== d && !(o.x === d.x && o.y === d.y))
                .filter(o => { const t = { x: wrap(S[0].x + o.x), y: wrap(S[0].y + o.y) };
                    return !M.isWall(t.x, t.y) && !S.some(s => !s.under && s.x === t.x && s.y === t.y); });
            if (free.length) {
                const turn = free[Math.floor(Math.random() * free.length)];
                G.bumpers--;
                G.direction = turn; G.inputQueue = [];
                fx.popup(S[0].x, S[0].y - 1, 'BUMP ' + G.bumpers, '#6f6');
                emit('bump', { left: G.bumpers, turn: [turn.x, turn.y] });
                head.x = wrap(S[0].x + turn.x); head.y = wrap(S[0].y + turn.y);
            }
        }

        if (M.isWall(head.x, head.y)) {
            if (M.isOpaque(head.x, head.y)) fx.popup(head.x, head.y, 'CRASH', '#55f');
            else fx.popup(head.x, head.y, 'ZAP', '#f6f');
            if (G.invuln > 0) { respawnNear(); return; } // grace period: just get put back on the road
            if (G.wallSaves > 0) {                       // SAVING PRIVATE RYAN! (special.js)
                G.wallSaves--;
                fx.popup(head.x, head.y - 1, G.wallSaves ? 'SAVED! ' + G.wallSaves + ' LEFT' : 'LAST SAVE!', '#9fd36a');
                emit('wallSave', { left: G.wallSaves });
                respawnNear();
                G.invuln = 1000;
                return;
            }
            loseLife(M.isOpaque(head.x, head.y) ? 'wall' : 'fence');
            return;
        }

        // Self collision (the tail tip moves out of the way unless we're growing). Segments
        // still threading through a tunnel are underneath you.
        const n = PL.at(head.x, head.y) ? S.length : S.length - 1;
        for (let i = 0; i < n; i++) {
            if (!S[i].under && head.x === S[i].x && head.y === S[i].y) {
                fx.popup(head.x, head.y, 'OUCH', '#fa0');
                respawnNear();
                G.invuln = 1000;
                return;
            }
        }

        advance(G.direction);
        checkContacts(true);
    }

    // --- CONTACT ---
    // Returns true if the round was interrupted (player hit).
    // byPlayer: the head moved onto the ghost (only that counts as sabotage while disguised).
    function checkContacts(byPlayer = false) {
        const h = G.snake[0];
        if (h.under || SM.dash.shielded) return false;   // nothing reaches you underground
        for (const g of G.ghosts) {
            if (!g.active || g.x !== h.x || g.y !== h.y) continue;
            if (g.traitor) continue;                     // on your side, for now
            if (SM.special.deadly()) {                   // GHOSTBANE, the VOID or a DASH: your touch kills
                SM.special.kill(g, G.voidT > 0 ? 'void' : SM.lunge.busy ? 'lunge' : 'bane');
                continue;
            }
            if (g.frozen > 0) {                          // frozen solid: harmless, and it shatters
                if (!g.immune) SM.special.kill(g, 'shatter');
                continue;
            }
            if (g.state === 'daze') {
                if (g.immune) continue;          // a dazed armored ghost is harmless, but you can't eat it
                eatGhost(g);
                continue;
            }
            if (SM.coat.disguised && g.state === 'hunt') {   // in disguise, idle ghosts don't hurt you
                if (byPlayer || g.immune) SM.coat.sabotage(g);   // ...but the armored one notices any bump
                continue;
            }
            if (G.invuln <= 0) { g.fit += 3; loseLife('ghost:' + g.name + ':' + g.state); return true; }
        }
        return false;
    }

    function eatGhost(g) {
        // During a prism each ghost is worth double the last: 50, 100, 200, 400.
        const pts = SM.award(G.prism > 0 ? 50 * 2 ** Math.min(3, G.prismChain++) : 50);
        fx.popup(g.x, g.y, '+' + pts, '#66f');
        emit('ghostEaten', g);
        emit('ghostKilled', { g, how: 'eat', stealth: SM.coat.disguised });
        g.active = false;  // gone for good; the chunk director breeds a replacement from fitter stock
    }

    function loseLife(cause = 'unknown') {
        if (SM.zombies.absorb()) G.flash = 0.6;      // JUGGERNOG takes the hit (zombies.js)
        else {
            G.lives--;
            G.flash = 1;
            emit('hit', cause);
            if (G.lives <= 0) { SM.game.end('OUT OF LIVES'); return; }
        }
        // The world persists: respawn near where you fell, and back off anyone mid-attack.
        respawnNear();
        G.invuln = SM.skills.stat('graceMs');   // EVADE
        const h = G.snake[0];
        G.ghosts.forEach(g => {
            if (!g.active) return;
            if (g.state === 'aim' || g.state === 'lunge') { SM.ghosts.enterState(g, 'hunt'); g.cool = 3000; }
            if (tdist(g.x, g.y, h.x, h.y) < 8) SM.ghosts.placeInRing(g);
        });
    }

    // Returns false if the run ended.
    function update(dt) {
        if (SM.dash.busy) { acc = 0; SM.dash.update(dt); return G.mode === 'play'; }
        if (SM.lunge.busy) { acc = 0; SM.lunge.update(dt); return G.mode === 'play'; }   // DASH (lunge.js)
        acc += dt;
        // a sighting shock staggers you; FORAGE, the SPEED upgrade and a HEATWAVE season speed you up
        const stepMs = () => D.playerStepMs() * SM.anim.drag() * SM.skills.stat('stepMul') * SM.upgrades.stepMul() * SM.modes.stepMul();
        for (let s = stepMs(); acc >= s; s = stepMs()) {
            acc -= s;
            step();
            if (G.mode !== 'play') return false;
            if (SM.dash.busy) { acc = 0; break; }
        }
        return true;
    }

    SM.player = { findSpawn, place, respawnNear, loseLife, queueDir, advance, checkContacts, update };
})();
