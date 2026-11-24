// The family portal against the "Besoins fonctionnels – Portail famille" spec (BF items owned by agent M):
// BF-01 to 04 (PWA, accounts, links, access), 10 to 16 (messages and album), 20 to 24 and 28 (Premium),
// 27 (consent). Run: node tests/portal.test.mjs. Silent, synthetic data, a temporary folder only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPortal, setNotifier, authFamily, linkedResidents, consentLevel, registerRoutes } from '../labland/family-portal.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-bf-'));
let clock = Date.parse('2026-11-11T09:00:00Z');
const portal = createPortal({ dataDir: path.join(TMP, 'portal'), now: () => clock, log: () => {}, rateLimit: false });
const events = [];
setNotifier((pid, ev) => { events.push(Object.assign({ pid }, ev)); });
const server = http.createServer((req, res) => { const url = new URL(req.url, 'http://localhost'); if (url.pathname.startsWith('/portal/api/')) portal.handle(req, res, url); else { res.writeHead(404); res.end(); } });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port + '/portal/api/';

async function call(method, p, body, auth, extra) {
  const headers = Object.assign({}, (extra && extra.headers) || {});
  if (auth) headers.Authorization = auth;
  let payload;
  if (extra && extra.raw) { payload = extra.raw; headers['Content-Type'] = extra.type; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASE + p, { method, headers, body: payload });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, data: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), type, headers: r.headers };
}
const ROBOT = 'bf_robot_' + crypto.randomBytes(6).toString('hex'), KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + ROBOT + '.' + KEY;
const B = (t) => 'Bearer ' + t;
const as = (t, rid) => ({ headers: { 'X-Resident': rid } });
function jpeg(w, h) {
  return 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]).toString('base64');
}
const X = {};
/* 14 Nov: every NEW family account waits for the care team's one tap, also with an invitation. The head
   finds it in its pending list (robot/state, status 'pending') and validates it (robot/account/status),
   as js/messages-staff.js does. */
async function validate(email) {
  const st = await call('GET', 'robot/state', undefined, R);
  const acc = st.data.residents.flatMap((r) => r.accounts).find((a) => a.email === email && a.status === 'pending');
  assert.ok(acc, 'waiting in the care team\'s list: ' + email);
  const ok = await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, 'active');
  return acc.id;
}

/* ---------- BF-01: installable PWA, the language changes in the app, every page translated ---------- */
test('BF-01 the portal is an installable PWA (manifest, icons, service worker)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'portail.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, 'portail.html');
  assert.ok(m.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png') && m.icons.some((i) => i.sizes === '512x512'));
  const sw = fs.readFileSync(path.join(ROOT, 'sw-portail.js'), 'utf8');
  assert.match(sw, /addEventListener\('fetch'/);
  const html = fs.readFileSync(path.join(ROOT, 'portail.html'), 'utf8');
  assert.match(html, /rel="manifest" href="portail\.webmanifest"/);
  assert.match(html, /js\/portail\.js/);
});
test('BF-01 every text of the portal exists in French and German; FR / DE / EN switch in the app', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8');
  assert.match(src, /\['fr', 'de', 'en'\]\.map/, 'the language switch is in the app');
  const ctx = { window: {}, navigator: { language: 'fr' }, console };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8') + '\n;this.I18N = I18N;', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n-messages.js'), 'utf8'), ctx);
  /* the translation tables at the top of portail.js */
  const tables = src.slice(src.indexOf('(function () {\n    function addNew'), src.indexOf('  var $ = function (id)'));
  vm.runInContext(tables, ctx);
  const keys = new Set();
  for (const m of src.matchAll(/\bT\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'").replace(/\\u2019/g, '’'));
  for (const m of src.matchAll(/^\s+'[a-z-]+': '((?:[^'\\]|\\.)*)',?$/gm)) keys.add(m[1]);
  for (const m of src.matchAll(/\[\s*'[a-z]+',\s*'((?:[^'\\]|\\.)*)'(?:,\s*(?:ICON\.[a-z]+|'[^']*'))?\s*\]/g)) keys.add(m[1]);
  const words = [...keys].filter((k) => k && /[A-Za-z]/.test(k) && k !== 'Album' && k !== 'Premium' && k !== 'Bellatrix Play Premium' && !/^[a-z-]+$/.test(k));
  const missFr = words.filter((k) => !(k in ctx.I18N.dict.fr)), missDe = words.filter((k) => !(k in ctx.I18N.dict.de));
  assert.deepEqual(missFr, [], 'French missing');
  assert.deepEqual(missDe, [], 'German missing');
  assert.ok(words.length > 150, 'the check sees the portal texts (' + words.length + ')');
});

