/* Bellatrix Play 1.16 (agent R): free and Premium rules, the podcast catalogue and its parsers,
   "Your mixes", erasure, and the texts. Run: node tests/play.test.mjs
   With --live it also reads every podcast feed on the internet (as the robot would, with the
   origin https://app.bellatrix) and checks the CORS header and the episodes. Without it, nothing
   leaves this computer. No sound, no browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const R = require(path.join(ROOT, 'js/play.js'));
const P = require(path.join(ROOT, 'js/podcasts.js'));
const Reco = require(path.join(ROOT, 'js/reco.js'));
const CFG = require(path.join(ROOT, 'js/reco-config.js'));
const CATALOG = new Function(read('js/play-catalog.js') + ';return PLAY_CATALOG;')();
const LIVE = process.argv.includes('--live');
const HOUR = 3600000, NOW = Date.UTC(2026, 10, 10, 10, 0);

/* ---------------------------------------------------------------- free and Premium ------------- */
test('features: what free and Premium Play give (brief I)', () => {
  const f = R.features(false), p = R.features(true);
  assert.equal(f.ads, true); assert.equal(p.ads, false);
  assert.equal(f.skipsPerHour, 6); assert.equal(p.skipsPerHour, Infinity);
  assert.equal(f.chooseOrder, false); assert.equal(p.chooseOrder, true);
  assert.equal(f.together, false); assert.equal(p.together, true);
  assert.equal(f.podcastList, false); assert.equal(p.podcastList, true);
  for (const k of ['lyrics', 'catalogue', 'podcasts', 'podcastDownloads', 'discovery']) { assert.equal(f[k], true, 'free has ' + k); assert.equal(p[k], true, 'Premium has ' + k); }
  /* honest: not possible through YouTube's embedded player, for anyone */
  for (const k of ['musicOffline', 'betterSound']) { assert.equal(f[k], false, k); assert.equal(p[k], false, k); }
});

test('skips: six an hour when free, then the wait in minutes; Premium and the team are never limited', () => {
  const five = [1, 2, 3, 4, 5].map((m) => NOW - m * 60000);
  assert.deepEqual(R.canSkip(five, NOW, false), { ok: true, left: 1, waitMin: 0 });
  const six = five.concat([NOW - 50 * 60000]);
  const c = R.canSkip(six, NOW, false);
  assert.equal(c.ok, false); assert.equal(c.left, 0); assert.equal(c.waitMin, 10);   /* the oldest (50 min ago) frees in 10 min */
  assert.equal(R.canSkip(six, NOW, true).ok, true);
  assert.equal(R.canSkip(six, NOW, false, true).ok, true);
  /* skips older than an hour no longer count */
  assert.equal(R.canSkip(six.map((t) => t - HOUR), NOW, false).left, 6);
  assert.equal(R.canSkip([], NOW, false).left, 6);
});

test('shuffle: free lists start in shuffle, engine lists keep their order, Premium chooses', () => {
  for (const k of ['row-hits', 'liked', 'foryou', 'mood-calm', 'pl-week', 'mix-chanson', 'res', 'reco', 'recent']) {
    assert.equal(R.shuffles(k, false, false), true, 'free shuffles ' + k);
    assert.equal(R.shuffles(k, true, false), false, 'Premium off ' + k);
    assert.equal(R.shuffles(k, true, true), true, 'Premium on ' + k);
  }
  for (const k of ['radio', 'dj', 'ai', 'calm', 'together']) assert.equal(R.shuffles(k, false, true), false, k + ' keeps its order');
  const list = Array.from({ length: 30 }, (_, i) => i);
  const a = R.shuffle(list, 7, 'seed'), b = R.shuffle(list, 7, 'seed'), c = R.shuffle(list, -1, 'other');
  assert.deepEqual(a, b, 'the same seed gives the same order');
  assert.equal(a[0], 7, 'the song they touched plays first');
  assert.deepEqual([...a].sort((x, y) => x - y), list, 'nothing lost, nothing doubled');
  assert.notDeepEqual(c, list, 'really mixed');
  assert.deepEqual(list, Array.from({ length: 30 }, (_, i) => i), 'the list itself is not changed');
});

