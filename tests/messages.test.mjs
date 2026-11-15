// Care V1 module A: the family portal server (labland/family-portal.mjs).
// Run: node tests/messages.test.mjs
// Everything runs on free ports with data in a temporary folder (deleted at the end); labland/data
// is never touched. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createPortal } from '../labland/family-portal.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 3600 * 1000;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-portal-test-'));
let clock = Date.parse('2026-11-09T10:00:00Z');
const portal = createPortal({ dataDir: path.join(TMP, 'portal'), now: () => clock, log: () => {}, rateLimit: false });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/portal/api/')) portal.handle(req, res, url);
  else { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port + '/portal/api/';

async function call(method, p, body, auth, base) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const r = await fetch((base || BASE) + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = r.headers.get('content-type') || '';
  const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, type, headers: r.headers };
}
const ROBOT = 'robot_' + crypto.randomBytes(9).toString('base64url');
const KEY = crypto.randomBytes(32).toString('base64url');
const R = 'Robot ' + ROBOT + '.' + KEY;
const B = (t) => 'Bearer ' + t;

/* A tiny JPEG header (SOF0 with a size); the server only checks the markers and the size. */
function jpeg(w, h) {
  const b = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]);
  return 'data:image/jpeg;base64,' + b.toString('base64');
}
function photosOnDisk() { try { return fs.readdirSync(path.join(TMP, 'portal', 'photos')).length; } catch (e) { return 0; } }

const S = {};   // shared state between the steps (they run in order)
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

test('robot registers once; its key is required afterwards', async () => {
  assert.equal((await call('GET', 'robot/state', undefined, R)).status, 401);
  assert.equal((await call('POST', 'robot/hello', { robot: ROBOT, key: KEY })).data.registered, true);
  assert.equal((await call('POST', 'robot/hello', { robot: ROBOT, key: KEY })).status, 200);
  assert.equal((await call('POST', 'robot/hello', { robot: ROBOT, key: crypto.randomBytes(32).toString('base64url') })).status, 403);
  assert.equal((await call('GET', 'robot/state', undefined, 'Robot ' + ROBOT + '.' + crypto.randomBytes(32).toString('base64url'))).status, 401);
  const r = await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R);
  assert.equal(r.status, 200);
  S.rid = r.data.rid;
  assert.match(S.rid, /^[A-Za-z0-9_-]{10,}$/);
  assert.equal((await call('POST', 'robot/resident', { code: 'P1', label: 'Mamie', lang: 'fr' }, R)).data.rid, S.rid, 'same resident, label updated');
});

