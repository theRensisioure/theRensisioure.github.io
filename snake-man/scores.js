// SNAKE-MAN · scores
// LEADERBOARDS. Two pages, flipped with left / right:
//   SCORES   one board per skill tier. Skills carry over between runs and make the game
//            easier, so one high score would favour whoever has played longest. Instead a
//            run is filed on the board for its tier, read off the total of the five skill
//            levels when it ends (5 to 50), and only competes with runs played at about the
//            same strength. VOID and ZOMBIES mode runs get a board each, and SEASONAL runs one
//            per season (modes.js); past seasons stay listed under the current one.
//   RECORDS  LEVELS (every player by level, see profile.js), and the most DODGES and the
//            most STEALTH KILLS (ghosts killed while in TURNCOAT disguise) in a single run.
// Every entry is signed with the player's name (names.js). Each board keeps its top five.
// The HUD's HI is the best on the board you'd land on now. L, R3, or the controller screen
// opens the boards.
'use strict';
(() => {
    const { store } = SM.core;
    const G = SM.G;

    const TIERS = [
        { id: 'rookie',  name: 'ROOKIE',  max: 10, color: '#0f0' },
        { id: 'adept',   name: 'ADEPT',   max: 20, color: '#0ff' },
        { id: 'veteran', name: 'VETERAN', max: 35, color: '#b89cff' },
        { id: 'master',  name: 'MASTER',  max: 50, color: '#FFD700' },
    ];
    const VOID = { id: 'void', name: 'VOID', color: '#ddd' };
    const ZOMBIES = { id: 'zombies', name: 'ZOMBIES', color: '#7a9a3a' };
    const IDLE = { id: 'idle', name: 'IDLE', color: '#0ff' };
    // Single-run records: which run stat each one ranks by.
    const RECORDS = [
        { id: 'dodges',  name: 'MOST DODGES',        color: '#9a9aff', stat: 'dodges',  unit: 'DODGES' },
        { id: 'stealth', name: 'MOST STEALTH KILLS', color: '#b89cff', stat: 'stealth', unit: 'KILLS' },
    ];
    const KEEP = 5;
    const KEY = 'snakeman-boards';
    const BOARD_IDS = [...TIERS.map(t => t.id), VOID.id, ZOMBIES.id, IDLE.id, ...RECORDS.map(r => r.id)];

    const totalLevel = () => SM.skills.SKILLS.reduce((s, k) => s + SM.skills.level(k.id), 0);
    const tierOf = lv => TIERS.find(t => lv <= t.max) || TIERS[TIERS.length - 1];
    const tierNow = () => tierOf(totalLevel());
    // The score board a run started now would be filed on.
    const boardNow = () => SM.modes.board() || tierNow();

    let boards = load();   // { boardId: [{ score, lv, seed, rung, date, name, mode }] }, best first
    let last = [];         // the entries the last run made, if they placed

    function load() {
        const out = Object.fromEntries(BOARD_IDS.map(id => [id, []]));
        try {
            const s = JSON.parse(store.get(KEY) || 'null');
            if (s) {
                const keep = id => BOARD_IDS.includes(id) || id.startsWith('season-');   // season boards come and go
                for (const id of Object.keys(s)) if (keep(id) && Array.isArray(s[id])) out[id] = s[id].filter(e => e && Number.isFinite(e.score)).slice(0, KEEP);
            } else {
                // Before the boards there was one high score, set with no skills at all: a rookie run.
                const old = +store.get('snakeman-hi') || 0;
                if (old > 0) out.rookie.push({ score: old, lv: 5, seed: null, rung: null, date: null });
            }
        } catch (e) {}
        return out;
    }
    // Other builds share this save (every file:// copy of the game shares one localStorage) and
    // may keep boards this one doesn't know, such as the seasonal build's 'season-*' boards. Keep
    // those: re-read what's stored at save time, so a board written by a build running in
    // another window survives too.
    function save() {
        let stored = {};
        try { stored = JSON.parse(store.get(KEY) || '{}') || {}; } catch (e) {}
        const foreign = Object.fromEntries(Object.entries(stored).filter(([id]) => !BOARD_IDS.includes(id)));
        store.set(KEY, JSON.stringify({ ...foreign, ...boards }));
    }

    const best = (board = boardNow()) => ((boards[board.id] || [])[0] || { score: 0 }).score;

    // Put e on board id; returns its 1-based rank, or 0 if it didn't make the top five.
    function file(id, e) {
        const b = boards[id] || (boards[id] = []);
        b.push(e);
        b.sort((x, y) => y.score - x.score);
        b.length = Math.min(b.length, KEEP);
        const rank = b.indexOf(e) + 1;
        if (rank) last.push(e);
        return rank;
    }

    // File a finished run: its score, and its single-run records.
    // Returns { tier, rank, records: { dodges: rank, stealth: rank } } (ranks 0 if not placed).
    function record(run) {
        const lv = totalLevel(), tier = boardNow();
        const base = { lv, seed: G.mapSeed, rung: SM.heal.rung + 1, date: new Date().toISOString().slice(0, 10), name: SM.profile.name, mode: G.gameMode };
        last = [];
        const out = { tier, rank: 0, records: {} };
        if (run.score > 0) out.rank = file(tier.id, { ...base, score: run.score });
        for (const r of RECORDS) out.records[r.id] = run[r.stat] > 0 ? file(r.id, { ...base, score: run[r.stat] }) : 0;
        if (last.length) save();
        return out;
    }

    // --- THE BOARDS SCREEN (styled like the controller screen) ---
    const el = document.createElement('div');
    el.className = 'padmenu scores';
    el.hidden = true;
    document.body.appendChild(el);
    let open = false, page = 0;
    const PAGES = ['SCORES', 'RECORDS'];

    function show() {
        if (open) return;
        if (SM.padmenu.open) SM.padmenu.hide();
        if (SM.names.open) SM.names.hide();
        open = true;
        if (G.mode === 'play') G.mode = 'paused';
        el.hidden = false;
        render();
    }
    function hide() { open = false; el.hidden = true; }
    const toggle = () => open ? hide() : show();
    function flip(d) { page = (page + d + PAGES.length) % PAGES.length; render(); }

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Who made an entry: their name, or for entries from before names, the map it was on.
    const who = e => e.name ? esc(e.name) : e.seed != null ? '#' + e.seed : 'OLD HI';

    function board(b, title, sub, color, sel, unit = '') {
        let h = `<div class="sc-board${sel ? ' sel' : ''}">`;
        h += `<div class="sc-head" style="color:${color}"><span>${title}</span><span>${sub}</span></div>`;
        if (!b.length) h += '<div class="sc-empty">NO RUNS YET</div>';
        b.forEach((e, r) => {
            h += `<div class="sc-row${last.includes(e) ? ' new' : ''}"><span>${r + 1}</span><span>${e.score}${unit}</span>`
               + `<span>${who(e)}</span><span>${e.date || ''}</span></div>`;
        });
        return h + '</div>';
    }

    function render() {
        const now = boardNow(), lv = totalLevel();
        let h = '<div class="sc-tabs">' + PAGES.map((p, i) => `<span class="${i === page ? 'sel' : ''}" data-page="${i}">${p}</span>`).join('') + '</div>';
        if (page === 0) {
            h += `<div class="pm-dev">${esc(SM.profile.name)} · SKILLS TOTAL LV ${lv} · YOU PLAY ON THE ${now.name} BOARD</div>`;
            TIERS.forEach((t, i) => { h += board(boards[t.id], t.name, 'LV ' + (i ? TIERS[i - 1].max + 1 : 5) + '-' + t.max, t.color, t === now); });
            h += board(boards.void, 'VOID', 'VOID MODE RUNS', VOID.color, now === VOID);
            h += board(boards.zombies, 'ZOMBIES', 'ZOMBIES MODE RUNS', ZOMBIES.color, now === ZOMBIES);
            h += board(boards.idle, 'IDLE', 'IDLE MODE RUNS', IDLE.color, now === IDLE);
            // This season's board (even empty, so you can see what's in play), then past seasons, newest first.
            const S = SM.modes.season, ids = Object.keys(boards).filter(id => id.startsWith('season-') && id !== S.key);
            h += board(boards[S.key] || [], S.title, 'THIS SEASON', S.color, now.id === S.key);
            ids.sort((a, b) => +b.split('-')[2] - +a.split('-')[2]).forEach(id => {
                const [, sid, year] = id.split('-'), s = SM.modes.SEASONS.find(o => o.id === sid);
                if (s && boards[id].length) h += board(boards[id], SM.modes.seasonOf(new Date(+year, s.months[0], 15)).title, 'PAST SEASON', s.color, false);
            });
        } else {
            const players = SM.profile.all().slice(0, KEEP);
            h += '<div class="sc-board"><div class="sc-head" style="color:#fff"><span>LEVELS</span><span>EVERY PLAYER</span></div>';
            players.forEach((p, r) => {
                h += `<div class="sc-row${p.name === SM.profile.name ? ' me' : ''}"><span>${r + 1}</span><span>LV ${p.level}</span><span>${esc(p.name)}</span><span>${p.xp} XP</span></div>`;
            });
            h += '</div>';
            for (const r of RECORDS) h += board(boards[r.id], r.name, 'IN ONE RUN', r.color, false, ' ' + r.unit);
        }
        h += `<div class="pm-hint">${SM.pad.active ? 'LEFT/RIGHT PAGE · B CLOSE' : 'LEFT/RIGHT PAGE · ESC CLOSE · OR TAP'}</div>`;
        el.innerHTML = h;
    }

    // Input while open: left / right flip pages, anything that means "back" closes, the rest is swallowed.
    function onPress(name) {
        if (!open) return false;
        if (name === 'LEFT' || name === 'LS_LEFT' || name === 'L1') flip(-1);
        else if (name === 'RIGHT' || name === 'LS_RIGHT' || name === 'R1') flip(1);
        else if (['A', 'B', 'START', 'SELECT', 'R3'].includes(name) || ['scores', 'lunge'].includes(SM.pad.actionOf(name, 'menu')) || SM.pad.actionOf(name) === 'lunge') hide();
        return true;
    }
    function key(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!open) {
            if (k === 'l' && !SM.padmenu.open && !SM.names.open) { show(); return true; }
            return false;
        }
        e.preventDefault();
        if (k === 'ArrowLeft' || k === 'a') flip(-1);
        else if (k === 'ArrowRight' || k === 'd') flip(1);
        else if (k === 'Escape' || k === 'l' || k === 'Enter' || k === ' ') hide();
        return true;
    }
    el.addEventListener('click', e => {
        const t = e.target.closest('[data-page]');
        if (t) { page = +t.dataset.page; render(); return; }
        hide();
    });

    SM.scores = { TIERS, VOID, ZOMBIES, IDLE, RECORDS, record, best, tierNow, boardNow, totalLevel, show, hide, toggle, onPress, key, get open() { return open; } };
})();
