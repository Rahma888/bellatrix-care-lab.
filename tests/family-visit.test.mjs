// 14 Nov (Rahma, family app test on her phone): the family flow, without a browser.
//   - WhatsApp ticks: sent -> delivered (deliveredAt, on the robot) -> read (readAt, seen on the tablet);
//   - no duration limit for voice and video, only an invisible size cap (95 MB, under the tunnel's 100 MB),
//     uploads streamed to disk;
//   - install: the one-time sign-in code for the app on an iPhone's Home Screen (family/login/handoff);
//   - the head's notification -> ONE tap -> a link run of 'messages' with the resident and the place
//     (asked once, kept in the resident's prefs), the robot's family identity in opt.fam, the call request
//     told "on the way" (call_visit); the tablet takes the identity out of the run and adopts it;
//   - the notification button (bell) and the install entry exist in the portal code.
// Run: node tests/family-visit.test.mjs. Silent (no browser, no sound), synthetic data, a temporary folder
// only: labland/data is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-visit-test-'));
process.env.PORTAL_DATA = path.join(TMP, 'portal');
process.env.BELLATRIX_NOTIFY_NO_REGISTER = '1';
const Portal = await import('../labland/family-portal.mjs');
const C = await import('../labland/family-callreq.mjs');
const quiet = () => {};
const dataDir = path.join(TMP, 'portal');
const portal = Portal.createPortal({ dataDir, log: quiet, rateLimit: false });
const events = [];
const calls = C.createCallReq({ dataDir, portal, notify: (pid, ev) => { events.push(Object.assign({ pid }, ev)); }, relay: { info: () => ({ state: 'waiting' }), cancel() {}, last: () => null }, log: quiet, timer: false });
Portal.registerRoutes('family/calls', (req, url, body, ctx) => calls.familyRoute(req, url, body, ctx));
Portal.registerRoutes('robot/calls', (req, url, body, ctx) => calls.robotRoute(req, url, body, ctx));
Portal.setNotifier((pid, ev) => { events.push(Object.assign({ pid }, ev)); });
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
  return { status: r.status, data: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const ROBOT = 'visit_robot_' + crypto.randomBytes(6).toString('hex'), KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + ROBOT + '.' + KEY;
const B = (t) => 'Bearer ' + t;
const X = {};
const H = () => ({ headers: { 'X-Resident': X.rid } });

test('setup: a robot, a resident, a relative', async () => {
  assert.equal((await call('POST', 'robot/hello', { robot: ROBOT, key: KEY })).status, 200);
  X.rid = (await call('POST', 'robot/resident', { code: 'P1', label: 'Anna', lang: 'fr' }, R)).data.rid;
  const inv = await call('POST', 'robot/invite', { rid: X.rid }, R);
  const reg = await call('POST', 'family/register', { code: inv.data.code, email: 'sophie@example.test', name: 'Sophie', relation: 'fille', lang: 'fr', consent: true });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  X.tok = reg.data.token;
  /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation:
     the head finds it in its pending list and validates it, as js/messages-staff.js does. */
  const acc = (await call('GET', 'robot/state', undefined, R)).data.residents[0].accounts.find((a) => a.email === 'sophie@example.test' && a.status === 'pending');
  assert.ok(acc, 'waiting in the care team\'s list');
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R)).data.status, 'active');
  X.pid = portal.authFamily({ headers: { authorization: B(X.tok) } }).pid;
});

