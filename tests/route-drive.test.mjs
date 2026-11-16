// 15 Nov (PLAN-NAV.md): mode "route", Bellatrix plans its own route with LabLand's Vergil planner and drives it
// waypoint by waypoint (android/src/de/labland/bellatrix/RouteDrive.java), on the PC:
//   - the drive against a simulated robot and bridge on a virtual clock (tests/route-sim/RouteSim.java), with the
//     real planner jar: rolling on through the points (handover, capped at half the leg), the place and its heading
//     at the end, a box (standstill, block 0.9 m ahead, replanning), a closed door (blocks dropped, 6 replans,
//     "blocked"), the drive limit, 1025, -109, -113, busy 3 times, result 3 from outside, endless avoidance,
//     suspend + recovery, STOP, the emergency stop, no map / no pose (mode place), no route, already there, and
//     Vergil's own office map (couch to kitchen, as reference/vergil/NavProbe.java);
//   - every number of PLAN-NAV.md's table is a named constant with a one-line reason, the build rules (no lambdas,
//     no inner or anonymous classes), the SDK codes agree with RobotBridge, the jars are on the build.
// Run: node tests/route-drive.test.mjs. Needs a JDK (javac, java), skipped without one. Silent: no robot, no network,
// no browser; compiles into a temporary folder that is removed at the end. ROUTE_SIM_VERBOSE=1 prints every drive's log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RD = 'android/src/de/labland/bellatrix/RouteDrive.java';
const RB = 'android/src/de/labland/bellatrix/RobotBridge.java';
const JARS = ['android/vendor/vergil-navigation.jar', 'android/vendor/kotlin-stdlib-2.0.20.jar'].map((j) => path.join(ROOT, j));
const OFFICE = path.join(ROOT, 'android/vendor/vergil-navigation-src/navigation/src/test/resources/labland.pgm');

/* The JDK the way android/build.ps1 finds it: JAVA_HOME, else the newest in Program Files, else the PATH. */
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

/* ---------------------------------------------------------------- the simulation (one JVM, every scenario) */
const J = jdk();
let lines = [], simError = '';
if (J) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-route-'));
  try {
    execFileSync(J.javac, ['--release', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-cp', JARS.join(path.delimiter), '-d', out,
      path.join(ROOT, RD), path.join(ROOT, 'android/src/de/labland/bellatrix/BlockSpot.java'), path.join(ROOT, 'tests/route-sim/RouteSim.java')], { stdio: 'pipe' });
    const r = spawnSync(J.java, ['-cp', [out].concat(JARS).join(path.delimiter), 'de.labland.bellatrix.RouteSim', OFFICE], { encoding: 'utf8', timeout: 120000 });
    lines = String(r.stdout || '').split(/\r?\n/);
    if (r.status !== 0 && !lines.some((l) => /^not ok - /.test(l))) simError = 'the simulation did not run: ' + (r.error || r.stderr || r.status);
    if (process.env.ROUTE_SIM_VERBOSE) console.log(lines.join('\n'));
  } catch (e) {
    simError = 'compiling the simulation failed: ' + String(e.stderr || e.message).slice(0, 2000);
  } finally {
    try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
}
const results = lines.filter((l) => /^(not )?ok - /.test(l));

