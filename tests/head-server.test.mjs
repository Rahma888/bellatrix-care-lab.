// The whole server on the robot head (android HeadServer + NodeService, 1.17), run on this PC the way the
// Android app runs it: a READ-ONLY copy of the pages and modules (the same folder and pattern rules as
// android\build.ps1 for assets/server/index.txt), a separate data folder (BELLATRIX_DATA, PORTAL_DATA),
// cwd = the copy, args "labland/store-server.mjs <port> --lan", HOME and TMPDIR in the head's folder.
// Also: the head's info route, first-start files (Web Push keys, portal, store data), a restart with the
// same data, the exit on a busy port, the Node 18 limit of nodejs-mobile, and js/head-server.js's rules
// for the call server address.
// Run: node tests/head-server.test.mjs. Silent; a free port on this PC; temporary folders removed at the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-head-'));
const APP = path.join(TMP, 'app'), DATA = path.join(TMP, 'data'), HOME = path.join(TMP, 'home'), TMPD = path.join(TMP, 'tmp');
const children = new Set();

/* ---------- the copy, as build.ps1 + HeadServer.prepare make it on the head ---------- */
function copyDir(src, dst, skip) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (skip && skip(s)) continue;
    if (e.isDirectory()) copyDir(s, d, skip);
    else if (e.isFile()) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(s, d); }
  }
}
function makeCopy() {
  fs.mkdirSync(path.join(APP, 'labland'), { recursive: true });
  /* web/...: what the WebView copy has (assets/web), minus vendor/mediapipe and the WebView's store copy */
  for (const d of ['css', 'js', 'vendor', 'img', 'fonts']) {
    if (fs.existsSync(path.join(ROOT, d))) copyDir(path.join(ROOT, d), path.join(APP, d), (p) => p === path.join(ROOT, 'vendor', 'mediapipe'));
  }
  /* server/...: every page, manifest and service worker, icons, labland's modules, store and pack sources */
  for (const f of fs.readdirSync(ROOT)) {
    if (/\.(html|webmanifest)$/.test(f) || /^sw-[a-z0-9-]+\.js$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(APP, f));
  }
  if (fs.existsSync(path.join(ROOT, 'icons'))) copyDir(path.join(ROOT, 'icons'), path.join(APP, 'icons'));
  for (const f of fs.readdirSync(path.join(ROOT, 'labland'))) {
    if (/\.mjs$/.test(f) || /^admin\.(html|js|css)$/.test(f)) fs.copyFileSync(path.join(ROOT, 'labland', f), path.join(APP, 'labland', f));
  }
  for (const d of ['store', 'packs']) if (fs.existsSync(path.join(ROOT, 'labland', d))) copyDir(path.join(ROOT, 'labland', d), path.join(APP, 'labland', d));
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function snapshot() {
  return walk(APP).map((f) => { const s = fs.statSync(f); return path.relative(APP, f) + ' ' + s.size + ' ' + s.mtimeMs; }).sort().join('\n');
}
function readOnly(on) { for (const f of walk(APP)) fs.chmodSync(f, on ? 0o444 : 0o666); }

makeCopy();
readOnly(true);
const BEFORE = snapshot();
for (const d of [DATA, HOME, TMPD]) fs.mkdirSync(d, { recursive: true });

function freePort() {
  return new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
}
/* The environment NodeService sets (Os.setenv) on top of what the process has. */
function headEnv() {
  const env = Object.assign({}, process.env, { BELLATRIX_DATA: DATA, PORTAL_DATA: path.join(DATA, 'portal'), HOME, TMPDIR: TMPD });
  for (const k of ['GAMES_DATA', 'ANTHROPIC_API_KEY', 'ICE_SERVERS', 'TURN_SECRET', 'PORT']) delete env[k];
  return env;
}
function startServer(port) {
  const child = spawn(process.execPath, ['labland/store-server.mjs', String(port), '--lan'], { cwd: APP, env: headEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('exit', () => children.delete(child));
  let out = '';
  const ready = new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('server did not start: ' + out)), 20000);
    const on = (b) => { out += String(b); if (out.includes('Close this window')) { clearTimeout(t); ok(); } };
    child.stdout.on('data', on);
    child.stderr.on('data', (b) => { out += String(b); });
    child.on('exit', (c) => { clearTimeout(t); ko(new Error('server exited ' + c + ': ' + out)); });
  });
  return { child, ready, log: () => out };
}
function stop(child) {
  return new Promise((ok) => { if (child.exitCode !== null) { ok(); return; } child.once('exit', () => ok()); child.kill(); });
}
async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return fn();
}