test('WhatsApp ticks: sent, then delivered (deliveredAt), then read (readAt) — stored on the server, shown in the family thread', async () => {
  const m = (await call('POST', 'family/message', { text: 'Bonjour maman' }, B(X.tok), H())).data.message;
  assert.equal(m.status, 'sent'); assert.equal(m.deliveredAt, null); assert.equal(m.readAt, null);
  const me1 = (await call('GET', 'family/me', undefined, B(X.tok), H())).data.messages.find((x) => x.id === m.id);
  assert.equal(me1.status, 'sent', 'one grey tick');
  assert.equal((await call('POST', 'robot/received', { ids: [m.id] }, R)).data.updated, 1);
  const me2 = (await call('GET', 'family/me', undefined, B(X.tok), H())).data.messages.find((x) => x.id === m.id);
  assert.equal(me2.status, 'received'); assert.ok(me2.deliveredAt, 'two grey ticks: deliveredAt'); assert.equal(me2.readAt, null);
  const feed = (await call('GET', 'robot/feed', undefined, R)).data.messages.find((x) => x.id === m.id);
  assert.ok(feed.deliveredAt, 'the robot sees deliveredAt too');
  const at = new Date().toISOString();
  assert.equal((await call('POST', 'robot/read', { items: [{ id: m.id, at, by: 'robot' }] }, R)).data.updated, 1);
  const me3 = (await call('GET', 'family/me', undefined, B(X.tok), H())).data.messages.find((x) => x.id === m.id);
  assert.equal(me3.status, 'read'); assert.ok(me3.readAt, 'two blue ticks: readAt'); assert.ok(me3.deliveredAt);
  assert.ok(events.some((e) => e.type === 'message-read' && e.message === m.id), 'the family is told it was read');
  /* a message read straight away still gets a deliveredAt */
  const m2 = (await call('POST', 'family/message', { text: 'Deuxième' }, B(X.tok), H())).data.message;
  await call('POST', 'robot/read', { items: [{ id: m2.id, at }] }, R);
  const me4 = (await call('GET', 'family/me', undefined, B(X.tok), H())).data.messages.find((x) => x.id === m2.id);
  assert.ok(me4.deliveredAt && me4.readAt);
  /* the portal draws them: one tick for sent, two grey, two blue #53BDEB */
  const src = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'css', 'portail.css'), 'utf8');
  assert.match(src, /function tickState\(m\)/); assert.match(src, /data-ticks="/);
  assert.match(css, /\.ticks\.t-read \{ color: #53BDEB; \}/i);
  assert.doesNotMatch(src, /class="steps"/, 'the old Sent › Received › Read steps are gone');
});

test('no duration limit: no seconds anywhere, an upload far above the old 30 MB is taken (streamed), only > 95 MB is refused', async () => {
  const me = (await call('GET', 'family/me', undefined, B(X.tok), H())).data;
  assert.equal(me.limits.voiceSeconds, undefined); assert.equal(me.limits.videoSeconds, undefined);
  assert.equal(me.limits.videoBytes, 95 * 1024 * 1024); assert.equal(me.limits.voiceBytes, 95 * 1024 * 1024);
  const big = Buffer.alloc(40 * 1024 * 1024, 7);
  const up = await call('POST', 'family/upload?kind=video', undefined, B(X.tok), { headers: H().headers, raw: big, type: 'video/webm' });
  assert.equal(up.status, 200, JSON.stringify(up.data)); assert.equal(up.data.bytes, big.length);
  const msg = await call('POST', 'family/message', { upload: up.data.upload, text: '' }, B(X.tok), H());
  assert.equal(msg.status, 200); assert.equal(msg.data.message.kind, 'video');
  /* the robot gets the whole file back, with ranges for long playback */
  const whole = await fetch(BASE + 'robot/media?id=' + msg.data.message.id, { headers: { Authorization: R } });
  assert.equal(Number(whole.headers.get('content-length')), big.length); await whole.arrayBuffer();
  const part = await fetch(BASE + 'robot/media?id=' + msg.data.message.id, { headers: { Authorization: R, Range: 'bytes=1000-1999' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 1000);
  const long = await call('POST', 'family/upload?kind=voice', undefined, B(X.tok), { headers: H().headers, raw: Buffer.alloc(12 * 1024 * 1024, 1), type: 'audio/webm' });
  assert.equal(long.status, 200, 'a voice message far above the old 6 MB (about an hour of speech)');
  const huge = await call('POST', 'family/upload?kind=video', undefined, B(X.tok), { headers: H().headers, raw: Buffer.alloc(96 * 1024 * 1024, 1), type: 'video/mp4' }).catch(() => ({ status: 413, data: { error: 'media-too-big' } }));
  assert.equal(huge.status, 413); assert.equal(huge.data.error, 'media-too-big');
  const left = fs.readdirSync(path.join(dataDir, 'photos')).filter((f) => /^part_/.test(f));
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'photos')).filter((f) => /^part_/.test(f)), [], 'no temporary file is left (' + left.length + ' before)');
  const src = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8');
  assert.doesNotMatch(src, /Up to \{n\} seconds/); assert.doesNotMatch(src, /LIMIT\[kind\]/); assert.doesNotMatch(src, /Recording… \{s\} s'\)/);
  assert.doesNotMatch(src, /v\.duration > 61/);
  assert.match(src, /function uploadMedia\(kind, media\)/, 'uploads show their progress');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'js', 'staff-tools.js'), 'utf8'), /voiceSeconds|videoSeconds/, 'the demo seed has no duration limit either');
});

