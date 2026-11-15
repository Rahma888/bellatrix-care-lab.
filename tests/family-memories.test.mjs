// 14 Nov: (1) family messages reach the patient screen by themselves (no team validation, no manual step);
// new family ACCOUNTS still wait for the care team. (2) The care team puts the photos the family sent as
// messages into the resident's Memories album with one tap, and takes them out again.
// Run: node tests/family-memories.test.mjs
// The real robot code (js/messages.js) runs here in a small sandbox (its storage, a tiny IndexedDB, the
// album as a recorder) against the real portal server (labland/family-portal.mjs) on a free port, with
// data in a temporary folder (deleted at the end): labland/data is never touched. No browser, no sound.
// Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPortal } from '../labland/family-portal.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-memories-test-'));
const DAY = 24 * 3600 * 1000;
let clock = Date.parse('2026-11-09T10:00:00Z');
const portal = createPortal({ dataDir: path.join(TMP, 'portal'), now: () => clock, log: () => {}, rateLimit: false, noDefault: true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/portal/api/')) portal.handle(req, res, url); else { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = 'http://127.0.0.1:' + server.address().port + '/';
const BASE = ORIGIN + 'portal/api/';
async function call(method, p, body, auth) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const B = (t) => 'Bearer ' + t;
function jpeg(w, h) {
  const b = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]);
  return 'data:image/jpeg;base64,' + b.toString('base64');
}

/* ---------- the robot: js/messages.js in a sandbox ---------- */
function fakeIndexedDB() {
  const stores = {};
  return {
    open() {
      const rq = {};
      setTimeout(() => {
        rq.result = {
          createObjectStore(n) { stores[n] = stores[n] || new Map(); },
          transaction(name) {
            const tx = {}, st = stores[name], done = () => setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
            tx.objectStore = () => ({
              put(v, k) { st.set(k, v); done(); return { result: k }; },
              get(k) { done(); return { result: st.get(k) }; },
              delete(k) { st.delete(k); done(); return {}; }
            });
            return tx;
          }
        };
        if (!stores.photos && rq.onupgradeneeded) rq.onupgradeneeded();
        if (rq.onsuccess) rq.onsuccess();
      }, 0);
      return rq;
    }
  };
}
function robot() {
  const store = {}, pics = {}, calls = [];
  let n = 0;
  function Image() {
    const im = this;
    Object.defineProperty(im, 'src', { set() { im.naturalWidth = 400; im.naturalHeight = 300; setTimeout(() => im.onload && im.onload(), 0); } });
  }
  const Album = {
    add(c, o) { const id = 'pic' + (++n); pics[id] = Object.assign({ id, code: c, hidden: false }, o); calls.push(['add', c, id]); return pics[id]; },
    get(c, id) { return pics[id] && pics[id].code === c ? pics[id] : null; },
    remove(c, id) { calls.push(['remove', c, id]); delete pics[id]; return true; },
    update(c, id, f) { if (pics[id]) Object.assign(pics[id], f); }
  };
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, btoa, atob, Uint8Array,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    crypto: { getRandomValues: (a) => crypto.webcrypto.getRandomValues(a) },
    fetch: (u, o) => fetch(/^https?:/.test(u) ? u : ORIGIN + u, o),
    URL: { createObjectURL: () => 'blob:test/' + (++n), revokeObjectURL() {} },
    indexedDB: fakeIndexedDB(), Image, Album,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,/9j/TEST' }), addEventListener() {}, getElementById: () => null },
    location: { protocol: 'http:', origin: ORIGIN.replace(/\/$/, ''), pathname: '/staff.html' }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'messages.js'), 'utf8') + '\n;this.FM = FamilyMessages;', ctx);
  return { FM: ctx.FM, pics, calls, store, auth: () => 'Robot ' + ctx.FM.robotId() + '.' + store['bellatrix-portal-key'] };
}
const bot = robot(), FM = bot.FM;
const S = {};

