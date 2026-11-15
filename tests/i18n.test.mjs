// Languages (1.16, workstream B): one language per window. The Care Team (staff.html), the patient screen
// (patient.html) and the family portal (portail.html) never mix languages in FR, DE or EN.
// Run: node tests/i18n.test.mjs        (about 1.5 min; I18N_VERBOSE=1 prints every finding)
// 0. The checker itself flags English, and lets translations and proper names through.
// 1. Static: every literal passed to ST(), Lab.t(), L.t(), T(), tr() (and the modules' S(), SX(),
//    I18N.t(lang, '…')), and every data-st="…" of the three pages, has a fr AND a de entry in the dictionary
//    the pages build (js/i18n*.js plus the modules' own I18N.add).
// 2-5. In MUTED headless Chromes (--mute-audio, speechSynthesis stubbed: no sound at all), one per language,
//    side by side: the Care Team (every tab and sub-section, the tools), the patient screen (every activity,
//    step by step, and what Bellatrix says), the demo (sampled), the family portal (own local server,
//    synthetic test data only). In FR and DE a visible string, a placeholder / title / aria-label or a spoken
//    sentence is flagged when it is identical to its English key, carries plain English words, or is the
//    other language's text; in EN when it is French or German. Brand and proper names are allowed.
// Every Chrome and server it starts is stopped at the end, also on failure; a watchdog ends a stuck run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['staff.html', 'patient.html', 'portail.html'];
const LANGS = ['fr', 'de'];            /* the translated languages (part 1) */
const UI = ['fr', 'de', 'en'];         /* the languages a window can be in (parts 2-5) */
const VERBOSE = !!process.env.I18N_VERBOSE;
const STEP = +process.env.I18N_STEP_MS || 450;   /* wait after a click */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* Brand and proper names that stay as they are in every language. */
const ALLOW = [
  /^Bellatrix( Play| Premium| Play Premium)?$/, /^LabLand$/i, /^YouTube$/, /^Spotify$/, /^Premium$/, /^DJ$/, /^OK$/, /^Wi-?Fi$/i,
  /^Play$/, /^Care Lab$/, /^FR$/, /^EN$/, /^DE$/, /^English$/, /^Français$/, /^Deutsch$/, /^P\d+$/, /^Radio France$/, /^BBC\b/,
  /^Ludo$/, /^Album$/, /^Karaoke$/, /^Podcasts?$/, /^Volume$/, /^Clip$/, /^Mix$/, /^Radio$/, /^Pause$/, /^Stop$/, /^Info$/,
  /^Marie$/, /^Sophie$/, /^Test$/, /@example\.test$/
];
/* Words that are English and never French or German (whole words, case-insensitive) … */
const EN_WORDS = ('the and your you with for this that are is of not now please tap here there what when which will would should ' +
  'more less again back next done open close show hide add delete edit save choose select today yesterday tomorrow song songs music ' +
  'team care family resident residents settings results activities activity library help finish listen read reading books book ' +
  'yet no yes nothing everything someone something only also just each every new old other another one two three ' +
  'start stop click press minutes seconds day days week month hours from into about over under after before while ' +
  'his her their our my its it they we he she him them been being was were has have had do does did can could may might ' +
  'cleaning screen camera hand hands touch pointing approve approved waiting sent send loading error offline online').split(/\s+/);
/* … minus the words French or German also use as such ("Listen" is German for lists, "Team" is German). */
const NOT_EN = new Set(['start', 'stop', 'minutes', 'screen', 'camera', 'loading', 'online', 'offline', 'album', 'one', 'an', 'in',
  'so', 'die', 'den', 'des', 'man', 'will', 'was', 'hand', 'is', 'a', 'on', 'me', 'pour', 'bus', 'team', 'listen']);
