// 14 Nov: the whole family flow in MUTED headless Chrome (--mute-audio, speech stubbed: no sound at all),
// with three "devices" side by side (separate origins = separate storage, like the robot's two devices):
//   phone   http://127.0.0.1:P/portail.html     390 x 844   the family portal (Sophie)
//   head    http://127.0.0.1:P/staff.html       1098 x 618  the Care Team on the robot's head (a fake robot bridge:
//                                                           places, drive, "arrived")
//   tablet  http://localhost:P/patient.html     1080 x 1920 the patient screen (its own identity at first)
// It checks: WhatsApp ticks in the family thread (sent / delivered / seen, blue only once the resident saw it on
// the tablet); the head shows only a notification with ONE button, asks the place once, then only the status;
// the tablet shows the message, reports it read; a call request goes the same way, the family sees
// "Bellatrix is on the way…", the tablet asks "Call Sophie?", the family joins and the call connects; the bell
// with its states; the install entry (Plus tab, Messenger in-app browser, iPhone code).
// Everything runs on a server of its own (free port, temporary data folder): labland/data is never touched.
// Screenshots: OUT=<folder> (default: a temporary folder, printed at the end). Run: node tests/family-visit-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-visit-browser-'));
const OUT = process.env.OUT || path.join(TMP, 'shots');
fs.mkdirSync(OUT, { recursive: true });
process.env.PORTAL_DATA = path.join(TMP, 'portal');
process.env.BELLATRIX_NOTIFY_NO_REGISTER = '1';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = () => {};

const Portal = await import('../labland/family-portal.mjs');
const N = await import('../labland/family-notify.mjs');
const C = await import('../labland/family-callreq.mjs');
const { createRelay } = await import('../labland/call-relay.mjs');
const { createLink } = await import('../labland/display-link.mjs');
const dataDir = path.join(TMP, 'portal');
const portal = Portal.createPortal({ dataDir, log: quiet, rateLimit: false });
const notifier = N.createNotify({ dataDir, portal, log: quiet, allowEndpoint: () => false });
const relay = createRelay({ dataFile: path.join(TMP, 'call.json'), log: quiet, ice: { iceServers: [] } });
const calls = C.createCallReq({ dataDir, portal, notify: (pid, ev) => notifier.notify(pid, ev), relay: C.relayAdapter((req, url, body, res) => relay.handle(req, url, body, res)), log: quiet, timer: false });
Portal.registerRoutes('family/notify', (req, url, body, ctx) => notifier.familyRoute(req, url, body, ctx));
Portal.registerRoutes('family/calls', (req, url, body, ctx) => calls.familyRoute(req, url, body, ctx));
Portal.registerRoutes('robot/calls', (req, url, body, ctx) => calls.robotRoute(req, url, body, ctx));
Portal.setNotifier((pid, ev) => { notifier.notify(pid, ev); });
const link = createLink({ rate: 100000 });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.mp3': 'audio/mpeg' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Resident, Range' };
function json(res, s, o) { if (res.headersSent) return; res.writeHead(s, Object.assign({ 'Content-Type': 'application/json' }, CORS)); res.end(JSON.stringify(o)); }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/portal/api/')) { portal.handle(req, res, url); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const isCall = url.pathname.startsWith('/call/api/'), isLink = url.pathname.startsWith('/link/api/');
  if (isCall || isLink) {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { json(res, 400, { error: 'bad JSON' }); return; }
      Promise.resolve(isCall ? relay.handle(req, url, body, res) : link.handle(req, url, body, res)).then((out) => { if (out && !res.destroyed) json(res, out[0], out[1]); }, (e) => json(res, 500, { error: String(e) }));
    });
    return;
  }
  const f = path.resolve(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!f.startsWith(path.resolve(ROOT)) || f.includes(path.join('labland', 'data')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, CORS));
  fs.createReadStream(f).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const PORT = server.address().port, A = 'http://127.0.0.1:' + PORT + '/', T = 'http://localhost:' + PORT + '/';
const API = A + 'portal/api/';

