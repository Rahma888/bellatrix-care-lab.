// Family portal 1.16 (agent F2): the resident's follow-up (labland/family-feed.mjs, js/family-sync.js).
// Run: node tests/feed.test.mjs
// Everything runs on a free port with data in a temporary folder (deleted at the end); labland/data is
// never touched. Synthetic data only, a fixed clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPortal, setNotifier } from '../labland/family-portal.mjs';
import { configureFeed, sweepFeed } from '../labland/family-feed.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 3600 * 1000;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-feed-test-'));
let clock = Date.parse('2026-11-10T15:00:00Z');
const portal = createPortal({ dataDir: path.join(TMP, 'portal'), now: () => clock, log: () => {}, rateLimit: false });
configureFeed({ now: () => clock, keepDays: 30, log: () => {} });
const told = [];
setNotifier((pid, ev) => { told.push({ pid, ev }); });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/portal/api/')) portal.handle(req, res, url);
  else { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port + '/portal/api/';

async function call(method, p, body, auth, extra) {
  const headers = Object.assign({}, extra || {});
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = r.headers.get('content-type') || '';
  const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, type };
}
const robotAuth = () => { const id = 'robot_' + crypto.randomBytes(9).toString('base64url'), key = crypto.randomBytes(32).toString('base64url'); return { id, key, h: 'Robot ' + id + '.' + key }; };
const R1 = robotAuth(), R2 = robotAuth();
const B = (t) => 'Bearer ' + t;
const X = (rid) => ({ 'X-Resident': rid });
const S = {};
const iso = (t) => new Date(t).toISOString();
const dayOf = (t) => iso(t).slice(0, 10);
function jpeg(w, h, pad) {
  const b = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]);
  return Buffer.concat([b, Buffer.alloc(pad || 0, 0x20)]);
}
function session(cid, code, start, mins, extra) {
  return Object.assign({ cid, code, kind: 'session', activity: 'pairs', start: iso(start), end: iso(start + mins * 60000), dur: mins * 60, day: dayOf(start), outcome: 'completed' }, extra || {});
}
function listen(cid, code, start, secs, type, title, artist) {
  return { cid, code, kind: 'listen', type, title, artist: artist || '', start: iso(start), end: iso(start + secs * 1000), dur: secs, day: dayOf(start) };
}
async function register(code, email, name) {
  const inv = await call('POST', 'robot/invite', { rid: S[code] }, R1.h);
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  const reg = await call('POST', 'family/register', { code: inv.data.code, email, name, lang: 'fr', consent: true });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  /* 14 Nov: every new family account waits for the care team's one tap, also with an invitation:
     the head finds it in its pending list and validates it, as js/messages-staff.js does. */
  const acc = (await call('GET', 'robot/state', undefined, R1.h)).data.residents.find((r) => r.rid === S[code]).accounts.find((a) => a.email === email && a.status === 'pending');
  assert.ok(acc, 'waiting in the care team\'s list: ' + email);
  const n = told.length;
  assert.equal((await call('POST', 'robot/account/status', { account: acc.id, status: 'active', staff: 'AB' }, R1.h)).data.status, 'active');
  assert.ok(told.slice(n).some((x) => x.ev.type === 'access'), 'the relative is told the access is open');
  told.length = n;   // that notice is the setup's, not a feed event: the checks below count feed events only
  return reg.data.token;
}
const consent = (code, level) => call('POST', 'robot/resident/consent', { rid: S[code], level, by: 'resident' }, R1.h);

test('setup: a robot, two residents, one relative each', async () => {
  for (const r of [R1, R2]) assert.equal((await call('POST', 'robot/hello', { robot: r.id, key: r.key })).status, 200);
  S.P1 = (await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R1.h)).data.rid;
  S.P2 = (await call('POST', 'robot/resident', { code: 'P2', label: 'Jean', lang: 'de' }, R1.h)).data.rid;
  assert.ok(S.P1 && S.P2);
  S.sophie = await register('P1', 'sophie@example.test', 'Sophie');
  S.paul = await register('P2', 'paul@example.test', 'Paul');
  assert.equal((await call('GET', 'feed/robot/consent')).status, 401, 'the robot key is needed');
  assert.equal((await call('GET', 'feed/family/day')).status, 401, 'a relative must be signed in');
});