test('install on an iPhone: the signed-in browser gives a one-time code that signs the installed app in', async () => {
  const h = await call('POST', 'family/login/handoff', {}, B(X.tok));
  assert.equal(h.status, 200); assert.match(h.data.code, /^\d{6}$/); assert.equal(h.data.email, 'sophie@example.test');
  assert.equal((await call('POST', 'family/login/handoff', {})).status, 401, 'only for a signed-in person');
  const v = await call('POST', 'family/login/verify', { email: 'sophie@example.test', code: h.data.code });
  assert.equal(v.status, 200); assert.ok(v.data.token && v.data.token !== X.tok, 'a session of its own for the installed app');
});

test('a call request: "Go to Anna" on the head tells the family "on the way" (visitAt, call_visit)', async () => {
  const q = (await call('POST', 'family/calls/request', { when: 'soon', note: '' }, B(X.tok), H())).data.request;
  const d = await call('POST', 'robot/calls/decide', { id: q.id, decision: 'visit' }, R);
  assert.equal(d.status, 200); assert.ok(d.data.request.visitAt); assert.equal(d.data.request.state, 'open');
  assert.ok(events.some((e) => e.type === 'call_visit' && e.pid === X.pid), 'the relative is told');
  const fam = (await call('GET', 'family/calls', undefined, B(X.tok), H())).data;
  assert.ok(fam.request.visitAt, 'the portal shows "Bellatrix is on the way to Anna…"');
  const N = await import('../labland/family-notify.mjs');
  assert.equal(N.textOf({ type: 'call_visit', vars: { label: 'Anna' } }, 'fr').title, 'Bellatrix va voir Anna…');
  X.req = q;
});

test('a photo the team puts into Memories on the head is flagged for the tablet (teamAlbum)', async () => {
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, 0, 40, 0, 60, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]).toString('base64');
  const m = (await call('POST', 'family/message', { text: 'Photo', photo: jpeg }, B(X.tok), H())).data.message;
  assert.equal((await call('POST', 'robot/message/album', { id: m.id, album: true }, R)).data.album, true);
  assert.equal((await call('GET', 'robot/feed', undefined, R)).data.messages.find((x) => x.id === m.id).teamAlbum, true);
  assert.equal((await call('POST', 'robot/message/album', { id: m.id, album: false }, R)).data.album, false);
});

/* ---------- the head module and the tablet module, in a small fake browser ---------- */
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function headWorld(opts) {
  const sent = [], posts = [], opened = [], prefs = { P1: { greet: 'Anna', lang: 'fr' } };
  const store = { patients: { P1: { prefs: prefs.P1, content: {} } }, settings: { staff: 'RB' } };
  const ls = fakeStorage({ 'bellatrix-care-lab-v1': JSON.stringify(store), 'bellatrix-portal-key': KEY });
  const book = { loud: true, residents: { P1: { acceptNow: false, times: [], contacts: [{ id: 'c1', name: 'Sophie', rel: 'daughter', label: 'Maman', lang: 'fr', photo: 'data:image/jpeg;base64,AAAA', portalPid: X.pid }] } } };
  const strip = { innerHTML: '', hidden: true, setAttribute() {}, addEventListener() {} };
  const win = {
    localStorage: ls, console,
    document: { readyState: 'complete', getElementById: (id) => (id === 'fvNotes' ? strip : id === 'bannerTray' ? { parentNode: { insertBefore() {} } } : null), createElement: () => strip, body: { classList: { toggle() {} } }, activeElement: null, addEventListener() {} },
    ST: Object.assign((k, v) => k.replace(/\{(\w+)\}/g, (a, n) => (v && v[n] !== undefined ? v[n] : a)), { add() {} }),
    I18N: { valid: (l) => (['fr', 'de', 'en'].includes(l) ? l : 'en') },
    StaffUI: { pref: (c, k) => (prefs[c] || {})[k], setPref: (c, k, v) => { (prefs[c] = prefs[c] || {})[k] = v; return true; } },
    BellatrixApp: opts.robot ? { robotPlaces: () => JSON.stringify([{ name: 'Zimmer 12' }, { name: 'Salon' }]) } : undefined,
    AlbumStaff: { open: (c) => { opened.push(c); } },
    MessagesStaff: { _state: () => ({ notifications: opts.notes || [] }), refresh() {} },
    CallReqStaff: { _waiting: () => opts.reqs || [], residentInfo: () => ({ label: 'Anna' }), visitPick: (q) => ({ person: { pid: X.pid, name: 'Sophie' }, contact: book.residents.P1.contacts[0] }), refresh() {} },
    FamilyCall: { robotId: () => ROBOT, server: () => 'https://bellatrix.example.test', loud: () => true, book: () => JSON.parse(JSON.stringify(book)) },
    FamilyMessages: { request: (m, p, b) => { posts.push([p, b]); return Promise.resolve({ ok: true }); } },
    LinkStaff: { configured: () => true, send: (run, place) => { sent.push({ run, place }); cur = { id: run.id }; return Promise.resolve(); }, _cur: () => cur },
    setInterval: () => 0, setTimeout: (f) => f(), __visitNoStart: true, __visitTest: true
  };
  let cur = null;
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'family-visit-staff.js'), 'utf8'), win);
  return { win, sent, posts, prefs, strip };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
