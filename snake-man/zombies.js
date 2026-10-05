// SNAKE-MAN · zombies
// ZOMBIES MODE, the third game mode (G on the start screen cycles CLASSIC / VOID / ZOMBIES).
// The ghosts are zombies now, and you have a gun.
//   SHOOTING  hold the trigger (R2 on a PS5 or Xbox pad, F on a keyboard, FIRE on touch) to fire
//             the way you're facing. One hit kills; the armored zombie is only knocked away.
//   POINTS    60 per zombie kill, 120 per stealth kill (in TURNCOAT disguise), 10 per dot.
//             Points are a wallet: you spend them at the gun gates.
//   AMMO      comes with every point you earn: lots per point at the start, fewer and fewer as
//             the run goes on (it halves every 90 seconds). You start with a pistol and 30 rounds.
//   GUN GATES gold-framed shops on the map. Drive in to buy what's on the sign, if you can pay:
//               SHOTGUN 500       one blast in all eight directions
//               AK-47 2000        fully automatic
//               JUGGERNOG 2500    take 3 more hits before it costs a life
//               FAST REVIVE 3000  three extra lives
//             A gun you already own sells you a box of ammo instead, for a fifth of its price.
// R (or Y on a pad) switches between the guns you own; buying one equips it.
// Emits: 'shot' ({ gun }), 'buy' ({ id }).
'use strict';
(() => {
    const { N, wrap, tdist, emit, on } = SM.core;
    const G = SM.G, M = SM.map, fx = SM.fx;

    const KILL_PTS = 60, STEALTH_PTS = 120, DOT_PTS = 10;
    const START_AMMO = 30;
    const AMMO_PER_POINT = 0.25;         // at the start: a zombie kill is worth 15 rounds...
    const AMMO_HALF_LIFE_MS = 90000;     // ...and half that every 90 seconds after
    const BULLET_SPEED = 30;             // tiles per second

    const GUNS = {
        pistol:  { name: 'PISTOL',  color: '#ddd',    rate: 320, range: 14, ammo: 1, dirs: 'face' },
        shotgun: { name: 'SHOTGUN', color: '#ffb347', rate: 650, range: 8,  ammo: 2, dirs: 'all' },
        ak47:    { name: 'AK-47',   color: '#ff5050', rate: 110, range: 16, ammo: 1, dirs: 'face' },
    };
    const SHOP = [
        { id: 'shotgun', name: 'SHOTGUN',     price: 500,  color: '#ffb347', gun: true },
        { id: 'ak47',    name: 'AK-47',       price: 2000, color: '#ff5050', gun: true },
        { id: 'jugg',    name: 'JUGGERNOG',   price: 2500, color: '#ff4466' },
        { id: 'revive',  name: 'FAST REVIVE', price: 3000, color: '#4fc3ff' },
    ];
    const AMMO_BOX = 30;                 // rounds in a box bought at the gate of a gun you own
    const EIGHT = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

    let gates = [];                      // { x, y, item }
    let bullets = [];                    // { x, y, dx, dy, left, color }
    let owned = [], gun = 'pistol', cool = 0, ammoAcc = 0;
    let held = { key: false, touch: false };
    let lastGate = null;                 // the gate you're standing in (a purchase per visit)

    const isOn = () => G.gameMode === 'zombies';

    function reset() {
        gates = []; bullets = []; owned = ['pistol']; gun = 'pistol'; cool = 0; ammoAcc = 0; lastGate = null;
        G.zpoints = 0; G.ammo = START_AMMO; G.armor = 0; G.perks = [];
        if (!isOn()) return;
        for (const item of SHOP) place(item);
    }

    function place(item) {
        const h = G.snake[0], r = M.domainRect() || { x: 0, y: 0, w: N, h: N };
        for (let tries = 0; tries < 1500; tries++) {
            const x = wrap(r.x + Math.floor(Math.random() * r.w)), y = wrap(r.y + Math.floor(Math.random() * r.h));
            if (M.isWall(x, y) || !M.inDomain(x, y) || SM.pellets.at(x, y)) continue;
            const minD = tries < 1000 ? 8 : 3;
            if (tdist(x, y, h.x, h.y) < minD || gates.some(g => tdist(g.x, g.y, x, y) < minD * 1.5)) continue;
            gates.push({ x, y, item });
            return;
        }
    }

    // --- POINTS AND AMMO ---
    function earn(pts, at) {
        if (!isOn() || G.mode !== 'play') return;
        G.zpoints += pts;
        const per = AMMO_PER_POINT * 0.5 ** (SM.dial.playedMs() / AMMO_HALF_LIFE_MS);
        ammoAcc += pts * per;
        const n = Math.floor(ammoAcc);
        ammoAcc -= n;
        G.ammo += n;
        if (at) fx.popup(at.x, at.y - 0.6, '+' + pts + (n ? ' (+' + n + ' AMMO)' : ''), '#9f6');
    }
    on('ghostKilled', k => earn(k.stealth ? STEALTH_PTS : KILL_PTS, k.g));
    on('eat', e => earn(DOT_PTS));

    // --- SHOOTING ---
    const triggerHeld = () => held.key || held.touch || SM.pad.allHeld().some(n => SM.pad.actionOf(n) === 'shoot');

    function fire() {
        const gn = GUNS[gun], h = G.snake[0];
        if (G.ammo < gn.ammo) {
            if (cool <= 0) fx.popup(h.x, h.y - 1, 'NO AMMO', '#777');
            cool = 400;
            return;
        }
        G.ammo -= gn.ammo;
        cool = gn.rate;
        const dirs = gn.dirs === 'all' ? EIGHT : [[G.direction.x, G.direction.y]];
        for (const [dx, dy] of dirs) {
            const m = Math.hypot(dx, dy);
            bullets.push({ x: h.x, y: h.y, dx: dx / m, dy: dy / m, left: gn.range, color: gn.color });
        }
        fx.burst(h.x + G.direction.x * 0.5, h.y + G.direction.y * 0.5, { n: 3, colors: ['#fff', '#ffd27f'], speed: 1.5, up: 3, life: 200 });
        emit('shot', { gun });
    }

    function nextGun() {
        if (!isOn() || G.mode !== 'play' || owned.length < 2) return;
        gun = owned[(owned.indexOf(gun) + 1) % owned.length];
        const h = G.snake[0];
        fx.popup(h.x, h.y - 1, GUNS[gun].name, GUNS[gun].color);
    }

    // Bullets fly in half-tile hops, so nothing fast slips between them.
    function moveBullets(dt) {
        const hop = 0.5;
        let dist = BULLET_SPEED * dt / 1000;
        for (const b of bullets) {
            for (let d = dist; d > 0 && b.left > 0; d -= hop) {
                const s = Math.min(hop, d);
                b.x += b.dx * s; b.y += b.dy * s; b.left -= s;
                const tx = wrap(Math.round(b.x)), ty = wrap(Math.round(b.y));
                if (M.isWall(tx, ty)) {
                    fx.burst(b.x, b.y, { n: 3, colors: ['#9a9aff', '#fff'], speed: 1.5, up: 3, life: 250 });
                    b.left = 0;
                    break;
                }
                const z = G.ghosts.find(g => g.active && !g.traitor && g.x === tx && g.y === ty);
                if (z) { SM.special.kill(z, 'shot'); b.left = 0; break; }
            }
        }
        bullets = bullets.filter(b => b.left > 0);
    }

    // --- GUN GATES ---
    function visit(gt) {
        const it = gt.item, h = G.snake[0];
        const box = it.gun && owned.includes(it.id);
        const perkOwned = !it.gun && G.perks.includes(it.id);
        const price = box ? Math.round(it.price / 5) : it.price;
        if (perkOwned) { fx.popup(h.x, h.y - 1, it.name + ' OWNED', '#777'); return; }
        if (G.zpoints < price) { fx.popup(h.x, h.y - 1, (box ? 'AMMO ' : it.name + ' ') + price + ' PTS', '#f66'); return; }
        G.zpoints -= price;
        if (box) G.ammo += AMMO_BOX;
        else if (it.gun) { owned.push(it.id); gun = it.id; G.ammo += AMMO_BOX; }
        else if (it.id === 'jugg') { G.perks.push('jugg'); G.armor += 3; }
        else if (it.id === 'revive') { G.perks.push('revive'); G.lives += 3; }
        fx.popup(h.x, h.y - 1.5, box ? '+' + AMMO_BOX + ' AMMO' : it.name + '!', it.color);
        fx.burst(h.x, h.y, { n: 18, colors: [it.color, '#FFD700', '#fff'], speed: 3, up: 9, life: 800 });
        emit('buy', { id: box ? 'ammo' : it.id });
    }

    function update(dt) {
        if (!isOn()) return;
        cool = Math.max(0, cool - dt);
        if (cool <= 0 && triggerHeld() && !SM.dash.busy) fire();
        moveBullets(dt);
        const h = G.snake[0];
        const gt = h.under ? null : gates.find(o => o.x === h.x && o.y === h.y);
        if (gt && gt !== lastGate) visit(gt);
        lastGate = gt || null;
    }

    // JUGGERNOG: a hit spends armor instead of a life. Returns true if armor took it.
    function absorb() {
        if (!isOn() || G.armor <= 0) return false;
        G.armor--;
        const h = G.snake[0];
        fx.popup(h.x, h.y - 1, G.armor ? 'JUGGERNOG ' + G.armor + ' LEFT' : 'JUGGERNOG GONE', '#ff4466');
        return true;
    }

    // --- DRAWING ---
    function drawGates(now) {
        if (!isOn()) return;
        const { ctx, sx, sy, snap, onScreen, P } = SM.view, { pixelText } = SM.gfx, s = SM.core.GRID_SIZE;
        for (const gt of gates) {
            if (!onScreen(gt.x, gt.y)) continue;
            const it = gt.item, L = snap(sx(gt.x) - s / 2), T = snap(sy(gt.y) - s / 2);
            const glow = Math.floor(now / 200) % 2;
            ctx.save();
            ctx.fillStyle = glow ? '#FFD700' : '#b8860b';                  // the gold frame
            ctx.fillRect(L - P, T - 3 * P, s + 2 * P, 2 * P);
            ctx.fillRect(L - P, T - 3 * P, 2 * P, s + 3 * P);
            ctx.fillRect(L + s - P, T - 3 * P, 2 * P, s + 3 * P);
            ctx.fillStyle = it.color;                                       // what it sells
            ctx.globalAlpha = 0.35 + 0.2 * glow;
            ctx.fillRect(L + P, T - P, s - 2 * P, s + P);
            ctx.restore();
            const owns = it.gun ? owned.includes(it.id) : G.perks.includes(it.id);
            const sign = it.gun && owns ? 'AMMO ' + Math.round(it.price / 5) : owns ? 'OWNED' : it.name + ' ' + it.price;
            pixelText(sign, sx(gt.x), T - 5 * P, 8, owns && !it.gun ? '#777' : it.color, '#000');
        }
    }

    function drawBullets() {
        if (!bullets.length) return;
        const { ctx, sx, sy, snap, onScreen, P } = SM.view;
        for (const b of bullets) {
            if (!onScreen(b.x, b.y)) continue;
            ctx.fillStyle = b.color;
            ctx.fillRect(snap(sx(b.x)) - P, snap(sy(b.y)) - P, 2 * P, 2 * P);
            ctx.globalAlpha = 0.45;
            ctx.fillRect(snap(sx(b.x - b.dx * 0.5)) - P / 2, snap(sy(b.y - b.dy * 0.5)) - P / 2, P, P);
            ctx.globalAlpha = 1;
        }
    }

    function drawMinimap(ox, oy, s) {
        if (!isOn()) return;
        const { ctx } = SM.view;
        for (const gt of gates) { ctx.fillStyle = gt.item.color; ctx.fillRect(ox + gt.x * s - 2, oy + gt.y * s - 2, 5, 5); }
    }

    // Zombies look the part: every ghost's colour rots toward green.
    const ROT = { '#FF0000': '#7a9a3a', '#FFB8FF': '#9ab86a', '#00FFFF': '#5aa070', '#FFB800': '#a0a040' };
    const tint = col => isOn() ? (ROT[col] || '#6a8a3a') : col;

    const hudText = () => GUNS[gun].name + ' ' + G.ammo + ' · ' + G.zpoints + ' PTS'
        + (G.armor ? ' · JUGG ' + G.armor : '');

    SM.zombies = {
        GUNS, SHOP, KILL_PTS, STEALTH_PTS,
        reset, update, nextGun, absorb, drawGates, drawBullets, drawMinimap, tint, hudText,
        setKey: d => { held.key = d; }, setTouch: d => { held.touch = d; },
        get on() { return isOn(); },
        get gun() { return gun; },
        get owned() { return owned; },
        get gates() { return gates; },
    };
})();