test('no consent recorded: nothing is taken, nothing is shown (BF-27)', async () => {
  const c = await call('GET', 'feed/robot/consent', undefined, R1.h);
  assert.equal(c.status, 200);
  assert.deepEqual(c.data.residents.map((r) => [r.code, r.consent]).sort(), [['P1', null], ['P2', null]]);
  const up = await call('POST', 'feed/robot/upload', { items: [session('S1', 'P1', clock - 3600000, 10)] }, R1.h);
  assert.equal(up.status, 200);
  assert.deepEqual(up.data.accepted, []);
  assert.equal(up.data.refused[0].why, 'consent');
  const d = await call('GET', 'feed/family/day', undefined, B(S.sophie));
  assert.equal(d.status, 403);
  assert.equal(d.data.error, 'consent');
});

test('upload -> feed: an activity finished on the robot appears with time, length and result (BF-05)', async () => {
  assert.equal((await consent('P1', 'all')).status, 200);
  const t = clock - 2 * 3600000;
  const items = [
    session('S-chess', 'P1', t, 25, { activity: 'chess', result: { k: 'chess', v: 'win', n: 31 }, part: { again: 'yes', acts: 40 } }),
    session('S-play', 'P1', t + 3600000, 20, { activity: 'play', result: { k: 'play', n: 3 }, part: { acts: 9 } }),
    listen('S-play:m0', 'P1', t + 3600000, 190, 'music', 'La vie en rose', 'Édith Piaf'),
    listen('S-play:m1', 'P1', t + 3600000 + 200000, 240, 'music', 'Hymne à l\'amour', 'Édith Piaf'),
    listen('L-pod', 'P1', t + 3600000 + 500000, 600, 'podcast', 'Les Odyssées', 'France Inter'),
    { cid: 'bad', code: 'P1', kind: 'session', activity: 'Hack Me!', start: iso(t), dur: 60 },
    session('S-other', 'P9', t, 5)
  ];
  const up = await call('POST', 'feed/robot/upload', { items }, R1.h);
  assert.equal(up.status, 200);
  assert.deepEqual(up.data.accepted.sort(), ['L-pod', 'S-chess', 'S-play', 'S-play:m0', 'S-play:m1']);
  assert.deepEqual(up.data.refused.map((x) => x.why).sort(), ['bad-activity', 'unknown-resident']);
  const again = await call('POST', 'feed/robot/upload', { items: [items[0]] }, R1.h);
  assert.deepEqual(again.data.accepted, ['S-chess'], 'sent twice (offline retry): kept once');

  const d = await call('GET', 'feed/family/day?day=' + dayOf(t), undefined, B(S.sophie));
  assert.equal(d.status, 200);
  assert.equal(d.data.items.length, 2);
  const chess = d.data.items.find((x) => x.activity === 'chess');
  assert.equal(chess.start, iso(t));
  assert.equal(chess.dur, 25 * 60);
  assert.deepEqual(chess.result, { k: 'chess', v: 'win', n: 31 });
  assert.equal(d.data.summary.count, 2);
  assert.equal(d.data.summary.minutes, 45);
  assert.equal(d.data.summary.games.won, 1);
  assert.equal(d.data.listens.length, 3);
  assert.ok(!JSON.stringify(d.data).includes(R1.id), 'the robot id never reaches the family');
  assert.equal(d.data.part.completed, 2);

  const days = await call('GET', 'feed/family/days', undefined, B(S.sophie));
  assert.equal(days.data.days[0].day, dayOf(t));
  assert.equal(days.data.days[0].count, 2);
  const other = await call('GET', 'feed/family/day?day=2026-11-01', undefined, B(S.sophie));
  assert.equal(other.data.items.length, 0, 'history by date: another day is empty');

  /* the live feed: only what arrived since */
  const since = iso(clock);
  clock += 60000;
  await call('POST', 'feed/robot/upload', { items: [session('S-song', 'P1', clock - 600000, 8, { activity: 'song', result: { k: 'songs', n: 4 } })] }, R1.h);
  const live = await call('GET', 'feed/family/live?since=' + encodeURIComponent(since), undefined, B(S.sophie));
  assert.deepEqual(live.data.items.map((x) => x.activity), ['song']);
});

