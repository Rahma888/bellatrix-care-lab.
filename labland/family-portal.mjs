// The family portal server (Care V1 module A, 1.16: the "Besoins fonctionnels – Portail famille"
// spec, BF-01 to BF-28). Mounted by store-server.mjs under /portal/api/. Plain Node, no packages.
//
// Who talks to it:
//   the family  portail.html (a PWA on the phone)            Authorization: Bearer <session token>
//                                                            X-Resident: <resident's random id> (which resident)
//   the robot   staff.html (Care Team) and patient.html      Authorization: Robot <robot id>.<robot key>
//   F2, N2      family-feed.mjs, family-notify.mjs, family-callreq.mjs: registerRoutes + the shared functions
//
// What it keeps (labland/data/portal/portal.json, media in labland/data/portal/photos/):
//   robots      the robot's random id and the hash of its key (trust on first use, robot/hello)
//   residents   per robot: the patient code (P1, never a name), the first name the family uses ("Marie",
//               "Mamie") as the team typed it, the language, and the CONSENT LEVEL the team recorded for
//               the resident or their legal representative (BF-27): 'all' | 'messages_album' | 'none'.
//               Without consent the portal shows only messages, calls and the album.
//   people      a relative: email, first name, language, RGPD consent date (BF-01, BF-02)
//   accounts    a LINK between a relative and ONE resident (BF-03: a relative may have several), with
//               its status (BF-04): 'active' | 'suspended' | 'removed'. Suspended or removed: no access
//               from the next request on; the data stays.
//   invites     8-character codes, single use, 14 days
//   sessions    hashes of the session tokens (180 days), per relative
//   messages    BF-10/11: text, photo, voice or short video, straight to the robot (no approval);
//               BF-14: 'sent' -> 'received' (on the robot) -> 'read' (opened by the resident).
//               kind 'album' (BF-15/16): a photo for the life album, with a caption, a date and a theme;
//               the family can hide or delete it. The team may still withdraw a message ('withdrawn').
//   notes       BF-12: one Care Team notification per message: resident, type, sender, time
//   nav         BF-13: the team asked the robot to go to a resident (logged: the LuckiBot navigation SDK
//               is not integrated yet)
//   offers      a gift from the family, per resident and per product ('play' | 'books')
//   requests    Premium payment requests (contract 2): awaiting_family -> paid -> active, or refused /
//               expired. Any linked relative may pay (BF-22); the others then see "Paid" without the
//               payer's name (BF-28). Prices only from js/premium-config.js (BF-24); with testPayment
//               the form is simulated and nothing is debited.
//   gone        ids of withdrawn messages (no content), so the robot deletes its copy
// Sign-in codes (6 digits, 15 minutes) are kept in memory only: no email is sent, the care team reads
// them in its Family tab. Listen together (contract 3) is kept in memory only.
// No names or patient codes in URLs: ids travel in bodies and headers. Message ids are random.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(HERE, '..');
const LANGS = ['en', 'fr', 'de'];
const ROBOT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROBOT_KEY = /^[A-Za-z0-9_-]{32,86}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,100}\.[A-Za-z]{2,24}$/;
const INVITE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEXT_MAX = 300;
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_MAX_PX = 2048;
const BODY_MAX = 5 * 1024 * 1024;
/* BF-10 (14 Nov, Rahma): voice and video messages have NO duration limit ("let the person take their
   time"). Only an invisible technical safety cap on the size of one file, under the 100 MB request limit
   of the Cloudflare tunnel. An upload is written to disk while it arrives (never held in memory). */
