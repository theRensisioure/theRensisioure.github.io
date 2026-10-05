// SNAKE-MAN · pad
// Game controllers. Every physical input gets one plain name (A, B, X, Y, L1, R1, L2, R2,
// START, SELECT, L3, R3, HOME, UP/DOWN/LEFT/RIGHT for the d-pad, LS_UP.. and RS_UP.. for the
// sticks; anything unrecognised is BTN7, AXIS4+, K188...), and a binding maps each game action
// to up to two names. The bindings live in localStorage and are edited in the controller
// screen (padmenu.js).
//
// Two sources feed the names:
//   the browser Gamepad API, polled every frame (desktop, phone browsers);
//   the Android app, whose activity takes the controller's keys and axes before the WebView
//   sees them and calls SM.pad.nativeKey / nativeAxes (the WebView's own gamepad support is
//   patchy, and handheld d-pads often arrive as keys rather than a gamepad).
// A name is "down" while any source holds it; actions fire on the press.
//
// One layout for every controller, by position (bottom / right / left / top face button). Each
// action belongs to a context: 'play' (a run is on or paused), 'menu' (the start and game-over
// screens) or 'any'. A button can carry one play action and one menu action at once; by default
// the menu ones sit on the same buttons as the touch pad's doubling (A LEVEL, B NEW MAP, X GAME
// MODE, Y PLAYER NAME, L1 UPGRADES, R1 HIGH SCORES, START PLAY), and each can be bound apart.
// Names stay positional (A is the bottom button on Xbox, PlayStation, Backbone and the Thor);
// only the hints are drawn with the labels printed on the controller in hand (glyph()).
'use strict';
(() => {
    const { DIRS, store } = SM.core;
    const G = SM.G;
    const html = document.documentElement;
    const inApp = new URLSearchParams(location.search).has('app') || navigator.userAgent.includes('SnakeManApp');

    // --- ACTIONS AND BINDINGS ---
    // label: in play / on the start and game-over screens (one word when it doesn't change).
    const ACTIONS = [
        { id: 'up',      ctx: 'any',  label: 'UP' },
        { id: 'down',    ctx: 'any',  label: 'DOWN' },
        { id: 'left',    ctx: 'any',  label: 'LEFT' },
        { id: 'right',   ctx: 'any',  label: 'RIGHT' },
        { id: 'dig',     ctx: 'play', label: 'DIG' },
        { id: 'coat',    ctx: 'play', label: 'TURNCOAT' },
        { id: 'skill',   ctx: 'play', label: 'SPECIAL SKILL' },
        { id: 'swap',    ctx: 'play', label: 'SWAP SKILL' },
        { id: 'lunge',   ctx: 'play', label: 'DASH' },
        { id: 'gun',     ctx: 'play', label: 'NEXT GUN' },
        { id: 'shoot',   ctx: 'play', label: 'SHOOT (ZOMBIES)' },
        { id: 'zoom',    ctx: 'play', label: 'ZOOM' },
        { id: 'pause',   ctx: 'play', label: 'PAUSE' },
        { id: 'level',   ctx: 'menu', label: 'LEVEL' },
        { id: 'newmap',  ctx: 'menu', label: 'NEW MAP' },
        { id: 'mode',    ctx: 'menu', label: 'GAME MODE' },
        { id: 'name',    ctx: 'menu', label: 'PLAYER NAME' },
        { id: 'upgrades', ctx: 'menu', label: 'UPGRADES' },
        { id: 'scores',  ctx: 'menu', label: 'HIGH SCORES' },
        { id: 'play',    ctx: 'menu', label: 'PLAY / SAME MAP' },
        { id: 'menu',    ctx: 'any',  label: 'CONTROLS' },
    ];
    const DEFAULTS = {
        up: ['UP', 'LS_UP'], down: ['DOWN', 'LS_DOWN'], left: ['LEFT', 'LS_LEFT'], right: ['RIGHT', 'LS_RIGHT'],
        dig: ['A', null], coat: ['B', null], skill: ['X', null], swap: ['Y', null],
        lunge: ['R1', null], gun: ['L1', null], shoot: ['R2', null], zoom: ['L2', null], pause: ['START', null],
        level: ['A', null], newmap: ['B', null], mode: ['X', null], name: ['Y', null],
        upgrades: ['L1', null], scores: ['R1', null], play: ['START', null],
        menu: ['SELECT', null],
    };
    const ctxOf = id => (ACTIONS.find(a => a.id === id) || {}).ctx;
    // Two actions can't share a button when they can both be live at once.
    const clash = (a, b) => a === 'any' || b === 'any' || a === b;
    // v3: menu actions bound on their own. Older saves are left behind rather than half-mixed.
    const KEY = 'snakeman-pad-v3';
    const copy = o => JSON.parse(JSON.stringify(o));

    let cfg = load();   // { bind: { action: [name|null, name|null] }, dead: 0.2..0.8 }
    function load() {
        const out = { bind: copy(DEFAULTS), dead: 0.4 };
        try {
            const s = JSON.parse(store.get(KEY) || '{}');
            if (s.bind) {
                const saved = ACTIONS.filter(a => Array.isArray(s.bind[a.id]));
                for (const a of saved) out.bind[a.id] = [0, 1].map(i => typeof s.bind[a.id][i] === 'string' ? s.bind[a.id][i] : null);
                // An action added since this save (DASH, SHOOT...) only gets the default buttons the
                // save hasn't already given to something else; otherwise one button would be bound
                // twice and only the first action would ever fire.
                for (const a of ACTIONS) {
                    if (s.bind[a.id]) continue;
                    const taken = new Set(saved.filter(o => clash(o.ctx, a.ctx)).flatMap(o => out.bind[o.id]).filter(Boolean));
                    out.bind[a.id] = out.bind[a.id].map(n => n && taken.has(n) ? null : n);
                }
            }
            if (Number.isFinite(s.dead)) out.dead = Math.min(0.8, Math.max(0.2, s.dead));
        } catch (e) {}
        return out;
    }
    const save = () => store.set(KEY, JSON.stringify(cfg));

    // Put name in (action, slot), taking it off anything else that could be live at the same time.
    function bind(action, slot, name) {
        const c = ctxOf(action);
        if (name) for (const a of ACTIONS) if (clash(a.ctx, c)) cfg.bind[a.id] = cfg.bind[a.id].map(n => n === name ? null : n);
        cfg.bind[action][slot] = name;
        save();
    }
    function resetBinds() { cfg.bind = copy(DEFAULTS); save(); }
    function setDead(v) { cfg.dead = Math.round(Math.min(0.8, Math.max(0.2, v)) * 20) / 20; save(); }
    // The action a name fires right now: the menu's on the start and game-over screens, else play's.
    const context = () => (SM.G.mode === 'ready' || SM.G.mode === 'over') ? 'menu' : 'play';
    function actionOf(name, ctx = context()) {
        for (const a of ACTIONS) if ((a.ctx === ctx || a.ctx === 'any') && cfg.bind[a.id].includes(name)) return a.id;
        return null;
    }
    // The first thing bound to an action, for on-screen hints, as the controller in hand prints it.
    const label = id => glyph(cfg.bind[id].find(Boolean)) || '—';

    // --- WHAT THE CONTROLLER CALLS ITS BUTTONS ---
    // family: 'xbox' (Xbox, Backbone), 'ps' (DualSense / DualShock), 'handheld' (AYN Thor and
    // friends), or '' (anything else: plain names). Guessed from the device name and USB ids.
    const GLYPHS = {
        xbox: { L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT', L3: 'LS', R3: 'RS', START: 'MENU', SELECT: 'VIEW', HOME: 'XBOX' },
        ps: { A: '✕', B: '○', X: '□', Y: '△', START: 'OPTIONS', SELECT: 'CREATE', HOME: 'PS' },
        handheld: {},
    };
    let family = '';
    function familyOf(name = '', vendor = '') {
        const n = (name + ' ' + vendor).toLowerCase();
        if (/dualsense|dualshock|playstation|sony|054c/.test(n)) return 'ps';
        if (/xbox|microsoft|045e|backbone|xinput/.test(n)) return 'xbox';
        if (/^wireless controller/.test(n.trim())) return 'ps';   // Android's own name for a Sony pad
        if (/ayn|thor|odin|retroid|anbernic|handheld/.test(n)) return 'handheld';
        return '';
    }
    function glyph(name) {
        if (!name) return name;
        const g = GLYPHS[family] || {};
        if (g[name]) return g[name];
        const m = /^([LR]S)_(UP|DOWN|LEFT|RIGHT)$/.exec(name);
        return m ? m[1] + ' ' + { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }[m[2]] : name;   // LS ↑
    }
    function setDevice(name, vendor = '') {
        device = String(name);
        family = familyOf(device, vendor);
    }

    // --- HELD STATE ---
    const held = new Map();            // source → Set of names it holds
    const listeners = [];              // fn(name, down) — the controller screen listens here
    const isDown = name => { for (const s of held.values()) if (s.has(name)) return true; return false; };
    function set(src, name, down) {
        if (!held.has(src)) held.set(src, new Set());
        const s = held.get(src), was = isDown(name);
        if (down) s.add(name); else s.delete(name);
        const now = isDown(name);
        if (now === was) return;
        if (now) press(name);
        for (const fn of listeners) fn(name, now);
    }
    // Replace everything a source holds with `names` (used by the polled / axis sources).
    function setAll(src, names) {
        const prev = held.get(src) || new Set();
        for (const n of [...prev]) if (!names.has(n)) set(src, n, false);
        for (const n of names) if (!prev.has(n)) set(src, n, true);
    }
    const allHeld = () => { const out = new Set(); for (const s of held.values()) for (const n of s) out.add(n); return [...out]; };

    // A stick as one digital direction: past the dead zone, the dominant axis wins.
    function stickDir(prefix, x, y, out) {
        if (Math.hypot(x, y) < cfg.dead) return;
        out.add(prefix + (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'RIGHT' : 'LEFT') : (y > 0 ? 'DOWN' : 'UP')));
    }

    // --- FIRING ACTIONS ---
    let device = '';
    const onMenu = () => G.mode === 'ready' || G.mode === 'over';
    function press(name) {
        if (!html.classList.contains('padmode')) html.classList.add('padmode');   // hide the touch pad
        if (SM.names.onPress(name) || SM.upgrades.onPress(name) || SM.scores.onPress(name) || SM.padmenu.onPress(name)) return;
        const a = actionOf(name);
        if (a) fire(a);
    }
    function fire(a) {
        const I = SM.input;
        switch (a) {
            case 'up': return I.pressDir(DIRS[0]);
            case 'right': return I.pressDir(DIRS[1]);
            case 'down': return I.pressDir(DIRS[2]);
            case 'left': return I.pressDir(DIRS[3]);
            case 'dig': return SM.dash.start();
            case 'coat': return SM.coat.toggle();
            case 'skill': return SM.special.use();
            case 'swap': return SM.special.cycle();
            case 'lunge': return SM.lunge.start();
            case 'gun': return SM.zombies.nextGun();
            case 'zoom': return SM.view.setZoom(SM.view.cam.z >= SM.view.ZOOM_MAX - 0.01 ? SM.view.ZOOM_MIN : SM.view.cam.z * 1.25);
            case 'pause': return I.togglePause();
            case 'level': return SM.dial.cycleLevel();
            case 'newmap': return SM.game.restart(true);
            case 'mode': return SM.modes.next();
            case 'name': return SM.names.show();
            case 'upgrades': return SM.upgrades.toggle();
            case 'play':
                if (G.mode === 'over') return SM.game.restart(false);   // same map again
                G.mode = 'play'; return;
            case 'shoot': return;   // held, not pressed: zombies.js reads the trigger every tick
            case 'menu': return SM.padmenu.toggle();
            case 'scores': return SM.scores.toggle();
        }
    }

    // What each button does right now, for the hints and the Thor's lower screen.
    function legend() {
        const menu = onMenu(), zombies = G.gameMode === 'zombies';
        const rows = menu
            ? [['level', 'LEVEL'], ['newmap', 'NEW MAP'], ['mode', 'GAME MODE'], ['name', 'PLAYER NAME'],
               ['upgrades', 'UPGRADES'], ['scores', 'HIGH SCORES'], ['play', G.mode === 'over' ? 'SAME MAP' : 'PLAY'], ['menu', 'CONTROLS']]
            : [['dig', 'DIG'], ['coat', 'TURNCOAT'], ['skill', 'SPECIAL SKILL'], ['swap', 'SWAP SKILL'],
               ...(SM.lunge.unlocked() ? [['lunge', 'DASH']] : []),
               ...(zombies ? [['shoot', 'SHOOT'], ['gun', 'NEXT GUN']] : []),
               ['zoom', 'ZOOM'], ['pause', 'PAUSE'], ['menu', 'CONTROLS']];
        return rows.map(([id, what]) => [label(id), what, cfg.bind[id].find(Boolean) || '']);
    }
    // Touch brings the on-screen pad back.
    // Not on two screens: the top has no touch pad there, and the Thor's controller is built in.
    window.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' && !SM.core.DUAL) html.classList.remove('padmode');
    }, { capture: true, passive: true });
    if (SM.core.DUAL) html.classList.add('padmode');

    // --- SOURCE: the browser Gamepad API ---
    const STD = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];
    function poll() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const seen = new Set();
        for (const p of pads) {
            if (!p || !p.connected) continue;
            const src = 'gp' + p.index, names = new Set();
            seen.add(src);
            const std = p.mapping === 'standard';
            p.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) names.add(std && STD[i] ? STD[i] : 'BTN' + i); });
            if (std) {
                stickDir('LS_', p.axes[0] || 0, p.axes[1] || 0, names);
                stickDir('RS_', p.axes[2] || 0, p.axes[3] || 0, names);
            } else {
                p.axes.forEach((v, i) => { if (Math.abs(v) >= cfg.dead) names.add('AXIS' + i + (v > 0 ? '+' : '-')); });
            }
            if (names.size && device !== p.id) setDevice(p.id);
            setAll(src, names);
        }
        for (const src of held.keys()) if (src.startsWith('gp') && !seen.has(src)) setAll(src, new Set());   // unplugged
        requestAnimationFrame(poll);
    }
    // In the app the activity owns the controller, so the WebView's copy (if any) is ignored.
    if (!inApp) requestAnimationFrame(poll);

    // --- SOURCE: the Android app (MainActivity calls these) ---
    function nativeKey(name, down) { set('nk', String(name), !!down); }
    function nativeAxes(lx, ly, rx, ry, hx, hy, lt, rt) {
        const names = new Set();
        stickDir('LS_', lx, ly, names);
        stickDir('RS_', rx, ry, names);
        if (hx < -0.5) names.add('LEFT'); if (hx > 0.5) names.add('RIGHT');   // a hat is a d-pad
        if (hy < -0.5) names.add('UP');   if (hy > 0.5) names.add('DOWN');
        if (lt > 0.5) names.add('L2');    if (rt > 0.5) names.add('R2');
        setAll('na', names);
    }
    function nativeDevice(name, vendor = '') {
        setDevice(name, vendor);
        html.classList.add('padmode');   // the app only names a controller that is there
    }

    // Everything known about the input devices and screens, for the controller screen's
    // DEVICE REPORT row: the browser's gamepads, and in the app MainActivity.deviceReport().
    function report() {
        const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean)
            .map(p => ({ id: p.id, mapping: p.mapping, buttons: p.buttons.length, axes: p.axes.length })) : [];
        let app = null;
        try { app = window.SnakeManApp && SnakeManApp.devices ? JSON.parse(SnakeManApp.devices()) : null; } catch (e) {}
        return { device, family, held: allHeld(), browserPads: pads, app, agent: navigator.userAgent,
                 screen: [screen.width, screen.height, devicePixelRatio] };
    }

    SM.pad = {
        ACTIONS, inApp, context,
        bind, resetBinds, setDead, label, actionOf, allHeld, isDown,
        nativeKey, nativeAxes, nativeDevice, glyph, legend, report, familyOf,
        onChange: fn => listeners.push(fn),
        get cfg() { return cfg; },
        get device() { return device; },
        get family() { return family; },
        get active() { return html.classList.contains('padmode'); },
    };
})();
