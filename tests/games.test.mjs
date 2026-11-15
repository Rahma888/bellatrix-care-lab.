// "Ajouter un jeu": the care team's own games go onto the robot from a link or a file (labland/games.mjs,
// js/games.js, js/games-staff.js, jeu.html). Run: node tests/games.test.mjs
//   GAMES_SHOTS=<folder> also saves the screenshots (head 1098x618, phone 390x844, tablet 1080x1920).
// 1. Links: GitHub (branch in the URL, else main, else master), GitLab, a direct .zip, refused links.
// 2. The zip reader: stored and deflated files, zip-slip refused, zip bombs refused, broken archives refused.
// 3. The game in the project: index.html at the root, in dist/, in the single subfolder; projects that need
//    a build are refused with a clear reason; no index.html: what was found.
// 4. The server (own port, temporary data folder, NO internet: a local fake GitHub/GitLab serves the zips):
//    the code is needed, wrong codes are rate limited, the catalogue, update, remove, the head's rights,
//    the files served with a sandboxing CSP and the air bridge, nothing outside the game's folder.
// 5. In a MUTED headless Chrome (--mute-audio, speech stubbed: no sound): the head shows "Add a game" with
//    the QR code and the code, the game under "Team games" with "New"; the phone page (empty, progress, done,
//    error); the tablet plays the game in a sandboxed frame started through the link, the air bridge
//    clicks a button inside it, Finish ends the session and the link hears "finished".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = await import('../labland/games.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.GAMES_SHOTS || '';
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ------------------------------------------------------------------ a small zip writer ------------ */
function zip(entries) {
  const locals = [], centrals = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data == null ? '' : e.data, 'utf8');
    const method = e.method == null ? 8 : e.method, body = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = e.crc != null ? e.crc : G.crc32(data), usize = e.usize != null ? e.usize : data.length, flags = 0x800 | (e.encrypted ? 1 : 0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((e.link ? 0o120777 : 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body); centrals.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const err = (fn) => { try { fn(); } catch (e) { return e.code || e.message; } return 'no error'; };
const files = (names) => names.map((n) => ({ name: n, data: Buffer.from(n.endsWith('.html') ? '<!doctype html><title>x</title>' : 'x') }));

/* The test game: one big button; it tells the test page what happened (postMessage), uses localStorage
   (none in the sandbox: the bridge gives one in memory), loads its own files and tries the internet. */
function gameHtml(outside) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>Test game</title><link rel="stylesheet" href="css/game.css"><script src="/js/app.js"></script></head>' +
    '<body><h1>Jeu des couleurs</h1><button id="b">Bleu</button><p id="out">0</p><script>' +
    'var n=0;function say(o){o.type="test-game";parent.postMessage(o,"*");}' +
    'document.getElementById("b").addEventListener("click",function(e){n++;document.getElementById("out").textContent=String(n);say({what:"clicked",n:n,trusted:e.isTrusted});});' +
    'document.getElementById("b").addEventListener("pointerdown",function(){say({what:"down"});});' +
    'localStorage.setItem("best","7");' +
    'say({what:"loaded",origin:String(self.origin),ls:localStorage.getItem("best"),app:!!window.APP_OK});' +
    'fetch("data.json").then(function(r){return r.json();}).then(function(j){say({what:"own-fetch",ok:j.ok});},function(){say({what:"own-fetch",ok:false});});' +
    'fetch("' + outside + '").then(function(){say({what:"outside",blocked:false});},function(){say({what:"outside",blocked:true});});' +
    '</script></body></html>';
}
const GAME_CSS = 'body{margin:0;font-family:sans-serif;background:#fff}h1{font-size:64px;margin:40px}#b{position:absolute;left:140px;top:420px;width:800px;height:300px;font-size:90px;background:#00519E;color:#fff;border:0;border-radius:5px}#out{position:absolute;left:140px;top:760px;font-size:80px}';
const GAME_JS = 'window.APP_OK = true;';

/* ------------------------------------------------------------------ 1. links ---------------------- */
test('GitHub links: the branch of the URL first, else main, else master; GitLab; a direct .zip', () => {
  const H = { codeload: 'http://fake' };
  const a = G.resolveLink('https://github.com/anna/memory-game', H);
  assert.equal(a.kind, 'github'); assert.equal(a.name, 'Memory game');
  assert.deepEqual(a.tries.map((t) => t.branch), ['main', 'master']);
  assert.equal(a.tries[0].url, 'http://fake/anna/memory-game/zip/refs/heads/main');
  const b = G.resolveLink('github.com/anna/memory-game.git', H);
  assert.equal(b.tries[1].url, 'http://fake/anna/memory-game/zip/refs/heads/master', 'no https:// and .git are fine');
  const c = G.resolveLink('https://github.com/anna/quiz/tree/dev/games/colours', H);
  assert.deepEqual(c.tries.map((t) => t.branch), ['dev', 'main', 'master']); assert.equal(c.sub, 'games/colours');
  assert.equal(G.resolveLink('https://www.github.com/Anna/Quiz-Bavaria/', {}).tries[0].url, 'https://codeload.github.com/Anna/Quiz-Bavaria/zip/refs/heads/main', 'the real host without a test option');
  const d = G.resolveLink('https://gitlab.com/home/team/colours/-/tree/v2', { gitlab: 'http://fake' });
  assert.equal(d.kind, 'gitlab'); assert.deepEqual(d.tries.map((t) => t.branch), ['v2', 'main', 'master']);
  assert.equal(d.tries[0].url, 'http://fake/home/team/colours/-/archive/v2/colours-v2.zip');
  const e = G.resolveLink('https://example.org/downloads/my-game.zip?x=1');
  assert.equal(e.kind, 'zip'); assert.equal(e.name, 'My game'); assert.equal(e.tries.length, 1);
  assert.equal(G.resolveLink('https://example.org/jeu.html').kind, 'html');
  assert.equal(G.resolveLink('https://github.com/anna/memory/archive/refs/heads/main.zip').kind, 'zip', 'an archive link of GitHub is a direct zip');
  for (const bad of ['', '   ', 'ftp://example.org/x.zip', 'javascript:alert(1)', 'https://user:secret@github.com/anna/x', 'https://']) assert.equal(err(() => G.resolveLink(bad)), 'bad-link', bad);
});

/* ------------------------------------------------------------------ 2. zip reader ----------------- */
test('the zip reader reads stored and deflated files, refuses zip-slip, bombs and broken archives', () => {
  const ok = G.readZip(zip([{ name: 'a/index.html', data: '<h1>hi</h1>' }, { name: 'a/s.css', data: 'b{}', method: 0 }, { name: 'a/img/', data: '' }, { name: 'a/link', data: '/etc/passwd', link: true }, { name: '__MACOSX/a/._x', data: 'x' }]));
  assert.deepEqual(ok.map((f) => f.name), ['a/index.html', 'a/s.css'], 'folders, symbolic links and __MACOSX are left out');
  assert.equal(ok[0].data.toString(), '<h1>hi</h1>');
  for (const n of ['../evil.js', 'a/../../evil.js', '/etc/cron.d/x', 'C:/Windows/x.dll', 'a\\..\\..\\x.js', 'a/\u0001.js']) assert.equal(err(() => G.readZip(zip([{ name: n, data: 'x' }]))), 'unsafe-zip', n);
  /* a bomb: 60 MB of zeros in a few KB */
  const zeros = Buffer.alloc(60 * 1024 * 1024);
  assert.equal(err(() => G.readZip(zip([{ name: 'big.bin', data: zeros }]))), 'zip-bomb', 'declared ratio');
  /* a bomb that lies about its size: it says 1 KB, it unpacks to 8 MB */
  const liar = zip([{ name: 'small.txt', data: Buffer.alloc(8 * 1024 * 1024, 65), usize: 1024 }]);
  assert.equal(err(() => G.readZip(liar)), 'zip-bomb', 'more than it declares');
  /* many files that add up past the limit */
  assert.equal(err(() => G.readZip(zip(Array.from({ length: 5 }, (_, i) => ({ name: 'f' + i, data: crypto.randomBytes(3 * 1024 * 1024) }))), { unpacked: 10 * 1024 * 1024 })), 'too-big', 'real data, too much in all');
  assert.equal(err(() => G.readZip(Buffer.from('not a zip at all, sorry'))), 'bad-zip');
  assert.equal(err(() => G.readZip(zip([{ name: 'x.txt', data: 'hello', crc: 1234 }]))), 'bad-zip', 'wrong CRC');
  assert.equal(err(() => G.readZip(zip([{ name: 'x.txt', data: 'hello', encrypted: true }]))), 'bad-zip', 'password');
  assert.equal(err(() => G.readZip(zip(Array.from({ length: 12 }, (_, i) => ({ name: 'f' + i, data: 'x' }))), { files: 10 })), 'too-many-files');
});

/* ------------------------------------------------------------------ 3. entry ---------------------- */
test('the game is found: root, dist/, the repository folder, the single subfolder, one page', () => {
  assert.deepEqual(G.findEntry(files(['index.html', 'js/a.js'])), { base: '', entry: 'index.html' });
  assert.deepEqual(G.findEntry(files(['memory-main/index.html', 'memory-main/README.md'])), { base: 'memory-main/', entry: 'index.html' }, 'the folder of a GitHub archive');
  assert.deepEqual(G.findEntry(files(['memory-main/dist/index.html', 'memory-main/dist/assets/a.js', 'memory-main/README.md'])), { base: 'memory-main/dist/', entry: 'index.html' });
  assert.deepEqual(G.findEntry(files(['r/README.md', 'r/jeu/index.html', 'r/jeu/x.js'])), { base: 'r/jeu/', entry: 'index.html' }, 'the single subfolder');
  assert.deepEqual(G.findEntry(files(['r/README.md', 'r/docs/index.html'])), { base: 'r/docs/', entry: 'index.html' });
  assert.deepEqual(G.findEntry(files(['memory-game.html', 'notes.txt'])), { base: '', entry: 'memory-game.html' }, 'one page with another name');
  assert.deepEqual(G.findEntry(files(['r/games/quiz/index.html', 'r/games/other/index.html']), 'games/quiz'), { base: 'r/games/quiz/', entry: 'index.html' }, 'the folder of a /tree/ link');
  /* a build first */
  const vite = [{ name: 'app-main/package.json', data: Buffer.from(JSON.stringify({ scripts: { build: 'vite build' }, devDependencies: { vite: '5' }, dependencies: { react: '18' } })) },
    { name: 'app-main/index.html', data: Buffer.from('<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>') }, { name: 'app-main/src/main.jsx', data: Buffer.from('x') }];
  const e1 = (() => { try { G.findEntry(vite); } catch (e) { return e; } })();
  assert.equal(e1.code, 'needs-build'); assert.equal(e1.detail, 'Vite');
  const cra = [{ name: 'p/package.json', data: Buffer.from(JSON.stringify({ dependencies: { 'react-scripts': '5', react: '18' } })) }, { name: 'p/public/index.html', data: Buffer.from('<link href="%PUBLIC_URL%/x.ico"><div id="root"></div>') }];
  assert.equal(err(() => G.findEntry(cra)), 'needs-build');
  const next = [{ name: 'n/package.json', data: Buffer.from(JSON.stringify({ dependencies: { next: '14' } })) }, { name: 'n/pages/index.js', data: Buffer.from('x') }];
  const e2 = (() => { try { G.findEntry(next); } catch (e) { return e; } })();
  assert.equal(e2.code, 'needs-build'); assert.equal(e2.detail, 'Next.js');
  assert.deepEqual(G.findEntry(vite.concat([{ name: 'app-main/dist/index.html', data: Buffer.from('<!doctype html><script type="module" src="/assets/i.js"></script>') }])), { base: 'app-main/dist/', entry: 'index.html' }, 'the built folder is used');
  const e3 = (() => { try { G.findEntry(files(['r/README.md', 'r/src/game.js', 'r/a/index.html', 'r/b/index.html'])); } catch (e) { return e; } })();
  assert.equal(e3.code, 'no-index'); assert.match(e3.detail, /README\.md/); assert.match(e3.detail, /src\//);
});
test('the bridge goes into the head of every page; links to "/" stay in the game folder', () => {
  const h = G.injectBridge('<!DOCTYPE html><html lang="fr"><head><title>x</title><script src="/js/a.js"></script></head><body><img src="/i.png"><a href="https://ex.org">x</a></body></html>');
  assert.match(h, /^<!DOCTYPE html><html lang="fr"><head><script data-bellatrix="air">/);
  assert.match(h, /src="\.\/js\/a\.js"/); assert.match(h, /src="\.\/i\.png"/); assert.match(h, /href="https:\/\/ex\.org"/);
  assert.match(G.injectBridge('<!doctype html><p>no head</p>'), /^<!doctype html><script data-bellatrix="air">/, 'no head, no html: after the doctype (no quirks mode)');
  assert.match(G.BRIDGE, /bellatrix-air/); assert.match(G.BRIDGE, /elementFromPoint/); assert.match(G.BRIDGE, /m\.source!==window\.parent/);
  const code = G.BRIDGE.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  assert.ok(!/=>|`|\b(?:let|const|class)\s/.test(code), 'the bridge is ES5');
});
test('the browser files are ES5, LF, and core.js hands the air cursor to the game', () => {
  for (const f of ['js/games.js', 'js/games-staff.js', 'js/jeu.js', 'js/i18n-games.js']) {
    const s = src(f);
    assert.ok(!s.includes('\r'), f + ' has CR');
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/=>|`|\b(?:let|const|class|async|await)\s/.test(code), f + ' uses newer JavaScript');
  }
  assert.match(src('js/core.js'), /if \(Lab\.airToFrame && Lab\.airToFrame\(air\.x, air\.y, now, r, s, setRing\)\)/);
  for (const f of ['staff.html', 'patient.html']) {
    const h = src(f);
    assert.match(h, /<script src="js\/atelier-engine\.js[^"]*"><\/script>\n<script src="js\/games\.js/, f);
    assert.match(h, /js\/i18n-games\.js/, f);
  }
  assert.match(src('staff.html'), /id="toAddGame"/); assert.match(src('staff.html'), /id="toAtelier" href="atelier\.html"/);
});