const EN_RE = new RegExp('(^|[^\\p{L}’\'])(' + EN_WORDS.filter((w) => !NOT_EN.has(w)).join('|') + ')(?=$|[^\\p{L}’\'])', 'iu');
/* French or German words that never appear in English text (for the English window). */
const FRDE_RE = /(^|[^\p{L}’'])(le|la|les|des|une|vous|votre|vos|avec|pour|dans|aujourd’hui|écouter|ich|und|der|das|ein|eine|mit|nicht|Sie|Ihre|für|heute|hören)(?=$|[^\p{L}’'])/u;

/* ---------------------------------------------------------------- part 1: the literals ----------- */
function pageScripts() {
  const s = new Set();
  for (const p of PAGES) for (const m of fs.readFileSync(path.join(ROOT, p), 'utf8').matchAll(/<script src="([^"?]+)/g)) s.add(m[1]);
  return [...s];
}
function literals() {
  const LIT = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
  const CALL = new RegExp(String.raw`(?:(?<![\w$.])(?:ST|T|tr|S|SX)|\b(?:Lab|L)\.t|\bI18N\.t\([^,()]+,)\(?\s*` + LIT + String.raw`\s*([,)])`, 'g');
  const found = new Map();
  const put = (k, where) => { if (!/[A-Za-z]/.test(k)) return; if (!found.has(k)) found.set(k, new Set()); found.get(k).add(where); };
  for (const s of pageScripts()) {
    if (/^js\/i18n/.test(s) || !fs.existsSync(path.join(ROOT, s))) continue;
    const src = fs.readFileSync(path.join(ROOT, s), 'utf8');
    for (const m of src.matchAll(CALL)) put(vm.runInNewContext(m[1]), s + ':' + src.slice(0, m.index).split('\n').length);
    for (const m of src.matchAll(/data-st(?:-placeholder)?="([^"'<>]+)"/g)) put(m[1], s);
  }
  for (const p of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
    for (const m of src.matchAll(/data-st(?:-placeholder)?="([^"]+)"/g)) put(m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), p);
  }
  return found;
}
/* The dictionary without a browser: js/i18n*.js only (the modules' own I18N.add need the page). */
function vmDict() {
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } }; ctx.window = ctx; vm.createContext(ctx);
  for (const s of pageScripts()) if (/^js\/i18n/.test(s)) vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: s });
  return { fr: Object.assign({}, ctx.I18N.dict.fr), de: Object.assign({}, ctx.I18N.dict.de) };
}

/* ---------------------------------------------------------------- the browsers ----------------- */
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
function serve() {
  const srv = http.createServer((q, r) => {
    const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
    /* never cached: a file another agent is saving must not stay half-written for the whole run */
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store', Connection: 'close' });
    r.end(fs.readFileSync(p));
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res(srv)));
}
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
/* Silent: speechSynthesis never speaks, it only records what Bellatrix would say; Chrome is muted too. */
const SILENT = `(function(){window.__said=[];try{var s=window.speechSynthesis;if(s){s.speak=function(u){try{window.__said.push(String(u.text||''));}catch(e){}setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();`;
const killTree = (pid) => { try { if (process.platform === 'win32') execSync('taskkill /T /F /PID ' + pid, { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };
async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-i18n-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  const B = { pid: chrome.pid, errors: [], closed: false };
  B.close = async () => {
    if (B.closed) return; B.closed = true;
    try { await Promise.race([B.send('Browser.close'), sleep(2000)]); } catch (e) { /* closing */ }
    try { B.ws.close(); } catch (e) { /* closed */ }
    await sleep(300); killTree(chrome.pid);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
  };
  B.send = () => Promise.reject(new Error('not connected'));
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) { try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(150); } }
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch (e) { await sleep(150); } }
  if (!list) { await B.close(); throw new Error('Chrome did not start'); }
  const ws = B.ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = {};
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; return; }
    if (d.method === 'Runtime.exceptionThrown') B.errors.push(String((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).split('\n')[0].slice(0, 160));
    if (d.method === 'Page.javascriptDialogOpening') B.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  };
  B.send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; const t = setTimeout(() => { delete pending[i]; rej(new Error(method + ': no answer')); }, 20000); pending[i] = (d) => { clearTimeout(t); return d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); }; ws.send(JSON.stringify({ id: i, method, params })); });
  B.ev = async (expr) => { const r = await B.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 200)); return r.result.value; };
  B.waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await B.ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; };
  B.go = async (url, ready = 'true') => { await B.send('Page.navigate', { url }); await sleep(150); return B.waitFor('document.readyState === "complete" && (' + ready + ')'); };
  B.click = async (q, ms = STEP) => { const ok = await B.ev(`(function(){var b=document.querySelector(${JSON.stringify(q)}); if (b) b.click(); return !!b;})()`); await sleep(ms); return ok; };
  await B.send('Runtime.enable'); await B.send('Page.enable'); await B.send('Network.enable');
  await B.send('Network.setCacheDisabled', { cacheDisabled: true });
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT });
  return B;
}

