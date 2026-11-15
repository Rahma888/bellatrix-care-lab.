/* Bellatrix Premium v3, PER RESIDENT AND PER PRODUCT (1.16, 10 Nov 2026): js/premium.js, the prices of
   js/premium-config.js, the team flow with the family portal (a fake portal here), the family gifts and
   the Care Team's Premium window (js/library.js), without a browser. Persistence: another resident and
   back, a reload (a new instance on the same storage), a language change.
   Run: node tests/premium.test.mjs. Silent: nothing here plays a sound. Synthetic data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 3600 * 1000;
function memoryStorage(init) {
  const m = { ...(init || {}) };
  return {
    m,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] === undefined ? null : Object.keys(m)[i],
    get length() { return Object.keys(m).length; }
  };
}
/* The browser files, run as the pages run them. extra: more globals (a tiny DOM, Lab, ST). */
function load(files, storage, extra) {
  const events = [];
  const ctx = { console, Date, Math, JSON, Promise, Intl, setTimeout, clearTimeout, localStorage: storage || memoryStorage(), ...(extra || {}) };
  ctx.window = ctx;
  ctx.CustomEvent = function (type) { this.type = type; };
  ctx.addEventListener = () => {};
  ctx.dispatchEvent = (e) => { events.push(e.type); return true; };
  ctx.events = events;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const MODEL = ['js/premium-config.js', 'js/premium.js'];
const V3 = 'bellatrix-premium-v3', V2 = 'bellatrix-premium-v2';
const json = (st, k) => JSON.parse(st.getItem(k) || 'null');
/* Values from the vm context have their own Array and Object: compare them as plain JSON. */
const same = (a, b, msg) => assert.deepEqual(a === undefined ? a : JSON.parse(JSON.stringify(a)), b, msg);

/* A fake family portal: the robot routes of contract 2 (labland/family-portal.mjs), in memory. */
function fakePortal(opts) {
  opts = opts || {};
  const reqs = {}, calls = [];
  let n = 0;
  const families = new Set(opts.families || ['P1', 'P2', 'P3']);
  function transport(method, p, body) {
    calls.push([method, p, body ? JSON.parse(JSON.stringify(body)) : null]);
    if (opts.down) return Promise.reject(Object.assign(new Error('Failed to fetch'), { code: '' }));
    if (method === 'POST' && p === 'robot/premium-request') {
      const code = String(body.code).toUpperCase();
      if (!families.has(code)) return Promise.reject(Object.assign(new Error('no-family'), { code: 'no-family', status: 409 }));
      const open = Object.values(reqs).find((q) => q.code === code && q.product === body.product && (q.state === 'awaiting_family' || q.state === 'paid'));
      if (open) return Promise.resolve({ ok: true, existing: true, request: { ...open } });
      const q = { id: 'R' + (++n), code, product: body.product, months: body.months, state: 'awaiting_family', at: new Date().toISOString(), updatedAt: new Date().toISOString() };
      reqs[q.id] = q;
      return Promise.resolve({ ok: true, request: { ...q } });
    }
    if (method === 'GET' && p === 'robot/premium-requests') return Promise.resolve({ requests: Object.values(reqs).map((q) => ({ ...q })) });
    if (method === 'POST' && p === 'robot/premium-request/active') { const q = reqs[body.id]; if (q) { q.state = 'active'; q.until = body.until; } return Promise.resolve({ ok: true }); }
    if (method === 'POST' && p === 'robot/premium-request/cancel') { const q = reqs[body.id]; if (q) { q.state = 'expired'; q.endedBy = 'team'; } return Promise.resolve({ ok: true }); }
    if (method === 'POST' && p === 'robot/offer') return Promise.resolve({ ok: true });
    return Promise.reject(Object.assign(new Error('not-found'), { code: 'not-found' }));
  }
  /* The family's side: pay (simulated), refuse, stop. */
  const family = {
    pay(id) { reqs[id].state = 'paid'; reqs[id].paidAt = new Date().toISOString(); },
    refuse(id) { reqs[id].state = 'refused'; },
    stop(id) { reqs[id].state = 'expired'; reqs[id].endedBy = 'family'; }
  };
  return { transport, calls, reqs, family, families };
}

/* ---------- the model ---------- */
test('two products per resident: Play never implies Books, and the reverse', () => {
  const st = memoryStorage();
  const { Premium, events } = load(MODEL, st);
  same(Premium.PRODUCTS, ['play', 'books']);
  assert.equal(Premium.isOn('P1', 'play'), false); assert.equal(Premium.isOn('P1', 'books'), false);
  const e = Premium.activate('p1', 'play', { until: Premium.monthsFromNow(3), by: 'AB', source: 'team', months: 3 });
  assert.equal(e.source, 'team'); assert.equal(e.by, 'AB'); assert.equal(e.months, 3);
  assert.equal(Premium.isOn('P1', 'play'), true);
  assert.equal(Premium.isOn(' p1 ', 'PLAY'), true, 'codes and products are trimmed and not case-sensitive');
  assert.equal(Premium.isOn('P1', 'books'), false, 'Play never implies Books');
  assert.equal(Premium.isOn('P2', 'play'), false, 'per resident');
  assert.ok(events.includes('bellatrix-play-premium'), 'every change fires the event');
  Premium.activate('P2', 'books', { until: Premium.monthsFromNow(1) });
  assert.equal(Premium.isOn('P2', 'books'), true);
  assert.equal(Premium.isOn('P2', 'play'), false, 'Books never implies Play');
  same(Premium.list('play').map((x) => x.code), ['P1']);
  same(Premium.list('books').map((x) => x.code), ['P2']);
  same(Premium.listAll().map((x) => x.code + ':' + x.product), ['P1:play', 'P2:books']);
  /* turning one off leaves the other */
  Premium.activate('P1', 'books', { until: null });
  assert.equal(Premium.deactivate('P1', 'play'), true);
  assert.equal(Premium.isOn('P1', 'play'), false); assert.equal(Premium.isOn('P1', 'books'), true, 'Books stays');
  assert.equal(Premium.deactivate('P1', 'play'), false, 'nothing left to turn off');
  assert.equal(Premium.isOn('P1', 'music'), false, 'an unknown product is never on');
  assert.equal(Premium.activate('P1', 'music'), null);
  assert.equal(Premium.isOn('', 'play'), false); assert.equal(Premium.isOn(null, 'books'), false);
  const until = Date.parse(Premium.entry('P2', 'books').until);
  assert.ok(until > Date.now() + 27 * DAY && until < Date.now() + 32 * DAY, 'about one month');
});

test('end dates: an entry past its end is off; stored() still knows it; until null = no end', () => {
  const { Premium } = load(MODEL, memoryStorage());
  Premium.activate('P1', 'books', { until: new Date(Date.now() - 1000).toISOString() });
  Premium.activate('P4', 'books', { until: null });
  assert.equal(Premium.isOn('P1', 'books'), false); assert.equal(Premium.entry('P1', 'books'), null);
  assert.ok(Premium.stored('P1', 'books'), 'still stored, to know where it came from');
  assert.equal(Premium.isOn('P4', 'books'), true);
  same(Premium.list('books').map((x) => x.code), ['P4']);
  /* a new subscription starts after the end of the one running */
  Premium.activate('P5', 'play', { until: Premium.monthsFromNow(2) });
  const after = Date.parse(Premium.untilAfter('P5', 'play', 1));
  assert.ok(after - Date.now() > 85 * DAY && after - Date.now() < 95 * DAY);
});

test('1.15 callers: no product = Play; activate(code, "team-3") = Play with that plan', () => {
  const { Premium } = load(MODEL, memoryStorage());
  const e = Premium.activate('P1', 'team-3', { until: Premium.monthsFromNow(3), source: 'team' });
  assert.equal(e.plan, 'team-3'); assert.equal(e.months, 3);
  assert.equal(Premium.isOn('P1'), true); assert.equal(Premium.isOn('P1', 'play'), true); assert.equal(Premium.isOn('P1', 'books'), false);
  same(Premium.list().map((x) => x.code), ['P1']);
  assert.equal(Premium.entry('P1').plan, 'team-3');
  assert.equal(Premium.deactivate('P1'), true);
  assert.equal(Premium.isOn('P1', 'play'), false);
});

test('migration: v2 (Play only) becomes Play; never Books; v2 stays a mirror; an outside v2 change is followed', () => {
  const until = new Date(Date.now() + 40 * DAY).toISOString();
  const st = memoryStorage({ [V2]: JSON.stringify({ residents: { P2: { plan: 'family-3', since: '2026-11-01T00:00:00Z', until, by: 'family', source: 'family', offer: 'o1' }, p3: { plan: 'team-1', until: null, source: 'team' } } }),
    'bellatrix-play-premium': 'on', 'bellatrix-play-premium-plan': 'home' });
  const { Premium } = load(MODEL, st);
  assert.equal(st.getItem('bellatrix-play-premium'), null, 'the device-wide key of 1.14 is dropped');
  assert.equal(st.getItem('bellatrix-play-premium-plan'), null);
  assert.equal(Premium.isOn('P2', 'play'), true); assert.equal(Premium.isOn('P3', 'play'), true);
  assert.equal(Premium.isOn('P2', 'books'), false, 'v2 never gives Books');
  assert.equal(Premium.entry('P2', 'play').offer, 'o1'); assert.equal(Premium.entry('P2', 'play').source, 'family');
  assert.equal(st.getItem(V3), null, 'reading changes nothing in the storage');
  /* the first write keeps both: v3 (truth) and v2 (the Play mirror for the 1.15 readers) */
  Premium.activate('P1', 'books', { until: null });
  same(Object.keys(json(st, V3).residents).sort(), ['P1', 'P2', 'P3']);
  same(Object.keys(json(st, V2).residents).sort(), ['P2', 'P3'], 'v2 mirrors Play only');
  Premium.activate('P4', 'play', { until: null });
  same(Object.keys(json(st, V2).residents).sort(), ['P2', 'P3', 'P4']);
  /* an older page (or the demo) writes v2: Play follows; Books stays */
  st.setItem(V2, JSON.stringify({ residents: { D1: { plan: 'month', until: null, source: 'team' } } }));
  same(Premium.list('play').map((x) => x.code), ['D1']);
  assert.equal(Premium.isOn('P1', 'books'), true);
  st.removeItem(V2);
  same(Premium.list('play'), [], 'v2 removed outside: Play off');
  assert.equal(Premium.isOn('P1', 'books'), true, 'Books never follows v2');
});

/* ---------- persistence (the brief, I) ---------- */
test('persistence: P2 has Play Premium -> P1 (none) -> back to P2: still active; after a reload too', () => {
  const st = memoryStorage();
  let { Premium } = load(MODEL, st);
  Premium.activate('P2', 'play', { until: Premium.monthsFromNow(1), source: 'team', by: 'AB' });
  /* the patient screen opens P1 (no Premium), then P2 again */
  assert.equal(Premium.isOn('P1', 'play'), false, 'P1: none');
  assert.equal(Premium.isOn('P2', 'play'), true, 'back to P2: still active');
  /* a reload of the app or the robot: a new instance on the same storage */
  ({ Premium } = load(MODEL, st));
  assert.equal(Premium.isOn('P2', 'play'), true, 'after a reload: still active');
  assert.equal(Premium.isOn('P1', 'play'), false);
  assert.equal(Premium.isOn('P2', 'books'), false, 'Play still does not imply Books');
  /* Books for P1 does not change P2's Play, before or after another reload */
  Premium.activate('P1', 'books', { until: Premium.monthsFromNow(3) });
  ({ Premium } = load(MODEL, st));
  assert.equal(Premium.isOn('P2', 'play'), true); assert.equal(Premium.isOn('P1', 'books'), true);
  assert.equal(Premium.isOn('P1', 'play'), false); assert.equal(Premium.isOn('P2', 'books'), false);
});

/* ---------- a resident asks ---------- */
test('asks per resident and product; the 1.15 request key mirrors the latest Play ask', () => {
  const st = memoryStorage();
  const { Premium } = load(MODEL, st);
  same(Premium.ask('P2', 'books', Date.UTC(2026, 10, 10, 9)), { code: 'P2', product: 'books', at: '2026-11-10T09:00:00.000Z' });
  assert.equal(Premium.asked('P2', 'books'), true); assert.equal(Premium.asked('P2', 'play'), false, 'asking Books is not asking Play');
  assert.equal(st.getItem('bellatrix-play-premium-request'), null, 'the 1.15 key carries Play asks only');
  Premium.ask('P3', 'play', Date.UTC(2026, 10, 10, 10));
  same(json(st, 'bellatrix-play-premium-request'), { patient: 'P3', at: '2026-11-10T10:00:00.000Z' });
  same(Premium.asks().map((a) => a.code + ':' + a.product), ['P2:books', 'P3:play'], 'oldest first');
  same(Premium.asks('books').map((a) => a.code), ['P2']);
  /* an older page (1.15 Play) writes the old key: a Play ask */
  st.setItem('bellatrix-play-premium-request', JSON.stringify({ patient: 'P5', at: '2026-11-10T11:00:00Z' }));
  assert.equal(Premium.asked('P5', 'play'), true);
  same(Premium.asks().map((a) => a.code), ['P2', 'P3', 'P5']);
  /* the old key cleared outside (an older page): that ask goes, the others stay */
  st.removeItem('bellatrix-play-premium-request');
  same(Premium.asks().map((a) => a.code + ':' + a.product), ['P2:books', 'P3:play']);
  /* switching on that product answers the ask; the other product's ask stays */
  Premium.ask('P2', 'play');
  Premium.activate('P2', 'books', { until: null });
  assert.equal(Premium.asked('P2', 'books'), false); assert.equal(Premium.asked('P2', 'play'), true);
  assert.equal(Premium.ask('P2', 'books'), null, 'nothing to ask when it is on');
  assert.equal(Premium.unask('P2'), true, 'without a product: every product of P2');
  same(Premium.asks().map((a) => a.code), ['P3']);
});

/* ---------- the team flow with the family portal (contract 2) ---------- */
test('team OK -> request to the family -> waiting -> paid -> active for THAT resident and product only', async () => {
  const st = memoryStorage();
  const { Premium } = load(MODEL, st);
  const portal = fakePortal();
  Premium._transport(portal.transport);
  Premium.activate('P2', 'play', { until: Premium.monthsFromNow(1), source: 'team' });
  Premium.ask('P2', 'books');
  const q = await Premium.authorise('P2', 'books', 3, { by: 'AB' });
  same(portal.calls[0], ['POST', 'robot/premium-request', { code: 'P2', product: 'books', months: 3 }]);
  assert.equal(q.state, 'awaiting_family'); assert.equal(q.code, 'P2'); assert.equal(q.product, 'books'); assert.equal(q.months, 3);
  assert.equal(Premium.asked('P2', 'books'), false, 'the ask is answered');
  same(Premium.requests().map((x) => [x.code, x.product, x.state]), [['P2', 'books', 'awaiting_family']]);
  assert.ok(Premium.openRequest('P2', 'books'));
  /* asking again does not send a second request */
  await Premium.authorise('P2', 'books', 3);
  assert.equal(Object.keys(portal.reqs).length, 1);
  /* nothing yet: the family has not paid */
  await Premium.poll();
  assert.equal(Premium.isOn('P2', 'books'), false);
  /* the family pays on the simulated form; the robot polls and switches it on */
  portal.family.pay(q.id);
  await Premium.poll();
  assert.equal(Premium.isOn('P2', 'books'), true, 'Books on for P2');
  assert.equal(Premium.isOn('P1', 'books'), false, 'not for P1');
  assert.ok(Date.parse(Premium.entry('P2', 'play').until) < Date.now() + 32 * DAY, 'P2\'s Play is unchanged');
  const e = Premium.entry('P2', 'books');
  assert.equal(e.source, 'request'); assert.equal(e.request, q.id); assert.equal(e.by, 'family');
  assert.ok(Date.parse(e.until) - Date.now() > 85 * DAY, 'three months');
  const r = Premium.requests()[0];
  assert.equal(r.state, 'active'); assert.equal(r.seen, false, 'news for the team');
  assert.equal(portal.reqs[q.id].state, 'active', '"active" is sent back to the portal');
  /* a second poll changes nothing (no double months) */
  const before = e.until;
  await Premium.poll();
  assert.equal(Premium.entry('P2', 'books').until, before);
  Premium.seen(q.id);
  assert.equal(Premium.requests()[0].seen, true);
  /* the family stops it later: off for P2's Books only */
  portal.family.stop(q.id);
  await Premium.poll();
  assert.equal(Premium.isOn('P2', 'books'), false);
  assert.equal(Premium.isOn('P2', 'play'), true, 'Play stays');
  assert.equal(Premium.requests()[0].state, 'expired');
});

test('the family refuses; the team cancels; states only move forward', async () => {
  const st = memoryStorage();
  const { Premium } = load(MODEL, st);
  const portal = fakePortal();
  Premium._transport(portal.transport);
  const a = await Premium.authorise('P1', 'play', 1);
  portal.family.refuse(a.id);
  await Premium.poll();
  assert.equal(Premium.requestFor('P1', 'play').state, 'refused');
  assert.equal(Premium.isOn('P1', 'play'), false);
  /* the team takes a request back: expired, sent to the portal; a late payment changes nothing */
  const b = await Premium.authorise('P3', 'books', 12);
  await Premium.cancel(b.id);
  assert.equal(Premium.requestFor('P3', 'books').state, 'expired');
  assert.equal(portal.reqs[b.id].state, 'expired');
  portal.reqs[b.id].state = 'paid';
  await Premium.poll();
  assert.equal(Premium.isOn('P3', 'books'), false, 'what the team ended stays ended');
  assert.equal(Premium.requestFor('P3', 'books').state, 'expired');
});

test('without a family account or a portal: a clear error, nothing stays waiting', async () => {
  const st = memoryStorage();
  const { Premium } = load(MODEL, st);
  Premium._transport(fakePortal({ families: [] }).transport);
  await assert.rejects(Premium.authorise('P1', 'play', 1), (e) => e.code === 'no-family');
  same(Premium.requests(), []);
  Premium._transport(fakePortal({ down: true }).transport);
  await assert.rejects(Premium.authorise('P1', 'books', 1), (e) => e.code === 'no-server');
  same(Premium.requests(), []);
  Premium._transport(null);
  await assert.rejects(Premium.authorise('P1', 'books', 1), (e) => e.code === 'no-server', 'no FamilyMessages: no server');
  assert.equal(Premium.isOn('P1', 'play'), false); assert.equal(Premium.isOn('P1', 'books'), false);
});

test('a robot whose storage was reset gets the active request back from the portal', async () => {
  const portal = fakePortal();
  const first = load(MODEL, memoryStorage()).Premium;
  first._transport(portal.transport);
  const q = await first.authorise('P2', 'play', 1);
  portal.family.pay(q.id);
  await first.poll();
  const fresh = load(MODEL, memoryStorage()).Premium;
  fresh._transport(portal.transport);
  await fresh.poll();
  assert.equal(fresh.isOn('P2', 'play'), true);
  assert.equal(fresh.requests()[0].seen, true, 'not news: it was active before');
  assert.equal(fresh.isOn('P2', 'books'), false);
});

/* ---------- family gifts (portal offers), per product and resident ---------- */
test('family gifts: per product and per resident; the end turns off that product of that resident only', () => {
  const st = memoryStorage();
  const { Premium } = load(MODEL, st);
  const until = Premium.monthsFromNow(3);
  Premium.activate('P3', 'books', { until: Premium.monthsFromNow(1), source: 'team' });
  const e = Premium.gift('P1', 'books', 'offerB', 3, until);
  assert.equal(e.source, 'family'); assert.equal(e.offer, 'offerB'); assert.equal(e.until, until);
  assert.equal(Premium.isOn('P1', 'books'), true);
  assert.equal(Premium.isOn('P1', 'play'), false, 'a Books gift is not Play');
  assert.equal(Premium.isOn('P2', 'books'), false, 'the family of P1 gives to P1 only');
  Premium.gift('P1', 'play', 'offerP', 1, Premium.monthsFromNow(1));
  assert.equal(Premium.isOn('P1', 'play'), true);
  /* the server still says active: nothing changes */
  same(Premium.giftsEnded([{ id: 'offerB', state: 'active' }, { id: 'offerP', state: 'active' }]), []);
  /* the family stops the Books gift: P1's Books off; P1's Play and P3's Books stay */
  same(Premium.giftsEnded([{ id: 'offerB', state: 'stopped' }, { id: 'offerP', state: 'active' }]), [{ code: 'P1', product: 'books' }]);
  assert.equal(Premium.isOn('P1', 'books'), false); assert.equal(Premium.isOn('P1', 'play'), true); assert.equal(Premium.isOn('P3', 'books'), true);
  /* an older server without an offer list: nothing ends */
  same(Premium.giftsEnded(undefined), []);
  /* the offer gone from the server (the resident's portal data erased) counts as ended */
  same(Premium.giftsEnded([]), [{ code: 'P1', product: 'play' }]);
  /* a longer team subscription is kept: the family's months never shorten it */
  const team = Premium.activate('P4', 'play', { until: Premium.monthsFromNow(12), source: 'team', by: 'AB' });
  assert.equal(Premium.gift('P4', 'play', 'offerC', 3, Premium.monthsFromNow(3)).source, 'team');
  same(Premium.giftsEnded([{ id: 'offerC', state: 'stopped' }]), []);
  assert.equal(Premium.entry('P4', 'play').until, team.until);
});

test('the 1.15 family offer path (js/messages.js) still lands on Play only', () => {
  const st = memoryStorage();
  const { Premium, FamilyMessages: FM } = load(MODEL.concat(['js/messages.js']), st);
  const until = Premium.monthsFromNow(3);
  FM.startFamilyPremium('P1', 'offerA', 3, until);
  assert.equal(Premium.isOn('P1', 'play'), true);
  assert.equal(Premium.isOn('P1', 'books'), false);
  assert.equal(Premium.entry('P1', 'play').offer, 'offerA');
});

/* ---------- the Care Team's Premium window (js/library.js) ---------- */
function staffPage(st, lang) {
  const nodes = {};
  const el = () => {
    const n = { attrs: {}, html: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, parentNode: { removeChild() { delete nodes.premiumModal; } } };
    n.firstChild = { innerHTML: '' };
    Object.defineProperty(n, 'innerHTML', { get() { return this.html; }, set(v) { this.html = v; } });
    return n;
  };
  const document = {
    addEventListener() {},
    getElementById: (id) => nodes[id] || null,
    createElement: () => el(),
    body: { appendChild: (n) => { nodes.premiumModal = n; } }
  };
  nodes.fParticipant = { value: 'P1' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ctx = load(['js/i18n.js'], st, { document, navigator: { language: lang || 'en' }, sessionStorage: memoryStorage(), Lab: { esc } });
  for (const f of ['js/i18n-staff.js', 'js/premium-config.js', 'js/premium.js', 'js/library.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.modal = () => (nodes.premiumModal ? nodes.premiumModal.firstChild.innerHTML : '');
  ctx.nodes = nodes;
  return ctx;
}
const care = (codes) => JSON.stringify({ patients: Object.fromEntries(codes.map((c) => [c, {}])) });

test('prices come only from js/premium-config.js; families see the price, the payment is simulated (BF-24)', async () => {
  const st = memoryStorage({ 'bellatrix-care-lab-v1': care(['P1', 'P2', 'P3']), 'bellatrix-staff-initials': 'AB' });
  const { PlayPremium: PP, Premium, PREMIUM_CONFIG: C } = staffPage(st);
  assert.equal(C.pilotFree, false, 'families see the real price (Rahma, 10 Nov)');
  assert.equal(C.testPayment, true, 'the payment is simulated: nothing is debited');
  same(C.months, [1, 3, 12]);
  assert.equal(C.products.play.monthCents, 1099); assert.equal(C.products.books.monthCents, 1099);
  same(PP.PLANS.map((p) => [p.id, p.months]), [['team-1', 1], ['team-3', 3], ['team-12', 12]]);
  assert.equal(PP.CENTS, C.products.play.monthCents);
  assert.equal(PP.total(PP.PLANS[1], 'play'), '€32.97', 'the demo total, computed from the configuration');
  assert.equal(PP.priceLabel(PP.PLANS[1], 'books'), '€32.97', 'the price shown comes from the configuration');
  C.products.books.monthCents = 500;
  assert.equal(PP.price('books'), '€5.00', 'one line in the configuration changes the demo price');
  assert.equal(PP.priceLabel(PP.PLANS[0], 'books'), '€5.00');
  C.pilotFree = true;
  assert.equal(PP.priceLabel(PP.PLANS[0], 'books'), '€0.00', 'pilotFree true still shows 0 everywhere');
  C.pilotFree = false;
  same(PP.residents(), ['P1', 'P2', 'P3']);
  assert.equal(PP.on(), false, 'never on for "everyone"');
  /* the team's own demo payment (the fallback) */
  const e = await PP.activate('team-3', 'P2', 'books');
  assert.equal(e.source, 'team'); assert.equal(e.by, 'AB'); assert.equal(e.months, 3);
  assert.equal(PP.on('P2', 'books'), true); assert.equal(PP.on('P2', 'play'), false);
  const before = Date.parse(Premium.entry('P2', 'books').until);
  await PP.activate('team-1', 'P2', 'books');
  assert.ok(Date.parse(Premium.entry('P2', 'books').until) - before > 27 * DAY, 'one more month after the end');
  await PP.deactivate('P2', 'books');
  assert.equal(PP.on('P2', 'books'), false);
  await assert.rejects(PP.activate('team-1', '', 'play'), /Choose a resident/);
});

test('no Premium price is written anywhere else in js/', () => {
  const dir = path.join(ROOT, 'js');
  /* staff-tools.js (agent T, the demo's fake portal answer) is reported to its owner: it must read PREMIUM_CONFIG. */
  const skip = ['premium-config.js', 'staff-tools.js'];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && !skip.includes(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const re of [/\b1099\b/, /10[,.]99/, /\b3297\b/, /\b13188\b/, /32[,.]97/, /131[,.]88/]) assert.ok(!re.test(src), f + ' has a hard-coded price ' + re);
  }
});

test('the window: resident and product named, both subscriptions with their state, Authorise, the price, simulated payment, no card field', () => {
  const st = memoryStorage({ 'bellatrix-care-lab-v1': care(['P1', 'P2']), 'bellatrix-staff-lang': 'fr' });
  const { PlayPremium: PP, Premium, modal } = staffPage(st, 'fr');
  Premium.ask('P2', 'books');
  PP.open({ patient: 'P2', product: 'books' });
  let h = modal();
  assert.match(h, /Livres Premium pour P2/);
  assert.match(h, /<option value="P2" selected>/);
  assert.match(h, /Demandé par P2/);
  assert.match(h, /data-pm="authorise"[^>]*>Autoriser</);
  assert.match(h, /La famille reçoit une demande de paiement/);
  assert.match(h, /1 mois/); assert.match(h, /3 mois/); assert.match(h, /12 mois/);
  assert.match(h, /10,99\s€/); assert.match(h, /32,97\s€/); assert.match(h, /131,88\s€/);
  assert.match(h, /Démonstration : aucun paiement ne sera effectué\./, 'the payment is simulated, and the window says so');
  assert.ok(!/Gratuit pendant le pilote/.test(h), 'families pay: the window does not say free');
  /* BF-20: the two subscriptions of P2, each with its state */
  assert.match(h, /data-product="play"[^]*?<strong>Musique<\/strong><small>Non actif<\/small>/);
  assert.match(h, /data-product="books"[^]*?<strong>Livres<\/strong><small>Non actif<\/small>/);
  assert.match(h, /data-product="play"/); assert.match(h, /data-product="books"/);
  assert.ok(!/<input/.test(h), 'no card field');
  PP.close();
  /* from the Library: Play, the resident chosen in Activities (P1, none yet) */
  PP.open();
  assert.match(modal(), /Bellatrix Play Premium pour P1/);
  PP.close();
  Premium.activate('P1', 'play', { until: Premium.monthsFromNow(1) });
  PP.open();
  assert.match(modal(), /Bellatrix Play Premium pour P2/, 'P1 has Play: the first resident without it');
  PP.close();
  PP.open({ product: 'books' });
  assert.match(modal(), /Livres Premium pour P1/, 'P1 has Play, not Books');
  assert.match(modal(), /<strong>Musique<\/strong><small>Actif jusqu’au /);
  assert.match(modal(), /<strong>Livres<\/strong><small>Non actif<\/small>/);
  PP.close();
});

test('the window shows the states: waiting for the family (with Cancel); no family account: the team demo payment', async () => {
  const st = memoryStorage({ 'bellatrix-care-lab-v1': care(['P1', 'P2']), 'bellatrix-staff-lang': 'en' });
  const { PlayPremium: PP, Premium, modal } = staffPage(st, 'en');
  const portal = fakePortal({ families: ['P2'] });
  Premium._transport(portal.transport);
  await PP.authorise('P2', 'play', 3);
  PP.open({ patient: 'P2', product: 'play' });
  let h = modal();
  assert.match(h, /Waiting for the family/);
  assert.match(h, /data-pm="cancel"/);
  assert.ok(!/data-pm="authorise"/.test(h), 'no second request while one waits');
  PP.close();
  portal.family.pay(Object.keys(portal.reqs)[0]);
  await Premium.poll();
  PP.open({ patient: 'P2', product: 'play' });
  assert.match(modal(), /✓ Active until/);
  PP.close();
  /* P1 has no family account: the window says so and offers the team's demo payment */
  await assert.rejects(PP.authorise('P1', 'books', 1), (e) => e.code === 'no-family');
  assert.equal(PP.stateLabel({ state: 'refused' }), 'Refused by the family');
  assert.equal(PP.stateLabel({ state: 'awaiting_family' }), 'Waiting for the family');
});

test('persistence in Care Team: P2 active -> P1 chosen -> P2 again; after a reload and a language change', () => {
  const st = memoryStorage({ 'bellatrix-care-lab-v1': care(['P1', 'P2']), 'bellatrix-staff-lang': 'en' });
  let page = staffPage(st, 'en');
  page.Premium.activate('P2', 'play', { until: page.Premium.monthsFromNow(1), source: 'team' });
  page.PlayPremium.open({ patient: 'P2' });
  assert.match(page.modal(), /✓ Active until/);
  page.PlayPremium.close();
  page.nodes.fParticipant.value = 'P1';
  page.PlayPremium.open({ patient: 'P1' });
  assert.ok(!/✓ Active until/.test(page.modal()), 'P1: none');
  page.PlayPremium.close();
  page.nodes.fParticipant.value = 'P2';
  page.PlayPremium.open({ patient: 'P2' });
  assert.match(page.modal(), /✓ Active until/, 'back to P2: still active');
  page.PlayPremium.close();
  /* the language changes: the page opens again in German, same storage */
  page.ST.setLang('de');
  page = staffPage(st, 'de');
  assert.equal(page.ST.lang(), 'de');
  page.PlayPremium.open({ patient: 'P2' });
  assert.match(page.modal(), /Bellatrix Play Premium für P2/);
  assert.match(page.modal(), /✓ Aktiv bis/, 'after a language change: still active');
  page.PlayPremium.close();
  page.PlayPremium.open({ patient: 'P2', product: 'books' });
  assert.ok(!/✓ Aktiv bis/.test(page.modal()), 'Books is not on for P2');
  assert.equal(page.Premium.isOn('P2', 'play'), true);
});

test('nothing outside Play and Reco reads the old device-wide key; the plan key is gone', () => {
  const dir = path.join(ROOT, 'js');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f !== 'premium.js') assert.ok(!src.includes("'bellatrix-play-premium-plan'"), f + ': the plan key is gone');
    if (['premium.js', 'play.js', 'reco.js'].includes(f)) continue;
    const reads = src.split('\n').filter((l) => /'bellatrix-play-premium'/.test(l) && !/addEventListener|CustomEvent|removeItem/.test(l));
    same(reads, [], f + ' still reads bellatrix-play-premium');
  }
});

test('i18n: the Premium texts of 1.16 have French and German', () => {
  const st = memoryStorage();
  const ctx = load(['js/i18n.js'], st, { navigator: { language: 'en' }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/i18n-staff.js'), 'utf8'), ctx);
  const keys = ['Books Premium', 'Books', '{n} months', 'Not active', '{product} for {code}', 'Authorise', 'The family gets a payment request.',
    'Free during the pilot.', 'Sent to the family', 'Waiting for the family', 'Paid by the family', 'Premium active',
    'Refused by the family', 'Expired', 'Cancel the request', 'No family account for {code}.', 'The family portal does not answer.', 'Team payment (demo)',
    '{product} is active for {who} until {date}.', '{product} is active for {who}.', 'paid by the family', 'Requests', 'Turn off {product} for {code}?', '{product} is off for {code}.',
    '{who} would like {product}', '{code} · {product}: paid by the family, now active', '{code} · {product}: refused by the family', '{code} · {product}: expired',
    'The family of {code} offered {product}', 'The {product} offered by the family of {code} has ended.',
    'No ads', 'Offline listening', 'Listen together', 'Premium books', 'Resume where you stopped', 'Favourite books',
    'No ads, offline listening, listen together.', 'The Premium books, page by page.',
    'How long?', '1 month', '3 months', '12 months', 'Active for {codes}', 'Get for a resident', 'No resident has Premium yet.', 'until {date}', 'Active for'];
  for (const l of ['fr', 'de']) for (const k of keys) assert.ok(Object.prototype.hasOwnProperty.call(ctx.I18N.dict[l], k), l + ': ' + k);
  /* the product texts of the configuration are translated too */
  const C = load(['js/premium-config.js'], memoryStorage()).PREMIUM_CONFIG;
  for (const p of Object.values(C.products)) for (const k of [p.name, p.short, p.tagline, p.about].concat(p.benefits)) for (const l of ['fr', 'de']) assert.ok(k in ctx.I18N.dict[l], l + ': ' + k);
  assert.equal(ctx.I18N.t('fr', '{who} would like {product}', { who: 'P2', product: 'Livres Premium' }), 'P2 aimerait Livres Premium');
});
