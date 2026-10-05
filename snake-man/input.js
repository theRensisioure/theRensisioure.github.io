// SNAKE-MAN · input
// Keyboard, swipes, the touch pad (joystick + DIG / COAT / SKILL / SWAP / PAUSE / PAD) and the Android app hooks.
// Game controllers are pad.js.
// Input only ever calls the game's public verbs; it holds no game state of its own.
'use strict';
(() => {
    const { DIRS } = SM.core;
    const G = SM.G;
    const game = () => SM.game;

    function pressDir(d) {
        hands();
        if (G.mode === 'ready') G.mode = 'play';
        if (G.mode === 'play') SM.player.queueDir(d);
    }
    function togglePause() {
        if (G.mode === 'play') G.mode = 'paused';
        else if (G.mode === 'paused') G.mode = 'play';
        else if (G.mode === 'over') game().restart(false);
    }
    // Between runs (start and game-over screens) DIG picks the level and COAT draws a new map.
    const menu = () => G.mode === 'ready' || G.mode === 'over';
    function dig() { hands(); if (menu()) SM.dial.cycleLevel(); else SM.dash.start(); }
    function coat() { hands(); if (menu()) game().restart(true); else SM.coat.toggle(); }
    // Any hands-on input makes the IDLE-mode bot let go for a while (autopilot.js).
    const hands = () => { if (SM.auto) SM.auto.manual(); };
    const zoomStep = f => SM.view.setZoom(SM.view.cam.z * f);

    const KEYMAP = {
        ArrowUp: DIRS[0], ArrowRight: DIRS[1], ArrowDown: DIRS[2], ArrowLeft: DIRS[3],
        w: DIRS[0], d: DIRS[1], s: DIRS[2], a: DIRS[3],
    };

    window.addEventListener('keydown', e => {
        // U / K / L open the name, controller and score screens, which then take every key
        if (SM.names.key(e) || SM.upgrades.key(e) || SM.scores.key(e) || SM.padmenu.key(e)) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (KEYMAP[k]) { e.preventDefault(); pressDir(KEYMAP[k]); return; }
        if (k === 'Shift') { e.preventDefault(); if (!e.repeat) { hands(); SM.dash.start(); } return; }
        if (k === 'b') { SM.auto.toggle(); return; }   // AUTOPLAY (IDLE mode)
        if (k === 'x') { G.opts.derivs = !G.opts.derivs; return; }
        if (k === 'm') { G.opts.minimap = !G.opts.minimap; return; }
        if (k === 'c') { G.opts.crt = !G.opts.crt; return; }
        if (k === 'o') { G.opts.occlusion = !G.opts.occlusion; return; }
        if (k === '-') { zoomStep(1 / 1.25); return; }
        if (k === '=' || k === '+') { zoomStep(1.25); return; }
        if (k === 'Escape') { e.preventDefault(); hands(); SM.coat.toggle(); return; }
        if (k === 'z') { SM.lunge.start(); return; }   // DASH (SPEED tier 5)
        if (k === 'f') { if (!e.repeat) SM.zombies.setKey(true); return; }   // the trigger: held to fire
        if (k === 'r') { SM.zombies.nextGun(); return; }
        if (k === 'e') { SM.special.use(); return; }
        if (k === 'q') { SM.special.cycle(); return; }
        if (k === 'g') { SM.modes.next(e.shiftKey ? -1 : 1); return; }
        if (k === 'j' && G.mode === 'over') { SM.runlog.download(); return; }   // save this run's log
        if (k === 'h' && (G.mode === 'ready' || G.mode === 'over')) { SM.dial.cycleLevel(); return; }   // difficulty
        if (k === 'n' && (G.mode === 'ready' || G.mode === 'over' || G.mode === 'paused')) { game().restart(true); return; }
        if (k === ' ' || k === 'p') { e.preventDefault(); togglePause(); return; }
        if (k === 'Enter' && G.mode === 'over') game().restart(false);
    });

    window.addEventListener('keyup', e => { if (e.key === 'f' || e.key === 'F') SM.zombies.setKey(false); });
    window.addEventListener('blur', () => { SM.zombies.setKey(false); SM.zombies.setTouch(false); });

    // A tap on the screen feeds the IDLE-mode HEART meter while a run plays; otherwise it pauses / resumes.
    function tap() {
        if (G.mode === 'play' && SM.idle && SM.idle.active) SM.idle.tap();
        else togglePause();
    }
    const canvas = SM.view.canvas;
    canvas.addEventListener('mousedown', e => { if (e.button === 0 && SM.idle && SM.idle.active) tap(); });   // desktop taps feed the heart; Space pauses
    let touchStart = null;
    canvas.addEventListener('touchstart', e => { const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', e => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
        touchStart = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { tap(); return; }
        if (Math.abs(dx) > Math.abs(dy)) pressDir(dx > 0 ? DIRS[1] : DIRS[3]);
        else pressDir(dy > 0 ? DIRS[2] : DIRS[0]);
    });

    // --- TOUCH PAD (phones and the Android app) ---
    // Virtual joystick: past a small dead zone the dominant axis picks one of the four grid
    // directions, and each new direction is queued the moment the thumb crosses into it.
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let stickId = null, stickDir = -1;
    function stickMove(e) {
        const r = stick.getBoundingClientRect();
        const max = r.width / 2 - 24;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const m = Math.hypot(dx, dy);
        if (m > max) { dx *= max / m; dy *= max / m; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        if (m < r.width * 0.12) { stickDir = -1; return; }          // dead zone
        const di = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        if (di !== stickDir) { stickDir = di; pressDir(DIRS[di]); }
    }
    function stickEnd(e) {
        if (e.pointerId !== stickId) return;
        stickId = null; stickDir = -1;
        knob.style.transform = '';
    }
    stick.addEventListener('pointerdown', e => {
        e.preventDefault();
        stickId = e.pointerId; stickDir = -1;
        stick.setPointerCapture(e.pointerId);
        stickMove(e);
    });
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);

    const press = (id, fn) => document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    press('btnDash', dig);   // DIG doubles as LEVEL on the start and game-over screens
    press('btnLunge', () => SM.lunge.start());
    // COAT doubles as NEW (map) on the start and game-over screens, where there's no N key.
    press('btnCoat', coat);
    // SKILL fires the special skill in play, and cycles the game mode on the start and game-over screens;
    // SWAP picks another special skill in play, and opens the name screen on those screens.
    const menuScreen = () => G.mode === 'ready' || G.mode === 'over';
    press('btnSkill', () => menuScreen() ? SM.modes.next() : SM.special.use());
    press('btnSwap', () => menuScreen() ? SM.names.show() : SM.special.cycle());
    press('btnPause', togglePause);
    // FIRE (zombies mode only): held down to shoot.
    const fireBtn = document.getElementById('btnFire');
    fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); fireBtn.setPointerCapture(e.pointerId); SM.zombies.setTouch(true); });
    for (const ev of ['pointerup', 'pointercancel']) fireBtn.addEventListener(ev, () => SM.zombies.setTouch(false));
    press('btnPadCfg', () => SM.padmenu.toggle());

    // Android back button (called by the app shell): pause if playing, otherwise let the app close.
    window.onAppBack = () => {
        if (SM.names.open) { SM.names.hide(); return true; }
        if (SM.upgrades.open) { SM.upgrades.hide(); return true; }
        if (SM.scores.open) { SM.scores.hide(); return true; }
        if (SM.padmenu.open) { SM.padmenu.hide(); return true; }
        if (G.mode === 'play') { G.mode = 'paused'; return true; }
        return false;
    };
    window.onAppHidden = () => { if (G.mode === 'play') G.mode = 'paused'; };
    document.addEventListener('visibilitychange', () => { if (document.hidden) window.onAppHidden(); });

    SM.input = { pressDir, togglePause, dig, coat, zoomStep };
})();