/* ---------- BF-02: an account by invitation, or made by the team ---------- */
test('BF-02 an invitation link creates an account; the team can also create one by hand', async () => {
  await call('POST', 'robot/hello', { robot: ROBOT, key: KEY });
  X.p1 = (await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R)).data.rid;
  X.p2 = (await call('POST', 'robot/resident', { code: 'P2', label: 'Jean', lang: 'fr' }, R)).data.rid;
  X.p3 = (await call('POST', 'robot/resident', { code: 'P3', label: 'Hans', lang: 'de' }, R)).data.rid;
  const inv = await call('POST', 'robot/invite', { rid: X.p1 }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'sophie@example.test', name: 'Sophie', consent: true, lang: 'fr' });
  assert.equal(reg.status, 200);
  X.sophie = reg.data.token;
  assert.equal(reg.data.me.access, 'access-pending', 'an invitation account waits for the care team too');
  await validate('sophie@example.test');
  assert.equal((await call('GET', 'family/me', undefined, B(X.sophie))).data.access, 'ok', 'validated by the care team: the access is open');
  const team =await call('POST', 'robot/account', { rid: X.p1, email: 'paul@example.test', name: 'Paul', relation: 'fils' }, R);
  assert.equal(team.status, 200);
  const signed = await call('POST', 'family/login/verify', { email: 'paul@example.test', code: team.data.code });
  assert.equal(signed.status, 200);
  X.paul = signed.data.token;
  assert.equal(signed.data.me.needsConsent, true, 'made by the team: the relative consents at the first sign-in');
  assert.equal((await call('POST', 'family/consent', { consent: true }, B(X.paul))).status, 200);
  /* an address that already has an account must sign in first to add a resident */
  const inv2 = await call('POST', 'robot/invite', { rid: X.p2 }, R);
  assert.equal((await call('POST', 'family/register', { code: inv2.data.code, email: 'sophie@example.test', name: 'Sophie', consent: true })).data.error, 'account-exists');
  X.inv2 = inv2.data.code;
});

/* ---------- BF-03: one or several residents, never anyone else's ---------- */
test('BF-03 a relative linked to two residents sees both, and nothing of a third (direct access test)', async () => {
  const link = await call('POST', 'family/link', { code: X.inv2 }, B(X.sophie));
  assert.equal(link.data.rid, X.p2);
  const me = await call('GET', 'family/me', undefined, B(X.sophie));
  assert.deepEqual(me.data.residents.map((r) => r.label).sort(), ['Jean', 'Marie']);
  assert.equal(linkedResidents(me.data.person.id).length, 2);
  /* Paul has a message for P1; Sophie on P2 cannot reach it; nobody reaches P3. */
  const pm = await call('POST', 'family/message', { photo: jpeg(800, 600), text: 'pour Marie' }, B(X.paul));
  X.paulMsg = pm.data.message.id;
  for (const p of ['family/me', 'family/listen', 'family/photo?id=' + X.paulMsg]) {
    const r = await call('GET', p, undefined, B(X.sophie), as(X.sophie, X.p3));
    assert.equal(r.status, p === 'family/me' ? 200 : 403, 'direct access to P3: ' + p);
    if (p === 'family/me') { assert.equal(r.data.resident, null); assert.equal(r.data.access, 'not-linked'); assert.equal(r.data.messages.length, 0); }
  }
  assert.equal((await call('POST', 'family/message', { text: 'intrus' }, B(X.sophie), as(X.sophie, X.p3))).data.error, 'not-linked');
  assert.equal((await call('GET', 'family/photo?id=' + X.paulMsg, undefined, B(X.sophie), as(X.sophie, X.p1))).status, 404, 'another relative\'s photo, same resident: not hers');
  /* the shared authFamily(req) of the other modules says the same */
  assert.equal(authFamily({ headers: { authorization: B(X.sophie), 'x-resident': X.p3 } }), null);
  assert.equal(authFamily({ headers: { authorization: B(X.sophie), 'x-resident': X.p2 } }).code, 'P2');
  assert.equal(authFamily({ headers: { authorization: B('x'.repeat(40)) } }), null);
});

