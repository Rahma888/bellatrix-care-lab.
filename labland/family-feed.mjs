// Family portal 1.16 (agent F2): the resident's follow-up for the family, BF-05 to BF-09.
// Loaded by store-server.mjs (its hook imports every labland/family-*.mjs module), it registers its
// routes under /portal/api/feed/ with registerRoutes (labland/family-portal.mjs, agent M).
// Plain Node, no packages.
//
// Who talks to it:
//   the robot   js/family-sync.js (patient.html): finished sessions and listening events, and
//               js/family-share-staff.js (Care Team): photos and moments shared with the family.
//               Authorization: Robot <robot id>.<robot key>, as for the family messages.
//   the family  js/portail-feed.js (portail.html): today, history by date, listening, summaries,
//               moments. Authorization: Bearer <session token>; the resident is the X-Resident header
//               (its random id), checked against the relative's own links (BF-03).
//
// Consent (BF-27): everything here is shown ONLY when the resident's level is 'all'. The level is read
// at every request (a lowered level takes effect at once); the robot asks for the levels before it
// uploads and the server refuses anything else. At 'none' (or no consent at all) the stored follow-up
// of that resident is deleted; at 'messages_album' it is kept hidden until the retention ends.
//
// What it keeps (<portal data>/feed/feed.json, team photos in <portal data>/feed/photos/):
//   items     per resident (its random id): sessions { activity, start, end, dur, outcome, result,
//             part } and listening { type: music | podcast | book | karaoke, title, artist,
//             start, dur }. Never a name, never the session log, never what the resident said.
//   moments   per resident: photos and short texts the care team shares, and the important events
//             found in the uploads (IMPORTANT below).
//   firsts    per resident: the date of the first karaoke, the first game won (for "first ..." events).
// Retention: FEED_KEEP_DAYS (env) or configureFeed({ keepDays }), 30 days by default (the week
// trends need at least 14). Deleted with the resident (Care Team > erase): the next sweep finds the
// resident gone from the portal and deletes its follow-up and photos; robot/erase does it at once.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerRoutes } from './family-portal.mjs';

const DAY = 24 * 3600 * 1000;
const TYPES = ['music', 'podcast', 'book', 'karaoke'];
const OUTCOMES = ['completed', 'stopped', 'partial'];
const MAX_UPLOAD = 100;              // items in one upload
const MAX_PER_RESIDENT = 4000;       // items kept for one resident (the oldest go first)
const MAX_MOMENTS = 300;
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_MAX_PX = 2048;
const PART_CHARS = 60000;            // a photo travels in parts: the portal reads bodies up to 64 KB
const TEXT_MAX = 140;
/* BF-09: the important events that become a "moment" for the family (and a notification).
   A sensible default, TO DEFINE WITH THE CARE TEAM (BF-09 "la liste des événements importants est
   définie avec l'équipe"): FEED_EVENTS="birthday,first-karaoke" (env) or configureFeed({ events }). */
const IMPORTANT = ['birthday', 'first-karaoke', 'first-win', 'first-book', 'team-photo'];

const CFG = {
  now: () => Date.now(),
  keepDays: Number(process.env.FEED_KEEP_DAYS) > 0 ? Number(process.env.FEED_KEEP_DAYS) : 30,
  events: process.env.FEED_EVENTS ? String(process.env.FEED_EVENTS).split(',').map((s) => s.trim()).filter(Boolean) : IMPORTANT.slice(),
  log: (t) => console.log(new Date().toLocaleTimeString('en-GB') + '  feed: ' + t)
};
/* Tests and the server may change the clock, the retention, the events and the log. */
export function configureFeed(o = {}) {
  if (typeof o.now === 'function') CFG.now = o.now;
  if (Number(o.keepDays) > 0) CFG.keepDays = Number(o.keepDays);
  if (Array.isArray(o.events)) CFG.events = o.events.slice();
  if (typeof o.log === 'function') CFG.log = o.log;
  for (const st of STORES.values()) st.swept = 0;
  return Object.assign({}, CFG);
}
const now = () => CFG.now();
const keepMs = () => CFG.keepDays * DAY;

