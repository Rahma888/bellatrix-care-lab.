/* Tests of the music recommendation engine (briefing b1, C10). Run: node tests/reco.test.mjs
   Evaluation of the synthetic residents (RECO-EVALUATION.md): node tests/reco.test.mjs --eval
   Only synthetic listening histories: fictitious residents with known tastes, no real data. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = require(path.join(ROOT, 'js/reco-config.js'));
const R = require(path.join(ROOT, 'js/reco.js'));
const CATALOG = new Function(readFileSync(path.join(ROOT, 'js/play-catalog.js'), 'utf8') + ';return PLAY_CATALOG;')();
const S = R.prepare(CATALOG.items, CFG);
const NOW = new Date(2026, 10, 9, 10, 0).getTime();   /* Monday 9 November 2026, 10:00 */
const DAY = 86400000;

/* ---------- synthetic residents ---------- */
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inDec = (s, d) => s.year >= d && s.year <= d + 9;
const RESIDENTS = [
  { id: 'R1', label: 'Chanson française années 60', lang: 'fr', likes: (s) => s.genre === 'chanson' && s.year >= 1955 && s.year <= 1972 },
  { id: 'R2', label: 'Schlager allemand années 70', lang: 'de', likes: (s) => s.genre === 'schlager' && s.year >= 1965 && s.year <= 1984 },
  { id: 'R3', label: 'Pop anglophone années 80', lang: 'en', likes: (s) => s.lang === 'en' && ['pop', 'rock', 'disco'].includes(s.genre) && s.year >= 1978 && s.year <= 1991 },
  { id: 'R4', label: 'Multilingue éclectique', lang: 'fr', likes: (s, r) => s.kind === 'song' && ['fr', 'de', 'en'].includes(s.lang) && ['chanson', 'schlager', 'pop', 'swing', 'jazz'].includes(s.genre) && s.year >= 1950 && s.year <= 1985 },
  { id: 'R5', label: 'Classique et valses', lang: 'de', likes: (s) => ['classical', 'waltz'].includes(s.genre) || s.kind === 'music' },
  { id: 'R6', label: 'Refuse presque tout (C6)', lang: 'en', likes: (s) => s.genre === 'country' && s.year < 1990, rejecter: true },
  { id: 'R7', label: 'Nouveau : 3 chansons de départ', lang: 'fr', cold: { songs: ['-0KvBnIvTFs', 'Y5zK5w9Zcpg', 'gRAmyqFi1aY'] }, noHistory: true },
  { id: 'R8', label: 'Nouveau : époque 1950 + allemand', lang: 'de', cold: { decade: 1950, lang: 'de' }, noHistory: true }
];
/* Six weeks of listening, about four sessions a week. Skips and stops mostly on songs outside the
   taste; a few carer actions (source staff, group session) that must not count. */
function history(res, seed = 7) {
  if (res.noHistory) return [];
  const rnd = prng(seed + res.id.charCodeAt(1) * 101), pool = S.list.filter((s) => s.kind !== 'video' && res.likes(s)), others = S.list.filter((s) => s.kind !== 'video' && !res.likes(s));
  const evs = [];
  for (let day = 42; day >= 1; day--) {
    if (rnd() > 0.6) continue;
    const t0 = NOW - day * DAY - 3 * 3600000, n = 6 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 200000, fromTaste = rnd() < (res.rejecter ? 0.3 : 0.75);
      const s = fromTaste ? pool[Math.floor(rnd() * pool.length)] : others[Math.floor(rnd() * others.length)];
      const ev = (event, ratio, extra = {}) => evs.push(R.makeEvent(Object.assign({ residentId: res.id, songId: s.id, timestamp: t, event, playedRatio: ratio, context: { mode: 'solo', zone: 'HUBER_ROOM' }, source: 'resident' }, extra), NOW));
      const x = rnd();
      if (res.rejecter) { if (x < 0.55) ev('skip', 0.08); else if (x < 0.75) ev('stop', 0.3); else ev('complete', 1); continue; }
      if (fromTaste) { if (x < 0.8) ev('complete', 1); else ev('skip', 0.6); if (rnd() < 0.25) ev('like', 1); if (rnd() < 0.1) ev('replay', 1); }
      else { if (x < 0.6) ev('skip', 0.1); else if (x < 0.9) ev('complete', 1); else ev('stop', 0.4); }
      if (rnd() < 0.05) ev('skip', 0.05, { source: 'staff', context: { mode: 'group', zone: 'COMMUNITY_CIRCLE' } });
    }
  }
  return evs;
}
function playlistFor(res, extra = {}) {
  return R.generatePlaylist(Object.assign({ residentId: res.id, period: 'week', songs: S, events: history(res), now: NOW, cfg: CFG, cold: res.cold || null, lang: res.lang }, extra));
}
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
function store(patients = ['P1', 'P2']) {
  const st = memStorage();
  const pts = {}; patients.forEach((c) => { pts[c] = { content: {}, prefs: { lang: 'fr', life: { born: '1945' } } }; });
  st.setItem('bellatrix-care-lab-v1', JSON.stringify({ patients: pts, sessions: [], settings: {} }));
  return { storage: st, rs: R.store(st, CFG, CATALOG.items) };
}
const song = (id) => S.byId[id];

