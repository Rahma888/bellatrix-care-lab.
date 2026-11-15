// Family messages are handed over by the robot itself: at the closing step of ANY finished activity, unread
// messages are offered ("Before you go, I have a little surprise for you": See / Later). Run: node tests/surprise.test.mjs
// Silent (Chrome --mute-audio, speech stubbed), own server and Chrome on free ports, synthetic data in a temp folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port0 = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('surprise at the end of an activity: See delivers all and marks them read; Later keeps them; never in a call or a preview', { skip: !CHROME && 'no Chrome', timeout: 150000 }, async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-sp-')), port = await port0(), dbg = await port0(), BASE = 'http://localhost:' + port + '/';
  const server = cp.spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env: Object.assign({}, process.env, { PORTAL_DATA: path.join(TMP, 'portal'), FEED_DATA: path.join(TMP, 'feed'), NOTIFY_DATA: path.join(TMP, 'notify'), CALLREQ_DATA: path.join(TMP, 'callreq') }), stdio: ['ignore', 'pipe', 'ignore'] });
  let chrome = null, ws = null;
  try {
    await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server')), 15000); server.stdout.on('data', (b) => { if (String(b).includes('Close this window')) { clearTimeout(t); ok(); } }); });
    const ROBOT = 'surprise_robot_' + crypto.randomBytes(5).toString('hex'), KEY = crypto.randomBytes(32).toString('base64url'), R = { Authorization: 'Robot ' + ROBOT + '.' + KEY, 'Content-Type': 'application/json' };
    const api = async (m, p, b, h) => (await fetch(BASE + 'portal/api/' + p, { method: m, headers: h || R, body: b ? JSON.stringify(b) : undefined })).json();
    await api('POST', 'robot/hello', { robot: ROBOT, key: KEY }, { 'Content-Type': 'application/json' });
    const rid = (await api('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'en' })).rid;
    const inv = await api('POST', 'robot/invite', { rid });
    const reg = await api('POST', 'family/register', { code: inv.code, email: 'sp@example.test', name: 'Sophie', relation: 'daughter', lang: 'en', consent: true }, { 'Content-Type': 'application/json' });
    /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation: the head validates it */
    const acc = (await api('GET', 'robot/state')).residents[0].accounts.find((a) => a.email === 'sp@example.test' && a.status === 'pending');
    assert.ok(acc, 'waiting in the care team\'s list');
    assert.equal((await api('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' })).status, 'active');
    const F = { Authorization: 'Bearer ' + reg.token, 'X-Resident': rid, 'Content-Type': 'application/json' };
    await api('POST', 'family/message', { text: 'First word' }, F);
    await api('POST', 'family/message', { text: 'Second word' }, F);
    const statuses = async () => (await api('GET', 'robot/feed')).messages.map((m) => m.status);

    chrome = cp.spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=' + dbg, '--user-data-dir=' + path.join(TMP, 'profile'), '--no-first-run', '--disable-gpu', '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
    let list = null; for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch('http://127.0.0.1:' + dbg + '/json/list')).json(); } catch (e) { await sleep(250); } }
    ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
    const pending = {}; let seq = 0; const problems = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } else if (d.method === 'Runtime.exceptionThrown') problems.push(String(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 200)); };
    const send = (m, p = {}) => new Promise((res, rej) => { const i = ++seq; pending[i] = (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
    const waitFor = async (x, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) { /* loading */ } await sleep(200); } throw new Error('timeout: ' + x); };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{speechSynthesis.speak=function(u){setTimeout(function(){u.onend&&u.onend();},20);};}catch(e){}' });
    await send('Page.navigate', { url: BASE + 'patient.html' }); await sleep(1500);
    await ev(`localStorage.setItem('bellatrix-family-robot',${JSON.stringify(ROBOT)});localStorage.setItem('bellatrix-portal-key',${JSON.stringify(KEY)});true`);
    await send('Page.navigate', { url: BASE + 'patient.html' }); await waitFor('window.Lab && window.FamilyMessages && Lab.activities');
    await ev('FamilyMessages.sync().then(function(){return true;})');
    assert.equal(await ev(`FamilyMessages.due('P1',{ignoreSnooze:true,anyPhoto:true}).length`), 2);
    const step = () => ev('Lab._t.state.step ? Lab._t.state.step.id : ""');
    const startAndFinish = async (key, preview) => {
      await ev(`(function(){ Lab.opt.participant='P1'; Lab.patient='P1'; Lab.opt.mood=false; Lab.opt.lang='en'; Lab.start(${JSON.stringify(key)}, { direct: true, preview: ${!!preview} }); return true; })()`);
      await waitFor('Lab.isOn()');
      assert.notEqual(await step(), 'surprise', 'never in the middle of an activity');
      await ev('Lab._t.api.finish(); true');
      await waitFor(`Lab._t.state.step && /^(again|surprise|end)$/.test(Lab._t.state.step.id)`);
      if ((await step()) === 'again') await ev(`(function(){var b=document.querySelector('#screen [data-a="c"][data-i="0"]');if(b)b.click();return !!b;})()`);
      await sleep(300);
    };
    const click = (i) => ev(`(function(){var b=document.querySelector('#screen [data-b="a-${i}"]');if(b)b.click();return !!b;})()`);

    /* a preview and a family call never get the surprise */
    await startAndFinish('hello', true);
    assert.notEqual(await step(), 'surprise', 'no surprise in a preview');
    await ev('Lab.endSession(); true');
    assert.equal(await ev(`Lab.surprise({ key: 'familycall' }, {})`), null, 'no surprise during a family call');
    assert.equal(await ev(`Lab.surprise({ key: 'callrequest' }, {})`), null);

    /* Later: the messages stay */
    await startAndFinish('hello', false);
    await waitFor(`Lab._t.state.step && Lab._t.state.step.id === 'surprise'`);
    assert.match(await ev(`document.querySelector('#screen h2, #screen .title, #screen').textContent`), /little surprise/);
    assert.equal(await ev(`document.querySelectorAll('#screen [data-b^="a-"]').length`), 2, 'See and Later only');
    assert.ok(await click(1));
    await waitFor('!Lab.isOn()');
    assert.equal(await ev(`FamilyMessages.due('P1',{ignoreSnooze:true,anyPhoto:true}).length`), 2, 'Later keeps both for the next activity');
    assert.ok(!(await statuses()).includes('read'));

    /* See: both messages one after the other, then read for the family */
    await startAndFinish('hello', false);
    await waitFor(`Lab._t.state.step && Lab._t.state.step.id === 'surprise'`);
    assert.ok(await click(0));
    await waitFor(`Lab._t.state.step && Lab._t.state.step.id === 'msg-0'`);
    assert.ok(await click(1));
    await waitFor(`Lab._t.state.step && Lab._t.state.step.id === 'msg-1'`);
    assert.ok(await click(1));
    await waitFor(`Lab._t.state.step && Lab._t.state.step.id === 'end'`);
    assert.ok(await click(0));
    await waitFor('!Lab.isOn()', 20000);
    await ev('FamilyMessages.flush().then(function(){return true;})').catch(() => {});
    for (let i = 0; i < 20 && (await statuses()).filter((s) => s === 'read').length < 2; i++) await sleep(500);
    assert.deepEqual(await statuses(), ['read', 'read'], 'delivered messages are read for the family');
    assert.equal(await ev(`FamilyMessages.due('P1',{ignoreSnooze:true,anyPhoto:true}).length`), 0);
    assert.deepEqual(problems, []);
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    for (const c of [chrome, server]) { if (c) { try { cp.execSync('taskkill /PID ' + c.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { /* gone */ } } }
    await sleep(1200);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* locked a moment */ }
  }
});