/* ---------- small helpers ---------- */
function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function rnd(n) { return crypto.randomBytes(n || 12).toString('base64url'); }
function iso(t) { return new Date(t).toISOString(); }
function num(v, min, max) { if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null; const n = Number(v); return isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null; }
function isDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function localDay(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(day, n) { const d = new Date(Date.parse(day + 'T12:00:00Z') + n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function pct(a, b) { return b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? null : 0); }
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

/* ---------- storage, one per portal data folder (the tests run their own portal) ---------- */
const STORES = new Map();
function storeFor(portal) {
  const dir = path.join(portal && portal.dir ? portal.dir : path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'data', 'portal'), 'feed');
  let st = STORES.get(dir);
  if (st) return st;
  const FILE = path.join(dir, 'feed.json');
  let data = null;
  st = {
    dir, photos: path.join(dir, 'photos'), swept: 0, parts: new Map(),
    load() {
      if (data) return data;
      try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = {}; }
      if (!data || typeof data !== 'object') data = {};
      for (const k of ['items', 'moments', 'firsts', 'res']) if (!data[k] || typeof data[k] !== 'object') data[k] = {};
      return data;
    },
    save() {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, FILE);
    }
  };
  STORES.set(dir, st);
  return st;
}
function dropPhoto(st, m) { if (m && m.photo) { try { fs.unlinkSync(path.join(st.photos, m.photo)); } catch (e) { /* already gone */ } m.photo = null; } }
function eraseResident(st, d, rid) {
  for (const m of d.moments[rid] || []) dropPhoto(st, m);
  delete d.items[rid]; delete d.moments[rid]; delete d.firsts[rid]; delete d.res[rid];
  for (const [k, p] of st.parts) if (p.rid === rid) st.parts.delete(k);
}

/* The resident as the portal knows it now (null: erased). */
function residentNow(portal, robot, rid) {
  try { return (portal.residentsOfRobot(robot) || []).find((r) => r.rid === rid) || null; } catch (e) { return null; }
}

/* ---------- retention, erased residents, withdrawn consent ---------- */
function sweep(st, portal, force) {
  const t = now();
  if (!force && t - st.swept < 60000) return;
  st.swept = t;
  const d = st.load(), cut = t - keepMs();
  let changed = false;
  const rids = new Set([...Object.keys(d.items), ...Object.keys(d.moments), ...Object.keys(d.firsts), ...Object.keys(d.res)]);
  for (const rid of rids) {
    const meta = d.res[rid];
    const r = meta ? residentNow(portal, meta.robot, rid) : null;
    /* Gone from the portal (the care team erased the resident), or no consent any more: deleted. */
    if (!r || r.consent === 'none' || r.consent === null || r.consent === undefined) { eraseResident(st, d, rid); changed = true; continue; }
    const list = d.items[rid] || [];
    const keep = list.filter((x) => Date.parse(x.end || x.start) >= cut);
    if (keep.length !== list.length) { d.items[rid] = keep; changed = true; }
    const ms = d.moments[rid] || [];
    const keepM = ms.filter((m) => { const ok = Date.parse(m.at) >= cut; if (!ok) dropPhoto(st, m); return ok; });
    if (keepM.length !== ms.length) { d.moments[rid] = keepM; changed = true; }
  }
  for (const [k, p] of st.parts) if (t - p.at > 10 * 60 * 1000) st.parts.delete(k);
  if (changed) st.save();
}

