// The red heart of the pointing prototype (23 Nov, Rahma): android hands/HeartSpot.java finds the heart by its
// colour. Run: node tests/heart.test.mjs. Needs a JDK (javac, java), skipped without one. Drawn pictures only
// (tests/heart-sim/HeartSim.java --synthetic): no camera, no person.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function jdk() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const ok = (d) => d && fs.existsSync(path.join(d, 'bin', 'javac' + exe)) && fs.existsSync(path.join(d, 'bin', 'java' + exe));
  if (ok(process.env.JAVA_HOME)) return { javac: path.join(process.env.JAVA_HOME, 'bin', 'javac' + exe), java: path.join(process.env.JAVA_HOME, 'bin', 'java' + exe) };
  if (process.platform === 'win32') {
    for (const base of ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft']) {
      let dirs = [];
      try { dirs = fs.readdirSync(base).map((d) => path.join(base, d)).filter(ok).sort().reverse(); } catch (e) { /* not there */ }
      if (dirs.length) return { javac: path.join(dirs[0], 'bin', 'javac.exe'), java: path.join(dirs[0], 'bin', 'java.exe') };
    }
  }
  const r = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  return r.status === 0 ? { javac: 'javac', java: 'java' } : null;
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); }
}

const J = jdk();
if (!J) { console.log('SKIP the red heart (no JDK)'); process.exit(0); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-heart-'));
let res = {};
try {
  execFileSync(J.javac, ['--release', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-d', out,
    path.join(ROOT, 'android/src/de/labland/bellatrix/hands/HeartSpot.java'), path.join(ROOT, 'tests/heart-sim/HeartSim.java')], { stdio: 'pipe' });
  const r = spawnSync(J.java, ['-cp', out, 'HeartSim', '--synthetic'], { encoding: 'utf8', timeout: 60000 });
  for (const line of String(r.stdout || '').split(/\r?\n/)) { if (line.trim()) { const o = JSON.parse(line); res[o.name] = o; } }
} finally {
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* locked */ }
}
const near = (o, x, y, tol = 0.02) => o && o.found && Math.abs(o.x - x) < tol && Math.abs(o.y - y) < tol;

