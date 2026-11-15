// 1.16, agent N2: family notifications and call requests (labland/family-notify.mjs, family-callreq.mjs).
// Run: node tests/notify.test.mjs
// - Web Push crypto: the RFC 8291 test vector, our own round trip, VAPID (RFC 8292) signature checks;
// - a local push receiver (127.0.0.1) that decrypts every push like a phone and checks its VAPID header;
// - routing: only the persons linked to a resident, only the one concerned;
// - BF-17 family request -> Care Team -> invitation -> missed-call notice; BF-18 resident request ->
//   invitation to the linked relatives -> answered (no missed notice); the in-app bell (FR/DE/EN).
// Everything on free ports, data in a temporary folder (deleted at the end): labland/data is never
// touched. The call relay is the real one (labland/call-relay.mjs) with short times. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-notify-test-'));
process.env.PORTAL_DATA = path.join(TMP, 'portal');          // the shared instances, if anything reaches them
process.env.BELLATRIX_NOTIFY_NO_REGISTER = '1';              // the tests register their own instances below
const Portal = await import('../labland/family-portal.mjs');
const N = await import('../labland/family-notify.mjs');
const C = await import('../labland/family-callreq.mjs');
const { createRelay } = await import('../labland/call-relay.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = () => {};

/* ---------- a local push service: decrypts like a phone ---------- */
const phones = {};   // name -> { priv, pub, auth, got: [] }
function phone(name) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const p = { name, priv: N.b64u(e.getPrivateKey()), pub: N.b64u(e.getPublicKey()), auth: N.b64u(crypto.randomBytes(16)), got: [], status: 201 };
  phones[name] = p;
  return p;
}
const pushServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const name = req.url.split('/').pop(), p = phones[name];
    if (!p) { res.writeHead(404); res.end(); return; }
    const body = Buffer.concat(chunks);
    let msg = null, err = '';
    try { msg = JSON.parse(N.decryptPayload(body, p.priv, p.auth).toString('utf8')); } catch (e) { err = String(e.message || e); }
    const vap = N.verifyVapid(req.headers.authorization, PUSH + name, Date.now());
    p.got.push({ msg, err, vapidOk: !!(vap && vap.ok), key: vap && vap.key, headers: req.headers, size: body.length });
    res.writeHead(p.status); res.end();
  });
});
await new Promise((ok) => pushServer.listen(0, '127.0.0.1', ok));
const PUSH = 'http://127.0.0.1:' + pushServer.address().port + '/push/';
const sub = (p) => ({ endpoint: PUSH + p.name, keys: { p256dh: p.pub, auth: p.auth } });

