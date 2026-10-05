// SNAKE-MAN · dual
// Two screens (the AYN Thor): the top screen shows only the game, drawn wide (core.js CW), and
// the lower screen shows everything else: the run's numbers, what each button does right now,
// the start / pause / game-over text and the skill sheet, and whichever panel is open (controls,
// scores, upgrades, name). The app owns the lower screen (MainActivity's InfoScreen, a page of its
// own: snake-man/info.html) and says so through SnakeManApp.dual(); this module sends it what to
// show, and takes its taps back (tap()), so the panels work by touch down there too.
// ?dual=1 forces the two-screen top in a browser, to try the layout without a Thor.
'use strict';
(() => {
    const html = document.documentElement;
    const app = window.SnakeManApp;
    const on = SM.core.DUAL;
    const stats = document.querySelector('.stats');
    let last = '';

    const openPanel = () => [...document.querySelectorAll('.padmenu')].find(el => !el.hidden);

    function payload() {
        const m = SM.modes.current(), G = SM.G, panel = openPanel();
        return JSON.stringify({
            stats: stats ? stats.innerHTML : '',
            mode: m.title, color: m.color, state: G.mode,
            blurb: typeof m.blurb === 'function' ? m.blurb() : m.blurb || '',
            device: SM.pad.device, family: SM.pad.family,
            legend: SM.pad.legend(),
            overlay: G.mode === 'play' ? [] : SM.render.overlay.map(([text, size, color]) => [text, size, color]),
            skills: G.mode === 'play' ? [] : SM.skills.rows(),
            panel: panel ? { cls: panel.className, html: panel.innerHTML } : null,
            menu: G.mode === 'play' ? null : menu(m),
        });
    }

    // The start / pause / game-over screen as data. The game-over lines that render.js composes
    // (board, XP, record) are taken from its overlay as drawn.
    function menu(m) {
        const G = SM.G, P = SM.profile, ov = SM.render.overlay;
        const line = i => (ov[i] && ov[i][0] ? { text: ov[i][0], color: ov[i][2] } : null);
        return {
            screen: G.mode, level: G.level, map: G.mapSeed,
            mode: { title: m.title, color: m.color, blurb: typeof m.blurb === 'function' ? m.blurb() : m.blurb },
            player: { name: P.name, level: P.level(), progress: P.progress(), points: P.points() },
            over: G.mode !== 'over' ? null : {
                reason: G.overReason, score: G.score, rung: SM.heal.rung + 1, missions: SM.missions.done,
                board: line(3), xp: line(4), record: line(5),
            },
        };
    }

    // A tap on the lower screen's copy of a panel: click the same cell up here.
    function tap(text) {
        const t = JSON.parse(text), panel = openPanel();
        if (!panel) return;
        const sel = '[data-r="' + t.r + '"]' + (t.c === undefined || t.c === null ? '' : '[data-c="' + t.c + '"]');
        const cell = panel.querySelector(sel) || panel.querySelector('[data-r="' + t.r + '"]');
        if (cell) cell.click();
    }

    html.classList.toggle('dual', on);
    if (on) {
        setInterval(() => {
            if (!app || !app.info) return;
            const p = payload();
            if (p !== last) { last = p; app.info(p); }
        }, 150);
    }

    // The app opened a fresh lower screen: send it everything again.
    const resend = () => { last = ''; };

    SM.dual = { on, payload, tap, resend };
})();