test('a new family account waits for the care team; a family message never does', async () => {
  await FM.request('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' });
  const R = bot.auth();
  /* A relative asks for an account: pending until the team validates it. */
  const ask = await call('POST', 'family/request-access', { first: 'Sophie', last: 'Martin', relation: 'fille', phone: '', email: 'sophie@example.test', code: 'P1', resident: 'Marie', lang: 'fr', consent: true });
  assert.equal(ask.status, 200, JSON.stringify(ask.data));
  S.token = ask.data.token;
  assert.equal(ask.data.me.access, 'access-pending');
  const early = await call('POST', 'family/message', { text: 'Bonjour' }, B(S.token));
  assert.equal(early.status, 403, 'nothing can be sent before the team validated the account');
  assert.equal(early.data.error, 'access-pending');
  const st = (await call('GET', 'robot/state', undefined, R)).data;
  const acc = st.residents[0].accounts[0];
  assert.equal(acc.status, 'pending');
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active' }, R)).status, 200);
  /* From now on: a message is on the robot without anyone in the team doing anything. */
  const sent = await call('POST', 'family/message', { text: 'Bonjour Mamie, je pense à toi.' }, B(S.token));
  assert.equal(sent.status, 200);
  assert.equal(sent.data.message.status, 'sent');
  S.text = sent.data.message.id;
  assert.deepEqual((await call('GET', 'robot/state', undefined, R)).data.queue, [], 'no approval queue');
  await FM.sync();   // what the patient screen does by itself every 15 s
  assert.equal(FM.list().length, 1);
  assert.equal(FM.get(S.text).from, 'Sophie');
  assert.deepEqual(Array.from(FM.due('P1'), (m) => m.id), [S.text], 'offered to the resident');
  const me = (await call('GET', 'family/me', undefined, B(S.token))).data;
  assert.equal(me.messages[0].status, 'received', 'the family sees "received": no team step in between');
});

test('the patient screen: asks every 15 s, offers the message by itself, the open screen follows', () => {
  assert.equal(FM.settings().auto, true, 'offered by itself unless the team turns it off');
  FM.setSettings({ auto: false, from: '09:00', to: '20:00' });
  assert.equal(FM.settings().auto, false, 'the team can still turn it off');
  FM.setSettings({ auto: true, from: '09:00', to: '20:00' });
  const src = fs.readFileSync(path.join(ROOT, 'js', 'messages.js'), 'utf8');
  assert.match(src, /setInterval\(tick, 15000\)/, 'the patient screen asks the server every 15 s');
  assert.match(src, /id: 'msg-none'[^\n]*enter: watch/, 'the "no new message" screen watches for a new one');
  assert.ok(!/robot\/(approve|validate)/.test(src), 'no approval call anywhere');
});

test('a photo the family sent: the care team adds it to the Memories album with one tap, and removes it again', async () => {
  const sent = await call('POST', 'family/message', { text: 'Le jardin en fleurs', photo: jpeg(800, 600) }, B(S.token));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  S.photo = sent.data.message.id;
  await FM.sync();
  const list = FM.familyPhotos('P1');
  assert.deepEqual(Array.from(list, (m) => m.id), [S.photo], 'only the photos, only this resident');
  assert.equal(FM.familyPhotos('P2').length, 0);
  assert.equal(FM.inAlbum(S.photo), null);
  assert.equal(Object.keys(bot.pics).length, 0, 'a photo message never goes into the album by itself');
  const x = await FM.albumAdd(S.photo);
  const pic = bot.pics[x.id];
  assert.ok(pic, 'in the album');
  assert.equal(pic.code, 'P1');
  assert.equal(pic.theme, 'family');
  assert.equal(pic.addedBy, 'family', 'it carries the "Family" mark');
  assert.equal(pic.caption, 'Le jardin en fleurs');
  assert.match(pic.src, /^data:image\/jpeg;base64,/);
  assert.ok(FM.inAlbum(S.photo));
  await FM.albumAdd(S.photo);
  assert.equal(Object.keys(bot.pics).length, 1, 'a second tap adds nothing twice');
  /* Adding it to the album does not mark the message as read: the resident still gets it. */
  assert.equal(await FM.albumShown(x.id), false);
  assert.ok(FM.due('P1').some((m) => m.id === S.photo));
  assert.equal(FM.albumRemove(S.photo), true);
  assert.equal(Object.keys(bot.pics).length, 0, 'removed again');
  assert.equal(FM.inAlbum(S.photo), null);
  assert.equal(FM.albumRemove(S.photo), false);
  await assert.rejects(FM.albumAdd(S.text), /no-photo/, 'a text message has no photo to add');
});