async function freePort() { return new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }
const DBG = await freePort();
const chrome = cp.spawn(CHROME, ['--headless=new', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + DBG, '--user-data-dir=' + path.join(TMP, 'profile'), '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let closed = false, ws = null;
function shutdown() { if (closed) return; closed = true; try { ws.close(); } catch (e) { /* closed */ } try { chrome.kill(); } catch (e) { /* gone */ } try { server.close(); } catch (e) { /* closed */ } try { relay.stop(); link.stop(); notifier.stop && notifier.stop(); } catch (e) { /* stopped */ } }
process.on('exit', shutdown);
const watchdog = setTimeout(() => { console.error('watchdog: stuck, stopping'); shutdown(); process.exit(1); }, 8 * 60 * 1000);
watchdog.unref();

let ver = null;
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + DBG + '/json/version')).json(); } catch (e) { await sleep(250); } }
ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
function send(method, params = {}, sessionId) { return new Promise((res, rej) => { const id = ++seq; pend[id] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
/* No sound, ever: speech is stubbed (it "ends" at once), audio is muted by Chrome. */
const SILENT = "(function(){try{var s=window.speechSynthesis;if(s){s.speak=function(u){setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();";
/* The robot bridge of the head: two places on the map, a drive that "arrives" after 2 s. */
const ROBOTAPP = "(function(){var t=0;window.BellatrixApp={robotPlaces:function(){return JSON.stringify([{name:'Zimmer 12'},{name:'Salon'}]);},robotState:function(){return JSON.stringify({connected:true});},robotConnect:function(){},robotGo:function(p){window.__went=(window.__went||[]).concat([p]);t=Date.now();return 'ok';},robotNav:function(){return JSON.stringify({state:Date.now()-t>2000?'arrived':'moving'});},robotStop:function(){}};})();";
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MESSENGER = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.0;]';
class Page {
  static async open(name, w, h, o = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: w, height: h });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(); p.name = name; p.sid = sessionId; p.targetId = targetId;
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: o.dpr || 1, mobile: !!o.mobile }, sessionId);
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    if (o.ua) await send('Emulation.setUserAgentOverride', { userAgent: o.ua }, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT + (o.extra || '') }, sessionId);
    return p;
  }
  async go(url, wait = 1200) { await send('Page.navigate', { url }, this.sid); await sleep(wait); }
  async ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, this.sid);
    if (r.exceptionDetails) throw new Error(this.name + ' eval: ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400));
    return r.result.value;
  }
  async waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.ev(expr)) return true; } catch (e) { /* retry */ } await sleep(250); } return false; }
  async shot(file) { await sleep(400); const r = await send('Page.captureScreenshot', { format: 'png' }, this.sid); fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64')); return path.join(OUT, file); }
  async click(sel) { return this.ev('(function(){var b=document.querySelector(' + JSON.stringify(sel) + ');if(!b)return false;b.click();return true;})()'); }
  async clickText(sel, re) { return this.ev('(function(){var r=new RegExp(' + JSON.stringify(re) + ');var l=[].filter.call(document.querySelectorAll(' + JSON.stringify(sel) + '),function(b){return r.test(b.textContent)&&b.offsetParent!==null;});if(!l.length)return false;l[0].click();return true;})()'); }
  async close() { try { await send('Target.closeTarget', { targetId: this.targetId }); } catch (e) { /* closed */ } }
}
async function call(method, p, body, auth, extra) {
  const headers = Object.assign({}, (extra && extra.headers) || {});
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const ROBOT = 'visitrobot' + crypto.randomBytes(8).toString('hex'), KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + ROBOT + '.' + KEY;
const X = { shots: [] };
const H = () => ({ headers: { 'X-Resident': X.rid } });
const shot = async (p, f) => { X.shots.push(await p.shot(f)); };
/* The core greets first ("Bonjour Anna !", Oui / Pas maintenant) when a run starts by presence: Oui. */
async function pastWelcome(p, want, ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const id = await p.ev("Lab.isOn()&&Lab._t.state&&Lab._t.state.step?Lab._t.state.step.id:''").catch(() => '');
    if (want.test(id)) return id;
    if (id === 'welcome') { await p.ev("(function(){var b=document.querySelector('#screen .actions button.primary, #screen button.primary');if(b)b.click();return !!b;})()"); await sleep(800); }
    await sleep(300);
  }
  return '';
}