/* ---------- what the robot sends, checked ---------- */
function cleanResult(r) {
  if (!r || typeof r !== 'object') return null;
  const k = str(r.k, 20);
  if (!/^[A-Za-z]{1,20}$/.test(k)) return null;
  const out = { k };
  const v = str(r.v, 20); if (/^[a-z-]{1,20}$/.test(v)) out.v = v;
  const n = num(r.n, 0, 100000); if (n !== null) out.n = n;
  const of = num(r.of, 0, 100000); if (of !== null) out.of = of;
  return out;
}
function cleanPart(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  if (['yes', 'maybe', 'no'].includes(p.again)) out.again = p.again;
  const acts = num(p.acts, 0, 100000); if (acts !== null) out.acts = acts;
  const help = num(p.help, 0, 1000); if (help !== null) out.help = help;
  return Object.keys(out).length ? out : null;
}
function cleanItem(x) {
  if (!x || typeof x !== 'object') return { why: 'bad-item' };
  const cid = str(x.cid, 80);
  if (!/^[A-Za-z0-9:_.\-]{1,80}$/.test(cid)) return { why: 'bad-id' };
  const kind = x.kind === 'listen' ? 'listen' : x.kind === 'session' ? 'session' : '';
  if (!kind) return { cid, why: 'bad-kind' };
  const start = Date.parse(x.start);
  const t = now();
  if (!isFinite(start) || start > t + 10 * 60 * 1000) return { cid, why: 'bad-time' };
  const dur = num(x.dur, 0, 6 * 3600) || 0;
  const end = isFinite(Date.parse(x.end)) ? Math.max(start, Math.min(Date.parse(x.end), t + 10 * 60 * 1000)) : start + dur * 1000;
  if (end < t - keepMs()) return { cid, why: 'too-old' };
  const it = { cid, kind, start: iso(start), end: iso(end), dur, day: isDay(x.day) ? x.day : localDay(start) };
  if (kind === 'session') {
    const act = str(x.activity, 24);
    if (!/^[a-z0-9_-]{1,24}$/.test(act)) return { cid, why: 'bad-activity' };
    it.activity = act;
    it.outcome = OUTCOMES.includes(x.outcome) ? x.outcome : 'partial';
    const r = cleanResult(x.result); if (r) it.result = r;
    const p = cleanPart(x.part); if (p) it.part = p;
    const marks = Array.isArray(x.marks) ? x.marks.filter((k) => k === 'birthday' || k === 'book-end') : [];
    if (marks.length) it.marks = marks;
  } else {
    if (!TYPES.includes(x.type)) return { cid, why: 'bad-type' };
    it.type = x.type;
    it.title = str(x.title, 120);
    if (!it.title) return { cid, why: 'bad-title' };
    const artist = str(x.artist, 80); if (artist) it.artist = artist;
    if (x.activity && /^[a-z0-9_-]{1,24}$/.test(String(x.activity))) it.activity = String(x.activity);
  }
  return { item: it };
}

/* ---------- the important events (BF-09) ---------- */
const EVENT_TEXT = {
  'birthday': { en: 'Happy birthday, {name}!', fr: 'Joyeux anniversaire, {name} !', de: 'Alles Gute zum Geburtstag, {name}!' },
  'first-karaoke': { en: '{name} sang karaoke for the first time', fr: '{name} a chanté au karaoké pour la première fois', de: '{name} hat zum ersten Mal Karaoke gesungen' },
  'first-win': { en: '{name} won a game for the first time', fr: '{name} a gagné une partie pour la première fois', de: '{name} hat zum ersten Mal ein Spiel gewonnen' },
  'first-book': { en: '{name} listened to a whole book', fr: '{name} a écouté un livre en entier', de: '{name} hat ein ganzes Buch gehört' },
  'team-photo': { en: 'The care team shared a moment with {name}', fr: 'L’équipe a partagé un moment avec {name}', de: 'Das Pflegeteam hat einen Moment mit {name} geteilt' }
};
function tell(portal, rid, label, m) {
  if (!CFG.events.includes(m.event)) return;
  let persons = [];
  try { persons = portal.personsOfResident(rid) || []; } catch (e) { persons = []; }
  const tx = EVENT_TEXT[m.event] || EVENT_TEXT['team-photo'];
  const body = {};
  for (const l of ['en', 'fr', 'de']) body[l] = tx[l].replace('{name}', label || '');
  for (const pid of persons) {
    try { portal.notify(pid, { type: 'feed-moment', kind: 'moment', event: m.event, id: m.id, rid, label: label || '', at: m.at, tab: 'feed', title: { en: 'Bellatrix', fr: 'Bellatrix', de: 'Bellatrix' }, body }); } catch (e) { /* the moment is there anyway */ }
  }
}
function addMoment(st, d, rid, m) {
  const list = d.moments[rid] = d.moments[rid] || [];
  list.push(m);
  list.sort((a, b) => (a.at < b.at ? -1 : 1));
  while (list.length > MAX_MOMENTS) dropPhoto(st, list.shift());
}
/* An upload may hold an important event: a birthday greeting, the first karaoke, the first game won,
   a whole book heard. Each becomes a moment (without photo) for the family. */