test('invitation -> account with RGPD consent -> message straight to the robot -> received -> read', async () => {
  const inv = await call('POST', 'robot/invite', { rid: S.rid }, R);
  assert.equal(inv.status, 200);
  assert.match(inv.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const chk = await call('POST', 'family/invite', { code: inv.data.code.toLowerCase().replace('-', ' ') });
  assert.equal(chk.data.label, 'Mamie');
  assert.equal((await call('POST', 'family/register', { code: inv.data.code, email: 'sophie@example.test', name: 'Sophie', lang: 'fr' })).data.error, 'consent-needed');
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'Sophie@Example.test', name: 'Sophie', relation: 'petite-fille', lang: 'fr', consent: true });
  assert.equal(reg.status, 200);
  S.sophie = reg.data.token;
  assert.equal(reg.data.me.account.email, 'sophie@example.test');
  assert.ok(reg.data.me.account.consentAt);
  assert.equal(reg.data.me.access, 'access-pending', 'an invitation account waits for the care team too');
  assert.equal((await call('POST', 'family/register', { code: inv.data.code, email: 'paul@example.test', name: 'Paul', consent: true })).status, 410, 'an invitation is used once');
  await validate('sophie@example.test');
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).data.access, 'ok', 'validated by the care team: the access is open');

  assert.equal((await call('POST', 'family/message', { text: 'Regarde https://example.test/photo' }, B(S.sophie))).data.error, 'no-links');
  assert.equal((await call('POST', 'family/message', { text: 'Vois www.exemple.fr' }, B(S.sophie))).data.error, 'no-links');
  assert.equal((await call('POST', 'family/message', { text: 'x'.repeat(301) }, B(S.sophie))).data.error, 'too-long');
  assert.equal((await call('POST', 'family/message', {}, B(S.sophie))).data.error, 'empty');
  assert.equal((await call('POST', 'family/message', { photo: jpeg(3000, 2000) }, B(S.sophie))).data.error, 'photo-too-big');
  assert.equal((await call('POST', 'family/message', { photo: 'data:image/png;base64,iVBORw0KGgo=' }, B(S.sophie))).data.error, 'bad-photo');

  const t = await call('POST', 'family/message', { text: 'Bonjour Mamie, je pense fort à toi. Bisous.' }, B(S.sophie));
  assert.equal(t.status, 200);
  assert.equal(t.data.message.status, 'sent');
  S.textId = t.data.message.id;
  const ph = await call('POST', 'family/message', { photo: jpeg(1600, 1200), text: 'Léo à la plage' }, B(S.sophie));
  assert.equal(ph.data.message.kind, 'photo');
  S.photoId = ph.data.message.id;
  assert.equal(photosOnDisk(), 1);

  const st = await call('GET', 'robot/state', undefined, R);
  assert.equal(st.data.residents[0].accounts[0].name, 'Sophie');
  assert.equal(st.data.notifications.length, 2, 'one Care Team notification per message');
  const img = await call('GET', 'robot/photo?id=' + S.photoId, undefined, R);
  assert.equal(img.type, 'image/jpeg');
  assert.equal(img.data[0], 0xFF);
  assert.equal((await call('GET', 'family/photo?id=' + S.photoId, undefined, B(S.sophie))).type, 'image/jpeg');
  const feed = await call('GET', 'robot/feed', undefined, R);
  assert.equal(feed.data.messages.length, 2, 'no approval: both are on the robot at once');
  assert.equal(feed.data.messages[0].from, 'Sophie');

  assert.equal((await call('POST', 'robot/received', { ids: [S.textId, S.photoId] }, R)).data.updated, 2);
  let me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.messages.find((m) => m.id === S.textId).status, 'received');
  assert.equal((await call('POST', 'robot/shown', { items: [{ id: S.textId, at: new Date(clock).toISOString(), by: 'robot' }] }, R)).data.updated, 1);
  me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.messages.find((m) => m.id === S.textId).status, 'read');
  assert.ok(me.data.messages.find((m) => m.id === S.textId).readAt);
  assert.equal(me.data.messages.find((m) => m.id === S.photoId).status, 'received');
});

test('the team withdraws a message from the robot: the robot drops it', async () => {
  assert.equal((await call('POST', 'robot/withdraw', { id: S.photoId }, R)).status, 200);
  const me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.messages.find((m) => m.id === S.photoId).status, 'withdrawn');
  const f = await call('GET', 'robot/feed', undefined, R);
  assert.equal(f.data.messages.some((m) => m.id === S.photoId), false);
  assert.ok(f.data.gone.includes(S.photoId), 'the robot is told to drop its copy');
});

test('Care Team notifications (BF-12) and "send the robot to the resident" (BF-13, logged)', async () => {
  const st = await call('GET', 'robot/state', undefined, R);
  const n = st.data.notifications[0];
  assert.equal(n.label, 'Mamie');
  assert.equal(n.code, 'P1');
  assert.ok(['text', 'photo'].includes(n.kind));
  assert.equal(n.seen, false);
  assert.equal((await call('POST', 'robot/notification/seen', { ids: [n.id] }, R)).data.updated, 1);
  const nav = await call('POST', 'robot/navigate', { rid: S.rid, notification: n.id }, R);
  assert.equal(nav.data.request.state, 'pending-sdk');
  assert.equal((await call('GET', 'robot/state', undefined, R)).data.nav.length, 1);
});