test('setup: the robot, Anna (P1), Sophie on the portal; three devices', async () => {
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
});

test('ticks in the family thread: one grey (sent), two grey (on Bellatrix), two blue (seen)', async () => {
  const send1 = async (t) => (await call('POST', 'family/message', { text: t }, 'Bearer ' + X.tok, H())).data.message.id;
  X.m1 = await send1('Bonjour maman, on pense fort à toi.');
  await call('POST', 'robot/read', { items: [{ id: X.m1, at: new Date().toISOString() }] }, R);
  X.m2 = await send1('Les enfants ont dessiné un bateau pour toi.');
  await call('POST', 'robot/received', { ids: [X.m2] }, R);
  X.m3 = await send1('On vient dimanche avec Léo.');
  X.phone = await Page.open('phone', 390, 844, { dpr: 2, mobile: true });
  await X.phone.go(A + 'portail.html', 300);
  await X.phone.ev("localStorage.setItem('bellatrix-portail-token'," + JSON.stringify(X.tok) + ");localStorage.setItem('bellatrix-portail-resident'," + JSON.stringify(X.rid) + ");localStorage.setItem('bellatrix-portail-lang','fr');localStorage.setItem('bellatrix-portail-theme','light');localStorage.setItem('bellatrix-portail-install-seen','1');true");
  await X.phone.go(A + 'portail.html', 2500);
  assert.ok(await X.phone.waitFor("document.querySelectorAll('.bubbles [data-ticks]').length===3"), 'three messages with ticks');
  const st = await X.phone.ev("[].map.call(document.querySelectorAll('.bubbles [data-ticks]'),function(e){return e.getAttribute('data-ticks')+':'+getComputedStyle(e).color+':'+e.querySelectorAll('path').length;})");
  assert.equal(st[0], 'read:rgb(83, 189, 235):2', 'seen: two blue ticks #53BDEB');
  assert.match(st[1], /^delivered:rgb\(163, 177, 191\):2$/, 'on Bellatrix: two grey ticks');
  assert.match(st[2], /^sent:rgb\(163, 177, 191\):1$/, 'sent: one grey tick');
  await X.phone.ev("window.scrollTo(0, document.querySelector('.thread').offsetTop - 70); true");
  await shot(X.phone, 'phone-thread-ticks.png');
});