test('the route drive simulation compiles with javac --release 8 and runs every scenario', { skip: !J && 'no JDK on this PC' }, () => {
  assert.equal(simError, '', simError);
  assert.ok(results.length >= 16, 'all scenarios ran (' + results.length + ')');
  assert.ok(lines.some((l) => /^# \d+ scenarios, 0 failed$/.test(l)), lines.filter((l) => /^# \d+ scenarios/.test(l)).join(' '));
});
for (const r of results) {
  const name = r.replace(/^(not )?ok - /, '').replace(/: .*$/, '').replace(/ \(state .*$/, '');
  test('drive: ' + name, () => {
    const i = lines.indexOf(r), log = [];
    for (let k = i + 1; k < lines.length && /^#   /.test(lines[k]); k++) log.push(lines[k]);
    assert.ok(/^ok - /.test(r), r + (log.length ? '\n' + log.join('\n') : ''));
  });
}

/* ---------------------------------------------------------------- the numbers and the build rules */
test('every number of PLAN-NAV.md\'s table is a named constant with a one-line reason above it', () => {
  const s = src(RD), rb = src(RB);
  const table = {
    INFLATE_M: '0.32', MAX_LEG_M: '10.0', TOLERANCE_M: '0.3', HANDOVER_M: '1.2', HANDOVER_LEG_SHARE: '0.5',
    LEG_BASE_MS: '6000L', LEG_MS_PER_M: '4000L', LEG_MAX_MS: '30000L', STALL_M: '0.10', STALL_MS: '8000L', AVOID_MS: '12000L',
    BLOCK_RADIUS_M: '0.6', MAX_REPLANS: '6', LEG_STARTS: '3', RESTART_DELAYS_MS: '{150L, 400L}',
    WATCH_MS: '250L', TIMEOUT_GRACE_MS: '5000L',
  };
  const rows = s.split(/\r?\n/);
  for (const [k, v] of Object.entries(table)) {
    const at = rows.findIndex((l) => new RegExp('^\\s+static final \\w+(\\[\\])? ' + k + ' = ').test(l));
    assert.ok(at > 0, k + ' is a constant');
    assert.equal(rows[at].replace(/^.* = /, '').replace(/;.*$/, ''), v, k);
    assert.match(rows[at - 1], /^\s*\/\*\* .{20,} \*\/$/, k + ' has a one-line reason');
  }
  // the drive limit is today's GLOBAL_LIMIT_MS, the wait after onRecovery RESUME_DELAY_MS: handed over, not copied
  assert.match(rb, /static final long GLOBAL_LIMIT_MS = 5 \* 60 \* 1000L;/);
  assert.match(rb, /static final long RESUME_DELAY_MS = 1500L;/);
  assert.match(rb, /new RouteDrive\(new RouteHost\(this\), token, place, goal\.getX\(\), goal\.getY\(\), goal\.getTheta\(\),\s+navStartedAt, GLOBAL_LIMIT_MS, RESUME_DELAY_MS\)/);
  // the speed: none passed (the SDK's default); startNavigation on a Pose with the leg's tolerance and timeout
  assert.match(rb, /startNavigation\(id, new Pose\(\(float\) x, \(float\) y, \(float\) theta\), tolerance, timeoutMs, l\)/);
  assert.match(s, /PgmMap\.INSTANCE\.parse\(pgm, Double\.valueOf\(INFLATE_M\)\)/);
  assert.match(s, /planner\.plan\(pose\[0\], pose\[1\], goalX, goalY, Double\.valueOf\(MAX_LEG_M\)\)/);
  assert.match(s, /planner\.block\(bx, by, BLOCK_RADIUS_M\)/);
});

test('the SDK codes of RouteDrive are RobotBridge\'s', () => {
  const s = src(RD), rb = src(RB);
  for (const k of ['RESULT_ARRIVED', 'RESULT_STOPPED', 'ERR_ALREADY_RUN', 'ERR_REQUEST_RES', 'ERR_TIMEOUT', 'ERR_IN_DESTINATION', 'ST_AVOID', 'ST_AVOID_END', 'ST_OUT_MAP', 'ST_NO_PATH']) {
    const a = new RegExp('static final int ' + k + ' = (-?\\d+);').exec(s), b = new RegExp('static final int ' + k + ' = (-?\\d+);').exec(rb);
    assert.ok(a && b, k);
    assert.equal(a[1], b[1], k);
  }
});

test('build rules: javac --release 8, static nested classes only, no lambdas, no inner or anonymous classes', () => {
  for (const f of [RD, RB, 'tests/route-sim/RouteSim.java']) {
    const code = src(f).replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   /* no strings, no comments */
    assert.doesNotMatch(code, /->/, f + ': no lambdas');
    assert.doesNotMatch(code, /::/, f + ': no method references');
    assert.doesNotMatch(code, /new [A-Z][\w.<>]*\s*\([^)]*\)\s*\{/, f + ': no anonymous classes');
    for (const m of code.matchAll(/^[ \t]+((?:public |private |protected )?(?:abstract )?(?:static )?(?:final )?)(class|interface|enum) (\w+)/gm)) {
      assert.ok(/static/.test(m[1]) || m[2] !== 'class', f + ': nested class ' + m[3] + ' is static');
    }
  }
  const b = src('android/build.ps1');
  assert.match(b, /javac --release 8/);
  assert.match(b, /vendor\\vergil-navigation\.jar/); assert.match(b, /vendor\\kotlin-stdlib-2\.0\.20\.jar/);
  assert.match(b, /\$Vendor = @\(/);
  assert.match(b, /Test-Path "\$w\\dex\\classes2\.dex"\) \{ throw/, 'a second dex fails the build');
  const c = src('android/check-dex.ps1');
  assert.match(c, /Lde\/labland\/vergil\/navigation\/RoutePlanner;/); assert.match(c, /Lkotlin\/jvm\/internal\/Intrinsics;/);
  assert.match(c, /d8 wrote one dex only/);
});

test('the two jars are as delivered (PLAN-NAV.md piece 1) and listed in vendor/SOURCES.md', async () => {
  const crypto = await import('node:crypto');
  const want = {
    'vergil-navigation.jar': [53513, 'f931c57b3e209f76d500b3c829e13978516e500781693f99218291951fb96910'],
    'kotlin-stdlib-2.0.20.jar': [1747659, 'fb169596659a518357c4b2c16f43dc75ab1c4980565ed4b4a317a050e5e39006'],
  };
  const sources = src('android/vendor/SOURCES.md');
  for (const [f, [size, sha]] of Object.entries(want)) {
    const buf = fs.readFileSync(path.join(ROOT, 'android/vendor', f));
    assert.equal(buf.length, size, f + ' size');
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), sha, f + ' SHA-256');
    assert.ok(sources.includes('`' + f + '`') && sources.includes(sha) && sources.includes(String(size)), f + ' in SOURCES.md');
  }
});

test('RobotBridge: mode place unchanged, the map read and released, the new fields and the switch', () => {
  const rb = src(RB), wa = src('android/src/de/labland/bellatrix/WebActivity.java');
  const old = fs.existsSync(path.join(ROOT, '.git')) ? (() => { try { return execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + RB], { encoding: 'utf8' }); } catch (e) { return ''; } })() : '';
  if (old) {   // today's place navigation, word for word (attempt, retry, arrived, watch and the listener)
    const body = (t, name) => { const i = t.indexOf(name); assert.ok(i >= 0, name); const j = t.indexOf('\n    }\r\n', i) >= 0 ? t.indexOf('\n    }\r\n', i) : t.indexOf('\n    }\n', i); return t.slice(i, j); };
    for (const m of ['void attempt(int token)', 'void retry(int token, int att, String why)', 'void arrived(int token, int att, String why)', 'void watch(int token, int att, float x0, float y0, long t0)', 'static final class Nav extends ActionListener', 'public String stop()']) {
      assert.equal(body(rb, m), body(old, m), m + ' is unchanged');
    }
  }
  assert.match(rb, /api\.getMapPgmPFD\(name\)/);
  assert.match(rb, /finally \{\s*\/\/[^\n]*\n\s*try \{ if \(api != null\) api\.releaseGetMapPgmPFD\(\); \}/, 'released in finally');
  assert.match(rb, /n\.put\("mode", navDriveMode\)/); assert.match(rb, /n\.put\("leg", navLeg\)/); assert.match(rb, /n\.put\("legs", navLegs\)/);
  for (const k of ['state', 'place', 'reason', 'since', 'attempt', 'waitedS', 'code', 'codeText']) assert.match(rb, new RegExp('n\\.put\\("' + k + '"'), 'navJson keeps ' + k);
  assert.match(rb, /o\.put\("navMode", navMode\)/);
  assert.match(rb, /static final String ROUTE_TAG = "RobotRoute";/);
  assert.match(rb, /NavLog\.INSTANCE\.setSink\(new RouteLog\(\)\)/);
  assert.match(wa, /public String robotNavMode\(String mode\)/);
  for (const m of ['robotGo(String place)', 'robotStop()', 'robotNav()', 'robotPlaces()', 'robotState()']) assert.ok(wa.includes('public String ' + m), m + ' stays');
  // the line endings of RobotBridge.java stay CRLF, every line
  const crlf = (rb.match(/\r\n/g) || []).length, lf = (rb.match(/\n/g) || []).length;
  assert.equal(crlf, lf, 'RobotBridge.java: CRLF on every line');
});