test('account made by the care team: sign-in with email + one-time code, consent at first sign-in', async () => {
  const a = await call('POST', 'robot/account', { rid: S.rid, email: 'paul@example.test', name: 'Paul', relation: 'fils', lang: 'de' }, R);
  assert.equal(a.status, 200);
  assert.match(a.data.code, /^\d{6}$/);
  S.paulAccount = a.data.account;
  assert.equal((await call('POST', 'robot/account', { rid: S.rid, email: 'paul@example.test', name: 'Paul' }, R)).status, 409);
  assert.equal((await call('POST', 'family/login/verify', { email: 'paul@example.test', code: a.data.code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await call('POST', 'family/login/verify', { email: 'PAUL@example.test', code: a.data.code });
  assert.equal(ok.status, 200);
  S.paul = ok.data.token;
  assert.equal(ok.data.me.needsConsent, true);
  assert.equal((await call('POST', 'family/message', { text: 'Hallo Mama' }, B(S.paul))).data.error, 'consent-needed');
  assert.equal((await call('POST', 'family/consent', { consent: true }, B(S.paul))).data.needsConsent, false);
  assert.equal((await call('POST', 'family/message', { text: 'Hallo Mama' }, B(S.paul))).status, 200);
  assert.equal((await call('POST', 'family/login/verify', { email: 'paul@example.test', code: a.data.code })).status, 401, 'a code works once');

  assert.equal((await call('POST', 'family/login/start', { email: 'nobody@example.test' })).data.ok, true, 'same answer for unknown addresses');
  await call('POST', 'family/login/start', { email: 'paul@example.test' });
  const st = await call('GET', 'robot/state', undefined, R);
  const code = st.data.residents[0].accounts.find((x) => x.id === S.paulAccount).code;
  assert.match(code, /^\d{6}$/, 'the code is shown to the care team');
  for (let i = 0; i < 5; i++) await call('POST', 'family/login/verify', { email: 'paul@example.test', code: code === '123456' ? '654321' : '123456' });
  assert.equal((await call('POST', 'family/login/verify', { email: 'paul@example.test', code })).status, 401, 'five wrong tries end the code');
  assert.equal((await call('POST', 'family/logout', {}, B(S.paul))).status, 200);
  assert.equal((await call('GET', 'family/me', undefined, B(S.paul))).status, 401);
});

test('Premium offered by the family -> later -> activate -> active until -> stopped in one click', async () => {
  assert.equal((await call('POST', 'family/offer', { months: 2 }, B(S.sophie))).data.error, 'bad-months');
  const o = await call('POST', 'family/offer', { months: 3 }, B(S.sophie));
  assert.equal(o.data.offer.state, 'paid');
  assert.equal(o.data.offer.demo, true);
  const price3 = (await call('GET', 'family/me', undefined, B(S.sophie))).data.products.find((x) => x.id === 'play').prices.find((x) => x.months === 3).cents;
  assert.equal(o.data.offer.cents, price3, 'the price comes from js/premium-config.js');
  assert.equal(o.data.offer.cents, 1099 * 3, 'the real configured price, 10.99 a month (BF-24)');
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).data.testPayment, true, 'test payment: the portal says nothing is charged');
  assert.equal(o.data.offer.product, 'play', 'a gift without a product is Play Premium (1.15 portals)');
  assert.equal((await call('POST', 'family/offer', { months: 1 }, B(S.sophie))).status, 409, 'one open offer at a time');
  let st = await call('GET', 'robot/state', undefined, R);
  assert.equal(st.data.offers[0].state, 'paid');
  assert.equal(st.data.offers[0].code, 'P1');
  assert.equal((await call('POST', 'robot/offer', { id: o.data.offer.id, decision: 'later' }, R)).data.offer.state, 'paid');
  const act = await call('POST', 'robot/offer', { id: o.data.offer.id, decision: 'activate' }, R);
  assert.equal(act.data.offer.state, 'active');
  assert.equal(act.data.offer.until.slice(0, 10), '2027-02-09');
  const me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.offers[0].state, 'active');
  assert.equal(me.data.offers[0].until.slice(0, 10), '2027-02-09');
  const stop = await call('POST', 'family/offer/stop', { id: o.data.offer.id }, B(S.sophie));
  assert.equal(stop.data.offer.state, 'stopped');
  st = await call('GET', 'robot/state', undefined, R);
  assert.equal(st.data.offers[0].state, 'stopped', 'the robot sees it and turns Premium off');
  const o2 = await call('POST', 'family/offer', { months: 12 }, B(S.sophie));
  assert.equal((await call('POST', 'family/offer/stop', { id: o2.data.offer.id }, B(S.sophie))).data.offer.state, 'cancelled', 'stopped before activation: cancelled');
});

test('withdrawing consent deletes the account, its messages and photos; the robot drops its copies', async () => {
  const inv = await call('POST', 'robot/invite', { rid: S.rid }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'lea@example.test', name: 'Léa', consent: true, lang: 'en' });
  const lea = reg.data.token;
  await validate('lea@example.test');
  const m1 =await call('POST', 'family/message', { photo: jpeg(800, 600) }, B(lea));
  const m2 = await call('POST', 'family/message', { text: 'Hello Granny' }, B(lea));
  const before = photosOnDisk();
  const rv = await call('POST', 'family/consent/revoke', {}, B(lea));
  assert.equal(rv.data.deleted, true);
  assert.equal((await call('GET', 'family/me', undefined, B(lea))).status, 401);
  assert.equal(photosOnDisk(), before - 1);
  const st = await call('GET', 'robot/state', undefined, R);
  assert.ok(!st.data.messages.some((x) => x.id === m2.data.message.id));
  assert.ok(!st.data.residents[0].accounts.some((a) => a.email === 'lea@example.test'));
  const f = await call('GET', 'robot/feed', undefined, R);
  assert.ok(f.data.gone.includes(m1.data.message.id) && f.data.gone.includes(m2.data.message.id));
});