test('head: the notification with ONE button, the place asked once, then only the status', async () => {
  const store = { patients: { P1: { prefs: { greet: 'Anna', lang: 'fr', rate: 0.92, volume: 0.9 }, content: {} } }, settings: { participant: 'P1', staff: 'RB' } };
  X.head = await Page.open('head', 1098, 618, { dpr: 1.75, mobile: true, extra: ROBOTAPP });
  await X.head.go(A + 'icons/portail-192.png', 300);   /* a page of the same origin without the app: staff.js saves its own store when it leaves */
  /* the head shares its origin with the phone page here (not on the robot): only its own keys are set */
  await X.head.ev("localStorage.setItem('bellatrix-family-robot'," + JSON.stringify(ROBOT) + ");localStorage.setItem('bellatrix-portal-key'," + JSON.stringify(KEY) + ");" +
    "localStorage.setItem('bellatrix-call-server'," + JSON.stringify(A.replace(/\/$/, '')) + ");localStorage.setItem('bellatrix-link-code','VISIT2026');localStorage.setItem('bellatrix-staff-lang','fr');" +
    "localStorage.setItem('bellatrix-care-lab-v1'," + JSON.stringify(JSON.stringify(store)) + ");true");
  X.tablet = await Page.open('tablet', 1080, 1920, { dpr: 1 });
  await X.tablet.go(T + 'icons/portail-192.png', 300);
  await X.tablet.ev("localStorage.clear();localStorage.setItem('bellatrix-call-server'," + JSON.stringify(T.replace(/\/$/, '')) + ");localStorage.setItem('bellatrix-link-code','VISIT2026');localStorage.setItem('bellatrix-presence-off','1');" +
    "localStorage.setItem('bellatrix-care-lab-v1'," + JSON.stringify(JSON.stringify(store)) + ");true");
  await X.tablet.go(T + 'patient.html', 2500);
  await X.tablet.ev("window.Posture&&(Posture.ensureSeated=function(o,done){setTimeout(done,300);return null;});true");
  const tabletOwn = await X.tablet.ev("FamilyCall.robotId()");
  assert.notEqual(tabletOwn, ROBOT, 'the tablet starts with an identity of its own (another device)');
  await X.head.go(A + 'staff.html', 3500);
  await X.head.ev("MessagesStaff.refresh&&MessagesStaff.refresh();true");
  assert.ok(await X.head.waitFor("!!document.querySelector('#fvNotes .fv-note') && !document.getElementById('fvNotes').hidden", 20000), 'the notification is there');
  const txt = await X.head.ev("document.querySelector('#fvNotes .fv-note').textContent");
  assert.match(txt, /2 messages pour Anna/); assert.match(txt, /Aller voir Anna/);
  assert.equal(await X.head.ev("document.querySelectorAll('#fvNotes [data-fv=go]').length"), 1, 'one button');
  assert.equal(await X.head.ev("!!document.querySelector('#trayList #famWaitBanner:not([hidden])') && !document.getElementById('fvParked').hidden"), false, 'the old banner is parked');
  await shot(X.head, 'head-notification.png');
  await X.head.click('#fvNotes [data-fv=go]');
  assert.ok(await X.head.waitFor("!!document.getElementById('fvPlace')"), 'where is Anna? (asked once)');
  await shot(X.head, 'head-where.png');
  await X.head.ev("var s=document.getElementById('fvPlace');s.value='Zimmer 12';s.dispatchEvent(new Event('change',{bubbles:true}));true");
  assert.ok(await X.head.waitFor("!!document.querySelector('.lk-top:not([hidden])')", 10000), 'the head shows the status only');
  assert.equal(await X.head.ev("JSON.parse(localStorage.getItem('bellatrix-care-lab-v1')).patients.P1.prefs.place"), 'Zimmer 12', 'kept with the resident\'s prefs');
  assert.deepEqual(await X.head.ev('window.__went'), ['Zimmer 12'], 'the robot drives to Anna');
  await shot(X.head, 'head-status.png');
});

