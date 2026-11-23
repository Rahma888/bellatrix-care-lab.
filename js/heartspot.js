/* Bellatrix: the red heart of the pointing prototype (23 Nov, Rahma), found by its colour in a camera picture.
   The same rules as the app's android hands/HeartSpot.java, for the page's own camera: a PC webcam (testing before
   the robot), or a tablet whose app cannot follow the heart. js/core.js draws the picture small (about 160 pixels
   on its long side) and calls find() with step 1, which is the app's grid (640 x 480 tested every 4th pixel).
   - a pixel is "heart red" when (red - max(green, blue)) / red >= 47 % and red >= 70: skin, even pink skin in warm
     light, stays below; the heart is 45-85 %;
   - the red samples are grouped into touching patches (8 neighbours); the patch kept is the biggest that is round
     and solid (a thin red stripe of a sleeve loses); patches at most GAP cells from it join (fingers across the
     heart cut it in pieces);
   - for FOLLOW_MS after a heart, only red near it counts (a heart hidden in a fist is "not seen" instead of jumping
     to something red behind the person).
   find() returns { x, y (0..1 of the picture), area (share of the grid), samples } or null. No picture is kept.
   23 Nov, third try (Rahma): create({ kind: 'pen' }) follows a fluorescent yellow-green highlighter instead (a
   colour almost nothing else has: skin, wood, clothes and screens stay out) and also counts its dark green cap
   around it (capSamples): the thumb pressing the cap hides it, that is the press. The stick may be long and
   diagonal, so for the pen the biggest patch wins (no roundness test); a patch with the cap next to it is preferred.
   ES5, no dependencies. */