/* ---------- evaluation table (RECO-EVALUATION.md) ---------- */
if (process.argv.includes('--eval')) {
  const rows = [];
  for (const res of RESIDENTS) {
    const pl = playlistFor(res), items = pl.items.map((it) => ({ it, s: song(it.songId) })), n = items.length;
    const P = R.buildProfile({ residentId: res.id, songs: S, events: history(res), now: NOW, windowDays: 28, cold: res.cold, lang: res.lang, cfg: CFG });
    const artists = new Set(items.map((x) => x.s.artist)), ids = new Set(items.map((x) => x.s.id));
    let adj = 0, adjLang = 0; for (let i = 1; i < n; i++) { if (items[i].s.artist === items[i - 1].s.artist) adj++; if (items[i].s.lang === items[i - 1].s.lang) adjLang++; }
    const fit = res.likes ? items.filter((x) => res.likes(x.s)).length : null;
    const novel = items.filter((x) => !P.heard[x.s.id]).length;
    const pct = (k) => Math.round(100 * k / n) + ' %';
    rows.push(`| ${res.id} ${res.label} | ${P.dataPoints} | ${n} | ${pct(pl.counts.close)} | ${pct(pl.counts.neighbour)} | ${pct(pl.counts.discovery)} | ${fit === null ? '–' : pct(fit)} | ${pct(novel)} | ${artists.size} | ${n - ids.size} | ${adj} | ${P.multilingual ? 'yes, ' + adjLang + ' same-language neighbours' : 'no'} | ${pl.info.join(', ') || '–'} |`);
    console.log(`\n### ${res.id} ${res.label}\n`);
    items.forEach((x) => console.log(`${String(x.it.position).padStart(2)}. [${x.it.bucket}] ${x.s.artist} – ${x.s.title} (${x.s.year}, ${x.s.lang || 'instr.'}, ${x.s.genre}) · ${x.it.reasonText}`));
  }
  console.log('\n| Resident | Signals | Songs | Close | Neighbour | Discovery | Fits the known taste | Not heard before | Distinct artists | Duplicates | Same artist in a row | Multilingual | Flags |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r) => console.log(r));
  console.log('\nMetadata gaps:', JSON.stringify(R.metadataGaps(CATALOG.items), null, 1));
  console.log('Config', CFG.version, CFG.hash());
  process.exit(0);
}

/* ---------- C10 tests ---------- */
test('similarity: a 1960s French chanson is closer to another one than to 2010s rap', () => {
  const ch = S.list.filter((s) => s.genre === 'chanson' && s.lang === 'fr' && inDec(s, 1960));
  const rap = S.list.filter((s) => s.genre === 'rap' && s.year >= 2010);
  assert.ok(ch.length >= 5 && rap.length >= 1, 'catalogue has both kinds');
  for (const a of ch) for (const b of ch) if (a !== b) for (const r of rap) assert.ok(R.similarity(a, b) > R.similarity(a, r), `${a.title} ~ ${b.title} > ${r.title}`);
  /* soft decade: 1970 is closer to 1960 than to 1990 */
  const v = (y) => R.vectorOf({ id: 'x', title: 'x', artist: '', year: y, lang: 'fr', kind: 'song', genre: 'pop', tags: [] }, CFG);
  assert.ok(R.dot(v(1975), v(1965)) > R.dot(v(1975), v(1995)));
});

test('profile: a history leaning to one style gives a playlist mostly of that style, with the 60/30/10 dosage', () => {
  const res = RESIDENTS[0], pl = playlistFor(res), n = pl.items.length;
  assert.ok(n >= CFG.playlistLength.min && n <= CFG.playlistLength.max, 'length ' + n);
  const want = R.dosage(n, CFG);
  assert.deepEqual(pl.counts, want);
  assert.ok(Math.abs(pl.counts.close / n - 0.6) <= 0.1 && Math.abs(pl.counts.neighbour / n - 0.3) <= 0.1 && pl.counts.discovery / n >= 0.1, JSON.stringify(pl.counts));
  const fr = pl.items.filter((it) => song(it.songId).lang === 'fr').length, chanson = pl.items.filter((it) => song(it.songId).genre === 'chanson').length;
  assert.ok(chanson / n >= 0.6 && fr / n >= 0.8, `chanson ${chanson}/${n}, French ${fr}/${n}`);
  /* the dosage is configurable */
  const c2 = CFG.copy(); c2.mix = { close: 0.4, neighbour: 0.3, discovery: 0.3 };
  const pl2 = R.generatePlaylist({ residentId: res.id, period: 'week', songs: R.prepare(CATALOG.items, c2), events: history(res), now: NOW, cfg: c2, lang: 'fr' });
  assert.deepEqual(pl2.counts, R.dosage(pl2.items.length, c2));
  assert.ok(pl2.counts.discovery > pl.counts.discovery);
  for (const r of RESIDENTS) { const p = playlistFor(r); assert.ok(p.counts.discovery / p.items.length >= CFG.minDiscovery, r.id + ' keeps 10 % discovery'); }
});

test('exclusions: a refused or excluded song never appears', () => {
  const res = RESIDENTS[0], ev = history(res);
  const pl0 = playlistFor(res), excluded = { [pl0.items[0].songId]: 1, [pl0.items[3].songId]: 1 }, blocked = { [pl0.items[5].songId]: 1 };
  const stopped = pl0.items[7].songId;
  ev.push(R.makeEvent({ residentId: res.id, songId: stopped, event: 'stop', playedRatio: 0.3, timestamp: NOW - 3600000 * 60 }, NOW));
  for (const period of ['week', 'month']) {
    const pl = R.generatePlaylist({ residentId: res.id, period, songs: S, events: ev, now: NOW, cfg: CFG, lang: 'fr', excluded, blocked });
    const ids = pl.items.map((it) => it.songId);
    for (const id of [...Object.keys(excluded), ...Object.keys(blocked), stopped]) assert.ok(!ids.includes(id), period + ' never ' + id);
  }
  const P = R.buildProfile({ residentId: res.id, songs: S, events: ev, now: NOW, windowDays: 84, cfg: CFG });
  for (const cur of S.list.filter((s) => s.genre === 'chanson').slice(0, 30)) {
    const next = R.nextSongs({ songs: S, current: cur, profile: P, events: ev, now: NOW, exclude: excluded, refused: blocked, cfg: CFG });
    for (const x of next) assert.ok(!excluded[x.songId] && !blocked[x.songId] && x.songId !== stopped, 'next never proposes an excluded song');
  }
  /* widening: almost everything excluded still gives a list, never an empty one */
  const most = {}; S.list.forEach((s, i) => { if (i % 40 !== 0) most[s.id] = 1; });
  const tiny = R.generatePlaylist({ residentId: res.id, period: 'week', songs: S, events: ev, now: NOW, cfg: CFG, excluded: most });
  assert.ok(tiny.items.length > 0 && tiny.items.every((it) => !most[it.songId]) && tiny.info.includes('widened'));
});

test('recency: recent listening weighs more than old listening', () => {
  const a = S.list.find((s) => s.genre === 'schlager' && inDec(s, 1970)), b = S.list.find((s) => s.genre === 'rock' && s.lang === 'en' && inDec(s, 1990));
  const old = R.makeEvent({ residentId: 'X', songId: a.id, event: 'complete', timestamp: NOW - 40 * DAY }, NOW);
  const recent = R.makeEvent({ residentId: 'X', songId: b.id, event: 'complete', timestamp: NOW - 1 * DAY }, NOW);
  assert.ok(R.eventWeight(recent, CFG, NOW) > R.eventWeight(old, CFG, NOW));
  assert.ok(Math.abs(R.eventWeight(R.makeEvent({ residentId: 'X', songId: a.id, event: 'complete', timestamp: NOW - 21 * DAY }, NOW), CFG, NOW) - 0.5) < 1e-9, 'half-life 21 days');
  const evs = []; for (let i = 0; i < 6; i++) { evs.push(Object.assign({}, old, { id: 'o' + i })); evs.push(Object.assign({}, recent, { id: 'r' + i })); }
  const P = R.buildProfile({ residentId: 'X', songs: S, events: evs, now: NOW, windowDays: 84, cfg: CFG });
  assert.ok(R.dot(P.vector, b.v) > R.dot(P.vector, a.v), 'the profile leans to the recent song');
  /* signal weights and who acted */
  const w = (o) => R.eventWeight(R.makeEvent(Object.assign({ residentId: 'X', songId: a.id, timestamp: NOW }, o), NOW), CFG, NOW);
  assert.equal(w({ event: 'like' }), 3); assert.equal(w({ event: 'replay' }), 2); assert.equal(w({ event: 'complete' }), 1);
  assert.equal(w({ event: 'skip', playedRatio: 0.6 }), 0.5); assert.equal(w({ event: 'skip', playedRatio: 0.1 }), -1); assert.equal(w({ event: 'stop', playedRatio: 0.4 }), -2);
  assert.equal(w({ event: 'skip', playedRatio: 0.1, source: 'staff' }), 0, 'a carer skipping for the group says nothing about the resident');
  assert.equal(w({ event: 'complete', context: { mode: 'group' } }), 0.5, 'group listening counts half');
});

test('diversity: never the same artist twice in a row', () => {
  for (const res of RESIDENTS) for (const period of ['week', 'month']) {
    const pl = playlistFor(res, { period }), a = pl.items.map((it) => song(it.songId).artist);
    for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1], `${res.id} ${period} position ${i + 1}`);
    assert.equal(new Set(pl.items.map((it) => it.songId)).size, pl.items.length, 'no duplicates');
    const per = {}; a.forEach((x) => { per[x] = (per[x] || 0) + 1; });
    assert.ok(Math.max(...Object.values(per)) <= CFG.maxPerArtist);
  }
  /* multilingual profile: languages alternate more often than not */
  const pl = playlistFor(RESIDENTS[3]);
  let diff = 0; for (let i = 1; i < pl.items.length; i++) if (song(pl.items[i].songId).lang !== song(pl.items[i - 1].songId).lang) diff++;
  assert.ok(pl.profile.multilingual && diff / (pl.items.length - 1) >= 0.5, 'alternation ' + diff + ' ' + JSON.stringify(pl.profile.langs));
});