let port, base;

test('the server starts from a read-only copy with a separate data folder, like on the head', async () => {
  port = await freePort();
  base = 'http://127.0.0.1:' + port;
  const s = startServer(port);
  await s.ready;
  /* the pages the families and the tablet use */
  for (const f of ['/portail.html', '/famille.html', '/portail.webmanifest', '/sw-portail.js', '/css/brand.css', '/js/portail.js', '/js/qr.js', '/store/catalog.json']) {
    const r = await fetch(base + f);
    assert.equal(r.status, 200, f);
  }
  if (fs.existsSync(path.join(ROOT, 'jeu.html'))) assert.equal((await fetch(base + '/jeu.html')).status, 200, '/jeu.html');
  /* the display link (the tablet keeps working with bellatrix-link-server = http://<head>:8765) */
  const ping = await (await fetch(base + '/link/api/HEADTEST1/ping')).json();
  assert.equal(ping.ok, true);
  const run = { run: { id: 'r1', key: 'k', patient: 'Anna', opt: {}, position: null, at: 1 } };
  assert.equal((await fetch(base + '/link/api/HEADTEST1/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) })).status, 200);
  assert.equal((await (await fetch(base + '/link/api/HEADTEST1/next?wait=1')).json()).run.id, 'r1');
  /* the family portal API */
  const png = Buffer.from(await (await fetch(base + '/portal/api/icon-192.png')).arrayBuffer());
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  const key = crypto.randomBytes(32).toString('base64url');
  const hello = await fetch(base + '/portal/api/robot/hello', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robot: 'head_test_robot_1', key }) });
  assert.equal(hello.status, 200, await hello.text());
  /* "Ajouter un jeu" (labland/games.mjs): /jeu and /games/ are Node's (LinkServer.java has neither); the
     head's own call (this machine) makes the team code, kept in BELLATRIX_DATA/games */
  if (fs.existsSync(path.join(ROOT, 'labland', 'games.mjs'))) {
    assert.equal((await fetch(base + '/jeu')).status, 200, '/jeu');
    assert.equal((await fetch(base + '/games/api/list')).status, 200, '/games/api/list');
    const team = await fetch(base + '/games/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(team.status, 200, await team.text());
    assert.ok(await until(() => fs.existsSync(path.join(DATA, 'games', 'team.json')), 3000), 'games/team.json in the data folder');
  }
  /* the head's own route: Node answers "running"; the address comes from head-info.json (written by the app) */
  { const info = await (await fetch(base + '/head/api/info')).json(); assert.equal(info.node, 'running'); assert.equal(info.tunnel, null); assert.ok(info.clock && typeof info.clock.offsetMin === 'number'); }
  fs.writeFileSync(path.join(DATA, 'head-info.json'), JSON.stringify({ tunnel: 'https://quiet-river-test.trycloudflare.com', at: 1 }));
  assert.equal((await (await fetch(base + '/head/api/info')).json()).tunnel, 'https://quiet-river-test.trycloudflare.com');
  /* no LabLand key on a robot: the store signs no licence there, and never serves its data or keys */
  assert.equal((await fetch(base + '/store/api/licence?code=DEMO-2026')).status, 503);
  for (const f of ['/labland/data/store-data.json', '/labland/keys/labland-private.pem', '/labland/store-server.mjs']) assert.equal((await fetch(base + f)).status, 404, f);
  /* first start: the store data, the portal and the Web Push key pair are in the data folder */
  assert.ok(await until(() => fs.existsSync(path.join(DATA, 'portal', 'vapid-keys.json')), 5000), 'vapid-keys.json made at start');
  assert.ok(fs.existsSync(path.join(DATA, 'store-data.json')), 'store-data.json');
  assert.ok(await until(() => fs.existsSync(path.join(DATA, 'portal', 'portal.json')), 3000), 'portal.json');
  await stop(s.child);
  /* nothing was written next to the code */
  assert.equal(snapshot(), BEFORE, 'the copy of the pages and modules is unchanged');
  for (const d of ['labland/keys', 'labland/data', 'labland/store/packages/.tmp']) assert.ok(!fs.existsSync(path.join(APP, d)), d + ' not created');
});

test('a restart keeps the data: same Web Push keys, same portal', async () => {
  const vapid = JSON.parse(fs.readFileSync(path.join(DATA, 'portal', 'vapid-keys.json'), 'utf8')).publicKey;
  const s = startServer(port);
  await s.ready;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(JSON.parse(fs.readFileSync(path.join(DATA, 'portal', 'vapid-keys.json'), 'utf8')).publicKey, vapid);
  assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(DATA, 'portal', 'portal.json'), 'utf8')).robots).includes('head_test_robot_1'));
  /* a second server on the same port ends at once (the Android app then starts it again later) */
  const again = spawn(process.execPath, ['labland/store-server.mjs', String(port), '--lan'], { cwd: APP, env: headEnv(), stdio: 'ignore' });
  children.add(again);
  const code = await new Promise((ok) => { const t = setTimeout(() => ok('still running'), 15000); again.on('exit', (c) => { clearTimeout(t); ok(c); }); });
  assert.equal(code, 1, 'busy port: exit 1');
  await stop(s.child);
  assert.equal(snapshot(), BEFORE);
});