test('deletion on request: one message, a team erasure, all data of a resident', async () => {
  const m = await call('POST', 'family/message', { photo: jpeg(640, 480) }, B(S.sophie));
  const n = photosOnDisk();
  assert.equal((await call('POST', 'family/message/delete', { id: m.data.message.id }, B(S.sophie))).status, 200);
  assert.equal(photosOnDisk(), n - 1);
  assert.equal((await call('POST', 'robot/account/erase', { account: S.paulAccount }, R)).status, 200);
  assert.ok(!(await call('GET', 'robot/state', undefined, R)).data.residents[0].accounts.some((a) => a.id === S.paulAccount));

  /* A second resident, then everything of it is erased. */
  const r2 = await call('POST', 'robot/resident', { code: 'P2', label: 'Hans', lang: 'de' }, R);
  const inv = await call('POST', 'robot/invite', { rid: r2.data.rid }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'anna@example.test', name: 'Anna', consent: true, lang: 'de' });
  await validate('anna@example.test');
  await call('POST', 'family/message', { photo: jpeg(600, 800), text: 'Hallo Opa' }, B(reg.data.token));
  await call('POST', 'family/offer', { months: 1 }, B(reg.data.token));
  const n2 = photosOnDisk();
  assert.equal((await call('POST', 'robot/resident/erase', { rid: r2.data.rid }, R)).status, 200);
  assert.equal(photosOnDisk(), n2 - 1);
  const st = await call('GET', 'robot/state', undefined, R);
  assert.ok(!st.data.residents.some((r) => r.code === 'P2'));
  assert.ok(!st.data.offers.some((o) => o.rid === r2.data.rid));
  assert.equal((await call('GET', 'family/me', undefined, B(reg.data.token))).status, 401);
  /* Another robot cannot see or touch this robot's residents. */
  const other = 'Robot other_robot_1.' + crypto.randomBytes(32).toString('base64url');
  await call('POST', 'robot/hello', { robot: 'other_robot_1', key: other.split('.')[1] });
  assert.equal((await call('POST', 'robot/invite', { rid: S.rid }, other)).status, 404);
  assert.equal((await call('GET', 'robot/state', undefined, other)).data.residents.length, 0);
});

