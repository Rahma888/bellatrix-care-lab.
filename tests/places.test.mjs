// 15 Nov (the boss: "your place is the office; all the rooms are just places where the patients are"):
// js/places.js and its use in the pickers, without a browser and without a robot.
//   - roles: ONE base (office / nursing station), rooms (default), other (hidden); saved on the head;
//   - every picker: '–' first, rooms only, the resident's saved room preselected, else '–';
//     '–' = no driving (strict mode: '–' starts nothing);
//   - the return trip goes to the BASE; nothing configured = the old home place and every place;
//   - the Navigation test panel with a simulated bridge: state, places with Go, Back to base, STOP,
//     the last drives with the code in plain words (20010016), Copy; Relocalize only when the app has it.
// Run: node tests/places.test.mjs. Silent: no browser, no sound, no network, no robot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
/* ST as on the page: the modules add their texts, ST(key) answers in the chosen language. */
function fakeST(lang) {
  const dict = { fr: {}, de: {} };
  const ST = (k, v) => String((dict[lang] && dict[lang][k]) || k).replace(/\{(\w+)\}/g, (a, n) => (v && v[n] !== undefined ? v[n] : a));
  ST.add = (l, o) => { Object.assign(dict[l] = dict[l] || {}, o); };
  ST.dict = dict;
  return ST;
}
/* The robot head's bridge, simulated: a map, a navigation state machine, every call recorded. */
function fakeRobot(opts) {
  const o = opts || {};
  const r = {
    calls: [],
    places: o.places || ['Standby-Punkt', 'Zimmer 12', 'Zimmer 14', 'Salon', 'Ladestation'],
    state: { connected: true, localized: true, mapName: 'Station 3', battery: 82, charging: false, pose: { x: 1.25, y: -3.5, theta: Math.PI / 2 }, lastError: '' },
    nav: { state: 'idle', place: '', reason: '', since: 1, attempt: 0, waitedS: 0, code: 0, codeText: '' },
  };
  const app = {
    robotConnect: () => 'ok',
    robotState: () => JSON.stringify(Object.assign({}, r.state, { nav: r.nav })),
    robotPlaces: () => JSON.stringify(r.places.map((name, i) => ({ name, x: i, y: 0 }))),
    robotNav: () => JSON.stringify(r.nav),
    robotGo: (p) => { r.calls.push('go:' + p); if (r.nav.state === 'moving') return 'busy'; r.nav = { state: 'moving', place: p, reason: '', since: r.nav.since + 1, attempt: 1, waitedS: 0, code: 0, codeText: '' }; return 'ok'; },
    robotStop: () => { r.calls.push('stop'); if (r.nav.state === 'moving') r.nav = Object.assign({}, r.nav, { state: 'idle', reason: 'stopped', since: r.nav.since + 1 }); return 'ok'; },
  };
  if (o.reloc) app.robotRelocalize = () => { r.calls.push('reloc'); r.state.reloc = { state: 'running', text: '', at: 1 }; return 'ok'; };
  /* PLAN-NAV.md: the head app with the navigation mode (robotNavMode, stateJson().navMode, navJson().mode/leg/legs) */
  if (o.navMode) {
    r.mode = 'route';
    app.robotNavMode = (m) => { r.calls.push('mode:' + m); if (m === 'route' || m === 'place') r.mode = m; return r.mode; };
    app.robotGo = (p) => {
      r.calls.push('go:' + p); if (r.nav.state === 'moving') return 'busy';
      r.nav = { state: 'moving', place: p, reason: '', since: r.nav.since + 1, attempt: 1, waitedS: 0, code: 0, codeText: '', mode: r.mode, leg: 0, legs: 0 };
      return 'ok';
    };
    r.state.navMode = 'route';
  }
  r.app = app;
  return r;
}
/* One head in a sandbox: js/places.js (+ the other files asked), its own storage, nothing started. */
function head(opts) {
  const o = opts || {};
  const ls = fakeStorage(o.ls);
  const toasts = [];
  const prefs = o.prefs || {};
  const win = {
    localStorage: ls, console, ST: fakeST(o.lang || 'en'), Lab: { toast: (t) => toasts.push(t), patient: o.patient || 'P1' },
    StaffUI: { pref: (c, k) => (prefs[c] || {})[k], setPref: (c, k, v) => { (prefs[c] = prefs[c] || {})[k] = v; if (v === '' || v == null) delete prefs[c][k]; return true; } },
    BellatrixApp: o.robot ? o.robot.app : undefined,
    __placesTest: true, __linkTest: true, __visitNoStart: true, __visitTest: true,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    navigator: {},
  };
  if (o.dom) win.document = o.dom;
  win.window = win;
  vm.createContext(win);
  for (const f of ['js/places.js'].concat(o.files || [])) vm.runInContext(src(f), win, { filename: f });
  return { win, ls, toasts, prefs, P: win.Places };
}
const ROLES = (base, roles) => JSON.stringify({ v: 1, base, roles, at: '2026-11-15T09:00:00Z' });
const options = (html) => [...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map((m) => ({ v: m[1], sel: !!m[2], t: m[3] }));

test('roles: the defaults, ONE base, rooms, other; saved on the head (and the old home place follows the base)', () => {
  const R = fakeRobot();
  const { P, ls } = head({ robot: R });
  assert.equal(P.configured(), false);
  assert.equal(P.role('Standby-Punkt'), 'base', 'default base: the old home place');
  assert.equal(P.role('Zimmer 12'), 'room', 'default: a patient room');
  assert.equal(P.role('Ladestation'), 'other', 'the charging pile is never a room');
  assert.ok(P.setRole('Salon', 'other'));
  assert.equal(P.configured(), true);
  const saved = JSON.parse(ls.getItem('bellatrix-places'));
  assert.equal(saved.base, 'Standby-Punkt', 'the first change saves the proposed base too');
  assert.equal(saved.roles['Zimmer 12'], 'room');
  assert.equal(saved.roles.Salon, 'other');
  assert.equal(saved.roles.Ladestation, 'other');
  // the base moves: the old base becomes a room, only one base
  assert.ok(P.setRole('Zimmer 14', 'base'));
  assert.equal(P.base(), 'Zimmer 14');
  assert.equal(P.role('Standby-Punkt'), 'room');
  assert.deepEqual([...P.rooms()], ['Standby-Punkt', 'Zimmer 12']);
  assert.equal(ls.getItem('bellatrix-home-place'), 'Zimmer 14', 'older readers of the home place agree');
  assert.equal(P.setRole('Zimmer 12', 'kitchen'), false, 'unknown roles are refused');
  // an office-like name is proposed when the old home place is not on the map
  const B = head({ robot: fakeRobot({ places: ['Zimmer 1', 'Ladestation', 'Pflege-Stützpunkt', 'Büro'] }) });
  assert.equal(B.P.role('Pflege-Stützpunkt'), 'base');
  assert.equal(B.P.role('Ladestation'), 'other', '"…station" of the charging pile is not the nursing station');
});

test('nothing configured = exactly as before: every place offered, the robot goes back to the old home place', () => {
  const R = fakeRobot();
  const { P } = head({ robot: R });
  assert.deepEqual([...P.rooms()], R.places, 'every map place, as before');
  assert.equal(P.base(), 'Standby-Punkt');
  const H = head({ robot: R, ls: { 'bellatrix-home-place': 'Home7' } });
  assert.equal(H.P.base(), 'Home7', 'the home place setting still counts');
  const none = head({});
  assert.deepEqual([...none.P.all()], [], 'no robot: no places');
  assert.deepEqual([...none.P.rooms()], []);
  assert.equal(none.P.canStart(''), true, 'no robot: nothing to choose');
});

test('pickers: "–" first, rooms only, the resident\'s saved room preselected, else "–"', () => {
  const R = fakeRobot();
  const prefs = { P1: { place: 'Zimmer 12' }, P2: { place: 'Salon' } };
  const { P } = head({ robot: R, prefs, ls: { 'bellatrix-places': ROLES('Standby-Punkt', { 'Zimmer 12': 'room', 'Zimmer 14': 'room', Salon: 'room', Ladestation: 'other' }) } });
  let o = options(P.pickerHtml({ id: 'x', code: 'P1' }));
  assert.deepEqual(o.map((x) => x.v), ['', 'Zimmer 12', 'Zimmer 14', 'Salon'], 'no base, no charging pile');
  assert.equal(o[0].t, '–');
  assert.deepEqual(o.filter((x) => x.sel).map((x) => x.v), ['Zimmer 12'], 'the saved room');
  o = options(P.pickerHtml({ code: 'P9' }));
  assert.deepEqual(o.filter((x) => x.sel).map((x) => x.v), [''], 'nothing saved: "–" stays');
  assert.equal(P.roomOf('P2'), 'Salon');
  P.setRole('Salon', 'other');
  assert.equal(P.roomOf('P2'), '', 'a place that is no longer a room is not preselected');
  assert.ok(P.setRoom('P3', 'Zimmer 14'));
  assert.equal(prefs.P3.place, 'Zimmer 14', 'kept in the resident\'s Care Team prefs');
  assert.equal(P.label(''), '–');
  // '–' = no driving: allowed, except in strict mode
  assert.equal(P.strict(), false);
  assert.equal(P.canStart(''), true);
  const Sx = head({ robot: R, ls: { 'bellatrix-place-required': '1' } });
  assert.equal(Sx.P.canStart(''), false, 'strict: "–" starts nothing');
  assert.equal(Sx.P.canStart('Zimmer 12'), true);
});

/* A tiny DOM, enough for the activity's Position field (js/link-staff.js fillPos). */
function posDom() {
  const reg = {};
  const parent = { replaceChild: (n) => { reg.lkPos = n; } };
  reg.lkPos = { tagName: 'INPUT', value: '', parentNode: parent };
  return {
    reg,
    getElementById: (id) => reg[id] || null,
    createElement: (tag) => ({ tagName: tag.toUpperCase(), value: '', innerHTML: '', parentNode: parent, setAttribute() {}, addEventListener() {} }),
    querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {} }, appendChild() {} },
  };
}
test('the activity start: the Position list shows the rooms with "–" first; the resident\'s room, else "–"', () => {
  const R = fakeRobot();
  const dom = posDom();
  const prefs = { P1: { place: 'Zimmer 14' } };
  const H = head({ robot: R, dom, prefs, files: ['js/link-staff.js'], ls: { 'bellatrix-link-position': 'Salon', 'bellatrix-places': ROLES('Standby-Punkt', { Ladestation: 'other' }) } });
  H.win.LinkStaff._fillPos();
  let el = dom.reg.lkPos;
  assert.equal(el.tagName, 'SELECT');
  assert.deepEqual(options(el.innerHTML).map((x) => x.v), ['', 'Zimmer 12', 'Zimmer 14', 'Salon']);
  assert.equal(el.value, 'Zimmer 14', 'the resident\'s room (not the last place used)');
  // another resident without a room: '–'
  H.win.Lab.patient = 'P2';
  H.win.LinkStaff._fillPos();
  assert.equal(dom.reg.lkPos.value, '', 'nothing by accident');
  // the team's choice stays while the list is refreshed (every 5 s)
  dom.reg.lkPos.value = 'Salon';
  H.win.LinkStaff._fillPos();
  assert.equal(dom.reg.lkPos.value, 'Salon');
  // chosen for a resident who has no room yet: kept as their room (asked once); a saved room is not overwritten
  H.P._onChange({ target: { id: 'lkPos', tagName: 'SELECT', value: 'Salon', getAttribute: () => null } });
  assert.equal(prefs.P2.place, 'Salon');
  H.win.Lab.patient = 'P1';
  H.P._onChange({ target: { id: 'lkPos', tagName: 'SELECT', value: 'Zimmer 12', getAttribute: () => null } });
  assert.equal(prefs.P1.place, 'Zimmer 14', 'P1 keeps the room the team saved');
  H.win.Lab.patient = 'P2';
  // without js/places.js (old page): every place, the last place used
  const dom2 = posDom();
  const ls = fakeStorage({ 'bellatrix-link-position': 'Salon' });
  const win = { localStorage: ls, console, document: dom2, BellatrixApp: R.app, Lab: { toast() {}, patient: 'P1' }, __linkTest: true, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {} };
  win.window = win; vm.createContext(win); vm.runInContext(src('js/link-staff.js'), win);
  win.LinkStaff._fillPos();
  assert.deepEqual(options(dom2.reg.lkPos.innerHTML).map((x) => x.v), ['', ...R.places]);
  assert.equal(dom2.reg.lkPos.value, 'Salon', 'old behaviour kept');
});

