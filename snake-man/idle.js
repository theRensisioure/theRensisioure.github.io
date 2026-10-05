// SNAKE-MAN · idle
// The idle layer: every point scored also pays out SCALES, a currency that outlives the run.
// Scales buy upgrades for the autopilot and for every run after. Time away pays too, at half
// the best rate an autoplayed run has earned lately, capped at 8 hours.
// The clicker part: tapping the game screen while a run plays fills the HEART meter, very
// slowly. A full meter is one more life; at the life cap it waits, full, until you lose one.
// The panel (scales, upgrades, the AUTO switch) is DOM, next to the canvas.
// IDLE is a game mode (modes.js), cycled with the others: the layer earns, taps and applies its
// upgrades only while that mode is picked, and the panel only shows there.
'use strict';
(() => {
    const { START_LIVES, MAX_LIVES, TIME_LIMIT_MS, store } = SM.core;
    const G = SM.G;

    const KEY = 'snakeman-idle';
    const SCALES_PER_POINT = 0.1;
    const AWAY_CAP_MS = 8 * 3600 * 1000, AWAY_RATE = 0.5, AWAY_MIN_MS = 60 * 1000;
    const RATES_KEPT = 5;              // the last few autoplayed runs set the offline rate
    const TAPS_PER_LIFE = 500;         // a life is a lot: the meter keeps its progress between runs

    // cost of the next level = base * grow^level
    const UPGRADES = [
        { id: 'sight', name: 'SIGHT', base: 40,  grow: 1.9, max: 5, tip: 'BOT SEES FARTHER, KEEPS MORE CLEAR' },
        { id: 'greed', name: 'GREED', base: 60,  grow: 1.7, max: 8, tip: '+25% SCALES PER POINT' },
        { id: 'dig',   name: 'DIG',   base: 50,  grow: 2.0, max: 4, tip: 'DIG COOLS 15% FASTER' },
        { id: 'lives', name: 'LIVES', base: 150, grow: 3.0, max: MAX_LIVES - START_LIVES, tip: '+1 LIFE AT THE START' },
    ];

    const saved = (() => { try { return JSON.parse(store.get(KEY)) || {}; } catch (e) { return {}; } })();
    const S = {
        scales: +saved.scales || 0,
        lv: Object.assign({ sight: 0, greed: 0, dig: 0, lives: 0 }, saved.lv),
        rates: Array.isArray(saved.rates) ? saved.rates : [],   // scales per minute of recent auto runs
        lastSeen: +saved.lastSeen || 0,
        autoOn: !!saved.autoOn,
        taps: +saved.taps || 0,        // toward the next life, 0..TAPS_PER_LIFE
    };
    let away = 0;                      // scales credited for time away, shown for a while
    let awayT = 0;

    function save() {
        S.lastSeen = Date.now();
        S.autoOn = !!(SM.auto && SM.auto.on);
        store.set(KEY, JSON.stringify(S));
    }

    const cost = u => Math.round(u.base * u.grow ** S.lv[u.id]);
    const greedMul = () => 1 + 0.25 * S.lv.greed;
    const active = () => SM.modes.id === 'idle';
    function apply() {
        G.bonusLives = active() ? S.lv.lives : 0;
        G.digCoolMul = active() ? 0.85 ** S.lv.dig : 1;
    }
    SM.core.on('gameMode', apply);
    function buy(id) {
        const u = UPGRADES.find(o => o.id === id);
        if (!u || S.lv[id] >= u.max || S.scales < cost(u)) return false;
        S.scales -= cost(u);
        S.lv[id]++;
        apply();
        save();
        return true;
    }

    // --- EARNING ---
    // Watch the score rather than the rules: whatever scores (pellets, ghosts, fruit) pays.
    let lastScore = 0, runEarned = 0, runAuto = true, lastMode = G.mode;
    function track() {
        if (G.score < lastScore) lastScore = 0;          // a new run
        if (!active()) { lastScore = G.score; runEarned = 0; lastMode = G.mode; return; }
        if (G.score > lastScore) {
            const got = (G.score - lastScore) * SCALES_PER_POINT * greedMul();
            S.scales += got; runEarned += got;
            lastScore = G.score;
        }
        if (G.mode === 'play' && SM.auto && SM.auto.handsOn) runAuto = false;   // you played part of it
        if (G.mode === 'over' && lastMode !== 'over') endRun();
        if (G.mode === 'ready' && lastMode !== 'ready') { runEarned = 0; runAuto = true; }
        lastMode = G.mode;
    }
    function endRun() {
        const mins = Math.max(0.5, (TIME_LIMIT_MS - G.timeLeft) / 60000);
        if (runAuto && SM.auto && SM.auto.on) {
            S.rates.push(+(runEarned / mins).toFixed(2));
            if (S.rates.length > RATES_KEPT) S.rates.shift();
        }
        runEarned = 0; runAuto = true;
        save();
    }

    // --- TAPPING ---
    // Only taps during play count, so the meter can't be filled from the start screen.
    function tap() {
        if (!active() || G.mode !== 'play' || S.taps >= TAPS_PER_LIFE) return;
        S.taps++;
        const h = G.snake[0];
        SM.fx.burst(h.x, h.y, { n: 2, colors: ['#ff3355', '#ff99aa'], speed: 1, up: 6, life: 450 });
        payHeart();
    }
    // A full meter pays out as soon as there's room under the life cap.
    function payHeart() {
        if (!active() || S.taps < TAPS_PER_LIFE || G.mode !== 'play' || G.lives >= MAX_LIVES) return;
        S.taps = 0;
        G.lives++;
        const h = G.snake[0];
        SM.fx.popup(h.x, h.y - 1, 'TAPPED +1', '#ff5577');
        SM.fx.burst(h.x, h.y, { n: 14, colors: ['#ff3355', '#ff99aa', '#fff'], speed: 2, up: 10, life: 800 });
        save();
    }

    // --- TIME AWAY ---
    function creditAway() {
        const gone = Date.now() - S.lastSeen;
        if (!S.lastSeen || !S.autoOn || !active() || gone < AWAY_MIN_MS || !S.rates.length) return;
        const rate = Math.max(...S.rates);
        away = Math.floor(rate * AWAY_RATE * Math.min(gone, AWAY_CAP_MS) / 60000);
        if (away > 0) { S.scales += away; awayT = 12000; }
    }

    // --- PANEL ---
    const $ = id => document.getElementById(id);
    const el = { scales: $('scales'), away: $('away'), ups: $('ups'), auto: $('btnAuto'), heart: $('heart'), heartBox: $('heartBox') };
    const btns = {};
    UPGRADES.forEach(u => {
        const b = document.createElement('button');
        b.className = 'up';
        b.title = u.tip;
        b.addEventListener('pointerdown', e => { e.preventDefault(); buy(u.id); });
        el.ups.appendChild(b);
        btns[u.id] = b;
    });
    el.auto.addEventListener('pointerdown', e => { e.preventDefault(); SM.auto.toggle(); });

    const setText = (e, t) => { if (e.innerText !== String(t)) e.innerText = t; };
    function panel(dt) {
        setText(el.scales, Math.floor(S.scales));
        awayT = Math.max(0, awayT - dt);
        setText(el.away, awayT > 0 ? '+' + away + ' AWAY' : '');
        const full = S.taps >= TAPS_PER_LIFE;
        setText(el.heart, full ? 'FULL' : S.taps + '/' + TAPS_PER_LIFE);
        el.heartBox.style.setProperty('--p', (100 * S.taps / TAPS_PER_LIFE).toFixed(1) + '%');
        el.heartBox.classList.toggle('full', full);
        UPGRADES.forEach(u => {
            const lv = S.lv[u.id], maxed = lv >= u.max, b = btns[u.id];
            setText(b, u.name + ' ' + lv + (maxed ? '  MAX' : '  ' + cost(u)));
            b.classList.toggle('broke', !maxed && S.scales < cost(u));
            b.classList.toggle('maxed', maxed);
        });
        const a = SM.auto;
        setText(el.auto, !a.on ? 'AUTO' : a.handsOn ? 'AUTO: YOU' : 'AUTO: ON');
        el.auto.classList.toggle('on', a.on);
    }

    let last = performance.now(), saveT = 0;
    function frame(now) {
        const dt = Math.min(250, now - last);
        last = now;
        track();
        payHeart();
        panel(dt);
        if ((saveT += dt) > 5000) { saveT = 0; save(); }
        requestAnimationFrame(frame);
    }

    apply();
    creditAway();
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
    requestAnimationFrame(frame);

    SM.idle = {
        UPGRADES, buy, save, cost, greedMul, tap,
        get scales() { return S.scales; },
        level: id => S.lv[id],
        get autoWasOn() { return S.autoOn; },
        get active() { return active(); },
    };
})();