test('album photo from the family: straight to the robot with caption and date; hide and show again', async () => {
  assert.equal((await call('POST', 'family/message', { photo: jpeg(900, 600), text: 'Mariage de Paul', album: { theme: 'nope' } }, B(S.sophie))).data.error, 'bad-theme');
  assert.equal((await call('POST', 'family/message', { text: 'sans photo', album: { theme: 'family' } }, B(S.sophie))).data.error, 'empty');
  assert.equal((await call('POST', 'family/message', { photo: jpeg(900, 600), text: 'x'.repeat(91), album: { theme: 'family' } }, B(S.sophie))).data.error, 'too-long');
  const a = await call('POST', 'family/message', { photo: jpeg(900, 600), text: 'Mariage de Paul', album: { theme: 'family', date: '12/06/1978', question: 'Vous souvenez-vous de la musique ?' } }, B(S.sophie));
  assert.equal(a.status, 200);
  assert.equal(a.data.message.kind, 'album');
  assert.equal(a.data.message.date, '12/06/1978');
  const f = await call('GET', 'robot/feed', undefined, R);
  const x = f.data.messages.find((m) => m.id === a.data.message.id);
  assert.equal(x.kind, 'album');
  assert.equal(x.theme, 'family');
  assert.equal(x.date, '12/06/1978');
  assert.equal(x.question, 'Vous souvenez-vous de la musique ?');
  assert.equal(x.hidden, false);
  assert.equal((await call('POST', 'family/message/hide', { id: a.data.message.id }, B(S.sophie))).data.message.hidden, true);
  assert.equal((await call('GET', 'robot/feed', undefined, R)).data.messages.find((m) => m.id === a.data.message.id).hidden, true, 'the robot hides it');
  await call('POST', 'family/message/hide', { id: a.data.message.id, hidden: false }, B(S.sophie));
  assert.equal((await call('GET', 'robot/feed', undefined, R)).data.messages.find((m) => m.id === a.data.message.id).hidden, false);
  const me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.ok(me.data.themes.includes('town'));
  await call('POST', 'robot/shown', { items: [{ id: a.data.message.id }] }, R);
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).data.messages.find((m) => m.id === a.data.message.id).status, 'read');
});

test('video-call link attached by the care team; deletion of all data on request keeps the account', async () => {
  const st = await call('GET', 'robot/state', undefined, R);
  const sophie = st.data.residents[0].accounts.find((x) => x.name === 'Sophie');
  assert.equal((await call('POST', 'robot/account/call', { account: sophie.id, link: 'https://evil.test/steal?x=1' }, R)).data.error, 'bad-link');
  const link = 'https://abc-def.trycloudflare.com/famille.html#t=' + crypto.randomBytes(16).toString('base64url');
  assert.equal((await call('POST', 'robot/account/call', { account: sophie.id, link }, R)).status, 200);
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).data.account.callLink, link);
  assert.equal((await call('POST', 'robot/account/call', { account: sophie.id, link: '' }, R)).status, 200);
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).data.account.callLink, '');

  await call('POST', 'family/message', { photo: jpeg(500, 500) }, B(S.sophie));
  const before = (await call('GET', 'family/me', undefined, B(S.sophie))).data.messages.length;
  assert.ok(before >= 2);
  const del = await call('POST', 'family/data/delete', {}, B(S.sophie));
  assert.equal(del.data.deleted, before);
  const me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.status, 200, 'the account stays');
  assert.equal(me.data.messages.length, 0);
  assert.equal(photosOnDisk(), 0);
});

