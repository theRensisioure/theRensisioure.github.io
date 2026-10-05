// SNAKE-MAN · lunge
// DASH, the snake's own lunge: unlocked by SPEED tier 5 on the upgrades screen (upgrades.js).
// Z (R1 on a pad, DASH on touch) throws you forward fast in a straight line, the way the
// ghosts lunge at you. While it lasts your whole body is a weapon: any ghost your head or tail
// touches dies instantly (the armored one is banished), and nothing can hurt you. A dash stops
// short of walls and of your own body. No limit on dashes, just a 2-second cooldown.
// Called "lunge" in code because "dash" already means DIG (dash.js).
// Emits: 'lunge' (you set off), 'lunged' ({ kills }) when it ends.
'use strict';
(() => {
    const { wrap, emit, on } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;

    const LUNGE_TILES = 8;      // how far a dash goes
    const STEP_MS = 32;         // per tile: as fast as a ghost's lunge
    const COOL_MS = 2000;
    const COLOR = '#ffe066';

    let run = null;             // { dir, left, acc, kills }
    let cool = 0;
    let trail = [];             // the head's last few spots, for afterimages

    const unlocked = () => SM.profile.tier('speed') >= SM.upgrades.MAX;

    function reset() { run = null; cool = 0; trail = []; }

    function start() {
        if (G.mode !== 'play' || run || SM.dash.busy || !unlocked()) return false;
        const h = G.snake[0];
        if (cool > 0) { fx.popup(h.x, h.y - 1, 'DASH ' + (cool / 1000).toFixed(1) + 's', '#777'); return false; }
        if (G.inputQueue.length) G.direction = G.inputQueue.shift();   // arrow + Z dashes the new way
        run = { dir: { x: G.direction.x, y: G.direction.y }, left: LUNGE_TILES, acc: 0, kills: 0 };
        trail = [];
        fx.burst(h.x, h.y, { n: 8, colors: [COLOR, '#fff'], speed: 2.5, up: 4, life: 350, dir: { x: -run.dir.x, y: -run.dir.y }, spread: 1.2 });
        emit('lunge');
        return true;
    }

    // Anything sharing a tile with any part of the snake dies.
    function strike() {
        for (const g of G.ghosts) {
            if (!g.active || g.traitor) continue;
            if (G.snake.some(s => !s.under && s.x === g.x && s.y === g.y)) {
                SM.special.kill(g, 'lunge');
                if (!g.active) run.kills++;
            }
        }
    }

    // The player's movement is ours while a dash runs (player.update hands over, as for DIG).
    function update(dt) {
        run.acc += dt;
        while (run && run.acc >= STEP_MS) {
            run.acc -= STEP_MS;
            const h = G.snake[0], d = run.dir;
            const nx = wrap(h.x + d.x), ny = wrap(h.y + d.y);
            const body = G.snake.slice(0, -1).some(s => !s.under && s.x === nx && s.y === ny);
            if (M.isWall(nx, ny) || body) { end(); break; }
            trail.unshift({ x: h.x, y: h.y });
            if (trail.length > 4) trail.pop();
            SM.player.advance(d);
            strike();
            if (--run.left <= 0) end();
        }
    }

    function end() {
        const h = G.snake[0];
        if (run.kills > 1) fx.popup(h.x, h.y - 1.5, run.kills + 'x DASH KILL!', COLOR);
        emit('lunged', { kills: run.kills });
        run = null;
        cool = COOL_MS;
        setTimeout(() => { trail = []; }, 120);
    }

    function tick(dt) { cool = Math.max(0, cool - dt); }

    // Afterimages of the head, like a ghost's lunge trail.
    function draw() {
        if (!trail.length) return;
        const { ctx, sx, sy, snap, onScreen } = SM.view, s = SM.core.GRID_SIZE;
        const spr = SM.gfx.pacSprite(SM.core.dirIndex(G.direction), 1);
        trail.forEach((p, i) => {
            if (!onScreen(p.x, p.y)) return;
            ctx.globalAlpha = 0.45 - i * 0.1;
            ctx.drawImage(spr, snap(sx(p.x) - s / 2), snap(sy(p.y) - s / 2));
        });
        ctx.globalAlpha = 1;
    }

    on('placed', () => { run = null; });

    SM.lunge = {
        LUNGE_TILES, COOL_MS,
        reset, start, update, tick, draw, unlocked,
        get busy() { return !!run; },
        get cool() { return cool; },
    };
})();