function events(st, d, portal, r, it) {
  if (it.kind !== 'session') return;
  const f = d.firsts[r.rid] = d.firsts[r.rid] || {};
  const found = [];
  if (it.marks && it.marks.includes('birthday') && !(d.moments[r.rid] || []).some((m) => m.event === 'birthday' && m.day === it.day)) found.push('birthday');
  if (it.activity === 'karaoke' && !f.karaoke) { f.karaoke = it.start; found.push('first-karaoke'); }
  if (it.result && it.result.v === 'win' && !f.win) { f.win = it.start; found.push('first-win'); }
  if (it.marks && it.marks.includes('book-end') && !f.book) { f.book = it.start; found.push('first-book'); }
  for (const ev of found) {
    if (!CFG.events.includes(ev)) continue;
    const m = { id: rnd(12), at: it.end || it.start, day: it.day, kind: 'event', event: ev, activity: it.activity || '', text: '', by: 'robot' };
    addMoment(st, d, r.rid, m);
    tell(portal, r.rid, r.label, m);
  }
}

/* ---------- what the family sees ---------- */
function view(it) {
  const v = { id: it.id, kind: it.kind, start: it.start, end: it.end, dur: it.dur, day: it.day, at: it.rx };
  if (it.kind === 'session') {
    v.activity = it.activity; v.outcome = it.outcome;
    if (it.result) v.result = it.result;
    if (it.part) v.part = it.part;
  } else {
    v.type = it.type; v.title = it.title;
    if (it.artist) v.artist = it.artist;
  }
  return v;
}
function momentView(m) { return { id: m.id, at: m.at, day: m.day || localDay(Date.parse(m.at)), kind: m.kind, event: m.event || '', text: m.text || '', activity: m.activity || '', hasPhoto: !!m.photo, w: m.w || 0, h: m.h || 0 }; }
const sessions = (list) => list.filter((x) => x.kind === 'session');
const listens = (list) => list.filter((x) => x.kind === 'listen');
function won(x) { return x.result && x.result.v === 'win'; }
function played(x) { return x.result && (x.result.v === 'win' || x.result.v === 'loss' || x.result.v === 'draw'); }
function stats(list) {
  const s = sessions(list), l = listens(list);
  const secs = s.reduce((a, x) => a + (x.dur || 0), 0), lsecs = l.reduce((a, x) => a + (x.dur || 0), 0);
  const byType = {};
  for (const t of TYPES) { const xs = l.filter((x) => x.type === t); byType[t] = { count: xs.length, minutes: Math.round(xs.reduce((a, x) => a + (x.dur || 0), 0) / 60) }; }
  return { count: s.length, minutes: Math.round(secs / 60), seconds: secs, completed: s.filter((x) => x.outcome === 'completed').length,
    listens: l.length, listenMinutes: Math.round(lsecs / 60), byType, games: { played: s.filter(played).length, won: s.filter(won).length } };
}
/* BF-07: participation (done to the end, "again?"), only when sessions exist; otherwise null. */
function partOf(list) {
  const s = sessions(list);
  if (!s.length) return null;
  const ag = s.filter((x) => x.part && x.part.again);
  return { started: s.length, completed: s.filter((x) => x.outcome === 'completed').length,
    again: ag.length ? { yes: ag.filter((x) => x.part.again === 'yes').length, maybe: ag.filter((x) => x.part.again === 'maybe').length, no: ag.filter((x) => x.part.again === 'no').length } : null };
}
function topOf(list) {
  const by = {};
  for (const x of sessions(list)) { const b = by[x.activity] = by[x.activity] || { activity: x.activity, count: 0, minutes: 0 }; b.count++; b.minutes += (x.dur || 0) / 60; }
  return Object.values(by).map((b) => ({ activity: b.activity, count: b.count, minutes: Math.round(b.minutes) })).sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 4);
}
function inDays(list, from, to) { return list.filter((x) => x.day >= from && x.day <= to); }