/* ------------------------------------------------------------------ 4. the server ----------------- */
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const killTree = (pid) => { try { if (process.platform === 'win32') execSync('taskkill /T /F /PID ' + pid, { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };
const SILENT = `(function(){window.__said=[];try{var s=window.speechSynthesis;if(s){s.speak=function(u){try{window.__said.push(String(u.text||''));}catch(e){}setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();`;

/* The fake GitHub / GitLab / file host (127.0.0.1 only). */
async function fakeHost() {
  const port = await freePort(), base = 'http://127.0.0.1:' + port, hits = [];
  const game = (top) => zip([{ name: top + 'index.html', data: gameHtml(base + '/outside') }, { name: top + 'css/game.css', data: GAME_CSS }, { name: top + 'js/app.js', data: GAME_JS },
    { name: top + 'data.json', data: '{"ok":true}' }, { name: top + 'README.md', data: '# test' }]);
  const routes = {
    '/anna/colours/zip/refs/heads/main': game('colours-main/'),
    '/anna/oldgame/zip/refs/heads/master': game('oldgame-master/'),
    '/anna/quiz/zip/refs/heads/dev': game('quiz-dev/'),
    '/anna/slow/zip/refs/heads/main': game('slow-main/'),
    '/team/colours/-/archive/main/colours-main.zip': game('colours-main/'),
    '/files/game.zip': game(''),
    '/files/vite.zip': zip([{ name: 'v/package.json', data: JSON.stringify({ devDependencies: { vite: '5' } }) }, { name: 'v/index.html', data: '<script type="module" src="/src/main.ts"></script>' }]),
    '/files/noindex.zip': zip([{ name: 'p/README.md', data: 'x' }, { name: 'p/src/game.js', data: 'x' }, { name: 'p/notes.txt', data: 'x' }]),
    '/files/slip.zip': zip([{ name: 'ok/index.html', data: '<p>x</p>' }, { name: '../../outside.js', data: 'x' }])
  };
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, base); hits.push(u.pathname);
    if (u.pathname === '/r/game.zip') { r.writeHead(302, { Location: '/files/game.zip' }); r.end(); return; }
    if (u.pathname === '/page') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><html><body>Sign in to continue</body></html>'); return; }
    const body = routes[u.pathname];
    if (!body) { r.writeHead(404, { 'Content-Type': 'text/plain' }); r.end('404'); return; }
    const out = () => { r.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': body.length }); r.end(body); };
    if (u.pathname.startsWith('/anna/slow/')) setTimeout(out, 2500); else out();
  });
  await new Promise((ok) => srv.listen(port, '127.0.0.1', ok));
  return { base, hits, close: () => new Promise((ok) => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => ok()); }) };
}
async function startServer(tmp, hostBase) {
  const port = await freePort(), env = Object.assign({}, process.env, { PORTAL_DATA: path.join(tmp, 'portal'), FEED_DATA: path.join(tmp, 'feed'), NOTIFY_DATA: path.join(tmp, 'notify'),
    CALLREQ_DATA: path.join(tmp, 'callreq'), GAMES_DATA: path.join(tmp, 'games'), GAMES_TEST_HOSTS: JSON.stringify({ codeload: hostBase, gitlab: hostBase }) });
  delete env.ANTHROPIC_API_KEY; delete env.BELLATRIX_DATA;
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let errText = ''; child.stderr.on('data', (d) => { errText += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/games/api/list'); if (r.ok) return { base, child, dir: path.join(tmp, 'games') }; } catch (e) { /* not yet */ } await sleep(150); }
  killTree(child.pid);
  throw new Error('The server did not start: ' + errText.slice(0, 300));
}
const post = async (base, p, body, headers = {}) => { const r = await fetch(base + '/games/api/' + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() }; };
async function waitJob(base, id, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const j = await (await fetch(base + '/games/api/job?id=' + id)).json(); if (j.state === 'ready' || j.state === 'error') return j; await sleep(100); }
  throw new Error('job ' + id + ' did not end');
}
async function importLink(S, code, url, extra = {}) {
  const r = await post(S.base, 'import', Object.assign({ code, url, lang: 'fr' }, extra));
  if (r.status !== 200) return { state: 'refused', status: r.status, error: r.body.error, detail: r.body.detail };
  return waitJob(S.base, r.body.job);
}

test('server: code, links, catalogue, files with CSP and the bridge, update, remove, rights, rate limit', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-games-data-'));
  const F = await fakeHost();
  const S = await startServer(tmp, F.base);
  const before = fs.existsSync(path.join(ROOT, 'labland', 'data', 'games'));
  try {
    assert.deepEqual(await (await fetch(S.base + '/games/api/list')).json(), { games: [] });
    /* the import page, with its short address */
    const jp = await fetch(S.base + '/jeu');
    assert.equal(jp.status, 200); assert.match(await jp.text(), /js\/jeu\.js/);
    const team = await post(S.base, 'team', {});
    assert.equal(team.status, 200); assert.match(team.body.code, /^[A-Z0-9]{6}$/); assert.match(team.body.key, /^[A-Za-z0-9]{32}$/);
    const code = team.body.code;
    /* the code is needed */
    assert.equal((await post(S.base, 'import', { url: 'https://github.com/anna/colours', lang: 'fr' })).body.error, 'bad-code');
    assert.equal((await post(S.base, 'import', { code: 'AAAAAA', url: 'https://github.com/anna/colours', lang: 'fr' })).status, 403);
    const up0 = await fetch(S.base + '/games/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Games-Code': 'NOPE00' }, body: '<!doctype html><p>x</p>' });
    assert.equal(up0.status, 403);
    assert.equal(F.hits.length, 0, 'nothing was downloaded without the code');
    /* GitHub: main */
    const a = await importLink(S, code.toLowerCase(), 'https://github.com/anna/colours', { name: 'Couleurs', for: 'Groupe mémoire' });
    assert.equal(a.state, 'ready', JSON.stringify(a)); assert.equal(a.game.branch, 'main'); assert.equal(a.game.name, 'Couleurs'); assert.equal(a.game.for, 'Groupe mémoire');
    assert.equal(a.game.entry, 'index.html'); assert.equal(a.game.files, 5); assert.equal(a.game.lang, 'fr');
    /* GitHub: no main, master */
    const b = await importLink(S, code, 'https://github.com/anna/oldgame');
    assert.equal(b.state, 'ready'); assert.equal(b.game.branch, 'master'); assert.equal(b.game.name, 'Oldgame', 'the name from the repository');
    assert.deepEqual(F.hits.filter((h) => h.startsWith('/anna/oldgame/')), ['/anna/oldgame/zip/refs/heads/main', '/anna/oldgame/zip/refs/heads/master']);
    /* GitHub: the branch of the URL */
    const c = await importLink(S, code, 'https://github.com/anna/quiz/tree/dev', { lang: 'de' });
    assert.equal(c.state, 'ready'); assert.equal(c.game.branch, 'dev'); assert.equal(c.game.lang, 'de');
    /* GitLab, a direct zip, a redirect */
    assert.equal((await importLink(S, code, 'https://gitlab.com/team/colours')).state, 'ready');
    assert.equal((await importLink(S, code, F.base + '/r/game.zip')).state, 'ready');
    /* refused, with a reason */
    const nf = await importLink(S, code, 'https://github.com/anna/nothing');
    assert.equal(nf.error, 'not-found'); assert.equal(nf.detail, 'main, master');
    const vb = await importLink(S, code, F.base + '/files/vite.zip');
    assert.equal(vb.error, 'needs-build'); assert.equal(vb.detail, 'Vite');
    const ni = await importLink(S, code, F.base + '/files/noindex.zip');
    assert.equal(ni.error, 'no-index'); assert.match(ni.detail, /README\.md/);
    assert.equal((await importLink(S, code, F.base + '/files/slip.zip')).error, 'unsafe-zip');
    assert.equal((await importLink(S, code, F.base + '/page')).error, 'web-page');
    assert.equal((await importLink(S, code, 'ftp://example.org/x.zip')).error, 'bad-link');
    assert.ok(!fs.existsSync(path.join(tmp, 'outside.js')) && !fs.existsSync(path.join(tmp, 'games', '..', 'outside.js')), 'nothing written outside');
    /* a single .html file sent from the phone */
    const up = await fetch(S.base + '/games/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Games-Code': code, 'X-Games-Name': encodeURIComponent('Mémo'), 'X-Games-Lang': 'en', 'X-Games-File': encodeURIComponent('memo.html') }, body: '<!doctype html><html><head></head><body><p>Mémo</p></body></html>' });
    assert.equal(up.status, 200);
    const u1 = await waitJob(S.base, (await up.json()).job);
    assert.equal(u1.state, 'ready'); assert.equal(u1.game.kind, 'file'); assert.equal(u1.game.name, 'Mémo'); assert.equal(u1.game.entry, 'index.html');
    /* the catalogue */
    const list = (await (await fetch(S.base + '/games/api/list')).json()).games;
    assert.equal(list.length, 6);
    const g = list.find((x) => x.name === 'Couleurs');
    assert.ok(g && /^couleurs-[a-z0-9]{4}$/.test(g.id), JSON.stringify(g));
    assert.deepEqual(Object.keys(g).sort(), ['branch', 'date', 'entry', 'files', 'for', 'id', 'kind', 'lang', 'name', 'size', 'source', 'status', 'updated', 'warn'].sort());
    assert.equal(g.source, 'https://github.com/anna/colours'); assert.equal(g.status, 'ready'); assert.ok(g.size > 500);
    const cat = JSON.parse(fs.readFileSync(path.join(S.dir, 'games.json'), 'utf8'));
    assert.equal(cat.games.length, 6, 'games.json in the data folder');
    assert.ok(fs.existsSync(path.join(S.dir, g.id, 'index.html')) && fs.existsSync(path.join(S.dir, g.id, 'js', 'app.js')), 'files under <data>/games/<id>/');
    assert.equal(fs.existsSync(path.join(ROOT, 'labland', 'data', 'games')), before, 'labland/data is not touched');
    /* the files: content types, CSP, bridge, nothing outside the folder */
    const page = await fetch(S.base + '/games/' + g.id + '/');
    assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /^text\/html/);
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /^sandbox allow-scripts;/); assert.match(csp, new RegExp("connect-src http://127\\.0\\.0\\.1:\\d+/games/" + g.id + "/ data: blob:"));
    assert.match(csp, /frame-src 'none'/); assert.match(csp, /form-action 'none'/); assert.ok(!/allow-same-origin|allow-top-navigation|allow-popups/.test(csp));
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    const html = await page.text();
    assert.match(html, /<head><script data-bellatrix="air">/); assert.match(html, /src="\.\/js\/app\.js"/);
    assert.match((await fetch(S.base + '/games/' + g.id + '/js/app.js')).headers.get('content-type'), /^text\/javascript/);
    assert.match((await fetch(S.base + '/games/' + g.id + '/css/game.css')).headers.get('content-type'), /^text\/css/);
    assert.match((await fetch(S.base + '/games/' + g.id + '/data.json')).headers.get('content-type'), /^application\/json/);
    for (const p of ['/games/' + g.id + '/..%2f..%2fgames.json', '/games/' + g.id + '/%2e%2e/team.json', '/games/' + g.id + '/../team.json', '/games/nope-0000/', '/games/' + g.id + '/missing.js', '/games/..%5cteam.json'])
      assert.equal((await fetch(S.base + p)).status, 404, p);
    assert.equal((await fetch(S.base + '/games/' + g.id, { redirect: 'manual' })).status, 301);
    /* the head: update (the same link again) and remove; nobody else may */
    const tunnel = { 'X-Forwarded-For': '203.0.113.9' };
    assert.equal((await post(S.base, 'remove', { id: g.id }, tunnel)).status, 403, 'from the internet, without the key');
    assert.equal((await post(S.base, 'team', {}, tunnel)).status, 403, 'the code is not given to the internet');
    assert.equal((await post(S.base, 'remove', { id: g.id }, Object.assign({ Authorization: 'Team ' + 'x'.repeat(32) }, tunnel))).status, 403, 'a wrong key');
    const upd = await post(S.base, 'update', { id: g.id }, Object.assign({ Authorization: 'Team ' + team.body.key }, tunnel));
    assert.equal(upd.status, 200, 'the head key works from anywhere');
    const uj = await waitJob(S.base, upd.body.job);
    assert.equal(uj.state, 'ready'); assert.equal(uj.game.id, g.id); assert.equal(uj.game.date, g.date); assert.notEqual(uj.game.updated, g.updated);
    assert.equal((await post(S.base, 'update', { id: u1.game.id })).body.error, 'no-source', 'a file has no link to download again');
    const rm = await post(S.base, 'remove', { id: list.find((x) => x.name === 'Oldgame').id });
    assert.equal(rm.status, 200);
    assert.equal((await (await fetch(S.base + '/games/api/list')).json()).games.length, 5);
    assert.ok(!fs.existsSync(path.join(S.dir, list.find((x) => x.name === 'Oldgame').id)), 'its files are deleted');
    /* the first head that asks from the network gets the key once; later strangers do not */
    /* (here every call comes from this machine: a tunnel header plays the stranger) */
    /* wrong codes: 10 tries, then a pause */
    let last = null;
    for (let i = 0; i < 11; i++) last = await post(S.base, 'import', { code: 'ZZZZZ' + (i % 10), url: 'https://github.com/anna/colours', lang: 'fr' });
    assert.equal(last.status, 429); assert.equal(last.body.error, 'slow-down');
    assert.equal((await post(S.base, 'import', { code, url: 'https://github.com/anna/colours', lang: 'fr' })).status, 429, 'even the right code waits');
  } finally {
    killTree(S.child.pid); await F.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
});
test('the head: its key goes to this machine, or once to the first head of the Wi-Fi; never to the internet', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-games-team-'));
  try {
    const Gm = G.createGames({ dataDir: tmp, log: () => {} });
    const req = (ip, headers = {}) => ({ method: 'POST', headers, socket: { remoteAddress: ip, server: { address: () => ({ address: '127.0.0.1', port: 1 }) } } });
    const team = (r) => Gm.api(r, new URL('http://x/games/api/team'), {}, Buffer.alloc(0));
    assert.equal((await team(req('203.0.113.5', { 'cf-ray': 'abc' })))[0], 403, 'through the tunnel: never');
    const local = await team(req('127.0.0.1'));
    assert.equal(local[0], 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'team.json'), 'utf8')).claimed, false, 'this machine does not use up the first claim');
    const head = await team(req('192.168.1.40'));
    assert.equal(head[0], 200, 'the first head of the Wi-Fi'); assert.equal(head[1].key, local[1].key);
    assert.equal((await team(req('192.168.1.77')))[0], 403, 'a second device of the Wi-Fi: no');
    assert.equal((await team(req('192.168.1.77', { authorization: 'Team ' + head[1].key })))[0], 200, 'with the key: yes');
    assert.equal((await team(req('::ffff:127.0.0.1')))[0], 200, 'this machine: always');
    const rm = await Gm.api(req('192.168.1.77'), new URL('http://x/games/api/remove'), { id: 'x' }, Buffer.alloc(0));
    assert.equal(rm[0], 403);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ } }
});
test('downloads have a size limit and a time limit, and never go to the local network', async () => {
  const F = await fakeHost();
  try {
    assert.equal(await G.download(F.base + '/files/game.zip', { limit: 100, allowLocal: true }).then(() => 'no', (e) => e.code), 'too-big');
    assert.equal(await G.download(F.base + '/anna/slow/zip/refs/heads/main', { timeout: 300, allowLocal: true }).then(() => 'no', (e) => e.code), 'timeout');
    assert.equal(await G.download(F.base + '/files/game.zip').then(() => 'no', (e) => e.code), 'local-link');
    assert.equal(await G.download('http://192.168.1.10/x.zip').then(() => 'no', (e) => e.code), 'local-link');
    assert.equal(await G.download('http://10.0.0.2/x.zip').then(() => 'no', (e) => e.code), 'local-link');
    const ok = await G.download(F.base + '/r/game.zip', { allowLocal: true });
    assert.equal(ok.status, 200); assert.equal(ok.body.readUInt32LE(0), 0x04034b50);
  } finally { await F.close(); }
});

