'use strict';
// The evolution counter: how many times the ghosts have molted into a fitter form (ghosts.js
// announces each one as 'evolve'). Counts this run and, in its own localStorage key, every
// run ever, so "it has evolved 10 more times" is a number rather than a feeling.
(() => {
    const { on, store } = SM.core;
    const KEY = 'snakeman-evo-total';
    let run = 0, total = +store.get(KEY) || 0;

    on('evolve', () => { run++; total++; store.set(KEY, String(total)); });

    SM.evo = {
        reset() { run = 0; },
        run: () => run,
        total: () => total,
        hudText: () => run + ' (' + total + ' ever)',
    };
})();