/* ---------- the portal (M's), our modules, the real call relay ---------- */
const portal = Portal.createPortal({ dataDir: path.join(TMP, 'portal'), log: quiet, rateLimit: false });
const relay = createRelay({ dataFile: path.join(TMP, 'call-data.json'), outMs: 1500, log: quiet });
const notifier = N.createNotify({ dataDir: path.join(TMP, 'portal'), portal, log: quiet, allowEndpoint: (u) => u.hostname === '127.0.0.1' });
const calls = C.createCallReq({ dataDir: path.join(TMP, 'portal'), portal, notify: (pid, ev) => notifier.notify(pid, ev), relay: C.relayAdapter(relay.handle), log: quiet, timer: false, missAfterMs: 400 });
Portal.registerRoutes('family/notify', (req, url, body, ctx) => notifier.familyRoute(req, url, body, ctx));
Portal.registerRoutes('family/calls', (req, url, body, ctx) => calls.familyRoute(req, url, body, ctx));
Portal.registerRoutes('robot/calls', (req, url, body, ctx) => calls.robotRoute(req, url, body, ctx));
Portal.setNotifier((pid, ev) => { notifier.notify(pid, ev); });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/portal/api/')) portal.handle(req, res, url); else { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port + '/portal/api/';
async function call(method, p, body, auth) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
function relayCall(method, p, body) { return Promise.resolve(relay.handle({ method, headers: { host: 'localhost' } }, new URL('http://localhost/call/api/' + p), body || {}, null)); }
const ROBOT = 'robot_' + crypto.randomBytes(9).toString('base64url'), KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + ROBOT + '.' + KEY;
const OTHER = 'robot_' + crypto.randomBytes(9).toString('base64url'), KEY2 = crypto.randomBytes(32).toString('base64url'), R2 = 'Robot ' + OTHER + '.' + KEY2;
const B = (t) => 'Bearer ' + t;
const S = {};
/* A push arrives a moment after the request that caused it. */
async function pushes(p, n, ms = 3000) { const t0 = Date.now(); while (p.got.length < n && Date.now() - t0 < ms) await sleep(20); return p.got; }
async function family(rid, name, email, lang, auth) {
  const inv = await call('POST', 'robot/invite', { rid }, auth || R);
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  const reg = await call('POST', 'family/register', { code: inv.data.code, email, name, relation: 'petite-fille', lang, consent: true });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation:
     the head finds it in its pending list and validates it, as js/messages-staff.js does. */
  const acc = (await call('GET', 'robot/state', undefined, auth || R)).data.residents.find((r) => r.rid === rid).accounts.find((a) => a.email === email && a.status === 'pending');
  assert.ok(acc, 'waiting in the care team\'s list: ' + email);
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, auth || R)).data.status, 'active');
  const who = portal.authFamily({ headers: { authorization: B(reg.data.token) } });
  assert.ok(who && who.pid, 'authFamily gives the person');
  /* the validation is told in the bell ("access approved"); the relative has seen it: the bell starts read */
  const own = (await call('GET', 'family/notify', undefined, B(reg.data.token))).data;
  assert.deepEqual(own.items.map((x) => x.type), ['access'], 'the validation is in the bell');
  assert.equal((await call('POST', 'family/notify/read', { all: true }, B(reg.data.token))).data.unread, 0);
  return { token: reg.data.token, pid: who.pid, name, link: who.id };
}

test('Web Push crypto: RFC 8291 test vector, round trip, VAPID', () => {
  const V = { plain: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24', asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', uaPriv: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', salt: 'DGv6ra1nlYgDCS1FRnbzlw', auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN' };
  assert.equal(N.b64u(N.encryptPayload(N.unb64u(V.plain), V.uaPub, V.auth, { salt: V.salt, senderPrivate: V.asPriv })), V.body, 'byte for byte the RFC 8291 example');
  assert.equal(N.decryptPayload(N.unb64u(V.body), V.uaPriv, V.auth).toString(), 'When I grow up, I want to be a watermelon');
  const p = phone('roundtrip'), text = JSON.stringify({ title: 'Mamie a lu votre message', body: 'é ü ß ✓'.repeat(50) });
  const enc = N.encryptPayload(Buffer.from(text), p.pub, p.auth);
  assert.equal(N.decryptPayload(enc, p.priv, p.auth).toString(), text);
  assert.notEqual(N.b64u(N.encryptPayload(Buffer.from(text), p.pub, p.auth)), N.b64u(enc), 'a new salt and key every time');
  const bad = Buffer.from(enc); bad[bad.length - 3] ^= 1;
  assert.throws(() => N.decryptPayload(bad, p.priv, p.auth), 'a changed byte is refused (GCM tag)');
  assert.throws(() => N.encryptPayload(Buffer.alloc(4100), p.pub, p.auth), /too-big/);
  assert.throws(() => N.encryptPayload(Buffer.from('x'), 'AAAA', p.auth), /bad-keys/);
  const k = N.newVapidKeys();
  assert.equal(N.unb64u(k.publicKey).length, 65);
  assert.equal(N.unb64u(k.privateKey).length, 32);
  const h = N.vapidAuth('https://fcm.googleapis.com/fcm/send/x', k, 'mailto:a@b.example', Date.now());
  const v = N.verifyVapid(h, 'https://fcm.googleapis.com/fcm/send/x', Date.now());
  assert.equal(v.ok, true);
  assert.equal(v.claims.aud, 'https://fcm.googleapis.com');
  assert.equal(N.verifyVapid(h, 'https://updates.push.services.mozilla.com/wpush/v2/x', Date.now()).ok, false, 'another audience');
  assert.equal(N.verifyVapid(h.replace(/k=.*/, 'k=' + N.newVapidKeys().publicKey), 'https://fcm.googleapis.com/x', Date.now()).ok, false, 'another key');
});

