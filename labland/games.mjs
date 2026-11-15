// "Ajouter un jeu": games the care team made themselves (with their own tools and AI, on their own
// computers) go onto the robot from a link or a file. Mounted by store-server.mjs for /games/... and /jeu.
// Plain Node, no packages. Nothing of the carer's project is ever run here: the files are only checked,
// stored and served back as static files.
//
//   GET  /jeu                     the import page (jeu.html), the short address shown under the QR code
//   POST /games/api/import        { code, url, name, for, lang }       -> { job }   (the phone or the PC)
//   POST /games/api/upload        raw .zip or .html body, X-Games-*    -> { job }
//   GET  /games/api/job?id=       { state: download|check|install|ready|error, error, detail, warn, game }
//   GET  /games/api/list          the catalogue (public: the head and the tablet read it)
//   POST /games/api/team          the head: its import code (and its key, the first time)
//   POST /games/api/update {id}   the head: download the same link again
//   POST /games/api/remove {id}   the head
//   GET  /games/<id>/<file>       the game's files: CSP (no network but its own folder, sandboxed),
//                                 the air-pointing bridge injected into every HTML page
//
// Who may do what: adding a game needs the care team's short import code (shown on the head under the
// QR code; wrong codes are rate limited). The head's own calls need its key ("Authorization: Team <key>")
// or come from this machine itself (the head of a robot that runs this server). The key is given once to
// the first head that asks (trust on first use, like the robot key of the family portal) and again to
// this machine at any time. Data: <data dir>/games/ (GAMES_DATA, or BELLATRIX_DATA/games, or
// labland/data/games): games.json, team.json and one folder per game.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(HERE, '..');
const MB = 1024 * 1024;
export const LIMITS = { download: 50 * MB, unpacked: 120 * MB, file: 50 * MB, files: 3000, ratio: 200, games: 40, seconds: 120 };
const LANGS = ['fr', 'de', 'en'];
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

export class GameError extends Error {
  constructor(code, detail) { super(code + (detail ? ': ' + detail : '')); this.code = code; this.detail = detail == null ? '' : String(detail); }
}
const fail = (code, detail) => { throw new GameError(code, detail); };
/* "memory-game.zip" -> "Memory game": the name offered for a project. */
export function prettyName(s) {
  const t = String(s || '').replace(/\.(git|zip|html?)$/i, '').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1, 40) : '';
}

/* ------------------------------------------------------------------ links ------------------------- */
/* What the carer pasted -> where to download it. Never a URL with a password in it, never a local
   address (unless the tests allow it). hosts: { codeload, gitlab } only for the tests. */
