// SNAKE-MAN · upgrades
// UPGRADES. Every player level past 1 is an upgrade point (profile.js), spent here on
// permanent improvements for that player, five tiers each:
//   SPEED    you move faster; tier 5 also unlocks DASH, the snake's own lunge (lunge.js)
//   STEALTH  TURNCOAT cover lasts longer and ghosts grow suspicious slower, so there's more
//            time to line up a stealth kill; tier 5 is GHOST FORM: ghosts never grow suspicious
//            (only the armored one can still bust you) and every stealth kill refills your cover
//   XP       every dot and orb is worth more XP; tier 5 is COMBO: dots eaten within 2s of each
//            other chain, and every 5 in a chain adds +1 to an XP multiplier (up to x5)
// Opens with I, the UPGRADES row on the controller screen, or from the start and game-over
// screens. Points can't be refunded.
'use strict';
(() => {
    const G = SM.G, PR = SM.profile;

    const MAX = 5;
    const UPGRADES = [
        { id: 'speed',   name: 'SPEED',   color: '#FFD700', per: t => t === 4 ? 'MOVE 5% FASTER + UNLOCK DASH' : 'MOVE 5% FASTER',
          label: t => 'SPEED +' + 5 * t + '%' + (t >= 5 ? ' + DASH (KILLS ON TOUCH, 2s COOLDOWN)' : '') },
        { id: 'stealth', name: 'STEALTH', color: '#b89cff', per: t => '+1.5s COVER, SUSPICION 12% SLOWER' + (t === 4 ? ' + GHOST FORM' : ''),
          label: t => 'COVER +' + (1.5 * t).toFixed(1) + 's  SUSPICION -' + 12 * t + '%' + (t >= 5 ? ' + GHOST FORM (NO SUSPICION, KILLS REFILL COVER)' : '') },
        { id: 'xp',      name: 'XP',      color: '#0ff',    per: t => '+1 XP PER DOT, +5 PER ORB' + (t === 4 ? ' + COMBO' : ''),
          label: t => 'DOT ' + (1 + t) + ' XP  ORB ' + (5 + 5 * t) + ' XP' + (t >= 5 ? ' + COMBO (CHAIN DOTS, UP TO x5 XP)' : '') },
    ];

    // What the rules read back.
    const stepMul = () => 1 / (1 + 0.05 * PR.tier('speed'));            // player step time
    const coverMs = () => 1500 * PR.tier('stealth');                      // added to TURNCOAT
    const suspicionMul = () => 1 - 0.12 * PR.tier('stealth');
    const eatXp = rainbow => PR.tier('xp') * (rainbow ? 5 : 1);           // added to each dot / orb
    const ghostForm = () => PR.tier('stealth') >= MAX;                    // coat.js: no suspicion

    // XP tier 5, COMBO: each dot or orb eaten within COMBO_MS of the last extends a chain; every
    // COMBO_STEP in the chain adds 1 to the XP multiplier, up to x5. comboHit() is called once per
    // eat (profile.js) and returns the multiplier for that eat.
    const COMBO_MS = 2000, COMBO_STEP = 5, COMBO_MAX = 5;
    let chain = 0, comboT = 0;
    const comboMul = () => PR.tier('xp') >= MAX ? Math.min(COMBO_MAX, 1 + Math.floor(chain / COMBO_STEP)) : 1;
    function comboHit(at) {
        if (PR.tier('xp') < MAX) return 1;
        const before = comboMul();
        chain++; comboT = COMBO_MS;
        const m = comboMul();
        if (m > before && at) SM.fx.popup(at.x, at.y - 1, 'COMBO x' + m, '#0ff');
        return m;
    }
    const comboReset = () => { chain = 0; comboT = 0; };
    function tick(dt) { if (comboT > 0 && (comboT -= dt) <= 0) chain = 0; }

    // --- THE SCREEN (styled like the controller screen) ---
    const el = document.createElement('div');
    el.className = 'padmenu upgrades';
    el.hidden = true;
    document.body.appendChild(el);
    let open = false, cur = 0, note = '';

    function show() {
        if (open) return;
        for (const s of [SM.padmenu, SM.scores, SM.names]) if (s.open) s.hide();
        open = true; note = '';
        if (G.mode === 'play') G.mode = 'paused';
        el.hidden = false;
        render();
    }
    function hide() { open = false; el.hidden = true; }
    const toggle = () => open ? hide() : show();

    function buy(i) {
        const u = UPGRADES[i];
        if (!u) { hide(); return; }                  // the CLOSE row
        if (PR.tier(u.id) >= MAX) note = u.name + ' IS MAXED';
        else if (!PR.buy(u.id)) note = 'NO POINTS - LEVEL UP TO EARN MORE';
        else note = u.name + ' TIER ' + PR.tier(u.id) + '!' + (PR.tier(u.id) === MAX ? ' ' + ({ speed: 'DASH', stealth: 'GHOST FORM', xp: 'COMBO' })[u.id] + ' UNLOCKED' : '');
        render();
    }

    function render() {
        if (!open) return;
        let h = '<div class="pm-title">UPGRADES</div>';
        h += `<div class="pm-dev">${PR.name} · LV ${PR.level()} · <span style="color:#3f6">${PR.points()} POINT${PR.points() === 1 ? '' : 'S'}</span></div>`;
        UPGRADES.forEach((u, i) => {
            const t = PR.tier(u.id);
            const pips = Array.from({ length: MAX }, (_, k) => `<i class="${k < t ? 'on' : ''}" style="${k < t ? 'background:' + u.color : ''}"></i>`).join('');
            h += `<div class="pm-row up-row${i === cur ? ' sel' : ''}" data-i="${i}">`
               + `<span style="color:${u.color}">${u.name}</span><span class="up-pips">${pips}</span></div>`
               + `<div class="up-sub">${t ? u.label(t) : 'NOT YET'}${t < MAX ? ' · NEXT: ' + u.per(t) : ''}</div>`;
        });
        h += `<div class="pm-row${cur === UPGRADES.length ? ' sel' : ''}" data-i="${UPGRADES.length}"><span>CLOSE</span><span></span></div>`;
        h += `<div class="pm-note">${note}</div>`;
        h += `<div class="pm-hint">${SM.pad.active ? 'A BUY · B CLOSE' : 'ENTER BUY · ESC CLOSE · OR TAP'}</div>`;
        el.innerHTML = h;
    }
    const move = d => { cur = (cur + d + UPGRADES.length + 1) % (UPGRADES.length + 1); note = ''; render(); };

    function onPress(name) {
        if (!open) return false;
        if (name === 'UP' || name === 'LS_UP') move(-1);
        else if (name === 'DOWN' || name === 'LS_DOWN') move(1);
        else if (name === 'A' || name === 'START') buy(cur);
        else if (name === 'B' || name === 'SELECT' || ['upgrades', 'gun'].includes(SM.pad.actionOf(name))) hide();
        return true;
    }
    function key(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!open) {
            if (k === 'i' && !SM.padmenu.open && !SM.scores.open && !SM.names.open) { show(); return true; }
            return false;
        }
        e.preventDefault();
        if (k === 'ArrowUp' || k === 'w') move(-1);
        else if (k === 'ArrowDown' || k === 's') move(1);
        else if (k === 'Enter' || k === ' ') buy(cur);
        else if (k === 'Escape' || k === 'i') hide();
        return true;
    }
    el.addEventListener('click', e => {
        const t = e.target.closest('[data-i]');
        if (!t) return;
        cur = +t.dataset.i;
        buy(cur);
    });

    SM.upgrades = { UPGRADES, MAX, stepMul, coverMs, suspicionMul, eatXp, ghostForm, comboHit, comboMul, comboReset, tick, show, hide, toggle, onPress, key, get open() { return open; } };
})();
