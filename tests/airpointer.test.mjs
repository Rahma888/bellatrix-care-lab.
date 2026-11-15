// Tests for js/airpointer.js: the pointer for "pointing in the air". Silent, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AirPointer = require('../js/airpointer.js');

const W = 480, H = 640;           // the portrait picture the tablet's webcam delivers
const FPS = 15, DT = 1000 / FPS;   // a realistic hand-detection rate on the tablet

/* A synthetic hand: (x, y) in camera pixels near the knuckles, palm length L in pixels. */
function hand(x, y, L) {
  const p = (px, py) => ({ x: px / W, y: py / H, z: 0 });
  const lm = Array.from({ length: 21 }, () => p(x, y + 0.5 * L));
  lm[0] = p(x, y + 0.5 * L);               // wrist
  lm[5] = p(x - 0.35 * L, y - 0.5 * L);    // index base
  lm[9] = p(x, y - 0.5 * L);               // middle base: wrist to here = L
  lm[13] = p(x + 0.3 * L, y - 0.48 * L);
  lm[17] = p(x + 0.5 * L, y - 0.4 * L);   // palm width about 0.85 L, as on a real hand
  lm[8] = p(x - 0.35 * L, y - 1.4 * L);    // index tip
  return lm;
}
/* Feeds frames for `ms` milliseconds while the hand goes from a to b (linear), returns the last result. */
function move(ptr, t, a, b, ms, L, opts = {}) {
  const n = Math.max(1, Math.round(ms / DT));
  let r = null;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    r = ptr.update(hand(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, L), t.now += DT, W, H, !!opts.mirror, false);
  }
  return r;
}
function hold(ptr, t, at, ms, L, opts) { return move(ptr, t, at, at, ms, L, opts); }

test('first sight anywhere in the picture puts the cursor in the middle, never in a corner', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 };
  const r = ptr.update(hand(440, 600, 80), t.now, W, H, false, false);   // hand low right in the picture
  assert.ok(Math.abs(r.u - 0.5) < 1e-6 && Math.abs(r.v - 0.5) < 1e-6);
});

test('the cursor never stays stuck at an edge: moving back brings it back at once', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80, span = 2.0 * L;
  hold(ptr, t, [240, 320], 300, L);
  let r = move(ptr, t, [240, 320], [240 + 2 * span, 320], 600, L);      // far past the right edge
  r = hold(ptr, t, [240 + 2 * span, 320], 600, L);
  assert.ok(r.u > 0.97, 'at the right edge: ' + r.u);
  r = move(ptr, t, [240 + 2 * span, 320], [240 + 1.5 * span, 320], 400, L);  // half a screen back
  r = hold(ptr, t, [240 + 1.5 * span, 320], 800, L);
  assert.ok(Math.abs(r.u - 0.5) < 0.05, 'back in the middle: ' + r.u);
});

test('a small movement crosses the screen: KX palm lengths = full width, KY = full height', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  hold(ptr, t, [240, 320], 300, L);
  let r = move(ptr, t, [240, 320], [240 - 1.0 * L, 320 - 1.1 * L], 500, L);   // half the span left and up
  r = hold(ptr, t, [240 - 1.0 * L, 320 - 1.1 * L], 900, L);
  assert.ok(Math.abs(r.u - 0.0) < 0.05, 'left edge: ' + r.u);
  assert.ok(Math.abs(r.v - 0.0) < 0.05, 'top edge: ' + r.v);
});

test('the same gesture gives the same cursor movement close to the camera or far away', () => {
  const near = AirPointer.create({ engine: 'bellatrix' }), far = AirPointer.create({ engine: 'bellatrix' }), tn = { now: 1000 }, tf = { now: 1000 };
  hold(near, tn, [240, 320], 300, 120); hold(far, tf, [240, 320], 300, 60);
  // the same physical movement: 0.6 palm lengths to the right (twice as many pixels when the hand looks twice as big)
  move(near, tn, [240, 320], [240 + 0.6 * 120, 320], 400, 120); const a = hold(near, tn, [240 + 72, 320], 900, 120);
  move(far, tf, [240, 320], [240 + 0.6 * 60, 320], 400, 60); const b = hold(far, tf, [240 + 36, 320], 900, 60);
  assert.ok(Math.abs(a.u - b.u) < 0.02, a.u + ' vs ' + b.u);
  assert.ok(Math.abs(a.u - 0.8) < 0.04, 'moved 0.3 of the screen: ' + a.u);
});

test('tremor of a still hand is smoothed away', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  hold(ptr, t, [240, 320], 500, L);
  const ins = [], outs = [];
  for (let i = 0; i < 45; i++) {                       // 3 seconds of a trembling hand (±2 % of the span)
    const r = ptr.update(hand(240 + rnd() * 0.04 * 2 * L * 2, 320 + rnd() * 0.04 * 2.2 * L * 2, L), t.now += DT, W, H, false, false);
    ins.push(r.ru); outs.push(r.u);
  }
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  assert.ok(sd(outs) < sd(ins) * 0.5, 'smoothed ' + sd(outs).toFixed(4) + ' vs raw ' + sd(ins).toFixed(4));
});