/* What the page shows: visible text nodes, placeholders, titles, aria-labels, select options, and what was said,
   in the page and in its same-origin frames (the demo shows the three apps in frames). */
const COLLECT = `(function(){
  var out = [], seen = {};
  function add(s, where) { s = String(s || '').replace(/\\s+/g, ' ').trim(); if (s.length < 2 || seen[s]) return; seen[s] = 1; out.push([s, where]); }
  function name(e) { return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''); }
  function scan(doc, win, pre) {
    function vis(e) { if (!e || !e.getClientRects().length) return false; var cs = win.getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; }
    if (!doc || !doc.body) return;
    var w = doc.createTreeWalker(doc.body, 4), n;
    while ((n = w.nextNode())) { var p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(p.tagName) || p.closest('[data-i18n-skip],[contenteditable]')) continue; if (vis(p)) add(n.nodeValue, pre + name(p)); }
    [].forEach.call(doc.querySelectorAll('[placeholder],[title],[aria-label]'), function (e) { if (!vis(e)) return; ['placeholder', 'title', 'aria-label'].forEach(function (a) { if (e.hasAttribute(a)) add(e.getAttribute(a), pre + name(e) + '@' + a); }); });
    [].forEach.call(doc.querySelectorAll('select'), function (s) { if (!vis(s)) return; [].forEach.call(s.options, function (o) { if (!o.hasAttribute('lang')) add(o.textContent, pre + name(s) + ' option'); }); });
    try { (win.__said || []).forEach(function (s) { add(s, pre + 'said'); }); win.__said = []; } catch (e) {}
    [].forEach.call(doc.querySelectorAll('iframe'), function (f, i) { try { if (vis(f)) scan(f.contentDocument, f.contentWindow, pre + 'frame' + i + ' '); } catch (e) { /* other origin */ } });
  }
  scan(document, window, '');
  return out;
})()`;
/* Proper names from the catalogues: song, book and podcast titles, artists, authors. */
const NAMES = `(function(){
  var out = {}, KEYS = /^(title|artist|artists|name|author|by|show|singer|composer|host|album|channel|publisher|source)$/i, n = 0;
  function walk(v, k, d) { if (n > 200000 || d > 7 || v == null) return; n++;
    if (typeof v === 'string') { if (KEYS.test(k || '')) out[v.trim()] = 1; return; }
    if (typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(function (x) { walk(x, k, d + 1); }); return; }
    Object.keys(v).forEach(function (kk) { try { walk(v[kk], /^(en|fr|de)$/.test(kk) ? k : kk, d + 1); } catch (e) {} }); }
  ['PLAY_CATALOG', 'READING_DATA', 'KaraokeSongs', 'Podcasts', 'Music'].forEach(function (g) { try { walk(window[g], '', 0); } catch (e) {} });
  try { if (window.KaraokeSongs && KaraokeSongs.all) walk(KaraokeSongs.all(), '', 0); } catch (e) {}
  try { if (window.Podcasts && Podcasts.list) walk(Podcasts.list(), '', 0); } catch (e) {}
  return Object.keys(out);
})()`;