/* ---------- BF-04: validate, suspend, remove; the data stays ---------- */
test('BF-04 suspend or remove an access: lost at the next action, data kept; validate gives it back', async () => {
  const st = await call('GET', 'robot/state', undefined, R);
  const paul = st.data.residents.find((r) => r.code === 'P1').accounts.find((a) => a.name === 'Paul');
  assert.equal(paul.status, 'active');
  assert.equal((await call('POST', 'robot/account/status', { account: paul.id, status: 'suspended' }, R)).status, 200);
  assert.equal((await call('POST', 'family/message', { text: 'encore' }, B(X.paul), as(X.paul, X.p1))).data.error, 'access-suspended');
  assert.equal((await call('GET', 'family/me', undefined, B(X.paul))).data.access, 'access-suspended');
  assert.ok((await call('GET', 'robot/feed', undefined, R)).data.messages.some((m) => m.id === X.paulMsg), 'his message stays');
  assert.equal((await call('POST', 'robot/account/status', { account: paul.id, status: 'active' }, R)).status, 200);
  assert.equal((await call('POST', 'family/message', { text: 'de retour' }, B(X.paul), as(X.paul, X.p1))).status, 200);
  await call('POST', 'robot/account/status', { account: paul.id, status: 'removed' }, R);
  assert.equal((await call('GET', 'family/media?id=' + X.paulMsg, undefined, B(X.paul), as(X.paul, X.p1))).data.error, 'access-removed');
  assert.ok((await call('GET', 'robot/feed', undefined, R)).data.messages.some((m) => m.id === X.paulMsg), 'removed access: data still there');
  await call('POST', 'robot/account/status', { account: paul.id, status: 'active' }, R);
});

/* ---------- BF-10 to 14: four kinds, no approval, team notified, statuses ---------- */
test('BF-10 text, photo, voice and short video are sent and the robot can play them', async () => {
  const H = as(X.sophie, X.p1);
  const t = await call('POST', 'family/message', { text: 'Bonjour Mamie !' }, B(X.sophie), H);
  const p = await call('POST', 'family/message', { photo: jpeg(1200, 900), text: 'Léo' }, B(X.sophie), H);
  const voice = crypto.randomBytes(20000), video = crypto.randomBytes(300000);
  assert.equal((await call('POST', 'family/upload?kind=voice', undefined, B(X.sophie), { headers: H.headers, raw: voice, type: 'application/zip' })).data.error, 'bad-media', 'only audio/video types');
  const uv = await call('POST', 'family/upload?kind=voice', undefined, B(X.sophie), { headers: H.headers, raw: voice, type: 'audio/webm;codecs=opus' });
  assert.equal(uv.status, 200);
  const v = await call('POST', 'family/message', { upload: uv.data.upload, text: '' }, B(X.sophie), H);
  assert.equal(v.data.message.kind, 'voice');
  const uvid = await call('POST', 'family/upload?kind=video', undefined, B(X.sophie), { headers: H.headers, raw: video, type: 'video/mp4' });
  const vd = await call('POST', 'family/message', { upload: uvid.data.upload, text: 'Coucou' }, B(X.sophie), H);
  assert.equal(vd.data.message.kind, 'video');
  assert.equal((await call('POST', 'family/message', { upload: uvid.data.upload }, B(X.sophie), H)).data.error, 'bad-media', 'an upload is used once');
  X.ids = { text: t.data.message.id, photo: p.data.message.id, voice: v.data.message.id, video: vd.data.message.id };
  const feed = await call('GET', 'robot/feed', undefined, R);
  for (const k of ['text', 'photo', 'voice', 'video']) assert.equal(feed.data.messages.find((m) => m.id === X.ids[k]).kind, k);
  const a = await call('GET', 'robot/media?id=' + X.ids.voice, undefined, R);
  assert.equal(a.type, 'audio/webm');
  assert.equal(a.data.length, voice.length);
  const part = await call('GET', 'robot/media?id=' + X.ids.video, undefined, R, { headers: { Range: 'bytes=0-99' } });
  assert.equal(part.status, 206, 'video with HTTP ranges (seeking)');
  assert.equal(part.data.length, 100);
});
test('BF-11 no approval: every message is on the robot at once', async () => {
  const feed = await call('GET', 'robot/feed', undefined, R);
  for (const k of Object.keys(X.ids)) assert.equal(feed.data.messages.find((m) => m.id === X.ids[k]).status, 'sent');
  assert.equal(fs.readFileSync(path.join(ROOT, 'labland', 'family-portal.mjs'), 'utf8').includes("p === 'decide'"), false, 'no approval route left');
});
test('BF-12 each message gives the Care Team a notification with the resident and the kind', async () => {
  const st = await call('GET', 'robot/state', undefined, R);
  for (const k of Object.keys(X.ids)) {
    const n = st.data.notifications.find((x) => x.message === X.ids[k]);
    assert.ok(n, 'notification for ' + k);
    assert.equal(n.label, 'Marie');
    assert.equal(n.code, 'P1');
    assert.equal(n.kind, k);
    assert.equal(n.from, 'Sophie');
  }
});
test('BF-13 from a notification the team asks the robot to go to the resident (logged, SDK pending)', async () => {
  const st = await call('GET', 'robot/state', undefined, R);
  const n = st.data.notifications[0];
  const r = await call('POST', 'robot/navigate', { rid: n.rid, notification: n.id }, R);
  assert.equal(r.data.request.state, 'pending-sdk');
  assert.equal((await call('GET', 'robot/state', undefined, R)).data.nav.slice(-1)[0].code, 'P1');
});
test('BF-14 sent -> received (on the robot) -> read (opened), updated for the sender, who is notified', async () => {
  await call('POST', 'robot/received', { ids: [X.ids.text, X.ids.voice] }, R);
  let me = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.equal(me.data.messages.find((m) => m.id === X.ids.text).status, 'received');
  assert.equal(me.data.messages.find((m) => m.id === X.ids.photo).status, 'sent');
  events.length = 0;
  await call('POST', 'robot/read', { items: [{ id: X.ids.voice }] }, R);
  me = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.equal(me.data.messages.find((m) => m.id === X.ids.voice).status, 'read');
  assert.ok(me.data.messages.find((m) => m.id === X.ids.voice).readAt);
  assert.equal(events[0].type, 'message-read');
  assert.equal(events[0].pid, me.data.person.id, 'the sender is told (push by N2)');
});

