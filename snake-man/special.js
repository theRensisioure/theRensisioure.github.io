// SNAKE-MAN · special
// SPECIAL SKILLS. One-shot powers you carry as charges: missions (missions.js) and level-ups
// (profile.js) hand them out, and each player keeps their own stock between runs. E (or the
// SKILL button) fires the selected one, Q (or SWAP) picks another.
//   FREEZE         for a few seconds every ghost that comes within the 5x5 square around
//                  you freezes solid: it can't move or hurt you, and touching it shatters it.
//   GHOSTBANE      invulnerable to attacks, and any ghost you touch dies. Even the armored
//                  one can't stand it: it gets banished to the edge of the map.
//   RAINBOW SNAKE  every dot, orb and fruit you eat is worth 100 XP.
//   SAVING PRIVATE RYAN!  three wall saves: the next three times you crash into a wall you
//                  lose no life, you're just put back on the road. They last until used.
// Timed specials count down G[key] in ms; RYAN counts G.wallSaves down as saves are used.
// Also here: kill(), the one way a ghost dies outside of plain eating, shared with the VOID
// gates (voidmode.js), so every kill is scored, counted and announced the same way.
// Emits: 'special' ({ id }), 'frozen' (a ghost froze), 'ghostKilled' ({ g, how, stealth }).
'use strict';
(() => {
    const { wdelta, emit } = SM.core;
    const G = SM.G, fx = SM.fx;

    const SPECIALS = [
        { id: 'freeze',  name: 'FREEZE',        short: 'FREEZE',  color: '#7fdfff', ms: 6000,  key: 'freezeT',  desc: 'FREEZE GHOSTS IN A 5x5 AROUND YOU' },
        { id: 'bane',    name: 'GHOSTBANE',     short: 'BANE',    color: '#ff4466', ms: 8000,  key: 'bane',     desc: 'INVULNERABLE, YOUR TOUCH KILLS GHOSTS' },
        { id: 'rainbow', name: 'RAINBOW SNAKE', short: 'RAINBOW', color: '#ff9cf0', ms: 12000, key: 'rainbowT', desc: 'EVERY DOT IS WORTH 100 XP' },
        { id: 'ryan',    name: 'SAVING PRIVATE RYAN!', short: 'RYAN', color: '#9fd36a', uses: 3, key: 'wallSaves', desc: '3 WALL SAVES: CRASH WITHOUT LOSING A LIFE' },
    ];
    const IDS = SPECIALS.map(s => s.id);
    const byId = Object.fromEntries(SPECIALS.map(s => [s.id, s]));

    const FREEZE_R = 2;          // 5x5 square: two tiles each way from the head
    const FROZEN_MS = 4000;      // how long a ghost stays frozen

    let sel = 0;                 // which special E fires

    const head = () => G.snake[0];
    const active = id => G[byId[id].key] > 0;
    // Bane, the void and a DASH (lunge.js) all make your touch deadly and you untouchable.
    const deadly = () => G.bane > 0 || G.voidT > 0 || SM.lunge.busy;

    function use() {
        if (G.mode !== 'play') return;
        const s = SPECIALS[sel], h = head();
        if (active(s.id)) { fx.popup(h.x, h.y - 1, s.name + ' IS ON', s.color); return; }
        if (!SM.profile.spend(s.id)) { fx.popup(h.x, h.y - 1, 'NO ' + s.name + ' LEFT', '#777'); return; }
        G[s.key] = s.uses || s.ms;
        fx.popup(h.x, h.y - 1.5, s.name + '!', s.color);
        fx.burst(h.x, h.y, { n: 16, colors: [s.color, '#fff'], speed: 3, up: 8, life: 700 });
        if (s.id === 'freeze') freezeAround();
        emit('special', { id: s.id });
    }
    function cycle(dir = 1) { sel = (sel + dir + SPECIALS.length) % SPECIALS.length; }

    // A ghost dies to something other than being eaten (shatter, bane, void).
    // The armored ghost can't die: it's banished to the edge of the map instead.
    function kill(g, how, pts = 50) {
        if (!g.active) return;
        if (g.immune) {
            fx.popup(g.x, g.y, 'BANISHED', '#ccc');
            SM.ghosts.placeInRing(g);
            return;
        }
        const stealth = SM.coat.disguised;
        const p = SM.award(pts);
        const colors = how === 'shatter' ? ['#7fdfff', '#fff', '#3af'] : how === 'void' ? ['#fff', '#000', '#888'] : ['#ff4466', '#fff', g.color];
        fx.popup(g.x, g.y, (stealth ? 'STEALTH ' : '') + '+' + p, stealth ? SM.coat.COAT_COLOR : colors[0]);
        fx.burst(g.x, g.y, { n: 12, colors, speed: 3, up: 7, life: 600 });
        g.active = false;   // gone for good; the chunk director breeds a replacement
        emit('ghostKilled', { g, how, stealth });
    }

    // Freeze every ghost inside the 5x5 square that isn't frozen already.
    function freezeAround() {
        const h = head();
        for (const g of G.ghosts) {
            if (!g.active || g.frozen > 0 || g.traitor) continue;
            if (Math.abs(wdelta(h.x, g.x)) > FREEZE_R || Math.abs(wdelta(h.y, g.y)) > FREEZE_R) continue;
            g.frozen = FROZEN_MS;
            if (g.state === 'aim' || g.state === 'lunge') { SM.ghosts.enterState(g, 'hunt'); g.cool = 2000; }
            fx.popup(g.x, g.y, 'FROZEN', '#7fdfff');
            emit('frozen', g);
        }
    }

    function reset() { for (const s of SPECIALS) G[s.key] = 0; }

    function update(dt) {
        for (const s of SPECIALS) if (s.ms) G[s.key] = Math.max(0, G[s.key] - dt);
        if (G.freezeT > 0) freezeAround();
        for (const g of G.ghosts) if (g.frozen > 0) g.frozen = Math.max(0, g.frozen - dt);
    }

    // --- DRAWING ---
    // Under the snake: the freeze square, and bane's pulsing red ring.
    function drawAura(now) {
        const { ctx, sx, sy, snap } = SM.view, { pixelRing } = SM.gfx, g = SM.core.GRID_SIZE, h = head();
        const flick = t => t > 1500 || Math.floor(now / 120) % 2;
        if (G.freezeT > 0 && flick(G.freezeT)) {
            const L = snap(sx(h.x) - (FREEZE_R + 0.5) * g), T = snap(sy(h.y) - (FREEZE_R + 0.5) * g), S = (2 * FREEZE_R + 1) * g;
            ctx.save();
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = '#7fdfff';
            ctx.fillRect(L, T, S, S);
            ctx.globalAlpha = 0.8;
            const on = Math.floor(now / 90) % 2;   // marching dashed border
            for (let k = 0; k < S; k += 8) {
                if ((k / 8 + on) % 2) continue;
                ctx.fillRect(L + k, T, 4, 2); ctx.fillRect(L + k, T + S - 2, 4, 2);
                ctx.fillRect(L, T + k, 2, 4); ctx.fillRect(L + S - 2, T + k, 2, 4);
            }
            ctx.restore();
        }
        if (G.bane > 0 && flick(G.bane)) {
            ctx.save();
            ctx.globalAlpha = 0.85;
            pixelRing(sx(h.x), sy(h.y), g * (0.9 + 0.15 * Math.sin(now / 80)), '#ff4466');
            ctx.globalAlpha = 0.4;
            pixelRing(sx(h.x), sy(h.y), g * (1.4 + 0.2 * Math.sin(now / 110)), '#fff');
            ctx.restore();
        }
    }

    // Over a frozen ghost: a block of ice, cracking as it thaws.
    function drawIce(gh, x, y, now) {
        if (!(gh.frozen > 0)) return;
        const { ctx, P } = SM.view, s = SM.core.GRID_SIZE;
        ctx.save();
        ctx.globalAlpha = gh.frozen < 1000 && Math.floor(now / 100) % 2 ? 0.25 : 0.55;
        ctx.fillStyle = '#9fe8ff';
        ctx.fillRect(x - P, y - P, s + 2 * P, s + 2 * P);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, s, P); ctx.fillRect(x, y, P, s / 2);
        ctx.fillRect(x + s - 3 * P, y + 2 * P, P, P);
        ctx.restore();
    }

    // The HUD's SKILL readout: what's selected, and its charges or time left.
    function hudText() {
        const s = SPECIALS[sel];
        if (active(s.id)) return s.uses ? s.short + ' ' + G[s.key] + ' SAVE' + (G[s.key] > 1 ? 'S' : '') + ' LEFT' : s.name + ' ' + (G[s.key] / 1000).toFixed(1) + 's';
        return s.name + ' x' + SM.profile.charges(s.id);
    }

    SM.special = {
        SPECIALS, IDS, byId, FREEZE_R,
        use, cycle, kill, deadly, reset, update, drawAura, drawIce, hudText, active,
        get selected() { return SPECIALS[sel]; },
    };
})();