test('flow: gentle opening, livelier middle, calm end', () => {
  for (const res of RESIDENTS.slice(0, 4)) {
    const life = playlistFor(res).items.map((it) => it.life), n = life.length, third = Math.floor(n / 3);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const open = avg(life.slice(0, 3)), mid = avg(life.slice(third, n - third)), end = avg(life.slice(-3));
    assert.ok(mid >= open && mid >= end, `${res.id} open ${open} mid ${mid} end ${end}`);
  }
});

test('next song: at most 3 proposals, the most similar first, each with a reason', () => {
  const res = RESIDENTS[0], ev = history(res), P = R.buildProfile({ residentId: res.id, songs: S, events: ev, now: NOW, windowDays: 84, cfg: CFG });
  const cur = S.list.find((s) => s.title === 'La vie en rose');
  const next = R.nextSongs({ songs: S, current: cur, profile: P, events: ev, now: NOW, cfg: CFG });
  assert.equal(next.length, 3);
  for (let i = 1; i < next.length; i++) assert.ok(next[i - 1].parts.sim >= next[i].parts.sim, 'sorted by similarity');
  assert.equal(new Set(next.map((x) => x.song.artist)).size, 3, 'three different artists');
  next.forEach((x) => { assert.ok(x.reasons.length && x.reasonText.length > 5); assert.ok(x.song.genre === 'chanson', x.song.title); });
  assert.equal(CFG.score.g, 0, 'co-listening is interface only');
  const withCo = R.nextSongs({ songs: S, current: cur, profile: P, now: NOW, cfg: CFG, coListen: () => 1 });
  assert.deepEqual(withCo.map((x) => x.songId), R.nextSongs({ songs: S, current: cur, profile: P, now: NOW, cfg: CFG }).map((x) => x.songId), 'g = 0: co-listening changes nothing');
  /* no profile (no consent): proposals still come, from the song itself */
  assert.equal(R.nextSongs({ songs: S, current: cur, profile: null, now: NOW, cfg: CFG }).length, 3);
});

