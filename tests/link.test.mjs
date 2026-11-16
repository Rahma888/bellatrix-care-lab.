// The link between the robot head (Care Team) and the patient tablet: js/link-staff.js + js/link-patient.js
// against a small simulated server (the contract of link/api/<code>/...). Both sides run in sandboxes with
// their own fake storage (two devices, no shared data). No camera, no sound; own port 9400+.
// Run: node tests/link.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(30); } return false; };

/* ---------- the simulated server ---------- */
function makeServer() {
  const rooms = {};
  const room = (c) => rooms[c] || (rooms[c] = { run: null, cancel: null, nextW: [], seq: 0, status: null, stW: [], log: [] });
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), m = u.pathname.match(/^\/link\/api\/([^/]+)\/(\w+)$/);
    const send = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (!m) { r.writeHead(404); r.end(); return; }
    const R = room(m[1]), what = m[2];
    let body = ''; q.on('data', (d) => (body += d));
    q.on('end', () => {
      const j = body ? JSON.parse(body) : {};
      if (what === 'ping') return send({ ok: true, t: Date.now() });
      if (what === 'run' && q.method === 'POST') { R.run = j.run; R.log.push(['run', j.run.id]); flushNext(R); return send({ ok: true, id: j.run.id }); }
      if (what === 'arrived') { R.arrivedPosted = true; R.log.push(['arrived', j.id]); R.arrivedFor = j.id; flushNext(R); return send({ ok: true }); }
      if (what === 'cancel') { R.cancel = j.id; R.run = null; flushNext(R); return send({ ok: true }); }
      if (what === 'next') {
        const f = send; R.nextW.push(f);
        setTimeout(() => { const i = R.nextW.indexOf(f); if (i >= 0) { R.nextW.splice(i, 1); send({}); } }, 1500);
        flushNext(R); return;
      }
      if (what === 'status' && q.method === 'POST') {
        R.seq++; R.status = { seq: R.seq, id: j.id, state: j.state, position: R.run && R.run.position, result: j.result }; R.log.push(['status', j.state]);
        R.stW.splice(0).forEach((f) => f()); return send({ ok: true });
      }
      if (what === 'status') {
        const since = +u.searchParams.get('since') || 0, answer = () => send(R.status && R.status.seq > since ? R.status : {});
        if (R.status && R.status.seq > since) return answer();
        const f = () => answer(); R.stW.push(f);
        setTimeout(() => { const i = R.stW.indexOf(f); if (i >= 0) { R.stW.splice(i, 1); answer(); } }, 1500); return;
      }
      r.writeHead(404); r.end();
    });
  });
  function flushNext(R) {
    if (!R.nextW.length) return;
    if (R.cancel) { const id = R.cancel; R.cancel = null; R.nextW.shift()({ cancel: id }); }
    else if (R.arrivedFor && R.run && R.run.sent) { const id = R.arrivedFor; R.arrivedFor = null; R.nextW.shift()({ arrived: id }); }
    else if (R.run && !R.run.sent) { R.run.sent = true; const run = { ...R.run }; delete run.sent; R.nextW.shift()({ run }); }
  }
  return { srv, rooms, room };
}
function store(init = {}) {
  const m = { ...init };
  return { m, getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
/* a tiny DOM: the full-screen strip (#lkTop) is made and filled like in the app */
function fakeDoc() {
  const byId = {};
  const el = () => ({ hidden: false, innerHTML: '', className: '', id: '', setAttribute() {}, addEventListener() {} });
  return {
    getElementById: (id) => byId[id] || null, querySelector: () => null, addEventListener() {},
    createElement: () => el(),
    body: { appendChild(e) { byId[e.id] = e; }, classList: { add() {}, remove() {} } },
    _top: () => byId.lkTop,
  };
}
function sandbox(file, ls, extra = {}) {
  const w = { localStorage: ls, console, setTimeout, clearTimeout, setInterval, clearInterval, fetch, AbortController, Promise, JSON, Date, Math, __linkTest: true,
    document: fakeDoc(), ...extra };
  w.window = w; vm.createContext(w); vm.runInContext(src(file), w, { filename: file }); return w;
}

const PORT = 9400 + Math.floor(Math.random() * 90);
const CODE = 'abc123xy';
const T = makeServer();
await new Promise((ok) => T.srv.listen(PORT, '127.0.0.1', ok));
test.after(() => { if (T.srv.closeAllConnections) T.srv.closeAllConnections(); T.srv.close(); setTimeout(() => process.exit(0), 300); });  // sandboxes leave timers behind
const URL0 = 'http://127.0.0.1:' + PORT;

test('without server or code, or with a plain http address, the link is off', () => {
  assert.equal(sandbox('js/link-staff.js', store()).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-call-server': 'https://x.example' })).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-link-code': CODE })).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-call-server': 'http://x.example', 'bellatrix-link-code': CODE })).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-call-server': 'https://x.example', 'bellatrix-link-code': 'abc' })).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-call-server': 'https://x.example', 'bellatrix-link-code': CODE })).LinkStaff.configured(), true);
  assert.equal(sandbox('js/link-patient.js', store()).LinkPatient.configured(), false);
});

test('head sends, tablet waits for a person, starts, finishes; the result lands in the head inbox', async () => {
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': CODE });
  const tabLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': CODE });
  let taken = 0;
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} }, LabTakeInbox: () => { taken++; } });
  let presCb = null, stops = 0;
  const lab = { isOn: () => lab.on, on: false, _t: { state: { step: null } }, onSessionEnd: null, endSession() {}, toast() {} };
  const tab = sandbox('js/link-patient.js', tabLs, { Lab: lab, Presence: { watch: (cb) => { presCb = cb; return () => { stops++; presCb = null; }; } } });
  assert.ok(tab.LinkPatient.start());
  const run = { id: 'R1', key: 'play', preview: false, patient: 'P1', opt: { lang: 'fr' }, at: Date.now() };
  await head.LinkStaff.send(run, 'Chambre 12');
  assert.equal(head.LinkStaff._cur().state, 'sent');
  assert.equal(T.room(CODE).run.position, 'Chambre 12');
  assert.ok(await until(() => presCb), 'tablet received the run and watches presence');
  assert.equal(tabLs.getItem('bellatrix-care-lab-run'), null, 'nobody in front yet: nothing starts');
  assert.ok(await until(() => T.room(CODE).log.some((l) => l[1] === 'received')));
  presCb(false);
  await sleep(100);
  assert.equal(tabLs.getItem('bellatrix-care-lab-run'), null);
  presCb(true);
  assert.ok(await until(() => tabLs.getItem('bellatrix-care-lab-run')), 'person present: run written for patient.js');
  const w = JSON.parse(tabLs.getItem('bellatrix-care-lab-run'));
  assert.equal(w.id, 'R1'); assert.equal(w.key, 'play'); assert.equal(w.patient, 'P1'); assert.equal(w.opt.lang, 'fr');
  assert.ok(await until(() => head.LinkStaff._cur().state === 'present'), 'head: with the patient');
  presCb(false);
  assert.ok(await until(() => T.room(CODE).log.some((l) => l[1] === 'absent')), 'person left before Begin: absent');
  assert.ok(await until(() => head.LinkStaff._cur().state === 'absent'));
  presCb(true);
  assert.ok(await until(() => head.LinkStaff._cur().state === 'present'));
  /* The Begin screen is not "started"; the first real step is. */
  lab.on = true; lab._t.state.step = { id: 'ready' };
  await sleep(1300);
  assert.notEqual(T.room(CODE).status.state, 'started');
  lab._t.state.step = { id: 'q1' };
  assert.ok(await until(() => head.LinkStaff._cur().state === 'started', 5000));
  assert.ok(stops >= 1, 'camera released once started');
  const rec = { id: 'S1abc', activity: 'play', preview: false, participant: 'P1', outcome: 'completed' };
  lab.on = false;
  lab.onSessionEnd(rec);
  assert.ok(await until(() => head.LinkStaff._cur().state === 'finished'));
  const inbox = JSON.parse(headLs.getItem('bellatrix-care-lab-inbox'));
  assert.equal(inbox.length, 1); assert.equal(inbox[0].id, 'S1abc'); assert.equal(inbox[0].outcome, 'completed');
  assert.equal(taken, 1, 'Results refreshed');
  tab.LinkPatient.stop();
});

