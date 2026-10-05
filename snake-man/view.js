// SNAKE-MAN · view
// The canvases and the camera: world tile ↔ screen pixel. The game is drawn into an offscreen
// `scene` first, then presented through the CRT pass onto the visible canvas.
'use strict';
(() => {
    const { GRID_SIZE, W, CW, VIEW, wdeltaF, store } = SM.core;

    const canvas = document.getElementById('gameCanvas');
    canvas.width = CW; canvas.height = W;
    const dctx = canvas.getContext('2d');          // the visible screen (after the CRT pass)
    const scene = document.createElement('canvas'); // the game is drawn here first
    scene.width = canvas.width; scene.height = canvas.height;
    const ctx = scene.getContext('2d');

    // Zoom scales the whole world about the screen centre: below 1 shows more of the map, above 1
    // less. Only the picture changes; onScreen() follows it, so ghosts still spawn out of sight.
    const ZOOM_MIN = 0.6, ZOOM_MAX = 1.5;
    const clampZoom = z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    const cam = { x: 0, y: 0, z: clampZoom(+store.get('snakeman-zoom') || 1) };
    function setZoom(z) {
        z = clampZoom(z);
        if (z === cam.z) return;
        cam.z = z;
        store.set('snakeman-zoom', z.toFixed(3));
    }

    // Everything is pixel art on a sub-pixel grid: each 20px tile is 10x10 "sub-pixels" of 2px.
    const P = 2;                       // sub-pixel size in screen px
    const S = GRID_SIZE / P;           // sprite size in sub-pixels (10)
    const snap = v => Math.round(v / P) * P;
    const FONT = "'Press Start 2P', 'Courier New', monospace";

    // Screen centre of a world position (fractional positions work: animation uses them).
    const sx = x => CW / 2 + wdeltaF(cam.x, x) * GRID_SIZE;
    const sy = y => W / 2 + wdeltaF(cam.y, y) * GRID_SIZE;
    const viewHalf = () => VIEW / (2 * cam.z);                   // tiles from the centre to the top or bottom edge
    const viewHalfX = () => CW / GRID_SIZE / (2 * cam.z);        // ...and to the left or right edge
    const onScreen = (x, y) => Math.abs(wdeltaF(cam.x, x)) < viewHalfX() + 2 && Math.abs(wdeltaF(cam.y, y)) < viewHalf() + 2;

    // Camera eases toward a world position.
    function follow(x, y, dt) {
        const k = 1 - Math.exp(-dt / 90);
        cam.x = SM.core.wrap(cam.x + wdeltaF(cam.x, x) * k);
        cam.y = SM.core.wrap(cam.y + wdeltaF(cam.y, y) * k);
    }

    SM.view = { canvas, dctx, scene, ctx, cam, P, S, snap, FONT, sx, sy, onScreen, viewHalf, viewHalfX, follow, setZoom, ZOOM_MIN, ZOOM_MAX };
})();