/* ---------- BF-15/16: album ---------- */
test('BF-15/16 an album photo with caption and date reaches the robot; hidden then deleted, it leaves', async () => {
  const H = as(X.sophie, X.p1);
  const a = await call('POST', 'family/message', { photo: jpeg(900, 700), text: 'Mariage de Paul', album: { theme: 'celebrations', date: '1978-06-15' } }, B(X.sophie), H);
  let f = await call('GET', 'robot/feed', undefined, R);
  const it = f.data.messages.find((m) => m.id === a.data.message.id);
  assert.equal(it.kind, 'album'); assert.equal(it.text, 'Mariage de Paul'); assert.equal(it.date, '1978-06-15'); assert.equal(it.theme, 'celebrations');
  await call('POST', 'family/message/hide', { id: a.data.message.id }, B(X.sophie), H);
  f = await call('GET', 'robot/feed', undefined, R);
  assert.equal(f.data.messages.find((m) => m.id === a.data.message.id).hidden, true);
  await call('POST', 'family/message/delete', { id: a.data.message.id }, B(X.sophie), H);
  f = await call('GET', 'robot/feed', undefined, R);
  assert.ok(!f.data.messages.some((m) => m.id === a.data.message.id) && f.data.gone.includes(a.data.message.id));
});

/* ---------- BF-27: consent levels ---------- */
test('BF-27 three consent levels; without "all" only messages, calls and album; lowering applies at once', async () => {
  const H = as(X.sophie, X.p1);
  assert.equal(consentLevel(ROBOT, 'P1'), null, 'nothing recorded');
  let me = await call('GET', 'family/me', undefined, B(X.sophie), H);
  assert.deepEqual(me.data.resident.features, { messages: true, album: true, calls: true, premium: true, feed: false, listen: false });
  assert.equal((await call('GET', 'family/listen', undefined, B(X.sophie), H)).data.error, 'no-consent');
  assert.equal((await call('POST', 'robot/resident/consent', { rid: X.p1, level: 'everything' }, R)).data.error, 'bad-level');
  await call('POST', 'robot/resident/consent', { rid: X.p1, level: 'all', by: 'representative' }, R);
  assert.equal(consentLevel(ROBOT, 'P1'), 'all');
  me = await call('GET', 'family/me', undefined, B(X.sophie), H);
  assert.equal(me.data.resident.consent, 'all');
  assert.equal(me.data.resident.features.feed, true);
  assert.equal((await call('GET', 'family/listen', undefined, B(X.sophie), H)).status, 200);
  await call('POST', 'robot/resident/consent', { rid: X.p1, level: 'messages_album' }, R);
  me = await call('GET', 'family/me', undefined, B(X.sophie), H);
  assert.equal(me.data.resident.features.feed, false, 'lowered: at the next request');
  assert.equal((await call('GET', 'family/listen', undefined, B(X.sophie), H)).data.error, 'no-consent');
  assert.equal(authFamily({ headers: { authorization: B(X.sophie), 'x-resident': X.p1 } }).consent, 'messages_album');
  await call('POST', 'robot/resident/consent', { rid: X.p1, level: 'none' }, R);
  assert.equal((await call('POST', 'family/message', { text: 'toujours possible' }, B(X.sophie), H)).status, 200, 'messages stay possible');
});