test('cancel from the head reaches the waiting tablet; no inbox entry', async () => {
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': 'zzz999aa' });
  const tabLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': 'zzz999aa' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} } });
  let presCb = null;
  const lab = { isOn: () => false, _t: { state: {} }, onSessionEnd: null, toast() {} };
  const tab = sandbox('js/link-patient.js', tabLs, { Lab: lab, Presence: { watch: (cb) => { presCb = cb; return () => { presCb = null; }; } } });
  tab.LinkPatient.start();
  await head.LinkStaff.send({ id: 'R2', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, '');
  assert.ok(await until(() => presCb));
  head.LinkStaff.cancel();
  assert.ok(await until(() => head.LinkStaff._cur().state === 'cancelled'));
  assert.ok(await until(() => T.room('zzz999aa').log.some((l) => l[1] === 'cancelled')), 'tablet confirms cancelled');
  assert.equal(presCb, null, 'tablet stopped watching');
  assert.equal(tabLs.getItem('bellatrix-care-lab-run'), null);
  assert.equal(headLs.getItem('bellatrix-care-lab-inbox'), null);
  tab.LinkPatient.stop();
});

test('a preview is never put in the inbox', async () => {
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': 'prev1234' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} } });
  await head.LinkStaff.send({ id: 'R3', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: true }, '');
  const R = T.room('prev1234'); R.run.sent = true;
  R.seq++; R.status = { seq: R.seq, id: 'R3', state: 'finished', result: { id: 'S9', preview: true } }; R.stW.splice(0).forEach((f) => f());
  assert.ok(await until(() => head.LinkStaff._cur().state === 'finished'));
  assert.equal(headLs.getItem('bellatrix-care-lab-inbox'), null);
});

test('robot: drives to the place, tablet waits for arrival, posture check, then home', async () => {
  const code = 'robo5678';
  // the simulated server needs the arrived action and a place-aware flow
  const R = T.room(code);
  const origRun = R;
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': code, 'bellatrix-home-place': 'Home7' });
  const tabLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': code });
  const calls = [];
  let nav = { state: 'moving' };
  const BellatrixApp = {
    robotState: () => JSON.stringify({ connected: true, localized: true }),
    robotPlaces: () => JSON.stringify([{ name: 'Room 12', x: 1, y: 2 }, { name: 'Home7', x: 0, y: 0 }]),
    robotGo: (p) => { calls.push('go:' + p); return 'ok'; },
    robotStop: () => { calls.push('stop'); return 'ok'; },
    robotNav: () => JSON.stringify(nav),
  };
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} }, BellatrixApp });
  let presCb = null, seatDone = null, seatCancelled = 0, said = 0;
  const lab = { isOn: () => false, _t: { state: {} }, onSessionEnd: null, toast() {}, talk() { said++; }, lang: () => 'en' };
  const Posture = { ensureSeated(o, done) { assert.equal(o.lang, 'en'); seatDone = done; setTimeout(() => o.say('sit'), 10); return () => { seatCancelled++; }; } };
  const tab = sandbox('js/link-patient.js', tabLs, { Lab: lab, Posture, Presence: { watch: (cb) => { presCb = cb; return () => { presCb = null; }; } } });
  tab.LinkPatient.start();
  await head.LinkStaff.send({ id: 'R7', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Room 12');
  assert.equal(R.run.place, 'Room 12');
  assert.deepEqual(calls, ['go:Room 12']);
  assert.ok(await until(() => R.log.some((l) => l[1] === 'received')));
  await sleep(200);
  assert.equal(presCb, null, 'on the way: presence is not watched');
  // arrival: the simulated server forwards {arrived:id} like the real relay
  nav = { state: 'arrived', place: 'Room 12' };
  const arrivedSeen = new Promise((res) => { const iv = setInterval(() => { if (R.arrivedPosted) { clearInterval(iv); res(); } }, 30); });
  await arrivedSeen;
  assert.ok(await until(() => presCb, 3000), 'arrived: presence watched');
  presCb(true);
  assert.ok(await until(() => seatDone));
  assert.ok(await until(() => R.log.some((l) => l[1] === 'waiting-seat')));
  assert.equal(tabLs.getItem('bellatrix-care-lab-run'), null, 'not seated: nothing written');
  seatDone();
  assert.ok(await until(() => tabLs.getItem('bellatrix-care-lab-run')), 'seated: run written');
  assert.ok(await until(() => R.log.some((l) => l[1] === 'seated')));
  // the end: head goes home
  head.LinkStaff.cancel();
  assert.ok(await until(() => calls.includes('go:Home7')));
  assert.ok(!calls.includes('stop'), 'already arrived: no stop');
  tab.LinkPatient.stop();
});

