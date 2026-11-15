import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Posture = require('../js/posture.js');

function body(o) {
  const lm = [];
  for (let i = 0; i < 33; i++) lm.push({ x: 0.5, y: 0.5, visibility: 0 });
  const set = (i, x, y) => { lm[i] = { x, y, visibility: 0.95 }; };
  if (o.S) { set(11, o.S[0] - 0.08, o.S[1]); set(12, o.S[0] + 0.08, o.S[1]); }
  if (o.H) { set(23, o.H[0] - 0.06, o.H[1]); set(24, o.H[0] + 0.06, o.H[1]); }
  if (o.K) { set(25, o.K[0] - 0.06, o.K[1]); set(26, o.K[0] + 0.06, o.K[1]); }
  if (o.K) { set(27, o.K[0] - 0.06, o.K[1] + 0.2); set(28, o.K[0] + 0.06, o.K[1] + 0.2); } else { set(27, 0.5, 0.9); set(28, 0.5, 0.9); }
  return lm;
}
const seated = () => body({ S: [0.5, 0.35], H: [0.5, 0.6], K: [0.5, 0.66] });
const standing = () => body({ S: [0.5, 0.2], H: [0.5, 0.5], K: [0.5, 0.75] });
const lying = () => body({ S: [0.2, 0.5], H: [0.6, 0.52], K: [0.85, 0.5] });
const upper = () => body({ S: [0.5, 0.4], H: [0.5, 0.7] });

test('classify: seated, standing, lying', () => {
  assert.equal(Posture.classify(seated(), 0.75), 'seated');
  assert.equal(Posture.classify(standing(), 0.75), 'standing');
  assert.equal(Posture.classify(lying(), 0.75), 'lying');
});
test('classify: seated with a slight lean is still seated', () => {
  assert.equal(Posture.classify(body({ S: [0.58, 0.35], H: [0.5, 0.6], K: [0.5, 0.67] }), 0.75), 'seated');
});
test('classify: upper body only, noise, empty', () => {
  assert.equal(Posture.classify(upper(), 0.75), 'unknown');
  const noise = []; for (let i = 0; i < 33; i++) noise.push({ x: Math.random(), y: Math.random(), visibility: 0.1 });
  assert.equal(Posture.classify(noise, 0.75), 'unknown');
  assert.equal(Posture.classify([], 0.75), 'unknown');
  assert.equal(Posture.classify(null), 'unknown');
  assert.equal(Posture.classify(body({ S: [0.5, 0.2], H: [0.5, 0.5], K: [0.5, 0.66] }), 0.75), 'unknown');
});
test('classify: hips below the picture are not reliable', () => {
  assert.equal(Posture.classify(body({ S: [0.5, 0.5], H: [0.5, 1.3] }), 0.75), 'unknown');
});

function harness() {
  const ev = [];
  const w = Posture._createWatcher({
    show: () => ev.push('show'), hide: () => ev.push('hide'), say: () => ev.push('say'), done: (r) => ev.push('done:' + r)
  });
  return { ev, w, run(label, from, to, step = 250) { for (let t = from; t <= to; t += step) w.feed(label, t); } };
}

test('watcher: seated stable 2 s finishes', () => {
  const h = harness(); h.run('seated', 0, 1750);
  assert.deepEqual(h.ev, []);
  h.run('seated', 2000, 2250);
  assert.deepEqual(h.ev, ['done:seated']);
});
test('watcher: one wrong frame is outvoted', () => {
  const h = harness(); h.run('seated', 0, 1000); h.w.feed('standing', 1250); h.run('seated', 1500, 3000);
  assert.deepEqual(h.ev, ['done:seated']);
});
test('watcher: standing 3 s shows overlay once, speaks every 25 s, hides when seated', () => {
  const h = harness(); h.run('standing', 0, 2750);
  assert.deepEqual(h.ev, []);
  h.run('standing', 3000, 3250);
  assert.deepEqual(h.ev, ['show', 'say']);
  h.run('standing', 3500, 27500);
  assert.equal(h.ev.filter((e) => e === 'say').length, 1);
  h.run('standing', 27750, 28500);
  assert.equal(h.ev.filter((e) => e === 'say').length, 2);
  assert.equal(h.ev.filter((e) => e === 'show').length, 1);
  h.run('seated', 28750, 34000);
  assert.ok(h.ev.includes('hide'));
  assert.equal(h.ev[h.ev.length - 1], 'done:seated');
});
test('watcher: lying counts like standing', () => {
  const h = harness(); h.run('lying', 0, 3250);
  assert.deepEqual(h.ev, ['show', 'say']);
});
test('watcher: unknown 8 s finishes with unknown; interruption resets', () => {
  const h = harness(); h.run('unknown', 0, 7750);
  assert.deepEqual(h.ev, []);
  h.run('unknown', 8000, 8250);
  assert.deepEqual(h.ev, ['done:unknown']);
  const g = harness(); g.run('unknown', 0, 6000); g.run('seated', 6250, 7500); g.run('unknown', 7750, 13000);
  assert.ok(!g.ev.some((e) => e === 'done:unknown'));
});

