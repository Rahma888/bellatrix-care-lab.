// Regression check (muted headless Chrome, ports 8802/9382): PORTRAIT phone streams (720x1280, 540x960, one that changes size) into the robot call screen at 1098x618 DPR 1.75, 1920x1080 and portrait; every button and video must stay inside the screen, buttons <= 18% high. Run: node tests/call-portrait.check.mjs (OUT=folder for screenshots)
// Muted headless Chrome check: 3 relatives in one call with the robot page. Ports 8801 (server) and 9381 (Chrome).
// Usage: node check.mjs   Stops Chrome and the server at the end.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'bx-shots-'));
const PORT = 8802, DBG = 9382;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { createRelay } = await import(pathToFileURL(PROJECT + '/labland/call-relay.mjs').href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-call-'));
const relay = createRelay({ dataFile: path.join(tmp, 'call.json'), log: () => {}, ice: { iceServers: [] } });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/call/api/')) {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { /* none */ }
      Promise.resolve(relay.handle(req, url, body, res)).then((out) => {
        if (out && !res.headersSent) { res.writeHead(out[0], { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out[1])); }
      });
    });
    return;
  }
  let f = path.resolve(path.join(PROJECT, decodeURIComponent(url.pathname)));
  if (!f.startsWith(path.resolve(PROJECT)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const profile = path.join(tmp, 'profile');
const chrome = cp.spawn(CHROME, ['--headless=new', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + DBG, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
function shutdown() { try { chrome.kill(); } catch (e) {} try { server.close(); } catch (e) {} try { relay.stop(); } catch (e) {} }
process.on('exit', shutdown);

let ver = null;
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + DBG + '/json/version')).json(); } catch (e) { await sleep(250); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
function send(method, params = {}, sessionId) { return new Promise((res, rej) => { const id = ++seq; pend[id] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
const PORTRAIT = "(function(){var W=window.__W||720,H=window.__H||1280;var md=navigator.mediaDevices;if(!md)return;var orig=md.getUserMedia.bind(md);md.getUserMedia=function(c){return orig({audio:c.audio||true,video:false}).catch(function(){return new MediaStream();}).then(function(a){var cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d'),n=0;setInterval(function(){n++;if(window.__SW&&n%40===0){cv.width=window.__SW[0];cv.height=window.__SW[1];window.__SW=null;}x.fillStyle='#3a6';x.fillRect(0,0,cv.width,cv.height);x.fillStyle='#fff';x.beginPath();x.arc(cv.width/2,cv.height/2,cv.width/4,0,7);x.fill();x.fillStyle='#000';x.font='40px sans-serif';x.fillText(cv.width+'x'+cv.height+' '+n,20,60);},66);var v=cv.captureStream(15);a.getAudioTracks().forEach(function(t){v.addTrack(t);});return v;});};})();";
const SILENT = "(function(){try{var s=window.speechSynthesis;if(s){s.speak=function(u){setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();";
class Page {
  constructor(name, sid) { this.name = name; this.sid = sid; }
  static async open(name, url, w, h, mobile) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: w, height: h });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(name, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1.75, mobile: true }, sessionId);
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT + (name !== 'robot' ? PORTRAIT : '') }, sessionId);
    p.targetId = targetId;
    if (url) await p.go(url);
    return p;
  }
  async go(url) { await send('Page.navigate', { url }, this.sid); await sleep(900); }
  async ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, this.sid);
    if (r.exceptionDetails) throw new Error(this.name + ' eval: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
  async waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.ev(expr)) return true; } catch (e) { /* retry */ } await sleep(250); } return false; }
  async shot(file) { await sleep(500); const r = await send('Page.captureScreenshot', { format: 'png' }, this.sid); fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64')); }
  async size(w, h, mobile) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1.75, mobile: true }, this.sid); await sleep(400); }
  async close() { try { await send('Target.closeTarget', { targetId: this.targetId }); } catch (e) { /* closed */ } }
}
const results = [];
function check(name, cond, info) { const line = (cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : ''); results.push(line); console.log(line); }
const B = 'http://localhost:' + PORT + '/';
async function api(p, body) { const r = await fetch(B + 'call/api/' + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return r.json(); }


const ROBOT = 'robotcheck0000000002';
const fails = [];
function ck(n, c, i) { check(n, c, i); if (!c) fails.push(n); }
const inView = `(function(){var W=innerWidth,H=innerHeight,bad=[];[].forEach.call(document.querySelectorAll('#screen button, #screen video, #screen .fctile'),function(e){var q=e.getBoundingClientRect();if(q.width===0&&q.height===0)return;if(q.left<-1||q.top<-1||q.right>W+1||q.bottom>H+1)bad.push((e.className||e.tagName)+':'+[q.left,q.top,q.right,q.bottom].map(Math.round));});
 var tiles=[].map.call(document.querySelectorAll('.fctile'),function(t){var b=t.getBoundingClientRect();var v=t.querySelector('video').getBoundingClientRect();return v.left>=b.left-1&&v.right<=b.right+1&&v.top>=b.top-1&&v.bottom<=b.bottom+1});
 var bt=[].filter.call(document.querySelectorAll('#screen button'),function(b){return b.getBoundingClientRect().width>0});
 return {bad:bad,tilesOk:tiles.every(Boolean),n:tiles.length,btnMaxFrac:bt.length?Math.max.apply(null,bt.map(function(b){return b.getBoundingClientRect().height/H})):0,scrollH:document.documentElement.scrollHeight,H:H}})()`;
try {
  const tok = (await api('invite', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Maman', lang: 'fr' })).token;
  const tok2 = (await api('invite', { robot: ROBOT, resident: 'P1', contactId: 'c2', label: 'Maman', lang: 'fr' })).token;
  const book = { residents: { P1: { acceptNow: true, times: [], contacts: [{ id: 'c1', name: 'Maria', rel: 'daughter', token: tok }, { id: 'c2', name: 'Jonas', rel: 'son', token: tok2 }] } } };
  const robot = await Page.open('robot', B + 'patient.html', 1098, 618, true);
  await robot.ev("localStorage.setItem('bellatrix-family-robot'," + JSON.stringify(ROBOT) + "); localStorage.setItem('bellatrix-family'," + JSON.stringify(JSON.stringify(book)) + "); true");
  await robot.go(B + 'patient.html'); await sleep(2500);
  const sizes = [[1098, 618, 'robot'], [1920, 1080, 'big'], [540, 960, 'portrait']];
  for (const [vw, vh] of [[720, 1280], [540, 960]]) {
    const f = await Page.open('fam', B + 'famille.html#t=' + tok, 390, 844, true);
    await f.ev('window.__W=' + vw + ';window.__H=' + vh + ';true');
    await f.go(B + 'famille.html#t=' + tok);
    await f.waitFor("!!document.querySelector('[data-act=call]') && !document.querySelector('[data-act=call]').disabled");
    await f.ev("document.querySelector('[data-act=call]').click(); true");
    ck('rings', await robot.waitFor("!!document.querySelector('.fcring')"));
    for (const [w, h, nm] of sizes) { await robot.size(w, h); const r = await robot.ev(inView); ck('ringing ' + nm + ' ' + vw + ' fits', !r.bad.length && r.scrollH <= r.H + 1, r); await robot.shot('r-ring-' + nm + '-' + vw + '.png'); }
    await robot.size(1098, 618);
    await robot.ev("document.querySelector('.fcanswer').click(); true");
    ck('connected', await robot.waitFor("document.querySelectorAll('.fctile.on').length===1", 25000));
    await sleep(1500);
    if (vw === 540) { await f.ev('window.__SW=[1280,720];true'); await sleep(4000); }
    for (const [w, h, nm] of sizes) { await robot.size(w, h); await sleep(500); const r = await robot.ev(inView); ck('in call ' + nm + ' ' + vw + ' fits', !r.bad.length && r.tilesOk && r.btnMaxFrac <= 0.18 && r.scrollH <= r.H + 1, r); await robot.shot('r-call-' + nm + '-' + vw + '.png'); }
    await robot.size(1098, 618);
    const f2 = await Page.open('fam2', B + 'famille.html#t=' + tok2, 390, 844, true);
    await f2.ev('window.__W=' + vw + ';window.__H=' + vh + ';true'); await f2.go(B + 'famille.html#t=' + tok2);
    await f2.waitFor("!!document.querySelector('[data-act=call]') && !document.querySelector('[data-act=call]').disabled");
    await f2.ev("document.querySelector('[data-act=call]').click(); true");
    await robot.waitFor("document.querySelectorAll('.fctile.on').length===2", 25000); await sleep(1500);
    for (const [w, h, nm] of sizes) { await robot.size(w, h); await sleep(500); const r = await robot.ev(inView); ck('2 relatives ' + nm + ' ' + vw + ' fits', !r.bad.length && r.tilesOk && r.btnMaxFrac <= 0.18, r); await robot.shot('r-call2-' + nm + '-' + vw + '.png'); }
    await robot.size(1098, 618);
    await f2.ev("document.querySelector('[data-act=hangup]').click(); true");
    await sleep(1500);
    await f.ev("document.querySelector('[data-act=hangup]').click(); true");
    ck('end screen shown', await robot.waitFor("!!document.querySelector('.fcvideo.ended')", 15000));
    for (const [w, h, nm] of sizes) { await robot.size(w, h); await sleep(500); const r = await robot.ev(inView); ck('end ' + nm + ' ' + vw + ' fits', !r.bad.length && r.scrollH <= r.H + 1, r); await robot.shot('r-end-' + nm + '-' + vw + '.png'); }
    await robot.size(1098, 618);
    await sleep(11000);
    await f.close(); await f2.close();
  }
} catch (e) { console.log('ERROR ' + (e && e.stack || e)); results.push('ERROR ' + e); fails.push('error'); }
finally { fs.writeFileSync(path.join(OUT, 'check-portrait-results.txt'), results.join('\n') + '\n'); shutdown(); setTimeout(() => process.exit(fails.length ? 1 : 0), 300); }
