// SNAKE-MAN · skills
// LEARN BY DOING. Five skills, each trained only by doing the thing it improves: eat to move
// faster, burrow to dig sooner and farther, dodge to get a longer grace after a hit, eat ghosts
// to stretch the prism, wear the coat to hold it longer. Levels run 1-10 and carry over from
// run to run (localStorage); the controller screen can wipe them.
// XP comes off the bus like everything else; the rules read their numbers back through stat().
// Emits: 'levelup' ({ id, level }).
'use strict';
(() => {
    const { store, on, emit } = SM.core;
    const G = SM.G, fx = SM.fx;

    const MAX_LEVEL = 10;
    const KEY = 'snakeman-skills';
    // Total XP needed to reach level L: 30 * (L-1)^1.9, so 30, 112, 242 ... 1992 for 10.
    const xpFor = L => Math.round(30 * (L - 1) ** 1.9);

    // k = level - 1 (0..9). Each skill's stats, and the short line that shows them.
    const SKILLS = [
        { id: 'forage', name: 'FORAGE', color: '#FFD700', trains: 'EATING DOTS',
          stats: k => ({ stepMul: 1 - 0.012 * k }),
          label: s => 'SPEED +' + Math.round((1 / s.stepMul - 1) * 100) + '%' },
        { id: 'burrow', name: 'BURROW', color: '#c89c62', trains: 'DIGGING',
          stats: k => ({ digCoolMs: 4000 - 200 * k, digReach: 6 + Math.floor(k / 4) }),
          label: s => 'DIG ' + (s.digCoolMs / 1000).toFixed(1) + 's REACH ' + s.digReach },
        { id: 'evade', name: 'EVADE', color: '#9a9aff', trains: 'DODGING LUNGES',
          stats: k => ({ graceMs: 2000 + 150 * k, bonkDazeMul: 1 + 0.06 * k }),
          label: s => 'GRACE ' + (s.graceMs / 1000).toFixed(2) + 's' },
        { id: 'hunt', name: 'HUNT', color: '#66f', trains: 'EATING GHOSTS',
          stats: k => ({ prismMul: 1 + 0.05 * k }),
          label: s => 'PRISM +' + Math.round((s.prismMul - 1) * 100) + '%' },
        { id: 'guile', name: 'GUILE', color: '#b89cff', trains: 'TURNCOAT',
          stats: k => ({ coatMs: 8000 + 500 * k, suspicionMul: 1 - 0.04 * k }),
          label: s => 'COVER ' + (s.coatMs / 1000).toFixed(1) + 's' },
    ];
    const byId = Object.fromEntries(SKILLS.map(s => [s.id, s]));

    let xp = load();
    let runStart = {};     // levels when this run began, for the game-over gains
    let coatMs = 0;        // disguised time not yet paid out as GUILE xp
    let dirty = false, saveIn = 0;

    function load() {
        const out = Object.fromEntries(SKILLS.map(s => [s.id, 0]));
        try {
            const saved = JSON.parse(store.get(KEY) || '{}');
            for (const s of SKILLS) if (Number.isFinite(saved[s.id])) out[s.id] = Math.max(0, saved[s.id]);
        } catch (e) {}
        return out;
    }
    function save() { store.set(KEY, JSON.stringify(xp)); dirty = false; }

    function level(id) {
        let L = 1;
        while (L < MAX_LEVEL && xp[id] >= xpFor(L + 1)) L++;
        return L;
    }
    // 0 → 1 progress through the current level (1 at the cap).
    function progress(id) {
        const L = level(id);
        if (L >= MAX_LEVEL) return 1;
        return (xp[id] - xpFor(L)) / (xpFor(L + 1) - xpFor(L));
    }
    const statsOf = id => byId[id].stats(level(id) - 1);

    // Every stat from every skill in one flat object (names don't collide).
    function stat(name) {
        for (const s of SKILLS) {
            const v = s.stats(level(s.id) - 1)[name];
            if (v !== undefined) return v;
        }
        return undefined;
    }

    function gain(id, n) {
        if (G.mode !== 'play' || !n) return;
        const before = level(id);
        xp[id] += n;
        dirty = true;
        const after = level(id);
        if (after > before) {
            const s = byId[id], h = G.snake[0];
            fx.popup(h.x, h.y - 2, s.name + ' LV ' + after, s.color);
            fx.burst(h.x, h.y, { n: 10, colors: [s.color, '#fff'], speed: 2, up: 9, life: 700 });
            emit('levelup', { id, level: after });
            save();
        }
    }

    // --- TRAINING ---
    on('eat',        e => gain('forage', e.rainbow ? 3 : 1));
    on('boost',      () => gain('forage', 5));
    on('surfaced',   d => gain('burrow', 2 + 4 * d.walls));
    on('dodge',      g => { gain('evade', 5); if (g.dug) gain('burrow', 6); });
    on('bonk',       g => { gain('evade', 3); g.dazeFor *= stat('bonkDazeMul'); });   // baited ghosts stay dizzy longer
    on('ghostEaten', () => gain('hunt', 4 + 4 * Math.min(4, G.prismChain)));          // chains pay more
    on('turned',     () => gain('guile', 5));
    on('betrayed',   () => gain('guile', 8));

    function reset() {
        runStart = Object.fromEntries(SKILLS.map(s => [s.id, level(s.id)]));
        coatMs = 0;
    }

    function update(dt) {
        if (SM.coat.disguised) {            // a second in disguise is a point of GUILE
            coatMs += dt;
            if (coatMs >= 1000) { gain('guile', Math.floor(coatMs / 1000)); coatMs %= 1000; }
        }
        if (dirty && (saveIn -= dt) <= 0) { save(); saveIn = 3000; }
    }
    on('hit', save);

    function wipe() {
        for (const s of SKILLS) xp[s.id] = 0;
        save();
        reset();
    }

    // --- DRAWING: the skill sheet, under the ready / paused / game-over text ---
    function draw() {
        const { ctx, snap } = SM.view, { pixelText } = SM.gfx;
        const X = 100, Y = 452, RH = 24, BW = 90;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(X - 12, Y - 18, 600 - 2 * (X - 12), SKILLS.length * RH + 18);
        ctx.fillStyle = '#1c4a1c';
        ctx.fillRect(X - 12, Y - 18, 600 - 2 * (X - 12), 2);
        SKILLS.forEach((s, i) => {
            const y = Y + i * RH, L = level(s.id), up = L - (runStart[s.id] || L);
            pixelText(s.name, X, y + 4, 8, s.color, '#000', 'left');
            pixelText('LV ' + L, X + 64, y + 4, 8, '#fff', '#000', 'left');
            // xp bar
            ctx.fillStyle = '#222';
            ctx.fillRect(X + 116, y - 4, BW, 8);
            ctx.fillStyle = L >= MAX_LEVEL ? '#fff' : s.color;
            ctx.fillRect(X + 116, y - 4, snap(BW * progress(s.id)), 8);
            pixelText(s.label(statsOf(s.id)), X + 216, y + 4, 8, '#aaa', '#000', 'left');
            if (up > 0 && G.mode === 'over') pixelText('+' + up, X + 356, y + 4, 8, '#3f6', '#000', 'left');
        });
        ctx.restore();
    }

    // The skill sheet as rows, for the Thor's lower screen (dual.js).
    const rows = () => SKILLS.map(s => {
        const L = level(s.id);
        return { name: s.name, color: s.color, level: L, progress: L >= MAX_LEVEL ? 1 : progress(s.id),
                 stat: s.label(statsOf(s.id)), gain: G.mode === 'over' ? L - (runStart[s.id] || L) : 0 };
    });

    SM.skills = { SKILLS, MAX_LEVEL, reset, update, draw, rows, wipe, stat, level, progress, gain };
})();