/* ------------------------------------------------------------------ 5. browser -------------------- */
async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-games-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
  const B = { errors: [], closed: false };
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
    if (d.method === 'Runtime.exceptionThrown') B.errors.push(String((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
    if (d.method === 'Page.javascriptDialogOpening') B.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  };
  B.send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; const t = setTimeout(() => { delete pending[i]; rej(new Error(method + ': no answer')); }, 20000); pending[i] = (d) => { clearTimeout(t); return d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); }; ws.send(JSON.stringify({ id: i, method, params })); });
  B.ev = async (expr) => { const r = await B.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; };
  B.waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await B.ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; };
  B.go = async (url, ready = 'true') => { await B.send('Page.navigate', { url }); await sleep(250); return B.waitFor('document.readyState === "complete" && (' + ready + ')'); };
  B.size = (width, height, mobile = false) => B.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  B.shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await B.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  await B.send('Runtime.enable'); await B.send('Page.enable'); await B.send('Network.enable');
  await B.send('Network.setCacheDisabled', { cacheDisabled: true });
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT });
  /* no camera here: presence is "someone is there" at once (js/presence.js is replaced as it loads) */
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){try{Object.defineProperty(window,'Presence',{configurable:true,get:function(){return undefined;},set:function(v){if(v)v.watch=function(cb){var t=setTimeout(function(){cb(true);},150);return function(){clearTimeout(t);};};Object.defineProperty(window,'Presence',{value:v,writable:true,configurable:true});}});}catch(e){}})();` });
  /* what the test game says (postMessage from its frame) */
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__gm=[];window.addEventListener('message',function(e){if(e.data&&e.data.type==='test-game')window.__gm.push(e.data);});` });
  return B;
}

