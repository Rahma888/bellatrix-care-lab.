/* Free group karaoke (b1 block A): lyrics sync from the note data, the "complete register" filter,
   the Care Team model, the synthesiser's track (pause, speed, instant stop) and the offline rule.
   Run: node tests/karaoke.test.mjs
        node tests/karaoke.test.mjs --sync   (copies data/karaoke-licences.json into js/karaoke-songs.js first) */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import assert from 'assert/strict';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SONGS_JS = path.join(ROOT, 'js/karaoke-songs.js'), REG_JSON = path.join(ROOT, 'data/karaoke-licences.json');

if (process.argv.includes('--sync')) {
  const reg = JSON.parse(fs.readFileSync(REG_JSON, 'utf8'));
  const js = fs.readFileSync(SONGS_JS, 'utf8').replace(/\/\* REGISTER-BEGIN \*\/[\s\S]*?\/\* REGISTER-END \*\//,
    () => '/* REGISTER-BEGIN */ ' + JSON.stringify(reg, null, 2).replace(/\n/g, '\n  ') + ' /* REGISTER-END */');
  fs.writeFileSync(SONGS_JS, js);
  console.log('register copied into js/karaoke-songs.js');
}

const require = createRequire(import.meta.url);
const KS = require(SONGS_JS);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); }
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
const YEAR = 2026;

