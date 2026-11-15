// Display link: the relay between the small head screen (Care Team) and the big tablet (patient
// screen) of ONE robot. Mounted by store-server.mjs under /link/api/. Plain Node, no packages.
//
// Both devices know the same pairing CODE (6 to 12 letters or digits, in the URL). One channel per
// code, made on the first call, forgotten after 4 hours without activity. Memory only: nothing is
// written to disk, and nothing is logged (a run carries the greeting first name, a code is a secret).
//
//   head    POST /link/api/:code/run     {run:{id,key,patient,opt,position,at,preview}} -> {ok,id}
//                                         one live run per channel: a new one replaces the old (state 'sent')
//                                         the run may carry `place` (text <= 60): the robot drives there first
//   head    POST /link/api/:code/arrived {id} -> state 'arrived'; the tablet sees {arrived:id} on /next, once
//   tablet  GET  /link/api/:code/next?wait=25   -> {run} once (then 'delivered'), {cancel:id} once, {arrived:id} once, or {}
//   tablet  POST /link/api/:code/status  {id,state,result?}   state: received|present|absent|started|
//                                         finished|cancelled|arrived|seated|waiting-seat|returning|home; result (object, <= 150 KB) only with finished;
//                                         an id that is not the live run: 409
//   head    GET  /link/api/:code/status?since=N&wait=25 -> {seq,id,state,position,result?} as soon as seq > N
//   head    POST /link/api/:code/cancel  -> state 'cancelled'; the tablet sees {cancel:id} on /next
//   both    GET  /link/api/:code/ping    -> {ok,t}
// seq goes up at every change: run sent, delivered, tablet status, cancel.

const CODE = /^[A-Za-z0-9]{6,12}$/;
const TABLET_STATES = ['received', 'present', 'absent', 'started', 'finished', 'cancelled', 'arrived', 'seated', 'waiting-seat', 'returning', 'home'];
export const MAX_BODY = 200 * 1024;
const MAX_RESULT = 150 * 1024;

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

