// 1.16, agent N2: call requests both ways, call invitations and missed-call notices (BF-17, BF-18, BF-19).
// Plain Node, no packages. Loaded by store-server.mjs (M's hook); it registers its routes with
// labland/family-portal.mjs and tells the relatives through labland/family-notify.mjs.
//
// The flow:
//   BF-17  the family taps "Ask for a call" in the portal          POST family/calls/request {when, note}
//   BF-18  the resident taps "Call my family" on the patient screen POST robot/calls/request {code}
//          -> the Care Team sees the request (js/callreq-staff.js polls GET robot/calls)
//          -> "Call now": the Care Team starts the existing outgoing call of the call relay (Family > Calls,
//             call-relay.mjs 'outgoing', a one-time famille.html#j=… link) and hands its token over:
//                                                                  POST robot/calls/invite {code, token, requestId?, pids?}
//          -> the linked relatives get the invitation (push + bell), with a "Join" button (BF-18, BF-19)
//          -> nobody joined before the invitation ended (it expired, or was cancelled after a minute):
//             a "missed call" notice to the same relatives (BF-19). Joined: the request is done.
//          "Later": the request sleeps (1 h by default) and the family is told.  POST robot/calls/decide
//   The state of an invitation comes from the call relay itself (outgoing/info, same server process).
//   FAMILY_CALL_WAIT_MIN (optional): ends an invitation nobody joined after that many minutes (default:
//   the relay's own 30 minutes).
//
//   Reminder (1.16, 14 Nov): a relative who had no call and sent no message to their resident for
//   REMIND_DAYS days (below; 7) gets ONE notice, "You have not talked with {first name} for {n} days. Now, or
//   plan a date?": web push with two buttons + the bell (family-notify.mjs) + a banner when the portal opens
//   (family/calls 'reminder'). Not again for the same resident before REMIND_DAYS more days, never while a
//   call request or a planned call is open, only between 9:00 and 20:00. "Plan a date" saves a planned call
//   (a request with when 'planned' and planAt): the Care Team sees it with the other call requests.
//   Test hooks: FAMILY_REMIND_DAYS=2 (another number of days) or FAMILY_REMIND_MINUTES=1 (minutes instead of
//   days, at any hour); createCallReq({ remindMs }).
//
//   Ringing (15 Nov, Rahma: "when we start a call from Bellatrix it must ring on the phone"): every invitation rings
//   for RING_MS (45 s): the web push "Anna ruft an" with Annehmen / Ablehnen (family-notify.mjs, high urgency, a
//   short TTL, one tag per call), and the open portal polls family/calls/ring every 3 s and shows a full-screen
//   incoming call (js/portail-calls.js). Ablehnen -> family/calls/decline (signed in, or from the phone's
//   notification with a key made for that person and that call): when every invited relative declined, the
//   relay's invitation ends with reason 'declined' (the tablet and the head say "Sophie kann gerade nicht").
//   Nobody answered RING_GRACE_MS after the ring: a missed call, the relay's invitation ends with reason
//   'missed' (the robot stops waiting), the relatives get "Missed call" (it replaces the ringing notice).
//
// Routes  family/calls            GET  -> { request, invite, recent, label, reminder, remindDays }   (the chosen resident only)
//         family/calls/ring       GET  -> { ring: { id, token, label, until, left } | null, now }   (any linked resident)
//         family/calls/decline    POST {invite} (signed in) or {invite, pid, k} (the notification's key, no session)
//         family/calls/plan       POST {at: ISO date and time, note}             (a planned call)
//         family/calls/remind     POST {}                                        (the reminder was answered or closed)
//         family/calls/request    POST {when: 'soon'|'today'|'tomorrow', note}
//         family/calls/cancel     POST {id}
//         robot/calls             GET  -> { requests, invites, residents, now }
//         robot/calls/request     POST {code}                                   (the resident asks)
//         robot/calls/decide      POST {id, decision: 'later'|'close', minutes}
//         robot/calls/invite      POST {code, token, until?, requestId?, pids?, contact?}
//         robot/calls/invite/end  POST {id | token, reason: 'cancelled'|'answered'}
// Kept in labland/data/portal/calls.json: requests and invitations (ids, resident id and code, the
// relative's person id and first name, when, a short note), 30 days after they end.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as Portal from './family-portal.mjs';
import * as Notify from './family-notify.mjs';
import { callApi } from './call-relay.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIN = 60 * 1000, DAY = 24 * 3600 * 1000;
const WHEN = ['soon', 'today', 'tomorrow'];
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const LIVE = ['open', 'later', 'calling'];
/* The phone rings this long; a tap on "Answer" in the last seconds still gets in (the grace). */
export const RING_MS = 45 * 1000;
/* 16 Nov (Rahma, testing phase): no limit on the calls a relative may ask for in a day. The old limit (6 a day) comes
   back with the environment variable BELLATRIX_CALLS_PER_DAY=6 on the server. */