/* ---------------------------------------------------------------- data and register */
test('every song parses: syllables = notes and chord beats = note beats on every line', () => {
  for (const s of KS.SONGS) assert.deepEqual(KS.check(s), [], s.id);
});
test('song ids are unique and start with their language', () => {
  const seen = new Set();
  for (const s of KS.SONGS) { assert.ok(!seen.has(s.id), 'duplicate ' + s.id); seen.add(s.id); assert.ok(s.id.startsWith(s.lang + '-'), s.id); assert.ok(KS.CATS.includes(s.cat), s.id + ' cat'); }
});
test('melodies stay singable for an older group (G3 to D5)', () => {
  for (const s of KS.SONGS) {
    const m = KS.build(s).notes.map((n) => n.midi);
    assert.ok(Math.min(...m) >= 55 && Math.max(...m) <= 74, s.id + ' range ' + Math.min(...m) + '..' + Math.max(...m));
  }
});
test('the embedded register is exactly data/karaoke-licences.json (run --sync after editing the JSON)', () => {
  assert.deepEqual(KS.REGISTER, JSON.parse(fs.readFileSync(REG_JSON, 'utf8')));
});
test('the register is versioned and lists removed songs with a reason', () => {
  const r = KS.REGISTER;
  assert.match(r.version, /^\d+\.\d+\.\d+$/);
  assert.match(r.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(r.removed) && r.removed.length > 0);
  for (const x of r.removed) assert.ok(x.title && x.reason && ['fr', 'de', 'en'].includes(x.language), JSON.stringify(x));
});
test('every song has a complete register row with the same title, language and category', () => {
  for (const s of KS.SONGS) {
    const row = KS.rowOf(KS.REGISTER, s.id);
    assert.ok(row, 'no row for ' + s.id);
    assert.ok(KS.complete(row, YEAR), 'incomplete row ' + s.id);
    assert.equal(row.title, s.title); assert.equal(row.language, s.lang); assert.equal(row.category, s.cat);
    assert.equal(row.audioSource, 'generated');
    assert.equal(row.verifiedBy, 'Claude (research, to be confirmed by LabLand)');
    assert.match(row.textSource, /^https?:\/\//);
  }
  for (const row of KS.REGISTER.songs) assert.ok(KS.byId(row.id), 'row without song data: ' + row.id);
});
test('MVP: at least 5 songs per language and 15 in total are shown', () => {
  const av = KS.available({ year: YEAR });
  for (const l of ['fr', 'de', 'en']) assert.ok(av.filter((s) => s.lang === l).length >= 5, l);
  assert.ok(av.length >= 15, 'total ' + av.length);
});
test('every category has enough songs: 3 per language in German and English, 2 in French (French still to be filled up)', () => {
  const av = KS.available({ year: YEAR });
  for (const l of KS.LANGS) for (const c of KS.CATS) {
    const n = av.filter((s) => s.lang === l && s.cat === c).length, min = l === 'fr' && c !== 'children' ? 2 : 3;
    assert.ok(n >= min, l + '/' + c + ': ' + n + ' songs, need ' + min);
  }
});
test('removed songs never appear in the app', () => {
  const titles = KS.available({ year: YEAR }).map((s) => s.title.toLowerCase());
  for (const x of KS.REGISTER.removed) assert.ok(!titles.includes(x.title.toLowerCase()), x.title);
});

/* ---------------------------------------------------------------- the "complete register" filter */
const ROW = {
  id: 'en-x', title: 'X', language: 'en', category: 'popular', textAuthor: 'A', textAuthorDeathYear: 1900, composer: 'B', composerDeathYear: 'anonymous',
  melodyFirstPublished: 1850, textSource: 'https://example.org/x', audioSource: 'generated', audioLicence: 'own synthesis', verifiedOn: '2026-11-09', verifiedBy: 'Claude'
};
test('complete(): a full row passes', () => assert.equal(KS.complete(ROW, YEAR), true));
test('complete(): each missing or empty field hides the song', () => {
  for (const f of KS.FIELDS) {
    const a = { ...ROW }; delete a[f]; assert.equal(KS.complete(a, YEAR), false, 'missing ' + f);
    const b = { ...ROW, [f]: '  ' }; assert.equal(KS.complete(b, YEAR), false, 'blank ' + f);
  }
});
test('complete(): life + 70 years (2026: died 1955 or before)', () => {
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 1955 }, YEAR), true);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 1956 }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 1960 }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 1956 }, 2027), true);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: '1900' }, YEAR), false, 'a year must be a number');
});
test('complete(): an anonymous work needs its first publication year, 70 years ago or more', () => {
  assert.equal(KS.complete({ ...ROW, melodyFirstPublished: undefined }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, melodyFirstPublished: 1970 }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 'anonymous', textFirstPublished: 1927 }, YEAR), true);
  assert.equal(KS.complete({ ...ROW, textAuthorDeathYear: 'unknown' }, YEAR), false);
});
test('complete(): only generated audio, a real date, a known language, not disabled', () => {
  assert.equal(KS.complete({ ...ROW, audioSource: 'recording' }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, audioSource: 'youtube' }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, verifiedOn: '9 Nov' }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, language: 'es' }, YEAR), false);
  assert.equal(KS.complete({ ...ROW, enabled: false }, YEAR), false);
  assert.equal(KS.complete(null, YEAR), false);
});
test('available(): a song with no row, an incomplete row or a row in another language is hidden', () => {
  const song = KS.SONGS[0], reg = JSON.parse(JSON.stringify(KS.REGISTER));
  const ids = (r) => KS.available({ register: r, year: YEAR }).map((s) => s.id);
  assert.ok(ids(reg).includes(song.id));
  const noRow = { ...reg, songs: reg.songs.filter((r) => r.id !== song.id) };
  assert.ok(!ids(noRow).includes(song.id), 'no row');
  const bad = JSON.parse(JSON.stringify(reg)); delete KS.rowOf(bad, song.id).textSource;
  assert.ok(!ids(bad).includes(song.id), 'incomplete');
  const lang = JSON.parse(JSON.stringify(reg)); KS.rowOf(lang, song.id).language = song.lang === 'fr' ? 'de' : 'fr';
  assert.ok(!ids(lang).includes(song.id), 'language mismatch');
  assert.equal(ids(noRow).length, ids(reg).length - 1, 'only that one song disappears');
});
test('available(): broken note data hides a song (missing or corrupt "audio")', () => {
  const broken = { ...KS.SONGS[0], lines: [{ s: 'la la', n: 'C4 Q9', c: 'C:2' }] };
  assert.notDeepEqual(KS.check(broken), []);
  assert.equal(KS.available({ songs: [broken], year: YEAR }).length, 0);
  assert.throws(() => KS.build(broken));
});
test('available(): filters by language, kind and exclusions', () => {
  const fr = KS.available({ lang: 'fr', year: YEAR });
  assert.ok(fr.length && fr.every((s) => s.lang === 'fr'));
  const xmas = KS.available({ cat: 'christmas', year: YEAR });
  assert.ok(xmas.length && xmas.every((s) => s.cat === 'christmas'));
  const ex = KS.available({ exclude: [fr[0].id], year: YEAR });
  assert.ok(!ex.some((s) => s.id === fr[0].id));
});