test('the "Bellatrix message": free only, at the natural end of the 3rd song, never during an interaction', () => {
  const base = { premium: false, why: 'ended', since: 3, touchedAgo: 60000 };
  assert.equal(R.adDue(base), true);
  assert.equal(R.adDue(Object.assign({}, base, { premium: true })), false, 'Premium: none');
  assert.equal(R.adDue(Object.assign({}, base, { since: 2 })), false, 'not before the 3rd song');
  assert.equal(R.adDue(Object.assign({}, base, { why: 'skip' })), false, 'never at a skip');
  assert.equal(R.adDue(Object.assign({}, base, { touchedAgo: 5000 })), false, 'never right after a touch');
  for (const k of ['panel', 'sheet', 'keyboard', 'dj', 'staff', 'group', 'together', 'podcast']) assert.equal(R.adDue(Object.assign({}, base, { [k]: true })), false, 'never with ' + k);
  const keys = [0, 1, 2, 3, 4].map((n) => R.message(n).key);
  assert.deepEqual(keys.slice(0, 4).sort(), ['dj', 'pods', 'premium', 'together']);
  assert.equal(keys[4], keys[0], 'the messages come in turn');
  for (const m of R.MESSAGES) assert.ok(m.title && m.text && m.btn && ['pods', 'premium', 'dj'].includes(m.go), 'one real action: ' + m.key);
});