/* ---------------------------------------------------------------- the judge -------------------- */
let DICT = null, KEYS = null, NAMESET = new Set(), VAL = null;
function prepare(dict, names) {
  DICT = dict; NAMESET = names;
  KEYS = new Set([...literals().keys(), ...Object.keys(dict.fr), ...Object.keys(dict.de)]);
  VAL = { fr: new Set(Object.values(dict.fr)), de: new Set(Object.values(dict.de)) };
}
function judge(lang, items, dict = DICT, keys = KEYS, names = NAMESET, val = VAL) {
  const bad = [];
  const named = (s) => names.has(s) || [...names].some((nm) => nm.length > 3 && s.indexOf(nm) >= 0);
  for (const [s, where] of items) {
    if (ALLOW.some((r) => r.test(s)) || names.has(s)) continue;
    if (!/\p{L}{2}/u.test(s)) continue;   /* numbers, times, symbols */
    if (lang === 'en') {
      if (keys.has(s)) continue;
      if ((val.fr.has(s) || val.de.has(s) || FRDE_RE.test(s)) && !named(s)) bad.push('en | French or German in the English window | ' + JSON.stringify(s) + ' | ' + where);
      continue;
    }
    const other = lang === 'fr' ? 'de' : 'fr';
    if (val[lang].has(s)) continue;   /* a deliberate translation (German "Start" for Home, a German song title…) */
    if (keys.has(s) && has(dict[lang], s) && dict[lang][s] !== s) { bad.push(lang + ' | not translated (the ' + lang + ' text exists) | ' + JSON.stringify(s) + ' | ' + where); continue; }
    if (keys.has(s) && !has(dict[lang], s) && EN_RE.test(s)) { bad.push(lang + ' | missing translation | ' + JSON.stringify(s) + ' | ' + where); continue; }
    if (!keys.has(s) && val[other].has(s) && !named(s)) { bad.push(lang + ' | ' + other + ' text in the ' + lang + ' window | ' + JSON.stringify(s) + ' | ' + where); continue; }
    if (!keys.has(s) && EN_RE.test(s) && !named(s)) bad.push(lang + ' | English words | ' + JSON.stringify(s) + ' | ' + where);
  }
  return bad;
}
const say = (title, list) => { if (!list.length) return; console.log('# ' + title + ' (' + list.length + ')'); for (const l of list.slice(0, VERBOSE ? 9999 : 40)) console.log('#   ' + l); if (!VERBOSE && list.length > 40) console.log('#   … I18N_VERBOSE=1 for all'); };