test('texts: every notice in FR, DE and EN, nothing left untranslated', () => {
  const types = ['message_read', 'payment_request', 'premium_active', 'call_invite', 'call_missed', 'call_cancelled', 'call_later', 'test'];
  const seen = {};
  for (const type of types) for (const l of ['fr', 'de', 'en']) {
    const t = N.textOf({ type, vars: { label: 'Mamie', product: 'books', until: '2026-11-10T15:42:00Z' } }, l);
    assert.ok(t.title.length > 3, type + ' ' + l);
    assert.ok(!/\{\w+\}/.test(t.title + t.body), 'no {placeholder} left: ' + type + ' ' + l);
    seen[type] = seen[type] || {};
    seen[type][l] = t.title;
  }
  for (const type of types) assert.equal(new Set(Object.values(seen[type])).size, 3, 'three different languages: ' + type);
  assert.match(N.textOf({ type: 'payment_request', vars: { label: 'Opa', product: 'books' } }, 'de').title, /Bücher Premium für Opa/);
  assert.match(N.textOf({ type: 'message_read', vars: { label: 'Mamie', text: 'Bonjour' } }, 'fr').body, /« Bonjour »/);
  assert.equal(N.textOf({ type: 'feed_event', title: { fr: 'Nouvelle photo', de: 'Neues Foto', en: 'New photo' } }, 'de').title, 'Neues Foto');
  assert.match(N.textOf({ type: 'premium_active', vars: { label: 'Mamie', product: 'play' } }, 'fr').title, /Bellatrix Play Premium est actif pour Mamie/);
});

test('setup: one robot, two residents, three relatives', async () => {
  for (const [id, key] of [[ROBOT, KEY], [OTHER, KEY2]]) assert.equal((await call('POST', 'robot/hello', { robot: id, key })).status, 200);
  S.p1 = (await call('POST', 'robot/resident', { code: 'P1', label: 'Mamie', lang: 'fr' }, R)).data.rid;
  S.p2 = (await call('POST', 'robot/resident', { code: 'P2', label: 'Opa', lang: 'de' }, R)).data.rid;
  S.x9 = (await call('POST', 'robot/resident', { code: 'P1', label: 'Elsewhere', lang: 'en' }, R2)).data.rid;
  assert.ok(S.p1 && S.p2 && S.x9 && S.p1 !== S.x9);
  S.sophie = await family(S.p1, 'Sophie', 'sophie@example.test', 'fr');
  S.paul = await family(S.p1, 'Paul', 'paul@example.test', 'en');
  S.lea = await family(S.p2, 'Lea', 'lea@example.test', 'de');
  S.zed = await family(S.x9, 'Zed', 'zed@example.test', 'en', R2);
  assert.deepEqual(portal.personsOfResident(S.p1).sort(), [S.sophie.pid, S.paul.pid].sort());
});