/* ---------- 1.16: Premium payment requests (contract 2) ---------- */
test('payment request: team OK -> awaiting_family -> family pays (simulated, no card kept) -> robot activates -> active -> stopped', async () => {
  assert.equal((await call('POST', 'robot/premium-request', { code: 'P7', product: 'play', months: 1 }, R)).data.error, 'no-family', 'no family account: nobody to ask');
  assert.equal((await call('POST', 'robot/premium-request', { code: 'P1', product: 'music', months: 1 }, R)).data.error, 'bad-product');
  const rq = await call('POST', 'robot/premium-request', { code: 'P1', product: 'play', months: 3 }, R);
  assert.equal(rq.status, 200);
  assert.equal(rq.data.request.state, 'awaiting_family');
  assert.equal(rq.data.request.code, 'P1');
  assert.equal(rq.data.request.demo, true);
  const again = await call('POST', 'robot/premium-request', { code: 'p1', product: 'play', months: 3 }, R);
  assert.equal(again.data.existing, true, 'one open request per resident and product');
  assert.equal(again.data.request.id, rq.data.request.id);
  let me = await call('GET', 'family/me', undefined, B(S.sophie));
  const fr = me.data.requests.find((x) => x.id === rq.data.request.id);
  assert.equal(fr.state, 'awaiting_family');
  assert.equal(fr.product, 'play');
  assert.equal(fr.months, 3);
  assert.equal((await call('POST', 'family/premium-request/pay', { id: rq.data.request.id, last4: '42a2' }, B(S.sophie))).data.error, 'bad-card');
  const paid = await call('POST', 'family/premium-request/pay', { id: rq.data.request.id, last4: '9731' }, B(S.sophie));
  assert.equal(paid.data.request.state, 'paid');
  assert.equal(paid.data.request.paidBy, 'Sophie');
  const disk = fs.readFileSync(path.join(TMP, 'portal', 'portal.json'), 'utf8');
  assert.ok(!/9731|last4|card/i.test(disk), 'no card data on disk, not even the fake last 4');
  assert.equal((await call('POST', 'family/premium-request/pay', { id: rq.data.request.id }, B(S.sophie))).status, 409, 'paid once');
  let list = await call('GET', 'robot/premium-requests', undefined, R);
  assert.equal(list.data.requests.find((x) => x.id === rq.data.request.id).state, 'paid', 'the robot sees "paid" by polling');
  const until = new Date(clock + 92 * DAY).toISOString();
  const act = await call('POST', 'robot/premium-request/active', { id: rq.data.request.id, until }, R);
  assert.equal(act.data.request.state, 'active');
  assert.equal(act.data.request.until, until);
  me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.requests.find((x) => x.id === rq.data.request.id).state, 'active', 'the family sees it active');
  assert.equal(me.data.products.find((x) => x.id === 'play').premium, true);
  assert.equal(me.data.products.find((x) => x.id === 'books').premium, false, 'Play never implies Books');

  /* Books: a separate request; the family says no; Play stays as it is. */
  const bk = await call('POST', 'robot/premium-request', { code: 'P1', product: 'books', months: 1 }, R);
  assert.equal(bk.data.request.state, 'awaiting_family');
  assert.notEqual(bk.data.request.id, rq.data.request.id);
  assert.equal((await call('POST', 'family/premium-request/refuse', { id: bk.data.request.id }, B(S.sophie))).data.request.state, 'refused');
  list = await call('GET', 'robot/premium-requests', undefined, R);
  assert.equal(list.data.requests.find((x) => x.id === bk.data.request.id).state, 'refused');
  assert.equal(list.data.requests.find((x) => x.id === rq.data.request.id).state, 'active');

  /* The team takes back a request the family has not answered. */
  const bk2 = await call('POST', 'robot/premium-request', { code: 'P1', product: 'books', months: 12 }, R);
  const cancel = await call('POST', 'robot/premium-request/cancel', { id: bk2.data.request.id }, R);
  assert.equal(cancel.data.request.state, 'expired');
  assert.equal(cancel.data.request.endedBy, 'team');
  assert.equal((await call('POST', 'family/premium-request/pay', { id: bk2.data.request.id }, B(S.sophie))).status, 409);

  /* The family stops Play in one click: 'expired', the robot turns it off at its next poll. */
  const stop = await call('POST', 'family/premium-request/stop', { id: rq.data.request.id }, B(S.sophie));
  assert.equal(stop.data.request.state, 'expired');
  assert.equal(stop.data.request.endedBy, 'family');
  assert.equal((await call('GET', 'robot/premium-requests', undefined, R)).data.requests.find((x) => x.id === rq.data.request.id).state, 'expired');
  /* Another robot sees nothing of it. */
  const other = 'Robot other_robot_1.' + crypto.randomBytes(32).toString('base64url');
  assert.equal((await call('GET', 'robot/premium-requests', undefined, other)).status, 401);
});

test('family gifts per product and per resident: Play and Books separately', async () => {
  assert.equal((await call('POST', 'family/offer', { months: 1, product: 'music' }, B(S.sophie))).data.error, 'bad-product');
  const play = await call('POST', 'family/offer', { months: 1, product: 'play' }, B(S.sophie));
  const books = await call('POST', 'family/offer', { months: 3, product: 'books' }, B(S.sophie));
  assert.equal(play.data.offer.product, 'play');
  assert.equal(books.data.offer.product, 'books');
  assert.equal((await call('POST', 'family/offer', { months: 12, product: 'books' }, B(S.sophie))).data.error, 'offer-open');
  const st = await call('GET', 'robot/state', undefined, R);
  assert.deepEqual(st.data.offers.filter((o) => o.state === 'paid').map((o) => o.product).sort(), ['books', 'play']);
  await call('POST', 'robot/offer', { id: books.data.offer.id, decision: 'activate' }, R);
  const me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.products.find((x) => x.id === 'books').premium, true);
  assert.equal(me.data.products.find((x) => x.id === 'play').premium, false, 'Books never implies Play');
  await call('POST', 'family/offer/stop', { id: play.data.offer.id }, B(S.sophie));
  await call('POST', 'family/offer/stop', { id: books.data.offer.id }, B(S.sophie));
});