/* ---------- BF-20 to 24, 28: Premium ---------- */
test('BF-20 two separate subscriptions per resident, each with its status', async () => {
  const me = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.deepEqual(me.data.products.map((p) => p.id), ['play', 'books']);
  assert.ok(me.data.products.every((p) => p.premium === false));
});
test('BF-24 prices come from the configuration; the payment is a test (nothing debited)', async () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'js', 'premium-config.js'), 'utf8');
  const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(cfg + '\n;this.C = PREMIUM_CONFIG;', ctx);
  const me = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  const play = me.data.products.find((p) => p.id === 'play');
  const expect = ctx.C.pilotFree === true ? 0 : ctx.C.products.play.monthCents;
  assert.deepEqual(play.prices.map((x) => x.cents), [1, 3, 12].map((n) => expect * n), 'from js/premium-config.js');
  assert.equal(me.data.testPayment, ctx.C.testPayment !== false);
  assert.ok(!/1099/.test(fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8')), 'no price written in the portal');
});
test('BF-21/22/28 any linked relative sees and can pay; once paid, the others see "paid" without a name and cannot pay again', async () => {
  const rq = await call('POST', 'robot/premium-request', { code: 'P1', product: 'play', months: 3 }, R);
  assert.equal(rq.data.request.state, 'awaiting_family');
  assert.ok(events.some((e) => e.type === 'payment-request' && e.request === rq.data.request.id), 'the relatives are told');
  const id = rq.data.request.id;
  const paulSees = await call('GET', 'family/me', undefined, B(X.paul), as(X.paul, X.p1));
  assert.equal(paulSees.data.requests.find((q) => q.id === id).state, 'awaiting_family', 'Paul sees it');
  const sophieSees = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.equal(sophieSees.data.requests.find((q) => q.id === id).state, 'awaiting_family', 'Sophie sees it');
  const paid = await call('POST', 'family/premium-request/pay', { id, last4: '4242' }, B(X.paul), as(X.paul, X.p1));
  assert.equal(paid.data.request.paidByMe, true);
  assert.equal(paid.data.request.paidBy, 'Paul');
  const s2 = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  const q = s2.data.requests.find((x) => x.id === id);
  assert.equal(q.state, 'paid');
  assert.equal(q.paidBy, '', 'BF-28: no payer name for the others');
  assert.equal(q.paidByMe, false);
  assert.ok(!JSON.stringify(s2.data).includes('Paul'), 'Paul\'s name appears nowhere for Sophie');
  assert.equal(s2.data.payments.length, 0, 'not in Sophie\'s history');
  assert.equal((await call('POST', 'family/premium-request/pay', { id }, B(X.sophie), as(X.sophie, X.p1))).status, 409, 'the Pay button is gone: already paid');
  const p2 = await call('GET', 'family/me', undefined, B(X.paul), as(X.paul, X.p1));
  assert.equal(p2.data.payments[0].paidBy, 'Paul', 'the payer\'s own history has his name');
  /* BF-21: the robot activates by itself (no team action), everybody sees "active" */
  const robot = await call('GET', 'robot/premium-requests', undefined, R);
  assert.equal(robot.data.requests.find((x) => x.id === id).state, 'paid');
  await call('POST', 'robot/premium-request/active', { id }, R);
  const s3 = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.equal(s3.data.requests.find((x) => x.id === id).state, 'active');
  assert.ok(s3.data.requests.find((x) => x.id === id).until);
  assert.equal(s3.data.products.find((p) => p.id === 'play').premium, true);
  assert.equal(s3.data.products.find((p) => p.id === 'books').premium, false, 'Play never implies Books');
});
test('BF-23 coming back to a resident already paid shows "active" again, without paying', async () => {
  await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p2));
  const back = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p1));
  assert.equal(back.data.products.find((p) => p.id === 'play').premium, true);
  const p2 = await call('GET', 'family/me', undefined, B(X.sophie), as(X.sophie, X.p2));
  assert.equal(p2.data.products.find((p) => p.id === 'play').premium, false, 'P2 has its own subscriptions');
});

/* ---------- the shared hook for the other modules ---------- */
test('registerRoutes: another module answers under /portal/api/ with the same CORS and auth', async () => {
  registerRoutes('bftest/', (req, url, body, ctx) => [200, { path: ctx.path, family: ctx.family ? ctx.family.code : null, robot: ctx.robot ? ctx.robot.id : null }]);
  const r = await call('GET', 'bftest/hello', undefined, B(X.sophie), as(X.sophie, X.p2));
  assert.deepEqual(r.data, { path: 'hello', family: 'P2', robot: null });
  assert.equal((await call('GET', 'bftest/x', undefined, R)).data.robot, ROBOT);
});