test('the server code runs on Node 18 (nodejs-mobile v18.20.4 on the head)', () => {
  const NEWER = [/\.toSorted\(/, /\.toReversed\(/, /\.toSpliced\(/, /Object\.groupBy\(/, /Map\.groupBy\(/, /Promise\.withResolvers\(/, /Array\.fromAsync\(/,
    /\.isWellFormed\(/, /import\.meta\.(dirname|filename)/, /fs\.globSync|fs\.promises\.glob/, /node:sqlite/, /process\.getBuiltinModule/, /crypto\.hash\(/,
    /URL\.canParse\(/, /AbortSignal\.any\(/, /new WebSocket\(/, /navigator\.(hardwareConcurrency|language|userAgent)/, /require\(['"][^'"]+\.mjs['"]\)/];
  const found = [];
  for (const f of fs.readdirSync(path.join(APP, 'labland')).filter((x) => x.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(APP, 'labland', f), 'utf8');
    for (const re of NEWER) if (re.test(src)) found.push(f + ': ' + re);
    assert.ok(!/process\.platform\s*===?\s*['"]win32['"]/.test(src) || f === 'store-tool.mjs', f + ' has no Windows-only branch');
  }
  assert.deepEqual(found, [], 'APIs newer than Node 18 in the server modules');
});

test('js/head-server.js: the call server follows the head address, a hand-set https server is kept', () => {
  const store = {};
  const ctx = {
    window: {}, __headServerTest: true,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { getElementById: () => null, activeElement: null }
  };
  ctx.window = ctx; ctx.window.__headServerTest = true;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'head-server.js'), 'utf8'), ctx);
  const H = ctx.HeadServer;
  const A = 'https://first-one.trycloudflare.com', B = 'https://second-one.trycloudflare.com';
  assert.equal(H.adopt(A), true); assert.equal(store['bellatrix-call-server'], A);
  assert.equal(H.adopt(A), false);
  assert.equal(H.adopt(B + '/'), true); assert.equal(store['bellatrix-call-server'], B, 'a new tunnel at the next start');
  store['bellatrix-call-server'] = 'http://192.168.69.167:8765';
  assert.equal(H.adopt(A), true, 'the PC test server address is replaced');
  store['bellatrix-call-server'] = 'https://bellatrix.clinic.example';
  assert.equal(H.adopt(B), false, 'the clinic server chosen by hand is kept');
  assert.equal(store['bellatrix-call-server'], 'https://bellatrix.clinic.example');
  assert.equal(H.adopt('http://evil.example'), false, 'only https');
  assert.equal(H.info(), null, 'off the robot: no head info');
});

test.after(async () => {
  for (const c of [...children]) await stop(c);
  try { readOnly(false); } catch (e) { /* gone */ }
  fs.rmSync(TMP, { recursive: true, force: true });
});