test('detailed listening: title, type, start and length (BF-06)', async () => {
  const l = await call('GET', 'feed/family/listening?day=' + dayOf(clock) + '&days=7', undefined, B(S.sophie));
  assert.equal(l.status, 200);
  assert.equal(l.data.items.length, 3);
  const pod = l.data.items.find((x) => x.type === 'podcast');
  assert.equal(pod.title, 'Les Odyssées');
  assert.equal(pod.dur, 600);
  assert.ok(pod.start);
  assert.equal(l.data.totals.music.count, 2);
  assert.equal(l.data.totals.podcast.minutes, 10);
  const bad = await call('POST', 'feed/robot/upload', { items: [listen('x1', 'P1', clock - 60000, 30, 'video', 'Nope')] }, R1.h);
  assert.equal(bad.data.refused[0].why, 'bad-type');
});

test('a relative not linked gets 403, also by direct access (BF-03)', async () => {
  const mine = await call('GET', 'feed/family/day', undefined, B(S.sophie), X(S.P1));
  assert.equal(mine.status, 200);
  const notMine = await call('GET', 'feed/family/day', undefined, B(S.sophie), X(S.P2));
  assert.equal(notMine.status, 403);
  assert.equal(notMine.data.error, 'not-linked');
  for (const p of ['day', 'days', 'listening', 'summary', 'moments', 'live', 'participation']) {
    const r = await call('GET', 'feed/family/' + p, undefined, B(S.paul), X(S.P1));
    assert.equal(r.status, 403, p);
    assert.ok(!JSON.stringify(r.data).includes('chess'), p);
  }
  const q = await call('GET', 'feed/family/day?r=' + S.P1, undefined, B(S.paul));
  assert.equal(q.status, 403, 'the resident in the query string is checked too');
  /* Paul's own resident has no consent: still nothing */
  assert.equal((await call('GET', 'feed/family/day', undefined, B(S.paul))).data.error, 'consent');
  /* another robot cannot write for this robot's residents */
  const r2 = await call('POST', 'feed/robot/upload', { items: [session('evil', 'P1', clock - 60000, 1)] }, R2.h);
  assert.equal(r2.data.refused[0].why, 'unknown-resident');
  assert.equal((await call('GET', 'feed/robot/moments?code=P1', undefined, R2.h)).status, 404);
  assert.equal((await call('GET', 'feed/family/day', undefined, 'Bearer ' + crypto.randomBytes(32).toString('base64url'))).status, 403);
});

test('consent levels: all / messages_album / none / none recorded (BF-27)', async () => {
  const get = () => call('GET', 'feed/family/summary', undefined, B(S.sophie));
  assert.equal((await get()).status, 200);
  await consent('P1', 'messages_album');
  let r = await get();
  assert.equal(r.status, 403, 'lowered: at the next request');
  assert.equal(r.data.level, 'messages_album');
  assert.equal((await call('POST', 'feed/robot/upload', { items: [session('S-x', 'P1', clock - 60000, 3)] }, R1.h)).data.refused[0].why, 'consent');
  assert.equal((await call('GET', 'feed/robot/consent', undefined, R1.h)).data.residents.find((x) => x.code === 'P1').consent, 'messages_album');
  await consent('P1', 'all');
  r = await get();
  assert.equal(r.status, 200);
  assert.ok(r.data.week.count >= 3, 'messages_album keeps the follow-up hidden, not deleted');
  /* 'none': hidden at once, and deleted at the next sweep */
  await consent('P1', 'none');
  assert.equal((await get()).status, 403);
  const d = sweepFeed(portal);
  assert.equal((d.items[S.P1] || []).length, 0, 'none: the follow-up of P1 is deleted');
  await consent('P1', 'all');
  assert.equal((await call('GET', 'feed/family/day', undefined, B(S.sophie))).data.items.length, 0);
  /* no consent recorded at all */
  await call('POST', 'robot/resident/consent', { rid: S.P1, level: null }, R1.h);
  assert.equal((await get()).data.error, 'consent');
  await consent('P1', 'all');
});