/* ---------------------------------------------------------------- the tours --------------------- */
async function grabInto(B, items, where) { for (const it of await B.ev(COLLECT)) items.push([it[0], (where ? where + ' ' : '') + it[1]]); }
async function staffTour(B, lang) {
  const items = [];
  await B.go(BASE + 'staff.html?i18n=' + lang + Date.now(), 'window.ST');
  await B.ev(`(function(){ try { localStorage.setItem('bellatrix-staff-lang', ${JSON.stringify(lang)}); } catch (e) {} var b = document.querySelector('[data-ui-lang="${lang}"]'); if (b) b.click(); })()`);
  await sleep(STEP);
  await B.click('#trayLine');
  await B.ev(`[].forEach.call(document.querySelectorAll('#lifeBox, details.more'), function (x) { x.open = true; })`);
  await B.click('#actList .tile, #actList button');
  await B.ev(`(function(){ var d = document.getElementById('persBox'); if (d) d.open = true; })()`);
  await grabInto(B, items, 'activities');
  /* 15 Nov: no "Music & photos" tab; its parts are in the settings of these activities */
  for (const key of ['album', 'reading', 'play', 'karaoke']) {
    await B.ev(`(function(){ try { StaffUI.choose(${JSON.stringify(key)}); var d = document.getElementById('persBox'); if (d) d.open = true; } catch (e) { /* not on this page */ } })()`);
    await sleep(STEP); await grabInto(B, items, 'activities/' + key);
  }
  const tabs = await B.ev(`[].map.call(document.querySelectorAll('.ctop .tabs [data-tab]'), function (b) { return b.getAttribute('data-tab'); })`);
  for (const t of tabs) {
    if (t === 'session') continue;
    await B.click('.ctop .tabs [data-tab="' + t + '"]'); await grabInto(B, items, t);
    const subs = await B.ev(`[].map.call(document.querySelectorAll('#tab-${t} [data-sub]'), function (b) { return b.getAttribute('data-sub'); })`);
    for (const s of subs) { await B.click('#tab-' + t + ' [data-sub="' + s + '"]'); await grabInto(B, items, t + '/' + s); }
  }
  if (await B.click('#libBody .appcard, #libBody .appgo')) { await grabInto(B, items, 'library sheet'); await B.click('.sheetx, .pmclose', 200); }
  await B.click('.ctop .tabs [data-tab="session"]', 200);
  if (await B.click('#stToolsBtn')) {
    await grabInto(B, items, 'tools');
    const n = await B.ev(`document.querySelectorAll('.st-tile').length`);
    for (let i = 0; i < n; i++) {
      const label = await B.ev(`(function(){ var t = document.querySelectorAll('.st-tile')[${i}]; return t ? t.textContent : ''; })()`);
      if (/démo|demo|nettoy|clean|reinig|desinf|désinf/i.test(label)) continue;   /* no demo run, no cleaning lock here */
      await B.ev(`(function(){ var t = document.querySelectorAll('.st-tile')[${i}]; if (t) t.click(); })()`); await sleep(STEP);
      await grabInto(B, items, 'tools ' + i);
      await B.click('.st-back', 200);
    }
  }
  return items;
}
async function patientTour(B, lang) {
  const items = [];
  /* the waiting screen speaks the language of the last session on this screen */
  await B.go(BASE + 'patient.html?i18n=' + Date.now(), 'window.Lab');
  await B.ev(`localStorage.setItem('bellatrix-care-lab-lastlang', ${JSON.stringify(lang)})`);
  await B.go(BASE + 'patient.html?allgames&i18n=' + lang + Date.now(), 'window.Lab && Lab.activities');
  await sleep(300); await grabInto(B, items, 'waiting');
  const keys = await B.ev(`Lab.activities.filter(function (a) { return !a.hidden; }).map(function (a) { return a.key; })`);
  for (const key of keys) {
    const start = `(function(){ try { if (Lab.isOn && Lab.isOn()) Lab.endSession(); Lab.opt.lang = ${JSON.stringify(lang)}; Lab.opt.mood = true; Lab.start(${JSON.stringify(key)}, { preview: true, ready: true }); return true; } catch (e) { return String(e.message); } })()`;
    let ok = await B.ev(start);
    if (ok !== true) { await B.go(BASE + 'patient.html?allgames&i18n=' + key + Date.now(), 'window.Lab && Lab.activities'); ok = await B.ev(start); }
    if (ok !== true) { items.push(['START FAILED ' + ok, key]); continue; }
    await sleep(STEP); await grabInto(B, items, key);
    for (let i = 0; i < 3; i++) {
      const clicked = await B.ev(`(function(){ var b = document.querySelector('#screen [data-a="a"][data-i="0"]') || document.querySelector('#screen [data-a="c"][data-i="0"]'); if (b) b.click(); return !!b; })()`);
      if (!clicked) break;
      await sleep(STEP + 150); await grabInto(B, items, key + '#' + (i + 1));
    }
    if (key === keys[0]) { await B.click('#screen [data-a="help"]'); await grabInto(B, items, key + ' help'); }
    try { await B.ev('Lab.isOn() && Lab.endSession()'); } catch (e) { /* ended */ }
    await sleep(150); await grabInto(B, items, key + ' end');
  }
  return items;
}
const DEMO_MS = +process.env.I18N_DEMO_MS || 10000;
async function demoTour(B, lang) {
  const items = [];
  await B.go(BASE + 'staff.html?demo=' + lang + Date.now(), 'window.ST && window.StaffTools');
  await B.ev(`(function(){ try { localStorage.setItem('bellatrix-staff-lang', ${JSON.stringify(lang)}); } catch (e) {} var b = document.querySelector('[data-ui-lang="${lang}"]'); if (b) b.click(); })()`);
  await sleep(STEP);
  const ok = await B.ev(`(function(){ try { if (!window.StaffTools || !StaffTools.ui || !StaffTools.ui.enterDemo) return 'no demo API (StaffTools.ui.enterDemo)'; StaffTools.ui.demoSpeed(8); StaffTools.ui.enterDemo(); return true; } catch (e) { return String(e.message); } })()`);
  if (ok !== true) return { ok, items };
  const t0 = Date.now();
  while (Date.now() - t0 < DEMO_MS) { await sleep(1000); await grabInto(B, items, 'demo'); }
  try { await B.ev('StaffTools.ui.leaveDemo && StaffTools.ui.leaveDemo(true)'); } catch (e) { /* the page goes anyway */ }
  return { ok, items };
}
async function portalTour(B, lang, base, token) {
  const items = [];
  await B.go(base + 'portail.html?w=' + Date.now());
  await B.ev(`(function(){ localStorage.clear(); localStorage.setItem('bellatrix-portail-lang', ${JSON.stringify(lang)}); })()`);
  await B.go(base + 'portail.html?w=' + Date.now()); await sleep(STEP); await grabInto(B, items, 'welcome');
  await B.ev(`(function(){ localStorage.setItem('bellatrix-portail-token', ${JSON.stringify(token)}); localStorage.setItem('bellatrix-portail-lang', ${JSON.stringify(lang)}); })()`);
  await B.go(base + 'portail.html?h=' + Date.now()); await sleep(STEP * 2); await grabInto(B, items, 'home');
  const tabs = await B.ev(`(function(){ var o = []; [].forEach.call(document.querySelectorAll('[data-tab]'), function (b) { var t = b.getAttribute('data-tab'); if (o.indexOf(t) < 0) o.push(t); }); return o; })()`);
  for (const t of tabs) { await B.ev(`(function(){ var b = document.querySelector('.tabs [data-tab="${t}"]') || document.querySelector('[data-tab="${t}"]'); if (b) b.click(); })()`); await sleep(STEP + 150); await grabInto(B, items, t); }
  if (await B.click('[data-do="account"]', STEP + 150)) await grabInto(B, items, 'account');
  return items;
}

