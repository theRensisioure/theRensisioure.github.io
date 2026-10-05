// SNAKE-MAN · names
// The name screen: who's playing. Every board entry is signed with this name, and each name
// keeps its own level and special skills (profile.js). Opens with U, the NAME button, or the
// PLAYER NAME row on the controller screen.
//
// The name is a real text box, so a keyboard or a phone's soft keyboard just types. A
// controller spells it arcade-style: up / down change the letter under the cursor, left /
// right move the cursor, X deletes, L1 / R1 flip through players who've played here before,
// A or START signs in, B or SELECT backs out. Tapping a past player's name picks it.
'use strict';
(() => {
    const G = SM.G, PR = SM.profile;
    const ABC = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    const el = document.createElement('div');
    el.className = 'padmenu names';
    el.hidden = true;
    document.body.appendChild(el);
    el.innerHTML = `
        <div class="pm-title">WHO'S PLAYING?</div>
        <div class="nm-boxes" id="nmBoxes"></div>
        <input class="nm-input" id="nmInput" maxlength="${PR.NAME_MAX}" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <div class="pm-dev" id="nmInfo"></div>
        <div class="nm-list" id="nmList"></div>
        <div class="pm-row" id="nmOk"><span>SIGN IN</span><span>›</span></div>
        <div class="pm-hint" id="nmHint"></div>`;
    const input = el.querySelector('#nmInput'), list = el.querySelector('#nmList');
    let open = false, pick = -1;

    function show() {
        if (open) return;
        if (SM.padmenu.open) SM.padmenu.hide();
        if (SM.scores.open) SM.scores.hide();
        open = true;
        if (G.mode === 'play') G.mode = 'paused';
        input.value = PR.name;
        pick = PR.names().indexOf(PR.name);
        el.hidden = false;
        render();
        // a controller spells with the d-pad; only bring up a soft keyboard for keys and touch
        if (!SM.pad.active) setTimeout(() => { input.focus(); input.select(); }, 0);
    }
    function hide() { open = false; el.hidden = true; input.blur(); }
    const toggle = () => open ? hide() : show();

    function confirm() {
        const name = PR.use(input.value);
        hide();
        if (G.mode !== 'over') G.hi = SM.scores.best();
        return name;
    }

    // --- ARCADE SPELLING (controller) ---
    const cursor = () => Math.min(input.selectionStart ?? input.value.length, PR.NAME_MAX - 1);
    function setCursor(c) { input.setSelectionRange(c, c + 1); }
    function spin(d) {
        const c = cursor(), v = input.value.padEnd(c + 1, ' ');
        const ch = ABC[(Math.max(0, ABC.indexOf(v[c])) + d + ABC.length) % ABC.length];
        input.value = (v.slice(0, c) + ch + v.slice(c + 1)).slice(0, PR.NAME_MAX);   // trailing spaces go at sign-in
        setCursor(c);
        render();
    }
    function moveCursor(d) { setCursor(Math.max(0, Math.min(PR.NAME_MAX - 1, cursor() + d))); render(); }
    function del() {
        const c = cursor();
        input.value = input.value.slice(0, c) + input.value.slice(c + 1);
        setCursor(Math.min(c, Math.max(0, input.value.length - 1)));
        render();
    }
    function flip(d) {
        const names = PR.names();
        if (!names.length) return;
        pick = (pick + d + names.length) % names.length;
        input.value = names[pick];
        setCursor(0);
        render();
    }

    function onPress(name) {
        if (!open) return false;
        if (name === 'UP' || name === 'LS_UP') spin(1);
        else if (name === 'DOWN' || name === 'LS_DOWN') spin(-1);
        else if (name === 'LEFT' || name === 'LS_LEFT') moveCursor(-1);
        else if (name === 'RIGHT' || name === 'LS_RIGHT') moveCursor(1);
        else if (name === 'L1') flip(-1);
        else if (name === 'R1') flip(1);
        else if (name === 'X') del();
        else if (name === 'A' || name === 'START') confirm();
        else if (name === 'B' || name === 'SELECT') hide();
        return true;
    }

    // Keyboard: the text box does the typing; we only take Enter, Esc, and Tab (next player).
    function key(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!open) {
            if (k === 'u' && !SM.padmenu.open && !SM.scores.open && G.mode !== 'play') { e.preventDefault(); show(); return true; }
            return false;
        }
        if (k === 'Enter') { e.preventDefault(); confirm(); }
        else if (k === 'Escape') { e.preventDefault(); hide(); }
        else if (k === 'Tab') { e.preventDefault(); flip(e.shiftKey ? -1 : 1); }
        else if (document.activeElement !== input) {   // focus was lost (a tap elsewhere): send keys back in
            input.focus();
        }
        return true;
    }

    input.addEventListener('keyup', render);   // the caret moved
    input.addEventListener('input', () => {
        const c = input.selectionStart;
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
        input.setSelectionRange(c, c);
        render();
    });
    el.addEventListener('click', e => {
        const t = e.target.closest('[data-name]');
        if (t) { input.value = t.dataset.name; pick = PR.names().indexOf(t.dataset.name); render(); return; }
        if (e.target.closest('#nmOk')) confirm();
    });

    function render() {
        if (!open) return;
        const name = PR.clean(input.value), c = cursor();
        // the letter boxes: what a controller is spelling, with the cursor's box lit
        el.querySelector('#nmBoxes').innerHTML = Array.from({ length: PR.NAME_MAX }, (_, i) =>
            `<span class="${i === c ? 'sel' : ''}">${(input.value[i] || ' ').replace(' ', '&nbsp;')}</span>`).join('');
        const known = PR.all().find(p => p.name === name);
        el.querySelector('#nmInfo').textContent = !name ? 'TYPE A NAME' : known ? `LV ${known.level} · ${known.xp} XP` : 'NEW PLAYER · STARTS WITH 1 OF EACH SPECIAL SKILL';
        list.innerHTML = PR.all().map(p =>
            `<span class="nm-chip${p.name === name ? ' sel' : ''}" data-name="${p.name}">${p.name} <i>LV ${p.level}</i></span>`).join('');
        el.querySelector('#nmHint').textContent = SM.pad.active
            ? 'UP/DOWN LETTER · LEFT/RIGHT MOVE · X DELETE · L1/R1 PLAYERS · A SIGN IN · B BACK'
            : 'TYPE YOUR NAME · TAB PAST PLAYERS · ENTER SIGN IN · ESC BACK';
    }

    SM.names = { show, hide, toggle, onPress, key, get open() { return open; } };
})();
