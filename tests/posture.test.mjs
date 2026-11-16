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
test('watcher (16 Nov): unknown 8 s asks anyway, 20 s more without "seated" finishes with unknown; interruption resets', () => {
  const h = harness(); h.run('unknown', 0, 7750);
  assert.deepEqual(h.ev, []);
  h.run('unknown', 8000, 8250);
  assert.deepEqual(h.ev, ['show', 'say']);
  h.run('unknown', 8500, 27750);
  assert.ok(!h.ev.includes('done:unknown'));
  h.run('unknown', 28000, 28250);
  assert.deepEqual(h.ev.slice(-2), ['hide', 'done:unknown']);
  const s = harness(); s.run('unknown', 0, 9000); s.run('seated', 9250, 12000);
  assert.deepEqual(s.ev, ['show', 'say', 'hide', 'done:seated'], 'asked, then seated: it starts');
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
test('API (16 Nov): unknown asks once at 8 s, ends with unknown at 28 s', async () => {
  const { state, deps } = fakeEnv(() => upper());
  let res = null;
  Posture.ensureSeated({ lang: 'fr', say: (x) => state.said.push(x), deps }, (r) => { res = r; });
  await flush(); await drive(state, 9000);
  assert.equal(res, null); assert.equal(state.said.length, 1);
  await drive(state, 29000);
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

// ---- 16 Nov: Rahma lay on her bed and was not asked to sit up ----
function withHead(lm, x, y) { lm[7] = { x: x - 0.02, y, visibility: 0.95 }; lm[8] = { x: x + 0.02, y, visibility: 0.95 }; return lm; }
function legs(lm, ax, ay) { lm[27] = { x: ax - 0.06, y: ay, visibility: 0.95 }; lm[28] = { x: ax + 0.06, y: ay, visibility: 0.95 }; return lm; }
test('classify (16 Nov): back on the pillows, legs flat on the bed, is lying', () => {
  // back about 40 degrees from upright, knees at the hips' height, ankles further out at the same height
  const lm = legs(body({ S: [0.32, 0.36], H: [0.5, 0.6], K: [0.75, 0.6] }), 0.98, 0.61);
  assert.equal(Posture.classify(lm, 0.75), 'lying');
  // the same back at 50 degrees, legs not seen: lying from the back alone
  assert.equal(Posture.classify(body({ S: [0.2, 0.4], H: [0.5, 0.6] }), 0.75), 'lying');
});
test('classify (16 Nov): head beside the shoulders, hips under the blanket, is lying', () => {
  const lm = withHead(body({ S: [0.45, 0.5] }), 0.25, 0.48);
  assert.equal(Posture.classify(lm, 0.75), 'lying');
});
test('classify (16 Nov): sitting in a chair stays seated (head above, feet below the knees, leaning back a bit)', () => {
  const upright = withHead(seated(), 0.5, 0.22);
  assert.equal(Posture.classify(upright, 0.75), 'seated');
  // leaning back about 20 degrees in an armchair, lower legs down
  const lean = withHead(body({ S: [0.4, 0.36], H: [0.5, 0.6], K: [0.7, 0.62] }), 0.37, 0.24);
  assert.equal(Posture.classify(lean, 0.75), 'seated');
  // only head and shoulders in the picture, the head upright above them: seated in front of the robot
  assert.equal(Posture.classify(withHead(body({ S: [0.5, 0.6] }), 0.5, 0.4), 0.75), 'seated');
  // ... but upside down (the head under the shoulders) is not known
  assert.equal(Posture.classify(withHead(body({ S: [0.5, 0.4] }), 0.5, 0.6), 0.75), 'unknown');
  // a picture upside down does not turn an upright person into a lying one
  assert.equal(Posture.classify(withHead(body({ S: [0.5, 0.65], H: [0.5, 0.4], K: [0.5, 0.34] }), 0.5, 0.78), 0.75), 'seated');
});
test('API (16 Nov): the result and the label counts are kept for the next look', async () => {
  const { state, deps } = fakeEnv((s) => (s.t < 6000 ? lying() : seated()));
  const kept = {}; deps.storage = { getItem: () => null, setItem: (k, v) => { kept[k] = v; } };
  let res = null;
  Posture.ensureSeated({ lang: 'fr', say: (x) => state.said.push(x), deps }, (r) => { res = r; });
  await flush(); await drive(state, 12000);
  assert.equal(res, 'seated');
  assert.equal(state.said.length, 1);
  const n = JSON.parse(kept['bellatrix-posture-last']);
  assert.equal(n.result, 'seated'); assert.ok(n.frames.lying > 10 && n.frames.seated > 5); assert.equal(n.last.label, 'seated');
});
test('API (16 Nov, c1): a picture that fails now and then does not end the check; only many in a row do', async () => {
  let n = 0;
  const a = fakeEnv((s) => { n++; if (n % 3 === 0) throw new Error('Packet timestamp mismatch'); return s.t < 6000 ? lying() : seated(); });
  const kept = {}; a.deps.storage = { getItem: () => null, setItem: (k, v) => { kept[k] = v; } };
  let r1 = null;
  Posture.ensureSeated({ lang: 'de', say: (x) => a.state.said.push(x), deps: a.deps }, (r) => { r1 = r; });
  await flush(); await drive(a.state, 14000);
  assert.equal(r1, 'seated');
  assert.equal(a.state.said.length, 1);
  const k = JSON.parse(kept['bellatrix-posture-last']);
  assert.ok(k.frames.errors > 3); assert.match(k.error, /timestamp/);
  const b = fakeEnv(() => { throw new Error('gone'); });
  let r2 = null;
  Posture.ensureSeated({ deps: b.deps }, (r) => { r2 = r; });
  await flush(); await drive(b.state, 1500);
  assert.equal(r2, null);
  await drive(b.state, 2500);
  assert.equal(r2, 'unavailable'); assert.equal(b.state.camStopped, 1);
});

test('API (16 Nov, c1): nobody found upright, found in the picture turned a quarter = lying, the person is asked', async () => {
  const { state, deps } = fakeEnv((s) => (s.t < 8000 ? null : seated()));
  deps.turned = () => true;   // the turned picture shows a person (shoulders and head)
  let res = null;
  Posture.ensureSeated({ lang: 'de', say: (x) => state.said.push(x), deps }, (r) => { res = r; });
  await flush(); await drive(state, 4000);
  assert.deepEqual(state.said, ['Würden Sie sich bitte bequem hinsetzen? Ich warte auf Sie.'], 'lying: asked after about 3 s');
  await drive(state, 12000);
  assert.equal(res, 'seated');
});