const CALLS_PER_DAY = Number(process.env.BELLATRIX_CALLS_PER_DAY) > 0 ? Number(process.env.BELLATRIX_CALLS_PER_DAY) : 0;
const RING_GRACE_MS = 15 * 1000;
/* The family is reminded after this many days without a call and without a message. Change it here. */
export const REMIND_DAYS = 7;
const REMIND_HOURS = [9, 20];   // no reminder at night (the server's clock)
function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function rnd() { return crypto.randomBytes(9).toString('base64url'); }
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|fr|de|eu|io|ly|me|app|link)\b)/i;

/* The call relay (same process, its own public routes): the state of an outgoing invitation (null when
   it cannot be asked), and cancelling it. relayAdapter(handle) for any relay (the tests make their own). */
export function relayAdapter(handle) {
  return {
    info(robot, token) {
      try {
        const out = handle({ method: 'GET', headers: {} }, new URL('http://local/call/api/outgoing/info?robot=' + encodeURIComponent(robot) + '&token=' + encodeURIComponent(token)), {}, null);
        if (!Array.isArray(out)) return null;
        return out[0] === 404 ? { state: 'unknown' } : out[1];
      } catch (e) { return null; }
    },
    /* reason: 'declined' or 'missed' (the robot hears why), else a plain cancel */
    cancel(robot, token, reason) {
      try { handle({ method: 'POST', headers: {} }, new URL('http://local/call/api/outgoing/cancel'), reason ? { robot, token, reason } : { robot, token }, null); } catch (e) { /* already over */ }
    },
    /* The last call taken through a relative's own video-call link (ISO date), or null. */
    last(robot, token) {
      try {
        const out = handle({ method: 'GET', headers: {} }, new URL('http://local/call/api/invite/last?robot=' + encodeURIComponent(robot) + '&token=' + encodeURIComponent(token)), {}, null);
        return Array.isArray(out) && out[0] === 200 ? out[1].at || null : null;
      } catch (e) { return null; }
    }
  };
}

