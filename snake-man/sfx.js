// SNAKE-MAN · sfx
// Sound, synthesised on the fly: no audio files, so it works from file:// and in the Android
// WebView. One AudioContext for the whole run, created on the first key, touch or gamepad button (browsers
// refuse to start audio before a user gesture). Each sound is a few short-lived oscillator
// notes scheduled on the context clock; the nodes free themselves when they stop.
// Effects are driven by bus events, so no rule knows sound exists. Mode changes (start, pause,
// game over) and the Turncoat disguise aren't on the bus, so a per-frame watcher compares them
// with the last frame, as the Godot port's sfx.gd does. V toggles mute.
// Music is the suite in music.js, voiced like the Godot port's chiptune.gd: a 25% pulse lead
// and a square second voice into a dotted-eighth echo, a triangle bass and noise hats, dry.
'use strict';
(() => {
    const { on, store } = SM.core;
    const G = SM.G, MU = SM.music;

    let ac = null, master = null, musicBus = null, echoSend = null, pulse = null, noise = null;
    let muted = store.get('snakeman-mute') === '1';
    const VOL = 0.18;
    const MUSIC_GAIN = 0.55;
    const ECHO_SECONDS = 0.375, ECHO_FEEDBACK = 0.18, ECHO_WET = 0.14, ECHO_LOWPASS_HZ = 2800;

    function unlock() {
        if (!ac) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ac = new AC();
            master = ac.createGain();
            master.gain.value = muted ? 0 : VOL;
            master.connect(ac.destination);
            buildMusicBus();
        }
        if (ac.state === 'suspended') ac.resume();
    }
    ['keydown', 'pointerdown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

    function setMuted(m) {
        muted = m;
        store.set('snakeman-mute', m ? '1' : '0');
        if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ac.currentTime, 0.02);
    }

    // One note: freq glides from f0 to f1 over dur seconds, starting `at` seconds from now.
    function tone(f0, f1 = f0, dur = 0.08, { type = 'square', vol = 1, at = 0 } = {}) {
        if (!ac || muted || ac.state !== 'running') return;
        const t = ac.currentTime + at;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
    }
    const arp = (notes, step, opts = {}) => notes.forEach((f, i) => tone(f, f, step * 1.1, { ...opts, at: (opts.at || 0) + i * step }));

    // Waka alternates pitch like the arcade chomp.
    let waka = 0;
    const SOUNDS = {
        eat:        e => e.rainbow ? arp([660, 880, 1100, 1320], 0.05, { type: 'triangle' })
                                   : tone((waka ^= 1) ? 520 : 390, 260, 0.06, { vol: 0.5 }),
        boost:      () => arp([523, 659, 784, 1047, 1319], 0.06, { type: 'triangle' }),
        fruit:      () => arp([880, 1175], 0.07, { type: 'sine', vol: 0.6 }),
        prism:      () => tone(200, 1200, 0.35, { type: 'sawtooth', vol: 0.35 }),
        ghostEaten: () => tone(1400, 180, 0.25, { type: 'square', vol: 0.6 }),
        hit:        () => { tone(300, 60, 0.4, { type: 'sawtooth' }); tone(150, 40, 0.4, { type: 'square', vol: 0.5 }); },
        dash:       () => tone(180, 60, 0.18, { type: 'triangle' }),
        surfaced:   () => tone(80, 260, 0.15, { type: 'triangle' }),
        bonk:       () => tone(140, 90, 0.1, { type: 'square', vol: 0.6 }),
        dodge:      () => tone(900, 1300, 0.05, { type: 'sine', vol: 0.4 }),
        snip:       () => tone(1200, 400, 0.12, { type: 'sawtooth', vol: 0.5 }),
        betrayed:   () => arp([330, 247], 0.08, { type: 'square', vol: 0.5 }),
        heal:       () => arp([392, 523, 659, 784], 0.08, { type: 'triangle' }),
        levelup:    () => arp([523, 784, 1047, 1568], 0.06, { type: 'square', vol: 0.45 }),
        playerLevel: () => arp([392, 523, 659, 784, 1047, 1319], 0.07, { type: 'triangle', vol: 0.6 }),
        mission:    () => arp([659, 784, 988, 1319], 0.07, { type: 'square', vol: 0.45 }),
        special:    d => d.id === 'freeze' ? tone(2000, 600, 0.3, { type: 'sine', vol: 0.5 })
                       : d.id === 'bane' ? tone(90, 400, 0.35, { type: 'sawtooth', vol: 0.45 })
                       : arp([523, 659, 784, 988, 1175, 1397], 0.04, { type: 'triangle' }),
        frozen:     () => tone(1800, 1200, 0.08, { type: 'sine', vol: 0.35 }),
        ghostKilled: k => { if (k.how !== 'eat') tone(k.how === 'shatter' ? 2400 : 1000, 120, 0.2, { type: 'square', vol: 0.45 }); },
        lunge:      () => tone(300, 1500, 0.12, { type: 'sawtooth', vol: 0.4 }),
        shot:       d => d.gun === 'shotgun' ? tone(220, 40, 0.18, { type: 'sawtooth', vol: 0.6 })
                       : tone(d.gun === 'ak47' ? 700 : 500, 90, 0.07, { type: 'square', vol: 0.4 }),
        buy:        () => arp([1047, 1319, 1568, 2093], 0.05, { type: 'square', vol: 0.45 }),
        gate:       () => { tone(60, 30, 0.6, { type: 'sawtooth', vol: 0.5 }); tone(1600, 200, 0.5, { type: 'sine', vol: 0.4 }); },
    };
    for (const [ev, fn] of Object.entries(SOUNDS)) on(ev, d => { if (G.mode === 'play') fn(d || {}); });

    // --- MUSIC ---
    // musicBus -> master. Lead voices go through echoSend, which feeds the bus dry and a
    // delay loop (delay -> lowpass -> feedback -> delay) whose lowpassed output is mixed back in.
    function buildMusicBus() {
        musicBus = ac.createGain();
        musicBus.gain.value = MUSIC_GAIN;
        musicBus.connect(master);
        echoSend = ac.createGain();
        echoSend.connect(musicBus);
        const delay = ac.createDelay(1), lp = ac.createBiquadFilter(), fb = ac.createGain(), wet = ac.createGain();
        delay.delayTime.value = ECHO_SECONDS;
        lp.type = 'lowpass'; lp.frequency.value = ECHO_LOWPASS_HZ; lp.Q.value = 0.5;
        fb.gain.value = ECHO_FEEDBACK;
        wet.gain.value = ECHO_WET;
        echoSend.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(musicBus);

        // 25% pulse swinging +1.2 / -0.4, as chiptune.gd draws it: Fourier series of the pulse.
        const H = 40, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
        for (let n = 1; n <= H; n++) {
            re[n] = 1.6 * Math.sin(2 * Math.PI * n * 0.25) / (Math.PI * n);
            im[n] = 1.6 * (1 - Math.cos(2 * Math.PI * n * 0.25)) / (Math.PI * n);
        }
        pulse = ac.createPeriodicWave(re, im, { disableNormalization: true });

        // White noise through a first difference: a crude highpass for hats.
        noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noise.getChannelData(0);
        let prev = 0;
        for (let i = 0; i < d.length; i++) { const x = Math.random() * 2 - 1; d[i] = (x - prev) * 0.5; prev = x; }
    }

    const VOICES = {
        [MU.LEAD]:       { wave: 'pulse', env: 'lead', vol: 0.5, hold: 0.34, echo: true },
        [MU.HARM]:       { wave: 'square', env: 'lead', vol: 0.13, hold: 0.09, echo: true },
        [MU.BASS]:       { wave: 'triangle', env: 'bass', vol: 0.85 },
        [MU.HAT]:        { wave: 'noise', env: 'hat', vol: 0.1 },
        [MU.HAT_ACCENT]: { wave: 'noise', env: 'hat', vol: 0.3 },
    };
    const live = new Set();   // music nodes still sounding, so a pause can cut them

    function musicNote(n, t) {
        const v = VOICES[n.k], g = ac.createGain(), p = g.gain;
        let src, end;
        if (v.wave === 'noise') {
            src = ac.createBufferSource();
            src.buffer = noise;
        } else {
            src = ac.createOscillator();
            if (v.wave === 'pulse') src.setPeriodicWave(pulse); else src.type = v.wave;
            src.frequency.value = n.f;
        }
        p.setValueAtTime(0, t);
        if (v.env === 'lead') {
            // Detached: quick attack, settle to hold, release at 84% of the note.
            const rel = t + n.d * 0.84;
            p.linearRampToValueAtTime(v.vol, t + 0.006);
            p.setTargetAtTime(v.hold, t + 0.006, 0.06);
            p.setTargetAtTime(0, rel, 0.02);
            end = rel + 0.12;
        } else if (v.env === 'bass') {
            p.linearRampToValueAtTime(v.vol, t + 0.004);
            p.setTargetAtTime(0, t + n.d * 0.9, 0.02);
            end = t + n.d + 0.1;
        } else {
            p.setValueAtTime(v.vol, t);
            p.exponentialRampToValueAtTime(0.001, t + 0.04);
            end = t + 0.05;
        }
        src.connect(g); g.connect(v.echo ? echoSend : musicBus);
        if (v.wave === 'noise') src.start(t, Math.random() * 0.9); else src.start(t);
        src.stop(end);
        const node = { src, g };
        live.add(node);
        src.onended = () => { live.delete(node); g.disconnect(); };
    }

    // Lookahead scheduler: every 25 ms, queue the notes that start in the next 0.2 s.
    const LOOKAHEAD = 0.2;
    let song = null, musicOn = false, ni = 0, loopT0 = null, pos = 0;

    function schedule() {
        if (!musicOn || !ac || ac.state !== 'running') return;
        const now = ac.currentTime;
        if (loopT0 === null) {    // (re)starting at song position pos
            loopT0 = now + 0.05 - pos;
            ni = song.notes.findIndex(n => n.t >= pos);
            if (ni < 0) { ni = 0; loopT0 += song.len; }
        }
        for (;;) {
            if (ni >= song.notes.length) { ni = 0; loopT0 += song.len; }
            const n = song.notes[ni], t = loopT0 + n.t;
            if (t >= now + LOOKAHEAD) break;
            if (!muted && t >= now - 0.01) musicNote(n, t);   // a late tick skips, never bunches up
            ni++;
        }
    }
    setInterval(schedule, 25);

    function cut() {
        if (!ac) return;
        const now = ac.currentTime;
        for (const { src, g } of live) {
            g.gain.cancelScheduledValues(now);
            g.gain.setTargetAtTime(0, now, 0.01);
            try { src.stop(now + 0.05); } catch (e) {}
        }
    }
    function playMusic() { cut(); song = song || MU.build(); pos = 0; loopT0 = null; musicOn = true; }
    function pauseMusic() {
        if (!musicOn) return;
        if (loopT0 !== null) pos = (((ac.currentTime - loopT0) % song.len) + song.len) % song.len;
        musicOn = false; loopT0 = null;
        cut();
    }
    function resumeMusic() { if (song) musicOn = true; }
    function stopMusic() { musicOn = false; loopT0 = null; pos = 0; cut(); }

    // --- WATCHER: cues for state that isn't on the bus ---
    let last = null;
    function watch() {
        const now = { mode: G.mode, lives: G.lives, disguised: !!(SM.coat && SM.coat.disguised) };
        const was = last;
        last = now;
        if (was) {
            if (now.mode !== was.mode) modeChanged(was, now);
            if (now.mode === 'play' && now.disguised !== was.disguised) {
                if (now.disguised) tone(500, 1000, 0.12, { type: 'sine', vol: 0.45 });
                else if (SM.coat.cool > SM.coat.COAT_COOL_MS) tone(1200, 400, 0.12, { type: 'sawtooth', vol: 0.5 });  // busted
                else tone(1000, 500, 0.12, { type: 'sine', vol: 0.35 });
            }
        }
        requestAnimationFrame(watch);
    }
    function modeChanged(was, now) {
        switch (now.mode) {
            case 'play':
                if (was.mode === 'paused') { resumeMusic(); tone(880, 880, 0.06, { vol: 0.3 }); }
                else playMusic();
                break;
            case 'paused':
                pauseMusic();
                tone(660, 660, 0.06, { vol: 0.3 });
                break;
            case 'over':
                // The hit sound already played off the bus; let it ring before the sting.
                stopMusic();
                arp([392, 330, 262, 196], 0.16, { type: 'square', vol: 0.5, at: now.lives < was.lives ? 0.4 : 0 });
                break;
            default:
                stopMusic();
        }
    }
    requestAnimationFrame(watch);

    window.addEventListener('keydown', e => { if (e.key === 'v' || e.key === 'V') setMuted(!muted); });

    SM.sfx = { unlock, tone, arp, setMuted, playMusic, pauseMusic, resumeMusic, stopMusic, get muted() { return muted; } };
})();