test('the album copy leaves when the family deletes the photo, and stays when the message only got old', async () => {
  const a = await FM.albumAdd(S.photo);
  /* Removed in the album itself (Photos > Remove): it can be added again. */
  delete bot.pics[a.id];
  assert.equal(FM.inAlbum(S.photo), null);
  const b = await FM.albumAdd(S.photo);
  assert.ok(bot.pics[b.id]);
  /* The family deletes its message: gone from the album too. */
  assert.equal((await call('POST', 'family/message/delete', { id: S.photo }, B(S.token))).status, 200);
  await FM.sync();
  assert.equal(bot.pics[b.id], undefined, 'deleted by the family: removed from the album');
  assert.equal(FM.familyPhotos('P1').length, 0);
  /* Another photo, added by the team, then 31 days pass: the server deletes the message (retention),
     the album keeps the photo the team chose. */
  const sent = await call('POST', 'family/message', { text: 'Noël 1975', photo: jpeg(640, 480) }, B(S.token));
  await FM.sync();
  const c = await FM.albumAdd(sent.data.message.id);
  clock += 31 * DAY;
  portal.sweep();
  const feed = await FM.request('GET', 'robot/feed');
  assert.ok(feed.gone.includes(sent.data.message.id));
  assert.ok(feed.expired.includes(sent.data.message.id), 'the feed says it only ran out of time');
  assert.ok(!feed.expired.includes(S.photo), 'a deletion asked by the family is not "expired"');
  await FM.sync();
  assert.ok(bot.pics[c.id], 'still in the Memories album');
  assert.equal(bot.pics[c.id].caption, 'Noël 1975');
  assert.equal(FM.familyPhotos('P1').length, 0, 'the message itself is gone from the robot');
});

test('album photos the family sends for the album still go there by themselves', async () => {
  const before = Object.keys(bot.pics).length;
  const sent = await call('POST', 'family/message', { text: 'Mariage de Paul', photo: jpeg(640, 480), album: { theme: 'celebrations', date: '1978' } }, B(S.token));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  await FM.sync();
  assert.equal(Object.keys(bot.pics).length, before + 1);
  assert.equal(FM.familyPhotos('P1').length, 0, 'an album photo is not listed with the photo messages');
});

test('Care Team > Memories > Personalise: the family photos, their texts in French and German, ES5 and LF', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'album-staff.js'), 'utf8');
  /* 15 Nov (Rahma): no "Music & photos" tab; the photos are in the Memories activity's settings */
  const html = fs.readFileSync(path.join(ROOT, 'staff.html'), 'utf8');
  assert.ok(!/data-tab="contents"|id="tab-contents"|Music &amp; photos|data-st="Music & photos"/.test(html), 'no "Music & photos" tab on the head');
  const pers = html.slice(html.indexOf('<details class="more" id="persBox">'), html.indexOf('</details>', html.indexOf('id="persBox"')));
  assert.match(pers, /id="arBody" data-act-host="album reading"/, 'the photos sit inside Personalise, for Memories (and the books for Book reading)');
  assert.match(src, /addEventListener\('bellatrix-staff-act'/, 'drawn when an activity is chosen');
  assert.match(src, /d\.key === 'album'/, 'for Memories');
  assert.match(src, /StaffUI\.openActivity\('album', who\)/, 'AlbumStaff.open: Memories, opened for that resident');
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'family-visit-staff.js'), 'utf8'), /AlbumStaff\.open\(code\)/, 'the "Family photos" button of the notification');
  assert.match(src, /familyHtml\(\) \+ addHtml\(\) \+ photosHtml\(\)/, 'at the top of Photos');
  assert.match(src, /data-act="' \+ \(inn \? 'famdel' : 'famadd'\)/, 'one button: add, or remove');
  assert.match(src, /albumAdd\(mid\)/);
  assert.match(src, /albumRemove\(mid\)/);
  assert.match(src, /if \(!list\.length\) return '';/, 'nothing shown when the family sent no photo');
  const ctx = { console, navigator: { language: 'fr' } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8') + '\n;this.I18N = I18N;', ctx);
  for (const f of ['i18n-messages.js', 'i18n-album-reading.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx);
  for (const k of ['Photos from the family', 'Add to the album', 'Remove from the album', 'In the album', 'Removed from the album.', 'Added to the album.', 'No connection to the family portal.']) {
    for (const l of ['fr', 'de']) {
      const t = ctx.I18N.t(l, k);
      assert.ok(t && t !== k, l + ' text for: ' + k);
    }
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'css', 'messages.css'), 'utf8'), /\.arfamph \{[^}]*border-radius: 5px/);
  for (const f of ['js/messages.js', 'js/album-staff.js', 'js/i18n-messages.js', 'css/messages.css', 'tests/family-memories.test.mjs']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('\r'), 'LF line endings: ' + f);
  }
  for (const f of ['js/messages.js', 'js/album-staff.js']) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/=>|^\s*(let|const)\s|`/m.test(code), 'ES5 only: ' + f);
  }
});

test.after(() => {
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});
