// SNAKE-MAN · music
// The Snake-Man suite, the same score as the Godot port's music.gd: v1 then v2, 32 bars at
// 120 BPM, about 64 s, looping. A minor and C major, half each; each version runs A, B, A', B'.
// v1 keeps its styles in turns (Mozart turns and Alberti bass, then Pac-Man octave bass).
// v2 blends them in every bar (Tetris long-short-short rhythm, turns and chromatic climbs,
// Alberti bass that jumps an octave on beat 3, a quiet second voice in thirds).
// A bar is 16 sixteenths. A lead is "NOTE:len ..."; a bass is [[chord, len], ...].
// build() turns the score into the note list sfx.js plays. Pure data: no audio here.
'use strict';
(() => {
    const BPM = 120;

    const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const CHORD = {
        Am: ['A2', 'C3', 'E3'],
        E: ['E2', 'G#2', 'B2'],
        Dm: ['D2', 'F2', 'A2'],
        'Dm/F': ['F2', 'A2', 'D3'],
        C: ['C2', 'E2', 'G2'],
        G7: ['G2', 'B2', 'F3'],
        F: ['F2', 'A2', 'C3'],
    };

    // [lead, bass, bass style]
    const V1 = {
        1: ['B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4', [['Am', 16]], 'alberti'],
        2: ['F5:1 E5:1 D#5:1 E5:1 B5:2 A5:2 G#5:4 E5:4', [['E', 16]], 'alberti'],
        3: ['A5:2 E5:2 C5:2 A4:2 D5:3 C5:1 B4:2 A4:2', [['Am', 8], ['Dm/F', 8]], 'alberti'],
        4: ['G#4:2 B4:2 E5:2 D5:2 C5:2 B4:2 A4:4', [['E', 8], ['Am', 8]], 'alberti'],
        5: ['D5:1 C#5:1 D5:1 F5:1 A5:2 F5:2 D5:2 F5:2 E5:2 D5:2', [['Dm', 16]], 'alberti'],
        6: ['C5:1 B4:1 C5:1 E5:1 A5:4 G5:2 F5:2 E5:4', [['Am', 16]], 'alberti'],
        7: ['F5:2 D5:2 B4:2 G#4:2 A4:1 B4:1 C5:1 D5:1 E5:4', [['E', 16]], 'alberti'],
        8: ['A5:1 G#5:1 A5:1 B5:1 C6:2 B5:1 A5:1 G#5:2 E5:2 A5:4', [['E', 12], ['Am', 4]], 'alberti'],
        9: ['E5:2 G5:2 C6:2 G5:2 E5:1 F5:1 G5:1 A5:1 G5:4', [['C', 16]], 'octave'],
        10: ['F5:2 D5:2 B4:2 D5:2 G5:1 F5:1 E5:1 D5:1 C5:2 B4:2', [['G7', 16]], 'octave'],
        11: ['C5:1 E5:1 G5:1 C6:1 E6:2 D6:2 C6:2 G5:2 E5:4', [['C', 16]], 'octave'],
        12: ['D5:1 E5:1 F5:1 D5:1 B4:2 D5:2 E5:4 G#4:4', [['G7', 8], ['E', 8]], 'octave'],
        13: ['A5:2 F5:2 C5:2 F5:2 A5:1 G5:1 F5:1 E5:1 F5:4', [['F', 16]], 'octave'],
        14: ['E5:1 D5:1 C5:1 D5:1 E5:2 G5:2 C6:4 B5:2 G5:2', [['C', 8], ['G7', 8]], 'octave'],
        15: ['F5:2 A5:2 D6:2 C6:2 B5:1 A5:1 G5:1 F5:1 E5:2 D5:2', [['Dm', 8], ['G7', 8]], 'octave'],
        16: ['C5:1 E5:1 G5:1 C6:1 B5:1 C6:1 D6:1 B5:1 C6:8', [['C', 16]], 'octave'],
    };

    const V2 = {
        1: ['A5:4 E5:2 F5:2 E5:4 D5:1 C5:1 B4:1 C5:1', [['Am', 16]]],
        2: ['B4:4 G#4:2 A4:2 B4:2 C5:1 C#5:1 D5:2 D#5:2', [['E', 16]]],
        3: ['E5:4 A5:2 G#5:2 A5:4 F5:2 D5:2', [['Am', 8], ['Dm/F', 8]]],
        4: ['B4:1 A4:1 G#4:1 A4:1 B4:2 E5:2 C5:1 B4:1 A4:1 G#4:1 A4:4', [['E', 8], ['Am', 8]]],
        5: ['D5:4 F5:2 E5:2 D5:2 C#5:1 D5:1 A5:4', [['Dm', 16]]],
        6: ['C5:4 E5:2 D5:2 C5:2 B4:1 C5:1 E5:4', [['Am', 16]]],
        7: ['F5:1 E5:1 D#5:1 E5:1 G#5:2 B5:2 D6:4 B5:2 G#5:2', [['E', 16]]],
        8: ['A5:4 E5:2 C5:2 B4:2 G#4:2 A4:4', [['Am', 4], ['E', 8], ['Am', 4]]],
        9: ['G5:4 E5:2 F5:2 G5:2 A5:1 A#5:1 B5:2 C6:2', [['C', 16]]],
        10: ['D6:4 B5:2 C6:2 B5:1 A5:1 G5:1 A5:1 G5:4', [['G7', 16]]],
        11: ['E6:4 C6:2 G5:2 A5:2 G5:1 F5:1 E5:4', [['C', 8], ['Am', 8]]],
        12: ['F5:4 D5:2 E5:2 F5:1 E5:1 D#5:1 E5:1 G#5:2 B4:2', [['Dm', 8], ['E', 8]]],
        13: ['C6:4 A5:2 F5:2 A5:2 G5:1 F5:1 C6:4', [['F', 16]]],
        14: ['E5:4 G5:2 F5:2 E5:1 D5:1 C5:1 D5:1 B4:4', [['C', 8], ['G7', 8]]],
        15: ['F5:4 A5:2 G5:2 F5:2 F#5:1 G5:1 D6:4', [['Dm', 8], ['G7', 8]]],
        16: ['E6:4 D6:2 B5:2 C6:1 B5:1 A5:1 B5:1 C6:4', [['C', 16]]],
    };

    const ORDER = [1, 2, 3, 4, 9, 10, 11, 12, 5, 6, 7, 8, 13, 14, 15, 16];

    // Note kinds, as sfx.js voices them.
    const LEAD = 0, HARM = 1, BASS = 2, HAT = 3, HAT_ACCENT = 4;

    function hz(note) {
        const pitch = note.slice(0, -1), octave = +note.slice(-1);
        const midi = (octave + 1) * 12 + SEMI[pitch];
        return 440 * 2 ** ((midi - 69) / 12);
    }

    // A diatonic third below, for v2's second voice. G becomes G# over E.
    function thirdBelow(note, chord) {
        let i = LETTERS.indexOf(note[0]) - 2, octave = +note.slice(-1);
        if (i < 0) { i += 7; octave--; }
        const letter = LETTERS[i];
        return letter + (letter === 'G' && chord === 'E' ? '#' : '') + octave;
    }

    function chordAt(bass, x) {
        let t = 0;
        for (const [name, len] of bass) {
            if (x < t + len) return name;
            t += len;
        }
        return bass[bass.length - 1][0];
    }

    // Appends one bar's notes as [start16, len16, hz, kind]; returns the next bar's start.
    function bar(rows, [lead, bass, style], blend, t0) {
        let t = 0;
        for (const token of lead.split(' ')) {
            const [note, len] = token.split(':'), len16 = +len;
            rows.push([t0 + t, len16, hz(note), LEAD]);
            if (blend && len16 >= 4) rows.push([t0 + t, len16, hz(thirdBelow(note, chordAt(bass, t))), HARM]);
            t += len16;
        }
        if (blend) {
            for (let k = 0; k < 8; k++) {
                const [lo, mid, hi] = CHORD[chordAt(bass, k * 2)].map(hz);
                rows.push([t0 + k * 2, 2, [lo, hi, mid, hi, lo * 2, hi, mid, hi][k], BASS]);
            }
        } else {
            let s = 0;
            for (const [name, len] of bass) {
                const [lo, mid, hi] = CHORD[name].map(hz);
                const pattern = style === 'alberti' ? [lo, hi, mid, hi] : [lo, lo * 2];
                for (let k = 0; k < len >> 1; k++) rows.push([t0 + s + k * 2, 2, pattern[k % pattern.length], BASS]);
                s += len;
            }
        }
        for (let k = 0; k < 16; k += 2) rows.push([t0 + k, 1, 0, k === 4 || k === 12 ? HAT_ACCENT : HAT]);
        return t0 + 16;
    }

    // The whole suite as notes { t, d, f, k } (start and length in seconds), sorted by start,
    // plus the loop length in seconds.
    function build() {
        const rows = [];
        let t0 = 0;
        for (const n of ORDER) t0 = bar(rows, V1[n], false, t0);
        for (const n of ORDER) t0 = bar(rows, V2[n], true, t0);
        rows.sort((a, b) => a[0] - b[0]);
        const sixteenth = 60 / BPM / 4;
        return {
            notes: rows.map(([s, len, f, k]) => ({ t: s * sixteenth, d: len * sixteenth, f, k })),
            len: t0 * sixteenth,
        };
    }

    SM.music = { LEAD, HARM, BASS, HAT, HAT_ACCENT, build };
})();