export function createCallReq(opts = {}) {
  const P = opts.portal || Portal;
  const notify = opts.notify || ((pid, ev) => Notify.notify(pid, ev));
  const relay = opts.relay || relayAdapter(callApi);
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((t) => console.log(new Date().toLocaleTimeString('en-GB') + '  calls: ' + t));
  const envWait = Number(process.env.FAMILY_CALL_WAIT_MIN);
  const WAIT_MS = opts.waitMs || (envWait >= 1 && envWait <= 30 ? envWait * MIN : 0);   // 0: the relay's own expiry
  const MISS_AFTER_MS = opts.missAfterMs || MIN;      // cancelled after this long without anyone joining: "missed"
  const LATER_MS = 60 * MIN;
  const RINGMS = opts.ringMs || RING_MS, GRACE = opts.ringGraceMs != null ? opts.ringGraceMs : RING_GRACE_MS;
  const envDays = Number(process.env.FAMILY_REMIND_DAYS), envMin = Number(process.env.FAMILY_REMIND_MINUTES);
  const REMIND_TEST = !!opts.remindMs || envMin > 0;   // the test hook: a short delay, at any hour
  const REMIND_MS = opts.remindMs || (envMin > 0 ? envMin * MIN : (envDays > 0 ? envDays : REMIND_DAYS) * DAY);
  let DIR = opts.dataDir || null;
  function dir() { return DIR || (DIR = process.env.PORTAL_DATA || path.join(HERE, 'data', 'portal')); }
  const iso = (t) => new Date(t).toISOString();

  /* ---------- storage ---------- */
  let data = null;
  function file() { return path.join(dir(), 'calls.json'); }
  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
    for (const k of ['requests', 'invites', 'reminders', 'contacts']) if (!data[k] || typeof data[k] !== 'object') data[k] = {};
    return data;
  }
  function save() {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(load(), null, 1));
    fs.renameSync(tmp, file());
  }

  /* The key a phone's notification carries to decline one call for one person without a session (the
     service worker has no access to the portal's sign-in). An HMAC with a secret kept in calls.json. */
  function secret() { const d = load(); if (typeof d.secret !== 'string' || d.secret.length < 20) { d.secret = crypto.randomBytes(24).toString('base64url'); save(); } return d.secret; }
  function declineKey(id, pid) { return crypto.createHmac('sha256', secret()).update('decline|' + id + '|' + pid).digest('base64url').slice(0, 32); }
  function sameKey(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

  /* ---------- the portal's people ---------- */
  let lastPortal = null;   // the portal instance of the last request (its links: first name, relation, call link)
  function links(rid) {
    const api = lastPortal || P;
    let all = [], people = {};
    try { const d = api._data ? api._data() : {}; all = Object.values(d.accounts || {}); people = d.people || {}; } catch (e) { all = []; }
    /* A link (account) per relative and resident; the person (name, language) in 'people' when the
       portal has it, else on the link itself. */
    return all.filter((a) => a.rid === rid && (a.status || 'active') === 'active').map((a) => {
      const p = people[a.pid] || {};
      return { pid: a.pid || a.id, link: a.id, name: p.name || a.name || '', relation: a.relation || '', lang: p.lang || a.lang || 'en', callLink: a.callLink || '' };
    });
  }
  function personsOf(rid) { try { return (lastPortal || P).personsOfResident(rid) || []; } catch (e) { return links(rid).map((x) => x.pid); } }
  function residentOf(robotId, code) {
    let list = [];
    try { list = (lastPortal || P).residentsOfRobot(robotId) || []; } catch (e) { list = []; }
    const c = String(code || '').trim().toUpperCase();
    return list.find((r) => String(r.code).toUpperCase() === c) || null;
  }

  /* ---------- views ---------- */
  function reqView(q) {
    return { id: q.id, code: q.code, label: q.label, from: q.from, pid: q.pid || '', name: q.name || '', relation: q.relation || '', when: q.when, planAt: q.planAt || null, note: q.note || '',
      at: q.at, state: q.state, until: q.until || null, updatedAt: q.updatedAt || q.at, invite: q.invite || '', outcome: q.outcome || '', visitAt: q.visitAt || null };
  }
  function invView(v, withToken) {
    const o = { id: v.id, code: v.code, label: v.label, state: v.state, at: v.at, until: v.until, endedAt: v.endedAt || null, requestId: v.requestId || '', contact: v.contact || '', count: (v.pids || []).length,
      ringUntil: v.ringUntil || null, declined: (v.declined || []).length };
    if (withToken) o.token = v.token;
    return o;
  }

  /* ---------- invitations: follow the relay, notice the end ---------- */
  function endInvite(v, state, why) {
    if (v.state !== 'waiting') return;
    v.state = state; v.endedAt = iso(now()); v.why = why || '';
    const q = v.requestId && load().requests[v.requestId];
    if (q && q.state === 'calling') { q.state = 'done'; q.outcome = state; q.updatedAt = v.endedAt; }
    /* Nobody else's request for this resident stays open once the resident and the family talked. */
    if (state === 'answered') for (const pid of v.pids || []) load().contacts[pid + '|' + v.rid] = v.endedAt;   /* they talked: no reminder for a while */
    if (state === 'answered') for (const r of Object.values(load().requests)) if (r.rid === v.rid && LIVE.includes(r.state)) { r.state = 'done'; r.outcome = 'answered'; r.updatedAt = v.endedAt; }
    if (state === 'missed' || state === 'cancelled') {
      for (const pid of v.pids || []) if (!(v.declined || []).includes(pid)) notify(pid, { type: state === 'missed' ? 'call_missed' : 'call_cancelled', rid: v.rid, label: v.label, invite: v.id });
    }
    log('invitation for ' + v.code + ': ' + state + (why ? ' (' + why + ')' : ''));
  }
  function check(v) {
    if (v.state !== 'waiting') return false;
    const t = now(), info = relay.info(v.robot, v.token);
    const age = t - Date.parse(v.at), past = t > Date.parse(v.until);
    if (info && (info.state === 'live' || info.state === 'used')) { endInvite(v, 'answered'); return true; }
    if (info && info.state === 'expired') { endInvite(v, 'missed', 'expired'); return true; }
    if (info && info.state === 'declined') { endInvite(v, 'declined', 'family'); return true; }
    if (info && info.state === 'missed') { endInvite(v, 'missed', 'no answer'); return true; }
    if (info && info.state === 'cancelled') { endInvite(v, age >= MISS_AFTER_MS ? 'missed' : 'cancelled', 'cancelled'); return true; }
    if (info && info.state === 'unknown') {
      v.unknownSince = v.unknownSince || iso(t);
      if (past || t - Date.parse(v.unknownSince) > MIN) { endInvite(v, past || age >= MISS_AFTER_MS ? 'missed' : 'cancelled', 'gone'); return true; }
      return false;
    }
    /* Someone joined and it rings on the robot: wait for the answer. */
    const joining = info && (info.call === 'ringing' || info.call === 'live');
    /* the phone rang and nobody answered: a missed call, and the robot stops waiting */
    if (!joining && v.ringUntil && t > Date.parse(v.ringUntil) + GRACE) { relay.cancel(v.robot, v.token, 'missed'); endInvite(v, 'missed', 'no answer while it rang'); return true; }
    if (!joining && WAIT_MS && age > WAIT_MS) { relay.cancel(v.robot, v.token); endInvite(v, 'missed', 'no answer in ' + Math.round(WAIT_MS / MIN) + ' min'); return true; }
    if (!joining && past) { endInvite(v, 'missed', 'expired'); return true; }
    return false;
  }
  let swept = 0;
  function sweep(force) {
    const t = now();
    if (!force && t - swept < 5000) return;
    swept = t;
    const d = load();
    let changed = false;
    for (const v of Object.values(d.invites)) if (check(v)) changed = true;
    for (const q of Object.values(d.requests)) {
      if (q.state === 'later' && q.until && t > Date.parse(q.until)) { q.state = 'open'; q.until = null; q.updatedAt = iso(t); changed = true; }
      else if ((q.state === 'open' || q.state === 'later') && (q.planAt ? t - Date.parse(q.planAt) > DAY : t - Date.parse(q.at) > 3 * DAY)) { q.state = 'done'; q.outcome = 'expired'; q.updatedAt = iso(t); changed = true; }
    }
    for (const [id, q] of Object.entries(d.requests)) if (!LIVE.includes(q.state) && t - Date.parse(q.updatedAt || q.at) > 30 * DAY) { delete d.requests[id]; changed = true; }
    for (const [id, v] of Object.entries(d.invites)) if (v.state !== 'waiting' && t - Date.parse(v.endedAt || v.at) > 30 * DAY) { delete d.invites[id]; changed = true; }
    if (remind(false)) changed = true;
    if (changed) save();
  }

  /* ---------- the reminder: no call and no message for REMIND_DAYS days ---------- */
  const keyOf = (pid, rid) => pid + '|' + rid;
  function allLinks() { try { const api = lastPortal || P; return typeof api.familyLinks === 'function' ? api.familyLinks() || [] : []; } catch (e) { return []; } }
  /* The last time this relative and this resident were in touch: a message sent, a call taken (an
     invitation that was answered, or the relative's own video-call link); at first, the day of the access. */
  function lastContact(l) {
    const times = [l.since, l.lastMessage, load().contacts[keyOf(l.pid, l.rid)]];
    const tk = /#t=([A-Za-z0-9_-]{16,64})$/.exec(l.callLink || '');
    if (tk && relay.last) times.push(relay.last(l.robot, tk[1]));
    return times.map((x) => Date.parse(x)).filter(isFinite).reduce((a, b) => Math.max(a, b), 0);
  }
  function doneReminder(pid, rid) { const r = load().reminders[keyOf(pid, rid)]; if (r && r.state === 'open') { r.state = 'done'; r.doneAt = iso(now()); return true; } return false; }
  let reminded = 0;
  /* only: one link (the relative who just opened the portal): at any hour, in the bell and the banner, no push. */
  function remind(force, only) {
    const t = now();
    if (!only) { if (!force && t - reminded < Math.min(10 * MIN, Math.max(5000, REMIND_MS / 10))) return false; reminded = t; }
    const d = load(), links = allLinks(), live = {}, h = new Date(t).getHours();
    const quiet = !only && !REMIND_TEST && (h < REMIND_HOURS[0] || h >= REMIND_HOURS[1]);
    let changed = false;
    for (const l of links) {
      const k = keyOf(l.pid, l.rid);
      live[k] = 1;
      if (only && k !== only) continue;
      const last = lastContact(l), r = d.reminders[k];
      if (!last) continue;
      if (r && r.state === 'open' && last >= Date.parse(r.at)) { r.state = 'done'; r.doneAt = iso(t); changed = true; }
      if (quiet || t - last < REMIND_MS || (r && t - Date.parse(r.at) < REMIND_MS)) continue;
      if (Object.values(d.requests).some((q) => q.rid === l.rid && q.pid === l.pid && LIVE.includes(q.state))) continue;
      const days = Math.max(1, Math.floor((t - last) / DAY));
      d.reminders[k] = { at: iso(t), days, state: 'open' };
      changed = true;
      notify(l.pid, { type: 'talk_reminder', rid: l.rid, label: l.label, days, tag: 'remind-' + l.rid, url: 'portail.html#remind=' + l.rid, push: only ? false : undefined });
      log('reminder to a family member of ' + l.code + ': no call and no message for ' + days + ' day(s)');
    }
    /* A link that ended (suspended, removed, erased): its reminder and its last call are forgotten. */
    if (links.length && !only) for (const part of ['reminders', 'contacts']) for (const k of Object.keys(d[part])) if (!live[k]) { delete d[part][k]; changed = true; }
    return changed;
  }
  const timer = opts.timer === false ? null : setInterval(() => { try { sweep(true); } catch (e) { console.error(e); } }, opts.tickMs || 10000);
  if (timer && timer.unref) timer.unref();

  /* ---------- ringing: decline, and what rings now ---------- */
  function declineInvite(v, pid) {
    if (!v || !(v.pids || []).includes(pid)) return [404, { error: 'not-found' }];
    if (v.state !== 'waiting') return [200, { ok: true, state: v.state }];
    v.declined = Array.isArray(v.declined) ? v.declined : [];
    if (!v.declined.includes(pid)) v.declined.push(pid);
    /* everybody invited said no: the robot is told at once (the tablet and the head: "… cannot right now") */
    if (v.pids.every((p) => v.declined.includes(p))) { relay.cancel(v.robot, v.token, 'declined'); endInvite(v, 'declined', 'family'); }
    save();
    log('invitation for ' + v.code + ': a family member declined');
    return [200, { ok: true, state: v.state }];
  }
  function ringOf(pid) {
    const t = now();
    const v = Object.values(load().invites).filter((x) => x.state === 'waiting' && x.ringUntil && (x.pids || []).includes(pid) && !(x.declined || []).includes(pid) && t < Date.parse(x.ringUntil))
      .sort((a, b) => (b.at > a.at ? 1 : -1))[0];
    return v ? { id: v.id, token: v.token, label: v.label, at: v.at, until: v.ringUntil, left: Date.parse(v.ringUntil) - t, rid: v.rid } : null;
  }

  /* ---------- family routes ---------- */
  function familyRoute(req, url, body, ctx) {
    if (ctx.portal) lastPortal = ctx.portal;
    const f = ctx.family;
    /* Decline from the phone's notification (the service worker has no session): the key of that call and person. */
    if (!f && req.method === 'POST' && String(ctx.path || '').replace(/^\/+/, '') === 'decline' && body && body.k) {
      sweep(false);
      const v0 = load().invites[str(body.invite, 40)], p0 = str(body.pid, 40);
      if (!v0 || !p0 || !sameKey(body.k, declineKey(v0.id, p0))) return [403, { error: 'bad-key' }];
      return declineInvite(v0, p0);
    }
    /* A session without an active resident (suspended, removed) is not "signed out": 403, so the portal
       does not sign the person out because of this module. */
    if (!f) return /^Bearer\s/i.test(String((req.headers || {}).authorization || '')) ? [403, { error: 'no-access' }] : [401, { error: 'signed-out' }];
    sweep(false);
    const d = load(), pid = f.pid || f.id, post = req.method === 'POST', sub = String(ctx.path || '').replace(/^\/+/, '');
    /* what rings for this person now (every resident they are linked to): the portal asks every 3 s */
    if (sub === 'ring' && !post) return [200, { ring: ringOf(pid), now: iso(now()) }];
    if (sub === 'decline' && post) return declineInvite(d.invites[str(body.invite, 40)], pid);
    const mineLive = () => Object.values(d.requests).filter((q) => q.rid === f.rid && q.pid === pid && LIVE.includes(q.state)).sort((a, b) => (b.at > a.at ? 1 : -1))[0] || null;
    if (sub === '' && !post) {
      if (remind(true, keyOf(pid, f.rid))) save();
      const rem = d.reminders[keyOf(pid, f.rid)];
      const inv = Object.values(d.invites).filter((v) => v.rid === f.rid && v.state === 'waiting' && (v.pids || []).includes(pid) && !(v.declined || []).includes(pid)).sort((a, b) => (b.at > a.at ? 1 : -1))[0] || null;
      const t = now();
      const recent = Object.values(d.invites).filter((v) => v.rid === f.rid && v.state !== 'waiting' && (v.pids || []).includes(pid) && t - Date.parse(v.endedAt || v.at) < 7 * DAY)
        .sort((a, b) => ((b.endedAt || b.at) > (a.endedAt || a.at) ? 1 : -1)).slice(0, 5).map((v) => ({ id: v.id, state: v.state, at: v.endedAt || v.at }));
      const q = mineLive();
      return [200, { label: f.label || '', request: q ? reqView(q) : null, invite: inv ? invView(inv, true) : null, recent,
        reminder: rem && rem.state === 'open' && !q ? { days: rem.days, at: rem.at } : null, remindDays: Math.max(1, Math.round(REMIND_MS / DAY)), now: iso(t) }];
    }
    if (sub === 'request' && post) {
      const old = mineLive();
      if (old) return [200, { ok: true, existing: true, request: reqView(old) }];
      const today = Object.values(d.requests).filter((q) => q.pid === pid && now() - Date.parse(q.at) < DAY).length;
      if (CALLS_PER_DAY && today >= CALLS_PER_DAY) return [429, { error: 'enough-today' }];
      const note = str(body.note, 120);
      if (LINK.test(note)) return [400, { error: 'no-links' }];
      const me = links(f.rid).find((x) => x.link === f.id) || {};
      const q = { id: rnd(), rid: f.rid, robot: f.robot, code: f.code, label: f.label || '', from: 'family', pid, link: f.id, name: str(f.name, 40), relation: str(me.relation || '', 40),
        when: WHEN.includes(body.when) ? body.when : 'soon', note, at: iso(now()), state: 'open' };
      q.updatedAt = q.at;
      d.requests[q.id] = q;
      doneReminder(pid, f.rid);
      save();
      log('a family member asks for a call with ' + q.code + ' (' + q.when + ')');
      return [200, { ok: true, request: reqView(q) }];
    }
    /* "Plan a date": a planned call, saved as this relative's request (one at a time), shown to the Care Team. */
    if (sub === 'plan' && post) {
      const at = Date.parse(String(body.at || '')), note = str(body.note, 120);
      if (!isFinite(at) || at < now() - 5 * MIN || at > now() + 90 * DAY) return [400, { error: 'bad-date' }];
      if (LINK.test(note)) return [400, { error: 'no-links' }];
      let q = mineLive();
      if (q && q.state === 'calling') return [409, { error: 'calling' }];
      if (!q) {
        if (CALLS_PER_DAY && Object.values(d.requests).filter((x) => x.pid === pid && now() - Date.parse(x.at) < DAY).length >= CALLS_PER_DAY) return [429, { error: 'enough-today' }];
        const me = links(f.rid).find((x) => x.link === f.id) || {};
        q = { id: rnd(), rid: f.rid, robot: f.robot, code: f.code, label: f.label || '', from: 'family', pid, link: f.id, name: str(f.name, 40), relation: str(me.relation || '', 40), note: '', at: iso(now()) };
        d.requests[q.id] = q;
      }
      q.when = 'planned'; q.planAt = iso(at); q.state = 'open'; q.until = null; q.updatedAt = iso(now());
      if (note) q.note = note;
      doneReminder(pid, f.rid);
      save();
      log('a family member planned a call with ' + q.code);
      return [200, { ok: true, request: reqView(q) }];
    }
    /* The reminder was answered ("Now") or closed: it does not come back before REMIND_DAYS more days. */
    if (sub === 'remind' && post) {
      if (doneReminder(pid, f.rid)) save();
      return [200, { ok: true }];
    }
    if (sub === 'cancel' && post) {
      const q = d.requests[str(body.id, 40)];
      if (!q || q.pid !== pid) return [404, { error: 'not-found' }];
      if (LIVE.includes(q.state) && q.state !== 'calling') { q.state = 'cancelled'; q.updatedAt = iso(now()); save(); }
      return [200, { ok: true, request: reqView(q) }];
    }
    return [404, { error: 'not-found' }];
  }

  /* ---------- robot routes (Care Team and patient screen) ---------- */
  function robotRoute(req, url, body, ctx) {
    if (ctx.portal) lastPortal = ctx.portal;
    const robot = ctx.robot;
    if (!robot) return [401, { error: 'robot-unknown' }];
    sweep(false);
    const d = load(), post = req.method === 'POST', sub = String(ctx.path || '').replace(/^\/+/, ''), t = now();
    let residents = [];
    try { residents = (lastPortal || P).residentsOfRobot(robot.id) || []; } catch (e) { residents = []; }
    const rids = new Set(residents.map((r) => r.rid));
    if (sub === '' && !post) {
      return [200, {
        requests: Object.values(d.requests).filter((q) => rids.has(q.rid) && (LIVE.includes(q.state) || t - Date.parse(q.updatedAt || q.at) < 6 * 3600 * 1000))
          .sort((a, b) => (a.at > b.at ? 1 : -1)).map((q) => Object.assign(reqView(q), { callLink: q.link ? ((links(q.rid).find((x) => x.link === q.link) || {}).callLink || '') : '' })),
        invites: Object.values(d.invites).filter((v) => rids.has(v.rid) && (v.state === 'waiting' || t - Date.parse(v.endedAt || v.at) < 6 * 3600 * 1000))
          .sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 20).map((v) => Object.assign(invView(v, true), { names: (v.pids || []).map((pid) => (links(v.rid).find((x) => x.pid === pid) || {}).name || '').filter(Boolean) })),
        residents: residents.map((r) => ({ code: r.code, label: r.label, family: links(r.rid).map((x) => ({ pid: x.pid, link: x.link, name: x.name, relation: x.relation, lang: x.lang, callLink: x.callLink })) })),
        waitMin: WAIT_MS ? Math.round(WAIT_MS / MIN) : 0, now: iso(t)
      }];
    }
    if (sub === 'request' && post) {
      const r = residentOf(robot.id, str(body.code, 24));
      if (!r) return [404, { error: 'unknown-resident' }];
      const old = Object.values(d.requests).find((q) => q.rid === r.rid && q.from === 'resident' && LIVE.includes(q.state));
      if (old) { if (old.state === 'later') { old.state = 'open'; old.until = null; old.updatedAt = iso(t); save(); } return [200, { ok: true, existing: true, request: reqView(old) }]; }
      const q = { id: rnd(), rid: r.rid, robot: robot.id, code: r.code, label: r.label || '', from: 'resident', when: 'soon', note: '', at: iso(t), state: 'open', family: personsOf(r.rid).length };
      q.updatedAt = q.at;
      d.requests[q.id] = q;
      save();
      log('resident ' + r.code + ' asks to call the family');
      return [200, { ok: true, request: reqView(q) }];
    }
    if (sub === 'decide' && post) {
      const q = d.requests[str(body.id, 40)];
      if (!q || !rids.has(q.rid)) return [404, { error: 'not-found' }];
      if (body.decision === 'later') {
        if (!LIVE.includes(q.state)) return [409, { error: 'not-open', state: q.state }];
        const mins = Math.max(10, Math.min(24 * 60, Number(body.minutes) || LATER_MS / MIN));
        q.state = 'later'; q.until = iso(t + mins * MIN); q.updatedAt = iso(t);
        if (q.from === 'family' && q.pid) notify(q.pid, { type: 'call_later', rid: q.rid, label: q.label, request: q.id });
      } else if (body.decision === 'close') {
        if (LIVE.includes(q.state)) { q.state = 'done'; q.outcome = 'closed'; q.updatedAt = iso(t); }
      } else if (body.decision === 'visit') {
        /* 14 Nov: the care team tapped "Go to {name}" on the head: the robot drives to the resident. The
           request stays open; the relative sees "Bellatrix is on the way to {name}…" until the invitation. */
        if (!LIVE.includes(q.state)) return [409, { error: 'not-open', state: q.state }];
        if (q.state === 'later') { q.state = 'open'; q.until = null; }
        q.visitAt = iso(t); q.updatedAt = iso(t);
        if (q.from === 'family' && q.pid) notify(q.pid, { type: 'call_visit', rid: q.rid, label: q.label, request: q.id });
      } else return [400, { error: 'bad-decision' }];
      save();
      return [200, { ok: true, request: reqView(q) }];
    }
    if (sub === 'invite' && post) {
      const r = residentOf(robot.id, str(body.code, 24));
      if (!r) return [404, { error: 'unknown-resident' }];
      const token = String(body.token || '');
      if (!TOKEN.test(token)) return [400, { error: 'bad-token' }];
      const same = Object.values(d.invites).find((v) => v.token === token);
      if (same) return same.robot === robot.id && same.rid === r.rid ? [200, { ok: true, existing: true, invite: invView(same, true) }] : [404, { error: 'unknown-call' }];
      /* The relay must know this invitation, for this robot (a token from elsewhere is refused). */
      const info = relay.info(robot.id, token);
      if (info && info.state === 'unknown') return [404, { error: 'unknown-call' }];
      if (info && info.state && info.state !== 'waiting' && info.state !== 'live') return [409, { error: 'call-over', state: info.state }];
      const q = body.requestId ? d.requests[str(body.requestId, 40)] : null;
      if (q && q.rid !== r.rid) return [400, { error: 'bad-request' }];
      /* Who is told: the persons the team chose, else the one who asked, else everybody linked. Only
         persons linked to this resident, ever. */
      const linked = personsOf(r.rid);
      let pids = Array.isArray(body.pids) ? body.pids.map(String).filter((x) => linked.includes(x)) : [];
      if (!pids.length && q && q.from === 'family' && linked.includes(q.pid)) pids = [q.pid];
      if (!pids.length) pids = linked.slice();
      const relayUntil = info && info.expires ? Date.parse(info.expires) : NaN, asked = body.until ? Date.parse(body.until) : NaN;
      const until = isFinite(relayUntil) ? relayUntil : isFinite(asked) ? Math.min(asked, t + 30 * MIN) : t + 30 * MIN;
      const v = { id: rnd(), rid: r.rid, robot: robot.id, code: r.code, label: r.label || '', token, at: iso(t), until: iso(WAIT_MS ? Math.min(until, t + WAIT_MS) : until),
        state: 'waiting', pids, requestId: q ? q.id : '', contact: str(body.contact, 40), ringUntil: iso(t + RINGMS), declined: [] };
      d.invites[v.id] = v;
      if (q && LIVE.includes(q.state)) { q.state = 'calling'; q.invite = v.id; q.updatedAt = v.at; }
      /* Any other open request of this resident is answered by this invitation too. */
      for (const o of Object.values(d.requests)) if (o !== q && o.rid === r.rid && (o.state === 'open' || o.state === 'later') && (o.from === 'resident' || pids.includes(o.pid))) { o.state = 'calling'; o.invite = v.id; o.updatedAt = v.at; }
      save();
      /* It rings: "Anna ruft an" with Answer (straight into the call) and Decline (its own key per person). */
      for (const pid of pids) notify(pid, { type: 'call_invite', rid: r.rid, label: v.label, until: v.until, ringUntil: v.ringUntil, invite: v.id, url: 'famille.html#j=' + token + '&go=1',
        decline: { invite: v.id, pid, k: declineKey(v.id, pid) } });
      /* the end of the ring is checked on time (not only at the next sweep) */
      if (opts.timer !== false) { const tm = setTimeout(() => { try { sweep(true); } catch (e) { console.error(e); } }, RINGMS + GRACE + 300); if (tm.unref) tm.unref(); }
      log('invitation for ' + r.code + ' sent to ' + pids.length + ' family member(s): it rings');
      return [200, { ok: true, invite: invView(v, true) }];
    }
    if (sub === 'invite/end' && post) {
      const v = body.id ? d.invites[str(body.id, 40)] : Object.values(d.invites).find((x) => x.token === String(body.token || ''));
      if (!v || !rids.has(v.rid)) return [404, { error: 'not-found' }];
      if (v.state === 'waiting') {
        if (!check(v)) endInvite(v, body.reason === 'answered' ? 'answered' : t - Date.parse(v.at) >= MISS_AFTER_MS ? 'missed' : 'cancelled', 'care team');
        save();
      }
      return [200, { ok: true, invite: invView(v, true) }];
    }
    return [404, { error: 'not-found' }];
  }

  return { familyRoute, robotRoute, sweep: () => sweep(true), declineKey, remind: () => { const c = remind(true); if (c) save(); return c; }, remindMs: REMIND_MS, stop: () => timer && clearInterval(timer), _data: () => load() };
}

/* ---------- the shared instance, registered with the portal ---------- */
let SHARED = null;
export function shared() { return SHARED || (SHARED = createCallReq()); }
if (typeof Portal.registerRoutes === 'function' && !process.env.BELLATRIX_NOTIFY_NO_REGISTER) {
  Portal.registerRoutes('family/calls', (req, url, body, ctx) => shared().familyRoute(req, url, body, ctx));
  Portal.registerRoutes('robot/calls', (req, url, body, ctx) => shared().robotRoute(req, url, body, ctx));
  shared();   /* its timer follows the invitations even when nobody asks */
}
