// SNAKE-MAN · runlog
// A durable record of each run, for reading back later (by you or an AI).
// Every event is stamped with run time, score, lives and head position. Deaths carry a cause
// and a snapshot of what was nearby. The last 10 runs are kept in localStorage; press G on the
// game-over screen to save the latest run as a .json file.
'use strict';
(() => {
    const { on, store, tdist } = SM.core;
    const G = SM.G, D = SM.dial;
    const KEEP = 10, KEY = 'snakeman-runs';

    let run = null;

    function stamp(ev, data) {
        if (!run) return;
        const h = G.snake[0] || { x: -1, y: -1 };
        run.events.push({ t: Math.round(D.playedMs()), ev, score: G.score, lives: G.lives, at: [h.x, h.y], ...data });
    }

    // What surrounded the snake at a moment: direction, grace, bumpers, ghosts within 8 tiles.
    function snapshot() {
        const h = G.snake[0];
        return {
            dir: [G.direction.x, G.direction.y], invuln: Math.round(G.invuln), bumpers: G.bumpers,
            heat: +D.heat().toFixed(3), disguised: !!SM.coat.disguised,
            ghosts: G.ghosts.filter(g => g.active && tdist(g.x, g.y, h.x, h.y) < 8)
                .map(g => ({ name: g.name, state: g.state, at: [g.x, g.y], dist: +tdist(g.x, g.y, h.x, h.y).toFixed(1) })),
        };
    }

    function start() {
        run = { started: new Date().toISOString(), level: G.level, map: G.mapSeed, bumpers: G.bumpers, events: [] };
    }

    function finish(reason) {
        if (!run) return;
        stamp('end', { reason, ...snapshot() });
        Object.assign(run, { level: G.level, ended: new Date().toISOString(), reason, score: G.score, rung: SM.heal.rung + 1 });
        let runs = [];
        try { runs = JSON.parse(store.get(KEY) || '[]'); } catch (e) { runs = []; }
        runs.unshift(run);
        store.set(KEY, JSON.stringify(runs.slice(0, KEEP)));
        console.log('[runlog]', run);
    }

    function download() {
        let runs = [];
        try { runs = JSON.parse(store.get(KEY) || '[]'); } catch (e) { return; }
        if (!runs.length) return;
        const blob = new Blob([JSON.stringify(runs[0], null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'snake-man-run-' + runs[0].started.replace(/[:.]/g, '-') + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    on('hit', cause => stamp('hit', { cause, ...snapshot() }));
    on('bump', d => stamp('bump', d));
    on('ghostEaten', g => stamp('ghostEaten', { name: g && g.name }));
    on('prism', () => stamp('prism'));
    on('heal', () => stamp('heal', { rung: SM.heal.rung + 1 }));
    on('dash', () => stamp('dash'));

    SM.runlog = { start, finish, download, stamp };
})();