test('browser: head (Add a game, Team games), phone page, tablet game through the link with the air bridge', { skip: !CHROME && 'no Chrome on this computer', timeout: 240000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-games-data-'));
  const F = await fakeHost();
  const S = await startServer(tmp, F.base);
  const B = await browser();
  const click = async (q, ms = 350) => { const ok = await B.ev(`(function(){var b=document.querySelector(${JSON.stringify(q)}); if (b) b.click(); return !!b;})()`); await sleep(ms); return ok; };
  const LINK = 'GAMES42';
  try {
    const team = await post(S.base, 'team', {});
    const code = team.body.code;
    const first = await importLink(S, code, 'https://github.com/anna/colours', { name: 'Jeu des couleurs', lang: 'fr' });
    assert.equal(first.state, 'ready');
    const gid = first.game.id, key = 'team-' + gid;

    /* --- the head, 1098 x 618, in French --- */
    await B.size(1098, 618);
    await B.go(S.base + '/staff.html');
    await B.ev(`localStorage.clear(); localStorage.setItem('bellatrix-staff-lang', 'fr'); localStorage.setItem('bellatrix-link-server', ${JSON.stringify(S.base)}); localStorage.setItem('bellatrix-link-code', '${LINK}')`);
    assert.ok(await B.go(S.base + '/staff.html', `window.Lab && !!document.querySelector('#actList .tile[data-key="${key}"]')`), 'the team game is a tile of the list');
    assert.equal(await B.ev(`document.getElementById('toAddGame').textContent`), 'Ajouter un jeu');
    await B.ev(`(function(){ var b = document.getElementById('toAddGame'); b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); })()`);
    await sleep(300);
    await B.shot('head-0-activities');
    assert.equal(await B.ev(`document.querySelector('#actList .tsec').textContent`), 'Jeux de l’équipe');
    assert.equal(await B.ev(`(function(){ var t = document.querySelector('#actList .tile[data-key="${key}"]'); return t.previousElementSibling.className + '|' + t.querySelector('.tname').textContent + '|' + t.querySelector('.tnew').textContent + '|' + t.querySelector('.tnew').hidden; })()`), 'tsec|Jeu des couleurs|Nouveau|false');
    /* the Atelier stays reachable, from the new screen */
    assert.equal(await B.ev(`(function(){ var a = document.getElementById('toAtelier'); return a.getAttribute('href') + '|' + a.textContent + '|' + !!a.closest('#gmAdd'); })()`), 'atelier.html|Atelier|true');
    /* "Add a game": QR code, address, code */
    await click('#toAddGame', 800);
    assert.ok(await B.waitFor(`document.getElementById('gmCode').textContent === ${JSON.stringify(code)}`), 'the code shows');
    assert.equal(await B.ev(`document.getElementById('gmAdd').hidden`), false);
    assert.equal(await B.ev(`document.getElementById('gmAddr').textContent`), S.base.replace('http://', '') + '/jeu');
    assert.ok(await B.ev(`document.querySelectorAll('#gmQr svg rect, #gmQr svg path').length > 0`), 'a QR code');
    assert.equal(await B.ev(`document.querySelector('#gmAdd .gm-say').textContent`), 'Scannez avec votre téléphone, ou ouvrez l’adresse sur votre ordinateur.');
    await B.shot('head-1-add-a-game');
    /* a game arrives while the screen is open */
    assert.equal((await importLink(S, code, F.base + '/files/game.zip', { name: 'Mémo des fleurs' })).state, 'ready');
    assert.ok(await B.waitFor(`!document.getElementById('gmGot').hidden && /Mémo des fleurs/.test(document.getElementById('gmGot').textContent)`, 8000), 'Received: …');
    await B.shot('head-2-received');
    await click('#gmBack');
    assert.ok(await B.waitFor(`document.querySelectorAll('#actList .tile.team').length === 2`), 'both team games in the list');
    /* the sheet: Try / Update / Remove; Try shows the game on the head */
    await B.ev(`(function(){ var t = document.querySelector('#actList .tile[data-key="${key}"]'); t.scrollIntoView({ block: 'center' }); t.querySelector('input').click(); })()`);
    await sleep(500);
    assert.equal(await B.ev(`[].map.call(document.querySelectorAll('.gm-detail button'), function (b) { return b.textContent; }).join('|')`), 'Essayer|Mettre à jour|Retirer');
    await B.shot('head-3-team-game-selected');
    await B.ev(`document.getElementById('actDetail').scrollIntoView({ block: 'start' })`);
    await sleep(300);
    await B.shot('head-3b-team-game-sheet');
    await click('.gm-detail [data-gm="try"]', 1500);
    assert.equal(await B.ev(`document.querySelector('#gmTry iframe').getAttribute('sandbox')`), 'allow-scripts');
    assert.ok(await B.waitFor(`window.__gm.some(function (m) { return m.what === 'loaded'; })`, 8000), 'the game runs on the head');
    await B.shot('head-4-try');
    await click('#gmTryClose');
    assert.equal(await B.ev(`!!document.getElementById('gmTry')`), false);
    /* Start on the patient screen: through the link */
    await B.ev(`(function(){ var p = document.getElementById('lkPos'); if (p) p.value = 'Salon'; })()`);
    await click('#go', 1200);
    assert.ok(await B.waitFor(`window.LinkStaff && LinkStaff._cur() && LinkStaff._cur().state === 'sent'`, 5000), 'the run went to the link');
    const sent = await (await fetch(S.base + '/link/api/' + LINK + '/status?since=0&wait=0')).json();
    assert.equal(sent.state, 'sent');

    /* --- the phone, 390 x 844 --- */
    await B.size(390, 844, true);
    await B.ev(`localStorage.setItem('bellatrix-jeu-lang', 'fr')`);
    assert.ok(await B.go(S.base + '/jeu#' + code, `window.JeuPage && document.getElementById('jSend').textContent === 'Envoyer'`));
    assert.equal(await B.ev(`location.hash`), '', 'the code leaves the address bar');
    assert.equal(await B.ev(`document.getElementById('jCodeRow').hidden`), true, 'the code came with the QR code');
    assert.equal(await B.ev(`document.querySelector('input[name="jGameLang"]:checked').value`), 'fr');
    await B.shot('phone-1-empty');
    await B.ev(`(function(){ var u = document.getElementById('jUrl'); u.value = 'https://github.com/anna/slow'; u.dispatchEvent(new Event('input')); })()`);
    assert.equal(await B.ev(`document.getElementById('jName').value`), 'Slow', 'the name from the repository');
    await B.ev(`(function(){ var n = document.getElementById('jName'); n.value = 'Quiz des saisons'; n.dispatchEvent(new Event('input')); document.getElementById('jFor').value = 'Groupe du mardi'; })()`);
    await click('#jSend', 500);
    assert.ok(await B.waitFor(`!document.getElementById('jProg').hidden && document.querySelector('#jSteps li.now') && document.querySelector('#jSteps li.now').getAttribute('data-s') === 'download'`, 3000), 'downloading');
    assert.equal(await B.ev(`document.querySelector('#jSteps li').textContent`), 'Téléchargement');
    await B.shot('phone-2-progress');
    assert.ok(await B.waitFor(`!document.getElementById('jDone').hidden`, 12000), 'done');
    assert.equal(await B.ev(`document.getElementById('jOk').textContent`), '« Quiz des saisons » est sur le robot.');
    assert.equal(await B.ev(`document.querySelectorAll('#jSteps li.done').length`), 4);
    await B.shot('phone-3-done');
    /* an error in plain words */
    await click('#jAgain');
    await B.ev(`(function(){ var u = document.getElementById('jUrl'); u.value = ${JSON.stringify(F.base + '/files/noindex.zip')}; u.dispatchEvent(new Event('input')); })()`);
    assert.equal(await B.ev(`document.getElementById('jName').value`), 'Noindex');
    await click('#jSend', 300);
    assert.ok(await B.waitFor(`!document.getElementById('jFail').hidden`, 8000), 'the error shows');
    assert.equal(await B.ev(`[].map.call(document.querySelectorAll('#jSteps li'), function (li) { return li.className; }).join(',')`), 'done,bad,,', 'it stopped at Checking');
    assert.match(await B.ev(`document.getElementById('jFailText').textContent`), /^Nous n’avons pas trouvé de fichier index\.html dans votre projet \(trouvé : README\.md, notes\.txt, src\/\)/);
    await B.shot('phone-4-error');
    /* typed address, no code: asked; a wrong code is said simply */
    await B.ev(`sessionStorage.clear()`);
    assert.ok(await B.go(S.base + '/jeu', `window.JeuPage`));
    assert.equal(await B.ev(`document.getElementById('jCodeRow').hidden`), false, 'the code field shows');
    await B.ev(`(function(){ document.getElementById('jCode').value = 'WRONG1'; var u = document.getElementById('jUrl'); u.value = 'https://github.com/anna/colours'; u.dispatchEvent(new Event('input')); })()`);
    await click('#jSend', 300);
    assert.ok(await B.waitFor(`!document.getElementById('jFail').hidden`, 5000));
    assert.equal(await B.ev(`document.getElementById('jFailText').textContent`), 'Ce code ne convient pas. Regardez le code sous le QR code, sur le robot.');
    /* English and German follow the switch */
    await click('#jRetry');
    await click('#jLang [data-ui-lang="de"]');
    assert.equal(await B.ev(`document.getElementById('jSend').textContent + '|' + document.querySelector('[data-t="Your project"]').textContent`), 'Senden|Ihr Projekt');
    await click('#jLang [data-ui-lang="en"]');
    assert.equal(await B.ev(`document.getElementById('jSend').textContent`), 'Send');

    /* --- the tablet, 1080 x 1920: the run from the head arrives through the link --- */
    await B.size(1080, 1920);
    await B.ev(`localStorage.setItem('bellatrix-link-server', ${JSON.stringify(S.base)}); localStorage.setItem('bellatrix-link-code', '${LINK}'); localStorage.removeItem('bellatrix-link-current'); window.__gm.length = 0`);
    assert.ok(await B.go(S.base + '/patient.html', `window.Lab && !!Lab.byKey[${JSON.stringify(key)}]`), 'the tablet knows the game');
    assert.ok(await B.waitFor(`Lab.isOn() && !!document.querySelector('#screen [data-a="a"][data-i="0"]')`, 15000), 'the session starts (welcome)');
    await B.ev(`document.querySelector('#screen [data-a="a"][data-i="0"]').click()`);
    assert.ok(await B.waitFor(`!!document.querySelector('#stage .tgbox iframe')`, 5000), 'the game frame');
    const fr = await B.ev(`(function(){ var f = document.querySelector('#stage .tgbox iframe'); return { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src'), btn: document.querySelector('#screen .btn.tgend').textContent, foot: !!document.querySelector('#screen .foot') && getComputedStyle(document.querySelector('#screen .foot')).display }; })()`);
    assert.equal(fr.sandbox, 'allow-scripts'); assert.match(fr.src, new RegExp('/games/' + gid + '/\\?v=')); assert.equal(fr.btn, 'Terminer'); assert.equal(fr.foot, 'none');
    assert.ok(await B.waitFor(`window.__gm.some(function (m) { return m.what === 'loaded'; }) && window.__gm.some(function (m) { return m.what === 'own-fetch'; }) && window.__gm.some(function (m) { return m.what === 'outside'; })`, 8000), 'the game loaded');
    const loaded = await B.ev(`window.__gm.filter(function (m) { return m.what === 'loaded'; })[0]`);
    assert.equal(loaded.origin, 'null', 'no same origin: the game cannot read the patient screen'); assert.equal(loaded.ls, '7', 'its localStorage works (in memory)'); assert.equal(loaded.app, true, 'its own script, from "/js/app.js"');
    assert.equal(await B.ev(`window.__gm.filter(function (m) { return m.what === 'own-fetch'; })[0].ok`), true, 'it may read its own files');
    assert.equal(await B.ev(`window.__gm.filter(function (m) { return m.what === 'outside'; })[0].blocked`), true, 'no network outside its folder (CSP)');
    assert.ok(!F.hits.includes('/outside'), 'the outside request never left the browser');
    const status1 = await (await fetch(S.base + '/link/api/' + LINK + '/status?since=0&wait=0')).json();
    assert.equal(status1.state, 'started');
    await sleep(400);
    await B.shot('tablet-1-game-running');
    /* pointing in the air: the cursor held still over the game's button presses it */
    const where = `(function(){ var st = document.getElementById('stage'), r = st.getBoundingClientRect(), s = r.width / Lab.stageW(), f = TeamGames._frame(), q = f.getBoundingClientRect(), k = q.width / f.clientWidth;
      return { x: (q.left + 540 * k - r.left) / s, y: (q.top + 570 * k - r.top) / s, r: { left: r.left, top: r.top }, s: s }; })()`;
    const P = await B.ev(where);
    await B.ev(`window.__ring = []`);
    const step = (x, y) => B.ev(`Lab.airToFrame(${x}, ${y}, performance.now(), document.getElementById('stage').getBoundingClientRect(), ${P.s}, function (p) { window.__ring.push(p); })`);
    assert.equal(await step(P.x, 1880), false, 'under the frame (the Finish button): not the game');
    for (let i = 0; i < 40 && !(await B.ev(`window.__gm.some(function (m) { return m.what === 'clicked'; })`)); i++) { assert.equal(await step(P.x + (i % 2), P.y), true); await sleep(60); }
    const clicked = await B.ev(`window.__gm.filter(function (m) { return m.what === 'clicked'; })`);
    assert.equal(clicked.length, 1, 'one click'); assert.ok(await B.ev(`window.__gm.some(function (m) { return m.what === 'down'; })`), 'pointerdown first');
    assert.ok(await B.ev(`Math.max.apply(null, window.__ring) > 0.5`), 'the ring filled on the button');
    /* held longer: no second click until the cursor moves away */
    for (let i = 0; i < 25; i++) { await step(P.x, P.y); await sleep(60); }
    assert.equal(await B.ev(`window.__gm.filter(function (m) { return m.what === 'clicked'; }).length`), 1, 'one long hold is one click');
    /* over an empty part of the game: nothing to press */
    for (let i = 0; i < 25; i++) { await step(P.x, P.y + 700); await sleep(60); }
    assert.equal(await B.ev(`window.__gm.filter(function (m) { return m.what === 'clicked'; }).length`), 1, 'no click on nothing');
    for (let i = 0; i < 30 && (await B.ev(`window.__gm.filter(function (m) { return m.what === 'clicked'; }).length`)) < 2; i++) { await step(P.x, P.y); await sleep(60); }
    assert.equal(await B.ev(`window.__gm.filter(function (m) { return m.what === 'clicked'; }).length`), 2, 'back on the button: a second click');
    await B.shot('tablet-2-after-air-clicks');
    /* Finish: back to the waiting screen; the link hears "finished" with the session */
    await B.ev(`document.querySelector('#screen .btn.tgend').click()`);
    assert.ok(await B.waitFor(`!Lab.isOn() && !document.querySelector('#stage .tgbox')`, 5000), 'the session ended, the frame is gone');
    assert.ok(await B.waitFor(`!!document.querySelector('#screen .facebox')`, 3000), 'the waiting screen');
    let fin = null;
    for (let i = 0; i < 30 && !(fin && fin.state === 'finished'); i++) { fin = await (await fetch(S.base + '/link/api/' + LINK + '/status?since=0&wait=0')).json(); await sleep(150); }
    assert.equal(fin.state, 'finished'); assert.equal(fin.result.activity, key); assert.equal(fin.result.outcome, 'completed');
    assert.ok(fin.result.stats.teamGameSeconds >= 1); assert.equal(fin.result.stats.teamGameAirClicks, 2);
    assert.equal(await B.ev(`document.querySelector('#screen header h2').textContent`), 'Bonjour, je suis Bellatrix.', 'the waiting screen in the language of the game, like its thank-you');
    await B.shot('tablet-3-back-to-waiting');

    /* --- one device without link: the game is offered too --- */
    await B.ev(`localStorage.removeItem('bellatrix-link-server'); localStorage.removeItem('bellatrix-link-code'); window.__gm.length = 0`);
    assert.ok(await B.go(S.base + '/patient.html', `window.Lab && !!Lab.byKey[${JSON.stringify(key)}]`));
    await B.ev(`localStorage.setItem('bellatrix-care-lab-run', JSON.stringify({ id: 'R9', key: ${JSON.stringify(key)}, patient: 'P1', at: Date.now(), preview: true, auto: true, opt: { lang: 'en', voice: false, camMode: 'off', participant: 'P1' } }))`);
    assert.ok(await B.waitFor(`Lab.isOn() && !!document.querySelector('#screen [data-a="a"][data-i="0"]')`, 8000));
    await B.ev(`document.querySelector('#screen [data-a="a"][data-i="0"]').click()`);
    assert.ok(await B.waitFor(`!!document.querySelector('#stage .tgbox iframe') && window.__gm.some(function (m) { return m.what === 'loaded'; })`, 8000));
    assert.equal(await B.ev(`Lab.lang() + '|' + document.querySelector('#screen .btn.tgend').textContent`), 'fr|Terminer', 'the screen speaks the language of the game');
    await B.ev(`document.querySelector('#screen .btn.tgend').click()`);
    assert.ok(await B.waitFor(`!Lab.isOn()`, 4000));

    /* --- back on the head: Results has the session; "New" is gone; Remove --- */
    await B.size(1098, 618);
    assert.ok(await B.go(S.base + '/staff.html', `window.Lab && !!document.querySelector('#actList .tile[data-key="${key}"]')`));
    await B.ev(`localStorage.setItem('bellatrix-link-server', ${JSON.stringify(S.base)}); localStorage.setItem('bellatrix-link-code', '${LINK}')`);
    assert.ok(await B.go(S.base + '/staff.html', `window.Lab && !!document.querySelector('#actList .tile[data-key="${key}"]') && Lab._staff.store().sessions.some(function (s) { return s.activity === ${JSON.stringify(key)}; })`, 15000), 'the finished session is in Results');
    await sleep(300);
    assert.equal(await B.ev(`document.querySelector('#actList .tile[data-key="${key}"] .tnew').hidden`), true, '"New" is gone once played');
    await B.ev(`(function(){ var t = document.querySelector('#actList .tile[data-key="${key}"]'); t.querySelector('input').click(); })()`);
    await sleep(400);
    await click('.gm-detail [data-gm="remove"]');
    assert.equal(await B.ev(`document.querySelector('.gm-detail [data-gm="remove"]').textContent`), 'Oui, retirer', 'the first tap only asks');
    await click('.gm-detail [data-gm="remove"]', 1500);
    assert.ok(await B.waitFor(`!document.querySelector('#actList .tile[data-key="${key}"]')`, 6000), 'gone from the list');
    assert.equal((await (await fetch(S.base + '/games/api/list')).json()).games.some((x) => x.id === gid), false);
    assert.deepEqual(B.errors, [], 'no script error on the pages');
  } finally {
    await B.close();
    killTree(S.child.pid); await F.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
});