test('a quick deliberate movement is followed without lag', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  hold(ptr, t, [240, 320], 500, L);
  move(ptr, t, [240, 320], [240 + 0.8 * L, 320], 200, L);          // 0.4 of the screen in 0.2 s
  const r = hold(ptr, t, [240 + 0.8 * L, 320], 300, L);
  assert.ok(Math.abs(r.u - 0.9) < 0.06, 'after 0.3 s: ' + r.u);
});

test('after a pause the cursor carries on where it was, wherever the hand comes back', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  hold(ptr, t, [240, 320], 300, L);
  move(ptr, t, [240, 320], [240 + 0.4 * L, 320], 300, L);
  const before = hold(ptr, t, [240 + 0.4 * L, 320], 900, L);
  t.now += 2500;                                                    // hand down for 2.5 s
  const r = ptr.update(hand(60, 560, L), t.now += DT, W, H, false, false);
  assert.ok(Math.abs(r.u - before.u) < 0.02 && Math.abs(r.v - before.v) < 0.02, before.u + ' -> ' + r.u);
});

test('a camera that faces the person: moving to the picture left moves the cursor right', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  hold(ptr, t, [240, 320], 300, L, { mirror: true });
  move(ptr, t, [240, 320], [240 - 0.6 * L, 320], 300, L, { mirror: true });
  const r = hold(ptr, t, [240 - 0.6 * L, 320], 800, L, { mirror: true });
  assert.ok(r.u > 0.75, 'cursor went right: ' + r.u);
});

test('unusable landmarks give no cursor instead of a wrong one', () => {
  const ptr = AirPointer.create();
  assert.equal(ptr.update(null, 1, W, H), null);
  assert.equal(ptr.update([{ x: 0.5, y: 0.5 }], 1, W, H), null);
  const lm = hand(240, 320, 80); lm[9] = { x: NaN, y: 0.5 };
  assert.equal(ptr.update(lm, 1, W, H), null);
});

test('settings can be changed live (gain)', () => {
  const ptr = AirPointer.create({ kx: 4, engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  hold(ptr, t, [240, 320], 300, L);
  move(ptr, t, [240, 320], [240 + 0.8 * L, 320], 300, L);
  const r = hold(ptr, t, [240 + 0.8 * L, 320], 900, L);
  assert.ok(Math.abs(r.u - 0.7) < 0.04, 'with kx 4, 0.8 palm = 0.2 screen: ' + r.u);
  ptr.config({ kx: 2 }); assert.equal(ptr.state().opt.kx, 2);
});

test('a one-picture detection glitch does not throw the cursor; a real new place is taken after 3 pictures', () => {
  const ptr = AirPointer.create({ engine: 'bellatrix' }), t = { now: 1000 }, L = 80;
  const before = hold(ptr, t, [240, 320], 900, L);
  // one wrong detection: far away and the palm looks half as big
  const g = ptr.update(hand(440, 600, L * 0.45), t.now += DT, W, H, false, false);
  assert.equal(g, null, 'glitch skipped');
  const after = hold(ptr, t, [240, 320], 300, L);
  assert.ok(Math.abs(after.u - before.u) < 0.02 && Math.abs(after.v - before.v) < 0.02, 'cursor stayed');
  // the hand really moved there (and really looks smaller): accepted on the third picture
  let r = null; for (let i = 0; i < 3; i++) r = ptr.update(hand(300, 360, L * 0.5), t.now += DT, W, H, false, false);
  assert.ok(r, 'accepted after 3 pictures');
});

test('Telekom engine (the default): palm in the camera picture, one-euro 1.2 / 1.5, full hot zone', () => {
  const ptr = AirPointer.create(), t = { now: 1000 }, L = 80;     // default engine = telekom
  let r = ptr.update(hand(240, 320, L), t.now, W, H, false, false);
  // palm centre of the synthetic hand: x + 0.1 L, y - 0.276 L (fractions of the picture)
  assert.ok(Math.abs(r.u - (240 + 8) / W) < 0.01 && Math.abs(r.v - (320 - 0.276 * L) / H) < 0.01, r.u + ',' + r.v);
  for (let i = 0; i < 20; i++) r = ptr.update(hand(360, 320, L), t.now += DT, W, H, false, false);
  assert.ok(Math.abs(r.u - (360 + 8) / W) < 0.01, 'follows the palm across the picture: ' + r.u);
});

test('Telekom engine with a hot zone: that part of the picture covers the whole screen', () => {
  const ptr = AirPointer.create({ engine: 'telekom', zone: [0.25, 0.25, 0.75, 0.75] }), t = { now: 1000 }, L = 80;
  let r; for (let i = 0; i < 20; i++) r = ptr.update(hand(0.75 * W - 8, 0.5 * H + 0.276 * L, L), t.now += DT, W, H, false, false);
  assert.ok(r.u > 0.98 && Math.abs(r.v - 0.5) < 0.02, r.u + ',' + r.v);
});