/* objects made inside the fake browser (another realm): compared as JSON */
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

test('head: a message notification -> ONE tap "Go to Anna" -> a link run of "Family messages" with the place and the family identity', async () => {
  const w = headWorld({ robot: true, notes: [{ id: 'n1', code: 'P1', label: 'Anna', kind: 'photo', from: 'Sophie', at: '2026-11-14T10:00:00Z', seen: false, message: 'm1', status: 'received', hasPhoto: true },
    { id: 'n2', code: 'P1', label: 'Anna', kind: 'album', from: 'Sophie', at: '2026-11-14T10:01:00Z', seen: false, message: 'm2', status: 'received' }] });
  const V = w.win.FamilyVisitStaff;
  const list = V.notices();
  assert.equal(list.length, 1); assert.equal(list[0].kind, 'message'); same(list[0].msgs, ['m1'], 'album photos need no visit');
  V.paint(true);
  assert.match(w.strip.innerHTML, /Message from Sophie for Anna/); assert.match(w.strip.innerHTML, /Go to Anna/);
  assert.equal((w.strip.innerHTML.match(/data-fv="go"/g) || []).length, 1, 'one button');
  assert.match(w.strip.innerHTML, /data-fv="photos"/, 'the family photos are one tap away (Memories)');
  /* no place yet: the button asks for it once */
  V.go('P1'); await flush();
  assert.equal(w.sent.length, 0); assert.match(w.strip.innerHTML, /Where is Anna\?/); assert.match(w.strip.innerHTML, /Zimmer 12/);
  w.prefs.P1.place = 'Zimmer 12';
  V.go('P1'); await flush();
  assert.equal(w.sent.length, 1);
  const s = w.sent[0];
  assert.equal(s.place, 'Zimmer 12'); assert.equal(s.run.key, 'messages'); assert.equal(s.run.patient, 'P1');
  assert.equal(s.run.opt.fam.robot, ROBOT); assert.equal(s.run.opt.fam.key, KEY); same(s.run.opt.fam.ids, ['m1']);
  assert.equal(s.run.opt.fam.book.P1.contacts[0].photo, undefined, 'no photo travels');
  assert.equal(s.run.opt.camMode, 'air', 'pointing in the air is on for the visit (15 Nov); the tablet keeps its own camera hardware settings');
  assert.ok(w.posts.some((p) => p[0] === 'robot/notification/seen' && p[1].ids.includes('n1')), 'the notification is seen');
});

test('head: a call request -> "Go to Anna" -> the run carries the call; the family is told "on the way"', async () => {
  const w = headWorld({ robot: false, reqs: [{ id: 'q1', code: 'P1', label: 'Anna', from: 'family', pid: X.pid, name: 'Sophie', when: 'soon', at: '2026-11-14T10:05:00Z', state: 'open' }],
    notes: [{ id: 'n3', code: 'P1', label: 'Anna', kind: 'text', from: 'Sophie', at: '2026-11-14T10:00:00Z', seen: false, message: 'm3', status: 'sent' }] });
  const V = w.win.FamilyVisitStaff;
  const n = V.notices()[0];
  assert.equal(n.kind, 'call'); V.paint(true);
  assert.match(w.strip.innerHTML, /Sophie wants to call Anna/);
  V.go('P1'); await flush();
  assert.equal(w.sent.length, 1, 'no robot: no place to ask, the run goes at once');
  const fam = w.sent[0].run.opt.fam;
  same(fam.call, { req: 'q1', contact: 'c1', name: 'Sophie', pid: X.pid });
  assert.ok(w.posts.some((p) => p[0] === 'robot/calls/decide' && p[1].decision === 'visit' && p[1].id === 'q1'));
  /* a planned call only shows 10 minutes before its time */
  const later = headWorld({ reqs: [{ id: 'q2', code: 'P1', from: 'family', name: 'Sophie', when: 'planned', planAt: new Date(Date.now() + 3600000).toISOString(), state: 'open' }] });
  assert.equal(later.win.FamilyVisitStaff.notices().length, 0);
  const due = headWorld({ reqs: [{ id: 'q3', code: 'P1', from: 'family', name: 'Sophie', when: 'planned', planAt: new Date(Date.now() + 5 * 60000).toISOString(), state: 'open' }] });
  assert.equal(due.win.FamilyVisitStaff.notices()[0].kind, 'planned');
  due.win.FamilyVisitStaff.paint(true);
  assert.match(due.strip.innerHTML, /Planned call: Sophie and Anna/);
});

