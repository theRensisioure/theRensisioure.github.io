// SNAKE-MAN · padmenu
// The controller screen: a grid of game actions × two binding slots, plus the stick dead zone,
// reset buttons, a way to the high scores, and a live readout of what the controller is sending (so an odd pad can be
// mapped by watching what its buttons are called). Opens with SELECT, K, or the PAD button.
//
// The screen is driven by fixed inputs that no rebinding can take away: d-pad / left stick to
// move, A or START to pick, X to clear, B or SELECT to close (and arrows / Enter / Delete / Esc
// on a keyboard, or a tap). Picking a slot listens for the next button; 5 seconds of nothing
// cancels.
'use strict';
(() => {
    const G = SM.G, P = SM.pad;
    const CAPTURE_MS = 5000;

    const el = document.createElement('div');
    el.className = 'padmenu';
    el.hidden = true;
    document.body.appendChild(el);

    // Rows: one per action (two columns: the slots), then the settings rows.
    const EXTRA = [
        { id: 'dead', label: 'STICK DEAD ZONE' },
        { id: 'name', label: 'PLAYER NAME' },
        { id: 'upgrades', label: 'UPGRADES' },
        { id: 'resetPad', label: 'RESET CONTROLS' },
        { id: 'resetSkills', label: 'RESET SKILLS' },
        { id: 'scores', label: 'HIGH SCORES' },
        { id: 'report', label: 'DEVICE REPORT' },
        { id: 'close', label: 'CLOSE' },
    ];
    const NA = P.ACTIONS.length;
    const ROWS = NA + EXTRA.length;

    let open = false;
    let cur = { r: 0, c: 0 };
    let capture = null;   // { action, slot, until }
    let armed = null;     // a reset row waiting for its second press
    let note = '';
    let timer = 0;
    let reportText = '';   // the last DEVICE REPORT, shown under the grid until the screen closes

    function show() {
        if (open) return;
        open = true; capture = null; armed = null; note = '';
        if (G.mode === 'play') G.mode = 'paused';
        el.hidden = false;
        render();
    }
    function hide() {
        open = false; capture = null; armed = null; reportText = '';
        clearInterval(timer);
        el.hidden = true;
    }
    const toggle = () => open ? hide() : show();

    function move(dr, dc) {
        armed = null;
        if (dr) cur.r = (cur.r + dr + ROWS) % ROWS;
        if (dc) {
            if (cur.r < NA) cur.c = (cur.c + dc + 2) % 2;
            else if (EXTRA[cur.r - NA].id === 'dead') P.setDead(P.cfg.dead + 0.05 * dc);
        }
        render();
    }

    function activate() {
        if (cur.r < NA) { startCapture(P.ACTIONS[cur.r].id, cur.c); return; }
        const id = EXTRA[cur.r - NA].id;
        if (id === 'close') { hide(); return; }
        if (id === 'scores') { SM.scores.show(); return; }
        if (id === 'name') { hide(); SM.names.show(); return; }
        if (id === 'upgrades') { hide(); SM.upgrades.show(); return; }
        if (id === 'report') { deviceReport(); return; }
        if (id === 'dead') { P.setDead(P.cfg.dead >= 0.8 ? 0.2 : P.cfg.dead + 0.05); render(); return; }
        if (armed !== id) { armed = id; note = 'PRESS AGAIN TO CONFIRM'; render(); return; }
        armed = null;
        if (id === 'resetPad') { P.resetBinds(); note = 'CONTROLS RESET'; }
        if (id === 'resetSkills') {
            SM.skills.wipe(); note = 'SKILLS RESET TO LEVEL 1';
            if (G.mode !== 'over') G.hi = SM.scores.best();   // back on the rookie board
        }
        render();
    }

    // Everything the game knows about the controllers and screens: shown here, copied to the
    // clipboard, and (in the app) written to logcat as SnakeManDevices for adb.
    function deviceReport() {
        reportText = JSON.stringify(P.report(), null, 1);
        let copied = false;
        try { if (window.SnakeManApp && SnakeManApp.copy) { SnakeManApp.copy(reportText); copied = true; } } catch (e) {}
        if (!copied && navigator.clipboard) navigator.clipboard.writeText(reportText).then(() => {}, () => {});
        console.log('SnakeManDevices ' + reportText);
        note = 'REPORT COPIED - PASTE IT TO CLAUDE';
        render();
    }

    function clearSlot() {
        if (cur.r >= NA) return;
        P.bind(P.ACTIONS[cur.r].id, cur.c, null);
        note = '';
        render();
    }

    function startCapture(action, slot) {
        capture = { action, slot, until: performance.now() + CAPTURE_MS };
        note = '';
        clearInterval(timer);
        timer = setInterval(() => {
            if (!capture) { clearInterval(timer); return; }
            if (performance.now() >= capture.until) { capture = null; note = 'NOTHING PRESSED - UNCHANGED'; clearInterval(timer); }
            render();
        }, 250);
        render();
    }

    // Every controller press comes here first; while the screen is open it eats them all.
    function onPress(name) {
        if (!open) return false;
        if (capture) {
            const was = P.actionOf(name);
            P.bind(capture.action, capture.slot, name);
            note = P.glyph(name) + ' IS NOW ' + P.ACTIONS.find(a => a.id === capture.action).label
                 + (was && was !== capture.action ? ' (TAKEN FROM ' + P.ACTIONS.find(a => a.id === was).label + ')' : '');
            capture = null;
            clearInterval(timer);
            render();
            return true;
        }
        if (name === 'UP' || name === 'LS_UP') move(-1, 0);
        else if (name === 'DOWN' || name === 'LS_DOWN') move(1, 0);
        else if (name === 'LEFT' || name === 'LS_LEFT') move(0, -1);
        else if (name === 'RIGHT' || name === 'LS_RIGHT') move(0, 1);
        else if (name === 'A' || name === 'START') activate();
        else if (name === 'X') clearSlot();
        else if (name === 'B' || name === 'SELECT' || P.actionOf(name) === 'menu') hide();
        return true;
    }

    // Keyboard while open. Returns true if the key was the screen's.
    function key(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!open) {
            if (k === 'k') { show(); return true; }
            return false;
        }
        e.preventDefault();
        if (capture) {   // the screen maps controllers, not keys
            if (k === 'Escape') { capture = null; note = 'CANCELLED'; render(); }
            return true;
        }
        if (k === 'ArrowUp' || k === 'w') move(-1, 0);
        else if (k === 'ArrowDown' || k === 's') move(1, 0);
        else if (k === 'ArrowLeft' || k === 'a') move(0, -1);
        else if (k === 'ArrowRight' || k === 'd') move(0, 1);
        else if (k === 'Enter' || k === ' ') activate();
        else if (k === 'Delete' || k === 'Backspace') clearSlot();
        else if (k === 'Escape' || k === 'k') hide();
        return true;
    }

    // Taps and clicks: every cell carries its row / column.
    el.addEventListener('click', e => {
        const t = e.target.closest('[data-r]');
        if (!t) return;
        cur = { r: +t.dataset.r, c: +(t.dataset.c || 0) };
        armed = armed === EXTRA[cur.r - NA]?.id ? armed : null;
        activate();
    });

    // --- DRAWING ---
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function render() {
        if (!open) return;
        const sel = (r, c = 0) => cur.r === r && (r >= NA || cur.c === c) ? ' sel' : '';
        let h = '<div class="pm-title">CONTROLLER</div>';
        h += `<div class="pm-dev">${esc(P.device || (P.inApp ? 'BUILT-IN / BLUETOOTH CONTROLLER' : 'NO CONTROLLER YET - PRESS ANY BUTTON'))}</div>`;
        // Two columns: ALWAYS and IN A RUN, then ON THE MENUS and the settings. One screen stacks
        // them (panels.css); the Thor's lower screen sets them side by side so nothing scrolls.
        const SECTION = { any: 'ALWAYS', play: 'IN A RUN', menu: 'ON THE MENUS' };
        const split = P.ACTIONS.findIndex(a => a.ctx === 'menu');
        const grid = (from, to) => {
            let g = '<div class="pm-grid">';
            for (let r = from; r < to; r++) {
                const a = P.ACTIONS[r];
                if (r === from || P.ACTIONS[r - 1].ctx !== a.ctx) g += `<div class="pm-sec">${SECTION[a.ctx]}</div>`;
                g += `<div class="pm-act">${a.label}</div>`;
                for (let c = 0; c < 2; c++) {
                    const cap = capture && capture.action === a.id && capture.slot === c;
                    const v = cap ? 'PRESS… ' + Math.ceil((capture.until - performance.now()) / 1000) : P.glyph(P.cfg.bind[a.id][c]) || '—';
                    g += `<div class="pm-slot${sel(r, c)}${cap ? ' cap' : ''}" data-r="${r}" data-c="${c}">${esc(v)}</div>`;
                }
            }
            return g + '</div>';
        };
        h += '<div class="pm-cols"><div class="pm-col">' + grid(0, split) + '</div><div class="pm-col">' + grid(split, NA);
        h += '<div class="pm-sec pm-sec-rows">SETTINGS</div>';
        EXTRA.forEach((x, i) => {
            const r = NA + i;
            const v = x.id === 'dead' ? `‹ ${P.cfg.dead.toFixed(2)} ›` : x.id === 'name' ? esc(SM.profile.name) : x.id === 'upgrades' ? SM.profile.points() + ' PTS' : armed === x.id ? 'SURE?' : '';
            h += `<div class="pm-row${sel(r)}${armed === x.id ? ' warn' : ''}" data-r="${r}"><span>${x.label}</span><span>${v}</span></div>`;
        });
        h += '</div></div>';
        h += `<div class="pm-note">${esc(note)}</div>`;
        if (reportText) h += `<pre class="pm-report">${esc(reportText)}</pre>`;
        h += `<div class="pm-live">HELD: <span id="pmHeld">${esc(held())}</span></div>`;
        h += `<div class="pm-hint">${P.active ? `${esc(P.glyph('A'))} PICK · ${esc(P.glyph('X'))} CLEAR · ${esc(P.glyph('B'))} CLOSE` : 'ENTER PICK · DEL CLEAR · ESC CLOSE · OR TAP'}</div>`;
        el.innerHTML = h;
    }
    // What is held right now: the printed label, and the plain name when it differs (for reports).
    const held = () => P.allHeld().map(n => P.glyph(n) === n ? n : `${P.glyph(n)} (${n})`).join(' ') || '-';
    // The live readout updates on every press and release without redrawing the grid.
    P.onChange(() => {
        if (!open) return;
        const e = document.getElementById('pmHeld');
        if (e) e.textContent = held();
    });

    SM.padmenu = { show, hide, toggle, onPress, key, get open() { return open; } };
})();