/* ---------------------------------------------------------------- the run ----------------------- */
let srv = null, BASE = '';
const BR = {};                          /* one Chrome per language */
async function closeAll() { await Promise.all(Object.values(BR).map((b) => b.close().catch(() => {}))); if (srv) { try { srv.closeAllConnections(); } catch (e) { /* old Node */ } srv.close(); srv = null; } }
const WATCHDOG = +process.env.I18N_WATCHDOG_MS || 170000;
const dog = setTimeout(async () => { console.log('not ok - the i18n test ran for more than ' + Math.round(WATCHDOG / 1000) + ' s: stopped'); await closeAll(); process.exit(1); }, WATCHDOG);
dog.unref();
const pageErrors = (B) => [...new Set(B.errors.splice(0).filter((e) => !/Failed to fetch|NetworkError|net::|Load failed/.test(e)))];

test.before(async () => {
  if (!CHROME) return;
  srv = await serve(); BASE = 'http://127.0.0.1:' + srv.address().port + '/';
  const bs = await Promise.all(UI.map(() => browser()));
  UI.forEach((l, i) => { BR[l] = bs[i]; });
  /* the dictionary as the three pages build it (the modules add their own texts), one page per browser */
  const parts = await Promise.all(PAGES.map(async (p, i) => {
    const B = BR[UI[i]];
    await B.go(BASE + p + '?dict=' + Date.now(), 'window.I18N'); await sleep(400);
    return { d: await B.ev('({ fr: I18N.dict.fr, de: I18N.dict.de })'), n: await B.ev(NAMES) };
  }));
  const d = { fr: {}, de: {} }, names = new Set();
  for (const x of parts) { Object.assign(d.fr, x.d.fr); Object.assign(d.de, x.d.de); x.n.forEach((n) => names.add(n)); }
  prepare(d, names);
});
test.after(async () => { await closeAll(); clearTimeout(dog); setTimeout(() => process.exit(), 2000).unref(); });

