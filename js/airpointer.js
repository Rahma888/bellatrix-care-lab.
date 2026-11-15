/* Bellatrix: the pointer for "pointing in the air" (hand seen by a camera, cursor on the screen).
   Built for old people: small, slow, shaky movements must be enough, and the cursor must never get stuck.

   How a hand position becomes a cursor position (u, v from 0 to 1 across the screen):
   1. The point that is followed is a mix of the palm centre and the index fingertip: the palm is steady,
      the fingertip adds a little precision, so a trembling finger hardly moves the cursor.
   2. The gain is measured in palm lengths (wrist to the base of the middle finger, in camera pixels): a
      movement of KX palm lengths crosses the whole screen width, KY palm lengths the whole height. Close to the
      camera or far away, the same gesture gives the same cursor movement.
   3. A window of that size follows the hand: it never moves while the hand is inside it, and when the hand goes
      past one of its edges the window slides along (the cursor stays on that edge). So the cursor can never stay
      stuck in a corner while the hand is somewhere else, and nobody has to reach a fixed spot in the picture.
   4. When the hand comes back after a pause, the window is placed so that the cursor carries on where it was
      (kept away from the very edges), like lifting a mouse.
   5. A one-euro filter smooths the result: strong smoothing for slow and small movements (tremor), almost none for
      quick deliberate ones (no lag).
   No image is kept; only the 21 landmark points of the current frame are used. ES5, no dependencies. */
