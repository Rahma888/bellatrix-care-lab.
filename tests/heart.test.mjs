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
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