test('summaries: the day and the last 7 days, with the trend against the 7 days before (BF-08)', async () => {
  const today = Date.parse('2026-11-10T09:00:00Z');
  const items = [];
  /* the 7 days before (Oct 28 - Nov 3): 2 sessions of 10 min */
  items.push(session('W0-a', 'P1', Date.parse('2026-10-29T10:00:00Z'), 10), session('W0-b', 'P1', Date.parse('2026-11-02T10:00:00Z'), 10));
  /* the last 7 days (Nov 4 - Nov 10): 4 sessions, 60 min, and 15 min of music */
  items.push(session('W1-a', 'P1', Date.parse('2026-11-05T10:00:00Z'), 15), session('W1-b', 'P1', Date.parse('2026-11-07T10:00:00Z'), 15, { activity: 'karaoke' }),
    session('W1-c', 'P1', today, 20, { activity: 'chess', result: { k: 'chess', v: 'loss' }, mood: { before: 2, after: 3 } }), session('W1-d', 'P1', today + 3600000, 10, { outcome: 'stopped' }));
  items.push(listen('W1-l', 'P1', today, 900, 'karaoke', 'Ah ! Les crocodiles'));
  const up = await call('POST', 'feed/robot/upload', { items }, R1.h);
  assert.equal(up.data.accepted.length, items.length, JSON.stringify(up.data.refused));
  const s = await call('GET', 'feed/family/summary?day=2026-11-10', undefined, B(S.sophie));
  assert.equal(s.status, 200);
  assert.equal(s.data.today.count, 2);
  assert.equal(s.data.today.minutes, 30);
  assert.equal(s.data.week.count, 4);
  assert.equal(s.data.week.minutes, 60);
  assert.equal(s.data.prev.count, 2);
  assert.equal(s.data.prev.minutes, 20);
  assert.equal(s.data.trend.count, 2);
  assert.equal(s.data.trend.countPct, 100);
  assert.equal(s.data.trend.minutes, 40);
  assert.equal(s.data.trend.minutesPct, 200);
  assert.equal(s.data.trend.hasPrev, true);
  assert.equal(s.data.perDay.length, 7);
  assert.equal(s.data.perDay[6].day, '2026-11-10');
  assert.equal(s.data.perDay[6].minutes, 30);
  assert.equal(s.data.prevPerDay[1].minutes, 10);
  assert.equal(s.data.week.listenMinutes, 15);
  assert.equal(s.data.top[0].activity, 'pairs');
  assert.equal(s.data.part.started, 4);
  assert.equal(s.data.part.completed, 3);
  /* no mood at all in the family portal (Rahma, 10 Nov), even when a robot still sends one */
  assert.ok(!/mood/i.test(JSON.stringify(s.data)), 'no mood in the summary');
  const day = await call('GET', 'feed/family/day?day=2026-11-10', undefined, B(S.sophie));
  assert.ok(!/mood/i.test(JSON.stringify(day.data)), 'no mood in the feed');
  const m = await call('GET', 'feed/family/participation?day=2026-11-10', undefined, B(S.sophie));
  assert.equal(m.data.part.started, 4);
  const empty = await call('GET', 'feed/family/participation?day=2026-10-01', undefined, B(S.sophie));
  assert.equal(empty.data.part, null, 'BF-07: no data, nothing to show');
});