// ---- API with fake camera and model ----
function fakeEnv(labels) {
  const state = { t: 0, ticks: null, camStopped: 0, modelClosed: 0, said: [], overlay: [], i: 0 };
  const deps = {
    now: () => state.t,
    setInterval: (fn) => { state.ticks = fn; return 1; },
    clearInterval: () => { state.ticks = null; },
    storage: { getItem: () => null },
    openCamera: () => Promise.resolve({ stop: () => state.camStopped++, frame: () => ({ source: {}, aspect: 0.75 }) }),
    loadModel: () => Promise.resolve({ detect: () => labels(state), close: () => state.modelClosed++ }),
    overlay: { show: () => state.overlay.push('show'), hide: () => state.overlay.push('hide') }
  };
  return { state, deps };
}
const flush = () => new Promise((r) => setImmediate(r));
async function drive(state, ms) { for (let t = 0; t <= ms; t += 250) { state.t = t; if (state.ticks) state.ticks(); } }

test('API: seated person, camera released, nothing spoken', async () => {
  const { state, deps } = fakeEnv(() => seated());
  let res = null;
  Posture.ensureSeated({ lang: 'en', say: (x) => state.said.push(x), deps }, (r) => { res = r; });
  await flush(); await drive(state, 4000);
  assert.equal(res, 'seated'); assert.equal(state.camStopped, 1); assert.equal(state.modelClosed, 1); assert.deepEqual(state.said, []);
});
test('API: standing then seated, phrase in each language', async () => {
  for (const [lang, txt] of [['en', 'Could you please sit down comfortably? I will wait for you.'], ['fr', 'Pourriez-vous vous asseoir confortablement s’il vous plaît ? Je vous attends.'], ['de', 'Würden Sie sich bitte bequem hinsetzen? Ich warte auf Sie.']]) {
    const { state, deps } = fakeEnv((s) => (s.t < 10000 ? standing() : seated()));
    let res = null;
    Posture.ensureSeated({ lang, say: (x) => state.said.push(x), deps }, (r) => { res = r; });
    await flush(); await drive(state, 16000);
    assert.deepEqual(state.said, [txt]);
    assert.deepEqual(state.overlay, ['show', 'hide']);
    assert.equal(res, 'seated');
  }
});
test('API: unknown for 8 s ends with unknown', async () => {
  const { state, deps } = fakeEnv(() => upper());
  let res = null;
  Posture.ensureSeated({ lang: 'fr', deps }, (r) => { res = r; });
  await flush(); await drive(state, 9000);
  assert.equal(res, 'unknown');
});
test('API: camera or model failure gives unavailable at once', async () => {
  const a = fakeEnv(() => seated()); a.deps.openCamera = () => Promise.reject(new Error('x'));
  let r1 = null; Posture.ensureSeated({ deps: a.deps }, (r) => { r1 = r; }); await flush();
  assert.equal(r1, 'unavailable');
  const b = fakeEnv(() => seated()); b.deps.loadModel = () => Promise.reject(new Error('x'));
  let r2 = null; Posture.ensureSeated({ deps: b.deps }, (r) => { r2 = r; }); await flush();
  assert.equal(r2, 'unavailable'); assert.equal(b.state.camStopped, 1);
});
test('API: off switch and cancel', async () => {
  const a = fakeEnv(() => seated()); a.deps.storage = { getItem: (k) => (k === 'bellatrix-posture-off' ? '1' : null) };
  let r = null; Posture.ensureSeated({ deps: a.deps }, (x) => { r = x; });
  assert.equal(r, 'off');
  const b = fakeEnv(() => standing());
  let r2 = null; const cancel = Posture.ensureSeated({ lang: 'en', deps: b.deps }, (x) => { r2 = x; });
  await flush(); await drive(b.state, 3500);
  assert.deepEqual(b.state.overlay, ['show']);
  cancel();
  assert.deepEqual(b.state.overlay, ['show', 'hide']);
  assert.equal(b.state.camStopped, 1); assert.equal(r2, null);
});
