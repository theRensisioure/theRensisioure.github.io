// SNAKE-MAN · state
// The run's shared state (G) and the silent difficulty dial every system reads from.
// Systems keep their own private state; only what several of them touch lives on G.
'use strict';
(() => {
    const { TIME_LIMIT_MS, START_LIVES, lerp, clamp01, smooth } = SM.core;

    // --- LEVELS ---
    // A level scales how fast the hidden dial climbs (rate) and how high it can go (cap).
    const LEVELS = {
        easy:   { rate: 0.45, cap: 0.4, bumpers: 5 },   // bumpers: wall hits that auto-turn instead of costing a life
        normal: { rate: 1,    cap: 1,   bumpers: 0 },
        hard:   { rate: 1.6,  cap: 1,   bumpers: 0 },
    };
    const LEVEL_ORDER = ['easy', 'normal', 'hard'];
    const urlLevel = new URLSearchParams(location.search).get('level');
    const startLevel = LEVELS[urlLevel] ? urlLevel : (LEVELS[SM.core.store.get('snakeman-level')] ? SM.core.store.get('snakeman-level') : 'normal');
    const hiKey = level => level === 'normal' ? 'snakeman-hi' : 'snakeman-hi-' + level;   // normal keeps the old key

    const G = {
        level: startLevel,
        bumpers: 0,             // wall bounces left this run (Easy only)
        mode: 'ready',          // ready | play | paused | over
        overReason: '',
        mapSeed: 0,
        score: 0,
        hi: 0,                  // best on your skill tier's board (scores.js)
        board: null,            // where the last run landed: { tier, rank }
        lives: START_LIVES,
        timeLeft: TIME_LIMIT_MS,
        eaten: 0,               // pellets eaten this run (opens the zones)
        snake: [],              // [head, ..., tail] of { x, y, under?, tun?, entry? }
        direction: { x: 0, y: -1 },
        inputQueue: [],
        ghosts: [],
        invuln: 0,              // ms of post-hit grace
        flash: 0,               // red hit flash, 0..1
        prism: 0,               // ms left on a rainbow pellet
        prismChain: 0,          // ghosts eaten during this prism (each worth double the last)
        boost: 0,               // ms left on a fruit's double score
        freezeT: 0,             // ms left on each special skill (special.js)
        bane: 0,
        rainbowT: 0,
        voidT: 0,               // ms left in the VOID (voidmode.js)
        gameMode: 'classic',    // classic | void | seasonal (modes.js remembers the choice)
        run: { dodges: 0, kills: 0, stealth: 0 },   // this run's counts, for the record boards
        result: null,           // how the last run went for its player: { name, xp, level }
        opts: { derivs: true, minimap: true, occlusion: true, crt: true },
        bonusLives: 0,          // idle upgrades (idle.js): extra lives at the start of a run...
        digCoolMul: 1,          // ...and a shorter DIG cooldown
    };

    // --- SILENT DIFFICULTY ---
    // One hidden dial, 0 → 1, fed by elapsed time and score. It only ever rises, it is never
    // announced, and every speed, range and wind-up in the game reads from it.
    const playedMs = () => TIME_LIMIT_MS - G.timeLeft;
    function heat() {
        const played = playedMs() / 240000;                                // full heat by the 4-minute mark...
        const L = LEVELS[G.level];
        return Math.min(L.cap, clamp01(L.rate * (0.75 * played + 0.25 * Math.min(1, G.score / 600)))); // ...sooner if you score well
    }
    const heatE = () => smooth(0, 1, heat());                              // eased: a long, slow opening

    // The player starts slow and reaches full speed within the first couple of minutes.
    const playerStepMs = () => lerp(150, 100, smooth(0, 0.45, heat()));
    const lungeStepMs  = () => lerp(110, 78, heatE());
    const maxAttackers = () => heatE() < 0.3 ? 1 : heatE() < 0.7 ? 2 : 3;

    // Every point scored goes through here, so the fruit's double-score window applies everywhere.
    function award(pts) {
        const p = G.boost > 0 ? pts * 2 : pts;
        G.score += p;
        return p;
    }

    // Step to the next level (only between runs).
    function cycleLevel() {
        G.level = LEVEL_ORDER[(LEVEL_ORDER.indexOf(G.level) + 1) % LEVEL_ORDER.length];
        SM.core.store.set('snakeman-level', G.level);
        G.hi = SM.scores.best();   // the board for your skill tier (scores.js)
        G.bumpers = LEVELS[G.level].bumpers;
    }

    SM.G = G;
    SM.award = award;
    SM.dial = { LEVELS, hiKey, cycleLevel, playedMs, heat, heatE, playerStepMs, lungeStepMs, maxAttackers };
})();