test('cold start: no error without history, starting songs or era + language lead, "profile in progress"', () => {
  const none = R.generatePlaylist({ residentId: 'N0', period: 'week', songs: S, events: [], now: NOW, cfg: CFG });
  assert.ok(none.items.length >= CFG.playlistLength.min && none.profile.isInitial && none.info.includes('profile-building'));
  const r7 = playlistFor(RESIDENTS[6]);
  assert.ok(r7.profile.isInitial && r7.info.includes('profile-building'));
  const ch = r7.items.filter((it) => song(it.songId).genre === 'chanson').length;
  assert.ok(ch / r7.items.length >= 0.6, 'starting songs (Piaf, Trenet, Montand) lead to chanson: ' + ch);
  assert.ok(r7.items.some((it) => it.reason.code === 'start-songs'));
  const r8 = playlistFor(RESIDENTS[7]);
  const de = r8.items.filter((it) => song(it.songId).lang === 'de').length, era = r8.items.filter((it) => song(it.songId).year >= 1945 && song(it.songId).year <= 1965).length;
  assert.ok(de / r8.items.length >= 0.5 && era / r8.items.length >= 0.5, `German ${de}, era ${era}`);
  /* the starting profile weighs less as listening comes in */
  const P0 = R.buildProfile({ residentId: 'c', songs: S, events: [], now: NOW, cold: { decade: 1950, lang: 'de' }, cfg: CFG });
  assert.ok(P0.isInitial && P0.coldUsed && P0.dataPoints === 0);
});