test('important events and moments shared by the team (BF-09)', async () => {
  const before = told.length;
  /* the first karaoke (in the summary step) became a moment and told Sophie */
  let ms = await call('GET', 'feed/family/moments', undefined, B(S.sophie));
  assert.ok(ms.data.items.some((m) => m.event === 'first-karaoke'));
  /* a birthday greeting, a first game won (the loss above was not one) */
  const t = clock - 1800000;
  await call('POST', 'feed/robot/upload', { items: [session('B-1', 'P1', t, 5, { activity: 'hello', marks: ['birthday'] }), session('B-2', 'P1', t + 400000, 9, { activity: 'ludo', result: { k: 'ludo', v: 'win', n: 2 } }),
    session('B-3', 'P1', t + 900000, 9, { activity: 'ludo', result: { k: 'ludo', v: 'win', n: 2 } })] }, R1.h);
  ms = await call('GET', 'feed/family/moments', undefined, B(S.sophie));
  assert.equal(ms.data.items.filter((m) => m.event === 'first-win').length, 1, 'the first win only');
  assert.equal(ms.data.items.filter((m) => m.event === 'birthday').length, 1);
  assert.equal(told.length - before, 2);
  assert.ok(told.every((x) => x.ev.rid === S.P1 && x.ev.body && x.ev.body.fr));

  /* a team photo, in parts (bodies are read up to 64 KB) */
  const img = jpeg(1200, 900, 70000).toString('base64');
  const parts = [img.slice(0, 50000), img.slice(50000)];
  const st = await call('POST', 'feed/robot/moment', { code: 'P1', text: 'Atelier jardin avec Marie', parts: parts.length }, R1.h);
  assert.equal(st.status, 200);
  assert.equal(st.data.done, false);
  assert.equal((await call('POST', 'feed/robot/moment/part', { id: st.data.id, i: 0, data: parts[0] }, R1.h)).data.done, false);
  assert.equal((await call('POST', 'feed/robot/moment/part', { id: st.data.id, i: 1, data: parts[1] }, R2.h)).status, 404, 'another robot cannot finish it');
  const fin = await call('POST', 'feed/robot/moment/part', { id: st.data.id, i: 1, data: parts[1] }, R1.h);
  assert.equal(fin.data.done, true);
  ms = await call('GET', 'feed/family/moments', undefined, B(S.sophie));
  const pic = ms.data.items.find((m) => m.id === st.data.id);
  assert.equal(pic.text, 'Atelier jardin avec Marie');
  assert.equal(pic.hasPhoto, true);
  assert.equal(pic.w, 1200);
  const ph = await call('GET', 'feed/family/photo?id=' + st.data.id, undefined, B(S.sophie));
  assert.equal(ph.type, 'image/jpeg');
  assert.equal(ph.data[0], 0xFF);
  assert.equal((await call('GET', 'feed/family/photo?id=' + st.data.id, undefined, B(S.paul), X(S.P1))).status, 403);
  assert.equal(told[told.length - 1].ev.event, 'team-photo');
  /* a text moment, and refusals */
  assert.equal((await call('POST', 'feed/robot/moment', { code: 'P1', text: 'Marie a bien ri aujourd’hui' }, R1.h)).data.done, true);
  assert.equal((await call('POST', 'feed/robot/moment', { code: 'P1', text: 'x'.repeat(141) }, R1.h)).data.error, 'too-long');
  assert.equal((await call('POST', 'feed/robot/moment', { code: 'P2', text: 'Jean' }, R1.h)).status, 403, 'P2 has no consent');
  const bad = await call('POST', 'feed/robot/moment', { code: 'P1', text: '', parts: 1 }, R1.h);
  assert.equal((await call('POST', 'feed/robot/moment/part', { id: bad.data.id, i: 0, data: Buffer.from('not a jpeg').toString('base64') }, R1.h)).data.error, 'bad-photo');
  /* the Care Team sees and removes what it shared */
  const list = await call('GET', 'feed/robot/moments?code=P1', undefined, R1.h);
  assert.ok(list.data.items.length >= 5);
  assert.equal((await call('POST', 'feed/robot/moment/delete', { id: st.data.id }, R1.h)).status, 200);
  assert.ok(!fs.existsSync(path.join(TMP, 'portal', 'feed', 'photos', st.data.id + '.jpg')), 'the photo file is deleted');
  ms = await call('GET', 'feed/family/moments', undefined, B(S.sophie));
  assert.ok(!ms.data.items.some((m) => m.id === st.data.id));
});

test('retention: older than the kept days is deleted, with its photos', async () => {
  const st = await call('POST', 'feed/robot/moment', { code: 'P1', text: 'Photo', parts: 1 }, R1.h);
  await call('POST', 'feed/robot/moment/part', { id: st.data.id, i: 0, data: jpeg(100, 100).toString('base64') }, R1.h);
  const file = path.join(TMP, 'portal', 'feed', 'photos', st.data.id + '.jpg');
  assert.ok(fs.existsSync(file));
  const tooOld = await call('POST', 'feed/robot/upload', { items: [session('old', 'P1', clock - 40 * DAY, 5)] }, R1.h);
  assert.equal(tooOld.data.refused[0].why, 'too-old');
  clock += 31 * DAY;
  await call('POST', 'feed/robot/upload', { items: [session('fresh', 'P1', clock - 3600000, 5)] }, R1.h);
  const d = sweepFeed(portal);
  assert.deepEqual(d.items[S.P1].map((x) => x.cid), ['fresh']);
  assert.equal((d.moments[S.P1] || []).length, 0);
  assert.ok(!fs.existsSync(file), 'the photo went with it');
  const days = await call('GET', 'feed/family/days', undefined, B(S.sophie));
  assert.equal(days.data.days.length, 1);
  assert.equal(days.data.keepDays, 30);
  configureFeed({ keepDays: 7 });
  assert.equal((await call('GET', 'feed/robot/consent', undefined, R1.h)).data.keepDays, 7, 'the retention is configurable');
  configureFeed({ keepDays: 30 });
});

