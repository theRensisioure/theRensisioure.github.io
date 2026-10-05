// SNAKE-MAN · modes
// GAME MODES, cycled on the start and game-over screens (G, the MODE button, or the bound pad
// button). Each mode is a set of features the other systems ask about, instead of each one
// checking a mode name:
//   CLASSIC    the original game, scores on the skill-tier boards.
//   VOID       VOID gates (voidmode.js): drive through one and nearby ghosts die. Own board.
//   ZOMBIES    the ghosts are zombies and you have guns, bought at gun gates (zombies.js,
//              which switches itself on by the mode's id). Own board.
//   IDLE       a bot plays and the runs chain on their own (autopilot.js). Every point also pays
//              SCALES (idle.js), which buy upgrades for the bot and for the runs after; tapping
//              the screen fills a HEART meter for extra lives. Own board.
//   SEASONAL   the VOID gates plus a twist that changes with the season, and a fresh board
//              every season; past seasons stay on the score screen as a record of their own.
//                BLOOM     Mar-May  dots eaten in the void score triple
//                HEATWAVE  Jun-Aug  six gates, short voids, and you run hot (faster)
//                HAUNT     Sep-Nov  long voids, and void kills reap +50 souls
//                FROST     Dec-Feb  every gate you take freezes the ghosts around it
//              ?season=bloom|heatwave|haunt|frost in the URL plays another season (testing).
// Each season also has its own weather drifting over the screen.
// Emits: 'gameMode' ({ id }).
'use strict';
(() => {
    const { store, on, emit, tdist } = SM.core;
    const G = SM.G, fx = SM.fx;
    const KEY = 'snakeman-mode';

    // --- SEASONS ---
    const SEASONS = [
        { id: 'bloom',    months: [2, 3, 4],  name: 'BLOOM',    color: '#ff9cf0', blurb: 'VOID DOTS SCORE x3',
          gates: 3, voidMs: 8000,  weather: { n: 26, colors: ['#ff9cf0', '#fff', '#ffd1f4'], fall: 0.025, sway: 30, size: 2 } },
        { id: 'heatwave', months: [5, 6, 7],  name: 'HEATWAVE', color: '#ffb347', blurb: 'SIX GATES, YOU RUN HOT',
          gates: 6, voidMs: 5000,  weather: { n: 18, colors: ['#ffb347', '#ff7a1a'], fall: -0.02, sway: 8, size: 2 } },
        { id: 'haunt',    months: [8, 9, 10], name: 'HAUNT',    color: '#ff7a1a', blurb: 'LONG VOIDS, KILLS REAP SOULS',
          gates: 4, voidMs: 11000, weather: { n: 22, colors: ['#ff7a1a', '#c0392b', '#e6a23c'], fall: 0.035, sway: 40, size: 3 } },
        { id: 'frost',    months: [11, 0, 1], name: 'FROST',    color: '#7fdfff', blurb: 'GATES FREEZE NEARBY GHOSTS',
          gates: 3, voidMs: 8000,  weather: { n: 40, colors: ['#fff', '#cfefff'], fall: 0.03, sway: 18, size: 2 } },
    ];
    // Which season a date falls in, named with its year. Winter runs Dec-Feb, so January and
    // February belong to the winter that started the December before.
    function seasonOf(d = new Date()) {
        const m = d.getMonth(), s = SEASONS.find(o => o.months.includes(m));
        const year = m < 2 ? d.getFullYear() - 1 : d.getFullYear();
        const title = s.name + ' ' + (s.id === 'frost' ? year + '-' + String(year + 1).slice(2) : year);
        return { ...s, year, key: 'season-' + s.id + '-' + year, title };
    }
    const forced = new URLSearchParams(location.search).get('season');
    const season = (() => {
        const s = seasonOf();
        const f = SEASONS.find(o => o.id === forced);
        return f ? { ...seasonOf(new Date(s.year, f.months[0], 15)) } : s;
    })();

    // --- MODES ---
    const MODES = [
        { id: 'classic',  title: 'CLASSIC',    short: 'CLASSIC', color: '#0ff', blurb: 'THE ORIGINAL HUNT' },
        { id: 'void',     title: 'VOID',       short: 'VOID',    color: '#fff', blurb: 'GATES TURN ON AUTO KILL',
          gates: { count: 3, voidMs: 8000 } },
        { id: 'zombies',  title: 'ZOMBIES',    short: 'ZOMBIES', color: '#9f6',
          blurb: () => (SM.pad.active ? SM.pad.label('shoot') : document.documentElement.classList.contains('touch') ? 'FIRE' : 'F') + ': SHOOT, GUN GATES SELL GUNS' },
        { id: 'idle',     title: 'IDLE',       short: 'IDLE',    color: '#0ff',
          blurb: () => (SM.auto && SM.auto.on ? 'THE BOT PLAYS' : 'AUTO STARTS THE BOT') + ', TAP TO FILL THE HEART' },
        { id: 'seasonal', title: season.title, short: season.name, color: season.color, blurb: season.blurb,
          gates: { count: season.gates, voidMs: season.voidMs }, season },
    ];
    const byId = Object.fromEntries(MODES.map(m => [m.id, m]));

    G.gameMode = byId[store.get(KEY)] ? store.get(KEY) : 'classic';
    const current = () => byId[G.gameMode] || MODES[0];
    const seasonOn = id => G.gameMode === 'seasonal' && (!id || season.id === id);

    // Cycle modes (start and game-over screens only). On the start screen it takes effect at
    // once; after a game over, on the next run.
    function next(dir = 1) {
        if (G.mode === 'play' || G.mode === 'paused') return;
        const i = MODES.indexOf(current());
        G.gameMode = MODES[(i + dir + MODES.length) % MODES.length].id;
        store.set(KEY, G.gameMode);
        if (G.mode === 'ready') { SM.voidmode.reset(); SM.zombies.reset(); SM.missions.reset(); G.hi = SM.scores.best(); }
        emit('gameMode', { id: G.gameMode });
    }
    const after = () => MODES[(MODES.indexOf(current()) + 1) % MODES.length];   // what the switch leads to

    // The board this mode's runs go on: null means the skill-tier boards.
    function board() {
        const m = current();
        if (m.id === 'void') return SM.scores.VOID;
        if (m.id === 'zombies') return SM.scores.ZOMBIES;
        if (m.id === 'idle') return SM.scores.IDLE;
        if (m.id === 'seasonal') return { id: season.key, name: season.title, color: season.color, season: true };
        return null;
    }

    // --- THE SEASONAL TWISTS (all off the bus) ---
    on('ghostKilled', k => {                    // HAUNT: a void kill reaps a soul
        if (!seasonOn('haunt') || k.how !== 'void' || G.mode !== 'play') return;
        const p = SM.award(50);
        fx.popup(k.g.x, k.g.y - 1, 'SOUL +' + p, season.color);
    });
    on('eat', e => {                            // BLOOM: dots in the void score triple (10 + 20)
        if (!seasonOn('bloom') || G.voidT <= 0 || e.rainbow) return;
        SM.award(20);
        fx.burst(e.x, e.y, { n: 3, colors: season.weather.colors, speed: 1.5, up: 5, life: 400 });
    });
    on('gate', gt => {                          // FROST: the gate's cold snaps out around it
        if (!seasonOn('frost')) return;
        for (const g of G.ghosts) {
            if (!g.active || g.traitor || g.frozen > 0 || tdist(g.x, g.y, gt.x, gt.y) > 7) continue;
            g.frozen = 4000;
            if (g.state === 'aim' || g.state === 'lunge') { SM.ghosts.enterState(g, 'hunt'); g.cool = 2000; }
            fx.popup(g.x, g.y, 'FROZEN', season.color);
            emit('frozen', g);
        }
    });
    // HEATWAVE: you run 8% faster (the player's step time is multiplied by this).
    const stepMul = () => seasonOn('heatwave') ? 0.92 : 1;

    // --- WEATHER ---
    // Screen-space drift computed from the clock alone: no state, nothing to reset.
    const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    function drawWeather(now) {
        if (!seasonOn()) return;
        const { ctx, snap, P } = SM.view, w = season.weather, W = SM.view.canvas.width, H = SM.view.canvas.height;
        ctx.save();
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < w.n; i++) {
            const speed = w.fall * (0.6 + hash(i) * 0.8);
            const y = ((hash(i + 50) * H + now * speed) % H + H) % H;
            const x = (hash(i + 99) * W + Math.sin(now / 900 + i) * w.sway + W) % W;
            ctx.fillStyle = w.colors[i % w.colors.length];
            ctx.fillRect(snap(x), snap(y), w.size * P / 2 + P, w.size * P / 2 + P);
        }
        ctx.restore();
    }

    SM.modes = {
        MODES, SEASONS, season, seasonOf,
        next, after, board, current, stepMul, drawWeather,
        has: f => !!current()[f],
        gates: () => current().gates || null,
        get id() { return G.gameMode; },
    };
})();