test('statuses: a draft is never proposed to the resident; approval is logged', () => {
  const { rs } = store(['P1']);
  assert.deepEqual(rs.runDue(NOW), [], 'no consent: no generation');
  assert.equal(rs.log({ residentId: 'P1', songId: '-0KvBnIvTFs', event: 'complete', playedRatio: 1 }, NOW), null, 'no consent: nothing collected');
  assert.equal(rs.events('P1').length, 0);
  rs.setConsent('P1', { on: true, by: 'representative', staff: 'AB' }, NOW);
  const made = rs.runDue(NOW);
  assert.equal(made.length, 2, 'one weekly and one monthly draft');
  const week = rs.playlists({ residentId: 'P1', period: 'week' })[0];
  assert.equal(week.status, 'draft');
  assert.deepEqual(rs.proposable('P1'), [], 'drafts never reach Play');
  assert.equal(rs.approve(week.id, '', NOW), null, 'approval needs who approved');
  const first = week.items[0].songId, extra = S.list.find((s) => !week.items.some((it) => it.songId === s.id) && s.kind === 'song').id;
  rs.moveSong(week.id, first, 1, 'AB', NOW); rs.removeSong(week.id, week.items[2].songId, 'AB', NOW); rs.addSong(week.id, extra, 'AB', NOW);
  const ed = rs.get(week.id);
  assert.equal(ed.items[1].songId, first); assert.ok(ed.items.some((it) => it.songId === extra && it.reason.code === 'staff-added'));
  const ap = rs.approve(week.id, 'AB', NOW + 1000);
  assert.equal(ap.status, 'approved'); assert.equal(ap.approvedBy, 'AB');
  assert.ok(ap.log.some((l) => l.action === 'approved' && l.by === 'AB'));
  assert.deepEqual(rs.proposable('P1').map((p) => p.id), [week.id], 'only the approved one');
  rs.activate(week.id, 'resident', NOW + 2000);
  assert.equal(rs.get(week.id).status, 'active');
  assert.deepEqual(rs.proposable('P1').map((p) => p.id), [week.id]);
  rs.setConsent('P1', { on: false, by: 'resident', staff: 'AB' }, NOW + 3000);
  assert.deepEqual(rs.proposable('P1'), [], 'consent withdrawn: nothing personal');
  assert.ok(rs.access('P1').length >= 2, 'access log');
});