test('a red heart is found at its place (300, 200 in 480 x 640)', () => assert.ok(near(res.heart, 300 / 480, 200 / 640), JSON.stringify(res.heart)));
test('a small red spot elsewhere does not pull the point away', () => assert.ok(near(res['heart-and-red-spot'], 300 / 480, 200 / 640), JSON.stringify(res['heart-and-red-spot'])));
test('skin, brown and pink are not a heart', () => assert.equal(res['no-heart'].found, false, JSON.stringify(res['no-heart'])));
test('the shaded side of the heart still counts', () => assert.ok(near(res['heart-shaded'], 300 / 480, 200 / 640) && res['heart-shaded'].area === res.heart.area, JSON.stringify(res['heart-shaded'])));
test('a heart in a fist looks much smaller (under 45 % of the open heart: the page reads "closed")', () => {
  assert.ok(res['heart-in-fist'].found === false || res['heart-in-fist'].area < 0.45 * res.heart.area, JSON.stringify(res['heart-in-fist']));
});
test('two fingers across the heart: the pieces are one heart', () => assert.ok(near(res['heart-split'], 300 / 480, 200 / 640, 0.04) && res['heart-split'].area > 0.4 * res.heart.area, JSON.stringify(res['heart-split'])));
test('following: a heart half hidden in a fist stays the heart, not the bigger red box further away', () => {
  assert.ok(near(res['follow-fist'], 305 / 480, 205 / 640, 0.05), JSON.stringify(res['follow-fist']));
  assert.ok(near(res['no-follow-fist'], 90 / 480, 510 / 640, 0.03), 'without the last frame the box would win: ' + JSON.stringify(res['no-follow-fist']));
});
/* js/heartspot.js (the page's copy, for a PC webcam) gives the same answers on the same drawn pictures. */
const require = (await import('node:module')).createRequire(import.meta.url);
const HS = require('../js/heartspot.js');
{
  const W = 480, H = 640, RED = [210, 30, 40], DARK = [120, 20, 25], SKIN = [222, 172, 140], BROWN = [150, 92, 60], PINK = [235, 150, 160];
  const room = () => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const g = 90 + ((i * 7919) % 40); d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g + 5; d[i * 4 + 3] = 255; } return d; };
  const put = (d, x, y, c) => { const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; };
  const disc = (d, cx, cy, r, c) => { for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(d, x, y, c); };
  const one = (d) => HS.create().find(d, W, H, 4, 0);
  const same = (name, js) => test('page copy = app: ' + name, () => {
    const j = res[name];
    if (!j.found) { assert.equal(js, null, JSON.stringify(js)); return; }
    assert.ok(js && Math.abs(js.x - j.x) < 0.005 && Math.abs(js.y - j.y) < 0.005 && Math.abs(js.area - j.area) < 0.0005, JSON.stringify({ js, java: j }));
  });
  let d = room(); disc(d, 120, 300, 70, SKIN); disc(d, 300, 200, 40, RED); same('heart', one(d));
  d = room(); disc(d, 300, 200, 40, RED); disc(d, 30, 600, 9, RED); same('heart-and-red-spot', one(d));
  d = room(); disc(d, 240, 320, 90, SKIN); disc(d, 360, 500, 50, BROWN); disc(d, 100, 100, 40, PINK); same('no-heart', one(d));
  d = room(); disc(d, 300, 200, 40, RED); for (let y = 176; y < 240; y++) for (let x = 260; x < 340; x++) put(d, x, y, SKIN); same('heart-in-fist', one(d));
  d = room(); disc(d, 300, 200, 40, RED); disc(d, 300, 200, 20, DARK); same('heart-shaded', one(d));
  d = room(); disc(d, 300, 200, 40, RED); for (let y = 150; y < 250; y++) for (let x = 0; x < W; x++) if ((x >= 280 && x < 290) || (x >= 310 && x < 320)) put(d, x, y, SKIN); same('heart-split', one(d));
  const f = HS.create(); d = room(); disc(d, 300, 200, 40, RED); f.find(d, W, H, 4, 1000);
  d = room(); disc(d, 305, 205, 40, RED); for (let y = 191; y < 260; y++) for (let x = 250; x < 360; x++) put(d, x, y, SKIN); for (let y = 480; y < 540; y++) for (let x = 60; x < 120; x++) put(d, x, y, RED);
  const fj = f.find(d, W, H, 4, 1033), j = res['follow-fist'];
  test('page copy = app: follow-fist', () => assert.ok(fj && Math.abs(fj.x - j.x) < 0.005 && Math.abs(fj.y - j.y) < 0.005, JSON.stringify({ fj, j })));
  test('page copy: isRed has the same rule (skin no, heart yes)', () => { assert.equal(HS.isRed(222, 172, 140), false); assert.equal(HS.isRed(210, 30, 40), true); assert.equal(HS.isRed(177, 106, 112), false); });
}
/* the highlighter (23 Nov, third try): the fluorescent body is followed, its dark green cap counted around it */
{
  const W = 320, H = 240, NEON = [215, 240, 70], CAP = [20, 140, 80], SKIN = [222, 172, 140], WALL = [232, 222, 150];
  const room = () => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const g = 80 + ((i * 7919) % 30); d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g + 4; d[i * 4 + 3] = 255; } return d; };
  const put = (d, x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; };
  const rect = (d, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(d, x, y, c); };
  const disc = (d, cx, cy, r, c) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(d, x, y, c); };
  const pen = (thumb) => { const d = room(); rect(d, 150, 100, 166, 180, NEON); disc(d, 158, 96, 8, CAP); rect(d, 120, 140, 200, 200, SKIN); if (thumb) rect(d, 140, 78, 178, 106, SKIN); return d; };
  const find = (d) => HS.create({ kind: 'pen' }).find(d, W, H, 1, 0);
  test('highlighter: the fluorescent body is found, with its cap next to it', () => {
    const r = find(pen(false));
    assert.ok(r && Math.abs(r.x - 158 / W) < 0.03 && r.capSamples > 30, JSON.stringify(r));
  });
  test('highlighter: the thumb on the cap hides it (the press), the body is still followed', () => {
    const r = find(pen(true));
    assert.ok(r && r.capSamples === 0, JSON.stringify(r));
  });
  test('highlighter: skin, a pale yellow wall and the red heart are not the highlighter', () => {
    const d = room(); rect(d, 0, 0, 120, 240, WALL); disc(d, 220, 120, 40, SKIN); disc(d, 280, 60, 25, [210, 30, 40]);
    assert.equal(find(d), null);
    assert.equal(HS.isNeon(232, 222, 150), false); assert.equal(HS.isNeon(215, 240, 70), true); assert.equal(HS.isCap(20, 140, 80), true); assert.equal(HS.isCap(215, 240, 70), false);
  });
  /* 24 Nov (the real tablet: the pen far away, its cap a few pixels): the pen's box, and the counts in a cut around it */
  test('highlighter: find() gives the pen\'s box; countPen counts its body and cap in a cut (and nothing of the cap under a thumb)', () => {
    const r = find(pen(false));
    /* the hand (skin from y 140) hides the lower part of the body: the box is the visible part, 150..166 x 100..140 */
    assert.ok(r.bx0 <= 150 / W + 0.01 && r.bx1 >= 166 / W - 0.01 && r.by0 <= 100 / H + 0.01 && r.by1 >= 140 / H - 0.01 && r.by1 <= 142 / H, 'the box holds the visible body ' + JSON.stringify(r));
    const cut = (d, x0, y0, w, h) => { const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) o[(y * w + x) * 4 + k] = d[((y0 + y) * W + x0 + x) * 4 + k]; return o; };
    const n = HS.countPen(cut(pen(false), 120, 70, 80, 120), 80, 120);
    assert.equal(n.s, r.samples, 'every visible body pixel, as find() counts them ' + JSON.stringify(n));
    assert.ok(n.c > 150 && Math.abs(n.cx - 38.5 / 80) < 0.03 && Math.abs(n.cy - 26.5 / 120) < 0.05, 'the cap and its centre ' + JSON.stringify(n));
    const t = HS.countPen(cut(pen(true), 120, 70, 80, 120), 80, 120);
    assert.ok(t.c === 0 && t.s > 0.8 * n.s, 'the thumb hides the cap, the body is still counted ' + JSON.stringify(t));
  });
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