export function resolveLink(raw, hosts = {}) {
  const text = String(raw || '').trim();
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text); } catch (e) { fail('bad-link'); }
  if (!/^https?:$/.test(u.protocol) || !u.hostname || !text) fail('bad-link');
  if (u.username || u.password) fail('bad-link', 'password');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
  const codeload = (hosts.codeload || 'https://codeload.github.com').replace(/\/+$/, '');
  const branches = (first) => [...new Set([first, 'main', 'master'].filter(Boolean))];
  const pretty = prettyName;
  if (host === 'github.com' && parts.length >= 2 && !/\.zip$/i.test(u.pathname)) {
    const owner = parts[0], repo = parts[1].replace(/\.git$/i, '');
    let first = '', sub = '';
    if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) { first = parts[3]; sub = parts.slice(4).join('/'); }
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) fail('bad-link');
    return { kind: 'github', name: pretty(repo), sub, link: 'https://github.com/' + owner + '/' + repo + (first ? '/tree/' + parts.slice(3).join('/') : ''),
      tries: branches(first).map((b) => ({ branch: b, url: codeload + '/' + owner + '/' + repo + '/zip/refs/heads/' + b.split('/').map(encodeURIComponent).join('/') })) };
  }
  if ((host === 'gitlab.com' || /^gitlab\./.test(host)) && parts.length >= 2 && !/\.zip$/i.test(u.pathname)) {
    const dash = parts.indexOf('-');
    const proj = (dash > 0 ? parts.slice(0, dash) : parts).map((p) => p.replace(/\.git$/i, ''));
    let first = '', sub = '';
    if (dash > 0 && (parts[dash + 1] === 'tree' || parts[dash + 1] === 'blob') && parts[dash + 2]) { first = parts[dash + 2]; sub = parts.slice(dash + 3).join('/'); }
    if (proj.some((p) => !/^[A-Za-z0-9_.-]+$/.test(p))) fail('bad-link');
    const repo = proj[proj.length - 1];
    const base = (hosts.gitlab || (u.protocol + '//' + u.host)).replace(/\/+$/, '');
    return { kind: 'gitlab', name: pretty(repo), sub, link: u.protocol + '//' + u.host + '/' + proj.join('/') + (first ? '/-/tree/' + parts.slice(dash + 2).join('/') : ''),
      tries: branches(first).map((b) => ({ branch: b, url: base + '/' + proj.map(encodeURIComponent).join('/') + '/-/archive/' + encodeURIComponent(b) + '/' + encodeURIComponent(repo + '-' + b.replace(/\//g, '-')) + '.zip' })) };
  }
  const file = parts[parts.length - 1] || '';
  return { kind: /\.html?$/i.test(file) ? 'html' : 'zip', name: pretty(file), sub: '', link: u.href, tries: [{ branch: '', url: u.href }] };
}
function isLocalHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || /\.localhost$/.test(h) || h === '::1' || h === '0.0.0.0' || h === '::') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) { const a = +m[1], b = +m[2]; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  return /^(fc|fd|fe80)/.test(h);
}

/* One GET with a size limit, a total time limit and up to 5 redirects. -> { status, type, body } */
export function download(url, o = {}) {
  const limit = o.limit || LIMITS.download, ms = o.timeout || LIMITS.seconds * 1000, allowLocal = !!o.allowLocal;
  return new Promise((resolve, reject) => {
    let done = false, req = null;
    const timer = setTimeout(() => { finish(new GameError('timeout')); }, ms);
    function finish(err, val) { if (done) return; done = true; clearTimeout(timer); if (req) { try { req.destroy(); } catch (e) { /* gone */ } } if (err) reject(err); else resolve(val); }
    function get(href, left) {
      let u;
      try { u = new URL(href); } catch (e) { finish(new GameError('bad-link')); return; }
      if (!/^https?:$/.test(u.protocol)) { finish(new GameError('bad-link')); return; }
      if (!allowLocal && isLocalHost(u.hostname)) { finish(new GameError('local-link')); return; }
      const lib = u.protocol === 'https:' ? https : http;
      req = lib.get(u, { headers: { 'User-Agent': 'Bellatrix-games/1', Accept: '*/*' } }, (res) => {
        const st = res.statusCode || 0;
        if (st >= 300 && st < 400 && res.headers.location) {
          res.resume();
          if (left <= 0) { finish(new GameError('download-failed', 'redirects')); return; }
          get(new URL(res.headers.location, u).href, left - 1);
          return;
        }
        if (st !== 200) { res.resume(); finish(null, { status: st, type: '', body: null }); return; }
        const len = +res.headers['content-length'] || 0;
        if (len > limit) { res.resume(); finish(new GameError('too-big', Math.round(limit / MB))); return; }
        const chunks = []; let n = 0;
        res.on('data', (c) => { n += c.length; if (n > limit) { finish(new GameError('too-big', Math.round(limit / MB))); return; } chunks.push(c); });
        res.on('end', () => finish(null, { status: 200, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks) }));
        res.on('error', (e) => finish(new GameError('download-failed', e.code || e.message)));
      });
      req.on('error', (e) => finish(new GameError('download-failed', e.code || e.message)));
    }
    get(url, 5);
  });
}

/* ------------------------------------------------------------------ zip --------------------------- */
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
export function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
/* A name inside the archive -> a safe relative path, or a refusal (zip-slip). */
export function safeName(raw) {
  const n = String(raw).replace(/\\/g, '/');
  if (/[\u0000-\u001f]/.test(n) || /^\//.test(n) || /^[A-Za-z]:/.test(n)) fail('unsafe-zip', n.slice(0, 60));
  const segs = n.split('/');
  if (segs.some((s) => s === '..')) fail('unsafe-zip', n.slice(0, 60));
  return segs.filter((s) => s && s !== '.').join('/') + (n.endsWith('/') ? '/' : '');
}
/* A small zip reader: stored and deflated entries only, no encryption, no zip64. -> [{ name, data }]
   Zip bombs are refused before anything is unpacked (declared sizes, ratio) and while unpacking
   (each entry may not grow past what it declares). */
export function readZip(buf, lim = {}) {
  const L = Object.assign({}, LIMITS, lim);
  if (!Buffer.isBuffer(buf) || buf.length < 22) fail('bad-zip');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) fail('bad-zip');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xFFFF || cdOff === 0xFFFFFFFF || cdOff + cdSize > buf.length) fail('bad-zip', 'zip64');
  if (count > L.files) fail('too-many-files', L.files);
  const entries = [];
  let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) fail('bad-zip');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const attr = buf.readUInt32LE(p + 38), off = buf.readUInt32LE(p + 42);
    const rawName = buf.slice(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    p += 46 + nlen + xlen + clen;
    const name = safeName(rawName);
    if (!name || name.endsWith('/')) continue;                        /* a folder */
    if (((attr >>> 16) & 0o170000) === 0o120000) continue;           /* a symbolic link: never written */
    if (/^__MACOSX\/|(^|\/)\.DS_Store$|(^|\/)\.git\//.test(name)) continue;
    if (flags & 1) fail('bad-zip', 'password');
    if (method !== 0 && method !== 8) fail('bad-zip', 'method ' + method);
    if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) fail('bad-zip', 'zip64');
    if (usize > MB && usize > csize * L.ratio) fail('zip-bomb');
    if (usize > L.file) fail('too-big', Math.round(L.file / MB));
    total += usize;
    if (total > L.unpacked) fail(total > L.unpacked * 4 ? 'zip-bomb' : 'too-big', Math.round(L.unpacked / MB));
    entries.push({ name, method, crc, csize, usize, off });
  }
  return entries.map((e) => {
    if (e.off + 30 > buf.length || buf.readUInt32LE(e.off) !== 0x04034b50) fail('bad-zip');
    const start = e.off + 30 + buf.readUInt16LE(e.off + 26) + buf.readUInt16LE(e.off + 28);
    if (start + e.csize > buf.length) fail('bad-zip');
    const raw = buf.slice(start, start + e.csize);
    let data;
    if (e.method === 0) data = Buffer.from(raw);
    else {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.usize) }); }
      catch (err) { fail(err && err.code === 'ERR_BUFFER_TOO_LARGE' ? 'zip-bomb' : 'bad-zip'); }
    }
    if (data.length !== e.usize) fail(data.length > e.usize ? 'zip-bomb' : 'bad-zip');
    if (crc32(data) !== e.crc) fail('bad-zip', 'crc');
    return { name: e.name, data };
  });
}

