// SNAKE-MAN · kin
// Player kinematics: the derivatives the ghosts read. Position is tracked unwrapped so
// velocity and acceleration don't glitch at the torus seams.
'use strict';
(() => {
    const { wrap } = SM.core;

    const kin = { ux: 0, uy: 0, v: { x: 0, y: -1 }, a: { x: 0, y: 0 }, trail: [] };
    const V_GAIN = 0.4;  // EMA gain for velocity  (1st derivative)
    const A_GAIN = 0.5;  // EMA gain for accel     (2nd derivative)

    function reset(x, y, d) {
        kin.ux = x; kin.uy = y;
        kin.v = { x: d.x, y: d.y };
        kin.a = { x: 0, y: 0 };
        kin.trail = [];
    }

    function step(d) {
        kin.ux += d.x; kin.uy += d.y;
        const nvx = kin.v.x + (d.x - kin.v.x) * V_GAIN;
        const nvy = kin.v.y + (d.y - kin.v.y) * V_GAIN;
        kin.a.x += ((nvx - kin.v.x) - kin.a.x) * A_GAIN;
        kin.a.y += ((nvy - kin.v.y) - kin.a.y) * A_GAIN;
        kin.v.x = nvx; kin.v.y = nvy;
        kin.trail.push({ x: kin.ux, y: kin.uy });
        if (kin.trail.length > 40) kin.trail.shift();
    }

    // Where will the head be T player-steps from now, reading `order` derivatives?
    function predict(order, T) {
        const hx = kin.ux, hy = kin.uy;
        if (order === 0) return { x: hx, y: hy };
        if (order === 1) return { x: hx + kin.v.x * T, y: hy + kin.v.y * T };
        // order 2: integrate forward with decaying acceleration, speed capped at 1 tile/step
        let px = hx, py = hy, vx = kin.v.x, vy = kin.v.y, ax = kin.a.x, ay = kin.a.y;
        for (let i = 0; i < Math.ceil(T); i++) {
            const f = Math.min(1, T - i);
            vx += ax; vy += ay;
            ax *= 0.85; ay *= 0.85;
            const m = Math.hypot(vx, vy);
            if (m > 1) { vx /= m; vy /= m; }
            px += vx * f; py += vy * f;
        }
        return { x: px, y: py };
    }

    function trailCentroid() {
        if (!kin.trail.length) return { x: kin.ux, y: kin.uy };
        let sx = 0, sy = 0;
        for (const p of kin.trail) { sx += p.x; sy += p.y; }
        return { x: sx / kin.trail.length, y: sy / kin.trail.length };
    }

    const toCell = p => ({ x: wrap(Math.round(p.x)), y: wrap(Math.round(p.y)) });

    SM.kin = { state: kin, reset, step, predict, trailCentroid, toCell };
})();
