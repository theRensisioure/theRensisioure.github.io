// SNAKE-MAN · profile
// PLAYERS AND LEVELS. Every player has a name, and each name keeps its own XP, player level
// and stock of special-skill charges (special.js), so two people sharing a device climb
// separately and the LEVELS board means something. XP comes from almost everything you do
// and from missions (missions.js); the level has no cap. Every level-up hands out one random
// special-skill charge and one upgrade point, spent on the upgrades screen (upgrades.js).
// The current player is remembered; the name screen (names.js) switches or creates players.
// Emits: 'playerLevel' ({ name, level }), 'xp' ({ n, total }).
'use strict';
(() => {
    const { store, on, emit } = SM.core;
    const G = SM.G, fx = SM.fx;

    const KEY = 'snakeman-profiles';
    const DEFAULT_NAME = 'SNAKE';
    const NAME_MAX = 8;
    // Total XP needed to reach level L: 50 * L * (L - 1), so 100, 300, 600 ... 4500 for 10.
    const xpFor = L => 50 * L * (L - 1);
    const levelOf = xp => Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));

    // New players start with one charge of each special skill, so there's something to try.
    const starter = () => Object.fromEntries(SM.special.IDS.map(id => [id, 1]));
    const fresh = () => ({ xp: 0, charges: starter(), up: {}, camp: 0, made: new Date().toISOString().slice(0, 10) });

    // A name is up to NAME_MAX of A-Z, 0-9 and single spaces, upper case.
    const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/ +/g, ' ').trim().slice(0, NAME_MAX);

    let data = load();     // { current, players: { NAME: { xp, charges, made } } }
    let runXp = 0;         // XP earned this run, for the game-over line
    let dirty = false, saveIn = 0;

    function load() {
        const out = { current: DEFAULT_NAME, players: {} };
        try {
            const s = JSON.parse(store.get(KEY) || 'null');
            if (s && s.players) {
                for (const [n, p] of Object.entries(s.players)) {
                    const name = clean(n);
                    if (!name || !p) continue;
                    // a special skill added since this player was saved starts them with one charge of it
                    const charges = starter();
                    for (const id of SM.special.IDS) if (Number.isFinite(p.charges && p.charges[id])) charges[id] = Math.max(0, p.charges[id]);
                    const up = {};
                    for (const [id, t] of Object.entries(p.up || {})) if (Number.isFinite(t) && t > 0) up[id] = Math.floor(t);
                    out.players[name] = { xp: Number.isFinite(p.xp) ? Math.max(0, p.xp) : 0, charges, up, camp: Number.isFinite(p.camp) ? Math.max(0, Math.floor(p.camp)) : 0, made: p.made || null };
                }
                if (out.players[clean(s.current)]) out.current = clean(s.current);
            }
        } catch (e) {}
        if (!out.players[out.current]) out.players[out.current] = fresh();
        return out;
    }
    function save() { store.set(KEY, JSON.stringify(data)); dirty = false; }

    const me = () => data.players[data.current];
    const level = () => levelOf(me().xp);
    // 0 → 1 through the current level.
    function progress() {
        const L = level();
        return (me().xp - xpFor(L)) / (xpFor(L + 1) - xpFor(L));
    }

    function gainXp(n, at) {
        if (G.mode !== 'play' || !n) return;
        const before = level();
        me().xp += n;
        runXp += n;
        dirty = true;
        emit('xp', { n, total: me().xp });
        const after = level();
        if (after > before) {
            const h = at || G.snake[0];
            const id = SM.special.IDS[Math.floor(Math.random() * SM.special.IDS.length)];
            me().charges[id]++;
            fx.popup(h.x, h.y - 3, 'LEVEL ' + after + '!', '#fff');
            fx.popup(h.x, h.y - 1.5, '+1 ' + SM.special.byId[id].name, SM.special.byId[id].color);
            fx.popup(h.x, h.y, '+1 UPGRADE POINT', '#3f6');
            fx.burst(h.x, h.y, { n: 18, colors: ['#fff', '#FFD700', '#0ff'], speed: 3, up: 11, life: 900 });
            emit('playerLevel', { name: data.current, level: after });
            save();
        }
    }

    // Switch to a player by name, creating them if they're new. Returns the cleaned name.
    function use(name) {
        name = clean(name) || DEFAULT_NAME;
        if (!data.players[name]) data.players[name] = fresh();
        data.current = name;
        save();
        return name;
    }

    const charges = id => me().charges[id] || 0;
    function spend(id) {
        if (!charges(id)) return false;
        me().charges[id]--;
        save();
        return true;
    }
    function grant(id, n = 1) { me().charges[id] = charges(id) + n; dirty = true; }

    // --- UPGRADES (upgrades.js) ---
    // Each level past 1 is one point; each tier bought costs one.
    const tier = id => me().up[id] || 0;
    const points = () => level() - 1 - Object.values(me().up).reduce((s, t) => s + t, 0);
    function buy(id) {
        if (points() <= 0) return false;
        me().up[id] = tier(id) + 1;
        save();
        return true;
    }

    // --- CAMPAIGN (campaign.js): how many of the 50 missions this player has finished ---
    const camp = () => me().camp || 0;
    function setCamp(n) { me().camp = n; save(); }

    // Every player, best first, for the LEVELS board.
    const all = () => Object.entries(data.players)
        .map(([name, p]) => ({ name, xp: p.xp, level: levelOf(p.xp) }))
        .sort((a, b) => b.xp - a.xp);

    // --- XP FROM PLAYING ---
    // Rainbow snake (special.js) makes every dot, orb and fruit worth 100 XP instead.
    const RAINBOW_XP = 100;
    // The XP upgrade adds its bonus to every dot and orb.
    // XP tier 5 chains eats into a multiplier (upgrades.js COMBO).
    on('eat', e => {
        const mul = SM.upgrades.comboHit(e);
        gainXp(G.rainbowT > 0 ? RAINBOW_XP : ((e.rainbow ? 5 : 1) + SM.upgrades.eatXp(e.rainbow)) * mul, e);
    });
    on('boost', at => gainXp(G.rainbowT > 0 ? RAINBOW_XP : 10, at));
    on('dodge', () => gainXp(3));
    on('ghostKilled', k => gainXp(k.stealth ? 30 : 10, k.g));
    on('betrayed', () => gainXp(5));
    on('surfaced', d => gainXp(d.walls ? 2 : 0));
    on('hit', () => { if (dirty) save(); });

    function reset() { runXp = 0; }
    function update(dt) { if (dirty && (saveIn -= dt) <= 0) { save(); saveIn = 3000; } }
    function finish() { if (dirty) save(); }

    SM.profile = {
        DEFAULT_NAME, NAME_MAX, clean, xpFor, levelOf,
        use, all, level, progress, gainXp, charges, spend, grant, reset, update, finish, tier, points, buy, camp, setCamp,
        get name() { return data.current; },
        get xp() { return me().xp; },
        get runXp() { return runXp; },
        names: () => Object.keys(data.players),
    };
})();
