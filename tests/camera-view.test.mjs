// Camera view (js/camview.js + js/core.js): contain + blurred background, mirror, 4:3, toScreen, the C panel.
// Part 1 without a browser; part 2 in a MUTED headless Chrome with the fake camera (speech stubbed, own server on a
// free port). Run: node tests/camera-view.test.mjs   (SHOT=file.png also saves a 1080x1920 screenshot)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); }
}
function load(store = {}, scr = { width: 1080, height: 1920 }) {
  const warns = [];
  const ctx = { console: { warn: (m) => warns.push(m), log() {} }, Math, Promise, Object, Array, String, Number, isFinite, parseFloat,
    innerWidth: 1080, innerHeight: 1920, screen: scr, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/camview.js'), ctx, { filename: 'camview.js' });
  return { C: ctx.CamView, warns, store };
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/* ------------------------------------------------------------ part 1 */
await test('RÉGLAGES block with the defaults; MIROIR = true', () => {
  const src = read('js/camview.js');
  assert.match(src, /RÉGLAGES/);
  const { C } = load();
  assert.equal(C.R.MIROIR, true);
  assert.deepEqual([C.R.MARGE_X, C.R.MARGE_Y, C.R.EXPO, C.R.LUM_CSS, C.R.CON_CSS, C.R.LISSAGE], [0.05, 0.18, 0.7, 1.4, 1.1, 0.35]);
  assert.equal(C.mirror(), true, 'big portrait screen: mirrored');
  assert.equal(load({ 'bellatrix-cam-flipx': '1' }).C.mirror(), false, 'flipx override still works');
});
await test('4:3 stream asked for: 1280 x 960, aspectRatio 4/3, 30 images/s (ideal); core.js uses it', () => {
  const c = load().C.constraints({ facingMode: 'user' });
  assert.deepEqual(JSON.parse(JSON.stringify(c)), { width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 }, frameRate: { ideal: 30 }, facingMode: 'user' });
  const core = read('js/core.js');
  assert.match(core, /camVideo\(\{ deviceId: \{ exact: d\.deviceId \} \}\)/);
  assert.match(core, /CamView\.tune\(stream\)/);
});
await test('contain picture in front, blurred cover behind (CSS and filters)', () => {
  const css = read('css/camview.css'), { C } = load();
  assert.match(css, /\.camview \.camimg \{[^}]*object-fit: contain/);
  assert.match(css, /\.camview \.camfill \{[^}]*object-fit: cover[^}]*blur\(28px\)/);
  const h = C.boxHtml();
  assert.ok(h.indexOf('camfill') < h.indexOf('camimg'), 'fill behind the picture');
  assert.deepEqual(JSON.parse(JSON.stringify(C.filters())), { img: 'brightness(1.4) contrast(1.1) saturate(1.05)', fill: 'brightness(0.84) blur(28px)' });
  assert.equal(load({ 'bellatrix-cam-lum': '2', 'bellatrix-cam-con': '9' }).C.filters().img, 'brightness(2) contrast(1.6) saturate(1.05)', 'slider values kept and clamped');
});
await test('toScreen: margins, the 4 corners, clamp, mirror', () => {
  const { C } = load({ 'bellatrix-cam-flipx': '1' });          // mirror off
  let p = C.toScreen(0, 0); assert.ok(near(p.x, 0) && near(p.y, 0), '(0,0) -> top-left');
  p = C.toScreen(0.05, 0.18); assert.ok(near(p.x, 0) && near(p.y, 0), 'margin corner -> top-left');
  p = C.toScreen(0.95, 0.18); assert.ok(near(p.x, 1080) && near(p.y, 0), 'top-right');
  p = C.toScreen(0.05, 0.82); assert.ok(near(p.x, 0) && near(p.y, 1920), 'bottom-left');
  p = C.toScreen(0.95, 0.82); assert.ok(near(p.x, 1080) && near(p.y, 1920), 'bottom-right');
  p = C.toScreen(0.5, 0.5); assert.ok(near(p.x, 540) && near(p.y, 960), 'centre');
  p = C.toScreen(-0.3, 1.4); assert.ok(near(p.x, 0) && near(p.y, 1920), 'clamped');
  p = C.toScreen(0.275, 0.5); assert.ok(near(p.x, 270), 'stretched: (0.275-0.05)/0.9 = 0.25');
  const m = load().C;                                          // mirror on (default)
  p = m.toScreen(0.95, 0.18); assert.ok(near(p.x, 0) && near(p.y, 0), 'mirrored: picture right -> screen left');
  p = m.toScreen(0.5, 0.5, { left: 10, top: 20, width: 100, height: 200 }); assert.ok(near(p.x, 60) && near(p.y, 120), 'box');
  const z0 = load({ 'bellatrix-air-marge-x': '0', 'bellatrix-air-marge-y': '0', 'bellatrix-cam-flipx': '1' }).C;
  p = z0.toScreen(0.25, 0.75); assert.ok(near(p.x, 270) && near(p.y, 1440), 'margins 0 = the old full picture');
});
await test('unsupported or broken camera settings never throw', async () => {
  const { C, warns } = load();
  const r1 = await C.tune(null); assert.ok(r1.unsupported.length);
  const r2 = await C.tune({ getVideoTracks: () => [{}] }); assert.equal(JSON.stringify(r2.unsupported), '["getCapabilities"]');
  const r3 = await C.tune({ getVideoTracks: () => [{ getCapabilities() { throw new Error('x'); } }] }); assert.ok(r3.unsupported.length);
  const t = { calls: [], getCapabilities: () => ({ zoom: { min: 1, max: 4, step: 0.1 }, exposureMode: ['manual', 'continuous'], exposureCompensation: { min: -2, max: 2, step: 0.5 }, brightness: { min: 0, max: 255, step: 1 } }),
    applyConstraints(c) { this.calls.push(c.advanced[0]); return Object.keys(c.advanced[0])[0] === 'brightness' ? Promise.reject(new Error('refused')) : Promise.resolve(); } };
  const r4 = await C.tune({ getVideoTracks: () => [t] });
  assert.deepEqual(t.calls.map((c) => JSON.stringify(c)), ['{"zoom":1}', '{"exposureMode":"continuous"}', '{"exposureCompensation":1}', '{"brightness":179}']);
  assert.equal(JSON.stringify(r4.applied), JSON.stringify(['zoom', 'exposureMode', 'exposureCompensation']));
  assert.ok(r4.unsupported.indexOf('brightness') >= 0 && r4.unsupported.indexOf('backlightCompensation') >= 0);
  assert.ok(warns.some((w) => /brightness/.test(w)), 'console.warn says what is not supported');
  const t2 = { getCapabilities: () => ({ zoom: { min: 1, max: 2 } }), applyConstraints() { throw new Error('old'); } };
  const r5 = await C.tune({ getVideoTracks: () => [t2] }); assert.ok(r5.unsupported.indexOf('zoom') >= 0);
});
await test('core.js: the drawn cursor and the hit test come from the same airScreen / CamView.toScreen', () => {
  const core = read('js/core.js');
  assert.match(core, /if \(CV\) pr = airScreen\(pr, r\);/);
  assert.match(core, /a = CV\.toScreen\(pr\.u, pr\.v, r, z\)/);
  assert.match(core, /var nx0 = pr\.u \* stageW\(\), ny0 = pr\.v \* stageH\(\)/);   // air.x: drawn cursor + airSnap
  assert.match(core, /cx = r\.left \+ air\.x \* s, cy = r\.top \+ air\.y \* s/);
  for (const f of ['js/camview.js', 'js/i18n-camera.js']) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/=>|\blet\s|\bconst\s|`|\bclass\s/.test(s), f + ' is ES5');
  }
});

/* ------------------------------------------------------------ part 2: the page */
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!CHROME) console.log('SKIP the page (no Chrome)');
else {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), f = path.resolve(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (!f.startsWith(path.resolve(ROOT)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const PORT = server.address().port, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-camview-'));
  const chrome = cp.spawn(CHROME, ['--headless=new', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0', '--user-data-dir=' + path.join(tmp, 'p'), '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const stop = () => { try { chrome.kill(); } catch (e) {} try { server.close(); } catch (e) {} };
  process.on('exit', stop);
  const watchdog = setTimeout(() => { console.log('FAIL watchdog'); stop(); process.exit(1); }, 90000);
  let wsUrl = null; chrome.stderr.on('data', (d) => { const m = String(d).match(/ws:\/\/[^\s]+/); if (m) wsUrl = m[0]; });
  for (let i = 0; i < 80 && !wsUrl; i++) await sleep(200);
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pend[id] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* retry */ } await sleep(200); } return false; };
  const SILENT = "(function(){try{var s=window.speechSynthesis;if(s){s.speak=function(u){setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}" +
    "window.__gum=[];var md=navigator.mediaDevices;if(md&&md.getUserMedia){var o=md.getUserMedia.bind(md);md.getUserMedia=function(c){window.__gum.push(JSON.parse(JSON.stringify(c)));return o(c);};}" +
    "try{localStorage.setItem('bellatrix-presence-off','1');}catch(e){}})();";
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sid);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT }, sid);
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/patient.html' }, sid);
  await waitFor("!!window.Lab && !!window.CamView && document.readyState === 'complete'");
  await sleep(800);
  const key = async (k) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: 'Key' + k.toUpperCase(), text: type === 'keyDown' ? k : undefined, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }, sid); await sleep(150); };
  try {
    /* A session with pointing in the air: the page's camera opens (fake camera). */
    const started = await ev("(function(){Lab.opt.camMode='air';Lab.opt.voice=false;Lab.opt.lang='fr';var k=(Lab.activities.filter(function(a){return !a.noHandSigns;})[0]||{}).key;Lab.start(k,{preview:true,ready:true});return k;})()");
    const camOn = await waitFor("!!(window.CamView.stream())", 12000);
    await test('page: camera on in an air session (' + started + ')', () => assert.ok(camOn));
    await test('page: the camera was asked for in 4:3, 1280 x 960, 30 images/s', async () => {
      const g = await ev('window.__gum');
      const v = g.map((c) => c.video).filter(Boolean).pop();
      assert.ok(v && v.width.ideal === 1280 && v.height.ideal === 960 && Math.abs(v.aspectRatio.ideal - 4 / 3) < 1e-9 && v.frameRate.ideal === 30, JSON.stringify(g));
    });
    await sleep(600);
    const rep = await ev('JSON.stringify(CamView.report())');
    console.log('     fake camera settings: ' + rep + ' · ' + await ev("(function(){var s=CamView.stream();if(!s)return 'camera being opened again';var t=s.getVideoTracks()[0].getSettings();return t.width+'x'+t.height;})()"));
    await key('c');
    await test('page: key C opens the panel with the camera box (blurred fill + contain picture, mirrored)', async () => {
      const r = await ev("(function(){var p=document.getElementById('camPanel');if(!p||p.hidden)return null;var f=p.querySelector('video.camfill'),i=p.querySelector('video.camimg'),cf=getComputedStyle(f),ci=getComputedStyle(i);return {fit:[cf.objectFit,ci.objectFit],fill:cf.filter,img:ci.filter,tf:i.style.transform,src:!!i.srcObject&&i.srcObject===f.srcObject,w:i.videoWidth,title:p.querySelector('h3').textContent,labels:[].map.call(p.querySelectorAll('.campanel-row span'),function(s){return s.textContent;})};})()");
      assert.ok(r, 'panel open');
      assert.deepEqual(r.fit, ['cover', 'contain']);
      assert.match(r.fill, /blur\(28px\)/); assert.match(r.img, /brightness\(1\.4\) contrast\(1\.1\)/);
      assert.match(r.tf, /scaleX\(-1\)/); assert.ok(r.src, 'both videos show the stream');
      assert.equal(r.title, 'Caméra'); assert.deepEqual(r.labels, ['Exposition de la caméra', 'Luminosité de l’image', 'Contraste']);
    });
    await test('page: a slider changes the filter at once and is kept', async () => {
      const r = await ev("(function(){var i=document.getElementById('camSetLUM_CSS');i.value='2';i.dispatchEvent(new Event('input'));return {f:document.querySelector('#camPanel video.camimg').style.filter,fill:document.querySelector('#camPanel video.camfill').style.filter,k:localStorage.getItem('bellatrix-cam-lum'),o:i.parentNode.querySelector('output').textContent};})()");
      assert.match(r.f, /brightness\(2\)/); assert.match(r.fill, /brightness\(1\.2\)/); assert.equal(r.k, '2'); assert.equal(r.o, '2.00');
      await ev("(function(){var i=document.getElementById('camSetEXPO');i.value='0.3';i.dispatchEvent(new Event('input'));return true;})()");
      assert.equal(await ev("localStorage.getItem('bellatrix-cam-expo')"), '0.3');
    });
    await test('page: rotation setting turns the shown picture (90: sizes swapped)', async () => {
      const r = await ev("(function(){localStorage.setItem('bellatrix-cam-rot','90');CamView.apply();var b=document.querySelector('#camPanel .camview'),v=b.querySelector('video.camimg'),o={tf:v.style.transform,w:v.style.width,h:v.style.height,bw:b.clientWidth,bh:b.clientHeight};localStorage.removeItem('bellatrix-cam-rot');CamView.apply();return o;})()");
      assert.match(r.tf, /rotate\(90deg\)/); assert.equal(r.w, r.bh + 'px'); assert.equal(r.h, r.bw + 'px');
    });
    if (process.env.SHOT) { await ev("(function(){var i=document.getElementById('camSetLUM_CSS');i.value='1.4';i.dispatchEvent(new Event('input'));i=document.getElementById('camSetEXPO');i.value='0.7';i.dispatchEvent(new Event('input'));return 1;})()"); await sleep(700); console.log('     panel video: ' + JSON.stringify(await ev("(function(){var v=document.querySelector('#camPanel video.camimg');return {w:v.videoWidth,h:v.videoHeight,paused:v.paused,t:v.currentTime,rs:v.readyState,live:!!CamView.stream(),cs:getComputedStyle(v).display,bw:v.parentNode.clientWidth,bh:v.parentNode.clientHeight};})()"))); const s = await send('Page.captureScreenshot', { format: 'png' }, sid); fs.writeFileSync(process.env.SHOT, Buffer.from(s.data, 'base64')); console.log('     screenshot: ' + process.env.SHOT); }
    await key('c');
    await test('page: key C closes the panel again', async () => assert.equal(await ev("document.getElementById('camPanel').hidden"), true));
    /* The pointer: a still hand fed to the engine; the drawn cursor and the hit test land on toScreen's point. */
    const feed = (x, y, n = 25) => ev("(function(){var t=performance.now(),i,lm;for(i=0;i<" + n + ";i++){lm=[];for(var j=0;j<21;j++)lm.push({x:" + x + ",y:" + y + ",z:0});Lab._t.airFrame(lm,t+i*33);}var r=document.getElementById('stage').getBoundingClientRect(),p=CamView.toScreen(" + x + "," + y + ",r),a=Lab._air(),h=document.querySelector('.airhover');var el=document.elementFromPoint(p.x,p.y);return {px:p.x,py:p.y,ax:a.x,ay:a.y,hover:h?h.getAttribute('data-b'):null,under:el&&el.closest('button[data-b]')?el.closest('button[data-b]').getAttribute('data-b'):null};})()");
    await ev("localStorage.setItem('bellatrix-air-snap','0');true");
    await test('page: filtered pointer = toScreen point; the button under it is the one chosen', async () => {
      const r = await feed(0.62, 0.6);
      assert.ok(Math.abs(r.ax - r.px) < 2 && Math.abs(r.ay - r.py) < 2, JSON.stringify(r));
      assert.equal(r.hover, r.under, JSON.stringify(r));
      await sleep(500);
      const d = await ev("(function(){var m=/translate\\(([-\\d.]+)px, *([-\\d.]+)px\\)/.exec(document.getElementById('airCursor').style.transform);return m?[+m[1],+m[2]]:null;})()");
      const a = await ev('Lab._air()');
      assert.ok(d && Math.abs(d[0] - a.x) < 3 && Math.abs(d[1] - a.y) < 3, 'drawn cursor at the same point: ' + JSON.stringify([d, a]));
    });
    await test('page: the very top and the very bottom of the 1080x1920 screen are reachable', async () => {
      await ev("localStorage.removeItem('bellatrix-air-snap');true");
      await ev("(function(){var b=document.createElement('button');b.setAttribute('data-b','toptest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:400px;top:0;width:280px;height:110px;z-index:3';document.getElementById('stage').appendChild(b);return 1;})()");
      let r = await feed(0.5, 0.12, 40);
      assert.ok(r.ay === 0 && r.hover === 'toptest', 'top: ' + JSON.stringify(r));
      r = await feed(0.5, 0.88, 40);
      assert.ok(r.ay === 1920 && /^(back|help|stop)$/.test(r.hover || ''), 'bottom: ' + JSON.stringify(r));
    });
    await test('page: OK = closed hand (16 Nov, afternoon): open hand points and never chooses, closing on a button chooses once, open again for the next', async () => {
      await ev("localStorage.removeItem('bellatrix-air-snap');localStorage.removeItem('bellatrix-air-confirm');true");
      await ev("(function(){var o=document.querySelector('[data-b=conftest]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','conftest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:390px;top:860px;width:300px;height:200px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__conf0=Lab._air().chosen;true;})()");
      /* A real-looking hand around (cx, cy) in the camera picture: open (fingers out) or closed (fingers folded). */
      const hand = (cx, cy, closed, n, t0) => ev("(function(){var cx=" + cx + ",cy=" + cy + ",cl=" + (closed ? 'true' : 'false') + ",t=" + (t0 || 'performance.now()') + ",i,j;function P(dx,dy){return {x:cx+dx,y:cy+dy,z:0};}" +
        "for(i=0;i<" + n + ";i++){var lm=[];lm[0]=P(0,0.12);for(j=1;j<=4;j++)lm[j]=P(-0.03*j,0.10-0.02*j);" +
        "[[5,-0.04],[9,-0.013],[13,0.013],[17,0.04]].forEach(function(f){var b=f[0],x=f[1];lm[b]=P(x,0.04);lm[b+1]=P(x,cl?0.0:-0.02);lm[b+2]=P(x,cl?0.05:-0.06);lm[b+3]=P(x,cl?0.08:-0.09);});" +
        "Lab._t.airFrame(lm,t+i*33);}var a=Lab._air();return {key:a.key,closed:a.closed,needOpen:a.needOpen,clicks:a.chosen-window.__conf0,t:t+" + n + "*33};})()");
      let r = await hand(0.5, 0.5, false, 60);
      assert.equal(r.clicks, 0, 'an open hand held still on a button never chooses: ' + JSON.stringify(r));
      r = await hand(0.5, 0.5, true, 15, r.t);
      assert.equal(r.closed, true, 'fingers folded = closed hand');
      r = await hand(0.5, 0.5, false, 20, r.t);
      assert.equal(r.clicks, 0, 'closed only briefly (the ring not full), opened again: nothing chosen');
      r = await hand(0.5, 0.5, true, 40, r.t);
      assert.equal(r.clicks, 1, 'the hand closed on the button and kept closed: the ring fills and chooses: ' + JSON.stringify(r));
      r = await hand(0.5, 0.5, true, 40, r.t);
      assert.equal(r.clicks, 1, 'staying closed after a choice does not choose again');
      assert.equal(r.needOpen, true, 'the next OK needs the hand opened first');
      r = await hand(0.5, 0.5, false, 20, r.t);
      r = await hand(0.5, 0.5, true, 40, r.t);
      assert.equal(r.clicks, 2, 'open, then close again: the next choice');
      await ev("localStorage.setItem('bellatrix-air-confirm','closeopen');true");
      r = await hand(0.5, 0.5, false, 20, r.t);
      r = await hand(0.5, 0.5, true, 15, r.t);
      r = await hand(0.5, 0.5, false, 40, r.t);
      assert.equal(r.clicks, 3, "'bellatrix-air-confirm' 'closeopen': the morning's close-then-open OK");
      r = await hand(0.5, 0.5, false, 30, r.t);
      await ev("localStorage.setItem('bellatrix-air-confirm','0');true");
      r = await hand(0.1, 0.1, false, 15, r.t);   /* away from the button, then back to it */
      r = await hand(0.5, 0.5, false, 60, r.t);
      assert.equal(r.clicks, 4, "'bellatrix-air-confirm' '0': holding still chooses, as before");
      await ev("localStorage.removeItem('bellatrix-air-confirm');document.querySelector('[data-b=conftest]').remove();true");
    });
    await test('page: no page errors', async () => assert.equal(await ev("(Lab._t.state.rec&&Lab._t.state.rec.log||[]).filter(function(l){return /App error/.test(l.msg||l.text||'');}).length"), 0));
    await test('page: pointing also in Seated Move Along (16 Nov); hand signs still kept away from it', async () => {
      const st = (mode) => ev("(function(){try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='" + mode + "';Lab.opt.camMove=false;Lab.start('move',{preview:true,ready:true});" +
        "return new Promise(function(res){setTimeout(function(){var s=Lab._t.state;res({id:s.step&&s.step.id,consent:s.camConsent,air:Lab._t.airMode(s.step),buttons:document.querySelectorAll('#stage button[data-b][data-a]').length});},700);});})()");
      const a = await st('air');
      assert.ok(a.consent === true && a.air === true, 'air mode: pointing on the first Move screen ' + JSON.stringify(a));
      assert.ok(a.buttons >= 2, 'buttons the pointer can choose ' + JSON.stringify(a));
      const g = await st('signs');
      assert.ok(g.consent !== true && g.air === false, 'signs mode: no hand signs in Move, as before ' + JSON.stringify(g));
      await ev("(function(){try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';return true;})()");
    });
    await test('page: waiting screen (16 Nov): after an air session the app camera follows the hand, the OK (closed hand) on "Call my family" presses it, a new session takes the camera over', async () => {
      await ev("(function(){window.__idle={start:0,stop:0,clicks:0};window.BellatrixApp={handsStart:function(){__idle.start++;return 'ok';},handsStop:function(){__idle.stop++;},handsConfig:function(){}};" +
        "try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      await sleep(400);
      await ev("(function(){Lab.endSession('test');var b=document.createElement('button');b.setAttribute('data-b','crqtest');b.setAttribute('data-a','click');b.style.cssText='position:absolute;left:390px;top:860px;width:300px;height:200px;z-index:50';b.textContent='Call';b.addEventListener('click',function(){__idle.clicks++;});document.getElementById('stage').appendChild(b);return true;})()");
      const on = await waitFor('window.__idle.start>=1', 3000);
      const sendHand = (closed, n) => ev("(function(){var cx=0.5,cy=0.5,cl=" + (closed ? 'true' : 'false') + ",i,j;function P(dx,dy){return [cx+dx,cy+dy,0];}" +
        "var lm=[];lm[0]=P(0,0.12);for(j=1;j<=4;j++)lm[j]=P(-0.03*j,0.10-0.02*j);" +
        "[[5,-0.04],[9,-0.013],[13,0.013],[17,0.04]].forEach(function(f){var b=f[0],x=f[1];lm[b]=P(x,0.04);lm[b+1]=P(x,cl?0.0:-0.02);lm[b+2]=P(x,cl?0.05:-0.06);lm[b+3]=P(x,cl?0.08:-0.09);});" +
        "return new Promise(function(res){var k=0;(function f(){window.__bellatrixHands({t:Date.now(),w:640,h:480,lm:lm});if(++k<" + n + ")setTimeout(f,33);else res(window.__idle.clicks);})();});})()");
      await sendHand(false, 40);
      await sendHand(true, 45);   // closed = OK (16 Nov afternoon): the ring fills while the hand stays closed
      const clicks = await sendHand(false, 20);
      const after = await ev("(function(){var b=document.querySelector('[data-b=crqtest]');if(b)b.remove();return JSON.stringify(window.__idle);})()");
      assert.ok(on, 'the app camera starts on the waiting screen ' + after);
      assert.equal(clicks, 1, 'close then open on the button presses it once ' + after);
      // a session that starts takes the camera over; then the stub goes again
      await ev("(function(){Lab.start('hello',{preview:true,ready:true});try{Lab.endSession('test');}catch(e){}delete window.BellatrixApp;return true;})()");
    });
    await test('page: red heart prototype (23 Nov): the app follows the heart, the pointer goes with it, closing the hand over it and opening chooses once; a heart gone at the edge is lost, not closed', async () => {
      await ev("(function(){window.__hz={start:0,heart:[]};window.BellatrixApp={handsStart:function(){__hz.start++;return 'ok';},handsStop:function(){},handsConfig:function(){},handsHeart:function(on){__hz.heart.push(on);}};" +
        "localStorage.setItem('bellatrix-air-input','heart');try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      const on = await waitFor('window.__hz.start>=1', 4000);
      await sleep(1000);   // the new screen settles (AIR.SETTLE_MS)
      await ev("(function(){var o=document.querySelector('[data-b=hearttest]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','hearttest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:390px;top:860px;width:300px;height:200px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__hz0=Lab._air().chosen;return true;})()");
      /* n heart messages 33 ms apart: at (x, y) with area a, or none (null: hidden or gone) */
      const heart = (x, y, a, n) => ev("(function(){var k=0;return new Promise(function(res){(function f(){window.__bellatrixHands({t:Date.now(),w:480,h:640,heart:" + (a ? "{x:" + x + ",y:" + y + ",a:" + a + ",n:300}" : 'null') + "});" +
        "if(++k<" + n + ")setTimeout(f,33);else{var a=Lab._air(),h=Lab._heart(),hv=document.querySelector('.airhover');res({key:a.key,hover:hv?hv.getAttribute('data-b'):null,closed:a.closed,clicks:a.chosen-window.__hz0,heart:h});}})();});})()");
      let r = await heart(0.5, 0.5, 0.016, 40);
      assert.ok(on && (await ev('window.__hz.heart')).indexOf(true) >= 0, 'the app was told to follow the heart ' + JSON.stringify(await ev('window.__hz')));
      assert.ok(r.heart.on, 'heart mode on ' + JSON.stringify(r));
      assert.equal(r.hover, 'hearttest', 'the heart in the middle of the picture points at the button in the middle ' + JSON.stringify(r));
      assert.equal(r.clicks, 0, 'an open heart held still never chooses ' + JSON.stringify(r));
      r = await heart(0.5, 0.5, 0.004, 12);   // most of it hidden in the fist
      assert.equal(r.closed, true, 'a heart mostly hidden = closed hand ' + JSON.stringify(r));
      r = await heart(0, 0, 0, 6);            // then not seen at all: still closed (it was just here)
      assert.equal(r.closed, true, 'a heart hidden completely in the fist stays closed ' + JSON.stringify(r));
      assert.equal(r.clicks, 0, 'closing alone does not choose');
      r = await heart(0.5, 0.5, 0.016, 45);   // open again: the ring fills on the button, then it is chosen
      assert.equal(r.clicks, 1, 'close then open over the button chooses once ' + JSON.stringify(r));
      r = await heart(0.5, 0.5, 0.016, 30);
      assert.equal(r.clicks, 1, 'holding the open heart still does not choose again');
      r = await heart(0.97, 0.5, 0.016, 10);
      r = await heart(0, 0, 0, 8);
      assert.equal(r.heart.closed, false, 'a heart that left at the edge of the picture is lost, not closed ' + JSON.stringify(r));
      await ev("(function(){var b=document.querySelector('[data-b=hearttest]');if(b)b.remove();localStorage.removeItem('bellatrix-air-input');try{Lab.endSession('test');}catch(e){}delete window.BellatrixApp;return true;})()");
    });
    await test('page: object + button (23 Nov): the red mark moves the pointer, one press (remote button or Space) chooses once; hiding the mark never chooses', async () => {
      await ev("(function(){window.__ob={start:0,press:[],heart:[]};window.BellatrixApp={handsStart:function(){__ob.start++;return 'ok';},handsStop:function(){},handsConfig:function(){},handsHeart:function(on){__ob.heart.push(on);},handsPress:function(on){__ob.press.push(on);}};" +
        "localStorage.setItem('bellatrix-air-input','object');try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      await waitFor('window.__ob.start>=1', 4000);
      await sleep(1000);
      await ev("(function(){var o=document.querySelector('[data-b=objtest]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','objtest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:390px;top:860px;width:300px;height:200px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__ob0=Lab._air().chosen;return true;})()");
      const mark = (x, y, a, n) => ev("(function(){var k=0;return new Promise(function(res){(function f(){window.__bellatrixHands({t:Date.now(),w:480,h:640,heart:" + (a ? "{x:" + x + ",y:" + y + ",a:" + a + ",n:300}" : 'null') + "});" +
        "if(++k<" + n + ")setTimeout(f,33);else{var a=Lab._air(),hv=document.querySelector('.airhover');res({hover:hv?hv.getAttribute('data-b'):null,closed:a.closed,clicks:a.chosen-window.__ob0,text:document.getElementById('handText').textContent});}})();});})()");
      const key = (k, rep) => ev("(function(){var e=new KeyboardEvent('keydown',{key:'" + k + "',repeat:" + (rep ? 'true' : 'false') + ",bubbles:true,cancelable:true});document.body.dispatchEvent(e);return {prevented:e.defaultPrevented,clicks:Lab._air().chosen-window.__ob0};})()");
      let r = await mark(0.5, 0.5, 0.016, 40);
      assert.equal(r.hover, 'objtest', 'the mark in the middle points at the button ' + JSON.stringify(r));
      assert.equal(r.clicks, 0, 'pointing alone never chooses');
      assert.ok(/Press the button|Appuyez/.test(r.text), 'the text asks for the press: ' + r.text);
      r = await mark(0.5, 0.5, 0.004, 10);
      r = await mark(0, 0, 0, 10);
      assert.equal(r.clicks, 0, 'the mark hidden by the hand (no close/open OK in this mode) chooses nothing ' + JSON.stringify(r));
      assert.equal(r.closed, false, 'never "closed" with the object');
      r = await mark(0.5, 0.5, 0.016, 10);
      let k = await key(' ');
      assert.ok(k.prevented && k.clicks === 1, 'Space (a PC keyboard, or a remote) chooses the button under the pointer ' + JSON.stringify(k));
      k = await key(' ', true);
      assert.equal(k.clicks, 1, 'a key held down (repeat) does not choose again');
      await ev('window.__bellatrixPress(24);true');   // the app forwards the remote's volume key
      assert.equal(await ev('Lab._air().chosen-window.__ob0'), 2, 'the remote button forwarded by the app chooses too');
      assert.ok((await ev('window.__ob.press')).indexOf(true) >= 0, 'the app was asked for the remote button ' + JSON.stringify(await ev('window.__ob')));
      await ev("(function(){var b=document.querySelector('[data-b=objtest]');if(b)b.remove();localStorage.removeItem('bellatrix-air-input');try{Lab.endSession('test');}catch(e){}return true;})()");
      assert.equal((await ev('window.__ob.press')).slice(-1)[0], false, 'after the session the volume keys are the volume again');
      await ev('delete window.BellatrixApp;true');
    });
    await test('page: Seated Move Along in the app (16 Nov): the movement pages keep the app camera for the hands and ask it for pictures; the page camera stays off', async () => {
      const r = await ev("(async function(){function w(ms){return new Promise(function(r){setTimeout(r,ms)})}" +
        "window.__nh={start:0,stop:0,pics:[]};window.BellatrixApp={handsStart:function(){__nh.start++;return 'ok';},handsStop:function(){__nh.stop++;},handsConfig:function(){},handsPictures:function(ms){__nh.pics.push(ms);}};" +
        "try{Lab.endSession('test');}catch(e){}var cm=Lab.opt.camMove;Lab.opt.camMode='air';Lab.opt.camMove=true;Lab.opt.voice=false;Lab.start('move',{preview:true,ready:true});await w(600);" +
        "var T=Lab._t,ids=[];for(var k=0;k<4;k++){var st=T.state.step;ids.push(st&&st.id);if(!st||st.pose)break;T.doAction(0,'touch');await w(500);}" +
        "var st2=T.state.step,out={ids:ids,pose:!!(st2&&st2.pose),air:T.airMode(st2),pageCam:!!(window.CamView&&CamView.stream()),start:__nh.start,pics:__nh.pics.slice()};" +
        "window.__bellatrixHands({pic:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',w:1,h:1});" +
        "try{Lab.endSession('test');}catch(e){}out.after=__nh.pics.slice();Lab.opt.camMove=cm;delete window.BellatrixApp;return JSON.stringify(out);})()");
      const d = JSON.parse(r);
      assert.equal(d.pose, true, 'on a movement page ' + r);
      assert.equal(d.air, true, 'pointing on');
      assert.equal(d.pageCam, false, 'the page camera stays off: the app keeps it ' + r);
      assert.ok(d.start >= 1, 'the app camera runs');
      assert.equal(d.pics[d.pics.length - 1], 200, 'pictures every 200 ms asked ' + r);
      assert.equal(d.after[d.after.length - 1], 0, 'pictures off at the end ' + r);
    });
    await test('page: practice step (16 Nov): in pointing mode the session begins with the gesture practice, then the welcome', async () => {
      const r = await ev("(async function(){function w(ms){return new Promise(function(r){setTimeout(r,ms)})}try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true});await w(300);" +
        "var a=Lab._t.state.step&&Lab._t.state.step.id;Lab._t.doAction(0,'touch');await w(300);var b=Lab._t.state.step&&Lab._t.state.step.id;" +
        "try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='off';Lab.start('hello',{preview:true});await w(300);var c=Lab._t.state.step&&Lab._t.state.step.id;try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';return JSON.stringify({a:a,b:b,c:c});})()");
      const d = JSON.parse(r);
      assert.equal(d.a, 'air-practice', r); assert.equal(d.b, 'welcome', r); assert.equal(d.c, 'welcome', 'without pointing: no practice ' + r);
    });
    await test('page: a camera that gives an empty picture at 1280 x 960 is opened again plainly (16 Nov, robot tablet)', async () => {
      await ev("(function(){localStorage.removeItem('bellatrix-cam-plain');var md=navigator.mediaDevices,o=md.getUserMedia.bind(md);window.__gumOrig=o;" +
        "md.getUserMedia=function(c){var w=c&&c.video&&c.video.width;if(w&&w.ideal===1280){var cv=document.createElement('canvas');cv.width=2;cv.height=2;cv.getContext('2d').fillRect(0,0,2,2);return Promise.resolve(cv.captureStream(5));}return o(c);};" +
        "try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      const ok = await waitFor("localStorage.getItem('bellatrix-cam-plain')==='1' && document.getElementById('cam').videoWidth>16", 9000);
      const info = await ev("JSON.stringify({plain:localStorage.getItem('bellatrix-cam-plain'),w:document.getElementById('cam').videoWidth,log:(Lab._t.state.rec.events||[]).filter(function(l){return /plainly/.test(l.msg||'')}).length})");
      await ev("(function(){navigator.mediaDevices.getUserMedia=window.__gumOrig;localStorage.removeItem('bellatrix-cam-plain');try{Lab.endSession('test');}catch(e){}return true;})()");
      assert.ok(ok, 'opened again with a real picture ' + info);
      assert.match(info, /"log":1/);
    });
    await test('page: movement pages (16 Nov): pointing on in air mode, and any clear movement out and back is counted', async () => {
      const r = await ev("(function(){try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});" +
        "var S=Lab._t.state,n=0,keep=S.step;S.step={id:'t-move',pose:{kind:'any',onSeen:function(){n++;}}};var air=Lab._t.airMode(S.step);Lab._t.resetPose();" +
        "function body(wy,jit){var lm=[],i;for(i=0;i<33;i++)lm.push({x:0.5,y:0.9,visibility:0.2});function set(k,x,y){lm[k]={x:x+(Math.random()-0.5)*jit,y:y+(Math.random()-0.5)*jit,visibility:0.95};}" +
        "set(11,0.4,0.4);set(12,0.6,0.4);set(0,0.5,0.3);set(13,0.38,0.58);set(14,0.62,0.58);set(15,0.42,wy);set(16,0.58,wy);return {landmarks:[lm]};}" +
        "var t=1000,k;function run(wy,ms,jit){for(k=0;k<ms;k+=33){Lab._t.poseFrame(body(wy,jit),t);t+=33;}}" +
        "run(0.75,1500,0.012);var still=n;run(0.5,700,0.01);run(0.75,1200,0.01);run(0.5,700,0.01);run(0.75,1200,0.01);var two=n;" +
        "run(0.5,7000,0.01);run(0.5,1500,0.01);var moved=n;" +
        "S.step=keep;try{Lab.endSession('test');}catch(e){}return JSON.stringify({air:air,still:still,two:two,moved:moved});})()");
      const d = JSON.parse(r);
      assert.equal(d.air, true, 'pointing on a movement page in air mode');
      assert.equal(d.still, 0, 'resting with a little tremor counts nothing');
      assert.equal(d.two, 2, 'two pushes forward and back count two');
      assert.equal(d.moved, 3, 'hands left forward for long: one more count, then a new resting place (no endless count) ' + r);
    });
    /* last: it replaces the page's camera with a drawn one for a while */
    await test('page: red heart on the page camera (a PC webcam, 23 Nov): a red disc in the picture moves the pointer; shrinking it (closed hand) and showing it again chooses once', async () => {
      /* a fresh page (no camera left open by the tests before), then the "webcam": a canvas with a grey room and a
         red disc, drawn 30 times a second */
      await send('Page.reload', {}, sid);
      await waitFor("!!window.Lab && !!window.CamView && document.readyState === 'complete'");
      await sleep(800);
      await ev("(function(){var c=document.createElement('canvas');c.width=640;c.height=480;var g=c.getContext('2d');window.__heartCam={x:320,y:240,r:50};" +
        "function draw(){g.fillStyle='#6e6e73';g.fillRect(0,0,640,480);var h=window.__heartCam;if(h.r>0){g.fillStyle='rgb(210,30,40)';g.beginPath();g.arc(h.x,h.y,h.r,0,7);g.fill();}}draw();window.__heartTimer=setInterval(draw,33);" +
        "var s=c.captureStream(30);window.__gumReal=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=function(){return Promise.resolve(s);};" +
        "localStorage.setItem('bellatrix-air-input','heart');try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      const camOn = await waitFor('!!(window.CamView.stream())', 8000);
      await sleep(1200);
      await ev("(function(){var o=document.querySelector('[data-b=hearttest2]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','hearttest2');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:390px;top:860px;width:300px;height:200px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__hz2=Lab._air().chosen;return true;})()");
      const look = () => ev("(function(){var a=Lab._air(),h=document.querySelector('.airhover');var v=document.getElementById('cam'),S=Lab._t.state,tr=CamView.stream()&&CamView.stream().getVideoTracks()[0];return {seen:a.seen,closed:a.closed,hover:h?h.getAttribute('data-b'):null,clicks:a.chosen-window.__hz2,heart:Lab._heart(),step:S.step&&S.step.id,air:Lab._t.airMode(S.step),on:S.on,v:[v.readyState,v.videoWidth,v.videoHeight,v.paused],track:tr?tr.label+' '+tr.readyState:null};})()");
      await sleep(1500);
      let r = await look();
      assert.ok(camOn && r.heart.on && r.seen, 'the page follows the red disc ' + JSON.stringify(r));
      assert.equal(r.hover, 'hearttest2', 'the disc in the middle points at the button in the middle ' + JSON.stringify(r));
      assert.equal(await ev('!!(Lab._t && Lab._t.state && true)'), true);
      await ev('window.__heartCam.r=15;true');   // the hand closes over the heart
      await sleep(700);
      r = await look();
      assert.equal(r.closed, true, 'a much smaller disc = closed hand ' + JSON.stringify(r));
      await ev('window.__heartCam.r=50;true');   // open again: the ring fills, then the button is chosen
      await sleep(1600);
      r = await look();
      assert.equal(r.clicks, 1, 'close then open chooses once ' + JSON.stringify(r));
      await ev('window.__heartCam.x=80;true');   // the heart moves to the side: the pointer leaves the button
      await sleep(1200);
      r = await look();
      assert.notEqual(r.hover, 'hearttest2', 'moving the heart moves the pointer away ' + JSON.stringify(r));
      await ev("(function(){var b=document.querySelector('[data-b=hearttest2]');if(b)b.remove();localStorage.removeItem('bellatrix-air-input');try{Lab.endSession('test');}catch(e){}" +
        "clearInterval(window.__heartTimer);navigator.mediaDevices.getUserMedia=window.__gumReal;return true;})()");   // the fake camera again for the next tests
    });
    await test('page: highlighter (23 Nov, the middle way, checked on the video of Rahma): a finger over the cap while moving, a cap hidden from the start, a pen moving away or a finger flicking past never choose; press and let go (a click) chooses once', async () => {
      await send('Page.reload', {}, sid);
      await waitFor("!!window.Lab && !!window.CamView && document.readyState === 'complete'");
      await sleep(800);
      /* the "webcam": a grey room, a fluorescent yellow-green pen in the middle (k: its size, x: its place), its dark
         green cap on top; covered = a finger (skin colour) over the cap */
      await ev("(function(){var c=document.createElement('canvas');c.width=640;c.height=480;var g=c.getContext('2d');window.__pen={x:320,y:250,k:1,covered:false};" +
        "function draw(){var p=window.__pen,k=p.k;g.fillStyle='#5a5a60';g.fillRect(0,0,640,480);g.fillStyle='rgb(215,240,70)';g.fillRect(p.x-14*k,p.y-60*k,28*k,140*k);g.fillStyle='rgb(20,140,80)';g.beginPath();g.arc(p.x,p.y-66*k,15*k,0,7);g.fill();" +
        "if(p.covered){g.fillStyle='rgb(222,172,140)';g.fillRect(p.x-34*k,p.y-100*k,68*k,52*k);}}draw();window.__penTimer=setInterval(draw,33);" +
        "var s=c.captureStream(30);window.__gumReal2=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=function(){return Promise.resolve(s);};" +
        "localStorage.setItem('bellatrix-air-input','pen');localStorage.setItem('bellatrix-pen-press','1');try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      await waitFor('!!(window.CamView.stream())', 8000);
      await sleep(1200);
      await ev("(function(){var o=document.querySelector('[data-b=pentest]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','pentest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:290px;top:710px;width:500px;height:500px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__pn0=Lab._air().chosen;return true;})()");
      const look = () => ev("(function(){var a=Lab._air(),h=document.querySelector('.airhover');return {seen:a.seen,closed:a.closed,hover:h?h.getAttribute('data-b'):null,clicks:a.chosen-window.__pn0,heart:Lab._heart()};})()");
      const set = (o) => ev('Object.assign(window.__pen,' + JSON.stringify(o) + ');true');
      await sleep(1500);
      let r = await look();
      assert.ok(r.heart.on && r.seen && r.hover === 'pentest', 'the pen in the middle points at the button in the middle ' + JSON.stringify(r));
      assert.equal(r.clicks, 0, 'pointing alone never chooses');
      /* 1. a finger over the cap while the pen moves: no press */
      await ev("(function(){var t=0;window.__wig=setInterval(function(){t++;window.__pen.x=320+(t%2?100:-100);},90);return true;})()");
      await sleep(400);
      await set({ covered: true });
      await sleep(2000);
      await ev('clearInterval(window.__wig);window.__pen.x=320;true');
      /* 2. then still, but the cap was not seen before: no press either */
      await sleep(2000);
      r = await look();
      assert.equal(r.clicks, 0, 'a finger over the cap while moving, then kept there, chooses nothing ' + JSON.stringify(r));
      /* 3. the pen moves away (smaller, cap and all): no press */
      await set({ covered: false });
      await sleep(900);
      await set({ k: 0.6 });
      await sleep(2000);
      await set({ k: 1 });
      await sleep(900);
      r = await look();
      assert.equal(r.clicks, 0, 'a pen further away is not a press ' + JSON.stringify(r));
      /* 4. a real press, like a click: the cap seen, the pen still, the thumb on the cap, then let go: the ring fills */
      await set({ covered: true });
      await sleep(700);
      r = await look();
      assert.equal(r.clicks, 0, 'pressing alone does not choose yet ' + JSON.stringify(r));
      await set({ covered: false });
      await sleep(1400);
      r = await look();
      assert.equal(r.clicks, 1, 'press, let go: the ring fills and the button is chosen once ' + JSON.stringify(r));
      /* 5. a finger flicking past the cap (shorter than MIN_MS) is no press */
      await set({ covered: true });
      await sleep(120);
      await set({ covered: false });
      await sleep(1400);
      assert.equal((await look()).clicks, 1, 'a finger flicking past the cap chooses nothing');
      /* 6. the next click */
      await sleep(400);
      await set({ covered: true });
      await sleep(700);
      await set({ covered: false });
      await sleep(1400);
      assert.equal((await look()).clicks, 2, 'press and let go again: the next choice');
      await ev("(function(){window.__pen.covered=false;var b=document.querySelector('[data-b=pentest]');if(b)b.remove();localStorage.removeItem('bellatrix-air-input');localStorage.removeItem('bellatrix-pen-press');try{Lab.endSession('test');}catch(e){}" +
        "clearInterval(window.__penTimer);navigator.mediaDevices.getUserMedia=window.__gumReal2;return true;})()");
    });
    await test('page: highlighter, the simple way (23 Nov, the default): the pen on a button for a moment chooses it, once; move away and back for the next; pressing the cap is not needed', async () => {
      await send('Page.reload', {}, sid);
      await waitFor("!!window.Lab && !!window.CamView && document.readyState === 'complete'");
      await sleep(800);
      await ev("(function(){var c=document.createElement('canvas');c.width=640;c.height=480;var g=c.getContext('2d');window.__pen={x:320,y:250};" +
        "function draw(){var p=window.__pen;g.fillStyle='#5a5a60';g.fillRect(0,0,640,480);g.fillStyle='rgb(215,240,70)';g.fillRect(p.x-14,p.y-60,28,140);g.fillStyle='rgb(20,140,80)';g.beginPath();g.arc(p.x,p.y-66,15,0,7);g.fill();}" +
        "draw();window.__penTimer=setInterval(draw,33);var s=c.captureStream(30);window.__gumReal3=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=function(){return Promise.resolve(s);};" +
        "localStorage.setItem('bellatrix-air-input','pen');try{Lab.endSession('test');}catch(e){}Lab.opt.camMode='air';Lab.start('hello',{preview:true,ready:true});return true;})()");
      await waitFor('!!(window.CamView.stream())', 8000);
      await sleep(1200);
      await ev("(function(){var o=document.querySelector('[data-b=dwelltest]');if(o)o.remove();var b=document.createElement('button');b.setAttribute('data-b','dwelltest');b.setAttribute('data-a','none');b.style.cssText='position:absolute;left:290px;top:710px;width:500px;height:500px;z-index:50';b.textContent='OK';document.getElementById('stage').appendChild(b);window.__dw0=Lab._air().chosen;return true;})()");
      const look = () => ev("(function(){var a=Lab._air(),h=document.querySelector('.airhover');return {hover:h?h.getAttribute('data-b'):null,clicks:a.chosen-window.__dw0,text:document.getElementById('handText').textContent};})()");
      await sleep(2400);
      let r = await look();
      assert.equal(r.hover, 'dwelltest', 'the pen points at the button ' + JSON.stringify(r));
      assert.equal(r.clicks, 1, 'staying on the button chose it, without any press ' + JSON.stringify(r));
      await sleep(1600);
      assert.equal((await look()).clicks, 1, 'staying longer does not choose again');
      /* away (no button there) and back, moving like a hand (not jumping: the finder follows the pen) */
      const glide = (x1, y1) => ev("new Promise(function(res){var p=window.__pen,x0=p.x,y0=p.y,k=0;var iv=setInterval(function(){k++;p.x=x0+(" + x1 + "-x0)*k/15;p.y=y0+(" + y1 + "-y0)*k/15;if(k>=15){clearInterval(iv);res(true);}},40);})");
      await glide(110, 150);
      await sleep(1000);
      const away = JSON.stringify(Object.assign(await look(), { air: await ev('Lab._air()') }));
      await glide(320, 250);
      await sleep(2400);
      r = await look();
      assert.equal(r.clicks, 2, 'away and back: chosen again ' + JSON.stringify(Object.assign(r, { air: await ev('Lab._air()') })) + ' / away: ' + away);
      await ev("(function(){var b=document.querySelector('[data-b=dwelltest]');if(b)b.remove();localStorage.removeItem('bellatrix-air-input');try{Lab.endSession('test');}catch(e){}" +
        "clearInterval(window.__penTimer);navigator.mediaDevices.getUserMedia=window.__gumReal3;return true;})()");
    });
  } catch (e) { fail++; console.log('FAIL page run: ' + (e && e.message || e)); }
  clearTimeout(watchdog);
  stop();
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