/* ---------------------------------------------------------------- lyrics sync from the notes */
const DEMO = { id: 'en-test', lang: 'en', cat: 'children', title: 'Test', bpm: 120, meter: 4, pickup: 0, lines: [
  { s: 'Hel/lo my friend !', n: 'C4 D4 E4 F4:0.5+G4:1.5', c: 'C:4 G:1' },
  { s: 'one_and two', n: 'R:1 G4:2 C4:1', c: 'C:4', ch: true },
  { s: 'la', n: 'C4:4', c: 'N:4' }
] };
test('words(): "/" splits syllables, "_" joins words into one syllable, punctuation sticks to the word before', () => {
  assert.deepEqual(KS.words('Hel/lo my friend !'), [{ text: 'Hello', syl: 2 }, { text: 'my', syl: 1 }, { text: 'friend !', syl: 1 }]);
  assert.deepEqual(KS.words('pour é/cri/re_un mot.'), [{ text: 'pour', syl: 1 }, { text: 'écrire un', syl: 3 }, { text: 'mot.', syl: 1 }]);
  assert.equal(KS.lineText('Prê/te-/moi ta plu/me'), 'Prête-moi ta plume');
});
test('parseNotes(): lengths, melisma and rests; midiOf() with sharps and flats', () => {
  const t = KS.parseNotes('C4 E4:2 A4:0.5+F4:0.5 R:1.5');
  assert.deepEqual(t.map((x) => x.beats), [1, 2, 1, 1.5]);
  assert.equal(t[2].notes.length, 2); assert.equal(t[3].rest, true);
  assert.equal(KS.midiOf('C4'), 60); assert.equal(KS.midiOf('A4'), 69); assert.equal(KS.midiOf('F#4'), 66); assert.equal(KS.midiOf('Bb3'), 58);
  assert.throws(() => KS.parseNotes('H4'));
  assert.throws(() => KS.parseNotes('C4:0'));
});
test('build(): a two-bar introduction, then each word starts on its first syllable and ends with its last', () => {
  const tl = KS.build(DEMO);
  assert.equal(tl.intro, 8);
  const w = tl.lines[0].words;
  assert.deepEqual(w.map((x) => [x.text, x.b0, x.b1]), [['Hello', 8, 10], ['my', 10, 11], ['friend !', 11, 13]]);
  near(tl.lines[0].b0, 8); near(tl.lines[0].b1, 13);
  near(tl.lines[1].b0, 14, 'a rest delays the first word'); near(tl.lines[1].start, 13);
  assert.deepEqual(tl.lines[1].words.map((x) => [x.text, x.b0, x.b1]), [['one and', 14, 16], ['two', 16, 17]]);
  assert.equal(tl.lines[1].ch, true); assert.equal(tl.chorus, true);
  near(tl.beats, 21);
});
test('build(): with a pickup the first full bar still falls on a downbeat', () => {
  const tl = KS.build(KS.byId('en-amazing-grace'));
  assert.equal(tl.intro, 5);                  /* 3/4 with one pickup beat: 3 + 2 */
  near(tl.lines[0].b0, 5); near(tl.lines[0].words[0].b1 - tl.lines[0].words[0].b0, 4, '"Amazing": 1 + 2 + 1 beats');
  near((tl.lines[0].b0 + 1) % 3, 0, 'first downbeat after the pickup');
});
test('lyrics(): the briefing\'s shape in milliseconds, scaled by the speed', () => {
  const ly = KS.lyrics(DEMO);              /* 120 bpm: 500 ms a beat */
  assert.deepEqual(ly[0], { startMs: 4000, endMs: 6500, text: 'Hello my friend !', isChorus: false,
    words: [{ startMs: 4000, endMs: 5000, text: 'Hello' }, { startMs: 5000, endMs: 5500, text: 'my' }, { startMs: 5500, endMs: 6500, text: 'friend !' }] });
  assert.equal(ly[1].isChorus, true);
  const slow = KS.lyrics(DEMO, 0.5);
  assert.equal(slow[0].startMs, 8000); assert.equal(slow[0].words[2].endMs, 13000);
  assert.equal(KS.durationMs(DEMO), 10500); assert.equal(KS.durationMs(DEMO, 2), 5250);
});
test('at(): introduction, line shown one beat early, current word, end', () => {
  const tl = KS.build(DEMO);
  assert.deepEqual(KS.at(tl, 0), { line: -1, word: -1, end: false });
  assert.deepEqual(KS.at(tl, 6.9), { line: -1, word: -1, end: false });
  assert.deepEqual(KS.at(tl, 7), { line: 0, word: -1, end: false }, 'one beat early');
  assert.deepEqual(KS.at(tl, 8), { line: 0, word: 0, end: false });
  assert.deepEqual(KS.at(tl, 10.5), { line: 0, word: 1, end: false });
  assert.deepEqual(KS.at(tl, 12.9), { line: 0, word: 2, end: false });
  assert.deepEqual(KS.at(tl, 13), { line: 1, word: -1, end: false }, 'the next line comes up in the rest, never before the last one is sung');
  assert.deepEqual(KS.at(tl, 16.2), { line: 1, word: 1, end: false });
  assert.deepEqual(KS.at(tl, 21), { line: 2, word: 0, end: true });
  assert.equal(KS.at(tl, 13, 0).line, 0, 'no lead: still the old line');
});
test('every song: lines and words strictly in order, words inside their line, line timings match lyrics()', () => {
  for (const s of KS.SONGS) {
    const tl = KS.build(s), ly = KS.lyrics(s), k = KS.msPerBeat(s.bpm);
    let prev = 0;
    tl.lines.forEach((l, i) => {
      assert.ok(l.b0 >= prev - 1e-9, s.id + ' line ' + i + ' starts before the previous ends');
      assert.ok(l.b1 > l.b0, s.id + ' line ' + i);
      let w0 = l.b0;
      l.words.forEach((w, j) => {
        assert.ok(w.b0 >= w0 - 1e-9 && w.b1 >= w.b0 && w.b1 <= l.b1 + 1e-9, s.id + ' line ' + i + ' word ' + j);
        w0 = w.b1;
      });
      assert.equal(ly[i].startMs, Math.round(l.b0 * k)); assert.equal(ly[i].endMs, Math.round(l.b1 * k));
      assert.equal(ly[i].words.map((w) => w.text).join(' '), l.text, s.id + ' line ' + i + ' text = words');
      prev = l.b1;
    });
    /* at() walks every word of every line in order */
    let last = { line: -1, word: -1 };
    for (let b = 0; b <= tl.beats; b += 0.25) {
      const a = KS.at(tl, b);
      assert.ok(a.line > last.line || (a.line === last.line && a.word >= last.word), s.id + ' at ' + b);
      last = a;
    }
    assert.equal(last.line, tl.lines.length - 1, s.id + ' ends on its last line');
  }
});
test('arrange(): the tune, a bass note at every chord change, chords on the off-beats, all inside the song', () => {
  for (const s of KS.SONGS) {
    const tl = KS.build(s), ev = KS.arrange(tl);
    assert.equal(ev.filter((e) => e.v === 'mel').length, tl.notes.length, s.id);
    for (const c of tl.chords) if (c.root !== null) assert.ok(ev.some((e) => e.v === 'bass' && Math.abs(e.b - c.b) < 1e-6 && e.midi % 12 === c.root), s.id + ' bass at ' + c.b);
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].b >= ev[i - 1].b, s.id + ' sorted');
    for (const e of ev) assert.ok(e.b >= 0 && e.b < tl.beats && e.d > 0 && e.midi >= 36 && e.midi <= 84, s.id + ' event ' + JSON.stringify(e));
  }
});