test('deleted with the resident: erase on the portal, or the feed alone', async () => {
  await consent('P2', 'all');
  await call('POST', 'feed/robot/upload', { items: [session('P2-a', 'P2', clock - 600000, 5)] }, R1.h);
  assert.equal((await call('GET', 'feed/family/day', undefined, B(S.paul))).data.items.length, 1);
  assert.equal((await call('POST', 'feed/robot/erase', { code: 'P2' }, R1.h)).status, 200);
  assert.equal((await call('GET', 'feed/family/day', undefined, B(S.paul))).data.items.length, 0);
  const er = await call('POST', 'robot/resident/erase', { rid: S.P1 }, R1.h);
  assert.equal(er.status, 200);
  const d = sweepFeed(portal);
  assert.equal(d.items[S.P1], undefined, 'P1 erased from the portal: its follow-up is gone');
  assert.equal(d.firsts[S.P1], undefined);
});

/* ---------- the robot side (js/family-sync.js) in a small sandbox ---------- */
function robotSide(storage) {
  const store = storage || {};
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, Promise, isFinite, parseInt, setTimeout() {}, clearTimeout() {}, setInterval() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    PLAY_CATALOG: { items: [{ id: 'abc', title: 'La vie en rose', artist: 'Édith Piaf', kind: 'song' }] },
    READING_DATA: { stories: [{ id: 'fr-corbeau', title: 'Le Corbeau et le Renard', author: 'Jean de La Fontaine' }] }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'family-sync.js'), 'utf8') + '\n;this.FS = FamilySync;', ctx);
  return { FS: ctx.FS, store };
}
function rec(o) {
  const t0 = Date.parse('2026-11-10T10:00:00Z');
  return Object.assign({ id: 'S' + t0.toString(36), date: '2026-11-10', startedAt: iso(t0), endedAt: iso(t0 + 600000), durationS: 600, participant: 'P1', zone: 'ROSE_ROOM', preview: false,
    outcome: 'completed', again: 'Yes', counts: { touch: 5, voice: 1, hand: 0, air: 0, key: 0, staff: 2, help: 1 }, stats: {}, events: [], mood: { before: null, after: null } }, o);
}