test('robot: a failed trip shows the failure, starts nothing, Cancel goes home', async () => {
  const code = 'robo9999';
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': code });
  const calls = [];
  const BellatrixApp = {
    robotState: () => JSON.stringify({ connected: true }), robotPlaces: () => JSON.stringify([{ name: 'Room 12' }]),
    robotGo: (p) => { calls.push('go:' + p); return 'ok'; }, robotStop: () => { calls.push('stop'); return 'ok'; },
    robotNav: () => JSON.stringify({ state: 'failed', reason: 'blocked' }),
  };
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} }, BellatrixApp });
  await head.LinkStaff.send({ id: 'R8', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Room 12');
  assert.ok(await until(() => head.LinkStaff._cur().nav === 'failed', 3000));
  assert.ok(!T.room(code).arrivedPosted);
  head.LinkStaff.cancel();
  assert.ok(await until(() => head.LinkStaff._cur().state === 'cancelled'));
  assert.deepEqual(calls, ['go:Room 12', 'go:Standby-Punkt']);
});

test('no robot: a position is plain text, no place, no robot calls', async () => {
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': 'norobo12' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} } });
  await head.LinkStaff.send({ id: 'R9', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Room 12');
  assert.equal(T.room('norobo12').run.place, undefined);
  assert.equal(head.LinkStaff._cur().robot, undefined);
  head.LinkStaff.cancel();
  assert.ok(await until(() => head.LinkStaff._cur().state === 'cancelled'));
});

test('bellatrix-link-server: http on the Wi-Fi is accepted and wins over the call server; "local" = the head relay', async () => {
  const lsrv = (o) => store({ 'bellatrix-link-code': CODE, ...o });
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-link-server': 'http://192.168.69.157:8765' })).LinkStaff.configured(), true);
  assert.equal(sandbox('js/link-patient.js', lsrv({ 'bellatrix-link-server': 'http://192.168.69.157:8765' })).LinkPatient.configured(), true);
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-link-server': 'http://192.168.69.157:8765', 'bellatrix-call-server': 'https://x.example' })).LinkStaff.configured(), true);
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-link-server': 'ftp://nope' })).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-patient.js', lsrv({ 'bellatrix-link-server': 'nope', 'bellatrix-call-server': 'https://x.example' })).LinkPatient.configured(), false);
  assert.equal(sandbox('js/link-staff.js', store({ 'bellatrix-link-server': 'http://192.168.69.157:8765' })).LinkStaff.configured(), false, 'code still needed');
  const run = (running) => ({ BellatrixApp: { linkServer: () => JSON.stringify({ running, port: 8765, ips: ['192.168.69.157'], url: 'http://192.168.69.157:8765' }) } });
  assert.equal(sandbox('js/link-staff.js', lsrv({}), run(true)).LinkStaff.configured(), true, 'empty + head relay running');
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-link-server': 'local' }), run(true)).LinkStaff.configured(), true);
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-link-server': 'local' }), run(false)).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', lsrv({}), run(false)).LinkStaff.configured(), false);
  assert.equal(sandbox('js/link-staff.js', lsrv({ 'bellatrix-call-server': 'https://x.example' }), run(false)).LinkStaff.configured(), true, 'old behaviour');
});