export function createLink(opts = {}) {
  const now = opts.now || (() => Date.now());
  const WAIT_MS = opts.waitMs || 25000;          // a long-poll is held this long at most
  const IDLE_MS = opts.idleMs || 4 * 3600 * 1000; // a channel without activity for this long is forgotten
  const MAX_CHANNELS = opts.maxChannels || 50;
  const RATE = opts.rate || 120;                  // requests per IP per minute
  const channels = new Map();
  const hits = new Map();                         // ip -> { start, n }

  function limited(req) {
    const ip = (req.socket && req.socket.remoteAddress) || (req.headers && req.headers['x-test-ip']) || '?';
    const t = now();
    let h = hits.get(ip);
    if (!h || t - h.start >= 60000) { h = { start: t, n: 0 }; hits.set(ip, h); }
    return ++h.n > RATE;
  }
  function sweep() {
    const t = now();
    for (const [code, ch] of channels) if (t - ch.active > IDLE_MS && !ch.waiters.size) channels.delete(code);
    for (const [ip, h] of hits) if (t - h.start >= 60000) hits.delete(ip);
  }
  const sweeper = setInterval(sweep, 60000);
  if (sweeper.unref) sweeper.unref();

  /* The channel of a code, made at the first call; null when there are too many. An expired one is new again. */
  function channel(code) {
    let ch = channels.get(code);
    if (ch && now() - ch.active > IDLE_MS && !ch.waiters.size) { channels.delete(code); ch = null; }
    if (!ch) {
      sweep();
      if (channels.size >= MAX_CHANNELS) return null;
      ch = { seq: 0, run: null, state: '', result: null, cancelPending: false, arrivedPending: false, active: now(), waiters: new Set() };
      channels.set(code, ch);
    }
    ch.active = now();
    return ch;
  }
  function bump(ch) { ch.seq++; ch.active = now(); for (const w of [...ch.waiters]) w(); }
  function view(ch) {
    const out = { seq: ch.seq };
    if (ch.run) { out.id = ch.run.id; out.state = ch.state; out.position = ch.run.position === undefined ? null : ch.run.position; if (ch.run.place) out.place = ch.run.place; }
    if (ch.result) out.result = ch.result;
    return out;
  }
  /* Hold the answer until check() has one (an object) or the delay is over (then `empty()`). */
  function hold(ch, ms, res, check, empty) {
    const first = check();
    if (first) return [200, first];
    return new Promise((resolve) => {
      let over = false;
      const finish = (out) => { if (over) return; over = true; clearTimeout(timer); ch.waiters.delete(poke); resolve(out); };
      const poke = () => { const o = check(); if (o) finish([200, o]); };
      const timer = setTimeout(() => finish([200, empty()]), ms);
      ch.waiters.add(poke);
      if (res && res.once) res.once('close', () => finish(null));
    });
  }
  const waitOf = (url) => {
    const w = Number(url.searchParams.get('wait'));
    return w > 0 ? Math.min(w * 1000, WAIT_MS) : 0;
  };

  function handle(req, url, body, res) {
    const m = /^\/link\/api\/([^/]+)\/([a-z]+)$/.exec(url.pathname);
    if (!m) return [404, { error: 'not found' }];
    const code = m[1], act = m[2], post = req.method === 'POST';
    if (!CODE.test(code)) return [400, { error: 'bad-code', message: 'The pairing code is 6 to 12 letters or digits.' }];
    if (limited(req)) return [429, { error: 'too-many-requests' }];
    body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

    if (act === 'ping' && !post) return [200, { ok: true, t: now() }];
    if (!['run', 'next', 'status', 'cancel', 'arrived'].includes(act)) return [404, { error: 'not found' }];
    const ch = channel(code);
    if (!ch) return [503, { error: 'too-many-channels' }];

    if (act === 'run' && post) {
      const r = body.run;
      if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !r.id || r.id.length > 64) return [400, { error: 'bad-run' }];
      ch.run = { id: r.id, key: r.key, patient: r.patient, opt: r.opt, position: r.position, place: str(r.place, 60), at: r.at, preview: r.preview };
      if (!ch.run.place) delete ch.run.place;
      ch.state = 'sent'; ch.result = null; ch.cancelPending = false; ch.arrivedPending = false;
      bump(ch);
      return [200, { ok: true, id: r.id }];
    }
    if (act === 'cancel' && post) {
      if (ch.run && ['sent', 'delivered', 'received', 'present', 'started', 'arrived', 'seated', 'waiting-seat'].includes(ch.state)) {
        ch.state = 'cancelled'; ch.cancelPending = true;
        bump(ch);
      }
      return [200, { ok: true, state: ch.run ? ch.state : '' }];
    }
    if (act === 'arrived' && post) {
      if (typeof body.id !== 'string' || !ch.run || ch.run.id !== body.id) return [409, { error: 'stale-run' }];
      if (['sent', 'delivered', 'received'].includes(ch.state)) {
        ch.arrivedPending = true;
        if (ch.state !== 'sent') ch.state = 'arrived';   // 'sent': the run is still to be delivered first
        bump(ch);
      }
      return [200, { ok: true, state: ch.state }];
    }
    if (act === 'next' && !post) {
      const take = () => {
        if (ch.cancelPending && ch.run) { ch.cancelPending = false; return { cancel: ch.run.id }; }
        if (ch.run && ch.state === 'sent') { ch.state = 'delivered'; bump(ch); return { run: ch.run }; }
        if (ch.arrivedPending && ch.run && ch.state !== 'sent') { ch.arrivedPending = false; if (ch.state === 'delivered') ch.state = 'arrived'; bump(ch); return { arrived: ch.run.id }; }
        return null;
      };
      return hold(ch, waitOf(url), res, take, () => ({}));
    }
    if (act === 'status' && post) {
      const state = body.state;
      if (typeof body.id !== 'string' || !TABLET_STATES.includes(state)) return [400, { error: 'bad-status' }];
      if (!ch.run || ch.run.id !== body.id) return [409, { error: 'stale-run' }];
      if (ch.state === 'cancelled') return (state === 'returning' || state === 'home') ? [200, { ok: true, seq: ch.seq }] : [409, { error: 'cancelled' }];   // the way home is told, the state stays cancelled
      let result = null;
      if (body.result !== undefined && body.result !== null) {
        if (state !== 'finished' || typeof body.result !== 'object' || Array.isArray(body.result)) return [400, { error: 'bad-result' }];
        if (JSON.stringify(body.result).length > MAX_RESULT) return [413, { error: 'result-too-large' }];
        result = body.result;
      }
      ch.state = state;
      if (result) ch.result = result;
      bump(ch);
      return [200, { ok: true, seq: ch.seq }];
    }
    if (act === 'status' && !post) {
      let since = Number(url.searchParams.get('since'));
      if (!(since >= 0) || since > ch.seq) since = 0;   // a restarted server counts from 0 again
      return hold(ch, waitOf(url), res, () => (ch.seq > since ? view(ch) : null), () => ({ seq: ch.seq }));
    }
    return [404, { error: 'not found' }];
  }

  return { handle, stop: () => clearInterval(sweeper), _channels: channels };
}

/* The relay store-server.mjs uses. */
const link = createLink();
export function linkApi(req, url, body, res) { return link.handle(req, url, body, res); }
