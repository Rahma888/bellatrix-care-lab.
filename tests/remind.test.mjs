// 14 Nov: the family's reminder "You have not talked with {first name} for N days. Now, or plan a date?"
// (labland/family-callreq.mjs, family-notify.mjs, sw-portail.js, js/portail-calls.js).
// Run: node tests/remind.test.mjs
// - no reminder before REMIND_DAYS (7) days without a call and without a message; one at 7 days, in the
//   relative's language, as a push with the two buttons "Now" / "Plan a date" and in the bell;
// - never twice within 7 days; a message or a call starts the count again; nothing at night;
// - the banner of the portal (family/calls 'reminder'), also when no push could be sent;
// - "Plan a date": a planned call saved on the server, shown in the portal and to the Care Team;
// - the test hook (remindMs / FAMILY_REMIND_MINUTES) shortens the delay.
// A clock of its own, free ports, data in a temporary folder (deleted at the end): labland/data is never
// touched. Nothing makes a sound (no browser). Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-remind-test-'));
process.env.PORTAL_DATA = path.join(TMP, 'portal');
process.env.BELLATRIX_NOTIFY_NO_REGISTER = '1';
delete process.env.FAMILY_REMIND_DAYS; delete process.env.FAMILY_REMIND_MINUTES;
const Portal = await import('../labland/family-portal.mjs');
const N = await import('../labland/family-notify.mjs');
const C = await import('../labland/family-callreq.mjs');
const quiet = () => {};
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The clock: a Monday at noon (the server's own time zone: reminders only go out between 9:00 and 20:00). */
let clock = new Date(2026, 10, 2, 12, 0, 0).getTime();
const now = () => clock;

/* ---------- a local push service: decrypts like a phone ---------- */
const phones = {};
function phone(name) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const p = { name, priv: N.b64u(e.getPrivateKey()), pub: N.b64u(e.getPublicKey()), auth: N.b64u(crypto.randomBytes(16)), got: [] };
  phones[name] = p;
  return p;
}
const pushServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const p = phones[req.url.split('/').pop()];
    if (!p) { res.writeHead(404); res.end(); return; }
    p.got.push(JSON.parse(N.decryptPayload(Buffer.concat(chunks), p.priv, p.auth).toString('utf8')));
    res.writeHead(201); res.end();
  });
});
await new Promise((ok) => pushServer.listen(0, '127.0.0.1', ok));
const PUSH = 'http://127.0.0.1:' + pushServer.address().port + '/push/';
const sub = (p) => ({ endpoint: PUSH + p.name, keys: { p256dh: p.pub, auth: p.auth } });
async function pushes(p, n, ms = 3000) { const t0 = Date.now(); while (p.got.length < n && Date.now() - t0 < ms) await sleep(20); return p.got; }

/* ---------- the portal, the notifications, the call requests: all on the test clock ---------- */
const dataDir = path.join(TMP, 'portal');
const portal = Portal.createPortal({ dataDir, now, log: quiet, rateLimit: false });
const notifier = N.createNotify({ dataDir, portal, now, log: quiet, allowEndpoint: (u) => u.hostname === '127.0.0.1' });
const lastCalls = {};   // a relative's own video-call link -> the last call taken through it
const relay = { info: () => ({ state: 'unknown' }), cancel() {}, last: (robot, token) => lastCalls[token] || null };
const logged = [];
const calls = C.createCallReq({ dataDir, portal, notify: (pid, ev) => notifier.notify(pid, ev), relay, log: (t) => logged.push(t), timer: false, now });
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
const ROBOT = 'robot_' + crypto.randomBytes(9).toString('base64url'), KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + ROBOT + '.' + KEY;
const B = (t) => 'Bearer ' + t;
const S = {};
async function family(rid, name, email, lang) {
  const inv = await call('POST', 'robot/invite', { rid }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email, name, relation: 'fille', lang, consent: true });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation:
     the head finds it in its pending list and validates it, as js/messages-staff.js does. */
  const acc = (await call('GET', 'robot/state', undefined, R)).data.residents.find((r) => r.rid === rid).accounts.find((a) => a.email === email && a.status === 'pending');
  assert.ok(acc, 'waiting in the care team\'s list: ' + email);
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R)).data.status, 'active');
  const who = portal.authFamily({ headers: { authorization: B(reg.data.token) } });
  return { token: reg.data.token, pid: who.pid, link: who.id, name };
}
const bell = async (who, lang) => (await call('GET', 'family/notify' + (lang ? '?lang=' + lang : ''), undefined, B(who.token))).data.items.filter((x) => x.type === 'talk_reminder');
const reminderOf = (who) => calls._data().reminders[who.pid + '|' + S.rid] || null;

test('setup: one resident, two relatives (French and German), their phones', async () => {
  assert.equal((await call('POST', 'robot/hello', { robot: ROBOT, key: KEY })).status, 200);
  S.rid = (await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R)).data.rid;
  S.sophie = await family(S.rid, 'Sophie', 'sophie@example.test', 'fr');
  S.lea = await family(S.rid, 'Lea', 'lea@example.test', 'de');
  assert.equal((await call('POST', 'family/notify/subscribe', { subscription: sub(phone('sophie-phone')), lang: 'fr' }, B(S.sophie.token))).status, 200);
  assert.equal((await call('POST', 'family/notify/subscribe', { subscription: sub(phone('lea-phone')), lang: 'de' }, B(S.lea.token))).status, 200);
  assert.equal(C.REMIND_DAYS, 7, 'the constant: 7 days');
  assert.equal(calls.remindMs, 7 * DAY);
  assert.equal(portal.familyLinks().length, 2);
});

test('no reminder before 7 days; one at 7 days, in each relative’s language, with "Now" and "Plan a date"', async () => {
  calls.remind();
  clock += 6 * DAY + 23 * HOUR;
  calls.remind();
  await sleep(150);
  assert.equal(phones['sophie-phone'].got.length, 0, 'nothing before 7 days');
  assert.equal(reminderOf(S.sophie), null);
  clock += 2 * HOUR;   // 7 days and one hour, early afternoon
  calls.remind();
  const g = await pushes(phones['sophie-phone'], 1);
  assert.equal(g.length, 1);
  assert.equal(g[0].type, 'talk_reminder');
  assert.equal(g[0].title, 'Vous n’avez pas parlé avec Marie depuis 7 jours');
  assert.equal(g[0].body, 'Maintenant, ou planifier une date ?');
  assert.deepEqual(g[0].actions.map((a) => [a.action, a.title]), [['now', 'Maintenant'], ['plan', 'Planifier une date']]);
  assert.equal(g[0].actions[0].url, 'portail.html#remind=' + S.rid + '&a=now');
  assert.equal(g[0].actions[1].url, 'portail.html#remind=' + S.rid + '&a=plan');
  assert.equal(g[0].url, 'portail.html#remind=' + S.rid, 'a touch on the notice itself opens the portal with its banner');
  const de = await pushes(phones['lea-phone'], 1);
  assert.equal(de[0].title, 'Sie haben seit 7 Tagen nicht mit Marie gesprochen');
  assert.deepEqual(de[0].actions.map((a) => a.title), ['Jetzt', 'Termin planen']);
  /* The bell, in the language asked for; the banner of the portal. */
  assert.equal((await bell(S.sophie, 'fr'))[0].title, 'Vous n’avez pas parlé avec Marie depuis 7 jours');
  assert.equal((await bell(S.sophie, 'en'))[0].title, 'You have not talked with Marie for 7 days');
  const c = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.equal(c.reminder.days, 7);
  assert.equal(c.remindDays, 7);
  assert.ok(!logged.some((t) => /Marie/.test(t)), 'the resident’s first name is never logged');
  assert.ok(logged.some((t) => /reminder to a family member of P1/.test(t)));
});

test('not more than one reminder per relative and resident every 7 days', async () => {
  for (let i = 0; i < 6; i++) { clock += DAY; calls.remind(); }
  await sleep(200);
  assert.equal(phones['sophie-phone'].got.length, 1, 'six days later: still one');
  assert.equal((await bell(S.sophie)).length, 1);
  clock += DAY + HOUR;
  calls.remind();
  const g = await pushes(phones['sophie-phone'], 2);
  assert.equal(g.length, 2, 'seven days after the first one: the second');
  assert.equal(g[1].title, 'Vous n’avez pas parlé avec Marie depuis 14 jours');
  assert.equal((await bell(S.sophie)).length, 1, 'the newer notice replaces the older one in the bell');
});

test('a message starts the count again: the open reminder closes, the next one comes 7 days after the message', async () => {
  const sent = await call('POST', 'family/message', { text: 'Bonjour Mamie' }, B(S.sophie.token));
  assert.equal(sent.status, 200);
  const c = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.equal(c.reminder, null, 'no banner once they wrote');
  assert.equal(reminderOf(S.sophie).state, 'done');
  clock += 6 * DAY;
  calls.remind();
  await sleep(150);
  assert.equal(phones['sophie-phone'].got.length, 2, 'six days after the message: nothing');
  /* The message itself may be deleted meanwhile (by the relative, or after 30 days): the date stays. */
  await call('POST', 'family/message/delete', { id: sent.data.message.id }, B(S.sophie.token));
  clock += DAY + HOUR;
  calls.remind();
  const g = await pushes(phones['sophie-phone'], 3);
  assert.equal(g.length, 3);
  assert.equal(g[2].title, 'Vous n’avez pas parlé avec Marie depuis 7 jours');
});

test('a call counts too: an answered invitation, or the relative’s own video-call link', async () => {
  /* Lea got her reminders with Sophie (2 so far, a third is due now); she calls through her own link. */
  await pushes(phones['lea-phone'], 3);
  const before = phones['lea-phone'].got.length;
  const token = crypto.randomBytes(16).toString('base64url');
  assert.equal((await call('POST', 'robot/account/call', { account: S.lea.link, link: 'https://bellatrix.example.test/famille.html#t=' + token }, R)).status, 200);
  clock += 6 * DAY;
  lastCalls[token] = new Date(clock).toISOString();   // the relay saw a call taken through that link
  clock += 2 * DAY;
  calls.remind();
  await sleep(200);
  assert.equal(phones['lea-phone'].got.length, before, 'she talked with Marie two days ago: no reminder');
  clock += 5 * DAY + HOUR;
  calls.remind();
  assert.equal((await pushes(phones['lea-phone'], before + 1)).length, before + 1, 'seven days after that call');
  /* An invitation that was answered is remembered for the relatives who were invited. */
  calls._data().invites.inv1 = { id: 'inv1', rid: S.rid, robot: ROBOT, code: 'P1', label: 'Marie', token: 'x'.repeat(20), at: new Date(clock).toISOString(), until: new Date(clock + HOUR).toISOString(), state: 'waiting', pids: [S.lea.pid] };
  relay.info = () => ({ state: 'used' });
  calls.sweep();
  relay.info = () => ({ state: 'unknown' });
  calls.remind();
  assert.equal(calls._data().invites.inv1.state, 'answered');
  assert.ok(calls._data().contacts[S.lea.pid + '|' + S.rid]);
  assert.equal(reminderOf(S.lea).state, 'done');
});

test('nothing at night; the banner still shows to someone who opens the portal', async () => {
  /* Sophie: last reminder 13 days ago by now. Move to 3 o’clock at night. */
  const d = new Date(clock); d.setHours(3, 0, 0, 0);
  clock = d.getTime() + DAY;
  const before = phones['sophie-phone'].got.length;
  calls.remind();
  await sleep(200);
  assert.equal(phones['sophie-phone'].got.length, before, 'no push at 3:00');
  const c = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.ok(c.reminder && c.reminder.days >= 7, 'the portal opened at night shows the banner');
  await sleep(200);
  assert.equal(phones['sophie-phone'].got.length, before, 'and still no push');
  assert.equal((await bell(S.sophie)).length, 1);
});

test('"Plan a date": saved on the server, shown in the portal and to the Care Team; the reminder is answered', async () => {
  const past = await call('POST', 'family/calls/plan', { at: new Date(clock - DAY).toISOString() }, B(S.sophie.token));
  assert.equal(past.status, 400);
  assert.equal(past.data.error, 'bad-date');
  assert.equal((await call('POST', 'family/calls/plan', { at: 'next week' }, B(S.sophie.token))).status, 400);
  assert.equal((await call('POST', 'family/calls/plan', { at: new Date(clock + DAY).toISOString() })).status, 401, 'signed in only');
  const at = new Date(clock + 2 * DAY + 12 * HOUR).toISOString();
  const plan = await call('POST', 'family/calls/plan', { at }, B(S.sophie.token));
  assert.equal(plan.status, 200, JSON.stringify(plan.data));
  assert.equal(plan.data.request.when, 'planned');
  assert.equal(plan.data.request.planAt, at);
  const c = (await call('GET', 'family/calls', undefined, B(S.sophie.token))).data;
  assert.equal(c.request.planAt, at, 'the Calls tab shows the planned call');
  assert.equal(c.reminder, null, 'the banner is gone');
  const team = (await call('GET', 'robot/calls', undefined, R)).data.requests.filter((q) => q.pid === S.sophie.pid);
  assert.equal(team.length, 1, 'the Care Team sees it with the call requests');
  assert.equal(team[0].when, 'planned');
  assert.equal(team[0].planAt, at);
  assert.equal(team[0].name, 'Sophie');
  /* Another date: the same request moves (one planned call at a time). */
  const at2 = new Date(clock + 3 * DAY + 12 * HOUR).toISOString();
  const again = await call('POST', 'family/calls/plan', { at: at2 }, B(S.sophie.token));
  assert.equal(again.data.request.id, plan.data.request.id);
  assert.equal(again.data.request.planAt, at2);
  /* While a call is planned: no reminder, even days later (at noon). */
  const noon = new Date(clock + 2 * DAY); noon.setHours(12, 0, 0, 0);
  clock = noon.getTime();
  const before = phones['sophie-phone'].got.length;
  calls.remind();
  await sleep(200);
  assert.equal(phones['sophie-phone'].got.length, before);
  /* The date passed without a call: the planned call ends a day later, and the reminders come back. */
  clock += 3 * DAY;
  calls.sweep();
  assert.equal((await call('GET', 'family/calls', undefined, B(S.sophie.token))).data.request, null);
  clock += 7 * DAY;
  calls.remind();
  assert.equal((await pushes(phones['sophie-phone'], before + 1)).length, before + 1);
});

test('"Now" (or closing the banner) answers the reminder; an access that ended is forgotten', async () => {
  assert.equal(reminderOf(S.sophie).state, 'open');
  assert.equal((await call('POST', 'family/calls/remind', {}, B(S.sophie.token))).status, 200);
  assert.equal(reminderOf(S.sophie).state, 'done');
  assert.equal((await call('GET', 'family/calls', undefined, B(S.sophie.token))).data.reminder, null);
  assert.equal((await call('POST', 'robot/account/status', { account: S.lea.link, status: 'suspended' }, R)).status, 200);
  const before = phones['lea-phone'].got.length;
  clock += 30 * DAY;
  calls.remind();
  await sleep(200);
  assert.equal(phones['lea-phone'].got.length, before, 'a suspended access is never reminded');
  assert.equal(reminderOf(S.lea), null);
});

test('the test hook: remindMs (or FAMILY_REMIND_MINUTES) shortens the delay, at any hour', async () => {
  const dir = path.join(TMP, 'hook');
  const got = [];
  const night = new Date(clock); night.setHours(2, 0, 0, 0);
  let t = night.getTime();
  const p2 = Portal.createPortal({ dataDir: dir, now: () => t, log: quiet, rateLimit: false, noDefault: true });
  const c2 = C.createCallReq({ dataDir: dir, portal: p2, notify: (pid, ev) => got.push(ev), relay, log: quiet, timer: false, now: () => t, remindMs: 2 * MIN });
  const d = p2._data();
  d.residents.r1 = { rid: 'r1', robot: ROBOT, code: 'P7', label: 'Opa', lang: 'de' };
  d.people.p1 = { id: 'p1', email: 'a@example.test', name: 'Anna', lang: 'de', consentAt: new Date(t).toISOString() };
  d.accounts.a1 = { id: 'a1', pid: 'p1', rid: 'r1', status: 'active', created: new Date(t).toISOString(), statusAt: new Date(t).toISOString() };
  c2.remind();
  assert.equal(got.length, 0);
  t += 2 * MIN + 1000;
  c2.remind();
  assert.equal(got.length, 1);
  assert.equal(got[0].type, 'talk_reminder');
  assert.equal(got[0].days, 1);
  c2.remind();
  assert.equal(got.length, 1, 'once');
  c2.stop();
  const src = fs.readFileSync(path.join(ROOT, 'labland', 'family-callreq.mjs'), 'utf8');
  assert.match(src, /export const REMIND_DAYS = 7;/);
  assert.match(src, /FAMILY_REMIND_MINUTES/);
  assert.match(src, /FAMILY_REMIND_DAYS/);
});

test('the sentence in FR, DE and EN, one day and several', () => {
  const t = (l, days) => N.textOf({ type: 'talk_reminder', vars: { label: 'Marie', days } }, l);
  assert.equal(t('fr', 1).title, 'Vous n’avez pas parlé avec Marie depuis 1 jour');
  assert.equal(t('de', 1).title, 'Sie haben seit 1 Tag nicht mit Marie gesprochen');
  assert.equal(t('en', 1).title, 'You have not talked with Marie for 1 day');
  assert.equal(t('en', 9).title, 'You have not talked with Marie for 9 days');
  assert.equal(t('de', 9).body, 'Jetzt, oder einen Termin planen?');
  for (const l of ['fr', 'de', 'en']) assert.ok(!/\{\w+\}/.test(t(l, 7).title + t(l, 7).body));
});

test('the phone and the portal: service worker buttons, cache version, banner and date picker in three languages', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw-portail.js'), 'utf8');
  assert.match(sw, /var CACHE = 'bellatrix-portail-7';/, 'the cache version was raised');
  assert.match(sw, /opts\.actions = /);
  assert.match(sw, /e\.action/);
  const js = fs.readFileSync(path.join(ROOT, 'js', 'portail-calls.js'), 'utf8');
  for (const k of ['You have not talked with {name} for {span}.', 'Now', 'Plan a date', 'Plan a call with {name}', 'Day', 'At what time', 'Save the date', 'Call planned', 'Change the date', 'Planned call saved.', '1 day', '{n} days']) {
    const n = js.split("'" + k + "': '").length - 1;
    assert.equal(n, 2, 'French and German for: ' + k);
  }
  assert.match(js, /type="date" id="pcDay"/);
  assert.match(js, /type="time" id="pcTime"/);
  assert.match(js, /family\/calls\/plan/);
  assert.match(js, /\[#&\]remind=/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'callreq-staff.js'), 'utf8'), /'Planned: \{when\}': 'Prévu : \{when\}'/);
  for (const f of ['sw-portail.js', 'js/portail-calls.js', 'js/callreq-staff.js', 'css/portail-calls.css', 'labland/family-callreq.mjs', 'labland/family-notify.mjs', 'labland/family-portal.mjs', 'labland/call-relay.mjs', 'tests/remind.test.mjs']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('\r'), 'LF line endings: ' + f);
  }
  /* ES5 in the browser files: no arrow function, let / const or template string in what was added. */
  for (const f of ['sw-portail.js', 'js/portail-calls.js', 'js/callreq-staff.js']) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/=>|^\s*(let|const)\s|`/m.test(code), 'ES5 only: ' + f);
  }
});

test.after(() => {
  calls.stop();
  server.close(); pushServer.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});