test('bellatrix-link-server is the base of the /link/api/ calls', async () => {
  const code = 'lsrv4321';
  const headLs = store({ 'bellatrix-link-server': URL0, 'bellatrix-link-code': code, 'bellatrix-call-server': 'https://unused.invalid' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} } });
  await head.LinkStaff.send({ id: 'R9', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, '');
  assert.equal(T.room(code).run.id, 'R9');
});

test('task list (16 Nov): Add catches the run instead of sending it; the list goes from place to place without the base, then home', async () => {
  const code = 'task1234';
  const R = T.room(code);
  const calls = [];
  let nav = { state: 'moving' };
  const BellatrixApp = {
    robotState: () => JSON.stringify({ connected: true, localized: true }),
    robotPlaces: () => JSON.stringify([{ name: 'Room 12', x: 1, y: 2 }, { name: 'Room 14', x: 3, y: 2 }, { name: 'Home7', x: 0, y: 0 }]),
    robotGo: (p) => { calls.push('go:' + p); return 'ok'; },
    robotStop: () => { calls.push('stop'); return 'ok'; },
    robotNav: () => JSON.stringify(nav),
  };
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': code, 'bellatrix-home-place': 'Home7' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} }, BellatrixApp, __tasksTest: true });
  vm.runInContext(src('js/tasks-staff.js'), head, { filename: 'js/tasks-staff.js' });
  head.TasksStaff._boot();
  // Add: the run Start would send is caught, nothing goes out
  let caught = null;
  head.LinkStaff.collect((run, pos) => { caught = { run, pos }; });
  await head.LinkStaff.send({ id: 'A1', key: 'pairs', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Room 12');
  assert.equal(caught.pos, 'Room 12'); assert.equal(caught.run.key, 'pairs');
  assert.equal(R.run, null, 'nothing sent'); assert.deepEqual(calls, []);
  // two tasks, then the list
  const st = head.TasksStaff._state();
  st.list.push({ run: caught.run, pos: 'Room 12', label: 'P1 pairs' }, { run: { id: 'A2', key: 'quiz', patient: 'P2', opt: {}, at: 0, preview: false }, pos: 'Room 14', label: 'P2 quiz' });
  head.TasksStaff.start();
  assert.ok(await until(() => calls.includes('go:Room 12')), 'task 1: the robot drives to Room 12');
  const id1 = head.LinkStaff._cur().id;
  assert.notEqual(id1, 'A1', 'every task run gets its own id');
  // task 1 finished: no trip to the base, task 2 goes to Room 14
  nav = { state: 'arrived', place: 'Room 12' };
  head.LinkStaff._apply({ id: id1, state: 'finished' });
  assert.ok(!calls.includes('go:Home7'), 'between two tasks: not to the base');
  assert.ok(await until(() => calls.includes('go:Room 14'), 5000), 'task 2: the robot drives on to Room 14');
  const id2 = head.LinkStaff._cur().id;
  assert.notEqual(id2, id1);
  assert.equal(R.run.patient, 'P2');
  // the last task finished: home, the list ends
  nav = { state: 'arrived', place: 'Room 14' };
  head.LinkStaff._apply({ id: id2, state: 'finished' });
  assert.ok(await until(() => calls.includes('go:Home7')), 'after the last task: back to the base');
  assert.equal(head.TasksStaff._state().run, null);
});

test('3 corner taps (16 Nov): the robot stops at once where it is, the run is cancelled without a trip to the base, the list stops; a new trip stops an old one first', async () => {
  const code = 'stop1234';
  const R = T.room(code);
  const calls = [];
  let nav = { state: 'moving' }, busyOnce = true;
  const BellatrixApp = {
    robotState: () => JSON.stringify({ connected: true, localized: true }),
    robotPlaces: () => JSON.stringify([{ name: 'Room 12', x: 1, y: 2 }, { name: 'Home7', x: 0, y: 0 }]),
    robotGo: (p) => { if (busyOnce) { busyOnce = false; calls.push('busy:' + p); return 'busy'; } calls.push('go:' + p); return 'ok'; },
    robotStop: () => { calls.push('stop'); return 'ok'; },
    robotNav: () => JSON.stringify(nav),
  };
  const headLs = store({ 'bellatrix-call-server': URL0, 'bellatrix-link-code': code, 'bellatrix-home-place': 'Home7' });
  const head = sandbox('js/link-staff.js', headLs, { Lab: { toast() {} }, BellatrixApp, __tasksTest: true });
  vm.runInContext(src('js/tasks-staff.js'), head, { filename: 'js/tasks-staff.js' });
  head.TasksStaff._boot();
  const st = head.TasksStaff._state();
  st.list.push({ run: { id: 'B1', key: 'pairs', patient: 'P1', opt: {}, at: 0, preview: false }, pos: 'Room 12', label: 'P1 pairs' },
    { run: { id: 'B2', key: 'quiz', patient: 'P2', opt: {}, at: 0, preview: false }, pos: 'Room 12', label: 'P2 quiz' });
  head.TasksStaff.start();
  assert.ok(await until(() => calls.includes('go:Room 12')), 'still busy with an old trip: stopped, then the new trip ' + calls.join(','));
  assert.deepEqual(calls.slice(0, 3), ['busy:Room 12', 'stop', 'go:Room 12']);
  const n = calls.length;
  head.LinkStaff._corner({ clientX: 500, clientY: 30 }); head.LinkStaff._corner({ clientX: 500, clientY: 30 }); head.LinkStaff._corner({ clientX: 500, clientY: 30 });
  assert.equal(calls.length, n, 'taps elsewhere do nothing');
  for (let i = 0; i < 3; i++) head.LinkStaff._corner({ clientX: 20, clientY: 30 });
  assert.equal(calls[n], 'stop', 'the robot stops at once');
  assert.equal(head.LinkStaff.peeking(), true, 'the Care Team screens show');
  assert.equal(head.TasksStaff._state().run, null, 'the list stopped');
  assert.ok(await until(() => head.LinkStaff._cur() && head.LinkStaff._cur().state === 'cancelled'), 'the run is cancelled');
  await sleep(300);
  assert.ok(!calls.includes('go:Home7'), 'no trip to the base: it stays where it stopped');
});