test('schedule: weekly on Monday morning, monthly on the 1st, once per period', () => {
  const { rs } = store(['P1']);
  rs.setConsent('P1', { on: true, by: 'resident', staff: 'AB' }, NOW);
  const mon5 = new Date(2026, 10, 16, 5, 0).getTime(), mon7 = new Date(2026, 10, 16, 7, 0).getTime();
  rs.runDue(NOW);
  assert.equal(R.currentPeriod('week', mon5, CFG).key, '2026-W46', 'before 06:00 the old week goes on');
  assert.deepEqual(rs.runDue(mon5), []);
  const made = rs.runDue(mon7);
  assert.equal(made.length, 1, 'a new week: one new draft');
  assert.equal(rs.get(made[0]).periodKey, '2026-W47');
  assert.equal(rs.playlists({ residentId: 'P1', period: 'week' }).filter((p) => p.status === 'archived').length, 1, 'the unapproved old draft is archived');
  assert.deepEqual(rs.runDue(mon7 + 3600000), [], 'once per period');
  const dec1 = new Date(2026, 11, 1, 8, 0).getTime();
  assert.ok(rs.runDue(dec1).some((id) => rs.get(id).period === 'month' && rs.get(id).periodKey === '2026-12'));
});

test('reproducibility: same settings and same data give the same playlist', () => {
  for (const res of RESIDENTS) {
    const a = playlistFor(res), b = playlistFor(res);
    assert.deepEqual(a.items, b.items); assert.equal(a.id, b.id); assert.equal(a.configHash, CFG.hash());
  }
  const c2 = CFG.copy(); c2.halfLifeDays = 7;
  assert.notEqual(CFG.hash(c2), CFG.hash(), 'another setting, another fingerprint');
  const { rs } = store(['P1']);
  rs.setConsent('P1', { on: true, by: 'resident' }, NOW); rs.runDue(NOW);
  const pl = rs.playlists({ residentId: 'P1' })[0];
  assert.equal(pl.configVersion, CFG.version); assert.deepEqual(pl.config.mix, CFG.mix, 'the settings are recorded with the playlist');
});

test('overlap with the previous playlist stays under the cap', () => {
  const res = RESIDENTS[1], ev = history(res);
  const w1 = R.generatePlaylist({ residentId: res.id, period: 'week', songs: S, events: ev, now: NOW - 7 * DAY, cfg: CFG, lang: 'de' });
  const w2 = R.generatePlaylist({ residentId: res.id, period: 'week', songs: S, events: ev, now: NOW, cfg: CFG, lang: 'de', previous: w1 });
  const prev = new Set(w1.items.map((it) => it.songId)), shared = w2.items.filter((it) => prev.has(it.songId)).length;
  assert.ok(shared <= Math.floor(CFG.overlapMax * w2.items.length), 'shared ' + shared);
});

test('a resident who rejects almost everything: closer playlist, information for staff only', () => {
  const pl = playlistFor(RESIDENTS[5]);
  assert.ok(pl.info.includes('rejects-much'));
  assert.equal(pl.counts.discovery, Math.ceil(pl.items.length * CFG.minDiscovery - 1e-9), 'discovery at its minimum, never below');
});