test('tablet: the family identity leaves the run at once and becomes the tablet\'s; the visit is taken once', () => {
  const ls = fakeStorage({ 'bellatrix-family-robot': 'tabletOwnId000000000', 'bellatrix-portal-key': 'x'.repeat(40), 'bellatrix-call-server': 'https://bellatrix.example.test', 'bellatrix-camera-settings': 'keep-me' });
  let saved = null, reset = 0, synced = 0;
  const win = { localStorage: ls, console, I18N: { add() {}, dict: { fr: {}, de: {} } },
    FamilyCall: { book: () => ({ residents: {} }), saveBook: (b) => { saved = b; }, report() {} },
    FamilyMessages: { resetIdentity: () => { reset++; }, sync: () => { synced++; return Promise.resolve(); } } };
  win.window = win; vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'family-visit-patient.js'), 'utf8'), win);
  const run = { id: 'R1', key: 'messages', patient: 'P1', opt: { lang: 'fr', fam: { v: 1, robot: ROBOT, key: KEY, server: 'https://bellatrix.example.test', loud: true, ids: ['m1'], call: { req: 'q1', contact: 'c1', name: 'Sophie', pid: 'p1' },
    book: { P1: { contacts: [{ id: 'c1', name: 'Sophie', rel: 'daughter', label: 'Maman', lang: 'fr' }], times: [] } } } } };
  assert.equal(win.FamilyVisit.onRun(run), true);
  assert.equal(run.opt.fam, undefined, 'nothing of it stays in the run (never stored with the session)');
  assert.equal(ls.getItem('bellatrix-family-robot'), ROBOT); assert.equal(ls.getItem('bellatrix-portal-key'), KEY);
  assert.equal(ls.getItem('bellatrix-camera-settings'), 'keep-me', 'the camera settings are not touched');
  assert.equal(saved.residents.P1.contacts[0].id, 'c1'); assert.equal(reset, 1); assert.equal(synced, 1);
  const v = win.FamilyVisit.take('P1');
  same(v.ids, ['m1']); assert.equal(v.call.contact, 'c1');
  assert.equal(win.FamilyVisit.take('P1'), null, 'once');
  assert.equal(win.FamilyVisit.onRun({ id: 'R2', opt: { lang: 'fr' } }), false, 'other runs are left alone');
});

test('the portal has a visible notifications button with clear states, and the install entry', () => {
  const pc = fs.readFileSync(path.join(ROOT, 'js', 'portail-calls.js'), 'utf8'), p = fs.readFileSync(path.join(ROOT, 'js', 'portail.js'), 'utf8');
  for (const s of ['On', 'Off', 'Blocked by the browser: allow them in its settings.', 'iPhone: first install the app on the Home Screen (iOS 16.4 or later).']) assert.ok(pc.includes("T('" + s + "')"), s);
  assert.match(pc, /function pushRow\(\)/); assert.match(pc, /pushRow\(\) \+/, 'always the first line of the bell sheet');
  assert.match(pc, /b\.className = 'pc-bell' \+ \(on \? '' : ' off'\)/, 'the bell shows when they are off');
  assert.match(p, /function installCard\(\)/); assert.match(p, /h \+= installCard\(\);/, 'in the Plus tab');
  assert.match(p, /function installOnce\(\)/); assert.match(p, /installOnce\(\) \+ callButton\(\)/, 'once after the first sign-in');
  assert.match(p, /FBAN\|FBAV\|FB_IAB/, 'Messenger / Facebook in-app browsers are recognised');
  assert.match(p, /beforeinstallprompt/); assert.match(p, /login\/handoff/);
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'portail.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone'); assert.ok(m.start_url.startsWith(m.scope), 'start_url inside the scope');
  for (const i of m.icons.filter((x) => x.type === 'image/png')) {
    const b = fs.readFileSync(path.join(ROOT, i.src)), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.equal(w + 'x' + h, i.sizes, i.src + ' has its declared size');
  }
});

test('LF line endings in the files of this change', () => {
  for (const f of ['js/family-visit-staff.js', 'js/family-visit-patient.js', 'css/family-visit.css', 'js/portail.js', 'js/portail-calls.js', 'js/messages.js', 'js/famille.js', 'labland/family-portal.mjs', 'labland/family-callreq.mjs', 'tests/family-visit.test.mjs'])
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('\r'), f);
});

test.after(() => { server.close(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* temp */ } });
