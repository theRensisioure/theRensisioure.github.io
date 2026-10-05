// SNAKE-MAN · coat
// TURNCOAT (Esc). A high-stakes ruse: disguise yourself as a ghost. Ghosts stop hunting you (a
// lunge already in flight still lands). Run your head into a ghost and it turns traitor for a
// few seconds, lunging at its own kind; anyone it hits is dazed and edible. But every ghost that
// can see you grows suspicious, eating, sabotaging or burrowing in view makes it spike, the
// armored ghost watches three times as hard and sees straight through you if you touch it.
// Fill the meter and you're BUSTED: every ghost nearby winds up at once, fast.
// STEALTH tier 5 (GHOST FORM, upgrades.js): suspicion never rises and stealth kills refill cover.
// Emits: 'turned' (a ghost you bumped turned traitor).
'use strict';
(() => {
    const { tdist, on, emit } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;

    const COAT_COOL_MS = 10000, BUSTED_COOL_MS = 18000, TRAITOR_MS = 7000;
    const WATCH_RANGE = 12, BUST_RANGE = 14;
    const COAT_COLOR = '#b89cff', TRAITOR_COLOR = '#33ff66';
    let disguised = false, coatT = 0, coatLen = 1, coatCool = 0, suspicion = 0;
    const head = () => G.snake[0];

    function reset() { disguised = false; coatT = 0; coatCool = 0; suspicion = 0; }

    function toggle() {
        if (G.mode !== 'play') return;
        if (disguised) { drop('COVER DROPPED'); return; }
        if (coatCool > 0) return;
        disguised = true; coatT = coatLen = SM.skills.stat('coatMs') + SM.upgrades.coverMs(); suspicion = 0;   // GUILE + STEALTH upgrade
        fx.popup(head().x, head().y - 1, 'TURNCOAT', COAT_COLOR);
    }
    function drop(msg) {
        disguised = false; coatCool = COAT_COOL_MS; suspicion = 0;
        if (msg) fx.popup(head().x, head().y - 1, msg, COAT_COLOR);
    }
    const watching = g => g.active && !g.traitor && g.state !== 'daze'
        && tdist(g.x, g.y, head().x, head().y) <= WATCH_RANGE && M.lineOfSight(head().x, head().y, g.x, g.y);
    const witnessWeight = () => G.ghosts.reduce((s, g) => s + (watching(g) ? (g.immune ? 3 : 1) : 0), 0);
    function suspect(amount) {
        if (!disguised || SM.upgrades.ghostForm()) return;   // STEALTH tier 5: GHOST FORM
        suspicion += amount * SM.skills.stat('suspicionMul') * SM.upgrades.suspicionMul();
        if (suspicion >= 1) bust();
    }
    // Something un-ghostly happened in view: suspicion jumps by base + per * witnesses.
    function witnessed(base, per) {
        if (!disguised) return;
        const w = witnessWeight();
        if (w) suspect(base + per * w);
    }
    function bust() {
        const h = head();
        disguised = false; suspicion = 0; coatCool = BUSTED_COOL_MS;
        fx.popup(h.x, h.y - 1, 'BUSTED!', '#f33');
        G.flash = 0.6;
        for (const g of G.ghosts) {   // the ambush: everyone close winds up at once, and faster
            if (!g.active || g.traitor || g.state === 'daze' || tdist(g.x, g.y, h.x, h.y) > BUST_RANGE) continue;
            SM.ghosts.enterState(g, 'aim');
            g.aimMs *= 0.6; g.lockMs = Math.min(g.lockMs, g.aimMs * 0.45);
        }
    }
    function update(dt) {
        coatCool = Math.max(0, coatCool - dt);
        G.ghosts.forEach(g => { if (g.traitor > 0 && (g.traitor = Math.max(0, g.traitor - dt)) === 0) g.victim = null; });
        if (!disguised) return;
        coatT -= dt;
        const w = witnessWeight();
        if (w) suspect(w * 0.09 * dt / 1000);
        else suspicion = Math.max(0, suspicion - 0.12 * dt / 1000);
        if (disguised && coatT <= 0) drop('COVER FADES');
    }
    // You ran your head into g while disguised.
    function sabotage(g) {
        if (g.immune) { bust(); return; }                 // the armored ghost sees straight through you
        g.traitor = TRAITOR_MS; g.victim = null; g.cool = 0;
        if (g.state !== 'hunt') SM.ghosts.enterState(g, 'hunt');
        fx.popup(g.x, g.y, 'TRAITOR', TRAITOR_COLOR);
        emit('turned', g);
        suspect(0.15 + 0.25 * witnessWeight());           // g itself no longer counts as a witness
    }

    // ghosts don't eat pellets, eat each other, or dig
    on('eat', () => witnessed(0, 0.12));
    on('ghostEaten', () => witnessed(0.2, 0.3));
    on('dash', () => witnessed(0.1, 0.2));
    on('hit', () => { if (disguised) drop(null); });
    // GHOST FORM (STEALTH tier 5): a stealth kill tops your cover back up.
    on('ghostKilled', k => {
        if (!disguised || !k.stealth || !SM.upgrades.ghostForm()) return;
        coatT = coatLen;
        fx.popup(head().x, head().y - 1, 'COVER REFILLED', COAT_COLOR);
    });   // getting hit tears the disguise off

    SM.coat = {
        COAT_COOL_MS, BUSTED_COOL_MS, COAT_COLOR, TRAITOR_COLOR,
        reset, toggle, update, sabotage, watching,
        get disguised() { return disguised; },
        get coatT() { return coatT; },
        get coatLen() { return coatLen; },
        get cool() { return coatCool; },
        get suspicion() { return suspicion; },
    };
})();