(function (root) {
  'use strict';

  var DEF = {
    kx: 2.0,        /* palm lengths for the whole screen width */
    ky: 2.2,        /* palm lengths for the whole screen height */
    tip: 0.4,       /* share of the index fingertip in the followed point (0 = palm centre only) */
    minCut: 1.0,    /* one-euro: cut-off (Hz) when still; lower = steadier */
    beta: 2.0,      /* one-euro: how much speed opens the filter; higher = quicker on fast moves */
    dCut: 1.0,      /* one-euro: cut-off for the speed estimate */
    sAlpha: 0.12,   /* smoothing of the palm length (it jitters a little from frame to frame) */
    regainMs: 1500, /* a hand away longer than this is placed again (cursor carries on where it was) */
    keep: 0.18      /* on a new placement the cursor is kept at least this far from the edges */
  };

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) if (b[k] !== undefined && b[k] !== null && isFinite(b[k])) o[k] = +b[k]; return o; }
  function ok(p) { return !!p && isFinite(p.x) && isFinite(p.y); }

  function euroAlpha(cut, dt) { var tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  function euro(f, x, t, o) {
    if (!f.t) { f.t = t; f.x = x; f.dx = 0; return x; }
    var dt = Math.max(0.001, (t - f.t) / 1000);
    f.t = t;
    var dx = (x - f.x) / dt;
    f.dx = f.dx + euroAlpha(o.dCut, dt) * (dx - f.dx);
    var cut = o.minCut + o.beta * Math.abs(f.dx);
    f.x = f.x + euroAlpha(cut, dt) * (x - f.x);
    return f.x;
  }

  /* The followed point and the palm length, in camera pixels. Returns null when the landmarks are unusable. */
  function measure(lm, W, H, o, mirrorX, flipY) {
    if (!lm || lm.length < 21) return null;
    var ids = [0, 5, 9, 13, 17], i, cx = 0, cy = 0;
    for (i = 0; i < ids.length; i++) { if (!ok(lm[ids[i]])) return null; cx += lm[ids[i]].x; cy += lm[ids[i]].y; }
    cx /= ids.length; cy /= ids.length;
    var tip = ok(lm[8]) ? lm[8] : { x: cx, y: cy };
    var x = (1 - o.tip) * cx + o.tip * tip.x, y = (1 - o.tip) * cy + o.tip * tip.y;
    if (mirrorX) x = 1 - x;
    if (flipY) y = 1 - y;
    /* Palm length; the palm width (index base to little finger base) backs it up when the hand is turned. */
    var len = Math.hypot((lm[9].x - lm[0].x) * W, (lm[9].y - lm[0].y) * H);
    var wid = Math.hypot((lm[17].x - lm[5].x) * W, (lm[17].y - lm[5].y) * H) * 1.1;
    var s = Math.max(len, wid);
    if (!(s > 2)) return null;
    return { x: x * W, y: y * H, s: s };
  }

  function create(opt) {
    opt = opt || {};
    var o = merge(DEF, opt);
    var st = { cx: null, cy: null, s: 0, last: 0, u: 0.5, v: 0.5, fx: { t: 0, x: 0, dx: 0 }, fy: { t: 0, x: 0, dx: 0 } };

    /* lm: 21 landmarks (normalised 0..1 in the picture the model saw); W, H: that picture in pixels;
       mirrorX: true for a camera that faces the person (their right is the picture's left);
       flipY: true if the picture is upside down. Returns { u, v, ru, rv, s, px, py } or null. */
    function update(lm, t, W, H, mirrorX, flipY) {
      if (engine() === 'telekom') return telekom(lm, t, W, H, mirrorX, flipY);
      var m = measure(lm, W, H, o, mirrorX, flipY);
      if (!m) return null;
      /* A detection glitch (the model briefly takes something else for the hand: the point jumps far AND the palm
         suddenly looks much bigger or smaller) is skipped; if the new place holds for 3 pictures it is real. */
      if (st.cx !== null && t - st.last <= o.regainMs && st.s > 0 && st.lx !== undefined) {
        var jump = Math.hypot((m.x - st.lx) / (o.kx * st.s), (m.y - st.ly) / (o.ky * st.s)), ratio = m.s / st.s;
        if (jump > 0.5 && (ratio < 0.65 || ratio > 1.55) && (st.skip || 0) < 2) { st.skip = (st.skip || 0) + 1; return null; }
      }
      st.skip = 0; st.lx = m.x; st.ly = m.y;
      st.s = st.s && t - st.last <= o.regainMs ? st.s + (m.s - st.s) * o.sAlpha : m.s;
      var sx = o.kx * st.s, sy = o.ky * st.s;
      if (st.cx === null || t - st.last > o.regainMs) {
        var u0 = clamp(st.u, o.keep, 1 - o.keep), v0 = clamp(st.v, o.keep, 1 - o.keep);
        st.cx = m.x - (u0 - 0.5) * sx; st.cy = m.y - (v0 - 0.5) * sy;
        st.fx = { t: 0, x: 0, dx: 0 }; st.fy = { t: 0, x: 0, dx: 0 };
      }
      var ru = (m.x - st.cx) / sx + 0.5, rv = (m.y - st.cy) / sy + 0.5;
      if (ru < 0) { st.cx = m.x + 0.5 * sx; ru = 0; } else if (ru > 1) { st.cx = m.x - 0.5 * sx; ru = 1; }
      if (rv < 0) { st.cy = m.y + 0.5 * sy; rv = 0; } else if (rv > 1) { st.cy = m.y - 0.5 * sy; rv = 1; }
      st.last = t;
      var u = clamp(euro(st.fx, ru, t, o), 0, 1), v = clamp(euro(st.fy, rv, t, o), 0, 1);
      st.u = u; st.v = v;
      return { u: u, v: v, ru: ru, rv: rv, s: st.s, px: m.x, py: m.y };
    }
    /* The Telekom tablet app's pointer, copied as it is (shell/HandCursor.kt, HandCursorController, and
       shell/OneEuroFilter.kt): the palm steers; its position in the camera picture (fractions 0..1) goes through a
       one-euro filter with MIN_CUTOFF_HZ 1.2, BETA 1.5, DERIVATIVE_CUTOFF_HZ 1; then the hot zone (the part of the
       picture that stands for the whole screen, HotZone.mapX/mapY, clamped) maps it onto the screen. A hand that
       was gone starts afresh. Rahma 2026-11-13: the movement must be the same as in the Telekom app. */
    var TK = { minCut: 1.2, beta: 1.5, dCut: 1.0, goneMs: 250 };
    function engine() {
      if (opt && typeof opt.engine === 'string') return opt.engine;
      try { var e = root && root.localStorage && root.localStorage.getItem('bellatrix-air-engine'); if (e === 'telekom' || e === 'bellatrix') return e; } catch (x) { /* default */ }
      return 'telekom';
    }
    function zone() {
      var z = opt && opt.zone, s = null;
      if (!z) { try { s = root && root.localStorage && root.localStorage.getItem('bellatrix-air-zone'); } catch (x) { s = null; } if (s) z = String(s).split(',').map(parseFloat); }
      if (!z || z.length !== 4 || !(z[2] - z[0] > 0.05) || !(z[3] - z[1] > 0.05)) z = [0, 0, 1, 1];   /* HotZone.FULL */
      return z;
    }
    function telekom(lm, t, W, H, mirrorX, flipY) {
      if (!lm || lm.length < 21) return null;
      var ids = [0, 5, 9, 13, 17], i, x = 0, y = 0;
      for (i = 0; i < ids.length; i++) { if (!ok(lm[ids[i]])) return null; x += lm[ids[i]].x; y += lm[ids[i]].y; }
      x /= ids.length; y /= ids.length;
      if (mirrorX) x = 1 - x;
      if (flipY) y = 1 - y;
      if (!st.tk || t - st.tk.last > TK.goneMs) st.tk = { fx: { t: 0, x: 0, dx: 0 }, fy: { t: 0, x: 0, dx: 0 }, last: t };
      st.tk.last = t;
      var px = euro(st.tk.fx, x, t, TK), py = euro(st.tk.fy, y, t, TK), z = zone();
      var u = clamp((px - z[0]) / (z[2] - z[0]), 0, 1), v = clamp((py - z[1]) / (z[3] - z[1]), 0, 1);
      st.u = u; st.v = v; st.last = t;
      var s = Math.hypot((lm[9].x - lm[0].x) * W, (lm[9].y - lm[0].y) * H);
      return { u: u, v: v, ru: clamp((x - z[0]) / (z[2] - z[0]), 0, 1), rv: clamp((y - z[1]) / (z[3] - z[1]), 0, 1), s: s, px: px * W, py: py * H };
    }
    function config(c) { o = merge(o, c); }
    function reset() { st.cx = null; st.u = 0.5; st.v = 0.5; }
    function state() { return { cx: st.cx, cy: st.cy, s: st.s, u: st.u, v: st.v, opt: merge(o) }; }
    return { update: update, config: config, reset: reset, state: state };
  }

  var AirPointer = { create: create, DEF: DEF, _measure: measure };
  if (typeof module !== 'undefined' && module.exports) module.exports = AirPointer;
  if (root) root.AirPointer = AirPointer;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
