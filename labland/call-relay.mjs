// Family video calls: the signalling relay (invites, presence, rooms). Mounted by store-server.mjs
// under /call/api/. Plain Node, no packages.
//
// Privacy by design: the relay keeps only what routing a call needs.
//   On disk (labland/data/call-data.json): the invites. Per link: its token (random, 128 bits),
//   the robot's random id, the resident's patient code, the contact's id, the word the family uses
//   for the resident ("Maman"), the family page language, when it was made and when it was revoked.
//   In memory only: which robots are online and busy, and each call while it rings or runs.
// No names, no relation, no photos, no media. Audio and video go between the two browsers (WebRTC);
// the offer and answer pass through here once and are forgotten a few minutes after the call.
//
// Signalling is HTTP long-polling, because Node has no WebSocket server built in:
//   robot   POST robot/state {robot, state, residents}       every ~10 s and on change
//           GET  robot/wait?robot=ID&since=N                 held up to 20 s; brings incoming calls
//           GET  robot/info?robot=ID                         for the Care Team's Family tab
//   family  GET  status?t=TOKEN                              label, and can they call now
//           POST call {t, sdp}                               -> {call: id, state: 'ringing'} or {state: 'busy'|'notnow'|'offline'}
//           GET  call/ID/wait?since=N                        held up to 20 s; brings the answer, the end
//   both    POST call/ID {type, sdp?, robot? | t?}           answer, decline, missed, busy (robot); hangup (both)
//   staff   POST invite {robot, resident, contactId, label, lang, token?} -> {token} (with token: update it)
//           POST revoke {robot, token}
//   both    GET  ice                                         -> {iceServers} (STUN, and TURN with fresh credentials)
//   The care team calls the family (one call, 30 minutes, memory only):
//   staff   POST outgoing {robot, resident, contactId, label, lang} -> {token}; the robot hears {type:'outgoing'}
//           POST outgoing/cancel {robot, token, reason?}   GET outgoing/info?robot=&token=
//           reason (15 Nov, the call rings on the family's phone, family-callreq.mjs): 'declined' (the relative
//           tapped Decline) or 'missed' (nobody answered while it rang); the robot hears it in outgoing-end.
//   family  GET  status?j=TOKEN    POST join {j, sdp} -> {call}; then call/ID as above (the robot answers by itself)
//
// Group calls (1.16): up to MAX_RELATIVES relatives (3) + the resident = 4 participants in ONE call.
//   A relative who calls (POST call / POST join) while a call of the same resident is live joins it:
//     -> {call, peer, state:'live', joined:true, peers:[ids of the relatives already there]}
//   The first relative gets {call, peer} too. A 4th relative gets {state:'full'}; while the call still
//   rings, a later relative gets {state:'ringing'} (try again in a moment). Status shows 'live'/'full'/'ringing'.
//   Every relative has a peer id (random, 128 bits) and sends it with the same invite token: the pair is
//   the proof. Messages without a peer id are the first relative's, so 1:1 pages need no change.
//   relative GET  call/ID/wait?since=N&peer=P          events for everybody, and the ones addressed to P
//   relative POST call/ID/signal {t, peer, to, kind:'offer'|'answer', sdp}   relative to relative (mesh)
//   relative POST call/ID {type:'hangup', t, peer}      leaves; the call goes on while a relative is left
//   robot    POST call/ID {type:'peer-answer', robot, peer, sdp} | {type:'peer-reject'|'peer-gone', robot, peer}
//   robot    hears {type:'peer-join', call, peer, contactId, sdp} and {type:'peer-leave', call, peer}
//   Topology: the resident's robot holds one connection per relative (it sends its picture to each, the
//   relatives send theirs to it); the relatives also connect to each other (mesh: the newest relative offers).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'fr', 'de'];
const ROBOT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SDP = 30000;
const MAX_RELATIVES = 3;   // + the resident = 4 participants at most

function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function randomId() { return crypto.randomBytes(16).toString('base64url'); }