/* ---------- A relative asks for access by themselves (portal "Create an account"): one tap by the team ---------- */
test('request access: wrong code or name is refused; the request waits, then Approve links the relative and tells them; Refuse says only "refused"', async () => {
  const body = (o) => Object.assign({ first: 'Lea', last: 'Test', relation: 'fille', phone: '0600000000', email: 'lea.req@example.test', code: 'P3', resident: 'Hans', lang: 'fr', consent: true }, o);
  assert.equal((await call('POST', 'family/request-access', body({ consent: false }))).data.error, 'consent-needed');
  assert.equal((await call('POST', 'family/request-access', body({ resident: 'Paul' }))).status, 404, 'the name must match the code');
  assert.equal((await call('POST', 'family/request-access', body({ code: 'P9' }))).status, 404);
  const ok = await call('POST', 'family/request-access', body({ resident: ' hans ' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.data.me.access, 'access-pending');
  const tok = ok.data.token;
  /* waiting: no messages, no resident data */
  assert.equal((await call('GET', 'family/me', undefined, B(tok))).data.access, 'access-pending');
  assert.equal((await call('POST', 'family/message', { text: 'hi' }, B(tok), as(tok, X.p3))).status, 403);
  assert.equal(authFamily({ headers: { authorization: B(tok), 'x-resident': X.p3 } }), null);
  /* the team sees it, with one tap to answer */
  const st = (await call('GET', 'robot/state', undefined, R)).data;
  const acc = st.residents.find((r) => r.code === 'P3').accounts.find((a) => a.status === 'pending');
  assert.ok(acc && acc.name === 'Lea' && acc.last === 'Test' && acc.relation === 'fille' && acc.phone === '0600000000');
  /* a second request with the same e-mail does not take the account over */
  assert.equal((await call('POST', 'family/request-access', body({}))).status, 409);
  const n = events.length;
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R)).status, 200);
  const me = (await call('GET', 'family/me', undefined, B(tok))).data;
  assert.equal(me.access, 'ok');
  assert.equal(me.resident.rid, X.p3);
  assert.equal(linkedResidents(acc.id).length, 1);
  const ev = events.slice(n).find((e) => e.pid === me.person.id);
  assert.ok(ev && ev.type === 'access' && /Hans/.test(ev.title.fr) && /Hans/.test(ev.title.de) && /Hans/.test(ev.title.en), 'the bell is told');
  assert.equal((await call('POST', 'family/message', { text: 'Bonjour Hans' }, B(tok), as(tok, X.p3))).status, 200);
  /* refusal */
  const no = await call('POST', 'family/request-access', body({ email: 'max.req@example.test', first: 'Max' }));
  const tok2 = no.data.token;
  const acc2 = (await call('GET', 'robot/state', undefined, R)).data.residents.find((r) => r.code === 'P3').accounts.find((a) => a.status === 'pending');
  const m2 = events.length;
  await call('POST', 'robot/account/status', { account: acc2.id, status: 'refused', staff: 'AB' }, R);
  assert.equal((await call('GET', 'family/me', undefined, B(tok2))).data.access, 'access-refused');
  assert.equal((await call('POST', 'family/message', { text: 'hi' }, B(tok2), as(tok2, X.p3))).status, 403);
  const ev2 = events.slice(m2).find((e) => e.pid === no.data.me.person.id);
  assert.ok(ev2 && ev2.title.fr === 'Refusé' && ev2.body === '', 'a refusal says "Refused" and nothing else');
  assert.deepEqual((await call('GET', 'robot/state', undefined, R)).data.residents.find((r) => r.code === 'P3').accounts.filter((a) => a.status === 'pending'), []);
});
test('invitation: the new account is pending, appears in the robot\'s pending list, one tap validates it, then it is active', async () => {
  const rid = (await call('POST', 'robot/resident', { code: 'P4', label: 'Greta', lang: 'de' }, R)).data.rid;
  const inv = await call('POST', 'robot/invite', { rid }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'nina@example.test', name: 'Nina', relation: 'Enkelin', consent: true, lang: 'de' });
  assert.equal(reg.status, 200);
  const tok = reg.data.token;
  /* right after the registration: waiting, no resident data, nothing can be sent */
  assert.equal(reg.data.me.access, 'access-pending');
  assert.equal(reg.data.me.resident, null);
  assert.equal(reg.data.me.account.id, '', 'no active account yet');
  assert.equal((await call('GET', 'family/me', undefined, B(tok))).data.access, 'access-pending');
  assert.equal((await call('POST', 'family/message', { text: 'Hallo Oma' }, B(tok), as(tok, rid))).status, 403);
  assert.equal(authFamily({ headers: { authorization: B(tok) } }), null);
  assert.equal(linkedResidents(reg.data.me.person.id).length, 0);
  /* the robot's pending list (Care Team > To handle) */
  const acc = (await call('GET', 'robot/state', undefined, R)).data.residents.find((r) => r.code === 'P4').accounts.find((a) => a.email === 'nina@example.test');
  assert.ok(acc, 'listed for the care team');
  assert.equal(acc.status, 'pending');
  assert.equal(acc.createdBy, 'invite');
  assert.equal(acc.name, 'Nina');
  assert.equal(acc.relation, 'Enkelin');
  /* one tap: validated */
  const n = events.length;
  const ok = await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, 'active');
  const me = (await call('GET', 'family/me', undefined, B(tok))).data;
  assert.equal(me.access, 'ok');
  assert.equal(me.resident.rid, rid);
  assert.equal(me.account.id, acc.id);
  assert.equal(linkedResidents(acc.id).length, 1);
  assert.equal(authFamily({ headers: { authorization: B(tok) } }).code, 'P4');
  const ev = events.slice(n).find((e) => e.pid === me.person.id);
  assert.ok(ev && ev.type === 'access' && /Greta/.test(ev.title.de), 'the relative is told');
  const after = (await call('GET', 'robot/state', undefined, R)).data.residents.find((r) => r.code === 'P4').accounts;
  assert.deepEqual(after.map((a) => a.status), ['active'], 'out of the pending list');
  assert.equal((await call('POST', 'family/message', { text: 'Hallo Oma' }, B(tok), as(tok, rid))).status, 200);
});
test('a robot sync registers the resident by itself: request-access works with the right first name only', async () => {
  const fresh = 'bf_fresh_' + crypto.randomBytes(5).toString('hex'), fk = crypto.randomBytes(32).toString('base64url'), FR = 'Robot ' + fresh + '.' + fk;
  await call('POST', 'robot/hello', { robot: fresh, key: fk });
  const req = (name) => call('POST', 'family/request-access', { first: 'Zoe', last: 'Test', relation: 'fille', phone: '+49 151 2345 6789', email: name.toLowerCase() + '.sync@example.test', code: 'P7', resident: name, lang: 'fr', consent: true });
  assert.equal((await req('Marie')).status, 404, 'unknown before the sync');
  assert.equal((await call('POST', 'robot/resident/sync', { residents: [{ code: 'P7', label: 'Marie', lang: 'fr' }] }, FR)).status, 200);
  assert.equal((await req('Anna')).status, 404);
  assert.equal((await req('Marie')).status, 200);
  /* a name typed by the team in Family > Accounts is kept by later syncs; otherwise the card's name follows */
  const rid = (await call('GET', 'robot/state', undefined, FR)).data.residents[0].rid;
  await call('POST', 'robot/resident/sync', { residents: [{ code: 'P7', label: 'Mamie', lang: 'fr' }] }, FR);
  assert.equal((await call('GET', 'robot/state', undefined, FR)).data.residents[0].label, 'Mamie');
  await call('POST', 'robot/resident', { code: 'P7', label: 'Maman', lang: 'fr' }, FR);
  await call('POST', 'robot/resident/sync', { residents: [{ code: 'P7', label: 'Marie', lang: 'fr' }] }, FR);
  const r = (await call('GET', 'robot/state', undefined, FR)).data.residents[0];
  assert.equal(r.label, 'Maman'); assert.equal(r.rid, rid);
});
test('the portal offers "Create an account" in French and German, and no WhatsApp / SMS / Open on the call invitation card', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8');
  assert.match(src, /data-do="to-request"/);
  assert.match(src, /'Create an account': 'Créer un compte'/);
  assert.match(src, /'Create an account': 'Konto erstellen'/);
  const fam = fs.readFileSync(path.join(ROOT, 'js', 'family-staff.js'), 'utf8');
  assert.ok(!fam.includes('wa.me') && !fam.includes('sms:?body') && !fam.includes('data-f="outopen"'));
});