test('subscriptions: only real push services; the bell answers without one', async () => {
  assert.equal((await call('GET', 'family/notify')).status, 401, 'signed in only');
  assert.equal((await call('POST', 'family/notify/subscribe', { subscription: { endpoint: 'https://evil.example/x', keys: { p256dh: phone('evil').pub, auth: phones.evil.auth } } }, B(S.sophie.token))).status, 400);
  assert.equal((await call('POST', 'family/notify/subscribe', { subscription: { endpoint: PUSH + 'x', keys: { p256dh: 'AAAA', auth: 'BBBB' } } }, B(S.sophie.token))).status, 400, 'bad keys');
  // The shared rule (no test override): https and the browsers' push services only.
  const strict = N.createNotify({ dataDir: path.join(TMP, 'strict'), portal, log: quiet });
  const fam = { pid: 'p', id: 'l', rid: 'r', lang: 'fr' }, try1 = (endpoint) => strict.familyRoute({ method: 'POST' }, null, { subscription: { endpoint, keys: { p256dh: phones.evil.pub, auth: phones.evil.auth } } }, { family: fam, path: '/subscribe', q: () => '' })[0];
  assert.equal(try1('https://fcm.googleapis.com/fcm/send/abc'), 200);
  assert.equal(try1('https://web.push.apple.com/QGx'), 200);
  assert.equal(try1('https://updates.push.services.mozilla.com/wpush/v2/abc'), 200);
  assert.equal(try1('http://fcm.googleapis.com/fcm/send/abc'), 400, 'https only');
  assert.equal(try1('https://googleapis.com.evil.example/x'), 400);
  assert.equal(try1('https://127.0.0.1/x'), 400);
  for (const [who, name] of [['sophie', 'sophie-phone'], ['paul', 'paul-phone'], ['lea', 'lea-phone'], ['zed', 'zed-phone']]) {
    const r = await call('POST', 'family/notify/subscribe', { subscription: sub(phone(name)), lang: S[who] === S.lea ? 'de' : S[who] === S.paul ? 'en' : 'fr' }, B(S[who].token));
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const key = (await call('GET', 'family/notify/key', undefined, B(S.sophie.token))).data.key;
  assert.equal(N.unb64u(key).length, 65, 'the VAPID public key for PushManager.subscribe');
  assert.ok(fs.existsSync(path.join(TMP, 'portal', 'vapid-keys.json')), 'kept on the server');
  const me = (await call('GET', 'family/notify?lang=fr', undefined, B(S.sophie.token))).data;
  assert.equal(me.push.devices, 1);
  assert.equal(me.unread, 0);
});

test('BF-25 routing: message read -> only its sender; payment request -> only that resident\'s family', async () => {
  Portal.notify(S.sophie.pid, { type: 'message-read', message: 'm1', kind: 'text', rid: S.p1, label: 'Mamie', text: 'Bonjour Mamie, à dimanche !' });
  const got = await pushes(phones['sophie-phone'], 1);
  assert.equal(got.length, 1);
  assert.equal(got[0].err, '', 'decrypted');
  assert.equal(got[0].vapidOk, true, 'signed with VAPID for this push service');
  assert.equal(got[0].key, notifier.publicKey(), 'with the server\'s VAPID key');
  assert.equal(got[0].headers['content-encoding'], 'aes128gcm');
  assert.ok(Number(got[0].headers.ttl) > 0 && got[0].headers.topic.length <= 32);
  assert.equal(got[0].msg.title, 'Mamie a lu votre message');
  assert.match(got[0].msg.body, /Bonjour Mamie/);
  await sleep(150);
  assert.equal(phones['paul-phone'].got.length + phones['lea-phone'].got.length + phones['zed-phone'].got.length, 0, 'nobody else');
  notifier.notifyResident(S.p1, { type: 'payment-request', request: 'q1', label: 'Mamie', product: 'play' });
  await pushes(phones['paul-phone'], 1);
  await pushes(phones['sophie-phone'], 2);
  assert.equal(phones['paul-phone'].got[0].msg.title, 'Bellatrix Play Premium for Mamie', 'Paul reads English');
  assert.equal(phones['sophie-phone'].got[1].msg.title, 'Bellatrix Play Premium pour Mamie');
  assert.equal(phones['sophie-phone'].got[1].msg.tab, 'premium');
  await sleep(150);
  assert.equal(phones['lea-phone'].got.length + phones['zed-phone'].got.length, 0, 'not the family of another resident or robot');
  const bell = (await call('GET', 'family/notify?lang=de', undefined, B(S.sophie.token))).data;
  assert.equal(bell.unread, 2);
  assert.equal(bell.items[0].title, 'Bellatrix Play Premium für Mamie', 'the bell in the page language');
  assert.deepEqual((await call('GET', 'family/notify', undefined, B(S.lea.token))).data.items.map((x) => x.type), ['access'], 'Lea: only her own validation, nothing of Mamie');
  assert.equal((await call('POST', 'family/notify/read', { ids: [bell.items[1].id] }, B(S.sophie.token))).data.unread, 1);
  assert.equal((await call('POST', 'family/notify/read', { all: true }, B(S.sophie.token))).data.unread, 0);
});

test('BF-25 end to end: the robot reports a message read -> the portal tells its sender only', async () => {
  const sent = await call('POST', 'family/message', { text: 'Coucou Mamie' }, B(S.paul.token));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const n = { paul: phones['paul-phone'].got.length, sophie: phones['sophie-phone'].got.length };
  const read = await call('POST', 'robot/read', { items: [{ id: sent.data.message.id, at: new Date().toISOString() }] }, R);
  assert.equal(read.data.updated, 1);
  const got = await pushes(phones['paul-phone'], n.paul + 1);
  assert.equal(got[n.paul].msg.title, 'Mamie read your message', 'through family-portal.mjs notify() and setNotifier');
  await sleep(150);
  assert.equal(phones['sophie-phone'].got.length, n.sophie, 'not the other relative');
});

test('BF-17: the family asks for a call; the Care Team sees it; Later tells the family', async () => {
  assert.equal((await call('GET', 'family/calls')).status, 401);
  assert.equal((await call('GET', 'robot/calls')).status, 401);
  const r = await call('POST', 'family/calls/request', { when: 'today', note: 'Libre après 18 h' }, B(S.sophie.token));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  S.req = r.data.request;
  assert.equal(S.req.state, 'open');
  assert.equal((await call('POST', 'family/calls/request', { when: 'soon' }, B(S.sophie.token))).data.existing, true, 'one open request at a time');
  assert.equal((await call('POST', 'family/calls/request', { note: 'www.spam.com' }, B(S.paul.token))).data.error, 'no-links');
  const team = (await call('GET', 'robot/calls', undefined, R)).data;
  const seen = team.requests.find((q) => q.id === S.req.id);
  assert.ok(seen, 'visible to the Care Team');
  assert.equal(seen.name, 'Sophie');
  assert.equal(seen.code, 'P1');
  assert.equal(seen.label, 'Mamie');
  assert.equal(seen.when, 'today');
  assert.equal(seen.note, 'Libre après 18 h');
  assert.ok(team.residents.find((x) => x.code === 'P1').family.some((f) => f.name === 'Sophie' && f.pid === S.sophie.pid));
  assert.equal((await call('GET', 'robot/calls', undefined, R2)).data.requests.length, 0, 'another robot sees nothing');
  const before = phones['sophie-phone'].got.length;
  const later = await call('POST', 'robot/calls/decide', { id: S.req.id, decision: 'later', minutes: 30 }, R);
  assert.equal(later.data.request.state, 'later');
  const got = await pushes(phones['sophie-phone'], before + 1);
  assert.equal(got[before].msg.type, 'call_later');
  assert.equal(got[before].msg.title, 'Demande d’appel : un peu plus tard');
  assert.equal((await call('GET', 'family/calls', undefined, B(S.sophie.token))).data.request.state, 'later');
});

test('BF-17/19: Call now -> invitation to the one who asked -> nobody joins -> missed-call notice', async () => {
  // What js/callreq-staff.js does: the existing outgoing call of the relay, then its token to the portal.
  await relayCall('POST', 'robot/state', { robot: ROBOT, state: 'idle', residents: {} });
  const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  const token = out[1].token;
  const sophie0 = phones['sophie-phone'].got.length, paul0 = phones['paul-phone'].got.length;
  const inv = await call('POST', 'robot/calls/invite', { code: 'P1', token, requestId: S.req.id, contact: 'Sophie' }, R);
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  S.inv = inv.data.invite;
  assert.equal(S.inv.count, 1, 'only the person who asked');
  const got = await pushes(phones['sophie-phone'], sophie0 + 1);
  const m = got[sophie0].msg;
  assert.equal(m.type, 'call_invite');
  assert.equal(m.title, 'Mamie vous appelle', 'it rings: the caller and "vous appelle"');
  assert.equal(m.ring, true);
  assert.deepEqual(m.actions.map((a) => a.action + ':' + a.title), ['accept:Répondre', 'decline:Refuser'], 'Answer / Decline on the notification');
  assert.equal(m.actions[0].url, 'famille.html#j=' + token + '&go=1', 'Answer joins at once');
  assert.ok(m.decline && m.decline.invite === m.invite && m.decline.pid === S.sophie.pid && m.decline.k.length >= 16, 'Decline carries its own key');
  assert.ok(Number(got[sophie0].headers.ttl) <= 60, 'a short TTL: ' + got[sophie0].headers.ttl);
  assert.equal(m.url, 'famille.html#j=' + token + '&go=1', 'a tap goes straight into the call');
  assert.equal(m.sticky, true);
  assert.equal(got[sophie0].headers.urgency, 'high');
  await sleep(150);
  assert.equal(phones['paul-phone'].got.length, paul0, 'Paul did not ask');
  const fam = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.equal(fam.invite.token, token, 'the join button for Sophie');
  assert.equal(fam.request.state, 'calling');
  assert.equal((await call('GET', 'family/calls', undefined, B(S.paul.token))).data.invite, null, 'no join link for Paul');
  assert.equal((await call('POST', 'robot/calls/invite', { code: 'P1', token: crypto.randomBytes(16).toString('base64url') }, R)).status, 404, 'a token the relay does not know');
  assert.equal((await call('POST', 'robot/calls/invite', { code: 'P1', token }, R2)).status, 404, 'not this robot\'s resident... ');
  // Nobody joins: the relay's invitation runs out (1.5 s here, 30 min for real).
  await sleep(1700);
  calls.sweep();
  const after = await pushes(phones['sophie-phone'], sophie0 + 2);
  assert.equal(after[sophie0 + 1].msg.type, 'call_missed');
  assert.equal(after[sophie0 + 1].msg.title, 'Appel manqué de Mamie');
  assert.equal(after[sophie0 + 1].headers.topic, got[sophie0].headers.topic, 'replaces the invitation on the phone (same topic and tag)');
  const team = (await call('GET', 'robot/calls', undefined, R)).data;
  assert.equal(team.invites.find((v) => v.id === S.inv.id).state, 'missed');
  assert.equal(team.requests.find((q) => q.id === S.req.id).outcome, 'missed');
  const fam2 = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.equal(fam2.invite, null);
  assert.equal(fam2.request, null, 'Sophie may ask again');
  assert.equal(fam2.recent[0].state, 'missed');
  const bell = (await call('GET', 'family/notify?lang=fr', undefined, B(S.sophie.token))).data;
  assert.equal(bell.items.filter((x) => x.invite === S.inv.id).length, 1, 'in the bell, the missed call replaced the invitation');
  assert.equal(bell.items[0].type, 'call_missed');
});

test('BF-18: the resident asks -> the linked relatives are invited -> joined: no missed notice', async () => {
  const r = await call('POST', 'robot/calls/request', { code: 'P1' }, R);
  assert.equal(r.status, 200);
  assert.equal(r.data.request.from, 'resident');
  assert.equal((await call('POST', 'robot/calls/request', { code: 'P1' }, R)).data.existing, true);
  assert.equal((await call('POST', 'robot/calls/request', { code: 'P9' }, R)).status, 404);
  assert.ok((await call('GET', 'robot/calls', undefined, R)).data.requests.some((q) => q.id === r.data.request.id && q.from === 'resident'));
  const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  const counts = { sophie: phones['sophie-phone'].got.length, paul: phones['paul-phone'].got.length, lea: phones['lea-phone'].got.length };
  const inv = await call('POST', 'robot/calls/invite', { code: 'P1', token: out[1].token, requestId: r.data.request.id }, R);
  assert.equal(inv.data.invite.count, 2, 'every relative linked to P1');
  assert.equal((await pushes(phones['paul-phone'], counts.paul + 1))[counts.paul].msg.title, 'Mamie is calling');
  assert.equal((await pushes(phones['sophie-phone'], counts.sophie + 1))[counts.sophie].msg.type, 'call_invite');
  // Paul joins and the robot answers (the real relay).
  const j = await relayCall('POST', 'join', { j: out[1].token, sdp: 'v=0 offer' });
  assert.equal(j[1].state, 'ringing');
  assert.equal((await relayCall('POST', 'call/' + j[1].call, { type: 'answer', sdp: 'v=0 answer', robot: ROBOT }))[1].state, 'live');
  calls.sweep();
  const team = (await call('GET', 'robot/calls', undefined, R)).data;
  assert.equal(team.invites.find((v) => v.id === inv.data.invite.id).state, 'answered');
  assert.equal(team.requests.find((q) => q.id === r.data.request.id).state, 'done');
  await sleep(1700);
  calls.sweep();
  await sleep(150);
  assert.equal(phones['paul-phone'].got.length, counts.paul + 1, 'no missed notice after a call that took place');
  assert.equal(phones['sophie-phone'].got.length, counts.sophie + 1);
  assert.equal(phones['lea-phone'].got.length, counts.lea, 'never the family of another resident');
});

test('Tap "Appeler": the invitation goes to the linked, validated relatives of that resident only', async () => {
  // A third relative of P1, then suspended by the team: linked no more, so not invited.
  S.gus = await family(S.p1, 'Gus', 'gus@example.test', 'fr');
  assert.equal((await call('POST', 'family/notify/subscribe', { subscription: sub(phone('gus-phone')), lang: 'fr' }, B(S.gus.token))).status, 200);
  assert.equal((await call('POST', 'robot/account/status', { account: S.gus.link, status: 'suspended' }, R)).status, 200);
  const n = { sophie: phones['sophie-phone'].got.length, paul: phones['paul-phone'].got.length };
  const other = { lea: phones['lea-phone'].got.length, zed: phones['zed-phone'].got.length, gus: phones['gus-phone'].got.length };
  // What the Care Team does on "Appeler": the relay's outgoing call, then the invitation for the resident (no names, no choice).
  const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  const inv = await call('POST', 'robot/calls/invite', { code: 'P1', token: out[1].token }, R);
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  assert.equal(inv.data.invite.count, 2, 'Sophie and Paul');
  assert.equal((await pushes(phones['sophie-phone'], n.sophie + 1))[n.sophie].msg.title, 'Mamie vous appelle');
  assert.equal((await pushes(phones['paul-phone'], n.paul + 1))[n.paul].msg.title, 'Mamie is calling');
  for (const who of ['sophie', 'paul']) assert.equal((await call('GET', 'family/calls', undefined, B(S[who].token))).data.invite.token, out[1].token, 'the join link in the portal: ' + who);
  assert.equal((await call('GET', 'family/notify?lang=fr', undefined, B(S.sophie.token))).data.items[0].type, 'call_invite', 'and in the bell');
  await sleep(250);
  assert.equal(phones['lea-phone'].got.length, other.lea, 'not the family of another resident');
  assert.equal(phones['zed-phone'].got.length, other.zed, 'not the family of another robot');
  assert.equal(phones['gus-phone'].got.length, other.gus, 'not a suspended relative');
  assert.equal((await call('GET', 'family/calls', undefined, B(S.lea.token))).data.invite, null);
  await relayCall('POST', 'outgoing/cancel', { robot: ROBOT, token: out[1].token });
  calls.sweep();
});

test('BF-19: cancelled at once -> "cancelled"; cancelled after a while -> "missed"', async () => {
  const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  await sleep(300);   // the "cancelled" notices of the test before
  const n = phones['paul-phone'].got.length;
  await call('POST', 'robot/calls/invite', { code: 'P1', token: out[1].token, pids: [S.paul.pid, S.lea.pid] }, R);
  const g = await pushes(phones['paul-phone'], n + 1);
  assert.equal(g[n].msg.type, 'call_invite');
  await sleep(100);
  assert.equal(phones['lea-phone'].got.length, 0, 'a person not linked to P1 is never invited, even when asked for');
  await relayCall('POST', 'outgoing/cancel', { robot: ROBOT, token: out[1].token });
  calls.sweep();
  assert.equal((await pushes(phones['paul-phone'], n + 2))[n + 1].msg.title, 'Call with Mamie cancelled');
  const out2 = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  await call('POST', 'robot/calls/invite', { code: 'P1', token: out2[1].token, pids: [S.paul.pid] }, R);
  await pushes(phones['paul-phone'], n + 3);
  await sleep(500);   // longer than missAfterMs (1 min for real)
  const end = await call('POST', 'robot/calls/invite/end', { token: out2[1].token, reason: 'cancelled' }, R);
  assert.equal(end.data.invite.state, 'missed');
  assert.equal((await pushes(phones['paul-phone'], n + 4))[n + 3].msg.title, 'Missed call from Mamie');
});

/* 15 Nov: a call from Bellatrix rings: the portal asks what rings (every 3 s), Decline from the phone's notification
   (its key, no session) tells the robot: the relay's invitation ends 'declined' (the tablet and the head say so). */
test('ringing: family/calls/ring, Decline with the notification\'s key -> the robot hears "declined"; no missed notice', async () => {
  const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  const n = phones['sophie-phone'].got.length;
  const inv = await call('POST', 'robot/calls/invite', { code: 'P1', token: out[1].token, pids: [S.sophie.pid] }, R);
  assert.equal(inv.status, 200);
  assert.ok(inv.data.invite.ringUntil, 'it rings for a while');
  const ring = (await call('GET', 'family/calls/ring', undefined, B(S.sophie.token))).data.ring;
  assert.equal(ring.token, out[1].token); assert.equal(ring.label, 'Mamie'); assert.ok(ring.left > 30000 && ring.left <= 45000, 'about 45 s: ' + ring.left);
  assert.equal((await call('GET', 'family/calls/ring', undefined, B(S.paul.token))).data.ring, null, 'not for Paul');
  const m = (await pushes(phones['sophie-phone'], n + 1))[n].msg;
  assert.equal((await call('POST', 'family/calls/decline', { invite: m.decline.invite, pid: m.decline.pid, k: 'x'.repeat(32) })).status, 403, 'a wrong key');
  assert.equal((await call('POST', 'family/calls/decline', { invite: m.decline.invite, pid: S.paul.pid, k: m.decline.k })).status, 403, 'the key is for Sophie only');
  const d = await call('POST', 'family/calls/decline', m.decline);
  assert.equal(d.status, 200); assert.equal(d.data.state, 'declined');
  assert.equal((await relayCall('GET', 'outgoing/info?robot=' + ROBOT + '&token=' + out[1].token))[1].state, 'declined', 'the robot is told');
  assert.equal((await relayCall('GET', 'status?j=' + out[1].token))[0], 410, 'the link no longer joins');
  assert.equal((await call('GET', 'family/calls/ring', undefined, B(S.sophie.token))).data.ring, null, 'it stops ringing');
  await sleep(300);
  assert.equal(phones['sophie-phone'].got.length, n + 1, 'no missed-call notice after a decline');
  /* signed in (the portal's red button) */
  const out2 = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
  const inv2 = await call('POST', 'robot/calls/invite', { code: 'P1', token: out2[1].token, pids: [S.sophie.pid] }, R);
  assert.equal((await call('POST', 'family/calls/decline', { invite: inv2.data.invite.id }, B(S.sophie.token))).data.state, 'declined');
  assert.equal((await relayCall('GET', 'outgoing/info?robot=' + ROBOT + '&token=' + out2[1].token))[1].state, 'declined');
});

test('ringing: nobody answers within the ring -> missed, the robot stops waiting', async () => {
  const calls2 = C.createCallReq({ dataDir: path.join(TMP, 'portal'), portal, notify: (pid, ev) => notifier.notify(pid, ev), relay: C.relayAdapter(relay.handle), log: quiet, timer: false, ringMs: 300, ringGraceMs: 100 });
  Portal.registerRoutes('robot/calls', (req, url, body, ctx) => calls2.robotRoute(req, url, body, ctx));
  try {
    const out = await relayCall('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Mamie', lang: 'fr' });
    const n = phones['paul-phone'].got.length;
    await call('POST', 'robot/calls/invite', { code: 'P1', token: out[1].token, pids: [S.paul.pid] }, R);
    await pushes(phones['paul-phone'], n + 1);
    await sleep(500);
    calls2.sweep();
    assert.equal((await relayCall('GET', 'outgoing/info?robot=' + ROBOT + '&token=' + out[1].token))[1].state, 'missed', 'the robot hears "missed"');
    assert.equal((await pushes(phones['paul-phone'], n + 2))[n + 1].msg.title, 'Missed call from Mamie');
  } finally { Portal.registerRoutes('robot/calls', (req, url, body, ctx) => calls.robotRoute(req, url, body, ctx)); calls2.stop(); }
});

test('a phone that left (410) is forgotten; the test notification', async () => {
  phones['lea-phone'].status = 410;
  const t = await call('POST', 'family/notify/test', {}, B(S.lea.token));
  assert.equal(t.status, 200);
  await pushes(phones['lea-phone'], 1);
  await sleep(100);
  assert.equal(phones['lea-phone'].got[0].msg.title, 'Benachrichtigungen sind an');
  assert.equal((await call('GET', 'family/notify', undefined, B(S.lea.token))).data.push.devices, 0, 'subscription removed');
  assert.deepEqual((await call('GET', 'family/notify', undefined, B(S.lea.token))).data.items.map((x) => x.type), ['test', 'access'], 'still in the bell (after her validation notice)');
  const un = await call('POST', 'family/notify/unsubscribe', { endpoint: PUSH + 'paul-phone' }, B(S.paul.token));
  assert.equal(un.data.devices, 0);
});

test.after(() => {
  calls.stop(); relay.stop();
  server.close(); pushServer.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});