test('tablet: the message, big; seen -> the family\'s ticks turn blue; the robot goes home', async () => {
  assert.ok(await X.tablet.waitFor("FamilyCall.robotId()===" + JSON.stringify(ROBOT), 20000), 'the tablet took the robot\'s family identity from the run');
  const diag = () => X.tablet.ev("JSON.stringify({on:Lab.isOn(),step:Lab._t&&Lab._t.state&&Lab._t.state.step&&Lab._t.state.step.id,act:Lab._t&&Lab._t.act&&Lab._t.act.key,lp:{w:!!LinkPatient._state.waiting,a:!!LinkPatient._state.active,seat:LinkPatient._state.seating,run:LinkPatient._state.waiting&&LinkPatient._state.waiting.place},run:localStorage.getItem('bellatrix-care-lab-run'),visit:localStorage.getItem('bellatrix-family-visit'),cache:Object.keys((JSON.parse(localStorage.getItem('bellatrix-messages-cache')||'{}').items)||{}).length,err:FamilyMessages.status(),head:null})");
  await X.tablet.waitFor("Lab.isOn()&&Lab._t.state.step&&Lab._t.state.step.id==='welcome'", 30000); await sleep(600);
  await shot(X.tablet, 'tablet-welcome.png');
  const okStart = !!(await pastWelcome(X.tablet, /^msg-(ask|sync)$/));
  if (!okStart) { console.log('DIAG tablet', await diag()); console.log('DIAG head', await X.head.ev("JSON.stringify({cur:LinkStaff._cur(),went:window.__went,top:(document.querySelector('.lk-top')||{}).textContent})")); await shot(X.tablet, 'debug-tablet.png'); }
  assert.ok(okStart, 'the message activity starts after the drive');
  assert.ok(await X.tablet.waitFor("Lab._t.state.step.id==='msg-ask'", 20000));
  assert.equal(await X.tablet.ev("!!JSON.stringify(Lab.opt).match(/" + KEY.slice(0, 12).replace(/[-_]/g, '.') + "/)"), false, 'the key is not in the session options');
  await shot(X.tablet, 'tablet-message-ask.png');
  await X.tablet.clickText('#screen button', '^\\s*Oui\\s*$');
  assert.ok(await X.tablet.waitFor("/^msg-\\d/.test(Lab._t.state.step.id)", 15000));
  await sleep(800);
  await shot(X.tablet, 'tablet-message.png');
  const seen = async () => (await call('GET', 'family/me', undefined, 'Bearer ' + X.tok, H())).data.messages.filter((m) => m.status === 'read').length;
  let n = 0; for (let i = 0; i < 40 && (n = await seen()) < 2; i++) await sleep(250);
  assert.ok(n >= 2, 'the first message shown is reported read at once');
  /* through the messages and the core's closing steps until the session ends */
  for (let i = 0; i < 16 && await X.tablet.ev('Lab.isOn()'); i++) { await X.tablet.ev("(function(){var vis=function(q){return [].filter.call(document.querySelectorAll(q),function(x){return x.offsetParent!==null&&!x.disabled;});};var b=vis('#screen button.primary');if(!b.length)b=vis('#screen .actions button');if(b.length)b[0].click();return b.length;})()"); await sleep(1200); }
  assert.ok(await X.head.waitFor("/Terminé/.test((document.querySelector('.lk-top')||{}).textContent||'')", 30000), 'the head says Finished');
  assert.deepEqual(await X.head.ev('window.__went'), ['Zimmer 12', 'Standby-Punkt'], 'and the robot goes home');
  await X.phone.go(A + 'portail.html', 2500);
  assert.ok(await X.phone.waitFor("[].every.call(document.querySelectorAll('.bubbles [data-ticks]'),function(e){return e.getAttribute('data-ticks')==='read';})", 15000), 'all blue now');
  await X.phone.ev("window.scrollTo(0, document.querySelector('.thread').offsetTop - 70); true");
  await shot(X.phone, 'phone-thread-seen.png');
});