/* ---------- 1.16: listen together (contract 3) ---------- */
function catalogue() {
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'play-catalog.js'), 'utf8') + '\n;this.__c = PLAY_CATALOG;', ctx);
  return ctx.__c.items.filter((x) => x.kind !== 'podcast');
}
test('listen together: robot opens, family sees now playing, adds catalogue songs, robot plays the queue', async () => {
  assert.equal((await call('GET', 'family/listen', undefined, B(S.sophie))).data.error, 'no-consent', 'what the resident listens to needs consent "all"');
  await call('POST', 'robot/resident/consent', { rid: S.rid, level: 'all', by: 'resident' }, R);
  assert.equal((await call('GET', 'family/listen', undefined, B(S.sophie))).data.open, false, 'nothing open yet');
  assert.equal((await call('POST', 'family/listen', { add: 'x' }, B(S.sophie))).data.error, 'listen-closed');
  assert.equal((await call('POST', 'robot/listen', { code: 'P9' }, R)).status, 404);
  const open = await call('POST', 'robot/listen', { code: 'P1' }, R);
  assert.equal(open.status, 200);
  const s = open.data.s;
  assert.match(s, /^[A-Za-z0-9_-]{16,}$/);
  let me = await call('GET', 'family/me', undefined, B(S.sophie));
  assert.equal(me.data.listen.open, true);
  assert.equal(me.data.listen.available, true);
  const song = catalogue()[0];
  await call('POST', 'robot/listen', { s, now: { id: song.id, title: song.title, artist: song.artist } }, R);
  let fam = await call('GET', 'family/listen', undefined, B(S.sophie));
  assert.equal(fam.data.open, true);
  assert.equal(fam.data.now.title, song.title, 'the family sees what is playing');
  assert.equal(fam.data.s, undefined, 'the session id is the robot\'s only');
  const word = song.title.split(/\s+/).filter((w) => w.length > 3)[0] || song.title;
  const found = await call('GET', 'family/listen/search?q=' + encodeURIComponent(word), undefined, B(S.sophie));
  assert.ok(found.data.items.some((x) => x.id === song.id), 'search in the Play catalogue');
  assert.equal((await call('POST', 'family/listen', { add: 'notInTheCatalogue1' }, B(S.sophie))).data.error, 'not-in-catalogue', 'only catalogue songs');
  const second = catalogue()[1];
  fam = await call('POST', 'family/listen', { add: second.id, title: 'FAKE TITLE' }, B(S.sophie));
  assert.equal(fam.data.queue.length, 1);
  assert.equal(fam.data.queue[0].title, second.title, 'the title comes from the catalogue, not from the phone');
  assert.equal(fam.data.queue[0].by, 'Sophie');
  assert.equal(fam.data.queue[0].mine, true);
  const rob = await call('GET', 'robot/listen?s=' + encodeURIComponent(s), undefined, R);
  assert.equal(rob.data.queue.length, 1);
  assert.ok(rob.data.listeners.some((x) => x.name === 'Sophie'), 'the robot knows who listens');
  const took = await call('POST', 'robot/listen', { s, took: [rob.data.queue[0].qid], now: { id: second.id, title: second.title, artist: second.artist } }, R);
  assert.equal(took.data.queue.length, 0, 'played: out of the queue');
  const other = 'Robot other_robot_1.' + crypto.randomBytes(32).toString('base64url');
  assert.equal((await call('GET', 'robot/listen?s=' + encodeURIComponent(s), undefined, other)).status, 401);
  await call('POST', 'robot/listen', { s, close: true }, R);
  assert.equal((await call('GET', 'family/listen', undefined, B(S.sophie))).data.open, false, 'closed by the robot');
  /* A robot that stops polling: the session is no longer live after 90 s. */
  const open2 = await call('POST', 'robot/listen', { code: 'P1' }, R);
  assert.equal((await call('GET', 'family/listen', undefined, B(S.sophie))).data.open, true);
  clock += 2 * 60 * 1000;
  assert.equal((await call('GET', 'family/listen', undefined, B(S.sophie))).data.open, false, 'robot silent: not live');
  assert.equal((await call('POST', 'robot/listen', { s: open2.data.s, close: true }, R)).status, 200);
});