(function (root) {
  'use strict';
  var SAT_PCT = 47, MIN_SAMPLES = 20, FOLLOW_MS = 1500, GAP = 3;

  function isRed(r, g, b) { var m = g > b ? g : b; return r >= 70 && (r - m) * 100 >= SAT_PCT * r; }
  /* the highlighter's body: bright yellow-green (green high, red close to it, blue far below, well saturated) */
  function isNeon(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return g >= 110 && r * 100 >= 55 * g && r * 100 <= 108 * g && b * 10 <= 6 * g && (mx - mn) * 100 >= 45 * mx;
  }
  /* its cap: darker green (green well above red and above blue) */
  function isCap(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return g >= 50 && g * 100 >= 135 * r && g * 10 >= 11 * b && (mx - mn) * 100 >= 35 * mx && !isNeon(r, g, b);
  }

  function create(opt) {
    var pen = !!(opt && opt.kind === 'pen'), test = pen ? isNeon : isRed;
    var last = { gx: 0, gy: 0, reach: 4, at: -1e15 };
    var mask = null, label = null, queue = null;

    /* data: RGBA bytes (canvas getImageData), w x h pixels; step: pixels between two tests; now: ms (for following) */
    function find(data, w, h, step, now) {
      step = step || 1;
      if (!data || w < step || h < step || data.length < w * h * 4) return null;
      var gw = Math.ceil(w / step), gh = Math.ceil(h / step), cap = gw * gh, n = 0, gx, gy, i, o;
      if (!mask || mask.length < cap) { mask = new Uint8Array(cap); label = new Int32Array(cap); queue = new Int32Array(cap); }
      for (gy = 0; gy < gh; gy++) {
        for (gx = 0; gx < gw; gx++) {
          o = ((gy * step) * w + gx * step) * 4; i = gy * gw + gx;
          mask[i] = test(data[o], data[o + 1], data[o + 2]) ? 1 : 0; label[i] = 0;
          if (mask[i]) n++;
        }
      }
      if (n < MIN_SAMPLES) return null;
      var comps = [], c, head, tail, q, qx, qy, dx, dy, nx, ny, j, cur;
      for (i = 0; i < cap; i++) {
        if (!mask[i] || label[i]) continue;
        c = comps.length + 1; cur = { n: 0, sx: 0, sy: 0, x0: gw, x1: -1, y0: gh, y1: -1, joined: false };
        head = 0; tail = 0; label[i] = c; queue[tail++] = i;
        while (head < tail) {
          q = queue[head++]; qx = q % gw; qy = (q - qx) / gw;
          cur.n++; cur.sx += qx; cur.sy += qy;
          if (qx < cur.x0) cur.x0 = qx; if (qx > cur.x1) cur.x1 = qx; if (qy < cur.y0) cur.y0 = qy; if (qy > cur.y1) cur.y1 = qy;
          for (dy = -1; dy <= 1; dy++) {
            ny = qy + dy; if (ny < 0 || ny >= gh) continue;
            for (dx = -1; dx <= 1; dx++) {
              nx = qx + dx; if (nx < 0 || nx >= gw) continue;
              j = ny * gw + nx;
              if (mask[j] && !label[j]) { label[j] = c; queue[tail++] = j; }
            }
          }
        }
        comps.push(cur);
      }
      var following = now - last.at <= FOLLOW_MS, best = null, bestScore = 0, k, bw, bh, shape, fill, score, d;
      /* the cap samples in a window around a patch (the pen only) */
      function capNear(c) {
        var bw2 = c.x1 - c.x0 + 1, bh2 = c.y1 - c.y0 + 1, mxp = Math.round(0.5 * Math.max(bw2, bh2)) + 3;
        var xa = Math.max(0, c.x0 - mxp), xb = Math.min(gw - 1, c.x1 + mxp), ya = Math.max(0, c.y0 - mxp), yb = Math.min(gh - 1, c.y1 + mxp), n2 = 0, x, y, o2;
        for (y = ya; y <= yb; y++) for (x = xa; x <= xb; x++) { o2 = ((y * step) * w + x * step) * 4; if (isCap(data[o2], data[o2 + 1], data[o2 + 2])) n2++; }
        return n2;
      }
      for (k = 0; k < comps.length; k++) {
        c = comps[k]; bw = c.x1 - c.x0 + 1; bh = c.y1 - c.y0 + 1;
        shape = pen ? 1 : Math.sqrt(Math.min(bw, bh) / Math.max(bw, bh));
        fill = pen ? 1 : Math.min(1, c.n / (0.5 * bw * bh));
        score = c.n * shape * fill;
        if (pen && c.n >= MIN_SAMPLES / 2) { c.cap = capNear(c); if (c.cap >= 2) score *= 2; }
        if (following) {
          d = Math.sqrt(Math.pow(c.sx / c.n - last.gx, 2) + Math.pow(c.sy / c.n - last.gy, 2));
          if (d > 3 * last.reach + 6) continue;
          score *= 1 + 4 * Math.exp(-d / last.reach);
        }
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) return null;
      var mx0 = best.x0, mx1 = best.x1, my0 = best.y0, my1 = best.y1, sx = best.sx, sy = best.sy, cnt = best.n, joined = true;
      best.joined = true;
      while (joined) {
        joined = false;
        for (k = 0; k < comps.length; k++) {
          c = comps[k];
          if (c.joined || c.x0 > mx1 + GAP || c.x1 < mx0 - GAP || c.y0 > my1 + GAP || c.y1 < my0 - GAP) continue;
          c.joined = true; sx += c.sx; sy += c.sy; cnt += c.n; joined = true;
          mx0 = Math.min(mx0, c.x0); mx1 = Math.max(mx1, c.x1); my0 = Math.min(my0, c.y0); my1 = Math.max(my1, c.y1);
        }
      }
      if (cnt < MIN_SAMPLES) return null;
      last.gx = sx / cnt; last.gy = sy / cnt; last.at = now;
      last.reach = Math.max(4, 1.5 * Math.sqrt(cnt / Math.PI) + 2);
      return {
        x: Math.min(1, Math.max(0, (sx / cnt * step + step / 2) / w)),
        y: Math.min(1, Math.max(0, (sy / cnt * step + step / 2) / h)),
        area: cnt / cap, samples: cnt,
        capSamples: pen ? (best.cap !== undefined ? best.cap : capNear(best)) : 0
      };
    }
    function reset() { last.at = -1e15; }
    return { find: find, reset: reset };
  }

  var HeartSpot = { create: create, isRed: isRed, isNeon: isNeon, isCap: isCap, SAT_PCT: SAT_PCT, MIN_SAMPLES: MIN_SAMPLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = HeartSpot;
  if (root) root.HeartSpot = HeartSpot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