/* ---------- routes ---------- */
function robotRoute(st, req, p, body, ctx) {
  const portal = ctx.portal, robot = ctx.robot, post = req.method === 'POST', d = st.load();
  const residents = () => { try { return portal.residentsOfRobot(robot.id) || []; } catch (e) { return []; } };
  const byCode = (code) => { const c = String(code || '').trim().toUpperCase(); return c ? residents().find((r) => String(r.code).toUpperCase() === c) || null : null; };
  const track = (r) => { d.res[r.rid] = { robot: robot.id, code: r.code }; };

  if (p === 'consent' && !post) {
    return [200, { residents: residents().map((r) => ({ code: r.code, consent: r.consent || null })), keepDays: CFG.keepDays, now: iso(now()) }];
  }
  if (p === 'upload' && post) {
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items) return [400, { error: 'bad-items' }];
    if (items.length > MAX_UPLOAD) return [413, { error: 'too-many' }];
    const accepted = [], refused = [];
    let added = 0;
    for (const raw of items) {
      const c = cleanItem(raw);
      if (!c.item) { refused.push({ cid: c.cid || '', why: c.why }); continue; }
      const r = byCode(raw.code);
      if (!r) { refused.push({ cid: c.item.cid, why: 'unknown-resident' }); continue; }
      /* BF-27, checked again here: only at level 'all'. */
      if (r.consent !== 'all') { refused.push({ cid: c.item.cid, why: 'consent' }); continue; }
      const list = d.items[r.rid] = d.items[r.rid] || [];
      if (list.some((x) => x.cid === c.item.cid && x.robot === robot.id)) { accepted.push(c.item.cid); continue; }
      const it = Object.assign({ id: rnd(9), robot: robot.id, rx: iso(now()) }, c.item);
      list.push(it);
      track(r);
      events(st, d, portal, r, it);
      accepted.push(it.cid);
      added++;
    }
    for (const rid of Object.keys(d.items)) {
      const list = d.items[rid];
      list.sort((a, b) => (a.start < b.start ? -1 : 1));
      if (list.length > MAX_PER_RESIDENT) list.splice(0, list.length - MAX_PER_RESIDENT);
    }
    if (added) st.save();
    return [200, { ok: true, accepted, refused }];
  }
  /* BF-09: a photo or a short text shared by the care team. The photo travels in parts (bodies are
     read up to 64 KB): robot/moment { code, text, parts } then robot/moment/part { id, i, data }. */
  if (p === 'moment' && post) {
    const r = byCode(body.code);
    if (!r) return [404, { error: 'unknown-resident' }];
    if (r.consent !== 'all') return [403, { error: 'consent', level: r.consent || null }];
    const text = str(body.text, TEXT_MAX + 1);
    if (text.length > TEXT_MAX) return [400, { error: 'too-long' }];
    const parts = num(body.parts, 0, 80) || 0;
    if (!parts && !text) return [400, { error: 'empty' }];
    const activity = /^[a-z0-9_-]{1,24}$/.test(String(body.activity || '')) ? String(body.activity) : '';
    const m = { id: rnd(12), at: iso(now()), day: isDay(body.day) ? body.day : localDay(now()), kind: parts ? 'photo' : 'text', event: 'team-photo', text, activity, by: 'team' };
    if (!parts) {
      addMoment(st, d, r.rid, m); track(r); st.save();
      tell(portal, r.rid, r.label, m);
      CFG.log('the care team shared a moment with the family of ' + r.code);
      return [200, { ok: true, id: m.id, done: true }];
    }
    st.parts.set(m.id, { rid: r.rid, code: r.code, label: r.label, robot: robot.id, m, parts, got: new Array(parts).fill(null), at: now() });
    return [200, { ok: true, id: m.id, done: false }];
  }
  if (p === 'moment/part' && post) {
    const up = st.parts.get(str(body.id, 40));
    if (!up || up.robot !== robot.id) return [404, { error: 'not-found' }];
    const i = num(body.i, 0, 1000), data = typeof body.data === 'string' ? body.data : '';
    if (i === null || i >= up.parts || !data || data.length > PART_CHARS || !/^[A-Za-z0-9+/=]+$/.test(data)) return [400, { error: 'bad-part' }];
    up.got[i] = data; up.at = now();
    if (up.got.some((x) => x === null)) return [200, { ok: true, done: false }];
    st.parts.delete(str(body.id, 40));
    const buf = Buffer.from(up.got.join(''), 'base64');
    if (buf.length > PHOTO_MAX_BYTES) return [413, { error: 'photo-too-big' }];
    const size = jpegSize(buf);
    if (!size || !size.w || !size.h) return [400, { error: 'bad-photo' }];
    if (Math.max(size.w, size.h) > PHOTO_MAX_PX) return [400, { error: 'photo-too-big' }];
    const r = residentNow(portal, robot.id, up.rid);
    if (!r) return [404, { error: 'unknown-resident' }];
    if (r.consent !== 'all') return [403, { error: 'consent', level: r.consent || null }];
    fs.mkdirSync(st.photos, { recursive: true });
    up.m.photo = up.m.id + '.jpg'; up.m.w = size.w; up.m.h = size.h;
    fs.writeFileSync(path.join(st.photos, up.m.photo), buf);
    addMoment(st, d, r.rid, up.m); d.res[r.rid] = { robot: robot.id, code: r.code }; st.save();
    tell(portal, r.rid, r.label, up.m);
    CFG.log('the care team shared a photo with the family of ' + r.code);
    return [200, { ok: true, id: up.m.id, done: true }];
  }
  if (p === 'moments' && !post) {
    const r = byCode(ctx.q('code'));
    if (!r) return [404, { error: 'unknown-resident' }];
    return [200, { items: (d.moments[r.rid] || []).slice().reverse().map(momentView), consent: r.consent || null }];
  }
  if (p === 'photo' && !post) {
    const id = ctx.q('id');
    for (const r of residents()) {
      const m = (d.moments[r.rid] || []).find((x) => x.id === id);
      if (m && m.photo) return { file: path.join(st.photos, m.photo), type: 'image/jpeg' };
    }
    return [404, { error: 'not-found' }];
  }
  if (p === 'moment/delete' && post) {
    const id = str(body.id, 40);
    for (const r of residents()) {
      const list = d.moments[r.rid] || [], i = list.findIndex((x) => x.id === id);
      if (i >= 0) { dropPhoto(st, list[i]); list.splice(i, 1); st.save(); return [200, { ok: true }]; }
    }
    return [404, { error: 'not-found' }];
  }
  /* The care team erases a resident's follow-up at once (it also goes with the resident's data). */
  if (p === 'erase' && post) {
    const r = byCode(body.code);
    if (!r) return [404, { error: 'unknown-resident' }];
    eraseResident(st, d, r.rid); st.save();
    CFG.log('the follow-up of ' + r.code + ' was erased');
    return [200, { ok: true }];
  }
  return [404, { error: 'not-found' }];
}