test('0. the checker itself: English is flagged, translations and names are not', () => {
  const dict = DICT || vmDict();
  const keys = KEYS || new Set(Object.keys(dict.fr));
  const val = VAL || { fr: new Set(Object.values(dict.fr)), de: new Set(Object.values(dict.de)) };
  const k = Object.keys(dict.fr).find((x) => dict.fr[x] !== x && EN_RE.test(x) && dict.de[x] && dict.de[x] !== x && dict.de[x] !== dict.fr[x] && !val.de.has(x));
  const bad = judge('fr', [[k, 'a'], [dict.fr[k], 'b'], ['Bellatrix Play', 'c'], ['Please tap here', 'd'], ['12:30', 'e'], [dict.de[k], 'f']], dict, keys, new Set(), val);
  assert.equal(bad.length, 3, bad.join(' / '));
  assert.match(bad[0], /not translated/); assert.match(bad[1], /English words/); assert.match(bad[2], /de text in the fr window/);
  assert.equal(judge('de', [[dict.de[k], 'b'], ['Im Voraus vorbereitete Listen', 'g']], dict, keys, new Set(), val).length, 0, 'German "Listen" is German');
  assert.equal(judge('en', [[k, 'a'], [dict.fr[k], 'b']], dict, keys, new Set(), val).length, 1, 'French in the English window');
});

test('1. every literal passed to ST / Lab.t / L.t / T / tr (and data-st) has a French and a German text', () => {
  const dict = DICT || vmDict();
  if (!DICT) console.log('# (no Chrome found: only js/i18n*.js is checked, not the modules\' own I18N.add)');
  const found = literals();
  const miss = [];
  for (const [k, where] of found) for (const l of LANGS) if (!has(dict[l], k)) miss.push(l + ' | ' + JSON.stringify(k) + ' | ' + [...where].slice(0, 2).join(' '));
  say('Texts without a translation', miss);
  assert.ok(found.size > 500, 'the extraction finds the texts (' + found.size + ')');
  assert.deepEqual(miss, [], miss.length + ' texts have no fr or de entry');
});

