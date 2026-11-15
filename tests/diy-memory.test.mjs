// The DIY example (diy-examples/memory/, diy-examples/memory.zip): exactly what a carer imports with
// "Ajouter un jeu". Run: node tests/diy-memory.test.mjs
//   DIY_SHOTS=<folder> also saves the tablet screenshots (1080 x 1920, the game inside the real tablet frame).
// 1. The game folder: one index.html, no internet, no storage, only real buttons, LF, old-browser JavaScript;
//    memory.zip is up to date with the folder and the server finds its index.html.
// 2. Its own server (free port, temporary data folders, no internet): memory.zip goes in through the real import
//    routes with the team code (the file from the phone, and a GitHub link served by a local fake GitHub),
//    is installed without warnings and served with the sandboxing CSP and the air bridge. Sending the same
//    file or link again replaces the game (no duplicate).
// 3. In a MUTED headless Chrome (--mute-audio, speech stubbed): the tablet gets the game through the link,
//    the game runs in the sandboxed frame, and a full level is played with the AIR BRIDGE only (the pointing
//    cursor held still over the cards): a non-pair turns back after about 2.5 s, the pairs stay open,
//    "Wunderbar! Alle Paare gefunden" shows; Harder / Easier work by pointing too; Finish returns to the
//    waiting screen and the head hears "finished" with the air clicks. Then French: "Terminer" returns too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'diy-examples', 'memory');
const ZIP = path.join(ROOT, 'diy-examples', 'memory.zip');
const G = await import('../labland/games.mjs');
const { makeZip } = await import('../diy-examples/make-zip.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.DIY_SHOTS ? path.resolve(process.env.DIY_SHOTS) : '';
const read = (f) => fs.readFileSync(path.join(GAME, f), 'utf8');
const TEXT = ['index.html', 'style.css', 'game.js', 'pictures.js'];

/* ------------------------------------------------------------------ 1. the game folder ------------ */
test('the game folder follows the rules of the README: one page, no internet, no storage, real buttons', () => {
  const html = read('index.html');
  for (const f of TEXT.concat(['fonts/LICENSE.txt'])) {
    const s = fs.readFileSync(path.join(GAME, f), 'utf8');
    assert.ok(!s.includes('\r'), f + ': LF only');
    if (!TEXT.includes(f)) continue;
    assert.ok(!/https?:\/\/|(?:src|href)\s*=\s*["']\/\/|url\(\s*["']?\/\//i.test(s), f + ': nothing from the internet');
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(s), f + ': no storage (the sandbox has none)');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/.test(s), f + ': no network');
    assert.ok(!/\b(?:alert|confirm|prompt)\s*\(|window\.open\s*\(|<form\b|<a\s/i.test(s), f + ': no dialogs, popups, forms or links');
    /* newer than Chrome 95 (the tablet's WebView) */
    assert.ok(!/structuredClone|\.at\(|Object\.hasOwn|findLast|:has\(|\b[dsl]v[hw]\b|@container|@layer|color-mix|text-wrap|\binert\b/.test(s), f + ': nothing newer than Chrome 95');
  }
  for (const f of ['game.js', 'pictures.js']) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/=>|`|\b(?:let|const|class|async|await)\s/.test(code), f + ': plain old JavaScript');
  }
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<script src="pictures\.js"><\/script>\n<script src="game\.js"><\/script>/, 'its own files, relative paths');
  assert.ok(!/onclick|onmouse|ontouch|draggable|ondrag/i.test(html + read('game.js')), 'no inline handlers, no drag');
  assert.ok(!/addEventListener\('(?:mouse|pointer|touch|drag|dblclick|key)/.test(read('game.js')), 'the game listens to "click" only (touch, mouse and the air bridge all click)');
  assert.ok(!/:hover/.test(read('style.css')), 'nothing only on hover');
  assert.match(read('style.css'), /url\("fonts\/RobotoCondensed-Regular\.ttf"\)/, 'its own font, in its folder');
  for (const f of ['RobotoCondensed-Regular.ttf', 'RobotoCondensed-Medium.ttf', 'RobotoCondensed-Bold.ttf']) assert.ok(fs.statSync(path.join(GAME, 'fonts', f)).size > 100000, f);
  /* the texts: German first, French and English, the gentle end */
  const js = read('game.js');
  for (const s of ['Neues Spiel', 'Leichter', 'Schwerer', 'Wunderbar!', 'Alle Paare gefunden.', 'Nouvelle partie', 'New game']) assert.ok(js.includes(s), s);
  assert.ok(!/verloren|falsch|perdu|faux|wrong|lost|setInterval|Date\.now/i.test(js.replace(/\/\*[\s\S]*?\*\//g, '')), 'no failure words, no clock');
  assert.match(js, /TURN_BACK_MS = 2500/); assert.match(js, /LEVELS = \[3, 4, 6\]/);
});

test('memory.zip is the folder (rebuilt the same byte for byte) and the server finds the game in it', () => {
  const built = makeZip(GAME, 'memory/');
  assert.ok(built.zip.equals(fs.readFileSync(ZIP)), 'memory.zip is up to date: run node diy-examples/make-zip.mjs');
  const files = G.readZip(fs.readFileSync(ZIP));
  assert.deepEqual(files.map((f) => f.name), ['memory/fonts/LICENSE.txt', 'memory/fonts/RobotoCondensed-Bold.ttf', 'memory/fonts/RobotoCondensed-Medium.ttf', 'memory/fonts/RobotoCondensed-Regular.ttf',
    'memory/game.js', 'memory/index.html', 'memory/pictures.js', 'memory/style.css']);
  for (const f of files) assert.ok(f.data.equals(fs.readFileSync(path.join(GAME, ...f.name.slice('memory/'.length).split('/')))), f.name);
  assert.deepEqual(G.findEntry(files), { base: 'memory/', entry: 'index.html' });
  assert.ok(fs.statSync(ZIP).size < 2 * 1024 * 1024, 'small');
});

/* ------------------------------------------------------------------ 2. the server ----------------- */
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const killTree = (pid) => { try { if (process.platform === 'win32') execSync('taskkill /T /F /PID ' + pid, { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };
const SILENT = `(function(){window.__said=[];try{var s=window.speechSynthesis;if(s){s.speak=function(u){try{window.__said.push(String(u.text||''));}catch(e){}setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();`;
const NO_CAMERA = `(function(){try{Object.defineProperty(window,'Presence',{configurable:true,get:function(){return undefined;},set:function(v){if(v)v.watch=function(cb){var t=setTimeout(function(){cb(true);},150);return function(){clearTimeout(t);};};Object.defineProperty(window,'Presence',{value:v,writable:true,configurable:true});}});}catch(e){}})();`;

/* A fake GitHub (127.0.0.1 only): the carer's repository "team/memory" as GitHub's zip of the main branch. */
async function fakeGitHub() {
  const port = await freePort(), base = 'http://127.0.0.1:' + port, hits = [];
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, base); hits.push(u.pathname);
    if (u.pathname !== '/team/memory/zip/refs/heads/main') { r.writeHead(404, { 'Content-Type': 'text/plain' }); r.end('404'); return; }
    const body = fs.readFileSync(ZIP);
    r.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': body.length }); r.end(body);
  });
  await new Promise((ok) => srv.listen(port, '127.0.0.1', ok));
  return { base, hits, close: () => new Promise((ok) => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => ok()); }) };
}
async function startServer(tmp, hostBase) {
  const port = await freePort(), env = Object.assign({}, process.env, { PORTAL_DATA: path.join(tmp, 'portal'), FEED_DATA: path.join(tmp, 'feed'), NOTIFY_DATA: path.join(tmp, 'notify'),
    CALLREQ_DATA: path.join(tmp, 'callreq'), MEALS_DATA: path.join(tmp, 'meals'), GAMES_DATA: path.join(tmp, 'games'), GAMES_TEST_HOSTS: JSON.stringify({ codeload: hostBase, gitlab: hostBase }) });
  delete env.ANTHROPIC_API_KEY; delete env.BELLATRIX_DATA;
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let errText = ''; child.stderr.on('data', (d) => { errText += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/games/api/list'); if (r.ok) return { base, child, dir: path.join(tmp, 'games') }; } catch (e) { /* not yet */ } await sleep(150); }
  killTree(child.pid);
  throw new Error('The server did not start: ' + errText.slice(0, 300));
}
const post = async (base, p, body, headers = {}) => { const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() }; };
async function waitJob(base, id, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const j = await (await fetch(base + '/games/api/job?id=' + id)).json(); if (j.state === 'ready' || j.state === 'error') return j; await sleep(100); }
  throw new Error('job ' + id + ' did not end');
}
/* "Choisir un fichier (.zip ou .html)" on the phone: the same request as js/jeu.js */
async function uploadZip(S, code, name, lang) {
  const r = await fetch(S.base + '/games/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Games-Code': code, 'X-Games-Name': encodeURIComponent(name),
    'X-Games-Lang': lang, 'X-Games-File': encodeURIComponent('memory.zip') }, body: fs.readFileSync(ZIP) });
  assert.equal(r.status, 200);
  return waitJob(S.base, (await r.json()).job);
}
async function importLink(S, code, url, name, lang) {
  const r = await post(S.base, '/games/api/import', { code, url, name, lang });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return waitJob(S.base, r.body.job);
}
/* labland/data/games: where the games would go without GAMES_DATA (other parts of labland/data belong to other tests) */
const dataSnapshot = () => { const d = path.join(ROOT, 'labland', 'data', 'games'); const out = []; const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else out.push(path.relative(d, f) + ' ' + fs.statSync(f).mtimeMs); } }; try { walk(d); } catch (e) { /* none */ } return out.sort().join('\n'); };

/* ------------------------------------------------------------------ 3. Chrome --------------------- */
/* A muted headless Chrome in a language. The game's sandboxed frame may be a separate process: it is
   attached (Target.setAutoAttach) so that the test can read the cards; the clicks go through the air bridge. */
async function browser(lang) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-diy-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--lang=' + lang, '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
  const B = { errors: [], csp: [], frames: new Map(), worlds: new Map(), closed: false };
  B.close = async () => {
    if (B.closed) return; B.closed = true;
    try { await Promise.race([B.send('Browser.close'), sleep(2000)]); } catch (e) { /* closing */ }
    try { B.ws.close(); } catch (e) { /* closed */ }
    await sleep(300); killTree(chrome.pid);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
  };
  B.send = () => Promise.reject(new Error('not connected'));
  let port = 0, list = null;
  for (let i = 0; i < 100 && !port; i++) { try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(150); } }
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch (e) { await sleep(150); } }
  if (!list) { await B.close(); throw new Error('Chrome did not start'); }
  const ws = B.ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = {};
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; return; }
    const p = d.params || {};
    if (d.method === 'Runtime.exceptionThrown') B.errors.push((d.sessionId ? '[game] ' : '') + String((p.exceptionDetails.exception || {}).description || p.exceptionDetails.text).split('\n')[0].slice(0, 200));
    /* only what the game's frame was refused (its own process, or an address of /games/) */
    if (d.method === 'Log.entryAdded' && /Content Security Policy|Refused to/i.test(p.entry.text) && (d.sessionId || /\/games\//.test((p.entry.url || '') + ' ' + p.entry.text))) B.csp.push(p.entry.text.slice(0, 200));
    if (d.method === 'Page.javascriptDialogOpening') B.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    if (d.method === 'Target.attachedToTarget') {
      B.frames.set(p.sessionId, p.targetInfo);
      B.send('Runtime.enable', {}, p.sessionId).catch(() => {});
      B.send('Log.enable', {}, p.sessionId).catch(() => {});
    }
    if (d.method === 'Target.detachedFromTarget') B.frames.delete(p.sessionId);
    if (d.method === 'Target.targetInfoChanged') for (const [sid, info] of B.frames) if (info.targetId === p.targetInfo.targetId) B.frames.set(sid, p.targetInfo);
  };
  B.send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++seq; const t = setTimeout(() => { delete pending[i]; rej(new Error(method + ': no answer')); }, 20000);
    pending[i] = (d) => { clearTimeout(t); return d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); };
    ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
  });
  const value = (r) => { if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; };
  B.ev = async (expr) => value(await B.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }));
  /* in the game's frame: its own process (attached session) or this process (an isolated world of the frame) */
  B.game = async (expr) => {
    for (const [sid, info] of B.frames) if (info.type === 'iframe' && /\/games\//.test(info.url)) return value(await B.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid));
    const tree = await B.send('Page.getFrameTree');
    const find = (n) => { if (n.frame && /\/games\//.test(n.frame.url) && n.frame.parentId) return n.frame; for (const c of n.childFrames || []) { const f = find(c); if (f) return f; } return null; };
    const fr = find(tree.frameTree);
    if (!fr) throw new Error('no game frame');
    const key = fr.id + '|' + fr.loaderId;
    if (!B.worlds.has(key)) B.worlds.set(key, (await B.send('Page.createIsolatedWorld', { frameId: fr.id, worldName: 'diy-test' })).executionContextId);
    return value(await B.send('Runtime.evaluate', { expression: expr, returnByValue: true, contextId: B.worlds.get(key) }));
  };
  B.waitFor = async (expr, ms = 10000, inGame = false) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await (inGame ? B.game(expr) : B.ev(expr))) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; };
  B.go = async (url, ready = 'true') => { await B.send('Page.navigate', { url }); await sleep(250); return B.waitFor('document.readyState === "complete" && (' + ready + ')'); };
  B.size = (width, height) => B.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  B.shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await B.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  await B.send('Runtime.enable'); await B.send('Page.enable'); await B.send('Network.enable'); await B.send('Log.enable');
  await B.send('Network.setCacheDisabled', { cacheDisabled: true });
  await B.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT });
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_CAMERA });
  return B;
}

/* The pointing in the air, as js/core.js does it for each camera frame: the cursor (stage pixels) goes to
   Lab.airToFrame, which posts it into the game; held still over a button for ~1.1 s, it clicks. */
function air(B) {
  const A = { clicks: 0, P: null };
  A.measure = async () => {
    A.P = await B.ev(`(function(){ window.__ring = window.__ring || []; var st = document.getElementById('stage'), r = st.getBoundingClientRect(), s = r.width / Lab.stageW(), f = TeamGames._frame(), q = f.getBoundingClientRect(), k = q.width / f.clientWidth;
      return { left: q.left, top: q.top, k: k, rl: r.left, rt: r.top, s: s, fw: f.clientWidth, fh: f.clientHeight }; })()`);
    return A.P;
  };
  A.step = (fx, fy) => {
    const P = A.P, x = (P.left + fx * P.k - P.rl) / P.s, y = (P.top + fy * P.k - P.rt) / P.s;
    return B.ev(`Lab.airToFrame(${x}, ${y}, performance.now(), document.getElementById('stage').getBoundingClientRect(), ${P.s}, function (p) { window.__ring.push(p); })`);
  };
  /* rest the hand on an empty spot (the status line): nothing to press, and the next press may start */
  A.away = async () => { for (let i = 0; i < 4; i++) { await A.step(A.P.fw / 2, 175); await sleep(60); } };
  /* hold the cursor on (fx, fy) in the game until done() is true; one press = one click */
  A.press = async (fx, fy, done) => {
    for (let i = 0; i < 70; i++) {
      assert.equal(await A.step(fx + (i % 2), fy), true, 'the cursor is over the game');
      await sleep(60);
      if (await done()) { A.clicks++; return i; }
    }
    throw new Error('the air press at ' + fx + ',' + fy + ' did nothing');
  };
  return A;
}
const CARDS = `[].map.call(document.querySelectorAll('.card'), function (c) { var r = c.getBoundingClientRect();
  return { i: +c.getAttribute('data-i'), pic: c.getAttribute('data-pic'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), cls: c.className }; })`;
const cls = (B, i) => B.game(`document.querySelector('.card[data-i="${i}"]').className`);
const text = (B, sel) => B.game(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`);
const center = (B, sel) => B.game(`(function(){ var r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const fits = `(function(){ var d = document.documentElement, small = [], b = document.querySelectorAll('button'), i, r;
  for (i = 0; i < b.length; i++) { r = b[i].getBoundingClientRect(); if (r.width && r.height && b[i].offsetParent && r.height < 90) small.push(b[i].className + ' ' + Math.round(r.height)); }
  return { scroll: d.scrollHeight - innerHeight + '|' + (d.scrollWidth - innerWidth), small: small, w: innerWidth, h: innerHeight }; })()`;

/* send a run from the head to the tablet through the link (what "Start on the patient screen" does) */
async function sendRun(S, code, key, lang) {
  const id = 'R' + Date.now().toString(36);
  const r = await post(S.base, '/link/api/' + code + '/run', { run: { id, key, patient: 'P1', opt: { lang, voice: false, camMode: 'off', participant: 'P1' }, at: Date.now(), preview: false } });
  assert.equal(r.status, 200);
  return id;
}
async function linkStatus(S, code) { return (await fetch(S.base + '/link/api/' + code + '/status?since=0&wait=0')).json(); }
async function openGameOnTablet(B, S, code, key) {
  await B.ev(`localStorage.setItem('bellatrix-link-server', ${JSON.stringify(S.base)}); localStorage.setItem('bellatrix-link-code', '${code}'); localStorage.removeItem('bellatrix-link-current')`);
  assert.ok(await B.go(S.base + '/patient.html', `window.Lab && !!Lab.byKey[${JSON.stringify(key)}]`), 'the tablet knows the game');
  assert.ok(await B.waitFor(`Lab.isOn() && !!document.querySelector('#screen [data-a="a"][data-i="0"]')`, 15000), 'the session starts');
  await B.ev(`document.querySelector('#screen [data-a="a"][data-i="0"]').click()`);
  assert.ok(await B.waitFor(`!!document.querySelector('#stage .tgbox iframe')`, 6000), 'the game frame');
  assert.ok(await B.waitFor(`document.querySelectorAll('.card').length === 6 && document.fonts.status === 'loaded'`, 10000, true), 'the game is on the tablet');
  await sleep(500);
}

test('server and tablet: memory.zip imported with the team code, played to the end with the air bridge, Finish returns', { skip: !CHROME && 'no Chrome on this computer', timeout: 300000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-diy-data-'));
  const before = dataSnapshot();
  const F = await fakeGitHub();
  const S = await startServer(tmp, F.base);
  let B = null;
  const LINK = 'DIYMEM1';
  try {
    /* --- the import, as a carer does it --- */
    const team = await post(S.base, '/games/api/team', {});
    assert.equal(team.status, 200);
    const code = team.body.code;
    assert.equal((await fetch(S.base + '/games/api/upload', { method: 'POST', headers: { 'X-Games-Code': 'WRONG1' }, body: fs.readFileSync(ZIP) })).status, 403, 'not without the code');
    const de = await uploadZip(S, code, 'Memory', 'de');
    assert.equal(de.state, 'ready', JSON.stringify(de));
    assert.equal(de.game.entry, 'index.html'); assert.equal(de.game.files, 8); assert.equal(de.game.kind, 'file'); assert.equal(de.game.lang, 'de');
    assert.deepEqual(de.game.warn, [], 'no "loads files from the internet" warning');
    const fr = await importLink(S, code, 'https://github.com/team/memory', 'Memory (FR)', 'fr');
    assert.equal(fr.state, 'ready', JSON.stringify(fr)); assert.equal(fr.game.branch, 'main'); assert.deepEqual(fr.game.warn, []);
    assert.deepEqual(F.hits, ['/team/memory/zip/refs/heads/main'], 'the fake GitHub was asked once');
    /* the same file (same name) and the same link again: replaced, not added */
    const de2 = await uploadZip(S, code, 'Memory', 'de');
    assert.equal(de2.state, 'ready'); assert.equal(de2.game.id, de.game.id, 'the same file and name replace the game');
    const fr2 = await importLink(S, code, 'https://github.com/team/memory', 'Memory (FR)', 'fr');
    assert.equal(fr2.game.id, fr.game.id, 'the same link replaces the game');
    const list = (await (await fetch(S.base + '/games/api/list')).json()).games;
    assert.deepEqual(list.map((g) => g.id).sort(), [de.game.id, fr.game.id].sort(), 'two games, no duplicates');
    /* served like any team game: sandboxing CSP, the air bridge, its own files */
    const gid = de.game.id;
    const page = await fetch(S.base + '/games/' + gid + '/');
    assert.equal(page.status, 200);
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /^sandbox allow-scripts;/); assert.match(csp, new RegExp('font-src http://127\\.0\\.0\\.1:\\d+/games/' + gid + '/ data:'));
    assert.ok(!/allow-same-origin|allow-popups|allow-top-navigation/.test(csp));
    const html = await page.text();
    assert.match(html, /<head><script data-bellatrix="air">/, 'the bridge first in the head');
    assert.match(html, /<script src="pictures\.js"><\/script>/);
    for (const [f, type] of [['style.css', /^text\/css/], ['game.js', /^text\/javascript/], ['pictures.js', /^text\/javascript/], ['fonts/RobotoCondensed-Bold.ttf', /^font\/ttf/]]) {
      const r = await fetch(S.base + '/games/' + gid + '/' + f);
      assert.equal(r.status, 200, f); assert.match(r.headers.get('content-type'), type, f);
    }

    /* --- the tablet, in German (the device language; the game's default) --- */
    B = await browser('de-DE');
    await B.size(1080, 1920);
    await B.go(S.base + '/patient.html');
    const key = 'team-' + gid;
    await sendRun(S, LINK, key, 'de');
    await openGameOnTablet(B, S, LINK, key);
    const A = air(B);
    const P = await A.measure();
    assert.equal(P.fw, 1080); assert.ok(P.fh > 1450 && P.fh < 1700, 'the frame of the tablet: ' + P.fw + 'x' + P.fh);
    assert.equal(await B.game(`document.documentElement.lang + '|' + String(self.origin)`), 'de|null', 'German; sandboxed (no origin)');
    assert.equal(await text(B, '#newgame') + '|' + await text(B, '#easier') + '|' + await text(B, '#harder'), 'Neues Spiel|Leichter|Schwerer');
    assert.equal(await text(B, '#status'), 'Finden Sie die Paare.');
    assert.equal(await B.game(`document.getElementById('easier').disabled + '|' + document.getElementById('harder').disabled`), 'true|false', 'level 1 of 3');
    const fit1 = await B.game(fits);
    assert.equal(fit1.scroll, '0|0', 'no scrolling'); assert.deepEqual(fit1.small, [], 'every button is big');
    let cards = await B.game(CARDS);
    assert.equal(cards.length, 6);
    assert.ok(cards.every((c) => c.w >= 220 && c.h >= 220), '6 cards, all big: ' + cards.map((c) => c.w + 'x' + c.h).join(' '));
    assert.equal(new Set(cards.map((c) => c.pic)).size, 3, 'three pairs');
    assert.equal(await B.ev(`document.querySelector('#screen .btn.tgend').textContent`), await B.ev(`Lab.t('Finish')`));
    await B.ev(`window.__ring = []`);
    await B.shot('memory-1-start');

    /* two different pictures: they stay visible, then turn back by themselves (about 2.5 s) */
    const a = cards[0], b = cards.find((c) => c.pic !== a.pic);
    await A.press(a.x, a.y, async () => /\bopen\b/.test(await cls(B, a.i)));
    assert.equal(await text(B, '#status'), 'Finden Sie die Paare.');
    await A.press(b.x, b.y, async () => /\bopen\b/.test(await cls(B, b.i)));
    const t1 = Date.now();
    assert.equal(await text(B, '#status'), 'Schauen Sie gut hin.', 'a gentle word, not "wrong"');
    assert.ok(await B.ev(`Math.max.apply(null, window.__ring) > 0.5`), 'the ring filled while the hand was held still');
    await A.away();
    await sleep(1200);
    assert.ok(/\bopen\b/.test(await cls(B, a.i)) && /\bopen\b/.test(await cls(B, b.i)), 'still visible after 1.2 s');
    assert.ok(await B.waitFor(`!/open/.test(document.querySelector('.card[data-i="${a.i}"]').className) && !/open/.test(document.querySelector('.card[data-i="${b.i}"]').className)`, 4000, true), 'they turn back');
    const shown = Date.now() - t1;
    assert.ok(shown >= 2000 && shown <= 3600, 'turned back after ' + shown + ' ms');
    assert.equal(await text(B, '#status'), 'Finden Sie die Paare.');

    /* every pair, with the hand only */
    const pics = [...new Set(cards.map((c) => c.pic))];
    for (let n = 0; n < pics.length; n++) {
      const two = cards.filter((c) => c.pic === pics[n]);
      await A.press(two[0].x, two[0].y, async () => /\bopen\b/.test(await cls(B, two[0].i)));
      await A.press(two[1].x, two[1].y, async () => /\bfound\b/.test(await cls(B, two[1].i)));
      assert.match(await cls(B, two[0].i), /\bfound\b/, 'the pair stays open');
      if (n === 0) {
        assert.equal(await text(B, '#status'), 'Sehr schön! 1 von 3 Paaren gefunden.');
        await sleep(700);
        await B.shot('memory-2-pair-found');
      }
      if (n < pics.length - 1) await A.away();
    }
    assert.ok(await B.waitFor(`!document.getElementById('end').hidden`, 4000, true), 'the end screen');
    assert.equal(await text(B, '#end h2') + ' ' + await text(B, '#end p'), 'Wunderbar! Alle Paare gefunden.');
    assert.equal(await B.game(`document.querySelectorAll('#endpics svg').length`), 3);
    await A.away();
    await sleep(400);
    await B.shot('memory-3-end');

    /* "Schwerer" twice by pointing: 8 then 12 cards, still big; "Leichter" comes back */
    const harder = await center(B, '#harder');
    await A.press(harder.x, harder.y, async () => (await B.game(`document.querySelectorAll('.card').length`)) === 8);
    assert.equal(await B.game(`document.getElementById('end').hidden`), true, 'a new game');
    cards = await B.game(CARDS);
    assert.ok(cards.every((c) => c.w >= 220 && c.h >= 220), '8 cards: ' + cards.map((c) => c.w + 'x' + c.h).join(' '));
    await A.away();
    await A.press(harder.x, harder.y, async () => (await B.game(`document.querySelectorAll('.card').length`)) === 12);
    cards = await B.game(CARDS);
    assert.ok(cards.every((c) => c.w >= 220 && c.h >= 220), '12 cards: ' + cards.map((c) => c.w + 'x' + c.h).join(' '));
    assert.equal(await B.game(`document.getElementById('easier').disabled + '|' + document.getElementById('harder').disabled`), 'false|true');
    const fit3 = await B.game(fits);
    assert.equal(fit3.scroll, '0|0', '12 cards without scrolling'); assert.deepEqual(fit3.small, []);
    /* one pair of the 12, by pointing, for the picture of the hardest level */
    const p12 = cards.filter((c) => c.pic === cards[4].pic);
    await A.away();
    await A.press(p12[0].x, p12[0].y, async () => /\bopen\b/.test(await cls(B, p12[0].i)));
    await A.press(p12[1].x, p12[1].y, async () => /\bfound\b/.test(await cls(B, p12[1].i)));
    await A.away();
    await sleep(600);
    await B.shot('memory-4-twelve-cards');
    const easier = await center(B, '#easier');
    await A.press(easier.x, easier.y, async () => (await B.game(`document.querySelectorAll('.card').length`)) === 8);

    /* Finish: back to the waiting screen, the head hears "finished" with the air clicks */
    const finishLabel = await B.ev(`document.querySelector('#screen .btn.tgend').textContent`);
    assert.ok(/^(Fertig|Beenden)$/.test(finishLabel), 'German Finish: ' + finishLabel);
    assert.equal((await linkStatus(S, LINK)).state, 'started');
    await B.ev(`document.querySelector('#screen .btn.tgend').click()`);
    assert.ok(await B.waitFor(`!Lab.isOn() && !document.querySelector('#stage .tgbox')`, 5000), 'the session ended, the game is gone');
    assert.ok(await B.waitFor(`!!document.querySelector('#screen .facebox')`, 4000), 'the waiting screen');
    let fin = null;
    for (let i = 0; i < 40 && !(fin && fin.state === 'finished'); i++) { fin = await linkStatus(S, LINK); await sleep(150); }
    assert.equal(fin.state, 'finished'); assert.equal(fin.result.activity, key); assert.equal(fin.result.outcome, 'completed');
    assert.equal(fin.result.stats.teamGameAirClicks, A.clicks, 'every move of the game was an air click (' + A.clicks + ')');
    assert.ok(fin.result.stats.teamGameSeconds >= 20);
    assert.deepEqual(B.errors, [], 'no script error (page or game)');
    assert.deepEqual(B.csp, [], 'nothing blocked by the CSP');
    await B.close(); B = null;

    /* --- French: a French device, the game imported in French; "Terminer" returns --- */
    B = await browser('fr-FR');
    await B.size(1080, 1920);
    await B.go(S.base + '/patient.html');
    const keyFr = 'team-' + fr.game.id;
    await sendRun(S, LINK, keyFr, 'fr');
    await openGameOnTablet(B, S, LINK, keyFr);
    assert.equal(await B.ev(`Lab.lang()`), 'fr');
    assert.equal(await B.game(`document.documentElement.lang`), 'fr');
    assert.equal(await text(B, '#newgame') + '|' + await text(B, '#easier') + '|' + await text(B, '#harder') + '|' + await text(B, '#status'), 'Nouvelle partie|Plus facile|Plus difficile|Trouvez les paires.');
    const Af = air(B);
    await Af.measure();
    cards = await B.game(CARDS);
    const pf = cards.filter((c) => c.pic === cards[0].pic);
    await Af.press(pf[0].x, pf[0].y, async () => /\bopen\b/.test(await cls(B, pf[0].i)));
    await Af.press(pf[1].x, pf[1].y, async () => /\bfound\b/.test(await cls(B, pf[1].i)));
    assert.equal(await text(B, '#status'), 'Très bien\u00a0! 1 paire trouvée sur 3.');
    assert.equal(await B.game(`document.querySelector('.card[data-i="${pf[0].i}"] .word').textContent`), (await B.game(`document.querySelector('.card[data-i="${pf[0].i}"]').getAttribute('aria-label')`)));
    /* the language buttons work by pointing too */
    const en = await center(B, '#langs [data-lang="en"]');
    await Af.away();
    await Af.press(en.x, en.y, async () => (await text(B, '#newgame')) === 'New game');
    assert.equal(await text(B, '#status'), 'Well done! 1 of 3 pairs found.', 'the status line follows the language');
    const frb = await center(B, '#langs [data-lang="fr"]');
    await Af.away();
    await Af.press(frb.x, frb.y, async () => (await text(B, '#newgame')) === 'Nouvelle partie');
    await Af.away();
    await sleep(500);
    await B.shot('memory-5-french');
    assert.equal(await B.ev(`document.querySelector('#screen .btn.tgend').textContent`), 'Terminer');
    await B.ev(`document.querySelector('#screen .btn.tgend').click()`);
    assert.ok(await B.waitFor(`!Lab.isOn() && !document.querySelector('#stage .tgbox')`, 5000), '"Terminer" ends the session');
    assert.ok(await B.waitFor(`!!document.querySelector('#screen .facebox')`, 4000), 'back to the waiting screen');
    fin = null;
    for (let i = 0; i < 40 && !(fin && fin.state === 'finished'); i++) { fin = await linkStatus(S, LINK); await sleep(150); }
    assert.equal(fin.state, 'finished'); assert.equal(fin.result.activity, keyFr); assert.equal(fin.result.stats.teamGameAirClicks, Af.clicks);
    /* ?lang= in the address wins over the device language (a carer can try each language on a PC) */
    assert.ok(await B.go(S.base + '/games/' + gid + '/?lang=en', `document.getElementById('newgame') && document.getElementById('newgame').textContent === 'New game'`), '?lang=en');
    assert.deepEqual(B.errors, [], 'no script error (French pass)');
    assert.deepEqual(B.csp, [], 'nothing blocked by the CSP (French pass)');
    assert.equal(dataSnapshot(), before, 'labland/data/games is not touched');
  } finally {
    if (B) await B.close();
    killTree(S.child.pid); await F.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
});