/* The relative and the resident asked for: the X-Resident header (or ?r=) must be one of their own
   links (BF-03), whatever the portal would choose by itself; then the consent level (BF-27). */
function familyCtx(req, ctx) {
  const portal = ctx.portal;
  const headers = Object.assign({}, req.headers || {});
  const want = String(headers['x-resident'] || ctx.q('r') || '').trim();
  delete headers['x-resident'];
  let base = null;
  try { base = portal.authFamily({ headers, socket: req.socket, method: req.method, url: req.url }); } catch (e) { base = null; }
  if (!base && !want) base = ctx.family || null;
  /* No relative (signed out, access suspended or removed, the RGPD notice not accepted): a token that
     came gets 403, so the portal's own checks decide what to show; no token at all gets 401. */
  if (!base) return { err: /^Bearer\s/i.test(String(headers.authorization || '')) ? [403, { error: 'no-access' }] : [401, { error: 'signed-out' }] };
  let links = [];
  try { links = portal.linkedResidents(base.pid || base.id) || []; } catch (e) { links = []; }
  if (!links.length && base.rid) links = [{ robot: base.robot, code: base.code, rid: base.rid, label: base.label }];
  let r = null;
  if (want) { r = links.find((x) => x.rid === want) || null; if (!r) return { err: [403, { error: 'not-linked' }] }; }
  else r = links.find((x) => x.rid === base.rid) || links[0] || null;
  if (!r) return { err: [410, { error: 'resident-gone' }] };
  let level = null;
  try { level = portal.consentLevel(r.robot, r.code); } catch (e) { level = null; }
  if (level !== 'all') return { err: [403, { error: 'consent', level: level || null }] };
  return { who: base, res: r, level };
}