test('retention: old shown/refused messages and their photos go; invitations and offers expire', async () => {
  const m = await call('POST', 'family/message', { photo: jpeg(1000, 700) }, B(S.sophie));
  await call('POST', 'robot/decide', { id: m.data.message.id, decision: 'validate' }, R);
  await call('POST', 'robot/shown', { items: [{ id: m.data.message.id }] }, R);
  const inv = await call('POST', 'robot/invite', { rid: S.rid }, R);
  const o = await call('POST', 'family/offer', { months: 1 }, B(S.sophie));
  await call('POST', 'robot/offer', { id: o.data.offer.id, decision: 'activate' }, R);
  const pr = await call('POST', 'robot/premium-request', { code: 'P1', product: 'books', months: 1 }, R);
  assert.ok(photosOnDisk() >= 1);
  clock += 31 * DAY;
  portal.sweep();
  const d = portal._data();
  assert.equal(Object.keys(d.messages).length, 0, 'every message is older than 30 days now');
  assert.equal(photosOnDisk(), 0);
  assert.equal((await call('POST', 'family/invite', { code: inv.data.code })).status, 404);
  assert.equal(d.offers[o.data.offer.id].state, 'expired');
  assert.equal(d.requests[pr.data.request.id].state, 'expired', 'a request not answered in 14 days expires');
  assert.equal((await call('GET', 'family/me', undefined, B(S.sophie))).status, 200, 'the session itself lasts 180 days');
});

test('limits: body too big, bad JSON, CORS preflight', async () => {
  const big = await fetch(BASE + 'robot/resident', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: R }, body: JSON.stringify({ code: 'P9', label: 'x'.repeat(70000) }) });
  assert.equal(big.status, 413);
  const bad = await fetch(BASE + 'robot/resident', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: R }, body: '{oops' });
  assert.equal(bad.status, 400);
  const pre = await fetch(BASE + 'robot/state', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
});

test('store-server.mjs serves the portal, its manifest, its service worker and the API', async () => {
  const port = await new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env: Object.assign({}, process.env, { PORTAL_DATA: path.join(TMP, 'server') }), stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error('server did not start')), 15000);
      child.stdout.on('data', (b) => { if (String(b).includes('Close this window')) { clearTimeout(t); ok(); } });
      child.on('exit', (c) => { clearTimeout(t); ko(new Error('server exited ' + c)); });
    });
    const base = 'http://127.0.0.1:' + port + '/';
    for (const f of ['portail.html', 'portail.webmanifest', 'sw-portail.js', 'js/portail.js', 'css/portail.css', 'js/messages.js', 'js/messages-staff.js']) {
      const r = await fetch(base + f);
      assert.equal(r.status, 200, f);
    }
    assert.match((await fetch(base + 'portail.webmanifest')).headers.get('content-type'), /manifest\+json/);
    const png = Buffer.from(await (await fetch(base + 'portal/api/icon-192.png')).arrayBuffer());
    assert.equal(png.slice(1, 4).toString(), 'PNG');
    const k = crypto.randomBytes(32).toString('base64url');
    assert.equal((await call('POST', 'robot/hello', { robot: 'server_robot_1', key: k }, undefined, base + 'portal/api/')).status, 200);
    const big = await call('POST', 'family/message', { photo: 'data:image/jpeg;base64,' + 'A'.repeat(200000) }, 'Bearer ' + 'x'.repeat(40), base + 'portal/api/');
    assert.equal(big.status, 401, 'a large body reaches the portal (not cut at 64 KB) and needs a session');
    assert.equal((await fetch(base + 'labland/data/portal/portal.json')).status, 404, 'the data folder is never served');
  } finally {
    child.kill();
  }
});

test.after(() => {
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});