/* Runs one tour in the three languages side by side, judges, prints, asserts. */
async function inAllLanguages(title, tour, min) {
  const res = await Promise.all(UI.map(async (l) => { const items = await tour(BR[l], l); return { l, items, errors: pageErrors(BR[l]) }; }));
  const all = [];
  for (const r of res) {
    const failed = r.items.filter((x) => /^START FAILED/.test(x[0]));
    const bad = judge(r.l, r.items.filter((x) => !/^START FAILED/.test(x[0])));
    console.log('# ' + title + ' ' + r.l.toUpperCase() + ': ' + r.items.length + ' strings checked' + (r.errors.length ? ', page errors: ' + r.errors.slice(0, 3).join(' | ') : ''));
    say(title + ' ' + r.l.toUpperCase() + ': mixed language', bad);
    say(title + ' ' + r.l.toUpperCase() + ': did not start', failed.map((x) => x[1] + ': ' + x[0]));
    assert.ok(r.items.length > min, title + ' ' + r.l + ': the tour reaches the pages (' + r.items.length + ' strings)');
    all.push(...bad);
  }
  assert.deepEqual(all, [], all.length + ' strings in the wrong language');
}
test('2. the Care Team, in FR, DE and EN, shows and says one language only', { skip: !CHROME && 'no Chrome', timeout: 60000 }, () => inAllLanguages('Care Team', staffTour, 150));
test('3. the patient screen, in FR, DE and EN, shows and says one language only', { skip: !CHROME && 'no Chrome', timeout: 80000 }, () => inAllLanguages('Patient screen', patientTour, 100));
test('4. the demo, in FR, DE and EN, shows and says one language only', { skip: !CHROME && 'no Chrome', timeout: 40000 }, async (t) => {
  const res = await Promise.all(UI.map(async (l) => ({ l, r: await demoTour(BR[l], l) })));
  if (res.some((x) => x.r.ok !== true)) { t.skip('the demo did not start: ' + res.map((x) => x.l + ' ' + x.r.ok).join(', ')); return; }
  const all = [];
  for (const { l, r } of res) {
    const bad = judge(l, r.items);
    console.log('# Demo ' + l.toUpperCase() + ': ' + new Set(r.items.map((x) => x[0])).size + ' strings checked in ' + Math.round(DEMO_MS / 1000) + ' s');
    say('Demo ' + l.toUpperCase() + ': mixed language', bad);
    all.push(...bad);
  }
  assert.deepEqual(all, []);
});
test('5. the family portal, in FR, DE and EN, shows one language only', { skip: !CHROME && 'no Chrome', timeout: 60000 }, async () => {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-i18n-portal-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env: Object.assign({}, process.env, { PORTAL_DATA: data }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stderr.on('data', (b) => { log += b; });
  try {
    await new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error('the portal server did not start: ' + log)), 15000); child.stdout.on('data', (b) => { log += b; if (String(b).includes('Close this window')) { clearTimeout(t); ok(); } }); child.on('exit', (c) => { clearTimeout(t); ko(new Error('the portal server stopped: ' + c + ' ' + log)); }); });
    const base = 'http://127.0.0.1:' + port + '/', API = base + 'portal/api/';
    /* one fresh connection per call (kept-alive sockets get reset by this server between calls) */
    const call = (method, p, body, auth) => new Promise((ok, ko) => {
      const s = body ? JSON.stringify(body) : '';
      const q = http.request(API + p, { method, agent: false, headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) }, auth ? { Authorization: auth } : {}) }, (r) => {
        let t = ''; r.setEncoding('utf8'); r.on('data', (c) => { t += c; }); r.on('end', () => { let d = null; try { d = JSON.parse(t); } catch (e) { /* not JSON */ } ok({ status: r.statusCode, data: d }); });
      });
      q.on('error', (e) => ko(new Error(method + ' ' + p + ': ' + e.message + ' | server: ' + log.slice(-300))));
      q.end(s);
    });
    const KEY = crypto.randomBytes(32).toString('base64url'), R = 'Robot robot_i18n_test.' + KEY;
    assert.equal((await call('POST', 'robot/hello', { robot: 'robot_i18n_test', key: KEY })).status, 200);
    const rid = (await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R)).data.rid;
    const tokens = {};
    for (const l of UI) {
      const code = (await call('POST', 'robot/invite', { rid }, R)).data.code;
      const reg = await call('POST', 'family/register', { code, email: 'i18n-' + l + '@example.test', name: 'Sophie', lang: l, consent: true });
      assert.equal(reg.status, 200, 'a synthetic family account');
      tokens[l] = reg.data.token;
      /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation: the head validates it */
      const acc = (await call('GET', 'robot/state', undefined, R)).data.residents[0].accounts.find((a) => a.email === 'i18n-' + l + '@example.test' && a.status === 'pending');
      assert.ok(acc, 'waiting in the care team\'s list');
      assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R)).data.status, 'active');
      await call('POST', 'family/message', { text: 'Test' }, 'Bearer ' + reg.data.token);
    }
    await inAllLanguages('Family portal', (B, l) => portalTour(B, l, base, tokens[l]), 40);
  } finally {
    try { child.kill(); } catch (e) { /* gone */ }
    killTree(child.pid);
    child.stdout.destroy(); child.stderr.destroy();
    try { fs.rmSync(data, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
});