/* ------------------------------------------------------------------ the game in the project ------- */
const BUILD_TOOLS = [['next', 'Next.js'], ['nuxt', 'Nuxt'], ['@angular/core', 'Angular'], ['react-scripts', 'React'], ['vite', 'Vite'], ['webpack', 'Webpack'],
  ['parcel', 'Parcel'], ['svelte', 'Svelte'], ['vue', 'Vue'], ['react', 'React'], ['typescript', 'TypeScript'], ['esbuild', 'esbuild'], ['rollup', 'Rollup']];
function buildTool(files, base) {
  const pk = files.find((f) => f.name === (base ? base + '/' : '') + 'package.json') || files.find((f) => f.name === 'package.json');
  if (!pk) return '';
  let j = {};
  try { j = JSON.parse(pk.data.toString('utf8')); } catch (e) { return ''; }
  const deps = Object.assign({}, j.dependencies, j.devDependencies);
  for (const [dep, label] of BUILD_TOOLS) if (deps && Object.prototype.hasOwnProperty.call(deps, dep)) return label;
  return j.scripts && j.scripts.build ? 'npm run build' : '';
}
/* The page of a project that only works after a build: sources the browser cannot read. */
function needsBuild(html) {
  return /<script[^>]+src=["'][^"']+\.(jsx|tsx|ts|vue|svelte)(\?[^"']*)?["']/i.test(html) || /%PUBLIC_URL%|<%=|\{\{\s*(htmlWebpackPlugin|BASE_URL)/.test(html) ||
    /<script[^>]+type=["']module["'][^>]+src=["']\/?src\//i.test(html) || /<script[^>]+src=["']\/?src\/[^"']+["'][^>]+type=["']module["']/i.test(html);
}
/* files: [{ name, data }] -> { base, entry } : the folder that holds the game and its first page. */
export function findEntry(files, sub = '') {
  let list = files.filter((f) => !/(^|\/)node_modules\//.test(f.name));
  /* a GitHub or GitLab archive: everything in one top folder (REPO-BRANCH/) */
  const tops = new Set(list.map((f) => f.name.split('/')[0]));
  let root = '';
  if (tops.size === 1 && list.every((f) => f.name.includes('/'))) root = [...tops][0];
  if (sub) root = (root ? root + '/' : '') + sub.replace(/^\/+|\/+$/g, '');
  const pre = root ? root + '/' : '';
  const inRoot = list.filter((f) => f.name.startsWith(pre)).map((f) => ({ name: f.name.slice(pre.length), data: f.data }));
  if (!inRoot.length) fail('no-index', sub || '');
  const has = (n) => inRoot.some((f) => f.name === n);
  const tool = buildTool(inRoot, '');
  const pick = (dir, entry) => {
    const f = inRoot.find((x) => x.name === (dir ? dir + '/' : '') + entry);
    if (needsBuild(f.data.toString('utf8'))) fail('needs-build', tool || 'JavaScript');
    return { base: pre + (dir ? dir + '/' : ''), entry };
  };
  /* a built folder first (the project has sources AND their built version), then the root */
  for (const d of ['dist', 'build', 'out']) if (has(d + '/index.html')) return pick(d, 'index.html');
  if (has('index.html')) return pick('', 'index.html');
  for (const d of ['public', 'docs', 'www', 'site', 'game']) if (has(d + '/index.html')) return pick(d, 'index.html');
  const topHtml = inRoot.filter((f) => /^[^/]+\.html?$/i.test(f.name));
  if (topHtml.length === 1) return pick('', topHtml[0].name);
  const subs = [...new Set(inRoot.filter((f) => /^[^/]+\/index\.html$/.test(f.name)).map((f) => f.name.split('/')[0]))];
  if (subs.length === 1) return pick(subs[0], 'index.html');
  if (tool) fail('needs-build', tool);
  const seen = [...new Set(inRoot.map((f) => f.name.split('/')[0] + (f.name.includes('/') ? '/' : '')))].sort().slice(0, 6);
  fail('no-index', seen.join(', '));
}
/* Files of the page that come from the internet: they are blocked on the robot (a warning, not a refusal). */
function internetHosts(files) {
  const out = new Set();
  for (const f of files) {
    if (!/\.(html?|css|js|mjs)$/i.test(f.name) || f.data.length > 4 * MB) continue;
    const s = f.data.toString('utf8');
    for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](?:https?:)?\/\/([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase());
    for (const m of s.matchAll(/@import\s+(?:url\()?["']?(?:https?:)?\/\/([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase());
  }
  return [...out].slice(0, 4);
}

/* ------------------------------------------------------------------ the air bridge ---------------- */
/* Injected into every HTML page of a game. In the sandbox (no same origin) the page has no storage:
   an in-memory one keeps games that use localStorage from breaking. The patient screen sends the air
   cursor: { type: 'bellatrix-air', x, y, kind: 'move' | 'click' } in the frame's CSS pixels. ES5. */
export const BRIDGE = '(function(){"use strict";' +
  'function mem(){var d={};return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},setItem:function(k,v){d[String(k)]=String(v);},removeItem:function(k){delete d[String(k)];},clear:function(){d={};},key:function(i){return Object.keys(d)[i]||null;},get length(){return Object.keys(d).length;}};}' +
  '["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x");}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true});}catch(e2){}}});' +
  'try{void document.cookie;}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return "";},set:function(){},configurable:true});}catch(e2){}}' +
  'var hov=null,st=null;' +
  'function css(){if(st||!document.head)return;st=document.createElement("style");st.textContent=".bellatrix-air-hover{outline:6px solid #00519E !important;outline-offset:3px !important;}";document.head.appendChild(st);}' +
  'function mark(el){if(hov===el)return;if(hov&&hov.classList)hov.classList.remove("bellatrix-air-hover");hov=el;if(el&&el.classList&&el.tagName!=="CANVAS")el.classList.add("bellatrix-air-hover");}' +
  'function target(el){for(var e=el;e&&e.nodeType===1;e=e.parentElement){if(/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|CANVAS|VIDEO)$/.test(e.tagName)||e.hasAttribute("onclick")||typeof e.onclick==="function"||e.getAttribute("role")==="button"||(e.hasAttribute("tabindex")&&e.tabIndex>=0))return e;try{if(window.getComputedStyle(e).cursor==="pointer")return e;}catch(x){}if(e===document.body)break;}return null;}' +
  'function fire(el,type,x,y,down){var o={bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,screenX:x,screenY:y,button:0,buttons:down?1:0,pointerId:1,pointerType:"mouse",isPrimary:true,detail:1},E;' +
  'try{E=/^pointer/.test(type)&&window.PointerEvent?new PointerEvent(type,o):new MouseEvent(type,o);}catch(e){E=document.createEvent("MouseEvents");E.initMouseEvent(type,true,true,window,1,x,y,x,y,false,false,false,false,0,null);}el.dispatchEvent(E);}' +
  'window.addEventListener("message",function(m){var d=m.data;if(!d||d.type!=="bellatrix-air"||m.source!==window.parent)return;var x=+d.x,y=+d.y;if(!isFinite(x)||!isFinite(y))return;css();' +
  'var el=x<0||y<0?null:document.elementFromPoint(x,y),t=el?target(el):null;' +
  'if(d.kind==="click"&&el){mark(null);fire(el,"pointerdown",x,y,true);fire(el,"mousedown",x,y,true);if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)){try{t.focus();}catch(e){}}fire(el,"pointerup",x,y,false);fire(el,"mouseup",x,y,false);fire(el,"click",x,y,false);}' +
  'else{if(el){fire(el,"pointermove",x,y,false);fire(el,"mousemove",x,y,false);}mark(t);}' +
  'try{window.parent.postMessage({type:"bellatrix-air-hover",on:!!t,kind:String(d.kind||"")},"*");}catch(e){}});' +
  '})();';
export function injectBridge(html) {
  const tag = '<script data-bellatrix="air">' + BRIDGE + '</script>';
  /* src="/x.js" (a build with base "/") would leave the game's folder: it becomes "./x.js" */
  html = html.replace(/(\s(?:src|href)\s*=\s*["'])\/(?!\/)/gi, '$1./');
  let m = /<head\b[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
  m = /<html\b[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
  m = /^\s*(<!doctype[^>]*>)/i.exec(html);
  if (m) return html.slice(0, m[0].length) + tag + html.slice(m[0].length);
  return tag + html;
}

/* ------------------------------------------------------------------ the catalogue and the server --- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
const rnd = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') => { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += abc[b[i] % abc.length]; return s; };
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function slug(name) { return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'jeu'; }
function sameKey(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function viaTunnel(req) { const h = req.headers || {}; return !!(h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['forwarded']); }
function loopback(req) { if (viaTunnel(req)) return false; const a = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, ''); return a === '127.0.0.1' || a === '::1'; }
function clientIp(req) { return String((req.headers && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])) || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim(); }

export function createGames(opts = {}) {
  const DIR = opts.dataDir || process.env.GAMES_DATA || (process.env.BELLATRIX_DATA ? path.join(path.resolve(process.env.BELLATRIX_DATA), 'games') : path.join(HERE, 'data', 'games'));
  let testHosts = opts.hosts || null;
  if (!testHosts && process.env.GAMES_TEST_HOSTS) { try { testHosts = JSON.parse(process.env.GAMES_TEST_HOSTS); } catch (e) { testHosts = null; } }
  const allowLocal = opts.allowLocal != null ? !!opts.allowLocal : !!testHosts;   /* local download addresses: tests only */
  const L = Object.assign({}, LIMITS, opts.limits);
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((t) => console.log(new Date().toLocaleTimeString('en-GB') + '  games: ' + t));
  const limitOn = opts.rateLimit !== false;
  const CAT = path.join(DIR, 'games.json'), TEAM = path.join(DIR, 'team.json');

  /* ---------- storage ---------- */
  function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
  function writeJson(f, v) { fs.mkdirSync(DIR, { recursive: true }); const t = f + '.' + rnd(6) + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); }
  function catalogue() { const c = readJson(CAT, null); return c && Array.isArray(c.games) ? c : { games: [] }; }
  function team() {
    let t = readJson(TEAM, null);
    if (!t || typeof t.code !== 'string' || !/^[A-Z0-9]{6}$/.test(t.code) || typeof t.key !== 'string') {
      t = { code: rnd(6, CODE_ABC), key: rnd(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), claimed: false, created: new Date(now()).toISOString() };
      writeJson(TEAM, t);
    }
    return t;
  }
  const gameDir = (id) => path.join(DIR, id);
  function publicGame(g) { return { id: g.id, name: g.name, lang: g.lang, for: g.for || '', source: String(g.source || '').replace(/[?#].*$/, ''), kind: g.kind, branch: g.branch || '', date: g.date, updated: g.updated || g.date, size: g.size, files: g.files, entry: g.entry, status: g.status, warn: g.warn || [] }; }

  /* ---------- rate limit (per address, 10 minutes) ---------- */
  const hits = new Map();
  function bump(req, what) {
    if (!limitOn) return 0;
    const k = what + '|' + clientIp(req), t = now();
    let h = hits.get(k);
    if (!h || t > h.reset) { h = { n: 0, reset: t + 10 * 60 * 1000 }; hits.set(k, h); }
    h.n++;
    if (hits.size > 5000) hits.clear();
    return h.n;
  }
  function count(req, what) { const h = limitOn && hits.get(what + '|' + clientIp(req)); return h && now() <= h.reset ? h.n : 0; }
  function isHead(req) {
    const m = /^Team\s+([A-Za-z0-9]{20,64})$/.exec(String((req.headers || {}).authorization || ''));
    return loopback(req) || !!(m && sameKey(m[1], team().key));
  }

  /* ---------- jobs: one import from the start to "ready" (memory, an hour) ---------- */
  const jobs = new Map();
  function newJob(kind) {
    for (const [k, j] of jobs) if (now() - j.at > 3600 * 1000) jobs.delete(k);
    const j = { id: rnd(16), at: now(), state: 'download', step: '', kind, error: '', detail: '', warn: [], game: null };
    jobs.set(j.id, j);
    return j;
  }
  function jobOut(j) { return { id: j.id, state: j.state, step: j.step, error: j.error, detail: j.detail, warn: j.warn, game: j.game ? publicGame(j.game) : null }; }
  let busy = Promise.resolve();
  function run(job, work) {
    /* one install at a time: the catalogue is written by one job only */
    busy = busy.then(() => work(job)).catch((e) => {
      job.step = job.state;   /* where it stopped: download, check or install */
      job.state = 'error';
      job.error = e instanceof GameError ? e.code : 'server';
      job.detail = e instanceof GameError ? e.detail : '';
      if (!(e instanceof GameError)) console.error(e);
      log('import failed: ' + job.error + (job.detail ? ' (' + job.detail + ')' : ''));
    });
    return job;
  }

  /* ---------- the steps ---------- */
  async function fetchSource(src) {
    let last = null;
    const tried = [];
    for (const t of src.tries) {
      const r = await download(t.url, { limit: L.download, timeout: L.seconds * 1000, allowLocal });
      if (r.status === 200) return { body: r.body, type: r.type, branch: t.branch };
      tried.push(t.branch || String(r.status));
      last = r.status;
    }
    fail(last === 404 || last === 403 || last === 410 ? 'not-found' : 'download-failed', src.kind === 'github' || src.kind === 'gitlab' ? tried.join(', ') : String(last));
  }
  function unpack(body, fileName, kindHint) {
    if (!body || !body.length) fail('not-a-game');
    if (body.readUInt32LE(0) === 0x04034b50 || body.readUInt32LE(0) === 0x06054b50) return readZip(body, L);
    const head = body.slice(0, 512).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
    const looksHtml = head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<meta') || head.startsWith('<script') || head.startsWith('<body') || head.startsWith('<!--');
    if (looksHtml && (kindHint === 'html' || /\.html?$/i.test(fileName || ''))) {
      if (body.length > L.file) fail('too-big', Math.round(L.file / MB));
      return [{ name: 'index.html', data: body }];
    }
    if (looksHtml) fail('web-page');
    fail('not-a-game');
  }
  function install(job, files, meta, old) {
    job.state = 'check';
    const where = findEntry(files, meta.sub || '');
    const mine = files.filter((f) => f.name.startsWith(where.base)).map((f) => ({ name: f.name.slice(where.base.length), data: f.data }))
      .filter((f) => f.name && !/(^|\/)node_modules\//.test(f.name) && !/(^|\/)\.git\//.test(f.name));
    if (mine.length > L.files) fail('too-many-files', L.files);
    const size = mine.reduce((n, f) => n + f.data.length, 0);
    if (size > L.unpacked) fail('too-big', Math.round(L.unpacked / MB));
    const warn = internetHosts(mine);
    job.state = 'install';
    const cat = catalogue();
    /* The same game sent twice (same link, or same file name and game name) replaces the first copy instead of
       adding a duplicate to the head's list (Rahma, 15 Nov). */
    if (!old) {
      const norm = (s) => String(s || '').trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
      old = cat.games.find((x) => meta.kind === 'file'
        ? x.kind === 'file' && norm(x.source) === norm(meta.source) && norm(x.name) === norm(meta.name)
        : x.kind !== 'file' && norm(x.source) && norm(x.source) === norm(meta.source) && (x.sub || '') === (meta.sub || '')) || null;
    }
    if (!old && cat.games.length >= L.games) fail('full', L.games);
    const id = old ? old.id : slug(meta.name) + '-' + rnd(4);
    const tmp = path.join(DIR, '.tmp-' + id + '-' + rnd(4));
    fs.mkdirSync(tmp, { recursive: true });
    try {
      for (const f of mine) {
        const full = path.join(tmp, ...f.name.split('/'));
        if (!full.startsWith(tmp + path.sep)) fail('unsafe-zip', f.name.slice(0, 60));
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, f.data);
      }
      const dest = gameDir(id), prev = dest + '.old-' + rnd(4);
      if (fs.existsSync(dest)) fs.renameSync(dest, prev);
      fs.renameSync(tmp, dest);
      if (fs.existsSync(prev)) fs.rmSync(prev, { recursive: true, force: true });
    } catch (e) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) { /* gone */ }
      throw e;
    }
    const stamp = new Date(now()).toISOString();
    const g = Object.assign({}, old || {}, { id, name: meta.name, lang: meta.lang, for: meta.for, source: meta.source, kind: meta.kind, branch: meta.branch || '',
      sub: meta.sub || '', date: old ? old.date : stamp, updated: stamp, size, files: mine.length, entry: where.entry, status: 'ready', warn });
    const c2 = catalogue();
    c2.games = c2.games.filter((x) => x.id !== id);
    c2.games.push(g);
    writeJson(CAT, c2);
    job.game = g; job.warn = warn; job.state = 'ready';
    log((old ? 'updated ' : 'added ') + JSON.stringify(g.name) + ' (' + id + ', ' + g.files + ' files, ' + Math.round(size / 1024) + ' KB) from ' + (meta.kind === 'file' ? 'a file' : meta.source));
    return g;
  }
  function metaOf(body, guess) {
    const lang = LANGS.includes(String(body.lang)) ? String(body.lang) : 'fr';
    return { name: str(body.name, 40) || guess || 'Jeu', lang, for: str(body.for, 40) };
  }
  function fromLink(job, link, meta, old) {
    return run(job, async () => {
      const src = resolveLink(link, testHosts || {});
      const got = await fetchSource(src);
      const files = unpack(got.body, src.kind === 'html' ? 'index.html' : '', src.kind);
      install(job, files, Object.assign({}, meta, { source: src.link, kind: src.kind, branch: got.branch, sub: src.sub }), old);
    });
  }

  /* ---------- the API ---------- */
  async function api(req, url, body, raw) {
    const p = url.pathname.slice('/games/api/'.length);
    if (p === 'list' && req.method === 'GET') {
      /* "for whom" and the link stay with the head: the tablet only needs the game */
      const head = isHead(req);
      return [200, { games: catalogue().games.filter((g) => g.status === 'ready').map((g) => { const o = publicGame(g); if (!head) { o.for = ''; o.source = ''; } return o; }) }];
    }
    if (p === 'job' && req.method === 'GET') {
      const j = jobs.get(String(url.searchParams.get('id') || ''));
      return j ? [200, jobOut(j)] : [404, { error: 'unknown-job' }];
    }
    if (req.method !== 'POST') return [405, { error: 'POST only' }];
    if (p === 'import' || p === 'upload') {
      if (count(req, 'code') >= 10 || bump(req, 'import') > 30) return [429, { error: 'slow-down' }];
      const code = String((p === 'upload' ? (req.headers['x-games-code'] || '') : body.code) || '').replace(/\s+/g, '').toUpperCase();
      if (!code || !sameKey(code, team().code)) { bump(req, 'code'); return [403, { error: 'bad-code' }]; }
      if (p === 'import') {
        let src;
        try { src = resolveLink(body.url, testHosts || {}); } catch (e) { return [400, { error: e.code || 'bad-link', detail: e.detail || '' }]; }
        const job = fromLink(newJob('link'), body.url, metaOf(body, src.name), null);
        return [200, { job: job.id }];
      }
      const dec = (h) => { try { return decodeURIComponent(String(req.headers[h] || '')); } catch (e) { return ''; } };
      const fileName = str(dec('x-games-file'), 120);
      const meta = metaOf({ name: dec('x-games-name'), for: dec('x-games-for'), lang: dec('x-games-lang') }, prettyName(fileName.split(/[\/]/).pop()));
      const job = run(newJob('file'), async (j) => {
        j.state = 'check';
        const files = unpack(raw, fileName, /\.html?$/i.test(fileName) ? 'html' : 'zip');
        install(j, files, Object.assign({}, meta, { source: fileName || 'file', kind: 'file' }), null);
      });
      return [200, { job: job.id }];
    }
    if (p === 'team') {
      if (bump(req, 'team') > 60) return [429, { error: 'slow-down' }];
      const t = team(), head = isHead(req);
      if (!head && (t.claimed || viaTunnel(req))) return [403, { error: 'not-the-head' }];
      if (!head) { t.claimed = true; writeJson(TEAM, t); }   /* the first head that asks (trust on first use) */
      return [200, { code: t.code, key: t.key, addresses: addresses(req) }];
    }
    if (!isHead(req)) return [403, { error: 'not-the-head' }];
    const cat = catalogue(), g = cat.games.find((x) => x.id === String(body.id || ''));
    if (p === 'remove') {
      if (!g) return [404, { error: 'unknown-game' }];
      cat.games = cat.games.filter((x) => x.id !== g.id);
      writeJson(CAT, cat);
      try { fs.rmSync(gameDir(g.id), { recursive: true, force: true }); } catch (e) { /* gone */ }
      log('removed ' + JSON.stringify(g.name) + ' (' + g.id + ')');
      return [200, { ok: true }];
    }
    if (p === 'update') {
      if (!g) return [404, { error: 'unknown-game' }];
      if (g.kind === 'file') return [400, { error: 'no-source' }];
      const link = g.source;
      const job = fromLink(newJob('update'), link, { name: g.name, lang: g.lang, for: g.for || '' }, g);
      return [200, { job: job.id }];
    }
    return [404, { error: 'not found' }];
  }
  /* The addresses a phone on the same Wi-Fi can open, when this server listens on the network. */
  function addresses(req) {
    try {
      const a = req.socket.server.address();
      if (!a || !(a.address === '0.0.0.0' || a.address === '::')) return [];
      const out = [];
      for (const list of Object.values(os.networkInterfaces())) for (const x of list || []) if (x.family === 'IPv4' && !x.internal) out.push('http://' + x.address + ':' + a.port);
      return out;
    } catch (e) { return []; }
  }

  /* ---------- the files of a game ---------- */
  function csp(req, id) {
    const host = /^[A-Za-z0-9.\-]+(:\d+)?$|^\[[0-9a-fA-F:.]+\](:\d+)?$/.test(String(req.headers.host || '')) ? req.headers.host : '';
    const own = host ? 'http://' + host + '/games/' + id + '/' : "'self'";
    return ['sandbox allow-scripts', 'default-src ' + own + ' data: blob:', 'script-src ' + own + " 'unsafe-inline' 'unsafe-eval' blob:", 'style-src ' + own + " 'unsafe-inline' data:",
      'img-src ' + own + ' data: blob:', 'media-src ' + own + ' data: blob:', 'font-src ' + own + ' data:', 'connect-src ' + own + ' data: blob:', 'worker-src ' + own + ' blob:',
      "frame-src 'none'", "object-src 'none'", "form-action 'none'", 'base-uri ' + own].join('; ');
  }
  function serveFile(req, res, url) {
    const rest = url.pathname.slice('/games/'.length), slash = rest.indexOf('/');
    const id = slash < 0 ? rest : rest.slice(0, slash);
    if (slash < 0 && ID_RE.test(id)) { res.writeHead(301, { Location: '/games/' + id + '/' }); res.end(); return; }
    const g = ID_RE.test(id) ? catalogue().games.find((x) => x.id === id && x.status === 'ready') : null;
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; sandbox" }); res.end('Not found'); };
    if (!g || (req.method !== 'GET' && req.method !== 'HEAD')) { notFound(); return; }
    let rel;
    try { rel = rest.slice(slash + 1).split('/').map((s) => decodeURIComponent(s)); } catch (e) { notFound(); return; }
    if (rel.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) { notFound(); return; }
    const dir = gameDir(id);
    let full = path.join(dir, ...rel.filter(Boolean));
    if (full !== dir && !full.startsWith(dir + path.sep)) { notFound(); return; }
    try { if (fs.statSync(full).isDirectory()) full = path.join(full, full === dir ? g.entry : 'index.html'); } catch (e) { notFound(); return; }
    fs.readFile(full, (err, buf) => {
      if (err) { notFound(); return; }
      const ext = path.extname(full).toLowerCase(), type = TYPES[ext] || 'application/octet-stream';
      if (/^text\/html/.test(type)) buf = Buffer.from(injectBridge(buf.toString('utf8')), 'utf8');
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Content-Security-Policy': csp(req, id), 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  /* ---------- the entry point: store-server.mjs hands over /games/... and /jeu ---------- */
  function json(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  }
  function handle(req, res, url) {
    if (url.pathname === '/jeu/') { res.writeHead(301, { Location: '/jeu' }); res.end(); return true; }   /* the page's files are relative to / */
    if (url.pathname === '/jeu') {
      fs.readFile(path.join(APP_DIR, 'jeu.html'), (err, buf) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
        res.end(buf);
      });
      return true;
    }
    if (!url.pathname.startsWith('/games/')) return false;
    if (!url.pathname.startsWith('/games/api/')) { serveFile(req, res, url); return true; }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Games-Code, X-Games-Name, X-Games-For, X-Games-Lang, X-Games-File', 'Access-Control-Max-Age': '600' });
      res.end();
      return true;
    }
    const isUpload = url.pathname === '/games/api/upload' && req.method === 'POST';
    const max = isUpload ? L.download : 65536;
    const chunks = []; let n = 0, tooBig = false;
    req.on('data', (c) => { if (tooBig) return; n += c.length; if (n > max) { tooBig = true; chunks.length = 0; return; } chunks.push(c); });
    req.on('end', () => {
      if (tooBig) { json(res, 413, { error: 'too-big', detail: String(Math.round(max / MB) || 1) }); return; }
      const raw = Buffer.concat(chunks);
      let body = {};
      if (!isUpload && raw.length) { try { body = JSON.parse(raw.toString('utf8')) || {}; } catch (e) { json(res, 400, { error: 'bad JSON' }); return; } }
      Promise.resolve().then(() => api(req, url, body, raw)).then((out) => { if (!res.headersSent) json(res, out[0], out[1]); })
        .catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server' }); });
    });
    return true;
  }
  return { handle, api, catalogue, team, jobs, dir: DIR, whenIdle: () => busy };
}

/* The shared instance store-server.mjs uses (data: GAMES_DATA, BELLATRIX_DATA/games or labland/data/games). */
let shared = null;
export function gamesApi(req, res, url) { if (!shared) shared = createGames(); return shared.handle(req, res, url); }