test('robot side: a finished session becomes what the family may see, nothing more', () => {
  const { FS } = robotSide();
  const t0 = Date.parse('2026-11-10T10:00:00Z');
  const chess = FS.fromRecord(rec({ activity: 'chess', stats: { chessResult: 'patient won', chessMoves: 24 }, events: [{ t: iso(t0), msg: 'Robot says: Bonjour Marie', kind: 'say' }] }));
  assert.equal(chess.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(chess[0].result)), { k: 'chess', v: 'win', n: 24 });
  assert.equal(chess[0].dur, 600);
  assert.equal(chess[0].outcome, 'completed');
  assert.equal(chess[0].part.again, 'yes');
  assert.equal(chess[0].part.acts, 6, 'the team\'s taps are not the resident\'s');
  assert.ok(!JSON.stringify(chess).includes('Bonjour Marie'), 'never the session log or a name');
  assert.equal(FS.fromRecord(rec({ activity: 'pairs', mood: { before: 2, after: 3 } }))[0].mood, undefined, 'never a mood');
  /* never: a preview, a demo, a session ended on Begin, a call not answered */
  assert.equal(FS.fromRecord(rec({ activity: 'chess', preview: true })).length, 0);
  assert.equal(FS.fromRecord(rec({ activity: 'stdemo' })).length, 0);
  assert.equal(FS.fromRecord(rec({ activity: 'karaoke', events: [{ t: iso(t0), msg: 'Karaoke demo: nothing is saved', kind: 'karaoke' }] })).length, 0);
  assert.equal(FS.fromRecord(rec({ activity: 'pairs', notStarted: true })).length, 0);
  assert.equal(FS.fromRecord(rec({ activity: 'familycall', stats: { callAnswered: false } })).length, 0);
  /* Play: the songs from the session, the end from the music engine's own events */
  const { FS: FS2 } = robotSide({ 'bellatrix-reco-events': JSON.stringify({ P1: [{ songId: 'abc', event: 'complete', timestamp: iso(t0 + 200000), playedRatio: 1 }] }) });
  const play = FS2.fromRecord(rec({ activity: 'play', stats: { playItems: 2 }, events: [
    { t: iso(t0 + 10000), msg: 'Bellatrix Play: Édith Piaf – La vie en rose (1947)', kind: 'result' },
    { t: iso(t0 + 20000), msg: 'Bellatrix Play: lyrics for Édith Piaf – La vie en rose: synced (LRCLIB)', kind: 'result' },
    { t: iso(t0 + 300000), msg: 'Bellatrix Play: Unknown Band – Some Song', kind: 'result' }] }));
  const ls = play.filter((x) => x.kind === 'listen');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].title, 'La vie en rose');
  assert.equal(ls[0].artist, 'Édith Piaf');
  assert.equal(ls[0].dur, 190, 'ended when the song completed');
  assert.equal(ls[1].title, 'Some Song');
  assert.equal(ls[1].dur, 300);
  /* Play's podcast lines (1.16) and its other lines (lists, shuffle, listening together) */
  const pod = FS.fromRecord(rec({ activity: 'play', endedAt: iso(t0 + 1800000), durationS: 1800, events: [
    { t: iso(t0 + 1000), msg: 'Bellatrix Play: shuffle on', kind: 'result' },
    { t: iso(t0 + 2000), msg: 'Bellatrix Play: podcast list fr-odyssees (12 episodes, from feed)', kind: 'result' },
    { t: iso(t0 + 60000), msg: 'Bellatrix Play: podcast Les Odyssées: Magellan : le tour du monde (downloaded)', kind: 'result' },
    { t: iso(t0 + 700000), msg: 'Bellatrix Play: listening together opened for P1', kind: 'result' },
    { t: iso(t0 + 900000), msg: 'Bellatrix Play: NoArtistLine', kind: 'result' },
    { t: iso(t0 + 960000), msg: 'Bellatrix Play: Édith Piaf – La vie en rose (1947)', kind: 'result' }] })).filter((x) => x.kind === 'listen');
  assert.deepEqual(JSON.parse(JSON.stringify(pod.map((x) => [x.type, x.artist, x.title, x.dur]))), [['podcast', 'Les Odyssées', 'Magellan : le tour du monde', 900], ['music', 'Édith Piaf', 'La vie en rose', 840]]);
  /* karaoke and books */
  const k = FS.fromRecord(rec({ activity: 'karaoke', stats: { 'Karaoke: songs sung to the end': 1 }, events: [
    { t: iso(t0 + 5000), msg: 'Karaoke: "Frère Jacques" starts, speed 100 %, volume 80 %', kind: 'karaoke' },
    { t: iso(t0 + 125000), msg: 'Karaoke: "Frère Jacques" sung to the end', kind: 'karaoke' }] }));
  assert.deepEqual(JSON.parse(JSON.stringify(k.filter((x) => x.kind === 'listen').map((x) => [x.type, x.title, x.dur]))), [['karaoke', 'Frère Jacques', 120]]);
  assert.deepEqual(JSON.parse(JSON.stringify(k[0].result)), { k: 'karaoke', n: 1 });
  const b = FS.fromRecord(rec({ activity: 'reading', stats: { readingPages: 6, readingFinished: ['fr-corbeau'] } }));
  assert.equal(b[0].marks[0], 'book-end');
  assert.deepEqual(JSON.parse(JSON.stringify(b.filter((x) => x.kind === 'listen').map((x) => [x.type, x.title]))), [['book', 'Le Corbeau et le Renard']]);
  /* outside patient.html (here: no page at all) nothing is captured or sent */
  assert.equal(FS.enabled(), false);
  assert.equal(FS.capture(rec({ activity: 'pairs' })), 0);
});

test('store-server.mjs loads the follow-up module through the portal hook', async () => {
  const port = await new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env: Object.assign({}, process.env, { PORTAL_DATA: path.join(TMP, 'server') }), stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error('server did not start')), 15000);
      child.stdout.on('data', (b) => { if (String(b).includes('Close this window')) { clearTimeout(t); ok(); } });
      child.on('exit', (c) => { clearTimeout(t); ko(new Error('server exited ' + c)); });
    });
    const base = 'http://127.0.0.1:' + port + '/';
    const r = await fetch(base + 'portal/api/feed/robot/consent');
    assert.equal(r.status, 401, 'mounted (401 without the robot key, not 404)');
    for (const f of ['js/family-sync.js', 'js/portail-feed.js', 'css/portail-feed.css']) assert.equal((await fetch(base + f)).status, 200, f);
  } finally {
    child.kill();
  }
});

test.after(() => {
  server.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* Windows may keep a handle a moment */ }
});