/* js/link-staff.js against a fetch that always says yes (the link server's contract is tested in link.test.mjs). */
function linkHead(opts) {
  const posts = [];
  const H = head(Object.assign({ files: ['js/link-staff.js'], dom: posDom() }, opts, {
    ls: Object.assign({ 'bellatrix-call-server': 'https://link.example.test', 'bellatrix-link-code': 'plc12345' }, (opts || {}).ls),
  }));
  H.win.fetch = (url, init) => {
    if (/\/status\?/.test(url)) return new Promise(() => {});   /* the long-poll never answers here */
    posts.push([url.replace(/^.*\/plc12345\//, ''), init && init.body ? JSON.parse(init.body) : null]);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  };
  return Object.assign(H, { posts });
}
test('the end of a visit: the robot goes back to the BASE (not the fixed home place)', async () => {
  const R = fakeRobot();
  const L = linkHead({ robot: R, ls: { 'bellatrix-places': ROLES('Salon', { Ladestation: 'other' }) } });
  await L.win.LinkStaff.send({ id: 'R1', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Zimmer 12');
  assert.equal(L.posts[0][1].run.place, 'Zimmer 12', 'the run carries the room');
  R.nav = { state: 'arrived', place: 'Zimmer 12', reason: '', since: 9, attempt: 1, waitedS: 20 };
  L.win.LinkStaff._apply({ id: 'R1', state: 'cancelled' });
  assert.deepEqual(R.calls, ['go:Zimmer 12', 'stop', 'go:Salon'], 'cancelled on the way: stop, then back to the base');
  // nothing configured: the old home place, as before
  const R2 = fakeRobot();
  const L2 = linkHead({ robot: R2 });
  await L2.win.LinkStaff.send({ id: 'R2', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, 'Zimmer 12');
  R2.nav = { state: 'arrived', place: 'Zimmer 12', since: 9 };
  L2.win.LinkStaff._apply({ id: 'R2', state: 'cancelled' });
  assert.deepEqual(R2.calls, ['go:Zimmer 12', 'stop', 'go:Standby-Punkt']);
  // '–': the activity goes straight to the tablet, the robot does not move
  const R3 = fakeRobot();
  const L3 = linkHead({ robot: R3 });
  await L3.win.LinkStaff.send({ id: 'R3', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, '');
  assert.equal(L3.posts.length, 1);
  assert.equal(L3.posts[0][1].run.place, undefined);
  assert.deepEqual(R3.calls, [], '"–" = no driving');
  // strict mode: '–' starts nothing
  const R4 = fakeRobot();
  const L4 = linkHead({ robot: R4, ls: { 'bellatrix-place-required': '1' } });
  await L4.win.LinkStaff.send({ id: 'R4', key: 'play', patient: 'P1', opt: {}, at: Date.now(), preview: false }, '');
  assert.equal(L4.posts.length, 0);
  assert.deepEqual(L4.toasts, ['Choose a place.']);
});

/* js/family-visit-staff.js "Where is Anna?" with the Places module. */
function visitHead(opts) {
  const strip = { innerHTML: '', hidden: true, setAttribute() {}, addEventListener() {} };
  const sent = [];
  const dom = {
    readyState: 'complete', getElementById: (id) => (id === 'fvNotes' ? strip : id === 'bannerTray' ? { parentNode: { insertBefore() {} } } : null),
    createElement: () => strip, body: { classList: { toggle() {} } }, activeElement: null, addEventListener() {},
  };
  const H = head(Object.assign({ dom, files: [] }, opts));
  let cur = null;
  Object.assign(H.win, {
    I18N: { valid: (l) => l || 'en' },
    MessagesStaff: { _state: () => ({ notifications: [{ id: 'n1', code: 'P1', label: 'Anna', kind: 'text', from: 'Sophie', at: '2026-11-15T09:00:00Z', seen: false, message: 'm1', status: 'sent' }] }), refresh() {} },
    FamilyCall: { robotId: () => 'rb1', server: () => '', loud: () => true, book: () => ({ residents: {} }) },
    FamilyMessages: { request: () => Promise.resolve({ ok: true }) },
    LinkStaff: { configured: () => true, send: (run, place) => { sent.push({ run, place }); cur = { id: run.id }; return Promise.resolve(); }, _cur: () => cur },
  });
  vm.runInContext(src('js/family-visit-staff.js'), H.win, { filename: 'js/family-visit-staff.js' });
  return Object.assign(H, { strip, sent, V: H.win.FamilyVisitStaff });
}
const flush = () => new Promise((r) => setTimeout(r, 20));
test('family visit: "Where is Anna?" = "–" first and the rooms only; "–" + Go sends the visit without driving', async () => {
  const R = fakeRobot();
  const W = visitHead({ robot: R, ls: { 'bellatrix-places': ROLES('Standby-Punkt', { Ladestation: 'other', Salon: 'other' }) } });
  W.V.go('P1'); await flush();
  assert.equal(W.sent.length, 0, 'no room saved: it asks');
  const sel = W.strip.innerHTML.match(/<select id="fvPlace"[^>]*>(.*?)<\/select>/);
  assert.ok(sel, 'the place list');
  const o = options(sel[1]);
  assert.deepEqual(o.map((x) => x.v), ['', 'Zimmer 12', 'Zimmer 14'], 'no base, no "other" places');
  assert.equal(o[0].t, '–'); assert.equal(o[0].sel, true, '"–" is the default');
  assert.match(W.strip.innerHTML, /data-fv="here"/, 'a Go button next to the list');
  W.V.go('P1', ''); await flush();   /* what the Go button does with '–' */
  assert.equal(W.sent.length, 1);
  assert.equal(W.sent[0].place, '', 'no driving');
  assert.equal(W.prefs.P1, undefined, 'nothing saved for "–"');
  // a saved room: one tap, straight there
  const W2 = visitHead({ robot: R, prefs: { P1: { place: 'Zimmer 14' } }, ls: { 'bellatrix-places': ROLES('Standby-Punkt', {}) } });
  W2.V.go('P1'); await flush();
  assert.equal(W2.sent[0].place, 'Zimmer 14');
  // the saved place is the base (no longer a room): it asks again
  const W3 = visitHead({ robot: R, prefs: { P1: { place: 'Standby-Punkt' } }, ls: { 'bellatrix-places': ROLES('Standby-Punkt', {}) } });
  W3.V.go('P1'); await flush();
  assert.equal(W3.sent.length, 0); assert.match(W3.strip.innerHTML, /fvPlace/);
  // strict mode: the Go button waits for a place
  const W4 = visitHead({ robot: R, ls: { 'bellatrix-place-required': '1' } });
  W4.V.go('P1'); await flush();
  assert.match(W4.strip.innerHTML, /data-fv="here" disabled/);
});

test('the drives log: every drive (whoever started it), its result, duration and the code in plain words (20010016)', () => {
  const R = fakeRobot();
  const { P } = head({ robot: R, lang: 'de' });
  P._tick();
  assert.equal(P.navLog().length, 0, 'idle at start: nothing logged');
  // a drive that arrives
  R.app.robotGo('Zimmer 12'); P._tick();
  assert.equal(P.navLog()[0].result, 'moving');
  R.nav = Object.assign({}, R.nav, { state: 'arrived', since: R.nav.since + 1, waitedS: 42 }); P._tick();
  let e = P.navLog()[0];
  assert.equal(e.result, 'arrived'); assert.equal(e.place, 'Zimmer 12'); assert.equal(e.dur, 42);
  // a drive the planner refuses: 20010016, the bridge keeps trying (attempt 3), then 5 minutes later "blocked"
  R.app.robotGo('Zimmer 14'); P._tick();
  R.nav = Object.assign({}, R.nav, { attempt: 3, reason: 'waiting', code: -120, codeText: '{"code":20010016,"message":"The destination is not within the route"}', waitedS: 12 }); P._tick();
  e = P.navLog()[0];
  assert.equal(e.result, 'moving'); assert.equal(e.code, '20010016', 'the 8-digit navigation code wins'); assert.equal(e.tries, 3);
  R.nav = Object.assign({}, R.nav, { state: 'failed', reason: 'blocked', since: R.nav.since + 1, waitedS: 300 }); P._tick();
  e = P.navLog()[0];
  assert.equal(e.result, 'failed'); assert.equal(e.dur, 300);
  assert.equal(P.meaning(e.code, e.reason, e.text), 'Ziel liegt nicht auf der Route: Roboter neu lokalisieren (an der Ladestation) oder anderen Punkt wählen.');
  // refused at once (not localized): never moved
  R.nav = { state: 'failed', place: 'Salon', reason: 'not-localized', since: R.nav.since + 1, attempt: 0, waitedS: 0, code: 0, codeText: '' }; P._tick();
  e = P.navLog()[0];
  assert.equal(e.result, 'refused');
  assert.equal(P.meaning(e.code, e.reason), 'Der Roboter ist nicht lokalisiert: an der Ladestation neu lokalisieren.');
  // the other codes the bridge knows
  assert.equal(P.meaning('1025'), 'Kein Weg gefunden (Hindernis oder geschlossene Tür).');
  assert.equal(P.meaning('-108'), 'Dieser Ort existiert nicht auf der Karte.');
  assert.equal(P.meaning('', '', 'The destination is not within the route'), 'Ziel liegt nicht auf der Route: Roboter neu lokalisieren (an der Ladestation) oder anderen Punkt wählen.');
  assert.equal(P.meaning('', 'emergency'), 'Not-Aus gedrückt.');
  // 20 at most
  for (let i = 0; i < 25; i++) { R.app.robotGo('Zimmer 12'); P._tick(); R.app.robotStop(); P._tick(); }
  assert.equal(P.navLog().length, 20);
  assert.equal(P.navLog()[0].result, 'stopped');
  // Copy: the log as text, one language
  const text = P._logText();
  assert.match(text, /^Navigationsprotokoll/);
  assert.match(text, /Verbunden/); assert.match(text, /Gestoppt/);
  assert.doesNotMatch(text, /Stopped|Connected/);
});

test('the Navigation test panel: state, every place with Go, Back to base, STOP; Relocalize only when the app has it', () => {
  const R = fakeRobot();
  const { P } = head({ robot: R, lang: 'de', ls: { 'bellatrix-places': ROLES('Standby-Punkt', { Ladestation: 'other' }) } });
  R.app.robotGo('Zimmer 14'); P._tick();
  R.nav = Object.assign({}, R.nav, { state: 'failed', reason: 'blocked', since: R.nav.since + 1, waitedS: 300, attempt: 9, code: 20010016, codeText: 'The destination is not within the route' }); P._tick();
  let h = P._panelHtml();
  assert.match(h, /Navigationstest/);
  assert.match(h, /Verbunden/); assert.match(h, /Lokalisiert/); assert.match(h, /82 %/); assert.match(h, /x 1\.25 · y -3\.50 · 90°/); assert.match(h, /Station 3/);
  for (const p of R.places) assert.match(h, new RegExp('data-pl="go" data-pl-place="' + p + '"'), 'Go for ' + p);
  assert.match(h, /data-pl="base"[^>]*>Zur Basis · Standby-Punkt/);
  assert.match(h, /<button type="button" class="pl-stop" data-pl="stop">STOPP<\/button>/, 'the big STOP');
  assert.match(h, /Fehlgeschlagen: Zimmer 14/); assert.match(h, /Versuch 9/); assert.match(h, /5 min 00 s/);
  assert.match(h, /<b>20010016<\/b> Ziel liegt nicht auf der Route/);
  assert.match(h, /<td>Zimmer 14<\/td><td>Fehlgeschlagen/, 'the drive is in the table');
  assert.match(h, /data-pl="copy"/);
  assert.doesNotMatch(h, /data-pl="reloc"/, 'no robotRelocalize in this app: no button');
  assert.doesNotMatch(h, /[A-Z][a-z]+ to |Connected|Back to base/, 'German only');
  // the buttons
  assert.equal(P._go('Zimmer 12'), 'ok'); assert.equal(R.calls.at(-1), 'go:Zimmer 12');
  assert.match(P._panelHtml(), /Fährt zu Zimmer 12/);
  assert.match(P._panelHtml(), /data-pl="go" data-pl-place="Salon" disabled/, 'no second drive while moving');
  P._stop();
  assert.equal(R.calls.at(-1), 'stop', 'STOP calls robotStop');
  assert.equal(P.navLog()[0].result, 'stopped');
  // busy / not connected are logged as refused
  R.nav = Object.assign({}, R.nav, { state: 'moving', since: R.nav.since + 1 });
  P._tick();
  assert.equal(P._go('Salon'), 'busy');
  assert.equal(P.navLog()[0].result, 'refused'); assert.equal(P.navLog()[0].reason, 'busy');
  // with robotRelocalize (new head app): the button, and the call
  const R2 = fakeRobot({ reloc: true });
  const H2 = head({ robot: R2, lang: 'fr' });
  h = H2.P._panelHtml();
  assert.match(h, /data-pl="reloc"[^>]*>Relocaliser à la station de charge/);
  assert.equal(H2.P._relocalize(), 'ok'); assert.deepEqual(R2.calls, ['reloc']);
  assert.match(H2.P._panelHtml(), /Relocalisation…/);
  // no robot: the panel still opens and says so
  const N = head({});
  assert.match(N.P._panelHtml(), /No robot connected\./);
  assert.match(N.P._panelHtml(), /Not connected/);
});

test('the settings block lists the map places with Base / Room / Other and opens the Navigation test', () => {
  const R = fakeRobot();
  const { P } = head({ robot: R, lang: 'de' });
  const h = P.settingsHtml();
  assert.match(h, /<h2 class="pl-h">Orte<\/h2>/);
  assert.equal((h.match(/class="pl-role"/g) || []).length, R.places.length);
  assert.match(h, /data-pl-role="base" data-pl-place="Standby-Punkt" checked/);
  assert.match(h, /data-pl-role="other" data-pl-place="Ladestation" checked/);
  assert.match(h, /data-pl-role="room" data-pl-place="Zimmer 12" checked/);
  assert.match(h, /data-pl="open-test">Navigationstest/);
  assert.match(src('js/staff-tools.js'), /Places\.settingsHtml\(\)/, 'shown in Tools > Settings');
  assert.match(src('staff.html'), /js\/places\.js/);
  assert.match(head({}).P.settingsHtml(), /No robot connected/);
});

/* PLAN-NAV.md piece 6: the switch "Route planned by Bellatrix / Robot's own navigation" */
const bootDom = () => ({ addEventListener() {}, getElementById: () => null, readyState: 'complete' });
test('the navigation mode switch: default route, saved on the head, sent to the bridge when the page starts and on change', () => {
  const R = fakeRobot({ navMode: true });
  const H = head({ robot: R, lang: 'fr', dom: bootDom() });
  assert.equal(H.P.navMode(), 'route', 'default: route');
  H.P._boot();
  assert.deepEqual(R.calls, ['mode:route'], 'sent when the page starts');
  let h = H.P._panelHtml();
  assert.match(h, /<h2 class="pl-h">Mode de navigation<\/h2>/);
  assert.match(h, /data-pl-mode="route" checked><span>Itinéraire planifié par Bellatrix<\/span>/);
  assert.match(h, /data-pl-mode="place"><span>Navigation propre du robot<\/span>/);
  // changed in the panel: saved in localStorage, sent, a toast
  H.P._onChange({ target: { getAttribute: (k) => (k === 'data-pl-mode' ? 'place' : null) } });
  assert.equal(H.ls.getItem('bellatrix-nav-mode'), 'place');
  assert.equal(R.calls.at(-1), 'mode:place'); assert.equal(R.mode, 'place');
  assert.deepEqual(H.toasts, ['Enregistré.']);
  assert.match(H.P._panelHtml(), /data-pl-mode="place" checked/);
  // a drive started now runs in mode place; switching while it runs changes the next drive only (the bridge's job)
  H.P._go('Salon');
  assert.equal(R.nav.mode, 'place');
  // the saved mode goes to the bridge of the next page start
  const R2 = fakeRobot({ navMode: true });
  const H2 = head({ robot: R2, dom: bootDom(), ls: { 'bellatrix-nav-mode': 'place' } });
  H2.P._boot();
  assert.deepEqual(R2.calls, ['mode:place']);
  assert.equal(H2.P.setNavMode('nonsense'), 'route', 'anything else: route');
  // German, and an old head app without robotNavMode: no switch, nothing sent
  assert.match(head({ robot: fakeRobot({ navMode: true }), lang: 'de' }).P._panelHtml(), /Navigationsmodus.*Route von Bellatrix geplant.*Eigene Navigation des Roboters/);
  const R3 = fakeRobot();
  const H3 = head({ robot: R3, dom: bootDom() });
  H3.P._boot();
  assert.deepEqual(R3.calls, [], 'no robotNavMode: nothing sent');
  assert.doesNotMatch(H3.P._panelHtml(), /data-pl-mode/, 'no switch');
});

test('mode route in the panel and the log: leg / legs of the running drive, the mode of each logged drive', () => {
  const R = fakeRobot({ navMode: true });
  const { P } = head({ robot: R, lang: 'fr' });
  P._tick();
  R.app.robotGo('Zimmer 12'); P._tick();
  R.nav = Object.assign({}, R.nav, { leg: 3, legs: 15, waitedS: 20 }); P._tick();
  let h = P._panelHtml();
  assert.match(h, /En route vers Zimmer 12<\/b><span> · étape 3 sur 15 · 20 s · Itinéraire Bellatrix<\/span>/);
  assert.equal(P.navLog()[0].mode, 'route'); assert.equal(P.navLog()[0].leg, 3); assert.equal(P.navLog()[0].legs, 15);
  // blocked: replanning (attempt 2), the new route has 9 legs
  R.nav = Object.assign({}, R.nav, { reason: 'replanning', attempt: 2, leg: 1, legs: 9, code: 1025, codeText: 'sim' }); P._tick();
  h = P._panelHtml();
  assert.match(h, /étape 1 sur 9 · essai 2/);
  assert.match(h, /<b>1025<\/b> Bloqué : recherche d’un chemin pour contourner\./, 'replanning says more than the code of the leg');
  R.nav = Object.assign({}, R.nav, { state: 'arrived', reason: '', since: R.nav.since + 1, leg: 9, legs: 9, waitedS: 75 }); P._tick();
  let e = P.navLog()[0];
  assert.equal(e.result, 'arrived'); assert.equal(e.mode, 'route'); assert.equal(e.leg, 9); assert.equal(e.tries, 2);
  assert.match(P._panelHtml(), /<td>Zimmer 12<\/td><td>Arrivé <small>essai 2<\/small><\/td><td>Itinéraire Bellatrix · 9\/9<\/td><td>1 min 15 s<\/td>/);
  // a drive in mode place: its mode, no legs
  R.app.robotNavMode('place');
  R.app.robotGo('Salon'); P._tick();
  assert.match(P._panelHtml(), /En route vers Salon<\/b><span> · Navigation du robot<\/span>/);
  R.nav = Object.assign({}, R.nav, { state: 'arrived', since: R.nav.since + 1, waitedS: 30 }); P._tick();
  assert.match(P._panelHtml(), /<td>Salon<\/td><td>Arrivé<\/td><td>Navigation du robot<\/td>/);
  // entries of an older bridge (no mode): '–'; the Copy text has the mode too
  const O = fakeRobot();
  const H = head({ robot: O, lang: 'fr' });
  O.app.robotGo('Salon'); H.P._tick();
  assert.match(H.P._panelHtml(), /<td>Salon<\/td><td>En cours<\/td><td>–<\/td>/);
  assert.match(P._logText(), /\tArrivé \(essai 2\)\tItinéraire Bellatrix · 9\/9\t1 min 15 s\t1025\t/);
  assert.match(P._logText(), /\tNavigation du robot\t30 s\t/);
});

test('the two new reasons (replanning, no-route) in English, French and German, before the SDK code', () => {
  const want = {
    en: ['Blocked: planning a way around.', 'No way on the map: closed door or obstacle.'],
    fr: ['Bloqué : recherche d’un chemin pour contourner.', 'Aucun chemin sur la carte : porte fermée ou obstacle.'],
    de: ['Blockiert: plant einen Weg drumherum.', 'Kein Weg auf der Karte: geschlossene Tür oder Hindernis.'],
  };
  for (const [lang, [rp, nr]] of Object.entries(want)) {
    const { P } = head({ lang });
    assert.equal(P.meaning('', 'replanning'), rp, lang + ' replanning');
    assert.equal(P.meaning('1025', 'replanning', ''), rp, lang + ': the reason wins over the leg\'s code');
    assert.equal(P.meaning('', 'no-route'), nr, lang + ' no-route');
    assert.equal(P.meaning('-109', 'no-route', ''), nr);
  }
  // the old reasons and codes still mean what they meant (mode place)
  const { P } = head({ lang: 'de' });
  assert.equal(P.meaning('1025', 'waiting'), 'Kein Weg gefunden (Hindernis oder geschlossene Tür).');
  assert.equal(P.meaning('', 'blocked'), 'Seit 5 Minuten kein Durchkommen.');
  // the end of a route drive with no way: failed, "no-route" in the panel and the log
  const R = fakeRobot({ navMode: true });
  const H = head({ robot: R, lang: 'de' });
  R.app.robotGo('Zimmer 14'); H.P._tick();
  R.nav = Object.assign({}, R.nav, { state: 'failed', reason: 'no-route', since: R.nav.since + 1, waitedS: 3 }); H.P._tick();
  assert.equal(H.P.navLog()[0].result, 'failed');
  assert.match(H.P._panelHtml(), /Fehlgeschlagen: Zimmer 14.*Kein Weg auf der Karte: geschlossene Tür oder Hindernis\./);
});

test('a route drive without a map runs in mode place: the panel and the log say so ("route: no map, robot navigation")', () => {
  const R = fakeRobot({ navMode: true });
  const { P } = head({ robot: R, lang: 'fr' });
  R.app.robotGo('Zimmer 12');
  R.nav = Object.assign({}, R.nav, { mode: 'place', codeText: 'route: no map, robot navigation' }); P._tick();
  assert.match(P._panelHtml(), /Navigation du robot<\/span><p class="pl-code">Le robot ne fournit pas de carte : ce trajet utilise la navigation propre du robot\.<\/p>/);
  assert.equal(P.navLog()[0].text, 'route: no map, robot navigation', 'logged although it has no code');
  assert.equal(P.navLog()[0].mode, 'place');
  R.nav = Object.assign({}, R.nav, { state: 'arrived', since: R.nav.since + 1 }); P._tick();
  assert.match(P._panelHtml(), /<td>Navigation du robot<\/td><td>0 s<\/td><td>–<\/td><td>Le robot ne fournit pas de carte/);
  // another reason the planner could not drive: the general text
  const { P: D } = head({ lang: 'de' });
  assert.equal(D.meaning('', '', 'route: no place pose, robot navigation'), 'Bellatrix konnte diese Fahrt nicht planen: sie nutzt die eigene Navigation des Roboters.');
  // later SDK codes of the place drive still win, as before
  assert.equal(D.meaning('1025', '', 'route: no map, robot navigation'), 'Kein Weg gefunden (Hindernis oder geschlossene Tür).');
});

test('every text of js/places.js has a French and a German entry (the static part of tests/i18n.test.mjs, for this file)', () => {
  const s = src('js/places.js');
  const keys = new Set();
  for (const m of s.matchAll(/(?<![\w$.])S\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")\s*[,)]/g)) keys.add(vm.runInNewContext(m[1]));
  for (const m of s.matchAll(/(?:CODES|REASONS)\s*=\s*\{([\s\S]*?)\};/g)) for (const v of m[1].matchAll(/:\s*'((?:[^'\\\n]|\\.)*)'/g)) keys.add(v[1]);
  for (const k of ['ROUTE', 'NOLOC']) { const m = new RegExp('var ' + k + " = '([^']+)'").exec(s); keys.add(m[1]); }
  assert.ok(keys.size > 60, 'the texts are found (' + keys.size + ')');
  for (const lang of ['fr', 'de']) {
    const H = head({ lang });
    const dict = H.win.ST.dict[lang];
    const miss = [...keys].filter((k) => /[A-Za-z]/.test(k) && !Object.prototype.hasOwnProperty.call(dict, k));
    assert.deepEqual(miss, [], lang + ': no translation for ' + miss.join(' | '));
  }
});

test('the robot bridge exposes the code of a drive and the relocalisation (Java, Java 8 style: no lambdas)', () => {
  const rb = src('android/src/de/labland/bellatrix/RobotBridge.java');
  const wa = src('android/src/de/labland/bellatrix/WebActivity.java');
  assert.match(rb, /n\.put\("code", navCode\)/); assert.match(rb, /n\.put\("codeText", navCodeText\)/);
  assert.match(rb, /resetEstimate\(reqIds\.getAndIncrement\(\), RELOC_RETRIES, l\)/);
  assert.match(rb, /o\.put\("reloc", r\)/); assert.match(rb, /o\.put\("charging", charging\)/); assert.match(rb, /o\.put\("pose", p\)/);
  assert.match(wa, /public String robotRelocalize\(\)/);
  // PLAN-NAV.md: the switch and the new fields (new, the old ones stay)
  assert.match(wa, /public String robotNavMode\(String mode\)/);
  assert.match(rb, /o\.put\("navMode", navMode\)/);
  assert.match(rb, /n\.put\("mode", navDriveMode\)/); assert.match(rb, /n\.put\("leg", navLeg\)/); assert.match(rb, /n\.put\("legs", navLegs\)/);
  for (const f of [rb, src('android/src/de/labland/bellatrix/RouteDrive.java')]) {
    const code = f.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\/[^\n]*/g, '');   /* no strings, no comments */
    assert.doesNotMatch(code, /->/, 'no lambdas');
    assert.doesNotMatch(code, /new [A-Z]\w*\s*\([^)]*\)\s*\{/, 'no anonymous inner classes');
  }
});