const MEDIA_MAX = 95 * 1024 * 1024;
const MEDIA = {
  voice: { max: MEDIA_MAX, types: { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav' } },
  video: { max: MEDIA_MAX, types: { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' } }
};
const MONTHS = [1, 3, 12];
const THEMES = ['family', 'travel', 'childhood', 'work', 'animals', 'celebrations', 'town'];   // the life album themes
const LEVELS = ['all', 'messages_album', 'none'];
const STATUSES = ['active', 'suspended', 'removed', 'pending', 'refused'];   // pending / refused: a relative's own request for access (1.16)
/* A PC test server without a robot (Rahma, 24 Nov): PORTAL_AUTO_ACCEPT=1 accepts new family accounts at once. Never on
   a robot: the robot head's app never sets it, so there the care team always validates. */
function autoAccept() { return process.env.PORTAL_AUTO_ACCEPT === '1'; }
const CALL_LINK = /^https?:\/\/[A-Za-z0-9.\-:\[\]]{1,200}(\/[A-Za-z0-9._~\-\/]*)?\/famille\.html#t=[A-Za-z0-9_-]{16,64}$/;
const PRICE_CENTS = 1099;              // fallback demo price a month; the real one is in js/premium-config.js
const PRODUCTS = ['play', 'books'];
const REQUEST_DAYS = 14;               // a payment request the family does not answer expires
const CONSENT_VERSION = '2026-11-v2';
const DAY = 24 * 3600 * 1000;
/* Links are not allowed in a message: photo, voice, video and text only. */
const LINK = /(https?:\/\/|ftp:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|fr|de|eu|io|ly|me|info|biz|be|ch|at|uk|co|app|xyz|link|gl|to|tv)\b)/i;

function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : ''; }
function rnd(n) { return crypto.randomBytes(n || 16).toString('base64url'); }
function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function same(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function iso(t) { return new Date(t).toISOString(); }
function lang(v) { return LANGS.includes(v) ? v : 'en'; }
function inviteCode() { let s = ''; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += INVITE_ABC[b[i] % INVITE_ABC.length]; return s.slice(0, 4) + '-' + s.slice(4); }
function normInvite(v) { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : ''; }
function sixDigits() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function addMonths(t, n) { const d = new Date(t); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return d.getTime(); }

/* The size of a JPEG, from its first frame header (SOF0..SOF15 except DHT/JPG/DAC). */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/* The app icon (PNG), drawn here so no image file is needed: an apricot heart on LabLand deep green. */
function pngIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const nx = (x - size / 2) / (size * 0.3), ny = -(y - size * 0.53) / (size * 0.3);
      const heart = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny <= 0;
      raw[o] = heart ? 0xF2 : 0x17; raw[o + 1] = heart ? 0xA7 : 0x3D; raw[o + 2] = heart ? 0x66 : 0x35; raw[o + 3] = 255;
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const ICONS = {};

/* A global of a browser script (js/premium-config.js, js/play-catalog.js), read in a sandbox and kept
   until the file changes. null when the file is missing or does not run. */
const GLOBALS = {};
function browserGlobal(rel, name) {
  const file = path.join(APP_DIR, rel);
  let st = null;
  try { st = fs.statSync(file); } catch (e) { return null; }
  const k = rel + '|' + name, hit = GLOBALS[k];
  if (hit && hit.mtime === st.mtimeMs) return hit.value;
  let value = null;
  try {
    const ctx = { console: { log() {}, warn() {}, error() {} } };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__v = (typeof ' + name + ' !== "undefined") ? ' + name + ' : (this.' + name + ' || null);', ctx, { timeout: 2000 });
    value = ctx.__v || null;
  } catch (e) { value = null; }
  GLOBALS[k] = { mtime: st.mtimeMs, value };
  return value;
}
/* Prices (BF-24) live only in js/premium-config.js (agent P): products[p].monthCents, currency,
   pilotFree (true: the amount shown is 0), testPayment (true: simulated payment, nothing debited). */
function config() { const c = browserGlobal(path.join('js', 'premium-config.js'), 'PREMIUM_CONFIG'); return c && typeof c === 'object' ? c : {}; }
function centsOf(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
function euroCents(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; }
function listCents(product) {
  const c = config(), p = (c.products && c.products[product]) || c[product] || {};
  return centsOf(p.monthCents) || centsOf(p.priceCents) || centsOf(p.cents) || euroCents(p.monthly) || euroCents(p.price) ||
    centsOf(c.demoPriceCents) || centsOf(c.monthCents) || euroCents(c.demoPrice) || euroCents(c.price) || PRICE_CENTS;
}
function pilotFree() { const c = config(); return c.pilotFree === true; }
/* testPayment: the simulated form, nothing is ever debited (no payment provider yet). */
function testPayment() { const c = config(); return c.testPayment !== false; }
function priceCents(product) { return pilotFree() ? 0 : listCents(product); }
function currencyOf() { const c = config(); return (typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency)) ? c.currency : 'EUR'; }
/* The Play catalogue (js/play-catalog.js): the only songs a family may add to a shared queue. */
function catalogItems() {
  const c = browserGlobal(path.join('js', 'play-catalog.js'), 'PLAY_CATALOG');
  return c && Array.isArray(c.items) ? c.items.filter((x) => x && typeof x.id === 'string' && x.title) : [];
}
function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

/* ---------- shared with the other portal modules (F2: family-feed.mjs, N2: family-notify.mjs and
   family-callreq.mjs). They import these and register their routes when store-server.mjs loads them.
   - registerRoutes(prefix, handler): '/portal/api/<prefix>…' goes to handler(req, url, body, ctx) ->
     [status, object] (or a Promise of it, or { file, type } to send a file). ctx: { path (the rest
     after the prefix), q(name), family (authFamily) or null, robot (authRobot) or null, res, portal }.
     Bodies are JSON (64 KB), parsed here; CORS and OPTIONS are answered here.
   - authFamily(req) -> the signed-in relative for the chosen resident, or null:
     { id (link id), pid (person id), name, email, lang, rid, robot, code, label, consent }.
     The resident is the 'X-Resident' header (its random id); without it, the first linked one. null
     too when the link is suspended or removed (BF-04) or the person is not linked (BF-03).
   - authRobot(req) -> { id } or null (Authorization: Robot <id>.<key>).
   - linkedResidents(personOrLinkId) -> [{ robot, code, rid, label }] (active links only).
   - consentLevel(robot, code) -> 'all' | 'messages_album' | 'none' | null (null: nothing recorded).
     Feed and summaries (F2) only with 'all'.
   - notify(personId, event): to the relative (push by N2's module when it is there): setNotifier(fn).
     Events sent from here: { type: 'message-read', message, kind, rid, label },
     { type: 'payment-request', request, product, rid, label }, { type: 'premium-active', request, product, rid, label }.
   - residentsOfRobot(robotId), personsOfResident(rid): for robot-side modules. */
const ROUTES = [];
let NOTIFIER = null;
let CURRENT = null;
export function registerRoutes(prefix, handler) {
  const p = String(prefix || '').replace(/^\/+/, '').replace(/^portal\/api\//, '');
  if (!p || typeof handler !== 'function') throw new Error('registerRoutes(prefix, handler)');
  for (let i = ROUTES.length - 1; i >= 0; i--) if (ROUTES[i].prefix === p) ROUTES.splice(i, 1);
  ROUTES.push({ prefix: p, handler });
  ROUTES.sort((a, b) => b.prefix.length - a.prefix.length);
}
export function setNotifier(fn) { NOTIFIER = typeof fn === 'function' ? fn : null; }
function cur() { if (!CURRENT) CURRENT = createPortal(); return CURRENT; }
export function authFamily(req) { return cur().authFamily(req); }
export function authRobot(req) { return cur().authRobot(req); }
export function linkedResidents(id) { return cur().linkedResidents(id); }
export function consentLevel(robot, code) { return cur().consentLevel(robot, code); }
export function notify(personId, event) { return cur().notify(personId, event); }
export function residentsOfRobot(robotId) { return cur().residentsOfRobot(robotId); }
export function personsOfResident(rid) { return cur().personsOfResident(rid); }
/* familyLinks() -> every active link of a relative who gave consent, for the "you have not talked for N days"
   reminder (family-callreq.mjs): [{ pid, rid, link, robot, code, label, lang, since, lastMessage, callLink }]. */
export function familyLinks() { return cur().familyLinks(); }

export function createPortal(opts = {}) {
  const DIR = opts.dataDir || process.env.PORTAL_DATA || path.join(HERE, 'data', 'portal');
  const FILE = path.join(DIR, 'portal.json');
  const MEDIA_DIR = path.join(DIR, 'photos');
  const now = opts.now || (() => Date.now());
  const KEEP_MS = (opts.keepDays || 30) * DAY;
  const INVITE_MS = (opts.inviteDays || 14) * DAY;
  const SESSION_MS = (opts.sessionDays || 180) * DAY;
  const CODE_MS = opts.codeMs || 15 * 60 * 1000;
  const PER_DAY = opts.perDay || 20;          // messages a relative may send in a day
  const log = opts.log || ((t) => console.log(new Date().toLocaleTimeString('en-GB') + '  portal: ' + t));
  const limitOn = opts.rateLimit !== false;

  /* ---------- storage ---------- */
  let data = null;
  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
    for (const k of ['robots', 'residents', 'people', 'invites', 'accounts', 'sessions', 'messages', 'offers', 'gone', 'requests', 'notes']) if (!data[k] || typeof data[k] !== 'object') data[k] = {};
    if (!Array.isArray(data.nav)) data.nav = [];
    migrate(data);
    return data;
  }
  /* 1.15 data: one account per (email, resident) and an approval queue. 1.16: people + links, and
     messages that go straight to the robot. */
  function migrate(d) {
    if (d.v === 2) return;
    const byEmail = {};
    for (const p of Object.values(d.people)) byEmail[p.email] = p;
    for (const a of Object.values(d.accounts)) {
      if (!a.pid) {
        let p = byEmail[a.email];
        if (!p) { p = { id: rnd(12), email: a.email, name: a.name, lang: a.lang || 'en', created: a.created || iso(now()), consentAt: a.consentAt || null, consentVersion: a.consentVersion || null }; d.people[p.id] = p; byEmail[a.email] = p; }
        a.pid = p.id;
      }
      if (!STATUSES.includes(a.status)) a.status = 'active';
    }
    for (const s of Object.values(d.sessions)) if (!s.pid && s.account && d.accounts[s.account]) s.pid = d.accounts[s.account].pid;
    const MAP = { received: 'sent', postponed: 'sent', validated: 'received', shown: 'read', refused: 'withdrawn' };
    for (const m of Object.values(d.messages)) {
      if (MAP[m.status]) m.status = MAP[m.status];
      if (!m.pid && d.accounts[m.account]) m.pid = d.accounts[m.account].pid;
      if (m.shownAt && !m.readAt) m.readAt = m.shownAt;
    }
    d.v = 2;
  }
  function save() {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, FILE);
  }
  function mediaPath(name) { return path.join(MEDIA_DIR, name); }
  function dropFiles(m) {
    for (const f of [m && m.photo, m && m.media && m.media.file]) if (f) { try { fs.unlinkSync(mediaPath(f)); } catch (e) { /* already gone */ } }
    if (m) { m.photo = null; if (m.media) m.media.file = null; }
  }
  /* A message leaves: its files are deleted; if the robot may have a copy, a tombstone tells it. */
  function dropMessage(d, id, why) {
    const m = d.messages[id];
    if (!m) return;
    dropFiles(m);
    const res = d.residents[m.rid];
    /* why 'age': the retention ran out (nobody asked for a deletion): a photo the care team put into the
       Memories album stays there (robot/feed 'expired'). */
    if (res) d.gone[id] = why ? { robot: res.robot, at: iso(now()), why } : { robot: res.robot, at: iso(now()) };
    delete d.messages[id];
    for (const [k, n] of Object.entries(d.notes)) if (n.msg === id) delete d.notes[k];
  }

  /* Sign-in codes: memory only. key: person id -> { code, expires, tries } */
  const codes = new Map();
  function newCode(pid) { const c = { code: sixDigits(), expires: now() + CODE_MS, tries: 0 }; codes.set(pid, c); return c; }
  function liveCode(pid) { const c = codes.get(pid); if (c && c.expires > now() && c.tries < 5) return c; codes.delete(pid); return null; }
  /* Voice and video uploads waiting for their message (memory, an hour at most). */
  const uploads = new Map();

  /* ---------- retention ---------- */
  let swept = 0;
  function sweep(force) {
    const t = now();
    if (!force && t - swept < 60000) return;
    swept = t;
    const d = load();
    let changed = false;
    for (const [id, m] of Object.entries(d.messages)) {
      const ref = Date.parse(m.readAt || m.withdrawnAt || m.receivedAt || m.at) || 0;
      if (t - ref > KEEP_MS) { dropMessage(d, id, 'age'); changed = true; }
    }
    for (const [id, g] of Object.entries(d.gone)) if (t - Date.parse(g.at) > 2 * KEEP_MS) { delete d.gone[id]; changed = true; }
    for (const [id, n] of Object.entries(d.notes)) if (t - Date.parse(n.at) > KEEP_MS) { delete d.notes[id]; changed = true; }
    if (d.nav.length && t - Date.parse(d.nav[0].at) > KEEP_MS) { d.nav = d.nav.filter((x) => t - Date.parse(x.at) <= KEEP_MS); changed = true; }
    for (const [c, inv] of Object.entries(d.invites)) if (t > Date.parse(inv.expires) + DAY || (inv.usedAt && t - Date.parse(inv.usedAt) > DAY)) { delete d.invites[c]; changed = true; }
    for (const [h, s] of Object.entries(d.sessions)) if (t > Date.parse(s.expires) || !d.people[s.pid]) { delete d.sessions[h]; changed = true; }
    for (const o of Object.values(d.offers)) if (o.state === 'active' && t > Date.parse(o.until)) { o.state = 'expired'; o.endedAt = iso(t); changed = true; }
    for (const [id, o] of Object.entries(d.offers)) if (['expired', 'stopped', 'cancelled'].includes(o.state) && t - Date.parse(o.endedAt || o.at) > 400 * DAY) { delete d.offers[id]; changed = true; }
    for (const q of Object.values(d.requests)) {
      if (q.state === 'awaiting_family' && t - Date.parse(q.at) > REQUEST_DAYS * DAY) { setState(q, 'expired', 'time'); changed = true; }
      else if (q.state === 'active' && q.until && t > Date.parse(q.until)) { setState(q, 'expired', 'time'); changed = true; }
    }
    for (const [id, q] of Object.entries(d.requests)) if ((q.state === 'expired' || q.state === 'refused') && t - Date.parse(q.updatedAt || q.at) > 400 * DAY) { delete d.requests[id]; changed = true; }
    for (const [k, c] of codes) if (c.expires < t) codes.delete(k);
    for (const [k, u] of uploads) if (t - u.at > 3600 * 1000) { try { fs.unlinkSync(mediaPath(u.file)); } catch (e) { /* gone */ } uploads.delete(k); }
    for (const [s, l] of listens) if (t - l.seen > 6 * 3600 * 1000) listens.delete(s);
    if (changed) save();
  }

  /* ---------- small rate limit (sign-in and invitation codes) ---------- */
  const hits = new Map();
  function limited(req, what, max) {
    if (!limitOn) return false;
    const ip = String((req.headers && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])) || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
    const k = what + '|' + ip, t = now();
    let h = hits.get(k);
    if (!h || t > h.reset) { h = { n: 0, reset: t + 10 * 60 * 1000 }; hits.set(k, h); }
    h.n++;
    if (hits.size > 5000) hits.clear();
    return h.n > max;
  }

  /* ---------- who is asking ---------- */
  function robotOf(req) {
    const m = /^Robot\s+([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{32,86})$/.exec(String((req.headers || {}).authorization || ''));
    if (!m) return null;
    const r = load().robots[m[1]];
    if (!r || !same(r.keyHash, hash(m[2]))) return null;
    r.seen = iso(now());
    return Object.assign({ id: m[1] }, r);
  }
  /* The relative and the resident chosen with 'X-Resident'. access: 'ok' | 'not-linked' |
     'access-suspended' | 'access-removed' | 'no-resident'. */
  function sessionOf(req) {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,80})$/.exec(String((req.headers || {}).authorization || ''));
    if (!m) return null;
    const d = load(), h = hash(m[1]), s = d.sessions[h];
    if (!s || now() > Date.parse(s.expires)) return null;
    const person = d.people[s.pid];
    if (!person) return null;
    const links = Object.values(d.accounts).filter((a) => a.pid === person.id && d.residents[a.rid]);
    const want = str(String((req.headers || {})['x-resident'] || ''), 40);
    let link = null, access = 'ok';
    if (want) {
      link = links.find((a) => a.rid === want) || null;
      if (!link) access = 'not-linked';
    } else {
      link = links.filter((a) => a.status === 'active').sort((x, y) => (x.created > y.created ? 1 : -1))[0] || links[0] || null;
      if (!link) access = 'no-resident';
    }
    if (link && link.status === 'suspended') access = 'access-suspended';
    if (link && link.status === 'removed') access = 'access-removed';
    if (link && link.status === 'pending') access = 'access-pending';
    if (link && link.status === 'refused') access = 'access-refused';
    return { hash: h, session: s, person, links, link, access, account: access === 'ok' ? link : null, resident: access === 'ok' ? d.residents[link.rid] : null };
  }
  function newSession(d, pid) {
    const token = rnd(32);
    d.sessions[hash(token)] = { pid, created: iso(now()), expires: iso(now() + SESSION_MS) };
    return token;
  }
  function personByEmail(d, email) { return Object.values(d.people).find((p) => p.email === email) || null; }
  function newLink(d, pid, rid, by, relation) {
    const a = { id: rnd(12), pid, rid, relation: str(relation, 40), created: iso(now()), createdBy: by, status: 'active', statusAt: iso(now()) };
    d.accounts[a.id] = a;
    return a;
  }
  function linkView(d, a) { const p = d.people[a.pid] || {}; return Object.assign({}, a, { name: p.name || '', email: p.email || '', lang: p.lang || 'en', consentAt: p.consentAt || null }); }

  /* ---------- views ---------- */
  function consentOf(r) { return r && r.consent && LEVELS.includes(r.consent.level) ? r.consent.level : null; }
  /* BF-27: without consent (or 'none', 'messages_album') only messages, calls and the album; 'all' adds
     the activity feed and summaries (F2) and what the resident listens to (listen together). */
  function features(r) {
    const all = consentOf(r) === 'all';
    return { messages: true, album: true, calls: true, premium: true, feed: all, listen: all };
  }
  function kindOf(m) { return m.kind === 'album' ? 'album' : m.media && m.media.kind ? m.media.kind : m.photo ? 'photo' : 'text'; }
  function forFamily(m) {
    const v = { id: m.id, kind: kindOf(m), text: m.text, at: m.at, status: m.status, receivedAt: m.receivedAt || null, deliveredAt: m.deliveredAt || m.receivedAt || null, readAt: m.readAt || null,
      hasPhoto: !!m.photo, hasMedia: !!(m.media && m.media.file), mime: m.media ? m.media.mime : (m.photo ? 'image/jpeg' : '') };
    if (m.kind === 'album') { v.theme = m.theme; v.question = m.question || ''; v.date = m.date || ''; v.hidden = !!m.hidden; }
    return v;
  }
  function offerView(o, pid) {
    const v = { id: o.id, product: o.product || 'play', months: o.months, cents: o.cents, state: o.state, at: o.at, activatedAt: o.activatedAt || null, until: o.until || null, endedAt: o.endedAt || null, demo: true };
    if (pid !== undefined) { v.mine = !!pid && o.pid === pid; if (v.mine) v.from = o.from; }
    return v;
  }
  /* ---------- Premium payment requests (contract 2) ---------- */
  function setState(q, state, by) { q.state = state; q.updatedAt = iso(now()); if (by) q.endedBy = by; }
  /* forPid: the relative asking. BF-28: the payer's name only for the payer himself. */
  function reqView(q, d, forPid) {
    const r = (d || load()).residents[q.rid] || {};
    const v = { id: q.id, code: r.code || '', rid: q.rid, product: q.product, months: q.months, cents: q.cents, currency: q.currency || 'EUR', state: q.state, at: q.at, updatedAt: q.updatedAt || q.at,
      paidAt: q.paidAt || null, until: q.until || null, endedBy: q.endedBy || '', demo: true };
    if (forPid === undefined) v.paidBy = q.paidBy || '';
    else { v.paidByMe = !!forPid && q.paidByPid === forPid; v.paidBy = v.paidByMe ? q.paidBy || '' : ''; }
    return v;
  }
  function residentByCode(robotId, code) { const c = String(code || '').trim().toUpperCase(); return Object.values(load().residents).find((r) => r.robot === robotId && String(r.code).toUpperCase() === c) || null; }
  function hasFamily(d, rid) { return Object.values(d.accounts).some((a) => a.rid === rid && a.status === 'active' && d.people[a.pid] && d.people[a.pid].consentAt); }
  function familyOf(d, rid) { const seen = {}; return Object.values(d.accounts).filter((a) => a.rid === rid && a.status === 'active').map((a) => a.pid).filter((p) => !seen[p] && (seen[p] = 1)); }
  function knownPremium(d, rid, product) {
    const t = now();
    return Object.values(d.requests).some((q) => q.rid === rid && q.product === product && q.state === 'active' && (!q.until || Date.parse(q.until) > t)) ||
      Object.values(d.offers).some((o) => o.rid === rid && (o.product || 'play') === product && o.state === 'active' && (!o.until || Date.parse(o.until) > t));
  }
  function notifyResident(d, rid, event, exceptPid) { for (const pid of familyOf(d, rid)) if (pid !== exceptPid) notify(pid, event); }

  /* ---------- listen together (contract 3, memory only) ---------- */
  const listens = new Map();       // s -> { s, rid, robot, code, opened, seen, now, queue, listeners, closed, adds }
  const LISTEN_LIVE_MS = opts.listenLiveMs || 90 * 1000;
  const QUEUE_MAX = 30;
  function liveListen(rid) {
    let best = null;
    for (const l of listens.values()) if (l.rid === rid && !l.closed && now() - l.seen < LISTEN_LIVE_MS && (!best || l.opened > best.opened)) best = l;
    return best;
  }
  function listenView(l, forPid) {
    const t = now();
    return { s: forPid ? undefined : l.s, open: !l.closed && t - l.seen < LISTEN_LIVE_MS, now: l.now || null,
      queue: l.queue.map((x) => ({ qid: x.qid, id: x.id, title: x.title, artist: x.artist, by: x.by, at: x.at, mine: forPid ? x.pid === forPid : undefined })),
      listeners: Object.keys(l.listeners).map((k) => l.listeners[k]).filter((x) => t - Date.parse(x.at) < 30000).map((x) => ({ name: x.name, at: x.at })) };
  }

  function me(sess) {
    const d = load(), p = sess.person, a = sess.account, r = sess.resident;
    const residents = sess.links.filter((x) => x.status !== 'removed').map((x) => { const rr = d.residents[x.rid]; return { rid: x.rid, label: rr.label, lang: rr.lang, status: x.status, relation: x.relation || '' }; });
    const out = {
      person: { id: p.id, name: p.name, email: p.email, lang: p.lang, consentAt: p.consentAt },
      account: { id: a ? a.id : '', name: p.name, email: p.email, relation: a ? a.relation : '', lang: p.lang, consentAt: p.consentAt, createdBy: a ? a.createdBy : '', callLink: a ? a.callLink || '' : '' },
      needsConsent: !p.consentAt,
      residents, access: sess.access,
      resident: r ? { rid: r.rid, label: r.label || '', lang: r.lang || 'en', consent: consentOf(r), features: features(r) } : null,
      messages: [], offers: [], requests: [], payments: [],
      limits: { text: TEXT_MAX, caption: 90, question: 160, date: 30, photoPx: 1600, voiceBytes: MEDIA.voice.max, videoBytes: MEDIA.video.max, perDay: PER_DAY },
      themes: THEMES, pilotFree: pilotFree(), testPayment: testPayment(), currency: currencyOf(),
      prices: MONTHS.map((n) => ({ months: n, cents: priceCents('play') * n })),
      products: PRODUCTS.map((x) => ({ id: x, currency: currencyOf(), prices: MONTHS.map((n) => ({ months: n, cents: priceCents(x) * n })), premium: r ? knownPremium(d, r.rid, x) : false })),
      listen: { open: false, available: false },
      consentVersion: CONSENT_VERSION
    };
    /* "My payments" (BF-28): only what this relative paid, with their own name. */
    out.payments = Object.values(d.requests).filter((q) => q.paidByPid === p.id).map((q) => Object.assign(reqView(q, d, p.id), { kind: 'request', label: (d.residents[q.rid] || {}).label || '' }))
      .concat(Object.values(d.offers).filter((o) => o.pid === p.id).map((o) => Object.assign(offerView(o, p.id), { kind: 'gift', label: (d.residents[o.rid] || {}).label || '' })))
      .sort((x, y) => ((y.paidAt || y.at) > (x.paidAt || x.at) ? 1 : -1)).slice(0, 20);
    if (!r) return out;
    out.messages = Object.values(d.messages).filter((m) => m.pid === p.id && m.rid === r.rid).sort((x, y) => (y.at > x.at ? 1 : -1)).map(forFamily);
    out.offers = Object.values(d.offers).filter((o) => o.rid === r.rid).sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 10).map((o) => offerView(o, p.id));
    out.requests = Object.values(d.requests).filter((q) => q.rid === r.rid).sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 10).map((q) => reqView(q, d, p.id));
    const f = features(r), l = liveListen(r.rid);
    out.listen = { open: f.listen && !!l, available: f.listen && (!!l || knownPremium(d, r.rid, 'play')) };
    return out;
  }
  function forRobot(m, d) {
    const r = d.residents[m.rid] || {}, a = d.accounts[m.account] || {}, p = d.people[m.pid] || {};
    return { id: m.id, rid: m.rid, code: r.code || '', label: r.label || '', from: m.from || p.name || '', relation: a.relation || '', lang: p.lang || 'en', kind: kindOf(m), text: m.text,
      hasPhoto: !!m.photo, hasMedia: !!(m.media && m.media.file), mime: m.media ? m.media.mime : (m.photo ? 'image/jpeg' : ''),
      theme: m.theme || '', question: m.question || '', date: m.date || '', hidden: !!m.hidden, w: m.w || 0, h: m.h || 0, at: m.at, status: m.status,
      receivedAt: m.receivedAt || null, deliveredAt: m.deliveredAt || m.receivedAt || null, readAt: m.readAt || null, withdrawnAt: m.withdrawnAt || null, teamAlbum: !!m.teamAlbum };
  }
  function residentsOf(robotId) { const d = load(); return Object.values(d.residents).filter((r) => r.robot === robotId); }

  /* ---------- family routes ---------- */
  function family(req, p, body, q, raw) {
    const d = load(), post = req.method === 'POST';
    if (p === 'invite' && post) {
      if (limited(req, 'invite', 30)) return [429, { error: 'slow-down' }];
      const inv = d.invites[normInvite(body.code)];
      if (!inv) return [404, { error: 'unknown-invite' }];
      if (inv.usedAt) return [410, { error: 'used-invite' }];
      if (now() > Date.parse(inv.expires)) return [410, { error: 'expired-invite' }];
      const r = d.residents[inv.rid];
      if (!r) return [404, { error: 'unknown-invite' }];
      return [200, { ok: true, label: r.label, lang: r.lang, consentVersion: CONSENT_VERSION }];
    }
    if (p === 'register' && post) {
      if (limited(req, 'register', 15)) return [429, { error: 'slow-down' }];
      const code = normInvite(body.code), inv = d.invites[code];
      if (!inv || !d.residents[inv.rid]) return [404, { error: 'unknown-invite' }];
      if (inv.usedAt) return [410, { error: 'used-invite' }];
      if (now() > Date.parse(inv.expires)) return [410, { error: 'expired-invite' }];
      if (body.consent !== true) return [400, { error: 'consent-needed' }];
      const email = str(body.email, 160).toLowerCase(), name = str(body.name, 40);
      if (!EMAIL.test(email)) return [400, { error: 'bad-email' }];
      if (!name) return [400, { error: 'bad-name' }];
      /* An address that already has an account signs in first, then adds this resident (family/link):
         an invitation alone never opens someone else's account. */
      if (personByEmail(d, email)) return [409, { error: 'account-exists' }];
      const person = { id: rnd(12), email, name, lang: lang(body.lang), created: iso(now()), consentAt: iso(now()), consentVersion: CONSENT_VERSION };
      d.people[person.id] = person;
      const a = newLink(d, person.id, inv.rid, 'invite', body.relation);
      /* Every NEW family account waits for the care team's one tap, also with an invitation (Rahma, 14 Nov).
         Only a PC test server without a robot (PORTAL_AUTO_ACCEPT=1, Rahma 24 Nov) accepts it at once. */
      a.status = autoAccept() ? 'active' : 'pending';
      inv.usedAt = iso(now()); inv.usedBy = a.id;
      const token = newSession(d, person.id);
      save();
      log('a family account was created with an invitation (resident ' + d.residents[inv.rid].code + '): ' + (a.status === 'active' ? 'accepted at once (PC test)' : 'waiting for the care team'));
      return [200, { token, me: me(a.status === 'active' ? { person, links: [a], link: a, access: 'ok', account: a, resident: d.residents[a.rid] } : { person, links: [a], link: a, access: 'access-pending', account: null, resident: null }) }];
    }
    /* A relative asks for access on their own: first name, last name, relationship, phone, e-mail, consent, and
       the resident's code and name as the access test (BF-03). Always validated by the care team (one tap). */
    if (p === 'request-access' && post) {
      if (limited(req, 'request', 10)) return [429, { error: 'slow-down' }];
      if (body.consent !== true) return [400, { error: 'consent-needed' }];
      const email = str(body.email, 160).toLowerCase(), first = str(body.first, 40), last = str(body.last, 40);
      if (!EMAIL.test(email)) return [400, { error: 'bad-email' }];
      if (!first || !last) return [400, { error: 'bad-name' }];
      const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
      const res = Object.values(d.residents).find((r) => fold(r.code) === fold(body.code) && fold(r.label) === fold(body.resident) && fold(r.code));
      if (!res) { log('request-access refused: no resident with code ' + str(body.code, 24).replace(/[^\w .-]/g, '')); return [404, { error: 'unknown-resident' }]; }
      if (personByEmail(d, email)) return [409, { error: 'account-exists' }];
      const person = { id: rnd(12), email, name: first, last, phone: str(body.phone, 30), lang: lang(body.lang), created: iso(now()), consentAt: iso(now()), consentVersion: CONSENT_VERSION };
      d.people[person.id] = person;
      const a = newLink(d, person.id, res.rid, 'request', body.relation);
      a.status = autoAccept() ? 'active' : 'pending';   /* PC test server only (PORTAL_AUTO_ACCEPT=1) */
      const token = newSession(d, person.id);
      save();
      log('a relative asks for access to ' + res.code + ': ' + (a.status === 'active' ? 'accepted at once (PC test)' : 'see Care Team > To handle'));
      return [200, { token, me: me(a.status === 'active' ? { person, links: [a], link: a, access: 'ok', account: a, resident: d.residents[a.rid] } : { person, links: [a], link: a, access: 'access-pending', account: null, resident: null }) }];
    }
    if (p === 'login/start' && post) {
      if (limited(req, 'login', 12)) return [429, { error: 'slow-down' }];
      const email = str(body.email, 160).toLowerCase();
      if (!EMAIL.test(email)) return [400, { error: 'bad-email' }];
      /* Same answer whether or not the address is known. The code appears in the care team's Family tab. */
      const person = personByEmail(d, email);
      if (person && Object.values(d.accounts).some((a) => a.pid === person.id && a.status !== 'removed')) {
        const c = liveCode(person.id) || newCode(person.id);
        log('sign-in code asked by a relative: ' + c.code + ' (15 min, also shown in Care Team > Family > Accounts)');
      }
      return [200, { ok: true }];
    }
    if (p === 'login/verify' && post) {
      if (limited(req, 'verify', 30)) return [429, { error: 'slow-down' }];
      const email = str(body.email, 160).toLowerCase(), code = String(body.code || '').replace(/\D/g, '');
      if (!EMAIL.test(email) || code.length !== 6) return [400, { error: 'bad-code' }];
      const person = personByEmail(d, email), c = person ? liveCode(person.id) : null;
      if (!c) return [401, { error: 'bad-code' }];
      if (!same(c.code, code)) { c.tries++; return [401, { error: 'bad-code' }]; }
      codes.delete(person.id);
      const token = newSession(d, person.id);
      person.lastSignIn = iso(now());
      save();
      const s = sessionOf({ headers: { authorization: 'Bearer ' + token } });
      return [200, { token, me: me(s) }];
    }

    const sess = sessionOf(req);
    if (!sess) return [401, { error: 'signed-out' }];
    const pr = sess.person;
    if (p === 'me' && !post) return [200, me(sess)];
    /* Install (14 Nov): on an iPhone the app added to the Home Screen does not share the browser's
       storage, so it starts signed out. The browser where the person is signed in makes a normal one-time
       sign-in code for this same person (6 digits, 15 minutes, memory only) to type in the installed app. */
    if (p === 'login/handoff' && post) {
      if (limited(req, 'handoff', 10)) return [429, { error: 'slow-down' }];
      const c = liveCode(pr.id) || newCode(pr.id);
      return [200, { ok: true, code: c.code, email: pr.email, until: iso(c.expires) }];
    }
    if (p === 'logout' && post) { delete d.sessions[sess.hash]; save(); return [200, { ok: true }]; }
    if (p === 'lang' && post) { pr.lang = lang(body.lang); save(); return [200, { ok: true }]; }
    if (p === 'consent' && post) {
      if (body.consent !== true) return [400, { error: 'consent-needed' }];
      pr.consentAt = iso(now()); pr.consentVersion = CONSENT_VERSION; save();
      return [200, me(sess)];
    }
    /* Withdrawing consent ends the access and deletes what this person sent (RGPD). */
    if ((p === 'consent/revoke' || p === 'account/delete') && post) {
      erasePerson(d, pr.id, 'family');
      save();
      log('a relative withdrew consent: account and messages deleted');
      return [200, { ok: true, deleted: true }];
    }
    if (!pr.consentAt) return [403, { error: 'consent-needed' }];
    /* Another resident with a new invitation code (BF-03: one relative, several residents). */
    if (p === 'link' && post) {
      const code = normInvite(body.code), inv = d.invites[code];
      if (!inv || !d.residents[inv.rid]) return [404, { error: 'unknown-invite' }];
      if (inv.usedAt) return [410, { error: 'used-invite' }];
      if (now() > Date.parse(inv.expires)) return [410, { error: 'expired-invite' }];
      let a = Object.values(d.accounts).find((x) => x.pid === pr.id && x.rid === inv.rid);
      if (a && a.status !== 'active') return [403, { error: 'access-' + (a.status === 'suspended' ? 'suspended' : a.status === 'pending' ? 'pending' : a.status === 'refused' ? 'refused' : 'removed') }];
      if (!a) a = newLink(d, pr.id, inv.rid, 'invite', body.relation);
      inv.usedAt = iso(now()); inv.usedBy = a.id;
      save();
      return [200, { ok: true, rid: a.rid, label: d.residents[a.rid].label }];
    }
    /* Deletion on request: everything this person sent (messages, album photos); the account stays. */
    if (p === 'data/delete' && post) {
      let n = 0;
      for (const m of Object.values(d.messages)) if (m.pid === pr.id) { dropMessage(d, m.id); n++; }
      save();
      log('a relative deleted their messages and photos (' + n + ')');
      return [200, { ok: true, deleted: n }];
    }
    /* Everything below concerns the chosen resident: the link must exist and be active (BF-03, BF-04). */
    if (!sess.account) return [403, { error: sess.access === 'ok' ? 'no-resident' : sess.access }];
    const a = sess.account, res = sess.resident;

    if (p === 'upload' && post) {
      const kind = q('kind') === 'video' ? 'video' : q('kind') === 'voice' ? 'voice' : '';
      const mime = String((req.headers || {})['content-type'] || '').split(';')[0].trim().toLowerCase();
      /* raw: a Buffer, or { file, size } when handle() streamed the body to a temporary file */
      const tmp = raw && raw.file ? raw.file : '', bytes = raw ? (tmp ? raw.size : raw.length) : 0;
      const drop = () => { if (tmp) { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } } };
      if (!kind || !MEDIA[kind].types[mime]) { drop(); return [400, { error: 'bad-media' }]; }
      if (!bytes) { drop(); return [400, { error: 'empty' }]; }
      if (bytes > MEDIA[kind].max) { drop(); return [413, { error: 'media-too-big' }]; }
      const id = rnd(12), file = 'up_' + id + '.' + MEDIA[kind].types[mime];
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      if (tmp) fs.renameSync(tmp, mediaPath(file)); else fs.writeFileSync(mediaPath(file), raw);
      uploads.set(id, { pid: pr.id, rid: res.rid, file, mime, kind, bytes, at: now() });
      return [200, { ok: true, upload: id, kind, bytes }];
    }
    if (p === 'message' && post) {
      /* body.album: a photo for the life album, with a theme, a caption, a date and an optional question. */
      const album = body.album && typeof body.album === 'object' ? body.album : null;
      const text = str(body.text, TEXT_MAX + 1), question = album ? str(album.question, 161) : '', date = album ? str(album.date, 31) : '';
      if (text.length > (album ? 90 : TEXT_MAX) || question.length > 160 || date.length > 30) return [400, { error: 'too-long' }];
      if (LINK.test(text) || LINK.test(question) || LINK.test(date)) return [400, { error: 'no-links' }];
      if (album && !THEMES.includes(album.theme)) return [400, { error: 'bad-theme' }];
      let photo = null, size = null, up = null;
      if (body.upload) {
        up = uploads.get(str(body.upload, 40));
        if (!up || up.pid !== pr.id || up.rid !== res.rid) return [400, { error: 'bad-media' }];
      }
      if (body.photo) {
        const mm = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.photo));
        if (!mm) return [400, { error: 'bad-photo' }];
        const buf = Buffer.from(mm[1], 'base64');
        if (buf.length > PHOTO_MAX_BYTES) return [413, { error: 'photo-too-big' }];
        size = jpegSize(buf);
        if (!size || !size.w || !size.h) return [400, { error: 'bad-photo' }];
        if (Math.max(size.w, size.h) > PHOTO_MAX_PX) return [400, { error: 'photo-too-big' }];
        photo = buf;
      }
      if (album && !photo) return [400, { error: 'empty' }];
      if (!text && !photo && !up) return [400, { error: 'empty' }];
      const today = Object.values(d.messages).filter((m) => m.pid === pr.id && now() - Date.parse(m.at) < DAY).length;
      if (today >= PER_DAY) return [429, { error: 'enough-today' }];
      const id = rnd(12), m = { id, rid: res.rid, pid: pr.id, account: a.id, from: pr.name, text, photo: null, w: size ? size.w : 0, h: size ? size.h : 0, at: iso(now()), status: 'sent' };
      if (photo) {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        m.photo = id + '.jpg';
        fs.writeFileSync(mediaPath(m.photo), photo);
      } else if (up) {
        const file = id + path.extname(up.file);
        fs.renameSync(mediaPath(up.file), mediaPath(file));
        uploads.delete(str(body.upload, 40));
        m.media = { kind: up.kind, file, mime: up.mime, bytes: up.bytes };
      }
      if (album) { m.kind = 'album'; m.theme = album.theme; m.question = question; m.date = date; }
      d.messages[id] = m;
      a.lastMessageAt = m.at;   /* kept after the message is deleted: the last time this relative wrote */
      /* BF-12: the Care Team is told: which resident, which kind of message, from whom. */
      const nid = rnd(9);
      d.notes[nid] = { id: nid, robot: res.robot, rid: res.rid, msg: id, kind: kindOf(m), from: pr.name, at: m.at, seen: false };
      save();
      log('new family ' + kindOf(m) + ' for resident ' + res.code + ', straight to the robot');
      return [200, { ok: true, message: forFamily(m) }];
    }
    if ((p === 'photo' || p === 'media') && !post) {
      const m = d.messages[q('id')];
      if (!m || m.pid !== pr.id || m.rid !== res.rid) return [404, { error: 'not-found' }];
      if (m.photo) return { file: mediaPath(m.photo), type: 'image/jpeg' };
      if (m.media && m.media.file) return { file: mediaPath(m.media.file), type: m.media.mime };
      return [404, { error: 'not-found' }];
    }
    if (p === 'message/delete' && post) {
      const m = d.messages[str(body.id, 40)];
      if (!m || m.pid !== pr.id) return [404, { error: 'not-found' }];
      dropMessage(d, m.id);
      save();
      return [200, { ok: true }];
    }
    /* BF-16: hide (or show again) an album photo; deleting it is message/delete. */
    if (p === 'message/hide' && post) {
      const m = d.messages[str(body.id, 40)];
      if (!m || m.pid !== pr.id || m.kind !== 'album') return [404, { error: 'not-found' }];
      m.hidden = body.hidden !== false;
      m.hiddenAt = iso(now());
      save();
      return [200, { ok: true, message: forFamily(m) }];
    }
    if (p === 'offer' && post) {
      const months = Number(body.months), product = body.product === undefined ? 'play' : body.product;
      if (!MONTHS.includes(months)) return [400, { error: 'bad-months' }];
      if (!PRODUCTS.includes(product)) return [400, { error: 'bad-product' }];
      /* One gift at a time per resident AND per product: Play and Books are separate subscriptions. */
      if (Object.values(d.offers).some((o) => o.rid === res.rid && (o.product || 'play') === product && (o.state === 'paid' || o.state === 'active'))) return [409, { error: 'offer-open' }];
      /* TODO(payment): a real payment opens a hosted checkout at the payment provider (Stripe Checkout in
         test mode for the pilot); only its signed webhook may mark the gift as paid. The pilot is free. */
      const o = { id: rnd(12), rid: res.rid, pid: pr.id, account: a.id, from: pr.name, product, months, cents: priceCents(product) * months, state: 'paid', payment: 'demo', at: iso(now()) };
      d.offers[o.id] = o;
      save();
      log('the family of resident ' + res.code + ' offered ' + product + ' Premium for ' + months + ' month(s) (demo); the care team switches it on');
      return [200, { ok: true, offer: offerView(o, pr.id) }];
    }
    if (p === 'offer/stop' && post) {
      const o = d.offers[str(body.id, 40)];
      if (!o || o.rid !== res.rid) return [404, { error: 'not-found' }];
      if (o.state === 'paid') { o.state = 'cancelled'; o.endedAt = iso(now()); }
      else if (o.state === 'active') { o.state = 'stopped'; o.endedAt = iso(now()); o.stoppedBy = 'family'; }
      else return [409, { error: 'not-open' }];
      save();
      log('the family of resident ' + res.code + ' stopped Premium');
      return [200, { ok: true, offer: offerView(o, pr.id) }];
    }
    /* Payment requests from the care team (contract 2): any linked relative may pay (BF-22); SIMULATED
       form, nothing of a card is kept (a fake last-4 may come, it is checked and thrown away). */
    if (p.indexOf('premium-request/') === 0 && post) {
      const qq = d.requests[str(body.id, 40)];
      if (!qq || qq.rid !== res.rid) return [404, { error: 'not-found' }];
      const what = p.slice('premium-request/'.length);
      if (what === 'pay') {
        if (qq.state !== 'awaiting_family') return [409, { error: 'not-open', state: qq.state }];
        if (body.last4 !== undefined && !/^\d{4}$/.test(String(body.last4))) return [400, { error: 'bad-card' }];
        qq.state = 'paid'; qq.paidAt = iso(now()); qq.updatedAt = qq.paidAt; qq.paidBy = pr.name; qq.paidByPid = pr.id; qq.payment = 'demo';
        save();
        log('a relative of resident ' + res.code + ' authorised ' + qq.product + ' Premium (simulated payment, no card data kept)');
        return [200, { ok: true, request: reqView(qq, d, pr.id) }];
      }
      if (what === 'refuse') {
        if (qq.state !== 'awaiting_family') return [409, { error: 'not-open', state: qq.state }];
        setState(qq, 'refused', 'family');
        save();
        return [200, { ok: true, request: reqView(qq, d, pr.id) }];
      }
      if (what === 'stop') {
        if (qq.state !== 'paid' && qq.state !== 'active') return [409, { error: 'not-open', state: qq.state }];
        setState(qq, 'expired', 'family');
        save();
        return [200, { ok: true, request: reqView(qq, d, pr.id) }];
      }
      return [404, { error: 'not-found' }];
    }
    /* Listen together (contract 3): what the resident listens to is follow-up data: consent 'all' only. */
    if (p === 'listen' || p === 'listen/search') {
      if (!features(res).listen) return [403, { error: 'no-consent' }];
      if (p === 'listen' && !post) {
        const l = liveListen(res.rid);
        if (!l) return [200, { open: false, available: knownPremium(d, res.rid, 'play') }];
        l.listeners[pr.id] = { name: pr.name, at: iso(now()) };
        return [200, Object.assign(listenView(l, pr.id), { available: true })];
      }
      if (p === 'listen/search' && !post) {
        const words = fold(q('q')).split(' ').filter(Boolean);
        const items = catalogItems().filter((x) => x.kind !== 'podcast');
        const hits = (words.length ? items.filter((x) => { const t = fold(x.title + ' ' + (x.artist || '')); return words.every((w) => t.indexOf(w) >= 0); }) : items.slice().sort((x, y) => (x.title > y.title ? 1 : -1)))
          .slice(0, 25).map((x) => ({ id: x.id, title: x.title, artist: x.artist || '', year: x.year || null }));
        return [200, { items: hits }];
      }
      if (p === 'listen' && post) {
        const l = liveListen(res.rid);
        if (!l) return [409, { error: 'listen-closed' }];
        l.listeners[pr.id] = { name: pr.name, at: iso(now()) };
        if (body.remove) {
          const i = l.queue.findIndex((x) => x.qid === str(body.remove, 40) && x.pid === pr.id);
          if (i < 0) return [404, { error: 'not-found' }];
          l.queue.splice(i, 1);
          return [200, listenView(l, pr.id)];
        }
        const id = str(body.add, 40), item = catalogItems().find((x) => x.id === id);
        if (!item) return [400, { error: 'not-in-catalogue' }];
        if (l.queue.length >= QUEUE_MAX) return [429, { error: 'queue-full' }];
        const t = now();
        l.adds[pr.id] = (l.adds[pr.id] || []).filter((x) => t - x < 10 * 60 * 1000);
        if (l.adds[pr.id].length >= 10) return [429, { error: 'slow-down' }];
        l.adds[pr.id].push(t);
        l.queue.push({ qid: rnd(9), id: item.id, title: item.title, artist: item.artist || '', by: pr.name, pid: pr.id, at: iso(t) });
        return [200, listenView(l, pr.id)];
      }
    }
    return [404, { error: 'not-found' }];
  }

  /* RGPD erasure of a relative: links, sessions, messages and files; payments keep no name. */
  function erasePerson(d, pid, by) {
    for (const m of Object.values(d.messages)) if (m.pid === pid) dropMessage(d, m.id);
    for (const [h, s] of Object.entries(d.sessions)) if (s.pid === pid) delete d.sessions[h];
    for (const o of Object.values(d.offers)) {
      if (o.pid !== pid) continue;
      if (o.state === 'paid') { o.state = 'cancelled'; o.endedAt = iso(now()); }
      if (o.state === 'active') { o.state = 'stopped'; o.endedAt = iso(now()); o.stoppedBy = by; }
      o.pid = null; o.account = null; o.from = '';
    }
    for (const q of Object.values(d.requests)) if (q.paidByPid === pid) { q.paidBy = ''; q.paidByPid = null; }
    for (const l of listens.values()) { delete l.listeners[pid]; l.queue = l.queue.filter((x) => x.pid !== pid); }
    for (const [k, a] of Object.entries(d.accounts)) if (a.pid === pid) delete d.accounts[k];
    codes.delete(pid);
    delete d.people[pid];
  }

  /* ---------- robot routes (Care Team and patient screen) ---------- */
  function robotRoutes(req, p, body, q) {
    const d = load(), post = req.method === 'POST';
    if (p === 'hello' && post) {
      const id = str(body.robot, 64), key = str(body.key, 86);
      if (!ROBOT_ID.test(id) || !ROBOT_KEY.test(key)) return [400, { error: 'bad-robot' }];
      const r = d.robots[id];
      if (!r) { d.robots[id] = { keyHash: hash(key), created: iso(now()), seen: iso(now()) }; save(); log('a robot registered for the family portal'); return [200, { ok: true, registered: true }]; }
      if (!same(r.keyHash, hash(key))) return [403, { error: 'robot-key' }];
      return [200, { ok: true }];
    }
    const robot = robotOf(req);
    if (!robot) return [401, { error: 'robot-unknown' }];
    const mine = (rid) => { const r = d.residents[rid]; return r && r.robot === robot.id ? r : null; };
    const linkOf = (id) => { const a = d.accounts[str(id, 40)]; return a && mine(a.rid) ? a : null; };

    if (p === 'state' && !post) {
      const res = residentsOf(robot.id), rids = new Set(res.map((r) => r.rid)), t = now();
      const links = Object.values(d.accounts).filter((a) => rids.has(a.rid));
      const list = Object.values(d.messages).filter((m) => rids.has(m.rid));
      return [200, {
        residents: res.map((r) => ({ rid: r.rid, code: r.code, label: r.label, lang: r.lang, consent: r.consent || null,
          accounts: links.filter((a) => a.rid === r.rid).map((a) => { const v = linkView(d, a), c = liveCode(a.pid); return { id: a.id, pid: a.pid, name: v.name, email: v.email, relation: a.relation || '', lang: v.lang, createdBy: a.createdBy, created: a.created, consentAt: v.consentAt, lastSignIn: (d.people[a.pid] || {}).lastSignIn || null, status: a.status, statusAt: a.statusAt || null, code: c ? c.code : '', codeUntil: c ? iso(c.expires) : null, callLink: a.callLink || '', phone: (d.people[a.pid] || {}).phone || '', last: (d.people[a.pid] || {}).last || '' }; }),
          invites: Object.entries(d.invites).filter(([, i]) => i.rid === r.rid && !i.usedAt && t < Date.parse(i.expires)).map(([code, i]) => ({ code, created: i.created, expires: i.expires })) })),
        notifications: Object.values(d.notes).filter((n) => n.robot === robot.id).sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 60).map((n) => {
          const r = d.residents[n.rid] || {}, m = d.messages[n.msg];
          return { id: n.id, rid: n.rid, code: r.code || '', label: r.label || '', kind: n.kind, from: n.from, at: n.at, seen: !!n.seen, message: n.msg, status: m ? m.status : 'deleted', text: m ? m.text : '', hasPhoto: !!(m && m.photo) };
        }),
        messages: list.sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 60).map((m) => forRobot(m, d)),
        nav: d.nav.filter((x) => x.robot === robot.id).slice(-10),
        offers: Object.values(d.offers).filter((o) => rids.has(o.rid)).sort((x, y) => (y.at > x.at ? 1 : -1)).map((o) => Object.assign(offerView(o), { rid: o.rid, code: (d.residents[o.rid] || {}).code || '', from: o.from, laterAt: o.laterAt || null })),
        requests: Object.values(d.requests).filter((x) => rids.has(x.rid)).sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 50).map((x) => reqView(x, d)),
        /* queue: always empty since 1.16 (no approval, BF-11); kept so a 1.15 Care Team (older APK) does not fail. */
        queue: [],
        keepDays: Math.round(KEEP_MS / DAY), pilotFree: pilotFree(), testPayment: testPayment(), now: iso(t)
      }];
    }
    /* What the robot shows: every message of its residents (no approval, BF-11), album photos with their
       hidden flag, and the ids it must drop. */
    if (p === 'feed' && !post) {
      const rids = new Set(residentsOf(robot.id).map((r) => r.rid));
      const msgs = Object.values(d.messages).filter((m) => rids.has(m.rid) && m.status !== 'withdrawn').map((m) => forRobot(m, d));
      const gone = Object.entries(d.gone).filter(([, g]) => g.robot === robot.id).map(([id]) => id)
        .concat(Object.values(d.messages).filter((m) => rids.has(m.rid) && m.status === 'withdrawn').map((m) => m.id));
      const expired = Object.entries(d.gone).filter(([, g]) => g.robot === robot.id && g.why === 'age').map(([id]) => id);
      return [200, { messages: msgs, gone, expired, now: iso(now()) }];
    }
    if ((p === 'photo' || p === 'media') && !post) {
      const m = d.messages[q('id')];
      if (!m || !mine(m.rid)) return [404, { error: 'not-found' }];
      if (m.photo) return { file: mediaPath(m.photo), type: 'image/jpeg' };
      if (m.media && m.media.file) return { file: mediaPath(m.media.file), type: m.media.mime };
      return [404, { error: 'not-found' }];
    }
    /* 14 Nov: the care team put a family photo (a message) into the resident's Memories album on the head,
       or took it out. Kept on the message (teamAlbum in the feed) so that the patient tablet, another
       device, adds it to its own album too. */
    if (p === 'message/album' && post) {
      const m = d.messages[str(body.id, 40)];
      if (!m || !mine(m.rid) || !m.photo) return [404, { error: 'not-found' }];
      m.teamAlbum = body.album === true;
      save();
      return [200, { ok: true, album: m.teamAlbum }];
    }
    /* BF-14: 'received' when the robot has the message (and its file); 'read' when the resident opened it. */
    if (p === 'received' && post) {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
      let n = 0;
      for (const id of ids) {
        const m = d.messages[str(id, 40)];
        if (!m || !mine(m.rid) || m.status !== 'sent') continue;
        m.status = 'received'; m.receivedAt = m.deliveredAt = iso(now()); n++;
      }
      if (n) save();
      return [200, { ok: true, updated: n }];
    }
    if ((p === 'shown' || p === 'read') && post) {
      const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
      let n = 0;
      for (const it of items) {
        const m = it && d.messages[str(it.id, 40)];
        if (!m || !mine(m.rid) || (m.status !== 'sent' && m.status !== 'received')) continue;
        const at = Date.parse(it.at);
        if (!m.receivedAt) m.receivedAt = iso(now());
        if (!m.deliveredAt) m.deliveredAt = m.receivedAt;
        m.status = 'read'; m.readAt = iso(isFinite(at) && at <= now() ? at : now()); m.readBy = it.by === 'team' ? 'team' : 'robot';
        n++;
        const r = d.residents[m.rid] || {};
        notify(m.pid, { type: 'message-read', message: m.id, kind: kindOf(m), rid: m.rid, label: r.label || '', at: m.readAt });
      }
      if (n) save();
      return [200, { ok: true, updated: n }];
    }
    if (p === 'resident' && post) {
      const code = str(body.code, 24), label = str(body.label, 40);
      if (!code || !label) return [400, { error: 'bad-resident' }];
      let r = Object.values(d.residents).find((x) => x.robot === robot.id && x.code === code);
      if (!r) { r = { rid: rnd(12), robot: robot.id, code, created: iso(now()) }; d.residents[r.rid] = r; }
      r.label = label; r.lang = lang(body.lang); r.byTeam = true;   // typed by the team in Family > Accounts: kept by the automatic sync
      save();
      return [200, { ok: true, rid: r.rid }];
    }
    /* The robot lists its residents (code + the first name of the patient card + language) at each sync:
       no manual step. A family word the team set itself is kept. */
    if (p === 'resident/sync' && post) {
      let changed = false;
      for (const x of (Array.isArray(body.residents) ? body.residents : []).slice(0, 200)) {
        const code = str(x && x.code, 24), label = str(x && x.label, 40);
        if (!code || !label) continue;
        let r = Object.values(d.residents).find((y) => y.robot === robot.id && y.code === code);
        if (!r) { r = { rid: rnd(12), robot: robot.id, code, created: iso(now()), label, lang: lang(x.lang) }; d.residents[r.rid] = r; changed = true; continue; }
        if (!r.byTeam && (r.label !== label || r.lang !== lang(x.lang))) { r.label = label; r.lang = lang(x.lang); changed = true; }
      }
      if (changed) save();
      return [200, { ok: true }];
    }
    /* BF-27: the consent the team recorded for the resident (or their legal representative). Lowering it
       takes effect at the family's next request. null: no consent recorded. */
    if (p === 'resident/consent' && post) {
      const r = mine(str(body.rid, 40));
      if (!r) return [404, { error: 'unknown-resident' }];
      if (body.level === null || body.level === '') { delete r.consent; save(); return [200, { ok: true, consent: null }]; }
      if (!LEVELS.includes(body.level)) return [400, { error: 'bad-level' }];
      r.consent = { level: body.level, by: body.by === 'representative' ? 'representative' : 'resident', at: iso(now()), staff: str(body.staff, 20) };
      save();
      log('consent for resident ' + r.code + ': ' + body.level + ' (' + r.consent.by + ')');
      return [200, { ok: true, consent: r.consent }];
    }
    if (p === 'invite' && post) {
      const r = mine(str(body.rid, 40));
      if (!r) return [404, { error: 'unknown-resident' }];
      let code;
      do { code = inviteCode(); } while (d.invites[code]);
      d.invites[code] = { rid: r.rid, created: iso(now()), expires: iso(now() + INVITE_MS) };
      save();
      log('new family invitation for resident ' + r.code + ' (14 days)');
      return [200, { code, expires: d.invites[code].expires }];
    }
    if (p === 'invite/cancel' && post) {
      const code = normInvite(body.code), inv = d.invites[code];
      if (!inv || !mine(inv.rid)) return [404, { error: 'not-found' }];
      delete d.invites[code];
      save();
      return [200, { ok: true }];
    }
    /* BF-02: an account made by the team. An address that already has an account gets one more resident. */
    if (p === 'account' && post) {
      const r = mine(str(body.rid, 40));
      if (!r) return [404, { error: 'unknown-resident' }];
      const email = str(body.email, 160).toLowerCase(), name = str(body.name, 40);
      if (!EMAIL.test(email)) return [400, { error: 'bad-email' }];
      let person = personByEmail(d, email);
      if (!person && !name) return [400, { error: 'bad-name' }];
      if (person && Object.values(d.accounts).some((a) => a.pid === person.id && a.rid === r.rid)) return [409, { error: 'account-exists' }];
      const existing = !!person;
      if (!person) { person = { id: rnd(12), email, name, lang: lang(body.lang), created: iso(now()), consentAt: null }; d.people[person.id] = person; }
      const a = newLink(d, person.id, r.rid, 'team', body.relation);
      save();
      const c = liveCode(person.id) || newCode(person.id);
      log('the care team created a family access for resident ' + r.code);
      return [200, { ok: true, account: a.id, code: c.code, codeUntil: iso(c.expires), existing }];
    }
    if (p === 'account/code' && post) {
      const a = linkOf(body.account);
      if (!a || a.status === 'removed') return [404, { error: 'not-found' }];
      const c = newCode(a.pid);
      return [200, { ok: true, code: c.code, codeUntil: iso(c.expires) }];
    }
    /* BF-04: validate (active), suspend or remove an access. The data stays; the relative loses the
       access at the next request. */
    if (p === 'account/status' && post) {
      const a = linkOf(body.account);
      if (!a) return [404, { error: 'not-found' }];
      if (!STATUSES.includes(body.status)) return [400, { error: 'bad-status' }];
      const was = a.status;
      a.status = body.status; a.statusAt = iso(now()); a.statusBy = str(body.staff, 20);
      save();
      if (was === 'pending' && (a.status === 'active' || a.status === 'refused')) {
        const lb = (d.residents[a.rid] || {}).label || '', ok = a.status === 'active';
        notify(a.pid, { type: 'access', rid: a.rid, label: lb, tab: 'messages',
          title: ok ? { fr: 'Accès à ' + lb + ' validé', de: 'Zugang zu ' + lb + ' bestätigt', en: 'Access to ' + lb + ' approved' } : { fr: 'Refusé', de: 'Abgelehnt', en: 'Declined' }, body: '' });
      }
      log('family access for resident ' + d.residents[a.rid].code + ': ' + a.status);
      return [200, { ok: true, status: a.status }];
    }
    if (p === 'account/remove' && post) {
      const a = linkOf(body.account);
      if (!a) return [404, { error: 'not-found' }];
      a.status = 'removed'; a.statusAt = iso(now());
      save();
      return [200, { ok: true, status: 'removed' }];
    }
    /* RGPD erasure asked to the team: this access and what this relative sent to this resident. */
    if (p === 'account/erase' && post) {
      const a = linkOf(body.account);
      if (!a) return [404, { error: 'not-found' }];
      for (const m of Object.values(d.messages)) if (m.pid === a.pid && m.rid === a.rid) dropMessage(d, m.id);
      delete d.accounts[a.id];
      if (!Object.values(d.accounts).some((x) => x.pid === a.pid)) erasePerson(d, a.pid, 'team');
      save();
      log('the care team erased a family access and its messages');
      return [200, { ok: true }];
    }
    if (p === 'account/call' && post) {
      const a = linkOf(body.account);
      if (!a) return [404, { error: 'not-found' }];
      const link = str(body.link, 400);
      if (link && !CALL_LINK.test(link)) return [400, { error: 'bad-link' }];
      a.callLink = link;
      save();
      return [200, { ok: true }];
    }
    /* BF-12: the team saw the notification. */
    if (p === 'notification/seen' && post) {
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      let n = 0;
      for (const id of ids) { const x = d.notes[str(id, 20)]; if (x && x.robot === robot.id && !x.seen) { x.seen = true; x.seenAt = iso(now()); n++; } }
      if (n) save();
      return [200, { ok: true, updated: n }];
    }
    /* BF-13: send the robot to the resident. The LuckiBot navigation SDK is not integrated yet: the
       request is logged and answered 'pending-sdk'. */
    if (p === 'navigate' && post) {
      const r = mine(str(body.rid, 40)) || residentByCode(robot.id, str(body.code, 24));
      if (!r) return [404, { error: 'unknown-resident' }];
      const x = { id: rnd(9), robot: robot.id, rid: r.rid, code: r.code, place: str(body.place, 60), note: str(body.notification, 20), by: str(body.staff, 20), at: iso(now()), state: 'pending-sdk' };
      d.nav.push(x);
      if (d.nav.length > 200) d.nav.splice(0, d.nav.length - 200);
      save();
      log('the care team asks the robot to go to ' + r.code + (x.place ? ' (' + x.place + ')' : '') + ': logged, the navigation SDK is not integrated yet');
      return [200, { ok: true, request: x }];
    }
    /* The team withdraws a message from the robot (no approval before, BF-11; a safety net after). */
    if (p === 'withdraw' && post) {
      const m = d.messages[str(body.id, 40)];
      if (!m || !mine(m.rid)) return [404, { error: 'not-found' }];
      m.status = 'withdrawn'; m.withdrawnAt = iso(now());
      save();
      return [200, { ok: true }];
    }
    if (p === 'offer' && post) {
      const o = d.offers[str(body.id, 40)];
      if (!o || !mine(o.rid)) return [404, { error: 'not-found' }];
      if (body.decision === 'activate') {
        if (o.state !== 'paid') return [409, { error: 'not-open', state: o.state }];
        o.state = 'active'; o.activatedAt = iso(now()); o.until = iso(addMonths(now(), o.months));
      } else if (body.decision === 'later') {
        if (o.state !== 'paid') return [409, { error: 'not-open', state: o.state }];
        o.laterAt = iso(now());
      } else if (body.decision === 'stop') {
        if (o.state !== 'active') return [409, { error: 'not-open', state: o.state }];
        o.state = 'stopped'; o.endedAt = iso(now()); o.stoppedBy = 'team';
      } else return [400, { error: 'bad-decision' }];
      save();
      return [200, { ok: true, offer: Object.assign(offerView(o), { rid: o.rid }) }];
    }
    /* ---- Premium payment requests (contract 2) ---- */
    if (p === 'premium-request' && post) {
      const product = String(body.product || ''), months = MONTHS.includes(Number(body.months)) ? Number(body.months) : 1;
      if (!PRODUCTS.includes(product)) return [400, { error: 'bad-product' }];
      const r = residentByCode(robot.id, str(body.code, 24));
      /* Nobody to ask: the resident has no active family access (with the relative's consent). */
      if (!r || !hasFamily(d, r.rid)) return [409, { error: 'no-family' }];
      let q2 = Object.values(d.requests).find((x) => x.rid === r.rid && x.product === product && (x.state === 'awaiting_family' || x.state === 'paid'));
      if (q2) return [200, { ok: true, existing: true, request: reqView(q2, d) }];
      q2 = { id: rnd(12), rid: r.rid, robot: robot.id, product, months, cents: priceCents(product) * months, listCents: listCents(product) * months, currency: currencyOf(), state: 'awaiting_family', at: iso(now()) };
      q2.updatedAt = q2.at;
      d.requests[q2.id] = q2;
      save();
      notifyResident(d, r.rid, { type: 'payment-request', request: q2.id, product, rid: r.rid, label: r.label || '' });
      log('the care team asks the family of ' + r.code + ' for ' + product + ' Premium (' + months + ' month(s)); waiting for the family');
      return [200, { ok: true, request: reqView(q2, d) }];
    }
    if (p === 'premium-requests' && !post) {
      const rids = new Set(residentsOf(robot.id).map((r) => r.rid));
      return [200, { requests: Object.values(d.requests).filter((x) => rids.has(x.rid)).sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 50).map((x) => reqView(x, d)), now: iso(now()) }];
    }
    if (p.indexOf('premium-request/') === 0 && post) {
      const q2 = d.requests[str(body.id, 40)];
      if (!q2 || !mine(q2.rid)) return [404, { error: 'not-found' }];
      const what = p.slice('premium-request/'.length);
      if (what === 'active') {
        if (q2.state !== 'paid' && q2.state !== 'active') return [409, { error: 'not-open', state: q2.state }];
        const u = body.until ? Date.parse(body.until) : NaN, was = q2.state;
        q2.until = iso(isFinite(u) && u > now() ? u : addMonths(Date.parse(q2.paidAt || q2.at), q2.months));
        if (was !== 'active') q2.activatedAt = iso(now());
        setState(q2, 'active');
        save();
        if (was !== 'active') { const r = d.residents[q2.rid] || {}; notifyResident(d, q2.rid, { type: 'premium-active', request: q2.id, product: q2.product, rid: q2.rid, label: r.label || '', until: q2.until }); }
        return [200, { ok: true, request: reqView(q2, d) }];
      }
      if (what === 'cancel') {
        if (q2.state === 'refused' || q2.state === 'expired') return [200, { ok: true, request: reqView(q2, d) }];
        setState(q2, 'expired', 'team');
        save();
        return [200, { ok: true, request: reqView(q2, d) }];
      }
      return [404, { error: 'not-found' }];
    }
    /* ---- listen together (contract 3) ---- */
    if (p === 'listen' && post) {
      if (body.s) {
        const l = listens.get(str(body.s, 40));
        if (!l || l.robot !== robot.id) return [404, { error: 'unknown-session' }];
        l.seen = now();
        if (body.close === true) { l.closed = true; return [200, { ok: true, open: false }]; }
        if (body.now && typeof body.now === 'object') l.now = { id: str(body.now.id, 40), title: str(body.now.title, 120), artist: str(body.now.artist, 120), at: iso(now()) };
        else if (body.now === null) l.now = null;
        if (Array.isArray(body.took)) { const took = body.took.map((x) => str(x, 40)); l.queue = l.queue.filter((x) => took.indexOf(x.qid) < 0); }
        return [200, Object.assign({ ok: true }, listenView(l))];
      }
      const r = residentByCode(robot.id, str(body.code, 24));
      if (!r) return [404, { error: 'unknown-resident' }];
      for (const old of listens.values()) if (old.rid === r.rid && !old.closed) old.closed = true;
      const l = { s: rnd(15), rid: r.rid, robot: robot.id, code: r.code, opened: now(), seen: now(), now: null, queue: [], listeners: {}, closed: false, adds: {} };
      listens.set(l.s, l);
      log('listen together opened for ' + r.code + (hasFamily(d, r.rid) ? '' : ' (no family account yet)'));
      return [200, { ok: true, s: l.s, family: hasFamily(d, r.rid), consent: consentOf(r) }];
    }
    if (p === 'listen' && !post) {
      const l = listens.get(q('s'));
      if (!l || l.robot !== robot.id) return [404, { error: 'unknown-session' }];
      l.seen = now();
      return [200, listenView(l)];
    }
    if (p === 'resident/erase' && post) {
      const r = mine(str(body.rid, 40));
      if (!r) return [404, { error: 'unknown-resident' }];
      for (const m of Object.values(d.messages)) if (m.rid === r.rid) dropMessage(d, m.id);
      const pids = new Set(Object.values(d.accounts).filter((a) => a.rid === r.rid).map((a) => a.pid));
      for (const [k, a] of Object.entries(d.accounts)) if (a.rid === r.rid) delete d.accounts[k];
      for (const pid of pids) if (!Object.values(d.accounts).some((a) => a.pid === pid)) erasePerson(d, pid, 'team');
      for (const [c, i] of Object.entries(d.invites)) if (i.rid === r.rid) delete d.invites[c];
      for (const [id, o] of Object.entries(d.offers)) if (o.rid === r.rid) delete d.offers[id];
      for (const [id, x] of Object.entries(d.requests)) if (x.rid === r.rid) delete d.requests[id];
      for (const [id, n] of Object.entries(d.notes)) if (n.rid === r.rid) delete d.notes[id];
      for (const [s2, l] of listens) if (l.rid === r.rid) listens.delete(s2);
      delete d.residents[r.rid];
      save();
      log('the care team erased all family portal data of resident ' + r.code);
      return [200, { ok: true }];
    }
    return [404, { error: 'not-found' }];
  }

  /* ---------- HTTP ---------- */
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Resident, Range', 'Access-Control-Max-Age': '600' };
  function json(res, status, obj) {
    if (res.headersSent) return;
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, CORS));
    res.end(JSON.stringify(obj));
  }
  function icon(res, name) {
    if (name === 'icon.svg') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }, CORS));
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#173D35"/><path d="M50 80 C20 60 14 44 22 33 C30 22 44 25 50 36 C56 25 70 22 78 33 C86 44 80 60 50 80 Z" fill="#F2A766"/></svg>');
      return;
    }
    const size = name === 'icon-512.png' ? 512 : 192;
    ICONS[size] = ICONS[size] || pngIcon(size);
    res.writeHead(200, Object.assign({ 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }, CORS));
    res.end(ICONS[size]);
  }
  /* A file, with HTTP ranges (the robot and the phone play voice and video with seeking). */
  function sendFile(req, res, file, type) {
    fs.stat(file, (err, st) => {
      if (err) { json(res, 404, { error: 'not-found' }); return; }
      const head = Object.assign({ 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' }, CORS);
      const m = /^bytes=(\d*)-(\d*)$/.exec(String((req.headers || {}).range || ''));
      if (m && (m[1] || m[2])) {
        let a = m[1] ? Number(m[1]) : st.size - Number(m[2]), b = m[1] && m[2] ? Number(m[2]) : st.size - 1;
        if (a < 0) a = 0;
        if (b >= st.size) b = st.size - 1;
        if (a > b) { res.writeHead(416, Object.assign({ 'Content-Range': 'bytes */' + st.size }, CORS)); res.end(); return; }
        res.writeHead(206, Object.assign(head, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + st.size, 'Content-Length': b - a + 1 }));
        fs.createReadStream(file, { start: a, end: b }).pipe(res);
        return;
      }
      res.writeHead(200, Object.assign(head, { 'Content-Length': st.size }));
      fs.createReadStream(file).pipe(res);
    });
  }
  function handle(req, res, url) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    const p = url.pathname.replace(/^\/portal\/api\//, '');
    if (p === 'icon.svg' || p === 'icon-192.png' || p === 'icon-512.png') { icon(res, p); return; }
    const upload = p === 'family/upload';
    const max = upload ? MEDIA_MAX : p === 'family/message' ? BODY_MAX : 65536;
    const chunks = [];
    let size = 0, over = false, tmp = '', out0 = null;
    /* A voice or video upload goes to a temporary file while it arrives: a long recording is never held in memory. */
    if (upload) {
      try {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        tmp = mediaPath('part_' + rnd(12) + '.tmp');
        out0 = fs.createWriteStream(tmp);
        out0.on('error', () => { over = true; });
      } catch (e) { tmp = ''; out0 = null; }
    }
    const dropTmp = () => {
      if (out0) { try { out0.destroy(); } catch (e) { /* closed */ } }
      if (tmp) { const t0 = tmp; tmp = ''; setTimeout(() => { try { fs.unlinkSync(t0); } catch (e) { /* gone */ } }, 50); }
    };
    /* A body too big: answered at once, the rest is read and thrown away. */
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > max) { over = true; chunks.length = 0; dropTmp(); json(res, 413, { error: upload ? 'media-too-big' : 'too-big' }); return; }
      if (out0) out0.write(c); else chunks.push(c);
    });
    req.on('error', () => { dropTmp(); /* the client went away */ });
    req.on('aborted', () => { if (!over) { over = true; dropTmp(); } });
    req.on('end', () => {
      if (over) return;
      if (out0) { const t1 = tmp; out0.end(() => go({ file: t1, size })); return; }
      go(null);
    });
    const go = (streamed) => {
      const rawBuf = streamed ? null : Buffer.concat(chunks);
      let body = {};
      if (!upload) {
        const raw = rawBuf.toString('utf8');
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) { json(res, 400, { error: 'bad-json' }); return; }
        if (!body || typeof body !== 'object') body = {};
      }
      const q = (k) => String(url.searchParams.get(k) || '');
      let out;
      try {
        sweep(false);
        const ext = ROUTES.find((x) => p.startsWith(x.prefix));
        if (ext) out = ext.handler(req, url, body, { path: p.slice(ext.prefix.length), q, family: authFamily(req), robot: authRobot(req), res, portal: api });
        else if (p.startsWith('family/')) out = family(req, p.slice(7), body, q, upload ? (streamed || rawBuf) : null);
        else if (p.startsWith('robot/')) out = robotRoutes(req, p.slice(6), body, q);
        else out = [404, { error: 'not-found' }];
      } catch (e) {
        console.error(e);
        out = [500, { error: 'server-error' }];
      }
      Promise.resolve(out).then((o) => {
        if (res.headersSent || res.writableEnded) return;
        if (o && o.file) { sendFile(req, res, o.file, o.type); return; }
        if (!Array.isArray(o)) { json(res, 404, { error: 'not-found' }); return; }
        json(res, o[0], o[1]);
      }, (e) => { console.error(e); json(res, 500, { error: 'server-error' }); });
      /* An upload that no route kept (signed out, not linked, an error): its temporary file goes. */
      if (streamed && streamed.file) setTimeout(() => { try { if (fs.existsSync(streamed.file)) fs.unlinkSync(streamed.file); } catch (e) { /* gone */ } }, 2000);
    };
  }

  /* ---------- the shared functions (see the top of this file) ---------- */
  function authFamily(req) {
    const s = sessionOf(req);
    if (!s || !s.account || !s.person.consentAt) return null;
    const p = s.person, r = s.resident;
    return { id: s.account.id, pid: p.id, name: p.name, email: p.email, lang: p.lang, rid: r.rid, robot: r.robot, code: r.code, label: r.label, consent: consentOf(r) };
  }
  function authRobot(req) { const r = robotOf(req); return r ? { id: r.id } : null; }
  function linkedResidents(id) {
    const d = load(), a = d.accounts[id], pid = a ? a.pid : id;
    return Object.values(d.accounts).filter((x) => x.pid === pid && x.status === 'active').map((x) => d.residents[x.rid]).filter(Boolean)
      .map((r) => ({ robot: r.robot, code: r.code, rid: r.rid, label: r.label }));
  }
  function consentLevel(robot, code) {
    const r = Object.values(load().residents).find((x) => x.robot === robot && String(x.code).toUpperCase() === String(code || '').toUpperCase());
    return consentOf(r);
  }
  function notify(pid, event) {
    if (!NOTIFIER || !pid) return false;
    try { Promise.resolve(NOTIFIER(pid, event)).catch(() => {}); return true; } catch (e) { return false; }
  }
  function residentsOfRobot(robotId) { return residentsOf(robotId).map((r) => ({ rid: r.rid, code: r.code, label: r.label, consent: consentOf(r) })); }
  function personsOfResident(rid) { return familyOf(load(), rid); }
  function familyLinks() {
    const d = load(), last = {};
    for (const m of Object.values(d.messages)) { const k = m.pid + '|' + m.rid; if (!last[k] || m.at > last[k]) last[k] = m.at; }
    return Object.values(d.accounts).filter((a) => a.status === 'active' && d.residents[a.rid] && d.people[a.pid] && d.people[a.pid].consentAt).map((a) => {
      const r = d.residents[a.rid], p = d.people[a.pid], k = a.pid + '|' + a.rid;
      const since = [a.created, a.statusAt, p.consentAt].filter(Boolean).sort().pop() || iso(now());
      const lastMessage = [a.lastMessageAt, last[k]].filter(Boolean).sort().pop() || null;
      return { pid: a.pid, rid: a.rid, link: a.id, robot: r.robot, code: r.code, label: r.label || '', lang: p.lang || 'en', since, lastMessage, callLink: a.callLink || '' };
    });
  }
  const api = { handle, sweep: () => sweep(true), _data: () => load(), _codes: codes, _listens: listens, _uploads: uploads, dir: DIR,
    authFamily, authRobot, linkedResidents, consentLevel, notify, residentsOfRobot, personsOfResident, familyLinks };
  if (!opts.noDefault) CURRENT = api;
  return api;
}

/* The portal store-server.mjs uses: data in labland/data/portal (or PORTAL_DATA), the shared instance. */
export function portalApi(req, res, url) { return cur().handle(req, res, url); }