export function createRelay(opts = {}) {
  /* BELLATRIX_DATA: the writable folder on the robot head (the code next to it is read-only there). */
  const DATA = opts.dataFile || path.join(process.env.BELLATRIX_DATA || path.join(HERE, 'data'), 'call-data.json');
  const RING_MS = opts.ringMs || 45000;       // nobody answers: the call ends as missed
  const WAIT_MS = opts.waitMs || 20000;       // a long-poll is held this long at most
  const ONLINE_MS = opts.onlineMs || 25000;   // a robot not heard of for this long is offline
  const KEEP_MS = opts.keepMs || 5 * 60 * 1000;
  const log = opts.log || ((t) => console.log(new Date().toLocaleTimeString('en-GB') + '  call: ' + t));

  /* ---------- invites (the only thing written to disk) ---------- */
  let data = null;
  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
    data.invites = data.invites && typeof data.invites === 'object' ? data.invites : {};
    return data;
  }
  function save() {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
  }
  function invite(token) {
    if (!TOKEN.test(token || '')) return null;
    return load().invites[token] || null;
  }

  /* ---------- ICE servers for both pages (GET ice) ----------
     Where from, first found: opts.ice (tests); the environment (ICE_SERVERS = a JSON array,
     TURN_SECRET + TURN_URLS = comma list, TURN_TTL seconds); labland/data/ice.json; else a public
     STUN server. ice.json: { "iceServers": [{ "urls": "stun:…" }],
       "turn": { "urls": ["turn:turn.example:3478?transport=udp", "turns:turn.example:5349"], "secret": "<coturn static-auth-secret>", "ttl": 21600 } }
     With a TURN secret every answer carries fresh coturn REST credentials (use-auth-secret):
     username = "<expiry unix time>:<random id>", credential = base64(HMAC-SHA1(secret, username)). */
  const ICE_FILE = opts.iceFile || path.join(process.env.BELLATRIX_DATA || path.join(HERE, 'data'), 'ice.json');
  const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  function iceConfig() {
    if (opts.ice) return opts.ice;
    const env = opts.env || process.env;
    if (env.ICE_SERVERS || env.TURN_SECRET) {
      let list = null;
      try { list = env.ICE_SERVERS ? JSON.parse(env.ICE_SERVERS) : null; } catch (e) { list = null; }
      return { iceServers: Array.isArray(list) ? list : undefined,
        turn: env.TURN_SECRET ? { secret: env.TURN_SECRET, urls: String(env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean), ttl: Number(env.TURN_TTL) || 0 } : null };
    }
    try { return JSON.parse(fs.readFileSync(ICE_FILE, 'utf8')); } catch (e) { return null; }
  }
  function iceServers() {
    const cfg = iceConfig() || {};
    const list = Array.isArray(cfg.iceServers) ? cfg.iceServers.filter((s) => s && s.urls) : DEFAULT_ICE.slice();
    const t = cfg.turn;
    let ttl = 0;
    if (t && t.secret && Array.isArray(t.urls) && t.urls.length) {
      ttl = Number(t.ttl) > 0 ? Number(t.ttl) : 6 * 3600;
      const username = Math.floor(Date.now() / 1000 + ttl) + ':' + crypto.randomBytes(6).toString('hex');
      const credential = crypto.createHmac('sha1', String(t.secret)).update(username).digest('base64');
      list.push({ urls: t.urls, username, credential });
    }
    return { iceServers: list, ttl };
  }

  /* ---------- robots and calls (memory only) ---------- */
  const robots = new Map();
  const calls = new Map();
  /* The care team calls the family: an invitation for one call ("outgoing"). The robot waits on its
     patient screen; the family joins from famille.html#j=<token>. Memory only, 30 minutes at most. */
  const OUT_MS = opts.outMs || 30 * 60 * 1000;
  const outgoing = new Map();
  function closeOut(o, state) {
    if (o.state !== 'waiting') return;
    o.state = state; o.endedAt = Date.now(); clearTimeout(o.timer);
    push(robot(o.robot), { type: 'outgoing-end', token: o.token, reason: state, at: Date.now() });
    log('call to the family for ' + o.resident + ': ' + state);
  }
  function outState(o) { if (o.state === 'waiting' && Date.now() > o.expires) closeOut(o, 'expired'); return o.state; }
  /* an invitation that can no longer be joined */
  const OVER = ['expired', 'cancelled', 'used', 'declined', 'missed'];
  function box() { return { seq: 0, events: [], waiters: new Set() }; }
  function robot(id) {
    let r = robots.get(id);
    if (!r) { r = Object.assign(box(), { id, seen: 0, state: 'idle', residents: {} }); robots.set(id, r); }
    return r;
  }
  function online(r) { return !!r && (r.waiters.size > 0 || Date.now() - r.seen < ONLINE_MS); }
  function liveCall(robotId) {
    for (const c of calls.values()) if (c.robot === robotId && (c.state === 'ringing' || c.state === 'live')) return c;
    return null;
  }
  function activePeers(c) { return c.peers.filter((p) => p.state === 'joined'); }
  function addPeer(c, token, contactId) {
    const p = { id: randomId(), token, contactId, state: 'joined', joinedAt: Date.now() };
    c.peers.push(p);
    return p;
  }
  function push(b, ev) {
    ev.n = ++b.seq;
    b.events.push(ev);
    if (b.events.length > 50) b.events.splice(0, b.events.length - 50);
    for (const w of [...b.waiters]) w();
  }
  /* A long-poll: events after `since` at once, or the next ones within WAIT_MS, or an empty list.
     null when the asker went away (nothing to answer). */
  function wait(b, since, res, keep) {
    if (!(since >= 0) || since > b.seq) since = 0;   // a restarted server counts from 0 again
    const pick = () => b.events.filter((e) => e.n > since && (!keep || keep(e)));
    const now = pick();
    if (now.length) return [200, { events: now, last: b.seq }];
    return new Promise((resolve) => {
      let over = false;
      const finish = (out) => { if (over) return; over = true; clearTimeout(timer); b.waiters.delete(done); resolve(out); };
      const done = () => { const ev = pick(); if (ev.length || over) finish([200, { events: ev, last: b.seq }]); };
      const timer = setTimeout(() => finish([200, { events: pick(), last: b.seq }]), WAIT_MS);
      b.waiters.add(done);
      if (res) res.once('close', () => finish(null));
    });
  }
  function availability(inv) {
    const r = robots.get(inv.robot);
    if (!online(r)) return { state: 'offline', next: '' };
    const lc = liveCall(r.id);
    /* A call of the same resident that already runs: this relative joins it (up to the limit). */
    if (lc && lc.resident === inv.resident) {
      if (lc.state === 'ringing') return { state: 'ringing', next: '' };
      return activePeers(lc).length >= MAX_RELATIVES ? { state: 'full', next: '', call: lc.id } : { state: 'live', next: '', call: lc.id };
    }
    if (r.state === 'busy' || lc) return { state: 'busy', next: '' };
    const s = r.residents[inv.resident];
    if (!s || !s.acceptNow) return { state: 'notnow', next: s && s.next ? s.next : '' };
    return { state: 'available', next: '' };
  }
  function end(c, state) {
    c.state = state;
    c.endedAt = Date.now();
    clearTimeout(c.timer);
    /* A call the care team started is used once it has taken place; before that (no answer, a
       failed attempt) the family may join again until the invitation expires. */
    const o = c.outgoing && outgoing.get(c.outgoing);
    if (o && o.state === 'live') { o.state = state === 'ended' ? 'used' : 'waiting'; if (o.state === 'used') { o.endedAt = Date.now(); clearTimeout(o.timer); } }
    log('call ' + c.id.slice(0, 6) + '… ' + state + (c.answeredAt ? ' after ' + Math.round((c.endedAt - c.answeredAt) / 1000) + ' s' : ''));
  }

  /* A relative joins the call that runs: a peer id for them, and the robot is told (with their offer). */
  function joinCall(c, token, contactId, sdp) {
    if (c.state !== 'live') return [200, { state: 'ringing' }];
    if (activePeers(c).length >= MAX_RELATIVES) return [200, { state: 'full' }];
    const others = activePeers(c).map((p) => p.id);
    const p = addPeer(c, token, contactId);
    push(c, { type: 'peer-joined', peer: p.id, except: p.id, at: Date.now() });
    push(robot(c.robot), { type: 'peer-join', call: c.id, peer: p.id, contactId, resident: c.resident, sdp, at: Date.now() });
    log('call ' + c.id.slice(0, 6) + '… relative ' + (others.length + 1) + ' of ' + MAX_RELATIVES + ' joins');
    return [200, { call: c.id, peer: p.id, state: 'live', joined: true, peers: others, since: c.seq }];
  }

  /* Ended calls, idle robots and old events are forgotten after a few minutes. */
  const sweeper = setInterval(() => {
    const t = Date.now();
    for (const [id, c] of calls) if (c.endedAt && t - c.endedAt > KEEP_MS && !c.waiters.size) calls.delete(id);
    for (const [id, o] of outgoing) { outState(o); if (o.endedAt && t - o.endedAt > KEEP_MS) outgoing.delete(id); }
    for (const [id, r] of robots) {
      if (!r.waiters.size && t - r.seen > KEEP_MS) robots.delete(id);
      else r.events = r.events.filter((e) => t - e.at < KEEP_MS);
    }
  }, 30000);
  if (sweeper.unref) sweeper.unref();

  /* ---------- the routes ---------- */
  function handle(req, url, body, res) {
    const p = url.pathname.replace(/^\/call\/api\//, '');
    const q = (k) => String(url.searchParams.get(k) || '');
    const post = req.method === 'POST';
    body = body && typeof body === 'object' ? body : {};

    if (p === 'invite' && post) {
      const robotId = str(body.robot, 64), resident = str(body.resident, 24), contactId = str(body.contactId, 40);
      const label = str(body.label, 40), lang = LANGS.includes(body.lang) ? body.lang : 'en';
      if (!ROBOT_ID.test(robotId) || !resident || !contactId || !label) return [400, { error: 'bad-invite', message: 'robot, resident, contactId and label are needed.' }];
      const d = load();
      if (body.token) {
        const inv = invite(body.token);
        if (!inv || inv.robot !== robotId || inv.revoked) return [404, { error: 'unknown' }];
        Object.assign(inv, { label, lang, resident, contactId });
        save();
        return [200, { token: body.token, updated: true }];
      }
      const token = randomId();
      d.invites[token] = { robot: robotId, resident, contactId, label, lang, created: new Date().toISOString(), revoked: null };
      save();
      log('new family link for ' + resident);
      /* Robot tests: the link is made on the robot, so this window shows it for the PC playing the family. */
      const port = String((req.headers || {}).host || '').split(':')[1] || '8765';
      log('  family page on this PC: http://localhost:' + port + '/famille.html#t=' + token);
      return [200, { token }];
    }
    if (p === 'revoke' && post) {
      const inv = invite(body.token);
      if (!inv || inv.robot !== str(body.robot, 64)) return [404, { error: 'unknown' }];
      if (!inv.revoked) {
        inv.revoked = new Date().toISOString();
        save();
        log('family link revoked for ' + inv.resident);
      }
      return [200, { ok: true }];
    }
    if (p === 'ice' && !post) return [200, iceServers()];

    /* ---- the care team calls the family ---- */
    if (p === 'outgoing' && post) {
      const robotId = str(body.robot, 64), resident = str(body.resident, 24), contactId = str(body.contactId, 40);
      const label = str(body.label, 40), lang = LANGS.includes(body.lang) ? body.lang : 'en';
      if (!ROBOT_ID.test(robotId) || !resident || !contactId || !label) return [400, { error: 'bad-outgoing', message: 'robot, resident, contactId and label are needed.' }];
      for (const old of outgoing.values()) if (old.robot === robotId) closeOut(old, 'cancelled');
      const o = { token: randomId(), robot: robotId, resident, contactId, label, lang, created: Date.now(), expires: Date.now() + OUT_MS, state: 'waiting', timer: null, endedAt: 0 };
      o.timer = setTimeout(() => outState(o), OUT_MS + 50);
      outgoing.set(o.token, o);
      push(robot(robotId), { type: 'outgoing', token: o.token, resident, contactId, expires: o.expires, at: Date.now() });
      log('the care team calls the family of ' + resident + ' (valid 30 min)');
      const port = String((req.headers || {}).host || '').split(':')[1] || '8765';
      log('  join page on this PC: http://localhost:' + port + '/famille.html#j=' + o.token);
      return [200, { token: o.token, expires: new Date(o.expires).toISOString(), robotOnline: online(robots.get(robotId)) }];
    }
    if (p === 'outgoing/cancel' && post) {
      const o = TOKEN.test(body.token || '') ? outgoing.get(body.token) : null;
      if (!o || o.robot !== str(body.robot, 64)) return [404, { error: 'unknown' }];
      closeOut(o, body.reason === 'declined' || body.reason === 'missed' ? body.reason : 'cancelled');
      return [200, { ok: true, state: outState(o) }];
    }
    if (p === 'invite/last' && !post) {
      const inv = invite(q('token'));
      if (!inv || inv.robot !== q('robot')) return [404, { error: 'unknown' }];
      return [200, { at: inv.lastCallAt || null }];
    }
    if (p === 'outgoing/info' && !post) {
      const o = TOKEN.test(q('token')) ? outgoing.get(q('token')) : null;
      if (!o || o.robot !== q('robot')) return [404, { error: 'unknown' }];
      const c = o.call ? calls.get(o.call) : null;
      return [200, { state: outState(o), expires: new Date(o.expires).toISOString(), call: c ? c.state : '', robotOnline: online(robots.get(o.robot)) }];
    }
    if (p === 'status' && !post && q('j')) {
      const o = TOKEN.test(q('j')) ? outgoing.get(q('j')) : null;
      if (!o) return [404, { error: 'unknown' }];
      const s = outState(o);
      if (OVER.includes(s)) return [410, { error: s, lang: o.lang }];
      const r = robots.get(o.robot), lcs = liveCall(o.robot);
      let state = !online(r) ? 'offline' : (s === 'live' || lcs) ? 'busy' : 'waiting';
      if (state === 'busy' && lcs && lcs.outgoing === o.token) state = lcs.state === 'ringing' ? 'ringing' : activePeers(lcs).length >= MAX_RELATIVES ? 'full' : 'live';
      return [200, { kind: 'join', label: o.label, lang: o.lang, state, expires: new Date(o.expires).toISOString() }];
    }
    if (p === 'join' && post) {
      const o = TOKEN.test(body.j || '') ? outgoing.get(body.j) : null;
      if (!o) return [404, { error: 'unknown' }];
      const s = outState(o);
      if (OVER.includes(s)) return [410, { error: s, lang: o.lang }];
      const sdp = typeof body.sdp === 'string' ? body.sdp : '';
      if (!sdp || sdp.length > MAX_SDP) return [400, { error: 'bad-sdp' }];
      if (!online(robots.get(o.robot))) return [200, { state: 'offline' }];
      /* More relatives with the same join link: they join the call that runs. */
      const lcj = liveCall(o.robot);
      if (lcj && lcj.outgoing === o.token) return joinCall(lcj, o.token, o.contactId, sdp);
      if (s !== 'waiting' || lcj) return [200, { state: 'busy' }];
      const c = Object.assign(box(), { id: randomId(), token: o.token, outgoing: o.token, robot: o.robot, resident: o.resident, contactId: o.contactId,
        state: 'ringing', created: Date.now(), answeredAt: 0, endedAt: 0, timer: null, peers: [] });
      const p0 = addPeer(c, o.token, o.contactId);
      calls.set(c.id, c);
      o.call = c.id;
      c.timer = setTimeout(() => {
        if (c.state !== 'ringing') return;
        end(c, 'missed');
        push(c, { type: 'missed', at: Date.now() });
        push(robot(c.robot), { type: 'missed', call: c.id, at: Date.now() });
      }, RING_MS);
      push(robot(o.robot), { type: 'call', call: c.id, resident: o.resident, contactId: o.contactId, sdp, outgoing: o.token, peer: p0.id, at: Date.now() });
      log('call ' + c.id.slice(0, 6) + '… the family joins the call for ' + o.resident);
      return [200, { call: c.id, peer: p0.id, state: 'ringing' }];
    }

    if (p === 'status' && !post) {
      const inv = invite(q('t'));
      if (!inv) return [404, { error: 'unknown' }];
      if (inv.revoked) return [410, { error: 'revoked', lang: inv.lang }];
      const a = availability(inv);
      return [200, { label: inv.label, lang: inv.lang, state: a.state, next: a.next }];
    }
    if (p === 'call' && post) {
      const inv = invite(body.t);
      if (!inv) return [404, { error: 'unknown' }];
      if (inv.revoked) return [410, { error: 'revoked', lang: inv.lang }];
      const sdp = typeof body.sdp === 'string' ? body.sdp : '';
      if (!sdp || sdp.length > MAX_SDP) return [400, { error: 'bad-sdp' }];
      const a = availability(inv);
      if (a.state === 'live') return joinCall(calls.get(a.call), body.t, inv.contactId, sdp);
      if (a.state !== 'available') return [200, { state: a.state, next: a.next }];
      const c = Object.assign(box(), { id: randomId(), token: body.t, robot: inv.robot, resident: inv.resident, contactId: inv.contactId,
        state: 'ringing', created: Date.now(), answeredAt: 0, endedAt: 0, timer: null, peers: [] });
      const p0 = addPeer(c, body.t, inv.contactId);
      calls.set(c.id, c);
      c.timer = setTimeout(() => {
        if (c.state !== 'ringing') return;
        end(c, 'missed');
        push(c, { type: 'missed', at: Date.now() });
        push(robot(c.robot), { type: 'missed', call: c.id, at: Date.now() });
      }, RING_MS);
      push(robot(inv.robot), { type: 'call', call: c.id, resident: inv.resident, contactId: inv.contactId, sdp, peer: p0.id, at: Date.now() });
      log('call ' + c.id.slice(0, 6) + '… ringing for ' + inv.resident);
      return [200, { call: c.id, peer: p0.id, state: 'ringing' }];
    }
    let m = /^call\/([A-Za-z0-9_-]{16,64})\/wait$/.exec(p);
    if (m && !post) {
      const c = calls.get(m[1]);
      if (!c) return [404, { error: 'unknown-call' }];
      /* Events for everybody, and the ones addressed to this relative (no peer id: the first relative). */
      const pid = q('peer'), me = pid ? (c.peers.find((x) => x.id === pid) || {}).id : c.peers[0].id;
      if (!me) return [404, { error: 'unknown-peer' }];
      return wait(c, Number(q('since')), res, (e) => (!e.to || e.to === me) && e.except !== me);
    }
    m = /^call\/([A-Za-z0-9_-]{16,64})\/signal$/.exec(p);
    if (m && post) {
      const c = calls.get(m[1]);
      if (!c) return [404, { error: 'unknown-call' }];
      const from = c.peers.find((x) => x.id === str(body.peer, 64) && x.token === body.t && x.state === 'joined');
      if (!from) return [403, { error: 'not-in-call' }];
      if (c.state !== 'live') return [409, { error: 'not-live', state: c.state }];
      const to = c.peers.find((x) => x.id === str(body.to, 64) && x.state === 'joined' && x.id !== from.id);
      if (!to) return [404, { error: 'unknown-peer' }];
      const sdp = typeof body.sdp === 'string' ? body.sdp : '';
      if (!['offer', 'answer'].includes(body.kind) || !sdp || sdp.length > MAX_SDP) return [400, { error: 'bad-signal' }];
      push(c, { type: 'signal', from: from.id, to: to.id, kind: body.kind, sdp, at: Date.now() });
      return [200, { ok: true }];
    }
    m = /^call\/([A-Za-z0-9_-]{16,64})$/.exec(p);
    if (m && post) {
      const c = calls.get(m[1]);
      if (!c) return [404, { error: 'unknown-call' }];
      const type = body.type, fromRobot = str(body.robot, 64) === c.robot;
      if (['answer', 'decline', 'missed', 'busy'].includes(type)) {
        if (!fromRobot) return [403, { error: 'robot-only' }];
        if (c.state !== 'ringing') return [409, { error: 'not-ringing', state: c.state }];
        if (type === 'answer') {
          const sdp = typeof body.sdp === 'string' ? body.sdp : '';
          if (!sdp || sdp.length > MAX_SDP) return [400, { error: 'bad-sdp' }];
          c.state = 'live'; c.answeredAt = Date.now(); clearTimeout(c.timer);
          /* The last call taken through a relative's own link (for the family's "you have not talked" reminder). */
          { const inv0 = c.token ? invite(c.token) : null; if (inv0) { inv0.lastCallAt = new Date().toISOString(); save(); } }
          const o = c.outgoing && outgoing.get(c.outgoing);
          if (o && o.state === 'waiting') o.state = 'live';
          push(c, { type: 'answer', to: c.peers[0].id, sdp, at: Date.now() });
          log('call ' + c.id.slice(0, 6) + '… answered');
        } else {
          end(c, type === 'decline' ? 'declined' : type);
          push(c, { type, at: Date.now() });
        }
        /* Another window of the same robot that still rings stops quietly (only one records it). */
        push(robot(c.robot), { type: 'taken', call: c.id, state: c.state, at: Date.now() });
        return [200, { ok: true, state: c.state }];
      }
      if (['peer-answer', 'peer-reject', 'peer-gone'].includes(type)) {
        if (!fromRobot) return [403, { error: 'robot-only' }];
        if (c.state !== 'live') return [409, { error: 'not-live', state: c.state }];
        const pr = c.peers.find((x) => x.id === str(body.peer, 64) && x.state === 'joined');
        if (!pr) return [404, { error: 'unknown-peer' }];
        if (type === 'peer-answer') {
          const sdp = typeof body.sdp === 'string' ? body.sdp : '';
          if (!sdp || sdp.length > MAX_SDP) return [400, { error: 'bad-sdp' }];
          push(c, { type: 'answer', to: pr.id, sdp, at: Date.now() });
        } else {
          pr.state = 'left';
          push(c, { type: type === 'peer-reject' ? 'decline' : 'hangup', to: pr.id, by: 'robot', was: 'live', at: Date.now() });
          push(c, { type: 'peer-left', peer: pr.id, except: pr.id, at: Date.now() });
        }
        return [200, { ok: true }];
      }
      if (type === 'hangup') {
        /* A relative: the invite token, and the peer id when there are several (none: the first one). */
        const pid = str(body.peer, 64);
        const mine = c.peers.filter((x) => x.token === body.t && (!pid || x.id === pid));
        const who = mine.find((x) => x.state === 'joined') || mine[0] || null;
        if (!fromRobot && !who) return [403, { error: 'not-in-call' }];
        const by = fromRobot ? 'robot' : 'family';
        if (c.state === 'ringing' || c.state === 'live') {
          const was = c.state;
          if (by === 'family' && was === 'live' && who.state === 'joined') {
            who.state = 'left';
            /* Others are still in the call: it goes on without this relative. */
            if (activePeers(c).length) {
              push(robot(c.robot), { type: 'peer-leave', call: c.id, peer: who.id, at: Date.now() });
              push(c, { type: 'peer-left', peer: who.id, except: who.id, at: Date.now() });
              return [200, { ok: true, state: c.state }];
            }
          }
          end(c, was === 'ringing' ? 'cancelled' : 'ended');
          push(c, { type: 'hangup', by, was, at: Date.now() });
          if (by === 'family') push(robot(c.robot), { type: 'hangup', call: c.id, by, was, at: Date.now() });
        }
        return [200, { ok: true, state: c.state }];
      }
      return [400, { error: 'bad-type' }];
    }
    if (p === 'robot/state' && post) {
      const id = str(body.robot, 64);
      if (!ROBOT_ID.test(id)) return [400, { error: 'bad-robot' }];
      const r = robot(id), residents = {};
      const src = body.residents && typeof body.residents === 'object' ? body.residents : {};
      Object.keys(src).slice(0, 60).forEach((code) => {
        const s = src[code] || {}, k = str(code, 24);
        if (k) residents[k] = { acceptNow: s.acceptNow === true, next: HHMM.test(s.next || '') ? s.next : '' };
      });
      r.seen = Date.now(); r.state = body.state === 'busy' ? 'busy' : 'idle'; r.residents = residents;
      return [200, { ok: true }];
    }
    if (p === 'robot/wait' && !post) {
      const id = q('robot');
      if (!ROBOT_ID.test(id)) return [400, { error: 'bad-robot' }];
      const r = robot(id);
      r.seen = Date.now();
      /* An incoming call is only handed over while it still rings (a robot that reloads its page
         does not get calls that are already over). */
      const keep = (e) => (e.type !== 'call' || (calls.get(e.call) || {}).state === 'ringing') &&
        (e.type !== 'peer-join' || (((calls.get(e.call) || {}).state === 'live') && ((calls.get(e.call).peers.find((x) => x.id === e.peer) || {}).state === 'joined'))) &&
        (e.type !== 'outgoing' || (outgoing.get(e.token) ? outState(outgoing.get(e.token)) === 'waiting' : false));
      return Promise.resolve(wait(r, Number(q('since')), res, keep)).then((out) => { r.seen = Date.now(); return out; });
    }
    if (p === 'robot/info' && !post) {
      const id = q('robot');
      if (!ROBOT_ID.test(id)) return [400, { error: 'bad-robot' }];
      const r = robots.get(id), c = liveCall(id);
      return [200, { online: online(r), state: r ? r.state : 'offline', call: c ? c.state : '', seenAgo: r && r.seen ? Math.round((Date.now() - r.seen) / 1000) : null }];
    }
    return [404, { error: 'not found' }];
  }

  return { handle, stop: () => clearInterval(sweeper), _calls: calls, _robots: robots, _outgoing: outgoing };
}

/* The relay store-server.mjs uses: invites in labland/data/call-data.json. */
const relay = createRelay();
export function callApi(req, url, body, res) { return relay.handle(req, url, body, res); }