test('a call request: the head\'s one button, "on the way" on the phone, "Call Sophie?" on the tablet, the call connects', async () => {
  await X.head.ev("var t=document.querySelector('.lk-top');t&&t.click();true"); await sleep(400);
  await X.head.ev("var t=document.querySelector('.lk-top');t&&t.click();true");
  const q = await call('POST', 'family/calls/request', { when: 'soon', note: '' }, 'Bearer ' + X.tok, H());
  assert.equal(q.status, 200);
  await X.head.ev("CallReqStaff.refresh();true");
  assert.ok(await X.head.waitFor("/Sophie veut appeler Anna/.test((document.querySelector('#fvNotes')||{}).textContent||'')", 20000), 'Sophie wants to call Anna');
  await shot(X.head, 'head-call-notification.png');
  await X.head.click('#fvNotes [data-fv=go]');
  assert.ok(await X.head.waitFor("!!document.querySelector('.lk-top:not([hidden])')", 10000), 'the place is known: the robot goes at once');
  /* the phone: Calls tab, calm status */
  await X.phone.go(A + 'portail.html', 2000);
  await X.phone.clickText('nav.tabs button', 'Appels'); await sleep(1500);
  assert.ok(await X.phone.waitFor("/Bellatrix va voir Anna/.test(document.body.textContent)", 15000), 'Bellatrix is on the way to Anna…');
  await shot(X.phone, 'phone-visit-on-the-way.png');
  /* the tablet: after the drive, the question */
  assert.equal(await pastWelcome(X.tablet, /^visit-call$/, 50000), 'visit-call', 'Sophie would like to talk with you');
  await shot(X.tablet, 'tablet-call-ask.png');
  await X.tablet.clickText('#screen button', 'Appeler Sophie');
  assert.ok(await X.tablet.waitFor("Lab.isOn()&&Lab._t.state.step&&Lab._t.state.step.id==='calling-out'", 20000), 'the call screen waits for Sophie');
  await shot(X.tablet, 'tablet-calling.png');
  /* the family gets the invitation and joins */
  let inv = null; for (let i = 0; i < 40 && !inv; i++) { inv = (await call('GET', 'family/calls', undefined, 'Bearer ' + X.tok, H())).data.invite; if (!inv) await sleep(250); }
  assert.ok(inv && inv.token, 'the invitation reached the family');
  const fam = await Page.open('family-call', 390, 844, { dpr: 2, mobile: true });
  await fam.go(A + 'famille.html#j=' + inv.token, 2500);
  assert.ok(await fam.waitFor("!!document.querySelector('[data-act=call]') && !document.querySelector('[data-act=call]').disabled", 15000));
  await fam.click('[data-act=call]');
  assert.ok(await X.tablet.waitFor("document.querySelectorAll('.fctile.on').length===1", 30000), 'connected (same network)');
  await sleep(1500);
  await shot(X.tablet, 'tablet-in-call.png');
  await shot(fam, 'phone-in-call.png');
  await fam.click('[data-act=hangup]');
  await sleep(2500);
  /* the call's own closing steps on the tablet (how was it?), then the visit ends */
  for (let i = 0; i < 16 && await X.tablet.ev('Lab.isOn()'); i++) { await X.tablet.ev("(function(){var vis=function(q){return [].filter.call(document.querySelectorAll(q),function(x){return x.offsetParent!==null&&!x.disabled;});};var b=vis('#screen button.primary');if(!b.length)b=vis('#screen .actions button');if(b.length)b[0].click();return b.length;})()"); await sleep(1500); }
  assert.ok(await X.head.waitFor("/Terminé/.test((document.querySelector('.lk-top')||{}).textContent||'')", 40000), 'the visit ends with the call');
  await fam.close();
});

test('the bell: a clear state for the phone\'s notifications (off / blocked / iPhone)', async () => {
  await X.phone.go(A + 'portail.html', 2500);
  assert.ok(await X.phone.waitFor("!!document.querySelector('.pc-bell')"), 'the bell is in the header');
  await X.phone.click('.pc-bell'); await sleep(700);
  const s = await X.phone.ev("(function(){var r=document.querySelector('#pcSheet .pc-pushrow');return r?r.getAttribute('data-push')+'|'+r.textContent:'';})()");
  assert.match(s, /^(ask|off)\|Notifications sur ce téléphone.*Désactivées.*Activer/, s);
  await shot(X.phone, 'phone-bell-off.png');
  const blocked = await Page.open('phone-blocked', 390, 844, { dpr: 2, mobile: true, extra: "try{Object.defineProperty(Notification,'permission',{get:function(){return 'denied';}});}catch(e){}" });
  await blocked.go(A + 'portail.html', 2500);
  await blocked.click('.pc-bell'); await sleep(700);
  assert.match(await blocked.ev("document.querySelector('#pcSheet .pc-pushrow').textContent"), /Bloquées par le navigateur/);
  assert.equal(await blocked.ev("document.querySelector('.pc-bell').classList.contains('off')"), true, 'the bell is crossed out');
  await blocked.close();
  const iphone = await Page.open('iphone', 390, 844, { dpr: 3, mobile: true, ua: IPHONE });
  await iphone.go(A + 'portail.html', 2500);
  await iphone.click('.pc-bell'); await sleep(700);
  assert.match(await iphone.ev("document.querySelector('#pcSheet .pc-pushrow').textContent"), /iPhone : installez d’abord l’application/);
  await shot(iphone, 'phone-bell-iphone.png');
  X.iphone = iphone;
});

