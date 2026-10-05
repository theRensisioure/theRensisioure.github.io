// SNAKE-MAN · gfx
// Pixel art: colour helpers, ordered dithering, cached sprites composed sub-pixel by sub-pixel,
// and the pixel primitives (lines, rings, text) everything else draws with.
//
// Sprites are composed once into small cached canvases with a highlight / base / shadow ramp
// and ordered dithering between tones.
'use strict';
(() => {
    const { DIRS } = SM.core;
    const { ctx, P, S, snap, FONT } = SM.view;

    // --- colour + dithering helpers ---
    function hexToRgb(h) {
        h = h.replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    const rgbStr = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    function hsl(h, s = 1, l = 0.55) {
        const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return [f(0) * 255, f(8) * 255, f(4) * 255];
    }
    const HUES = 12;   // rainbow sprites are cached in 12 hue steps
    // Two-tone ramp: a highlight and a shadow around the base colour.
    function tones(base) {
        const c = typeof base === 'string' ? hexToRgb(base) : base;
        return {
            hi: rgbStr(mix(c, [255, 255, 255], 0.45)),
            base: rgbStr(c),
            lo: rgbStr(mix(c, [0, 0, 40], 0.45)),
            spec: rgbStr(mix(c, [255, 255, 255], 0.85)),
        };
    }
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + 0.5) / 16));
    const dither = (i, j, t) => t > BAYER[j & 3][i & 3];

    // Light comes from the top-left. L in ~[-1, 1]; dither across the band edges.
    function litTone(t, i, j, L) {
        if (L > 0.55) return t.hi;
        if (L > 0.2) return dither(i, j, (L - 0.2) / 0.35) ? t.hi : t.base;
        if (L > -0.2) return t.base;
        if (L > -0.55) return dither(i, j, (-0.2 - L) / 0.35) ? t.lo : t.base;
        return t.lo;
    }

    // Compose a sprite one sub-pixel at a time. fn(i, j) returns a colour or null.
    function makeSprite(fn, size = S) {
        const c = document.createElement('canvas');
        c.width = c.height = size * P;
        const x = c.getContext('2d');
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
            const col = fn(i, j);
            if (col) { x.fillStyle = col; x.fillRect(i * P, j * P, P, P); }
        }
        return c;
    }
    const spriteCache = new Map();
    function cached(key, build) {
        let s = spriteCache.get(key);
        if (!s) { s = build(); spriteCache.set(key, s); }
        return s;
    }

    // --- sprites ---
    function pacSprite(di, frame) {
        return cached('pac' + di + frame, () => {
            const t = tones('#FFD700');
            const d = DIRS[di];
            const fa = Math.atan2(d.y, d.x);
            const mouth = [0.12, 0.45, 0.8][frame];
            const perp = d.x !== 0 ? { x: 0, y: -1 } : { x: -1, y: 0 };
            const ex = Math.round(4.5 + d.x * 0.6 + perp.x * 2.4 - 0.5), ey = Math.round(4.5 + d.y * 0.6 + perp.y * 2.4 - 0.5);
            return makeSprite((i, j) => {
                const dx = i - 4.5, dy = j - 4.5, r = Math.hypot(dx, dy);
                if (r > 4.95) return null;
                let a = Math.atan2(dy, dx) - fa;
                a = Math.atan2(Math.sin(a), Math.cos(a));
                if (Math.abs(a) < mouth && r > 0.8) return null;
                if (i === ex && j === ey) return '#2a1400';                   // eye
                if (i === ex && j === ey - 1) return t.lo;                     // brow shadow
                const L = -(dx * 0.7 + dy * 0.7) / 4.5;
                if (i === 2 && j === 2) return t.spec;                         // specular glint
                if (r > 4.1 && L < 0.1) return t.lo;                           // rim shadow
                return litTone(t, i, j, L);
            });
        });
    }

    const GHOST_EYES = [{ x: 2, y: 3 }, { x: 6, y: 3 }];
    const TIER_PUPIL = ['#1a2cff', '#8a2cff', '#ff2048', '#ff2048'];   // evolved ghosts' eyes redden
    // look: 0-3 = DIRS index, 4 = straight ahead. mode: normal | daze | flash
    // tier: 0-3 evolution level. armored: the one ghost that is never edible (silver rim, grey when dazed).
    function ghostSprite(color, frame, look, mode, tr = 0, armored = false) {
        return cached(`g${color}${frame}${look}${mode}${tr}${armored}`, () => {
            const dazed = mode !== 'normal';
            const body = armored && dazed ? '#5a5a6a' : mode === 'daze' ? '#2233ff' : mode === 'flash' ? '#e8e8f0' : color;
            const t = tones(body);
            const feature = armored && dazed ? '#ffffff' : mode === 'flash' ? '#ff3030' : '#ffc0b0';
            const lk = look < 4 ? DIRS[look] : { x: 0, y: 0 };
            const inside = (i, j) => {
                if (i < 0 || i > 9 || j < 0 || j > 9) return false;
                // silhouette: dome + body + animated skirt teeth
                if (j < 5) return Math.hypot(i - 4.5, j - 4.8) <= 4.9;
                if (j < 9) return true;
                return (i + frame) % 3 !== 2;
            };
            return makeSprite((i, j) => {
                if (!inside(i, j)) return null;
                if (armored && !(inside(i - 1, j) && inside(i + 1, j) && inside(i, j - 1))) {
                    return j < 5 && i < 5 ? '#ffffff' : '#a8a8b8';               // silver rim
                }

                if (mode === 'normal') {
                    for (const e of GHOST_EYES) {
                        const ei = i - e.x, ej = j - e.y;
                        if (tr >= 2 && ej === -1 && ei >= 0 && ei <= 1) return tr >= 3 ? '#300000' : t.lo; // scowl
                        if (ei < 0 || ei > 1 || ej < 0 || ej > 2) continue;
                        const pi = lk.x < 0 ? 0 : lk.x > 0 ? 1 : (e.x < 4 ? 1 : 0);
                        const pj = lk.y < 0 ? 0 : lk.y > 0 ? 2 : 1;
                        if (ei === pi && ej === pj) return TIER_PUPIL[tr];     // pupil
                        return ej === 2 ? '#b8b8d8' : '#ffffff';              // two-tone eye white
                    }
                } else {
                    if ((i === 3 || i === 6) && j === 3) return feature;       // beady eyes
                    if (j === 6 || j === 7) {                                  // wobbly mouth
                        if (i >= 1 && i <= 8 && (i % 2 === 0 ? j === 6 : j === 7)) return feature;
                    }
                }
                if (i === 2 && j === 1) return t.spec;
                const L = -(((i - 4.5) / 4.5) * 0.8 + ((j - 4.5) / 4.5) * 0.45);
                if (i === 9 || (j === 9) || (j >= 5 && i === 8 && dither(i, j, 0.5))) return t.lo;
                return litTone(t, i, j, L);
            });
        });
    }

    const BODY_HEAD = hexToRgb('#FFB000'), BODY_TAIL = hexToRgb('#8a3a00');
    const bodySprite = k => scaleSprite('body' + k, mix(BODY_HEAD, BODY_TAIL, k / 7)); // k: 0 (near head) .. 7 (tail tip)
    const rainbowBodySprite = hb => scaleSprite('rbody' + hb, hsl(hb * 360 / HUES, 0.9, 0.55));
    const coatBodySprite = k => scaleSprite('coat' + k, mix(hexToRgb('#b89cff'), hexToRgb('#4a3a80'), k / 7));
    function scaleSprite(key, rgb) {
        return cached(key, () => {
            const t = tones(rgb);
            return makeSprite((i, j) => {
                if ((i === 0 || i === 9) && (j === 0 || j === 9)) return null;   // rounded corners
                if (j === 0 || i === 0) return t.hi;                              // lit edge
                if (j === 9 || i === 9) return t.lo;                              // shadow edge
                // one raised diamond scale per segment
                const d = Math.abs(i - 4.5) + Math.abs(j - 4.5);
                const L = -((i - 4.5) * 0.7 + (j - 4.5) * 0.7) / 4.5;
                if (d <= 3) return (i === 4 && j === 2) ? t.spec : litTone(t, i, j, L * 1.4 + 0.1);
                if (d <= 4) return L > 0.3 ? t.base : t.lo;                      // scale outline
                return dither(i, j, 0.5 - L) ? t.lo : t.base;
            });
        });
    }

    function pelletSprite(frame) {
        return cached('pellet' + frame, () => {
            const t = tones('#FFEE00');
            const r = frame ? 2.9 : 2.4;
            return makeSprite((i, j) => {
                const dx = i - 4.5, dy = j - 4.5, d = Math.hypot(dx, dy);
                if (d > r) return null;
                if (i === 4 && j === 3) return '#ffffff';
                const L = -(dx * 0.7 + dy * 0.7) / r;
                return litTone(t, i, j, L);
            });
        });
    }

    // Twin cherries on a green stem (the fruit). frame bobs them a sub-pixel.
    function fruitSprite(frame) {
        return cached('fruit' + frame, () => {
            const red = tones('#EE1122'), stem = tones('#33AA33');
            const cy = frame ? 6.5 : 6;
            return makeSprite((i, j) => {
                for (const cx of [2.8, 6.4]) {
                    const dx = i - cx, dy = j - cy, d = Math.hypot(dx, dy);
                    if (d <= 2.1) {
                        if (Math.round(dx) === -1 && Math.round(dy) === -1) return '#ffffff';
                        return litTone(red, i, j, -(dx * 0.7 + dy * 0.7) / 2.1);
                    }
                }
                // stems: from each cherry up to a joint near the top right
                if ((j >= 1 && j <= cy - 2 && Math.abs(i - (2.8 + (cy - 2 - j) * 0.9)) < 0.6) ||
                    (j >= 1 && j <= cy - 2 && Math.abs(i - 6.4 - (cy - 2 - j) * 0.1) < 0.6)) return litTone(stem, i, j, 0.3);
                return null;
            });
        });
    }

    // A faceted gem whose bands of colour roll through the spectrum (hb = hue step).
    function rainbowPelletSprite(hb, frame) {
        return cached('rp' + hb + frame, () => {
            const r = frame ? 4.4 : 3.9;
            return makeSprite((i, j) => {
                const dx = i - 4.5, dy = j - 4.5;
                if (Math.abs(dx) + Math.abs(dy) > r) return null;
                if ((i === 4 && j === 2) || (frame && i === 3 && j === 3)) return '#ffffff';   // sparkle
                const t = tones(hsl((hb * 360 / HUES + (i - j) * 28 + 720) % 360, 1, 0.55));
                return litTone(t, i, j, -(dx * 0.7 + dy * 0.7) / r);
            });
        });
    }

    // Wall tile keyed by which neighbours are also wall (1=up 2=right 4=down 8=left).
    function wallSprite(mask) {
        return cached('wall' + mask, () => makeSprite((i, j) => {
            const oU = !(mask & 1), oR = !(mask & 2), oD = !(mask & 4), oL = !(mask & 8);
            if ((oU && j === 0) || (oL && i === 0)) return '#9a9aff';        // lit rim
            if ((oD && j === 9) || (oR && i === 9)) return '#2626b8';        // shadow rim
            if ((oU && j === 1) || (oL && i === 1)) return '#5050f0';
            if ((oD && j === 8) || (oR && i === 8)) return '#1c1c88';
            return (i % 2 === 0 && j % 2 === 0) ? '#1c1c70' : '#0c0c3a';     // 2x2-dithered fill
        }));
    }

    // Zone fence: a see-through lattice of crackling posts. Two frames so it shimmers.
    function fenceSprite(frame) {
        return cached('fence' + frame, () => makeSprite((i, j) => {
            if ((i + j + frame) % 4 === 0) return '#ff66ff';
            if ((i + j + frame) % 4 === 2 && (i + frame) % 2) return '#7a1f8a';
            return null;
        }));
    }

    // --- tunnelling ---
    const DIRT = tones('#7a5530');
    // The travelling bump of earth over a burrowing head. frame 0-1 wobbles the pebbles.
    function moundSprite(frame) {
        return cached('mound' + frame, () => makeSprite((i, j) => {
            const dx = (i - 4.5) / 4.8, dy = (j - 6 + frame * 0.4) / 3.6;
            if (dx * dx + dy * dy > 1) return null;
            if ((i * 7 + j * 3 + frame * 5) % 11 === 0) return '#c89c62';          // pebble glints
            const L = -(dx * 0.8 + dy * 0.9);
            return j >= 8 ? DIRT.lo : litTone(DIRT, i, j, L);
        }));
    }
    // A burrow mouth: a dark pit in a ring of kicked-up dirt. open 0..4 (4 = fully open).
    function holeSprite(open) {
        return cached('hole' + open, () => makeSprite((i, j) => {
            const k = open / 4, rx = 4.7 * k, ry = 3.6 * k;
            if (rx <= 0) return null;
            const dx = (i - 4.5) / rx, dy = (j - 5) / ry, d = dx * dx + dy * dy;
            if (d > 1) return null;
            if (d > 0.55) return dy < 0 ? DIRT.hi : dither(i, j, 0.5) ? DIRT.base : DIRT.lo;   // rim
            return dy < -0.2 ? '#0c0703' : '#1d1208';                                         // pit
        }));
    }
    // A body segment passing under open floor: a low ridge of disturbed earth.
    function ridgeSprite(v) {
        return cached('ridge' + v, () => makeSprite((i, j) => {
            const h = (i * 13 + j * 7 + v * 29) % 17;
            if (Math.abs(i - 4.5) + Math.abs(j - 4.5) > 5) return null;
            if (h < 3) return '#5a3e22';
            if (h < 5) return '#3a2814';
            return null;
        }));
    }
    // A heart for the healing ladder. full: lit red; empty: an outline.
    function heartSprite(full) {
        return cached('heart' + full, () => {
            const t = tones('#ff3355');
            return makeSprite((i, j) => {
                const x = (i - 4.5) / 4.2, y = -(j - 4) / 4.2;
                const f = (x * x + y * y - 0.6) ** 3 - x * x * y * y * y * 1.2;
                if (f > 0) return null;
                if (!full) {
                    const x2 = (i - 4.5) / 3, y2 = -(j - 4.2) / 3;
                    return (x2 * x2 + y2 * y2 - 0.6) ** 3 - x2 * x2 * y2 * y2 * y2 * 1.2 > 0 ? '#7a2a3a' : null;
                }
                if (i === 2 && j === 2) return t.spec;
                return litTone(t, i, j, -((i - 4.5) * 0.6 + (j - 4.5) * 0.8) / 4.5);
            });
        });
    }

    // --- pixel primitives (on the scene context) ---
    function pixelLine(x0, y0, x1, y1, color, every = 1) {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(1, Math.round(len / P));
        ctx.fillStyle = color;
        for (let k = 0; k <= n; k += every) {
            const t = k / n;
            ctx.fillRect(snap(x0 + (x1 - x0) * t) - P / 2, snap(y0 + (y1 - y0) * t) - P / 2, P, P);
        }
    }
    function pixelArrow(x, y, dx, dy, color) {
        const len = Math.hypot(dx, dy);
        if (len < 4) return;
        pixelLine(x, y, x + dx, y + dy, color);
        const ang = Math.atan2(dy, dx);
        for (const s of [-0.6, 0.6]) {
            pixelLine(x + dx, y + dy, x + dx - 8 * Math.cos(ang + s), y + dy - 8 * Math.sin(ang + s), color);
        }
    }
    function pixelRing(cx, cy, r, color) {
        ctx.fillStyle = color;
        const n = Math.max(10, Math.round(r * 1.1));
        for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2;
            ctx.fillRect(snap(cx + Math.cos(a) * r) - P / 2, snap(cy + Math.sin(a) * r) - P / 2, P, P);
        }
    }
    // Text with a hard two-tone drop shadow.
    function pixelText(text, x, y, size, color, shadow = '#000', align = 'center') {
        ctx.font = `${size}px ${FONT}`;
        ctx.textAlign = align;
        ctx.fillStyle = shadow;
        ctx.fillText(text, snap(x) + P, snap(y) + P);
        ctx.fillStyle = color;
        ctx.fillText(text, snap(x), snap(y));
    }

    SM.gfx = {
        hexToRgb, rgbStr, mix, hsl, HUES, tones, dither, litTone, makeSprite, cached,
        pacSprite, ghostSprite, bodySprite, rainbowBodySprite, coatBodySprite,
        pelletSprite, rainbowPelletSprite, fruitSprite, wallSprite, fenceSprite,
        moundSprite, holeSprite, ridgeSprite, heartSprite, DIRT,
        pixelLine, pixelArrow, pixelRing, pixelText,
    };
})();