/* ---------------------------------------------------------------- podcasts -------------------- */
test('podcast catalogue: public broadcasters, French, German and English, https, no news', () => {
  const ids = new Set(), PUBLIC = /^(France Inter|France Culture|France Musique|Deutschlandfunk( Kultur)?|WDR 5|SWR3|NDR Kultur|Bayern 2|ARD|BBC Radio 4)$/;
  for (const lang of ['fr', 'de', 'en']) assert.ok(P.shows(lang).length >= 6, 'at least six shows in ' + lang);
  for (const s of P.SHOWS) {
    assert.ok(!ids.has(s.id), 'unique ' + s.id); ids.add(s.id);
    assert.match(s.id, /^(fr|de|en)-[a-z0-9]+$/); assert.equal(s.id.slice(0, 2), s.lang);
    assert.ok(PUBLIC.test(s.by), 'public broadcaster: ' + s.by);
    assert.ok(P.TOPICS[s.topic], 'topic ' + s.topic);
    assert.ok(s.feed || s.ard, 'a source for ' + s.id);
    if (s.feed) assert.match(s.feed, /^https:\/\//);
    if (s.lang === 'de') assert.match(String(s.ard), /^\d+$/, 'German shows read from the ARD Audiothek (CORS)');
    assert.doesNotMatch(s.title + ' ' + s.topic, /news|nachrichten|info|actualit|journal|politi/i);
  }
  assert.deepEqual(P.rights(false), { listen: true, download: true, list: false });
  assert.deepEqual(P.rights(true), { listen: true, download: true, list: true });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel><title><![CDATA[Les P'tits Bateaux]]></title><itunes:image href="https://img.example/show.jpg"/>
<image><url>https://img.example/old.jpg</url></image>
<item><title>Old one &amp; friends</title><pubDate>Mon, 02 Nov 2026 07:00:00 +0100</pubDate><guid>g-old</guid>
  <enclosure type="audio/mpeg" length="1200000" url="http://media.example/old.mp3"/><itunes:duration>62:03</itunes:duration>
  <description><![CDATA[<p>Une <b>histoire</b>&nbsp;douce.</p><script>alert(1)</script>]]></description></item>
<item><title><![CDATA[Qu’est-ce qu’il y avait avant les dinosaures ?]]></title><pubDate>Mon, 09 Nov 2026 07:00:00 +0100</pubDate>
  <guid isPermaLink="false">g-new</guid><enclosure url="https://proxycast.radiofrance.fr/a/b/c/23135-09.11.2026-ITEMA.m4a" length="3776000" type="audio/x-m4a"/>
  <itunes:duration>236</itunes:duration><itunes:image href="https://img.example/ep.jpg"/></item>
<item><title>A video, not audio</title><pubDate>Tue, 10 Nov 2026 07:00:00 +0100</pubDate><enclosure url="https://media.example/v.mp4" type="video/mp4"/></item>
<item><title>Long &#233;pisode &#x2014; 1</title><pubDate>Sun, 01 Nov 2026 07:00:00 +0100</pubDate><enclosure url='https://media.example/l.mp3' type='audio/mpeg'/><itunes:duration>1:02:03</itunes:duration></item>
</channel></rss>`;

test('parseFeed: RSS 2.0 with iTunes tags (CDATA, entities, durations, https, audio only, newest first)', () => {
  const f = P.parseFeed(RSS, { show: 'fr-bateaux' });
  assert.equal(f.title, 'Les P\'tits Bateaux');
  assert.equal(f.image, 'https://img.example/show.jpg');
  assert.equal(f.episodes.length, 3, 'the video is left out');
  const [a, b, c] = f.episodes;
  assert.equal(a.title, 'Qu’est-ce qu’il y avait avant les dinosaures ?');
  assert.equal(a.dur, 236); assert.equal(a.size, 3776000); assert.equal(a.type, 'audio/x-m4a'); assert.equal(a.image, 'https://img.example/ep.jpg'); assert.equal(a.show, 'fr-bateaux');
  assert.equal(b.title, 'Old one & friends'); assert.equal(b.dur, 3723); assert.equal(b.url, 'https://media.example/old.mp3', 'http becomes https');
  assert.equal(b.desc, 'Une histoire douce.', 'plain text, no tags, no script');
  assert.equal(c.title, 'Long épisode — 1'); assert.equal(c.dur, 3723);
  assert.ok(a.ts > b.ts && b.ts > c.ts, 'newest first');
  assert.match(a.id, /^e[0-9a-z]+$/); assert.notEqual(a.id, b.id);
  assert.equal(P.parseFeed(RSS, { show: 'fr-bateaux' }).episodes[0].id, a.id, 'stable ids');
  assert.equal(P.parseFeed(RSS, { max: 1 }).episodes.length, 1);
  assert.deepEqual(P.parseFeed('not xml').episodes, []);
  assert.deepEqual(P.parseFeed('').episodes, []);
});

test('parseArd: the ARD Audiothek JSON (German shows)', () => {
  const j = { data: { programSet: { title: 'Kalenderblatt', image: { url: 'https://api.ardmediathek.de/image-service/images/x?w={width}' }, items: { nodes: [
    { id: '1', title: 'Schillerhaus Weimar', synopsis: 'Friedrich Schiller &amp; Weimar', publicationStartDateAndTime: '2026-11-10T09:05:00+01:00', duration: 299,
      audios: [{ url: 'https://podcast-mp3.dradio.de/a.mp3', downloadUrl: 'https://podcast-mp3.dradio.de/a.mp3' }], image: { url1X1: 'https://api.ardmediathek.de/i?w={width}' } },
    { id: '2', title: 'Ohne Ton', audios: [] },
    { id: '3', title: 'Älter', publicationStartDateAndTime: '2026-11-09T09:05:00+01:00', duration: 280.6, audios: [{ url: 'http://x.example/b.m4a' }] }
  ] } } } };
  const f = P.parseArd(JSON.stringify(j), { show: 'de-kalenderblatt' });
  assert.equal(f.title, 'Kalenderblatt'); assert.equal(f.image, 'https://api.ardmediathek.de/image-service/images/x?w=400');
  assert.equal(f.episodes.length, 2);
  assert.equal(f.episodes[0].title, 'Schillerhaus Weimar'); assert.equal(f.episodes[0].dur, 299); assert.equal(f.episodes[0].desc, 'Friedrich Schiller & Weimar');
  assert.equal(f.episodes[1].url, 'https://x.example/b.m4a'); assert.equal(f.episodes[1].type, 'audio/mp4'); assert.equal(f.episodes[1].dur, 281);
  assert.deepEqual(P.parseArd('{oops').episodes, []);
  assert.match(P.ardUrl('10492889', 30), /^https:\/\/api\.ardaudiothek\.de\/programsets\/10492889\?limit=30$/);
});

test('downloads: where the file is read from this page (CORS), and the sizes', () => {
  const rf = P.fileFor({ url: 'https://proxycast.radiofrance.fr/0760/3d68/228b/23135-09.11.2026-ITEMA_1.m4a' });
  assert.deepEqual(rf, { url: 'https://media.radiofrance-podcast.net/podcast09/23135-09.11.2026-ITEMA_1.m4a', ping: 'https://proxycast.radiofrance.fr/0760/3d68/228b/23135-09.11.2026-ITEMA_1.m4a', via: 'direct' });
  assert.equal(P.fileFor({ url: 'https://open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download-rss/proto/https/vpid/p0pljtgl.mp3' }).via, 'helper', 'BBC: through the LabLand server only');
  assert.equal(P.fileFor({ url: 'https://swr-dl.ard-mcdn.de/a.mp3' }).via, 'helper');
  assert.equal(P.fileFor({ url: 'https://podcast-mp3.dradio.de/podcast/a.mp3' }).via, 'direct');
  assert.equal(P.httpsUrl('http://open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download-rss/proto/http/vpid/p0.mp3'),
    'https://open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download-rss/proto/https/vpid/p0.mp3');
  assert.equal(P.fmtSize(52208000, 'en'), '50 MB'); assert.equal(P.fmtSize(52208000, 'fr'), '50 Mo'); assert.equal(P.fmtSize(4791672, 'de'), '4,6 MB');
  assert.equal(P.fmtSize(1.3e9, 'fr'), '1,2 Go'); assert.equal(P.fmtSize(0, 'en'), ''.concat('0', ' MB')); assert.equal(P.fmtSize(3000, 'en'), '0.1 MB');
  assert.equal(P.guessSize({ dur: 300 }), 4800000); assert.equal(P.guessSize({ dur: 300, size: 123 }), 123);
  assert.equal(P.fmtDur(94), '2 min'); assert.equal(P.fmtDur(3723), '1 h 02'); assert.equal(P.fmtDur(3599), '1 h 00'); assert.equal(P.fmtDur(0), '');
  for (const [s, n] of [['236', 236], ['62:03', 3723], ['1:02:03', 3723], ['1:02:03.5', 3724], ['', 0], ['abc', 0], ['1:2:3:4', 0]]) assert.equal(P.parseDuration(s), n, s);
});

/* ---------------------------------------------------------------- mixes, erasure -------------- */
test('Reco.mixes: "Your mixes" from hearts and listening, one style each, none without data', () => {
  const S = Reco.prepare(CATALOG.items, CFG);
  const chanson = S.list.filter((s) => s.genre === 'chanson').slice(0, 5).map((s) => s.id), jazz = S.list.filter((s) => s.genre === 'jazz').slice(0, 3).map((s) => s.id);
  const liked = {}; chanson.concat(jazz).forEach((id) => { liked[id] = 1; });
  const m = Reco.mixes({ songs: S, profile: null, liked, n: 3, k: 20, residentId: 'R1', day: 'd1' });
  assert.deepEqual(m.map((x) => x.genre), ['chanson', 'jazz']);
  for (const x of m) {
    assert.ok(x.list.length >= 10 && x.list.length <= 20, 'length ' + x.list.length);
    assert.equal(new Set(x.list.map((s) => s.id)).size, x.list.length, 'no song twice');
    assert.ok(x.list.every((s) => s.kind !== 'video'));
    assert.ok(x.seeds.every((id) => liked[id]), 'built around their hearts');
  }
  assert.deepEqual(Reco.mixes({ songs: S, profile: null, liked, n: 3, k: 20, residentId: 'R1', day: 'd1' }).map((x) => x.list.map((s) => s.id)), m.map((x) => x.list.map((s) => s.id)), 'deterministic');
  const ex = {}; ex[chanson[0]] = 1;
  assert.ok(!Reco.mixes({ songs: S, liked, exclude: ex, residentId: 'R1' })[0].list.some((s) => s.id === chanson[0]), 'exclusions respected');
  assert.deepEqual(Reco.mixes({ songs: S, profile: null, liked: {} }), []);
});

test('erasure: deleting a resident\'s listening data also deletes their podcast list, progress and history', () => {
  const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  for (const k of ['bellatrix-podcast-lists', 'bellatrix-podcast-progress', 'bellatrix-podcast-history']) st.setItem(k, JSON.stringify({ P1: [1], P2: [2] }));
  const store = Reco.store(st, CFG, CATALOG.items);
  store.deleteResident('P1', 'RT');
  for (const k of ['bellatrix-podcast-lists', 'bellatrix-podcast-progress', 'bellatrix-podcast-history']) assert.deepEqual(JSON.parse(st.getItem(k)), { P2: [2] }, k);
  assert.ok(store.access('P1').some((a) => a.action === 'listening data deleted'));
});

/* ---------------------------------------------------------------- the code and the pages -------- */
test('play.js: free lyrics, Premium v3 for the product "play", podcasts.js loaded before play.js', () => {
  const src = read('js/play.js');
  const openLyrics = src.slice(src.indexOf('function openLyrics()'), src.indexOf('function tryCaptions()'));
  assert.doesNotMatch(openLyrics, /premium\(\)/, 'the lyrics never ask for Premium');
  assert.doesNotMatch(src, /panel === 'lyrics' && !premium\(\)/);
  const calls = [...src.matchAll(/Premium\.(isOn|asked|ask)\(([^)]*)\)/g)];
  assert.ok(calls.length >= 3);
  for (const c of calls) assert.match(c[2], /,\s*'play'$/, 'Premium.' + c[1] + '(' + c[2] + ')');
  assert.match(read('js/reco.js'), /Premium\.isOn\(code, 'play'\)/);
  for (const page of ['patient.html', 'staff.html']) {
    const h = read(page), a = h.indexOf('js/podcasts.js'), b = h.indexOf('js/play.js');
    assert.ok(a > 0 && a < b, page + ': podcasts.js before play.js');
  }
  /* ES5 for the Android 9 WebView (Chrome 95) */
  for (const f of ['js/play.js', 'js/podcasts.js']) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.doesNotMatch(code, /=>|\blet\s|\bconst\s|`|\?\.|\?\?/, f + ' stays ES5');
  }
});

test('texts: every new Play text exists in French and German', () => {
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/i18n.js', 'js/i18n-core.js', 'js/i18n-activities.js', 'js/i18n-play.js']) vm.runInContext(read(f), ctx, { filename: f });
  const D = ctx.I18N.dict, keys = new Set();
  for (const m of read('js/play.js').matchAll(/(?<![\w$.])T\(\s*('(?:[^'\\\n]|\\.)*')/g)) keys.add(vm.runInNewContext(m[1]));
  for (const m of R.MESSAGES) [m.title, m.text, m.btn].forEach((k) => keys.add(k));
  Object.values(P.TOPICS).forEach((k) => keys.add(k));
  ['Use the life story for the music', 'No: listening and favourites only', 'Yes: year of birth and favourite music too'].forEach((k) => keys.add(k));
  const missing = [...keys].filter((k) => /[A-Za-z]/.test(k) && (D.fr[k] === undefined || D.de[k] === undefined));
  assert.deepEqual(missing, []);
});

/* ---------------------------------------------------------------- live (optional) ------------- */
test('live: every feed answers with episodes and a CORS header for the robot', { skip: !LIVE && 'run with --live' }, async () => {
  const bad = [];
  for (const s of P.SHOWS) {
    const url = s.ard ? P.ardUrl(s.ard, 10) : s.feed;
    try {
      const r = await fetch(url, { headers: { Origin: 'https://app.bellatrix' }, signal: AbortSignal.timeout(25000) });
      const acao = r.headers.get('access-control-allow-origin'), txt = await r.text();
      const f = s.ard ? P.parseArd(txt, { show: s.id }) : P.parseFeed(txt, { show: s.id });
      if (!r.ok || !(acao === '*' || acao === 'https://app.bellatrix') || !f.episodes.length) bad.push(s.id + ' ' + r.status + ' acao=' + acao + ' n=' + f.episodes.length);
    } catch (e) { bad.push(s.id + ' ' + e.message); }
  }
  assert.deepEqual(bad, []);
});
