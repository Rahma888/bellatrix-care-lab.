// Presence by camera motion (js/presence.js): the pure algorithm with synthetic 64x48 images.
// Run: node tests/presence.test.mjs     (no camera, no sound, nothing written)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, localStorage: { getItem: () => null }, setTimeout, clearTimeout, setInterval, clearInterval, Uint8Array };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/presence.js'), 'utf8'), ctx, { filename: 'presence.js' });
const P = ctx.Presence, N = P.W * P.H;
const flat = (v) => new Uint8Array(N).fill(v);
const blob = (base, n, v) => { const a = flat(base); for (let i = 0; i < n; i++) a[i * 7 % N] = v; return a; };

test('identical images: no motion; small noise stays under the threshold', () => {
  assert.equal(P.diff(flat(100), flat(100)), 0);
  const noisy = flat(100).map((x, i) => x + (i % 5)); // +0..4 per pixel, far under the pixel limit
  assert.equal(P.diff(flat(100), noisy), 0);
});
test('a moving shape is seen as a share of changed pixels', () => {
  const s = P.diff(flat(50), blob(50, 300, 200));
  assert.ok(s > 0.09 && s < 0.11, 'share ' + s);
  assert.equal(P.diff(flat(1), new Uint8Array(3)), 0, 'sizes differ: no verdict');
});
test('present at once on motion, absent only after 20 s without motion', () => {
  const st = P.fresh();
  P.update(st, 0, 0);
  assert.equal(st.present, false);
  P.update(st, 0.1, 1000);
  assert.equal(st.present, true);
  P.update(st, 0, 9500);
  assert.equal(st.present, true, 'still present after 8 s without motion');
  assert.equal(st.recent, false, 'but no recent motion');
  P.update(st, 0, 20999);
  assert.equal(st.present, true);
  P.update(st, 0, 21001);
  assert.equal(st.present, false);
  P.update(st, 0.1, 22000);
  assert.equal(st.present, true);
});
test('the threshold is adjustable', () => {
  const st = P.fresh();
  P.update(st, 0.03, 0, { threshold: 0.05 });
  assert.equal(st.present, false);
  P.update(st, 0.03, 100, { threshold: 0.01 });
  assert.equal(st.present, true);
});
test('grey values from RGBA, and the test switch', () => {
  const g = P.grey(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]));
  assert.equal(g[0] >= 254, true); assert.equal(g[1], 0);
  ctx.localStorage = { getItem: (k) => (k === 'bellatrix-presence-off' ? '1' : null) };
  assert.equal(P.isPresent(), true, 'bellatrix-presence-off=1: always present');
  const stop = P.watch(() => {}); stop();
});
