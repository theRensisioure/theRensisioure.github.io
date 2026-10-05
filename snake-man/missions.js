// SNAKE-MAN · missions
// MISSIONS. Three at a time, top left, each paying a different way:
//   XP + SKILL   some XP and a special-skill charge
//   XP ONLY      a bigger pile of XP
//   SKILL ONLY   special-skill charges (two of them on harder missions)
// The skill a mission pays is picked when it's dealt, so you can see what you're playing for.
// Finish one and a new, slightly harder mission of the same reward type takes its slot.
// Missions are dealt fresh each run; what they pay goes to the current player (profile.js).
// Like the ladder, everything is fed by bus events.
// Emits: 'mission' ({ kind, reward }).
'use strict';
(() => {
    const { on, emit } = SM.core;
    const G = SM.G, fx = SM.fx;

    // make(t) → { goal }; label(m) → the mission's text. ev[name](m, data) → progress to add.
    const KINDS = {
        eat:     { make: t => ({ goal: 15 + 8 * t }), label: m => `EAT ${m.goal} DOTS`, ev: { eat: () => 1 } },
        dodge:   { make: t => ({ goal: 3 + 2 * t }), label: m => `DODGE ${m.goal} LUNGES`, ev: { dodge: () => 1 } },
        hunt:    { make: t => ({ goal: 2 + t }), label: m => `KILL ${m.goal} GHOSTS`, ev: { ghostKilled: () => 1 } },
        stealth: { make: t => ({ goal: 1 + Math.floor(t / 2) }), label: m => `${m.goal} STEALTH KILL${m.goal > 1 ? 'S' : ''}`, ev: { ghostKilled: (m, k) => k.stealth ? 1 : 0 } },
        betray:  { make: t => ({ goal: 1 + Math.floor(t / 2) }), label: m => `BETRAY ${m.goal} GHOST${m.goal > 1 ? 'S' : ''}`, ev: { betrayed: () => 1 } },
        burrow:  { make: t => ({ goal: 2 + t }), label: m => `BURROW UNDER ${m.goal} WALLS`, ev: { surfaced: (m, d) => d.walls > 0 ? 1 : 0 } },
        fruit:   { make: t => ({ goal: 1 + Math.floor(t / 3) }), label: m => `EAT ${m.goal} FRUIT`, ev: { boost: () => 1 } },
        freeze:  { make: t => ({ goal: 2 + t }), label: m => `FREEZE ${m.goal} GHOSTS`, ev: { frozen: () => 1 } },
        clean:   { make: t => ({ goal: 25 + 10 * t }), label: m => `NO HITS FOR ${m.goal}s`, ev: { hit: m => -m.have },
                   tick(m, dt) { m.ms = (m.ms || 0) + dt; m.have = Math.floor(m.ms / 1000); }, resetOnHit: true },
        // The campaign's own (campaign.js): the SNAKE WAR and the ally
        snakekill:  { make: t => ({ goal: 1 + t }), label: m => `KILL ${m.goal} ENEMY SNAKE${m.goal > 1 ? 'S' : ''}`, ev: { snakeKilled: () => 1 }, war: true },
        warsurvive: { make: t => ({ goal: 30 + 10 * t }), label: m => `SURVIVE ${m.goal}s OF THE WAR`, ev: {}, war: true,
                      tick(m, dt) { if (SM.campaign.war()) { m.ms = (m.ms || 0) + dt; m.have = Math.floor(m.ms / 1000); } } },
        king:       { make: () => ({ goal: 1 }), label: () => 'KILL THE SNAKE KING', ev: { snakeKilled: (m, k) => k.king ? 1 : 0 }, war: true },
        allykill:   { make: t => ({ goal: 3 + t }), label: m => `YOUR ALLY KILLS ${m.goal} GHOSTS`, ev: { allyKill: () => 1 } },
        // modes with VOID gates only (modes.js)
        gate:    { make: t => ({ goal: 1 + Math.floor(t / 2) }), label: m => `ENTER ${m.goal} VOID GATE${m.goal > 1 ? 'S' : ''}`, ev: { gate: () => 1 }, voidOnly: true },
        voidkill:{ make: t => ({ goal: 3 + 2 * t }), label: m => `VOID-KILL ${m.goal} GHOSTS`, ev: { ghostKilled: (m, k) => k.how === 'void' ? 1 : 0 }, voidOnly: true },
    };

    const REWARDS = [
        { id: 'both',  tag: 'XP+SKILL', color: '#FFD700', xp: t => 100 + 50 * t, skills: () => 1 },
        { id: 'xp',    tag: 'XP',       color: '#0ff',    xp: t => 200 + 100 * t, skills: () => 0 },
        { id: 'skill', tag: 'SKILL',    color: '#f6f',    xp: () => 0,            skills: t => t >= 3 ? 2 : 1 },
    ];

    let slots = [];     // one mission per reward type
    let done = 0;       // missions finished this run (how hard the next random one is)
    let assigned = 0;   // campaign mission numbers dealt so far (campaign.js)
    let glow = [];      // ms of flash per slot after a finish

    function deal(r) {
        const reward = REWARDS[r];
        if (assigned < SM.campaign.TOTAL) {          // the 50 campaign missions, in order
            const no = ++assigned, c = SM.campaign.plan(no), t = Math.floor((no - 1) / 2), ids = SM.special.IDS;
            return {
                kind: c.kind, reward, have: 0, no, goal: c.goal, xp: reward.xp(t), skills: reward.skills(t),
                skill: ids[Math.floor(Math.random() * ids.length)],
            };
        }
        const t = Math.floor(done / 2);
        const taken = slots.filter(Boolean).map(m => m.kind);
        const pool = Object.keys(KINDS).filter(k => !taken.includes(k) && !KINDS[k].war && k !== 'allykill' && (!KINDS[k].voidOnly || SM.modes.has('gates'))
            && (k !== 'freeze' || SM.profile.charges('freeze') > 0));   // freezing needs a charge to do it with
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const ids = SM.special.IDS;
        return {
            kind, reward, have: 0, ...KINDS[kind].make(t),
            xp: reward.xp(t), skills: reward.skills(t),
            skill: ids[Math.floor(Math.random() * ids.length)],
        };
    }

    function reset() {
        done = 0; assigned = SM.campaign.done(); slots = []; glow = [0, 0, 0];
        for (let r = 0; r < REWARDS.length; r++) slots[r] = deal(r);
    }

    function progress(r, n) {
        const m = slots[r];
        if (!m || G.mode !== 'play' || !n) return;
        m.have = Math.max(0, m.have + n);
        if (m.have >= m.goal) finish(r);
    }

    function finish(r) {
        const m = slots[r], h = G.snake[0], P = SM.profile;
        done++;
        const n = SM.campaign.finished();
        fx.popup(h.x, h.y - 2.5, 'MISSION DONE!', m.reward.color);
        if (m.skills) {
            P.grant(m.skill, m.skills);
            const s = SM.special.byId[m.skill];
            fx.popup(h.x, h.y - 1, '+' + m.skills + ' ' + s.name, s.color);
        }
        fx.burst(h.x, h.y, { n: 16, colors: [m.reward.color, '#fff'], speed: 2.5, up: 10, life: 800 });
        emit('mission', { kind: m.kind, reward: m.reward.id });
        if (m.xp) P.gainXp(m.xp);
        if (n === SM.campaign.TOTAL) { P.gainXp(1000); fx.popup(h.x, h.y - 3.5, 'ALL 50 MISSIONS DONE!', '#fff'); }
        slots[r] = null;
        slots[r] = deal(r);
        glow[r] = 900;
    }

    const evNames = new Set();
    for (const k of Object.values(KINDS)) for (const e of Object.keys(k.ev)) evNames.add(e);
    for (const e of evNames) {
        on(e, data => {
            if (G.mode !== 'play') return;
            slots.forEach((m, r) => {
                if (!m) return;
                const K = KINDS[m.kind];
                if (e === 'hit' && K.resetOnHit) { m.ms = 0; m.have = 0; return; }
                const f = K.ev[e];
                if (f) progress(r, f(m, data));
            });
        });
    }

    // The war is won: any war mission still open counts as done.
    on('warEnd', () => slots.forEach((m, r) => { if (m && KINDS[m.kind].war && G.mode === 'play') finish(r); }));

    function update(dt) {
        slots.forEach((m, r) => {
            const K = KINDS[m.kind];
            if (K.tick) { K.tick(m, dt); if (m.have >= m.goal) finish(r); }
            glow[r] = Math.max(0, glow[r] - dt);
        });
    }

    // What a mission pays, in a few characters.
    function payLabel(m) {
        const out = [];
        if (m.xp) out.push(m.xp + 'XP');
        if (m.skills) out.push((m.skills > 1 ? m.skills + ' ' : '') + SM.special.byId[m.skill].short);
        return out.join(' + ');
    }

    // --- DRAWING: top left, under nothing ---
    function draw(now) {
        const { ctx } = SM.view, { pixelText } = SM.gfx;
        const X = 10, Y = 18, RH = 15;
        ctx.save();
        ctx.font = '8px ' + SM.view.FONT;
        const rows = slots.map(m => {
            const txt = (m.no ? '#' + m.no + ' ' : '') + KINDS[m.kind].label(m) + ' ' + Math.min(m.have, m.goal) + '/' + m.goal;
            return { m, txt, pay: '> ' + payLabel(m), w: ctx.measureText(txt).width };
        });
        const wide = Math.max(...rows.map(o => o.w + ctx.measureText(o.pay).width)) + 76 + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(X - 6, Y - 13, wide + 12, slots.length * RH + 6);
        rows.forEach(({ m, txt, pay, w }, r) => {
            const y = Y + r * RH, flash = glow[r] > 0 && Math.floor(now / 90) % 2;
            pixelText(m.reward.tag, X, y, 8, flash ? '#fff' : m.reward.color, '#000', 'left');
            pixelText(txt, X + 76, y, 8, '#ddd', '#000', 'left');
            pixelText(pay, X + 76 + w + 8, y, 8, m.skills ? SM.special.byId[m.skill].color : '#0ff', '#000', 'left');
        });
        ctx.restore();
    }

    SM.missions = { KINDS, REWARDS, reset, update, draw, get slots() { return slots; }, get done() { return done; } };
})();