test('install: Plus tab, the Messenger in-app browser, the iPhone steps with a sign-in code', async () => {
  await X.phone.go(A + 'portail.html', 2500);
  await X.phone.clickText('nav.tabs button', 'Plus'); await sleep(900);
  assert.ok(await X.phone.waitFor("!!document.querySelector('.card.install [data-do=install-open]')"), 'the install entry in Plus');
  await X.phone.ev("document.querySelector('.card.install').scrollIntoView({block:'center'});true");
  await shot(X.phone, 'phone-plus-install.png');
  const msg = await Page.open('messenger', 390, 844, { dpr: 2, mobile: true, ua: MESSENGER });
  await msg.go(A + 'icons/portail-192.png', 300);   /* same origin, without the portal: the 'seen' mark is taken away first */
  await msg.ev("localStorage.removeItem('bellatrix-portail-install-seen');true");
  await msg.go(A + 'portail.html', 2500);
  assert.ok(await msg.waitFor("!!document.querySelector('.installask')"), 'asked once after sign-in');
  await msg.click('.installask [data-do=install-open]'); await sleep(700);
  const t = await msg.ev("document.querySelector('.installsheet').getAttribute('data-install')+'|'+document.querySelector('.installsheet').textContent");
  assert.match(t, /^inapp\|.*Messenger.*Ouvrir dans le navigateur.*Copier l’adresse/);
  await shot(msg, 'phone-install-messenger.png');
  await msg.close();
  await X.phone.go(A + 'portail.html', 2000);
  const ip = X.iphone;
  await ip.go(A + 'portail.html', 2500);
  await ip.clickText('nav.tabs button', 'Plus'); await sleep(800);
  await ip.click('.card.install [data-do=install-open]');
  assert.ok(await ip.waitFor("!!document.querySelector('.installsheet .handoff .code')", 10000), 'the code for the installed app');
  const code = (await ip.ev("document.querySelector('.installsheet .handoff .code').textContent")).replace(/\D/g, '');
  assert.match(code, /^\d{6}$/);
  await shot(ip, 'phone-install-iphone.png');
  const v = await call('POST', 'family/login/verify', { email: 'sophie@example.test', code });
  assert.equal(v.status, 200, 'the installed app signs in with it');
  await ip.close();
});