/* ---------------------------------------------------------------- Care Team model (A6) */
test('cleanStore(): bad data becomes an empty, valid store', () => {
  assert.deepEqual(KS.cleanStore(null), { v: 1, playlists: [], exclusions: [] });
  const s = KS.cleanStore({ playlists: [{ id: 'a', name: ' Noël ', language: 'xx', songIds: ['x', 3, null] }, { id: 'b' }], exclusions: [{ scope: 'room', id: 'G1' }, { scope: 'group', id: 'G1', songIds: 'x' }] });
  assert.deepEqual(s.playlists, [{ id: 'a', name: 'Noël', language: '', songIds: ['x'], createdBy: '', createdAt: '' }]);
  assert.deepEqual(s.exclusions, [{ scope: 'group', id: 'G1', songIds: [] }]);
});
test('excluded(): the group\'s list, the whole house (*), the resident\'s own code and the residents present', () => {
  const store = { exclusions: [
    { scope: 'group', id: 'G1', songIds: ['a'] }, { scope: 'group', id: '*', songIds: ['b'] },
    { scope: 'resident', id: 'P3', songIds: ['c'] }, { scope: 'resident', id: 'P9', songIds: ['d'] }, { scope: 'group', id: 'G2', songIds: ['e'] }] };
  assert.deepEqual(KS.excluded(store, { group: 'g1', residents: 'p3, P4' }).sort(), ['a', 'b', 'c']);
  assert.deepEqual(KS.excluded(store, { group: 'P9' }).sort(), ['b', 'd'], 'a resident session uses the resident\'s list');
  assert.deepEqual(KS.excluded(store, {}), ['b']);
  assert.deepEqual(KS.codes(' p1, P2 ;p3 '), ['P1', 'P2', 'P3']);
});
test('playlistSongs(): keeps the order, skips unknown, excluded and incomplete songs', () => {
  const a = KS.available({ year: YEAR });
  const store = { playlists: [{ id: 'pl', name: 'Mix', songIds: [a[2].id, 'nope', a[0].id, a[1].id] }] };
  assert.deepEqual(KS.playlistSongs(store, 'pl', { year: YEAR }).map((s) => s.id), [a[2].id, a[0].id, a[1].id]);
  assert.deepEqual(KS.playlistSongs(store, 'pl', { year: YEAR, exclude: [a[0].id] }).map((s) => s.id), [a[2].id, a[1].id]);
  assert.deepEqual(KS.playlistSongs(store, 'missing', {}), []);
});