test('privacy: retention, deletion on request, staff actions ignored, no health or personality label', () => {
  const { rs, storage } = store(['P1']);
  rs.setConsent('P1', { on: true, by: 'resident' }, NOW - 100 * DAY);
  rs.log({ residentId: 'P1', songId: '-0KvBnIvTFs', event: 'complete', playedRatio: 1 }, NOW - 95 * DAY);
  rs.log({ residentId: 'P1', songId: 'Y5zK5w9Zcpg', event: 'like', playedRatio: 1, source: 'staff' }, NOW - 2 * DAY);
  rs.log({ residentId: 'P1', songId: 'gRAmyqFi1aY', event: 'complete', playedRatio: 1 }, NOW - 1 * DAY);
  assert.equal(rs.events('P1').length, 3);
  rs.purge(NOW);
  assert.deepEqual(rs.events('P1').map((e) => e.songId), ['Y5zK5w9Zcpg', 'gRAmyqFi1aY'], 'older than 90 days deleted');
  const P = rs.profile('P1', 'week', NOW);
  assert.equal(P.weights.Y5zK5w9Zcpg, undefined, 'a staff action does not shape the individual profile');
  const ev = rs.events('P1')[0];
  assert.deepEqual(Object.keys(ev).sort(), ['context', 'event', 'id', 'playedRatio', 'residentId', 'songId', 'source', 'timestamp']);
  rs.runDue(NOW); rs.setCold('P1', { songs: ['-0KvBnIvTFs'], by: 'AB' }, NOW);
  rs.deleteResident('P1', 'AB', NOW);
  assert.equal(rs.events('P1').length, 0); assert.equal(rs.playlists({ residentId: 'P1' }).length, 0); assert.equal(rs.cold('P1'), null);
  const everything = [...storage._m.values()].join(' ') + readFileSync(path.join(ROOT, 'js/reco.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const w of ['mood:', 'health', 'cognit', 'dementia', 'depress', 'personality', 'diagnos']) assert.ok(!everything.toLowerCase().includes(w), 'no label ' + w);
});

test('metadata gaps are listed, never filled in', () => {
  const g = R.metadataGaps(CATALOG.items);
  assert.equal(g.total, CATALOG.items.length); assert.ok(g.total >= 574);
  assert.ok(g.absentFields.includes('duration') && g.absentFields.includes('popularity'));
  assert.ok(g.compositionYears > 0 && g.noAmbianceTag > 0);
});

test('AI playlist phrase parser (FR, EN, DE)', () => {
  const names = R.artistNames(S);
  const fr = R.parsePhrase('Chansons joyeuses des années 60', names);
  assert.deepEqual([fr.moods, fr.decades], [['happy'], [1960]]);
  const de = R.parsePhrase('Ruhige Musik wie Édith Piaf', names);
  assert.ok(de.moods.includes('calm') && de.artist === 'Édith Piaf' && de.like);
  const en = R.parsePhrase('german schlager from the seventies', names);
  assert.ok(en.langs.includes('de') && en.genres.includes('schlager') && en.decades.includes(1970));
  const pl = R.phrasePlaylist({ songs: S, phrase: 'Happy songs from the 60s', profile: null });
  assert.equal(pl.list.length, 20);
  assert.ok(pl.list.filter((s) => inDec(s, 1960)).length >= 10);
});

/* ---------- 1.1.0: every era, not only old songs ("why only old songs?") ---------- */
const recentOf = (list) => list.filter((s) => s.year >= CFG.balance.recentFrom).length;
const perDecade = (list) => { const m = {}; list.forEach((s) => { const d = s.year >= 1900 ? Math.floor(s.year / 10) * 10 : 0; m[d] = (m[d] || 0) + 1; }); return m; };

test('balance: the popularity stand-in no longer favours old songs', () => {
  const m = {};
  S.list.forEach((s) => { if (s.year >= 1950) { const d = Math.floor(s.year / 10) * 10; (m[d] = m[d] || []).push(s.pop); } });
  for (const d of Object.keys(m)) { const avg = m[d].reduce((a, b) => a + b, 0) / m[d].length; assert.ok(avg > 0.4 && avg < 0.6, d + ': ' + avg); }
});

test('balance: recommendations mix the eras, with and without a profile', () => {
  const k = 8, need = Math.ceil(k * CFG.balance.recentShare - 1e-9), maxDec = Math.ceil(k * CFG.balance.maxDecadeShare - 1e-9);
  for (const lang of ['fr', 'de', 'en']) {
    const r = R.recommend({ songs: S, profile: null, k, lang, cfg: CFG });
    assert.equal(r.length, k);
    assert.ok(recentOf(r) >= need, lang + ' recent ' + recentOf(r));
    assert.ok(Math.max(...Object.values(perDecade(r))) <= maxDec, lang + ' one decade ' + JSON.stringify(perDecade(r)));
  }
  /* a resident who listens only to 1960s chanson still gets about 30 % recent songs, chosen by their taste */
  const res = RESIDENTS[0], P = R.buildProfile({ residentId: res.id, songs: S, events: history(res), now: NOW, windowDays: 84, cfg: CFG });
  const r = R.recommend({ songs: S, profile: P, k, lang: 'fr', cfg: CFG, events: history(res), now: NOW });
  assert.ok(recentOf(r) >= need, 'R1 recent ' + recentOf(r));
  assert.ok(r[0].year < 2000, 'the best match for R1 stays first');
  assert.ok(r.filter((s) => s.year >= 2000).every((s) => s.lang === 'fr'), 'recent songs in their language');
});

test('balance: DJ Bellatrix and AI playlists without an era mix the eras; an era in the phrase is kept', () => {
  const dj = R.djBatch({ songs: S, profile: null, n: 8, lang: 'fr', cfg: CFG });
  assert.ok(recentOf(dj.map((x) => x.song)) >= 3, 'DJ recent');
  for (const phrase of ['Musique calme pour se reposer', 'Let’s dance!', 'Ruhige Musik']) {
    const pl = R.phrasePlaylist({ songs: S, phrase, profile: null, cfg: CFG });
    assert.ok(recentOf(pl.list) >= 6, phrase + ' recent ' + recentOf(pl.list));
  }
  const sixties = R.phrasePlaylist({ songs: S, phrase: 'Chansons joyeuses des années 60', profile: null, cfg: CFG });
  assert.ok(sixties.list.filter((s) => inDec(s, 1960)).length >= 15);
  const piaf = R.phrasePlaylist({ songs: S, phrase: 'Comme Édith Piaf', profile: null, cfg: CFG });
  assert.ok(piaf.list.filter((s) => s.artist === 'Édith Piaf').length >= 2, 'an artist in the phrase is kept');
});

/* ---------- about 1,000 songs: the catalogue is growing ---------- */
function bigCatalog(n) {
  const base = CATALOG.items.slice(), rnd = prng(42), out = base.slice();
  const langs = ['fr', 'fr', 'de', 'de', 'en', 'en', 'en', 'es', 'it'], genres = ['pop', 'pop', 'rock', 'rnb', 'rap', 'electro', 'chanson', 'schlager', 'latin', 'reggae', 'country', 'film'];
  for (let i = 0; out.length < n; i++) {
    const tags = []; const x = rnd(); if (x < 0.35) tags.push('calm'); else if (x < 0.8) tags.push('dance');
    out.push({ id: 'syn' + String(i).padStart(8, '0'), title: 'Synthetic song ' + i, artist: 'Synthetic artist ' + (i % 160), year: 2000 + Math.floor(rnd() * 26),
      lang: langs[Math.floor(rnd() * langs.length)], kind: 'song', genre: genres[Math.floor(rnd() * genres.length)], tags, channel: '' });
  }
  return out;
}
test('scale: about 1,000 songs stay fast and keep every rule', () => {
  const items = bigCatalog(Math.max(1000, CATALOG.items.length + 50));
  let t = Date.now();
  const B = R.prepare(items, CFG);
  const tPrepare = Date.now() - t;
  assert.ok(B.list.length >= 1000);
  const ev = history(RESIDENTS[3]);
  t = Date.now();
  for (let i = 0; i < 20; i++) R.nextSongs({ songs: B, current: B.list[i * 37].id, now: NOW, cfg: CFG });
  const tNext = (Date.now() - t) / 20;
  t = Date.now();
  const rec = R.recommend({ songs: B, profile: null, k: 8, lang: 'fr', cfg: CFG });
  const tRec = Date.now() - t;
  t = Date.now();
  const pl = R.generatePlaylist({ residentId: 'R4', period: 'week', songs: B, events: ev, now: NOW, cfg: CFG, lang: 'fr' });
  const tPl = Date.now() - t;
  t = Date.now();
  const ai = R.phrasePlaylist({ songs: B, phrase: 'Musique calme', profile: null, cfg: CFG });
  const tAi = Date.now() - t;
  console.log(`# 1,000-song timings (node): prepare ${tPrepare} ms, next song ${tNext.toFixed(1)} ms, recommendations ${tRec} ms, weekly playlist ${tPl} ms, AI playlist ${tAi} ms`);
  assert.ok(tPrepare < 1500 && tNext < 150 && tRec < 300 && tPl < 2500 && tAi < 600, 'fast enough');
  assert.deepEqual(pl.counts, R.dosage(pl.items.length, CFG));
  for (let i = 1; i < pl.items.length; i++) assert.notEqual(B.byId[pl.items[i].songId].artist, B.byId[pl.items[i - 1].songId].artist);
  assert.ok(recentOf(rec) >= 3 && ai.list.length === 20);
  /* the same data and settings still give the same playlist */
  assert.deepEqual(R.generatePlaylist({ residentId: 'R4', period: 'week', songs: B, events: ev, now: NOW, cfg: CFG, lang: 'fr' }).items, pl.items);
});