/* ---------- 24 Nov (Rahma): input checks and a password ---------- */
test('a wrong phone number or a date that does not exist is refused', async () => {
  const body = (o) => Object.assign({ first: 'Lea', last: 'Test', relation: 'fille', email: 'lea.phone@example.test', code: 'P3', resident: 'Hans', lang: 'fr', consent: true }, o);
  for (const phone of ['1', '12345', 'abcdefghij', '0612 34', '+1234567890123456']) assert.equal((await call('POST', 'family/request-access', body({ phone }))).data.error, 'bad-phone', phone);
  assert.notEqual((await call('POST', 'family/request-access', body({ phone: '06 12 34 56 78' }))).data.error, 'bad-phone');
  const H = as(X.sophie, X.p1);
  for (const date of ['juin 1978', '1978-02-30', '1899-12-31', '2999-01-01', '15/06/1978']) {
    assert.equal((await call('POST', 'family/message', { photo: jpeg(900, 700), text: 'x', album: { theme: 'celebrations', date } }, B(X.sophie), H)).data.error, 'bad-date', date);
  }
});
test('a password: strong enough, kept as a hash only, sign-in with it, a wrong one locks for a while', async () => {
  assert.equal((await call('POST', 'family/password', { password: 'short1' }, B(X.sophie))).data.error, 'weak-password');
  assert.equal((await call('POST', 'family/password', { password: 'onlyletters' }, B(X.sophie))).data.error, 'weak-password');
  /* right after signing in with a code no current password is asked */
  assert.equal((await call('POST', 'family/password', { password: 'Soleil2026' }, B(X.sophie))).status, 200);
  assert.equal((await call('GET', 'family/me', undefined, B(X.sophie))).data.person.hasPassword, true);
  const stored = fs.readFileSync(path.join(TMP, 'portal', fs.readdirSync(path.join(TMP, 'portal')).find((f) => f.endsWith('.json'))), 'utf8');
  assert.ok(!stored.includes('Soleil2026'), 'never kept in clear');
  /* the same answer for an unknown address and a wrong password */
  assert.equal((await call('POST', 'family/login/password', { email: 'nobody@example.test', password: 'Soleil2026' })).data.error, 'bad-login');
  assert.equal((await call('POST', 'family/login/password', { email: 'sophie@example.test', password: 'Soleil2027' })).data.error, 'bad-login');
  const ok = await call('POST', 'family/login/password', { email: 'Sophie@Example.test', password: 'Soleil2026' });
  assert.equal(ok.status, 200); assert.ok(ok.data.token); assert.equal(ok.data.me.person.email, 'sophie@example.test');
  /* signed in with the password: changing it needs the current one */
  assert.equal((await call('POST', 'family/password', { password: 'Lune2026x' }, B(ok.data.token))).data.error, 'bad-current');
  assert.equal((await call('POST', 'family/password', { password: 'Lune2026x', current: 'Soleil2026' }, B(ok.data.token))).status, 200);
  /* the code session is no longer "just signed in" after 30 minutes */
  clock += 31 * 60 * 1000;
  assert.equal((await call('POST', 'family/password', { password: 'Etoile2026' }, B(X.sophie))).data.error, 'bad-current');
  /* 5 wrong passwords: 15 minutes wait, even with the right one */
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', 'family/login/password', { email: 'sophie@example.test', password: 'wrong' + i + 'xx' })).status, 401);
  assert.equal((await call('POST', 'family/login/password', { email: 'sophie@example.test', password: 'Lune2026x' })).status, 429);
  clock += 16 * 60 * 1000;
  assert.equal((await call('POST', 'family/login/password', { email: 'sophie@example.test', password: 'Lune2026x' })).status, 200);
});
test('the family app checks the card, the phone, the date and the e-mail before sending, and shows no demo lines', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8');
  assert.ok(!src.includes("T('A Bellatrix pilot in care homes. No advertising.')"));
  assert.ok(!src.includes("T('No card data is kept. Do not type your real card: use 4242 4242 4242 4242.')"));
  assert.ok(!src.includes("'<p class=\"testpay\">'"));
  assert.ok(!fs.readFileSync(path.join(ROOT, 'js', 'portail-calls.js'), 'utf8').includes("esc(T('Calls ring on this phone"));
  const ctx = { console }; vm.createContext(ctx);
  const fn = (name) => { const i = src.indexOf('  function ' + name + '('); const j = src.indexOf('\n  function ', i + 5); return src.slice(i, j); };
  vm.runInContext(['luhn', 'cardProblem', 'phoneOk', 'emailOk', 'pwStrong', 'todayIso', 'dateOk'].map(fn).join('\n') + '\nthis.F = { cardProblem, phoneOk, emailOk, pwStrong, dateOk };', ctx);
  const F = ctx.F, next = new Date().getFullYear() % 100 + 1;
  assert.equal(F.cardProblem('Marie Curie', '4242424242424242', '12/' + next, '123'), null);
  assert.equal(F.cardProblem('Marie Curie', '4242424242424241', '12/' + next, '123')[0], 'payNum', 'Luhn');
  assert.equal(F.cardProblem('Marie Curie', '42424242', '12/' + next, '123')[0], 'payNum');
  assert.equal(F.cardProblem('M', '4242424242424242', '12/' + next, '123')[0], 'payName');
  assert.equal(F.cardProblem('1234', '4242424242424242', '12/' + next, '123')[0], 'payName');
  assert.equal(F.cardProblem('Marie Curie', '4242424242424242', '13/' + next, '123')[0], 'payExp');
  assert.equal(F.cardProblem('Marie Curie', '4242424242424242', '01/20', '123')[1], 'This card has expired.');
  assert.equal(F.cardProblem('Marie Curie', '4242424242424242', '12/' + next, '12')[0], 'payCvc');
  assert.ok(F.phoneOk('+33 6 12 34 56 78') && F.phoneOk('0151-2345678') && !F.phoneOk('123') && !F.phoneOk('06 12 ab 56 78'));
  assert.ok(F.emailOk('a.b@example.de') && !F.emailOk('a@b') && !F.emailOk('ab.example.de'));
  assert.ok(F.pwStrong('Soleil2026') && !F.pwStrong('soleil') && !F.pwStrong('12345678'));
  assert.ok(F.dateOk('1978-06-15') && !F.dateOk('1978-02-30') && !F.dateOk('2999-01-01') && !F.dateOk('juin 1978'));
});

test.after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });
