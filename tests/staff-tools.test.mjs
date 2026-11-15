// Block B of the b1 briefing (js/staff-tools.js): the 60-second cleaning lock, the start-of-shift
// checklist ("Ready" / "Blocked" / "staff only") with its log, the screen hygiene reminder, and the
// isolation of the demo mode (nothing real is written).
// Run: node tests/staff-tools.test.mjs
// The file is loaded in a sandbox with a fake localStorage; synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/staff-tools.js'), 'utf8');

/* A Storage class per "realm", all sharing one map: the same origin, like the robot app. */
function storageClass() {
  function Storage(map) { this._m = map; }
  Storage.prototype.getItem = function (k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; };
  Storage.prototype.setItem = function (k, v) { this._m[k] = String(v); };
  Storage.prototype.removeItem = function (k) { delete this._m[k]; };
  Storage.prototype.clear = function () { Object.keys(this._m).forEach((k) => delete this._m[k]); };
  return Storage;
}
function load(map = {}) {
  const Storage = storageClass();
  const win = { localStorage: new Storage(map), sessionStorage: new Storage({}), navigator: { onLine: true }, console, setInterval, clearInterval, setTimeout, clearTimeout };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: 'staff-tools.js' });
  const ST = win.StaffTools;
  let now = Date.parse('2026-11-09T07:30:00');
  ST._clock.now = () => now;
  return { win, ST, map, clock: { set: (t) => { now = t; }, add: (ms) => { now += ms; }, get: () => now } };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const OK = { battery: { level: 80, charging: false }, batteryMin: 30, batterySeen: false, network: { connected: true, type: 'wifi' }, soundHeard: true, screenClean: true, contentSeen: true, zoneClear: true };

/* ------------------------------------------------------------------------------------------- */
test('cleaning lock: 60 s by default, a setting, a visible countdown', () => {
  const { ST } = load();
  assert.equal(ST.CleanLock().seconds, 60);
  assert.equal(ST.CleanLock({ seconds: 90 }).seconds, 90);
  for (const bad of ['abc', 0, 5, 9999, null]) assert.equal(ST.CleanLock({ seconds: bad }).seconds, 60, 'invalid ' + bad + ' gives 60');
  assert.equal(ST.settings().lockSeconds, 60);
  assert.equal(ST.saveSettings({ lockSeconds: 45 }), true);
  assert.equal(ST.settings().lockSeconds, 45);
  assert.equal(ST.CleanLock({ seconds: ST.settings().lockSeconds }).seconds, 45);
  const L = ST.CleanLock().start(0);
  assert.equal(L.locked(), true);
  assert.equal(L.remaining(0), 60);
  assert.equal(L.remaining(30500), 30);
  assert.equal(L.remaining(59001), 1);
  assert.equal(L.tick(59999), false);
  assert.equal(L.tick(60000), true, 'unlocks by itself at 60 s');
  assert.equal(L.how(), 'timer');
  assert.equal(L.remaining(60000), 0);
  assert.equal(L.locked(), false);
});

test('cleaning lock: a 3-second press ends it early; wiping and short touches do not', () => {
  const { ST } = load();
  const L = ST.CleanLock().start(0);
  L.holdStart(1000, 100, 100); L.holdEnd(2500);
  assert.equal(L.tick(3000), false, 'a 1.5 s touch does not unlock');
  L.holdStart(5000, 100, 100); L.holdMove(5600, 190, 100);
  assert.equal(L.holdProgress(6000), 0, 'a moving cloth cancels the press');
  assert.equal(L.tick(9000), false);
  L.holdStart(10000, 100, 100); L.holdMove(11000, 110, 108);
  assert.equal(L.holdProgress(11500), 0.5);
  assert.equal(L.tick(12999), false);
  assert.equal(L.tick(13000), true, 'held 3 s: unlocked');
  assert.equal(L.how(), 'hold');
  const M = ST.CleanLock({ seconds: 20 }).start(0);
  M.holdStart(18500, 0, 0);
  assert.equal(M.tick(20000), true, 'never stuck: the time always ends it');
  assert.equal(M.how(), 'timer');
});

/* ------------------------------------------------------------------------------------------- */
test('checklist: the six lines and "Ready"', () => {
  const { ST } = load();
  assert.deepEqual(plain(ST.LINES), ['battery', 'wifi', 'volume', 'screen', 'content', 'zone']);
  const st = ST.states(OK);
  assert.deepEqual(plain(st), { battery: 'ok', wifi: 'ok', volume: 'ok', screen: 'ok', content: 'ok', zone: 'ok' });
  const ev = ST.evaluate(st, ['battery', 'wifi']);
  assert.equal(ev.status, 'ready'); assert.equal(ev.ready, true); assert.equal(ev.blocking.length, 0); assert.equal(ev.proposeStaffOnly, false);
});

test('checklist: battery threshold is a setting with no invented default; unknown level is "not available"', () => {
  const { ST } = load();
  assert.equal(ST.DEFAULTS.batteryMin, null);
  assert.equal(ST.settings().batteryMin, null);
  assert.equal(ST.lineState('battery', { battery: null }), 'na');
  assert.equal(ST.lineState('battery', { battery: { level: NaN } }), 'na');
  assert.equal(ST.lineState('battery', { battery: { level: 64 }, batteryMin: null }), 'todo', 'no threshold: staff look at it');
  assert.equal(ST.lineState('battery', { battery: { level: 64 }, batteryMin: null, batterySeen: true }), 'ok');
  assert.equal(ST.lineState('battery', { battery: { level: 25 }, batteryMin: 30 }), 'todo');
  assert.equal(ST.lineState('battery', { battery: { level: 30 }, batteryMin: 30 }), 'ok');
  ST.saveSettings({ batteryMin: '35' });
  assert.equal(ST.settings().batteryMin, 35);
  ST.saveSettings({ batteryMin: '' });
  assert.equal(ST.settings().batteryMin, null);
  assert.equal(ST.lineState('wifi', { network: null }), 'na');
  assert.equal(ST.lineState('wifi', { network: { connected: false } }), 'todo');
  assert.equal(ST.lineState('volume', { soundHeard: false }), 'todo');
  assert.equal(ST.lineState('volume', { soundHeard: null }), 'todo');
});

test('checklist: "Blocked" lists what blocks; a missing critical line proposes "staff only"', () => {
  const { ST } = load();
  let ev = ST.evaluate(ST.states({ ...OK, battery: null }), ['battery', 'wifi']);
  assert.equal(ev.status, 'blocked');
  assert.deepEqual(plain(ev.blocking), ['battery']);
  assert.deepEqual(plain(ev.criticalMissing), ['battery']);
  assert.equal(ev.proposeStaffOnly, true);
  ev = ST.evaluate(ST.states({ ...OK, network: { connected: false }, zoneClear: false }), ['battery', 'wifi']);
  assert.deepEqual(plain(ev.blocking), ['wifi', 'zone']);
  assert.deepEqual(plain(ev.criticalMissing), ['wifi']);
  ev = ST.evaluate(ST.states({ ...OK, zoneClear: false, soundHeard: false }), ['battery', 'wifi']);
  assert.equal(ev.status, 'blocked');
  assert.equal(ev.proposeStaffOnly, false, 'non-critical lines block but do not propose staff only');
  // the critical lines are a setting (default: battery and Wi-Fi)
  assert.deepEqual(plain(ST.settings().critical), ['battery', 'wifi']);
  ST.saveSettings({ critical: ['zone', 'nonsense'] });
  assert.deepEqual(plain(ST.settings().critical), ['zone']);
  ev = ST.evaluate(ST.states({ ...OK, battery: null }), ST.settings().critical);
  assert.equal(ev.proposeStaffOnly, false);
  ev = ST.evaluate(ST.states({ ...OK, zoneClear: false }), ST.settings().critical);
  assert.equal(ev.proposeStaffOnly, true);
});

test('checklist: decisions are logged; staff only can always be lifted; history kept', () => {
  const { ST, clock } = load();
  // a missing critical line: the staff must choose, nothing is written before
  let r = ST.closeChecklist({ ...OK, battery: null }, 'ab');
  assert.equal(r.needChoice, true);
  assert.equal(ST.Journal.list().length, 0);
  // passing over it (explicit continue) is logged
  r = ST.closeChecklist({ ...OK, battery: null }, 'ab', 'continue');
  assert.equal(r.needChoice, false);
  let j = ST.Journal.list();
  assert.deepEqual(plain(j.map((x) => x.type)), ['checklist', 'override']);
  assert.equal(j[0].result, 'blocked'); assert.equal(j[0].staff, 'AB');
  assert.match(j[0].detail, /battery=na/);
  assert.equal(j[1].result, 'continue'); assert.match(j[1].detail, /battery/);
  assert.equal(ST.staffOnly(), null);
  assert.equal(ST.residentLaunchAllowed(), true);
  // staff only: resident launches off until a staff member lifts it
  clock.add(60000);
  r = ST.closeChecklist({ ...OK, network: { connected: false } }, 'cd', 'staff-only');
  const so = ST.staffOnly();
  assert.equal(so.on, true); assert.equal(so.by, 'CD'); assert.deepEqual(plain(so.missing), ['wifi']);
  assert.equal(ST.residentLaunchAllowed(), false);
  assert.equal(ST.setStaffOnly(false, 'ef', 'lifted by staff'), true);
  assert.equal(ST.staffOnly(), null);
  assert.equal(ST.residentLaunchAllowed(), true);
  // a ready checklist
  ST.closeChecklist(OK, 'ab');
  j = ST.Journal.list();
  assert.deepEqual(plain(j.map((x) => x.type + ':' + x.result)), ['checklist:blocked', 'override:continue', 'checklist:blocked', 'staff-only:on', 'staff-only:off', 'checklist:ready']);
  assert.equal(ST.Journal.today('checklist').length, 3, 'history of the checklists');
  const csv = ST.Journal.csv();
  assert.ok(csv.startsWith('﻿date,time,type,staff,session,cleaning_mode,result,details'));
  assert.equal(csv.split('\r\n').length, 7);
  assert.match(csv, /start-of-shift checklist,AB,,,ready/);
});

/* ------------------------------------------------------------------------------------------- */
test('hygiene reminder: shown from the karaoke note, can be put off, "Done" is logged', () => {
  const { ST, map } = load();
  assert.equal(ST.hygieneDue(), null);
  map['bellatrix-hygiene-due'] = JSON.stringify({ kind: 'karaoke', at: '2026-11-09T15:42:00.000Z' });
  assert.deepEqual(plain(ST.hygieneDue()), { kind: 'karaoke', at: '2026-11-09T15:42:00.000Z' });
  assert.equal(ST.hygieneSnoozed(ST.hygieneDue()), false);
  ST.hygieneLater();
  assert.equal(ST.hygieneSnoozed(ST.hygieneDue()), true, 'put off, never blocking');
  assert.notEqual(ST.hygieneDue(), null, 'still reachable from the Tools menu');
  // a new group session gives a new reminder
  map['bellatrix-hygiene-due'] = JSON.stringify({ kind: 'quiz', at: '2026-11-09T17:00:00.000Z' });
  assert.equal(ST.hygieneSnoozed(ST.hygieneDue()), false);
  const rec = ST.hygieneDone({ staff: 'ab', cleaning: true, how: 'timer' });
  assert.equal(rec.type, 'hygiene'); assert.equal(rec.staff, 'AB'); assert.equal(rec.kind, 'quiz'); assert.equal(rec.cleaning, true);
  assert.ok(rec.at);
  assert.equal(ST.hygieneDue(), null);
  assert.equal(map['bellatrix-hygiene-later'], undefined);
  const r2 = ST.hygieneDone({ staff: 'xy', cleaning: false });
  assert.equal(r2.kind, 'other'); assert.equal(r2.cleaning, false);
  assert.match(ST.Journal.csv(), /screen cleaned,AB,quiz,yes,done/);
  // no cleaning protocol in the code: only the care home's text, empty by default
  assert.equal(ST.DEFAULTS.houseRule, '');
  assert.equal(ST.settings().houseRule, '');
  ST.saveSettings({ houseRule: 'Texte de la maison' });
  assert.equal(ST.settings().houseRule, 'Texte de la maison');
  // initials: remembered and changeable
  assert.equal(ST.initials(), '');
  ST.setInitials(' mk '); assert.equal(ST.initials(), 'MK');
  ST.setInitials('jd'); assert.equal(ST.initials(), 'JD');
});

/* ------------------------------------------------------------------------------------------- */
/* A demo frame, faked: the device's storage (a Storage class over the device map), a fetch that
   records what would leave, the robot bridge, IndexedDB and beacons. */
function fakeFrame(deviceMap) {
  const Storage = storageClass();
  const sent = [], saved = [];
  const W = {
    Storage, localStorage: new Storage(deviceMap), sessionStorage: new Storage({}), Promise,
    navigator: { sendBeacon: () => { sent.push('beacon'); return true; } },
    fetch: (u, o) => { sent.push(((o && o.method) || 'GET') + ' ' + u); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ device: true }) }); },
    BellatrixApp: { saveFile: (n) => { saved.push(n); return '/sdcard/' + n; }, speak: () => {}, canSpeak: () => true, openPatient: () => saved.push('openPatient') },
    IDBObjectStore: function () {}
  };
  W.IDBObjectStore.prototype.put = () => { sent.push('idb'); };
  /* opening a database that does not exist yet would create it: the guard cancels it */
  W.IDBFactory = function () {};
  W.IDBFactory.prototype.open = function () { const req = { listeners: [], addEventListener(t, f) { this.listeners.push(f); } }; W.__lastOpen = req; return req; };
  return { W, sent, saved };
}
function deviceData() {
  return {
    'bellatrix-care-lab-v1': JSON.stringify({ sessions: [{ id: 'S0', participant: 'P1', activity: 'choice' }], patients: { P1: { content: {}, prefs: { greet: 'REAL' } } }, settings: {} }),
    'bellatrix-staff-journal': JSON.stringify([{ id: 'J1', at: '2026-11-08T08:00:00.000Z', type: 'checklist', staff: 'AB', result: 'ready' }]),
    'bellatrix-messages-cache': JSON.stringify({ items: { r1: { id: 'r1', code: 'P1', from: 'REALNAME', text: 'REAL MESSAGE', status: 'validated' } } }),
    'bellatrix-family': JSON.stringify({ residents: { P1: { contacts: [{ id: 'x', name: 'REALCONTACT' }] } } }),
    'bellatrix-premium-v2': JSON.stringify({ residents: { P1: { plan: 'month' } } })
  };
}

test('demo isolation: the frames read and write a memory storage; nothing reaches the device or the server', async () => {
  const map = deviceData();
  const before = JSON.stringify(map);
  const { ST, clock } = load(map);
  ST._demoEnter();
  // the Care Team side refuses every write while the demo runs
  assert.equal(ST.Journal.add({ type: 'hygiene', staff: 'AB' }), null);
  assert.equal(ST.hygieneDone({ staff: 'AB' }), null);
  assert.equal(ST.setStaffOnly(true, 'AB', ['wifi']), false);
  assert.equal(ST.saveSettings({ lockSeconds: 30 }), false);
  assert.equal(ST.closeChecklist(OK, 'AB'), null);
  assert.equal(ST.residentLaunchAllowed(), false);

  const shared = { local: ST.MemStorage(ST.demoSeed('fr', clock.get())), session: ST.MemStorage({}), lang: 'fr', now: clock.get() };
  for (const kind of ['patient', 'staff', 'portal']) {
    const { W, sent, saved } = fakeFrame(map);
    const log = ST.demoRealm(W, shared);
    assert.equal(W.__demoMem, true, kind + ': memory storage installed');
    // what the frame reads is the invented data, never the device's
    assert.equal(W.localStorage, shared.local);
    assert.doesNotMatch(W.localStorage.getItem('bellatrix-messages-cache'), /REAL/);
    assert.match(W.localStorage.getItem('bellatrix-messages-cache'), /Claire/);
    assert.match(W.localStorage.getItem('bellatrix-care-lab-v1'), /"D1"/);
    assert.doesNotMatch(W.localStorage.getItem('bellatrix-family'), /REALCONTACT/);
    // what a module writes stays in memory
    W.localStorage.setItem('bellatrix-care-lab-inbox', '[{"id":"S9"}]');
    W.localStorage.setItem('bellatrix-hygiene-due', '{"kind":"karaoke"}');
    W.localStorage.removeItem('bellatrix-staff-journal');
    W.sessionStorage.setItem('labTrayOpen', '1');
    // even the device's own Storage objects are guarded in the frame
    new W.Storage(map).setItem('bellatrix-care-lab-v1', '{}');
    // the family portal and the call server answer with invented data, from inside the frame
    const st = await (await W.fetch('portal/api/robot/state')).json();
    assert.ok(st.notifications.length >= 1, 'family messages are notifications (no approval)');
    assert.equal(st.queue.length, 0, 'nothing waits for an approval');
    assert.match(JSON.stringify(st), /Claire/);
    assert.doesNotMatch(JSON.stringify(st), /REAL/);
    const me = await (await W.fetch('portal/api/family/me')).json();
    assert.equal(me.resident.label, 'Marie');
    const before = (await (await W.fetch('portal/api/robot/state')).json()).notifications.filter((n) => !n.seen).length;
    const posted = await (await W.fetch('portal/api/family/message', { method: 'POST', body: '{"text":"Bonjour"}' })).json();
    assert.equal(posted.ok, true);
    assert.equal((await (await W.fetch('portal/api/robot/state')).json()).notifications.filter((n) => !n.seen).length, before + 1, 'the team is told at once');
    assert.match(W.localStorage.getItem('bellatrix-messages-cache'), /Bonjour/, 'the message is on the robot at once (in memory)');
    const out = await (await W.fetch('call/api/outgoing', { method: 'POST', body: '{}' })).json();
    assert.equal(out.token, 'DEMO-J-0001');
    const feed = await W.fetch('portal/api/robot/feed');
    assert.equal(feed.status, 404, 'no feed: the invented messages are kept');
    await assert.rejects(W.fetch('https://example.org/anything', { method: 'POST', body: '{}' }));
    await W.fetch('patient.html');
    assert.equal(W.BellatrixApp.saveFile('x.csv', 'a'), '');
    assert.throws(() => W.IDBObjectStore.prototype.put({}));
    const req = W.IDBFactory.prototype.open('bellatrix-new-db', 1);
    let aborted = false;
    req.listeners.forEach((f) => f({ oldVersion: 0, target: { transaction: { abort: () => { aborted = true; } } } }));
    assert.equal(aborted, true, 'no new database is created on the device');
    assert.equal(W.navigator.sendBeacon('/x', '{}'), false);
    W.BellatrixApp.openPatient();
    assert.equal(saved.length, 0, kind + ': the robot never saved a file nor switched screens');
    assert.deepEqual(sent, ['GET patient.html'], kind + ': only a plain read left the frame');
    assert.ok(log.some((x) => /portal POST family\/message/.test(x)));
    assert.ok(log.some((x) => /fetch POST https:\/\/example.org/.test(x)));
    assert.ok(log.some((x) => /storage set bellatrix-care-lab-v1/.test(x)));
  }
  assert.match(shared.local.getItem('bellatrix-care-lab-inbox'), /S9/, 'the frames share one memory storage');
  // Premium: the team's request goes to the family with the price of the configuration; the payment is simulated
  const W2 = fakeFrame(map).W;
  ST.demoRealm(W2, shared);
  const rq = await (await W2.fetch('portal/api/robot/premium-request', { method: 'POST', body: '{"code":"D1","product":"play","months":3}' })).json();
  assert.equal(rq.request.state, 'awaiting_family');
  assert.equal(rq.request.months, 3);
  const me2 = await (await W2.fetch('portal/api/family/me')).json();
  assert.equal(me2.testPayment, true, 'the payment is always simulated in the demo');
  assert.equal(me2.requests[0].state, 'awaiting_family');
  assert.equal((await (await W2.fetch('portal/api/family/premium-request/pay', { method: 'POST', body: JSON.stringify({ id: rq.request.id, last4: '4242' }) })).json()).ok, true);
  assert.equal((await (await W2.fetch('portal/api/robot/premium-requests')).json()).requests[0].state, 'paid');
  assert.equal((await (await W2.fetch('portal/api/robot/premium-requests')).json()).requests[0].state, 'active');
  // the consent level the team records is what the family sees
  await W2.fetch('portal/api/robot/resident/consent', { method: 'POST', body: '{"rid":"r1","level":"all","by":"resident"}' });
  assert.equal((await (await W2.fetch('portal/api/family/me')).json()).resident.consent, 'all');
  assert.equal(JSON.stringify(map), before, 'the device storage is exactly as before');
  ST._demoLeave();
  assert.ok(ST.Journal.add({ type: 'hygiene', staff: 'AB', cleaning: false }), 'normal again');
});

test('demo tour (1.16, K): Care Team first, then the residents’ screen; plays by itself; pause and a slow voice hold; chapters jump', () => {
  const { ST, clock } = load();
  const S = ST.SCENES;
  const ids = plain(S.map((s) => s.id));
  assert.deepEqual(ids, ['intro', 'shift', 'todo', 'family', 'premium', 'consent', 'results', 'contents', 'settings',
    'welcome', 'play', 'karaoke', 'games', 'memories', 'books', 'messages', 'daily', 'end'], 'the chapters, in this order');
  // 15 Nov (Rahma): no "Music & photos" tab; that chapter (id kept) shows the playlists in Bellatrix Play's settings
  assert.equal(S[ids.indexOf('contents')].name, 'Playlists');
  assert.doesNotMatch(JSON.stringify(plain(ST.CHAPTERS)), /Music (&|and) photos/i, 'no chapter names the old tab');
  assert.deepEqual(plain(S[0].frames), ['staff', 'patient'], 'it opens on the two apps side by side');
  for (const s of S) {
    assert.ok(s.ms >= 5000 && s.ms <= 60000, s.id + ' ' + s.ms);
    let at = 0;
    for (const line of s.lines) { assert.equal(line.at, at, s.id + ': the lines follow each other'); at += line.ms; assert.ok(line.ms >= 2500, s.id + ': time to look'); }
  }
  // never "free" about a payment, and the payment line says it is simulated
  const all = JSON.stringify(plain(ST.CHAPTERS));
  assert.match(all, /payment is simulated/);
  assert.doesNotMatch(all, /free (payment|of charge)|pay nothing|costs nothing/i);
  const seen = [], ticks = [];
  let hold = false;
  const tour = { enter: (sc, i) => seen.push(i + ':' + sc.id), tick: (sc, ms) => ticks.push(sc.id + '@' + Math.round(ms)), pause: () => seen.push('pause'), resume: () => seen.push('resume'),
    stopAll: () => seen.push('stopAll'), idle: () => seen.push('idle'), holding: () => hold };
  let ticker = null, ended = null;
  const run = ST.DemoRun(tour, { scenes: S, now: clock.get, every: (fn) => { ticker = fn; return 1; }, cancel: () => {}, onEnd: (h) => { ended = h; } });
  run.start();
  assert.equal(run.state().scene, 'intro');
  clock.add(5000); ticker();
  assert.ok(ticks.includes('intro@5000'), 'steps get the time of the chapter');
  run.pause(); clock.add(600000); ticker();
  assert.equal(run.state().scene, 'intro', 'paused: the chapter and its steps wait');
  run.resume();
  // a real voice slower than planned: the clock of the chapter waits for it
  hold = true; clock.add(250); ticker(); clock.add(60000); ticker();
  assert.equal(run.state().scene, 'intro', 'holding while the line is still said');
  hold = false;
  // no tapping: the chapters follow each other by themselves
  for (let i = 0; i < 400 && !ended; i++) { clock.add(2500); ticker(); }
  assert.equal(ended, 'completed');
  assert.equal(seen.filter((x) => /^\d+:/.test(x)).length, S.length, 'every chapter was shown once');
  assert.ok(seen.includes('pause') && seen.includes('resume') && seen.includes('idle'));
  // chapters: a tap jumps, Stop at any time
  const run2 = ST.DemoRun(tour, { scenes: S, now: clock.get, every: (fn) => { ticker = fn; return 1; }, cancel: () => {} });
  run2.start();
  run2.jump(ids.indexOf('karaoke'));
  assert.equal(run2.state().scene, 'karaoke');
  run2.stop();
  assert.equal(run2.state().how, 'stopped');
  assert.ok(seen.includes('stopAll'));
});

test('demo tour: 6 to 8 minutes in each language, measured with the real texts', () => {
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, navigator: { language: 'en' }, localStorage: { getItem() { return null; }, setItem() {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(ROOT, 'staff.html'), 'utf8');
  for (const f of [...html.matchAll(/src="js\/(i18n[^"?]*\.js)/g)].map((m) => m[1])) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8') + (f === 'i18n.js' ? ';window.I18N=I18N;' : ''), sandbox); } catch (e) { /* another agent's file in progress */ }
  }
  vm.runInContext(SRC, sandbox);
  const ST = sandbox.StaffTools, I = sandbox.I18N, out = {};
  for (const l of ['en', 'fr', 'de']) {
    const S = ST.demoScenes(l, (k, v) => I.t(l, k, v));
    const total = S.reduce((a, s) => a + s.ms, 0);
    out[l] = Math.round(total / 1000);
    assert.ok(total >= 6 * 60000 && total <= 8 * 60000, l + ': ' + (total / 60000).toFixed(2) + ' min');
    for (const s of S) for (const line of s.lines) {
      assert.ok(I.dict[l] === undefined || l === 'en' || I.dict[l][line.say] !== undefined, l + ': no translation for "' + line.say + '"');
      assert.doesNotMatch(line.text, /\{name\}/, 'the name is filled in');
    }
  }
  console.log('# demo length (s): ' + JSON.stringify(out));
});

test('demo frames: the real pages, the realm first; no patient app (no hand-over, no inbox)', () => {
  const { ST } = load();
  const patient = fs.readFileSync(path.join(ROOT, 'patient.html'), 'utf8');
  const html = ST.frameHtml(patient, 'https://app.bellatrix/', 'patient', 'Mode démo');
  assert.ok(!/js\/patient\.js/.test(html), 'no hand-over, no inbox');
  for (const need of ['core', 'play', 'karaoke', 'album', 'reading', 'messages', 'familycall']) assert.ok(new RegExp('js/' + need + '\\.js').test(html), need + '.js is in');
  assert.ok(html.indexOf('_realm(window)') > 0 && html.indexOf('_realm(window)') < html.indexOf('js/core.js'), 'the realm is installed before the core');
  assert.match(html, /class="st-demochip">Mode démo</);
  const staff = ST.frameHtml(fs.readFileSync(path.join(ROOT, 'staff.html'), 'utf8'), 'https://app.bellatrix/', 'staff', 'Mode démo');
  assert.ok(staff.indexOf('_realm(window)') < staff.indexOf('js/staff.js'));
  const portal = ST.frameHtml(fs.readFileSync(path.join(ROOT, 'portail.html'), 'utf8'), 'https://app.bellatrix/', 'portal', 'Mode démo');
  assert.ok(portal.indexOf('_realm(window)') > 0 && portal.indexOf('_realm(window)') < portal.indexOf('js/portail.js'));
  // messages.js never offers a message by itself in a frame
  const msg = fs.readFileSync(path.join(ROOT, 'js/messages.js'), 'utf8');
  assert.match(msg, /window\.top === window/);
  // invented data only
  const seed = JSON.stringify(ST.demoSeed('de', Date.now()));
  assert.match(seed, /Claudia/); assert.match(seed, /Maria/); assert.doesNotMatch(seed, /"P1"/);
});

/* ---- 1.17: the tray for 100 residents (pure helpers of js/staff.js, between the TRAY100 markers) ---- */
function trayLib() {
  const src = fs.readFileSync(path.join(ROOT, 'js/staff.js'), 'utf8');
  const a = src.indexOf('/* TRAY100:begin'), b = src.indexOf('/* TRAY100:end-pure */');
  assert.ok(a > 0 && b > a, 'tray markers');
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nout = { trInitials, trRowKey, trSort, trMatch, trCounts, trFolded, trPrune };', ctx);
  return ctx.out;
}
test('tray: urgency order (call, access, Premium and gifts, rest), oldest first in a type', () => {
  const T = trayLib();
  const rows = [
    { type: 3, at: 1, code: 'P9' }, { type: 2, at: 5, code: 'P8' }, { type: 0, at: 30, code: 'P1' },
    { type: 1, at: 9, code: 'P3' }, { type: 0, at: 10, code: 'P2' }, { type: 2, at: 0, code: 'P7' }
  ];
  assert.deepEqual(T.trSort(rows).map((r) => r.code), ['P2', 'P1', 'P3', 'P8', 'P7', 'P9']);
});
test('tray: groups of more than 3 are folded until opened', () => {
  const T = trayLib();
  const rows = [0, 0, 0, 0, 1].map((type) => ({ type }));
  const c = T.trCounts(rows);
  assert.deepEqual(Array.from(c), [4, 1, 0, 0]);
  assert.equal(T.trFolded(c, 0, {}), true);
  assert.equal(T.trFolded(c, 0, { 0: true }), false);
  assert.equal(T.trFolded(c, 1, {}), false);
});
test('tray: "I take it" keys, initials, claims expire after a day', () => {
  const T = trayLib();
  assert.equal(T.trInitials('Anna Berger'), 'AB');
  assert.equal(T.trInitials('Marie-Claire Dupont'), 'MD');
  assert.equal(T.trInitials(''), '');
  const r = { type: 0, code: 'P1', hm: '09:10', text: 'P1 wants to call the family' };
  assert.equal(T.trRowKey(r), T.trRowKey(Object.assign({}, r)));
  assert.notEqual(T.trRowKey(r), T.trRowKey(Object.assign({}, r, { code: 'P2' })));
  const now = 10 * 24 * 3600000;
  const kept = T.trPrune({ a: { by: 'AB', at: now - 1000 }, b: { by: 'CD', at: now - 25 * 3600000 } }, now);
  assert.deepEqual(Object.keys(kept), ['a']);
});
test('tray: filters by resident and by sector; a row naming nobody stays', () => {
  const T = trayLib();
  const sec = (c) => ({ P1: '2A', P2: '2A', P3: '3B' }[c] || '');
  const r1 = { codes: ['P1'] }, r3 = { codes: ['P3'] }, many = { codes: ['P1', 'P3'] }, none = { codes: [] };
  assert.equal(T.trMatch(r1, { code: 'P1', sector: '' }, sec), true);
  assert.equal(T.trMatch(r3, { code: 'P1', sector: '' }, sec), false);
  assert.equal(T.trMatch(r3, { code: '', sector: '2A' }, sec), false);
  assert.equal(T.trMatch(r1, { code: '', sector: '2A' }, sec), true);
  assert.equal(T.trMatch(many, { code: 'P3', sector: '3B' }, sec), true);
  assert.equal(T.trMatch(none, { code: 'P1', sector: '2A' }, sec), true);
});
test('tray: the strings exist in FR and DE, the sector field is saved on the card', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'js/i18n-staff.js'), 'utf8');
  for (const k of ["'I take it'", "'Taken by {who}'", "'Floor / sector'", "'Call requests'", "'Access requests'", "'Premium and gifts'"]) {
    assert.equal(i18n.split(k + ':').length >= 3, true, k + ' in fr and de');
  }
  const src = fs.readFileSync(path.join(ROOT, 'js/staff.js'), 'utf8');
  assert.match(src, /pr\.sector = val\('fSector'\)/);
  const cp = fs.readFileSync(path.join(ROOT, 'js/callreq-patient.js'), 'utf8');
  assert.match(cp, /min-height: 190px; font-size: 72px/);
});