/* ---------------------------------------------------------------- the synthesiser's track (fake WebAudio) */
function fakeMusic() {
  const timers = [];
  const ctx = { currentTime: 0, state: 'running', destination: {}, resume() {},
    createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect() {} }),
    createGain: () => ({ gain: { value: 1, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} }, connect() {} }),
    createOscillator: () => { const o = { type: '', frequency: { value: 0 }, connect() {}, started: null, stopped: null, start(t) { o.started = t; }, stop(t) { o.stopped = t === undefined ? 'now' : t; } }; made.push(o); return o; } };
  const made = [];
  const win = { AudioContext: function () { return ctx; }, performance: { now: () => ctx.currentTime * 1000 } };
  const sandbox = { window: win, performance: win.performance, setTimeout: (f, ms) => { timers.push({ f, ms, kind: 't' }); return timers.length; }, clearTimeout() {},
    setInterval: (f, ms) => { timers.push({ f, ms, kind: 'i' }); return timers.length; }, clearInterval() {}, Audio: function () {}, console, Math, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/music.js'), 'utf8') + '\n;this.Music = Music;', sandbox);
  const pump = () => timers.filter((t) => t.kind === 'i').forEach((t) => t.f());
  const advance = (sec) => { for (let i = 0; i < Math.round(sec / 0.04); i++) { ctx.currentTime += 0.04; pump(); } };
  return { Music: sandbox.Music, ctx, made, advance, timers };
}
test('Music.track(): position in beats follows the clock and the speed; pause holds it; resume goes on', () => {
  const { Music, advance } = fakeMusic();
  const tl = KS.build(DEMO), ev = KS.arrange(tl);
  const h = Music.track(ev, { bpm: 120, beats: tl.beats });
  advance(0.4);                       /* half a second of silence first (robot speakers wake slowly) */
  near(Math.round(h.pos() * 100) / 100, 0);
  advance(1);                          /* 120 bpm: 2 beats a second */
  near(Math.round(h.pos() * 10) / 10, 2);
  h.pause(); const p = h.pos(); advance(2); near(h.pos(), p, 'paused');
  assert.equal(Music.isPlaying(), false);
  h.resume(); advance(0.15 + 1); near(Math.round(h.pos() * 10) / 10, Math.round((p + 2) * 10) / 10);
  h.setTempo(0.5); const q = h.pos(); advance(2); near(Math.round(h.pos() * 10) / 10, Math.round((q + 2) * 10) / 10, 'half speed: 1 beat a second');
  assert.equal(h.setTempo(9), 1.5, 'speed is limited');
});
test('Music.track(): notes are scheduled a little ahead, at the beat times', () => {
  const { Music, made, advance } = fakeMusic();
  const tl = KS.build(DEMO), ev = KS.arrange(tl);
  Music.track(ev, { bpm: 120, beats: tl.beats });
  advance(4.5);                       /* 0.4 s silence + 8 beats of intro at 0.5 s */
  const mel = made.filter((o) => o.type === 'triangle' && Math.abs(o.frequency.value - 261.63) < 0.1);
  assert.ok(mel.length >= 1, 'the first sung note (C4) is scheduled');
  near(Math.round(mel[0].started * 1000) / 1000, 4.4, 'first word at 0.4 + 8 x 0.5 s');
});
test('Stop cuts the sound at once: every scheduled oscillator stopped, nothing playing, track dead', () => {
  const { Music, made, advance } = fakeMusic();
  const tl = KS.build(KS.byId('fr-clair-lune'));
  const h = Music.track(KS.arrange(tl), { bpm: 100, beats: tl.beats });
  advance(6);
  const live = made.filter((o) => o.stopped === null || typeof o.stopped === 'number');
  assert.ok(live.length > 0);
  const before = made.length;
  assert.equal(Music.stop(), true);
  assert.ok(made.slice(0, before).every((o) => o.stopped === 'now' || (typeof o.stopped === 'number' && o.stopped <= 6.1)), 'all stopped now');
  assert.equal(Music.isPlaying(), false); assert.equal(h.live(), false);
  assert.equal(Music._debug().voices, 0);
  advance(3); assert.equal(made.length, before, 'nothing new is scheduled after Stop');
});
test('Music.track(): no sound (no WebAudio) runs on a silent clock and says so', () => {
  const sandbox = { window: { performance: { now: () => 0 } }, performance: { now: () => 0 }, setTimeout: (f) => { f(); return 1; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console, Math, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/music.js'), 'utf8') + '\n;this.Music = Music;', sandbox);
  let told = false;
  const h = sandbox.Music.track([{ b: 0, d: 1, midi: 60, v: 'mel' }], { bpm: 60, beats: 1, onNoAudio: () => { told = true; } });
  assert.equal(h.audio(), false); assert.equal(told, true);
});
test('the older Music calls are still there', () => {
  const { Music } = fakeMusic();
  for (const k of ['play', 'playList', 'playClip', 'ring', 'stop', 'setVolume', 'getVolume', 'isPlaying', 'unlock', 'byId', 'parse']) assert.equal(typeof Music[k], 'function', k);
  assert.ok(Music.SONGS.length >= 10 && Music.MOODS.calm);
});

/* ---------------------------------------------------------------- offline, no YouTube, no LRCLIB; ES5 */
function code(file) {
  /* the source without comments and string contents */
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; out += q; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } out += q; i++; continue; }
    out += c; i++;
  }
  return out;
}
test('karaoke code makes no network call and never mentions YouTube, LRCLIB or the Play catalogue', () => {
  for (const f of ['js/karaoke.js', 'js/karaoke-songs.js']) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8').split('REGISTER-BEGIN')[0] + (f === 'js/karaoke.js' ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
    assert.doesNotMatch(code(f), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new\s+Audio\s*\(|\.src\s*=/, f);
    assert.doesNotMatch(raw.replace(/\/\*[\s\S]*?\*\//g, ''), /youtube|youtu\.be|lrclib|PLAY_CATALOG|https?:\/\//i, f);
  }
  const music = fs.readFileSync(path.join(ROOT, 'js/music.js'), 'utf8'), track = music.slice(music.indexOf('function track('), music.indexOf('function stop()'));
  assert.ok(track.length > 500 && !/fetch|XMLHttpRequest|new Audio\(|https?:/.test(track), 'Music.track uses no network');
});
test('browser files are ES5 (no let/const, arrow functions, template strings, optional chaining)', () => {
  for (const f of ['js/karaoke.js', 'js/karaoke-songs.js', 'js/music.js', 'js/i18n-karaoke.js']) {
    const c = code(f);
    assert.doesNotMatch(c, /\blet\s|\bconst\s|=>|`|\?\.|\?\?|\bclass\s|\.\.\.[a-zA-Z]/, f);
  }
  const css = fs.readFileSync(path.join(ROOT, 'css/karaoke.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/:has\(|color-mix|mix-blend-mode/.test(css), 'css/karaoke.css: Chrome 95 cannot do :has, color-mix or blend modes');
});
test('the singing screen keeps three big buttons only: Pause / Resume, Next song, Stop (2026-11-14)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/karaoke.js'), 'utf8');
  const blocks = [...src.matchAll(/function controls\(\) \{[\s\S]*?\n        \}/g)].map((m) => m[0]);
  assert.equal(blocks.length, 2, 'a song and a video');
  for (const b of blocks) assert.deepEqual([...b.matchAll(/ctlBtn\('([a-z]+)'/g)].map((m) => m[1]), ['pause', 'next', 'stop']);
  /* the functions stay for the care team (keyboard, settings in Personalise) */
  for (const k of ['vdown', 'vup', 'slower', 'faster', 'chorus', 'other']) assert.ok(src.includes("k === '" + k + "'"), k + ' still works');
  assert.match(src, /ArrowUp: 'vup', ArrowDown: 'vdown', ArrowLeft: 'slower', ArrowRight: 'faster'/);
});
test('every karaoke text has French and German on the page that shows it (robot screen / Care Team)', () => {
  function dictFor(html) {
    const files = [...fs.readFileSync(path.join(ROOT, html), 'utf8').matchAll(/src="js\/(i18n[^"?]*\.js)/g)].map((m) => m[1]);
    const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
    for (const f of files) { try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8') + (f === 'i18n.js' ? ';window.I18N=I18N;' : ''), sandbox); } catch (e) { /* another agent's file in progress */ } }
    return sandbox.I18N.dict;
  }
  const src = fs.readFileSync(path.join(ROOT, 'js/karaoke.js'), 'utf8');
  const staffPart = src.slice(src.indexOf('function SX('));
  const robotKeys = new Set(), staffKeys = new Set();
  const STR = "'((?:[^'\\\\]|\\\\.)*)'";
  for (const m of src.matchAll(new RegExp('\\bT\\(' + STR, 'g'))) robotKeys.add(m[1]);
  for (const m of src.matchAll(new RegExp('(?:label|name|againQuestion): ' + STR, 'g'))) robotKeys.add(m[1]);
  ['Popular songs', 'Christmas songs', 'Nursery rhymes'].forEach((k) => robotKeys.add(k));
  for (const m of staffPart.matchAll(new RegExp('\\bSX\\(' + STR, 'g'))) staffKeys.add(m[1]);
  for (const m of src.matchAll(new RegExp("\\['[a-z0-9.]+', " + STR + '\\]', 'g'))) staffKeys.add(m[1]);
  for (const k of ['playlists', '']) { robotKeys.delete(k); staffKeys.delete(k); }
  ['Group karaoke', 'Everyone sings together, with very big lyrics and music made by Bellatrix.', 'Songs in', 'Speed', 'Volume cap (%)', 'Start in “Chorus only” mode',
    'Residents present (codes, for their songs to avoid)'].forEach((k) => staffKeys.add(k));
  const miss = (d, keys) => [...keys].filter((k) => k && (d.fr[k] === undefined || d.de[k] === undefined));
  assert.deepEqual(miss(dictFor('patient.html'), robotKeys), [], 'robot screen');
  assert.deepEqual(miss(dictFor('staff.html'), staffKeys), [], 'Care Team');
});
test('no score, ranking or health claim in the karaoke texts', () => {
  const t = fs.readFileSync(path.join(ROOT, 'js/karaoke.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/i18n-karaoke.js'), 'utf8');
  assert.doesNotMatch(t.replace(/\/\*[\s\S]*?\*\//g, ''), /\bscore|\bpoints?\b|ranking|winner|well done|bravo|therap|memory test|cognitive|th[ée]rapie|Gedächtnis/i);
});
test('the karaoke does not change the app version', () => {
  /* The version is set in core.js only (1.15.0 since the release build); the karaoke files never set it. */
  for (const f of ['js/karaoke.js', 'js/karaoke-songs.js', 'js/music.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /var VERSION\s*=/);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