function familyRoute(st, req, p, body, ctx) {
  if (req.method !== 'GET') return [405, { error: 'get-only' }];
  const f = familyCtx(req, ctx);
  if (f.err) return f.err;
  const d = st.load(), rid = f.res.rid, all = d.items[rid] || [];
  const today = isDay(ctx.q('today')) ? ctx.q('today') : localDay(now());
  const day = isDay(ctx.q('day')) ? ctx.q('day') : today;
  const base = { resident: { rid, label: f.res.label || '' }, keepDays: CFG.keepDays, now: iso(now()) };

  /* BF-05: one day of activities (live: the portal asks again every 30 s; "at" is when it arrived). */
  if (p === 'day') {
    const list = all.filter((x) => x.day === day);
    const ms = (d.moments[rid] || []).filter((m) => (m.day || localDay(Date.parse(m.at))) === day);
    return [200, Object.assign(base, { day, items: sessions(list).slice().reverse().map(view), listens: listens(list).slice().reverse().map(view),
      moments: ms.slice().reverse().map(momentView), summary: stats(list), part: partOf(list) })];
  }
  /* BF-05: the history, by date (the days within the retention that hold something). */
  if (p === 'days') {
    const by = {};
    for (const x of all) { const b = by[x.day] = by[x.day] || { day: x.day, count: 0, minutes: 0, listens: 0, moments: 0 }; if (x.kind === 'session') { b.count++; b.minutes += (x.dur || 0) / 60; } else b.listens++; }
    for (const m of d.moments[rid] || []) { const k = m.day || localDay(Date.parse(m.at)); const b = by[k] = by[k] || { day: k, count: 0, minutes: 0, listens: 0, moments: 0 }; b.moments++; }
    const first = localDay(now() - keepMs());
    return [200, Object.assign(base, { from: first, to: today, days: Object.values(by).filter((b) => b.day >= first).map((b) => Object.assign(b, { minutes: Math.round(b.minutes) })).sort((a, b) => (a.day < b.day ? 1 : -1)) })];
  }
  /* BF-06: what was heard (music, podcasts, books, karaoke), with start and length. */
  if (p === 'listening') {
    const n = num(ctx.q('days'), 1, 60) || 7, from = addDays(day, -(n - 1));
    const list = listens(inDays(all, from, day));
    return [200, Object.assign(base, { from, to: day, items: list.slice().reverse().map(view), totals: stats(list).byType })];
  }
  /* BF-07: participation, only when it exists (otherwise null: the portal hides it). No mood at all
     (Rahma, 10 Nov 2026: the mood question left the robot in 1.15.2; no mood in the family portal). */
  if (p === 'participation') {
    const n = num(ctx.q('days'), 1, 60) || 7, list = inDays(all, addDays(day, -(n - 1)), day);
    return [200, Object.assign(base, { part: partOf(list) })];
  }
  /* BF-08: the day and the last 7 days, compared with the 7 days before. */
  if (p === 'summary') {
    const wFrom = addDays(day, -6), pFrom = addDays(day, -13), pTo = addDays(day, -7);
    const dayList = all.filter((x) => x.day === day), week = inDays(all, wFrom, day), prev = inDays(all, pFrom, pTo);
    const W = stats(week), P = stats(prev);
    const per = (from) => { const out = []; for (let i = 0; i < 7; i++) { const k = addDays(from, i), xs = sessions(all.filter((x) => x.day === k)); out.push({ day: k, count: xs.length, minutes: Math.round(xs.reduce((a, x) => a + (x.dur || 0), 0) / 60) }); } return out; };
    return [200, Object.assign(base, {
      day, today: stats(dayList), week: Object.assign(W, { from: wFrom, to: day }), prev: Object.assign(P, { from: pFrom, to: pTo }),
      trend: { count: W.count - P.count, countPct: pct(W.count, P.count), minutes: W.minutes - P.minutes, minutesPct: pct(W.minutes, P.minutes),
        listenMinutes: W.listenMinutes - P.listenMinutes, listenPct: pct(W.listenMinutes, P.listenMinutes), hasPrev: P.count > 0 || P.listens > 0 },
      perDay: per(wFrom), prevPerDay: per(pFrom), top: topOf(week), part: partOf(week)
    })];
  }
  /* BF-09: photos and moments shared by the team, and the important events. */
  if (p === 'moments') {
    return [200, Object.assign(base, { items: (d.moments[rid] || []).slice().reverse().map(momentView) })];
  }
  if (p === 'photo') {
    const m = (d.moments[rid] || []).find((x) => x.id === ctx.q('id'));
    if (!m || !m.photo) return [404, { error: 'not-found' }];
    return { file: path.join(st.photos, m.photo), type: 'image/jpeg' };
  }
  /* The live feed: what arrived since the portal last asked. */
  if (p === 'live') {
    const since = Date.parse(ctx.q('since')) || 0;
    const list = all.filter((x) => Date.parse(x.rx) > since);
    const ms = (d.moments[rid] || []).filter((m) => Date.parse(m.at) > since);
    return [200, Object.assign(base, { items: sessions(list).slice().reverse().map(view), listens: listens(list).slice().reverse().map(view), moments: ms.slice().reverse().map(momentView) })];
  }
  return [404, { error: 'not-found' }];
}

export function feedHandler(req, url, body, ctx) {
  const st = storeFor(ctx.portal);
  try { sweep(st, ctx.portal, false); } catch (e) { console.error(e); }
  const p = ctx.path || '';
  if (p.startsWith('robot/')) {
    if (!ctx.robot) return [401, { error: 'robot-unknown' }];
    return robotRoute(st, req, p.slice(6), body || {}, ctx);
  }
  if (p.startsWith('family/')) return familyRoute(st, req, p.slice(7), body || {}, ctx);
  return [404, { error: 'not-found' }];
}
/* For the tests: run the sweep now (retention, erased residents, consent). */
export function sweepFeed(portal) { const st = storeFor(portal); sweep(st, portal, true); return st.load(); }
export const FEED_EVENTS = IMPORTANT;

registerRoutes('feed/', feedHandler);
