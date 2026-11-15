/* Bellatrix Premium v3, per resident AND per product (1.16, 10 Nov 2026). Contract 1 of 1.16.
   Two separate products, 'play' (Bellatrix Play Premium) and 'books' (Books Premium): one NEVER implies
   the other, each is paid and switched on for ONE resident only. Loaded on the Care Team page and the
   patient screen (same robot, same storage), after js/premium-config.js and before every module that
   checks Premium. Prices are never here: js/premium-config.js (PREMIUM_CONFIG).

   API (everyone else uses only this):
   - isOn(code, product), entry(code, product), stored(code, product) (even ended), list(product)
   - activate(code, product, { until, by, source, offer, request, months, plan }), deactivate(code, product),
     stop(code, product) (the team turns it off: also ends the portal request it came from)
   - ask(code, product), asked(code, product), asks(product), unask(code, product): a resident asks
   - requests(product): the payment requests [{ id, code, product, months, state, at, updatedAt, until }],
     state 'requested' | 'awaiting_family' | 'paid' | 'active' | 'refused' | 'expired'
   - authorise(code, product, months), cancel(id), poll(): the team flow with the family portal (contract 2)
   - gift(code, product, offerId, months, until), giftsEnded(offers): the family's gifts (portal offers)
   A missing product means 'play' (the 1.15 callers: v2 was Play only); an unknown product is never on.

   Storage (localStorage):
   - 'bellatrix-premium-v3' = { v: 3, residents: { P1: { play: {...}, books: {...} } }, mirror }
     an entry = { plan, since, until, by, source, offer, request, months }; until null = no end; an entry
     past its end counts as off. source: 'team' (the team's demo payment), 'request' (paid by the family
     through a payment request), 'family' (a gift offered on the family portal).
   - 'bellatrix-premium-v2' (1.15, Play only) is MIGRATED to 'play', then kept as a mirror of the Play
     entries for the 1.15 readers; when something else writes or removes it (an older page, the demo),
     Play follows it (mirror = the last v2 text written here).
   - 'bellatrix-premium-asks' = { list: [{ code, product, at }], mirror }; the 1.15 key
     'bellatrix-play-premium-request' = { patient, at } mirrors the latest Play ask, the same way.
   - 'bellatrix-premium-requests' = [ request ]: the payment requests known on this robot.
   Every change fires the window event 'bellatrix-play-premium' (the other page sees the storage event).
   No card data, no payment here: the family pays on a SIMULATED form of the family portal. ES5. */