/* 15 Nov (Rahma): no "Music & photos" tab on the head; the family photos are in Activities > Memories > Personalise. */
test('head: "Family photos" opens Memories > Personalise for Anna (no "Music & photos" tab); one tap in the album, one tap out', async () => {
  /* a real JPEG, drawn in the head's browser: sky, sun, grass */
  const img = await X.head.ev("(function(){var c=document.createElement('canvas');c.width=640;c.height=480;var g=c.getContext('2d');g.fillStyle='#9CC3E6';g.fillRect(0,0,640,480);" +
    "g.fillStyle='#F2C14E';g.beginPath();g.arc(470,120,60,0,7);g.fill();g.fillStyle='#4E8F4E';g.fillRect(0,330,640,150);return c.toDataURL('image/jpeg',0.85);})()");
  const sent = await call('POST', 'family/message', { text: 'Léo au jardin', photo: img }, 'Bearer ' + X.tok, H());
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const mid = sent.data.message.id;
  await X.head.go(A + 'staff.html', 3500);
  const tabs = await X.head.ev("[].map.call(document.querySelectorAll('.ctop .tabs [data-tab]'),function(b){return b.getAttribute('data-tab')+':'+b.textContent.trim();})");
  assert.deepEqual(tabs.map((t) => t.split(':')[0]), ['session', 'results', 'family', 'library'], 'four tabs');
  assert.ok(!tabs.some((t) => /Musique|Music|Musik/.test(t)), 'no "Music & photos" tab: ' + tabs.join(' | '));
  assert.equal(await X.head.ev("!!document.getElementById('tab-contents')"), false, 'and no panel for it');
  await X.head.ev("MessagesStaff.refresh&&MessagesStaff.refresh();true");
  assert.ok(await X.head.waitFor("!!document.querySelector('#fvNotes [data-fv=photos]') && !document.getElementById('fvNotes').hidden", 20000), 'the notification has "Photos de la famille"');
  await shot(X.head, 'head-tabs-family-photos-note.png');
  await X.head.click('#fvNotes [data-fv=photos]');
  assert.ok(await X.head.waitFor("!document.getElementById('tab-session').hidden && document.querySelector('input[name=activity]:checked').value==='album' && document.getElementById('persBox').open && !document.getElementById('arBody').hidden", 10000),
    'Activities > Memories > Personalise, unfolded');
  assert.match(await X.head.ev("document.getElementById('persTitle').textContent"), /P1/, 'for Anna (P1)');
  assert.equal(await X.head.ev("document.getElementById('fParticipant').value"), 'P1');
  const famSel = '#arBody .arfamph[data-msg=' + JSON.stringify(mid) + ']';
  assert.ok(await X.head.waitFor("!!document.querySelector(" + JSON.stringify(famSel + ' [data-act=famadd]') + ")", 20000), 'the family photo with "Ajouter à l’album"');
  assert.ok(await X.head.waitFor("!!document.querySelector(" + JSON.stringify(famSel + ' [data-famimg] img') + ")", 15000), 'its picture');
  assert.equal(await X.head.ev("document.querySelectorAll('#persBox [data-act-host]:not([hidden])').length"), 1, 'only the Memories part is shown');
  assert.equal(await X.head.ev("document.getElementById('arBody').nextElementSibling.id"), 'contentBox', 'the photos first, above "Today\'s content"');
  assert.ok(await X.head.ev("(function(){var r=document.getElementById('persTitle').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;})()"), '"Personnaliser pour P1" is on the screen');
  await shot(X.head, 'head-memories-family-photos.png');
  await X.head.click(famSel + ' [data-act=famadd]');
  assert.ok(await X.head.waitFor("!!document.querySelector(" + JSON.stringify(famSel + '.in [data-act=famdel]') + ")", 15000), 'in the album: "Retirer de l’album"');
  assert.ok(await X.head.ev("Album.list('P1',{all:true}).some(function(r){return r.family;})"), 'the album has it, marked Family');
  await X.head.ev("document.getElementById('persBox').scrollIntoView({block:'start'});true");
  await shot(X.head, 'head-memories-in-album.png');
  await X.head.click(famSel + ' [data-act=famdel]');
  assert.ok(await X.head.waitFor("!!document.querySelector(" + JSON.stringify(famSel + ':not(.in) [data-act=famadd]') + ")", 15000), 'out of the album again');
  /* another activity: its own settings, the photos are not there */
  await X.head.ev("StaffUI.choose('pairs');true");
  assert.ok(await X.head.waitFor("document.getElementById('arBody').hidden"), 'Picture Pair does not show the photos');
  /* Group karaoke: its own settings first, then its lists (they were in "Music & photos" too) */
  await X.head.ev("StaffUI.choose('karaoke');true");
  assert.ok(await X.head.waitFor("!!document.querySelector('#kStaffHost #karaokeBox') && !document.getElementById('kStaffHost').parentNode.hidden"), 'the karaoke lists in Group karaoke > Personalise');
  assert.equal(await X.head.ev("!!(document.getElementById('contentBox').compareDocumentPosition(document.getElementById('kStaffHost')) & Node.DOCUMENT_POSITION_FOLLOWING)"), true, 'after the karaoke settings');
  assert.equal(await X.head.ev("document.getElementById('arBody').hidden"), true);
  /* Bellatrix Play: the playlists of this resident, first in its Personalise */
  await X.head.ev("StaffUI.choose('play');document.getElementById('persBox').open=true;true");
  assert.ok(await X.head.waitFor("!!document.querySelector('#recoBody .rs-main') && !document.getElementById('recoBody').parentNode.hidden"), 'the playlists in Bellatrix Play > Personalise');
  assert.equal(await X.head.ev("document.querySelectorAll('#recoBody [data-rs=pick]').length"), 0, 'no resident chips: the resident is the one in Activities');
  await X.head.ev("document.getElementById('persBox').scrollIntoView({block:'start'});true");
  await shot(X.head, 'head-play-playlists.png');
});

test.after(async () => {
  console.log('screenshots: ' + OUT);
  for (const s of X.shots) console.log('  ' + s);
  shutdown();
});