var Premium = (function () {
  'use strict';
  var KEY = 'bellatrix-premium-v3', V2 = 'bellatrix-premium-v2', ASKS = 'bellatrix-premium-asks', REQS = 'bellatrix-premium-requests';
  var LEGACY = 'bellatrix-play-premium', LEGACY_PLAN = 'bellatrix-play-premium-plan', LEGACY_ASK = 'bellatrix-play-premium-request';
  var EVENT = 'bellatrix-play-premium';
  var PRODUCTS = ['play', 'books'];
  var STATES = ['requested', 'awaiting_family', 'paid', 'active', 'refused', 'expired'];
  var RANK = { requested: 0, awaiting_family: 1, paid: 2, active: 3, refused: 4, expired: 4 };
  var DAY = 24 * 3600 * 1000;

  /* ---------- helpers ---------- */
  function cfg() {
    if (typeof PREMIUM_CONFIG !== 'undefined' && PREMIUM_CONFIG) return PREMIUM_CONFIG;
    return (typeof window !== 'undefined' && window.PREMIUM_CONFIG) || {};
  }
  function norm(code) { return String(code == null ? '' : code).trim().toUpperCase(); }
  /* 'play' | 'books' | '' (unknown). */
  function product(p) { var x = String(p == null ? '' : p).trim().toLowerCase(); return PRODUCTS.indexOf(x) >= 0 ? x : ''; }
  /* The product of a call: none given = 'play' (1.15 callers), unknown = '' (never on). */
  function which(p) { return p == null || p === '' ? 'play' : product(p); }
  function months() { var m = cfg().months; return m && m.length ? m.slice() : [1, 3, 12]; }
  function monthsOk(n) { n = parseInt(n, 10); return months().indexOf(n) >= 0 ? n : months()[0]; }
  function getRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setRaw(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } /* storage full or blocked */
  }
  function parse(s) { if (s == null) return null; try { return JSON.parse(s); } catch (e) { return null; } }
  function nowIso() { return new Date().toISOString(); }
  function fire() { try { window.dispatchEvent(new CustomEvent(EVENT)); } catch (e) { /* old browser or no window (tests) */ } }
  function live(r) { return !!r && (!r.until || Date.parse(r.until) > Date.now()); }
  /* Months after a date (or now), as an ISO date. */
  function addMonths(from, n) { var d = from ? new Date(from) : new Date(); d.setMonth(d.getMonth() + (n || 1)); return d.toISOString(); }
  function monthsFromNow(n) { return addMonths(null, n); }
  function clean(r) {
    var e = { plan: String(r.plan || 'month'), since: r.since || nowIso(), until: r.until || null, by: r.by || '', source: r.source || 'team' };
    if (r.offer) e.offer = String(r.offer);
    if (r.request) e.request = String(r.request);
    if (r.months) e.months = parseInt(r.months, 10) || 1;
    return e;
  }

  /* ---------- the entries (v3, with the v2 mirror for Play) ---------- */
  function read() {
    var o = parse(getRaw(KEY)), raw2 = getRaw(V2);
    if (!o || typeof o !== 'object' || !o.residents || typeof o.residents !== 'object') o = { v: 3, residents: {}, mirror: null };
    if ((o.mirror || null) !== (raw2 || null)) {
      /* v2 (Play only) was written or removed outside this file (the first 1.16 start, an older page,
         the demo): Play follows it. Books never comes from v2. */
      var v2 = parse(raw2), res = v2 && v2.residents && typeof v2.residents === 'object' ? v2.residents : {};
      Object.keys(o.residents).forEach(function (c) { if (o.residents[c]) delete o.residents[c].play; });
      Object.keys(res).forEach(function (k) {
        var c = norm(k), r = res[k];
        if (!c || !r || typeof r !== 'object') return;
        if (!o.residents[c] || typeof o.residents[c] !== 'object') o.residents[c] = {};
        o.residents[c].play = clean(r);
      });
      o.mirror = raw2 || null;
    }
    return o;
  }
  function write(o) {
    var v2 = { residents: {} };
    Object.keys(o.residents).forEach(function (c) {
      var r = o.residents[c];
      if (!r || (!r.play && !r.books)) { delete o.residents[c]; return; }
      if (r.play) v2.residents[c] = r.play;
    });
    var raw2 = Object.keys(v2.residents).length ? JSON.stringify(v2) : null;
    setRaw(V2, raw2);
    o.v = 3; o.mirror = raw2;
    setRaw(KEY, JSON.stringify(o));
    fire();
  }
  /* The entry even when it has ended (to know where an ended Premium came from). */
  function stored(code, p) {
    var pr = which(p), r = read().residents[norm(code)];
    return pr && r && r[pr] ? r[pr] : null;
  }
  /* The resident's entry for that product, or null when there is none or it has ended. */
  function entry(code, p) { var e = stored(code, p); return live(e) ? e : null; }
  function isOn(code, p) { return !!entry(code, p); }

  /* activate(code, product, opts). 1.15 callers: activate(code, 'team-3', opts) = Play, plan 'team-3'. */
  function activate(code, p, opts) {
    var c = norm(code), pr = product(p), plan = '';
    if (!pr && typeof p === 'string' && /^([a-z]+-[0-9]+|month)$/.test(p)) { pr = 'play'; plan = p; }   /* a 1.15 plan id: 'team-3', 'family-12', 'month' */
    if (!pr && p == null) pr = 'play';
    if (!c || !pr) return null;
    opts = opts || {};
    var n = opts.months || (/-(\d+)$/.exec(plan || opts.plan || '') || [])[1];
    var e = clean({ plan: opts.plan || plan || (n ? (opts.source || 'team') + '-' + n : 'month'), since: nowIso(), until: opts.until || null, by: opts.by || '',
      source: opts.source || 'team', offer: opts.offer, request: opts.request, months: n });
    unask(c, pr, true);   /* answered: the event below says both */
    var o = read();
    if (!o.residents[c] || typeof o.residents[c] !== 'object') o.residents[c] = {};
    o.residents[c][pr] = e;
    write(o);
    return e;
  }
  function deactivate(code, p) {
    var o = read(), c = norm(code), pr = which(p);
    if (!pr || !o.residents[c] || !o.residents[c][pr]) return false;
    delete o.residents[c][pr];
    write(o);
    return true;
  }
  /* Every resident with that product on now: [{ code, product, plan, since, until, by, source, offer, request, months }]. */
  function list(p) {
    var pr = which(p), all = read().residents, out = [];
    if (!pr) return out;
    Object.keys(all).forEach(function (k) {
      var r = all[k] && all[k][pr];
      if (!live(r)) return;
      out.push({ code: k, product: pr, plan: r.plan, since: r.since, until: r.until, by: r.by, source: r.source, offer: r.offer || '', request: r.request || '', months: r.months || 0 });
    });
    return out.sort(function (a, b) { return a.code < b.code ? -1 : a.code > b.code ? 1 : 0; });
  }
  function listAll() { return list('play').concat(list('books')); }
  /* The end date of a new subscription of n months: after the end of the one still running, else from now. */
  function untilAfter(code, p, n) {
    var cur = entry(code, p);
    return cur && cur.until ? addMonths(cur.until, n) : monthsFromNow(n);
  }

  /* ---------- a resident asks (Play or the reading app); the care team sees it ---------- */
  function readAsks() {
    var o = parse(getRaw(ASKS)), raw = getRaw(LEGACY_ASK);
    if (!o || typeof o !== 'object' || !Array.isArray(o.list)) o = { list: [], mirror: null };
    o.list = o.list.filter(function (a) { return a && norm(a.code) && product(a.product); });
    if ((o.mirror || null) !== (raw || null)) {
      var was = parse(o.mirror), now = parse(raw);
      /* The 1.15 key removed (an older page cleared it, the demo): that ask goes. */
      if (!raw && was && was.patient) o.list = o.list.filter(function (a) { return !(a.code === norm(was.patient) && a.product === (product(was.product) || 'play')); });
      /* Written by an older page (1.15 Play or Reading): a Play ask unless it names its product. */
      if (now && typeof now === 'object' && norm(now.patient)) {
        var c = norm(now.patient), pr = product(now.product) || 'play';
        if (!o.list.some(function (a) { return a.code === c && a.product === pr; })) o.list.push({ code: c, product: pr, at: now.at || nowIso() });
      }
      o.mirror = raw || null;
      /* Kept at once: the old key carries one ask only, the next change would lose this one. */
      setRaw(ASKS, JSON.stringify(o));
    }
    return o;
  }
  function writeAsks(o, quiet) {
    var play = o.list.filter(function (a) { return a.product === 'play'; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; })[0];
    var raw = play ? JSON.stringify({ patient: play.code, at: play.at }) : null;
    setRaw(LEGACY_ASK, raw);
    o.mirror = raw;
    setRaw(ASKS, JSON.stringify(o));
    if (!quiet) fire();
  }
  /* The resident asks for that product. Nothing when they already have it. Returns the ask or null. */
  function ask(code, p, at) {
    var c = norm(code), pr = which(p);
    if (!c || !pr || isOn(c, pr)) return null;
    var o = readAsks(), hit = o.list.filter(function (a) { return a.code === c && a.product === pr; })[0];
    if (!hit) { hit = { code: c, product: pr, at: at ? new Date(at).toISOString() : nowIso() }; o.list.push(hit); }
    writeAsks(o);
    return { code: hit.code, product: hit.product, at: hit.at };
  }
  function asked(code, p) {
    var c = norm(code), pr = which(p);
    return !!c && !!pr && readAsks().list.some(function (a) { return a.code === c && a.product === pr; });
  }
  /* Every ask (of one product when given), oldest first: [{ code, product, at }]. */
  function asks(p) {
    var pr = p == null || p === '' ? '' : product(p);
    return readAsks().list.filter(function (a) { return !pr || a.product === pr; })
      .map(function (a) { return { code: a.code, product: a.product, at: a.at }; })
      .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }
  /* The ask goes (the team answered, said later, or Premium is on). Without a product: every product. */
  function unask(code, p, quiet) {
    var c = norm(code), pr = p == null || p === '' ? '' : product(p), o = readAsks(), n = o.list.length;
    o.list = o.list.filter(function (a) { return !(a.code === c && (!pr || a.product === pr)); });
    if (o.list.length === n) return false;
    writeAsks(o, quiet);
    return true;
  }

  /* ---------- payment requests (contract 2) ---------- */
  function validReq(q) { return q && typeof q === 'object' && q.id && norm(q.code) && product(q.product) && STATES.indexOf(q.state) >= 0; }
  function readReqs() { var l = parse(getRaw(REQS)); return Array.isArray(l) ? l.filter(validReq) : []; }
  function writeReqs(l) {
    var t = Date.now();
    l = l.filter(function (q) { return RANK[q.state] < 4 || t - Date.parse(q.updatedAt || q.at) < 60 * DAY; })
      .sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; }).slice(0, 60);
    setRaw(REQS, JSON.stringify(l));
    fire();
  }
  function copy(q) {
    return { id: q.id, code: q.code, product: q.product, months: q.months, state: q.state, at: q.at, updatedAt: q.updatedAt || q.at,
      until: q.until || null, paidAt: q.paidAt || null, endedBy: q.endedBy || '', seen: !!q.seen };
  }
  /* The payment requests, newest first (of one product when given). */
  function requests(p) {
    var pr = p == null || p === '' ? '' : product(p);
    return readReqs().filter(function (q) { return !pr || q.product === pr; }).map(copy);
  }
  /* The latest request of that resident and product (any state), or null. */
  function requestFor(code, p) {
    var c = norm(code), pr = which(p);
    return requests(pr).filter(function (q) { return q.code === c; })[0] || null;
  }
  /* The open one (requested, awaiting the family, paid), or null. */
  function openRequest(code, p) { var q = requestFor(code, p); return q && RANK[q.state] < 3 ? q : null; }
  function patchReq(id, fn) {
    var l = readReqs(), hit = null;
    l.forEach(function (q) { if (q.id === id) { fn(q); hit = q; } });
    if (hit) writeReqs(l);
    return hit ? copy(hit) : null;
  }
  /* The care team saw the outcome (paid, refused, expired): the news banner goes. */
  function seen(id) { return patchReq(id, function (q) { q.seen = true; }); }

  /* The way to the family portal server: FamilyMessages.request (js/messages.js: this robot's id and key
     in the Authorization header, the server of the Family tab). Tests give their own. */
  var transport = null;
  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function net(method, path, body) {
    if (transport) return transport(method, path, body);
    var FM = typeof FamilyMessages !== 'undefined' ? FamilyMessages : (typeof window !== 'undefined' ? window.FamilyMessages : null);
    if (!FM || !FM.request) return Promise.reject(fail('no-server'));
    try { return FM.request(method, path, body); } catch (e) { return Promise.reject(fail('no-server')); }
  }
  function rid() { return 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  /* The team taps OK ("Authorise") for this resident and product: the request goes to the family.
     Resolves with the request ('awaiting_family'); rejects with code 'no-family' (no family account for
     that resident on the portal) or 'no-server' (no portal answers): the Care Team then shows a short
     message and its own demo payment. The resident's ask is answered. */
  function authorise(code, p, n, opts) {
    var c = norm(code), pr = product(p), m = monthsOk(n);
    opts = opts || {};
    if (!c || !pr) return Promise.reject(fail('bad-request'));
    var open = openRequest(c, pr);
    if (open && open.state !== 'requested') return Promise.resolve(open);
    var t = nowIso(), q = { id: rid(), code: c, product: pr, months: m, state: 'requested', at: t, updatedAt: t, by: opts.by || '', local: true };
    var l = readReqs().filter(function (x) { return !(x.local && x.code === c && x.product === pr && x.state === 'requested'); });
    l.push(q); writeReqs(l);
    return net('POST', 'robot/premium-request', { code: c, product: pr, months: m }).then(function (r) {
      var s = r && (r.request || r);
      if (!s || !s.id) throw fail('no-server');
      var list = readReqs().filter(function (x) { return x.id !== q.id && x.id !== String(s.id); });
      var out = { id: String(s.id), code: c, product: pr, months: parseInt(s.months, 10) || m, state: STATES.indexOf(s.state) >= 0 ? s.state : 'awaiting_family',
        at: s.at || t, updatedAt: s.updatedAt || nowIso(), until: s.until || null, by: q.by };
      if (RANK[out.state] < 1) out.state = 'awaiting_family';
      list.push(out); writeReqs(list);
      unask(c, pr);
      schedule(15000);
      return copy(out);
    }, function (e) {
      writeReqs(readReqs().filter(function (x) { return x.id !== q.id; }));
      throw fail(e && (e.code === 'no-family' || e.message === 'no-family') ? 'no-family' : 'no-server');
    });
  }
  function sendCancel(id) {
    return net('POST', 'robot/premium-request/cancel', { id: id }).then(function (r) {
      patchReq(id, function (x) { delete x.cancel; });
      return r;
    });
  }
  /* The team takes a request back (not answered yet) or ends the Premium it brought: 'expired'. */
  function cancel(id) {
    var q = patchReq(id, function (x) {
      if (RANK[x.state] >= 4) return;
      x.state = 'expired'; x.endedBy = 'team'; x.updatedAt = nowIso(); x.seen = true; if (!x.local) x.cancel = true;
    });
    if (!q) return Promise.resolve(null);
    var e = stored(q.code, q.product);
    if (e && e.source === 'request' && e.request === q.id) deactivate(q.code, q.product);
    return sendCancel(id).then(function () { return q; }, function () { return q; });
  }
  /* The team turns it off: the entry, and on the portal the request or the gift it came from. */
  function stop(code, p) {
    var c = norm(code), pr = which(p), e = stored(c, pr);
    if (!e) return Promise.resolve(false);
    if (e.source === 'request' && e.request) return cancel(e.request).then(function () { deactivate(c, pr); return true; });
    var off = deactivate(c, pr);
    if (e.source === 'family' && e.offer) net('POST', 'robot/offer', { id: e.offer, decision: 'stop' }).then(null, function () { /* the gift stays off here */ });
    return Promise.resolve(off);
  }

  /* The robot reads the requests of the portal and acts, for THAT resident and product only:
     paid -> Premium on (the months after the end of what runs) -> 'active' sent back;
     refused or expired (the family stopped it) -> off, if it came from that request. */
  function apply(server) {
    var l = readReqs(), byId = {}, changed = false, sends = [];
    l.forEach(function (q) { byId[q.id] = q; });
    (server || []).forEach(function (s) {
      if (!s || !s.id || !product(s.product) || !norm(s.code) || STATES.indexOf(s.state) < 0) return;
      var id = String(s.id), q = byId[id];
      if (!q) {
        q = { id: id, code: norm(s.code), product: product(s.product), months: monthsOk(s.months), state: s.state, at: s.at || nowIso(), updatedAt: s.updatedAt || s.at || nowIso(), until: s.until || null };
        if (s.paidAt) q.paidAt = s.paidAt;
        if (RANK[s.state] >= 3) q.seen = true;   /* an outcome from before this robot knew it is not news */
        l.push(q); byId[id] = q; changed = true;
        return;
      }
      /* States only move forward; what the team ended here stays ended. */
      if (RANK[s.state] > RANK[q.state]) {
        q.state = s.state; q.updatedAt = s.updatedAt || nowIso(); changed = true;
        if (s.paidAt) q.paidAt = s.paidAt;
        if (s.until && s.state === 'active') q.until = s.until;
        if (RANK[s.state] >= 3) q.seen = false;
      } else if (s.state === 'paid' && q.state === 'active') sends.push(['robot/premium-request/active', { id: q.id, until: q.until }]);   /* not told yet */
    });
    l.forEach(function (q) {
      var e = stored(q.code, q.product), mine = !!e && e.source === 'request' && e.request === q.id;
      if (q.state === 'paid') {
        var until = mine && e.until ? e.until : untilAfter(q.code, q.product, q.months || 1);
        if (!mine || !live(e)) activate(q.code, q.product, { until: until, by: 'family', source: 'request', request: q.id, months: q.months });
        q.state = 'active'; q.until = until; q.updatedAt = nowIso(); q.seen = false; changed = true;
        sends.push(['robot/premium-request/active', { id: q.id, until: until }]);
      } else if (q.state === 'active' && !mine && !q.cancel && q.until && Date.parse(q.until) > Date.now() &&
          !(e && live(e) && (!e.until || Date.parse(e.until) >= Date.parse(q.until)))) {
        /* Active on the portal, not here (this robot's storage was reset): on again until its date. */
        activate(q.code, q.product, { until: q.until, by: 'family', source: 'request', request: q.id, months: q.months });
      } else if (RANK[q.state] === 4 && mine && live(e)) {
        deactivate(q.code, q.product);
      }
      if (q.cancel) sends.push(['robot/premium-request/cancel', { id: q.id }]);
    });
    if (changed) writeReqs(l);
    return Promise.all(sends.map(function (x) {
      return net('POST', x[0], x[1]).then(function () { if (/cancel$/.test(x[0])) patchReq(x[1].id, function (q) { delete q.cancel; }); }, function () { /* sent again next time */ });
    })).then(function () { return requests(); });
  }
  var polling = null;
  function poll() {
    if (polling) return polling;
    polling = net('GET', 'robot/premium-requests').then(function (r) {
      polling = null;
      return apply(r && Array.isArray(r.requests) ? r.requests : Array.isArray(r) ? r : []);
    }, function (e) { polling = null; throw e; });
    return polling;
  }
  /* Something to watch on the portal: an open request (often), an active one (now and then). */
  function watching() {
    var l = readReqs(), t = Date.now();
    if (l.some(function (q) { return q.state === 'awaiting_family' || q.state === 'paid' || q.cancel; })) return 15000;
    if (l.some(function (q) { return q.state === 'active' && q.until && Date.parse(q.until) > t; })) return 120000;
    return 0;
  }
  /* Polling runs in a real page only (document.readyState), never in the tests. */
  var timer = null, browser = typeof document !== 'undefined' && typeof document.readyState === 'string' && typeof window !== 'undefined';
  function schedule(ms) {
    if (!browser) return;
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }
  function tick() {
    timer = null;
    var every = watching();
    if (!every) return;
    if (document.visibilityState === 'hidden') { schedule(30000); return; }
    poll().then(function () { schedule(watching() || 120000); }, function () { schedule(60000); });
  }

  /* ---------- the family's gifts (offers of the family portal), per product and resident ---------- */
  /* On for that resident and product only, until the offer's end. What already runs longer (the team's,
     or paid through a request) is kept as it is: the family's months never shorten it. */
  function gift(code, p, offerId, n, until) {
    var c = norm(code), pr = which(p);
    if (!c || !pr || !offerId) return null;
    var cur = entry(c, pr);
    if (cur && cur.source !== 'family' && (!cur.until || !until || Date.parse(cur.until) >= Date.parse(until))) return cur;
    return activate(c, pr, { until: until || null, by: 'family', source: 'family', offer: String(offerId), months: n || 1 });
  }
  /* The offers the portal knows (robot/state): a gift whose offer was stopped, cancelled, ran out or is
     gone (the resident's portal data erased) goes off, for that resident and product only.
     Returns [{ code, product }] of the gifts that ended. Without a list (an older server): nothing. */
  function giftsEnded(offers) {
    if (!Array.isArray(offers)) return [];
    var o = read(), out = [];
    Object.keys(o.residents).forEach(function (c) {
      PRODUCTS.forEach(function (pr) {
        var e = o.residents[c] && o.residents[c][pr];
        if (!e || e.source !== 'family' || !e.offer) return;
        var x = offers.filter(function (f) { return f && String(f.id) === e.offer; })[0];
        var ended = !x || x.state === 'stopped' || x.state === 'expired' || x.state === 'cancelled' || !live(e);
        if (ended) { deactivate(c, pr); out.push({ code: c, product: pr }); }
      });
    });
    return out;
  }

  /* ---------- start ---------- */
  try {
    /* The device-wide key of 1.14 unlocks nobody: Premium is per resident only. */
    if (getRaw(LEGACY) === 'on') { setRaw(LEGACY, null); setRaw(LEGACY_PLAN, null); }
  } catch (e) { /* storage blocked: nothing to migrate */ }
  try {
    /* A change made on the other page (Care Team or patient screen) fires the same event here. */
    window.addEventListener('storage', function (e) {
      if (e.key === KEY || e.key === V2 || e.key === ASKS || e.key === LEGACY_ASK || e.key === REQS) fire();
      if (e.key === REQS && !timer) schedule(2000);
    });
  } catch (e) { /* no window events (tests) */ }
  if (browser) {
    schedule(2500);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && watching()) schedule(500); });
  }

  return {
    KEY: KEY, EVENT: EVENT, PRODUCTS: PRODUCTS.slice(), STATES: STATES.slice(),
    norm: norm, product: product, months: months, config: cfg,
    entry: entry, stored: stored, isOn: isOn, activate: activate, deactivate: deactivate, stop: stop, list: list, listAll: listAll,
    ask: ask, asked: asked, asks: asks, unask: unask,
    requests: requests, requestFor: requestFor, openRequest: openRequest, seen: seen,
    authorise: authorise, cancel: cancel, poll: poll, apply: apply,
    gift: gift, giftsEnded: giftsEnded,
    monthsFromNow: monthsFromNow, addMonths: addMonths, untilAfter: untilAfter,
    _transport: function (fn) { transport = fn || null; }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Premium;
