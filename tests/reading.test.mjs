/* Bellatrix 1.16 (workstream H): the reading app, novels in an open book with a page turn.
   Logic tests without a browser (the page turn itself is checked in a muted browser, scratchpad v116-H).
   The novels come from js/books/ (another agent); these tests use the SAMPLE file js/books/sample-fr-demo.js.
   Run: node tests/reading.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function memoryStorage() {
  const m = {};
  return { m, getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] ?? null, get length() { return Object.keys(m).length; } };
}
/* The browser files, run as the page runs them. extra: more globals (a fake Premium, Lab…). */
function load(files, storage, extra) {
  const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, localStorage: storage || memoryStorage(), ...(extra || {}) };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}
const SAMPLE = 'js/books/sample-fr-demo.js';
/* The SAMPLE novel under another id (the shelf of a test), as a book file would register it. */
function sampleAs(ctx, id, extra) {
  extra = extra || {};
  let src = read(SAMPLE).replace("id: 'sample-fr-demo'", 'id: ' + JSON.stringify(id)).replace('sample: true', 'sample: false')
    .replace(/free: true/, 'free: ' + (extra.free === false ? 'false' : 'true'));
  if (extra.title) src = src.replace(/^  title: '[^']*',$/m, '  title: ' + JSON.stringify(extra.title) + ',');
  if (extra.author) src = src.replace(/^  author: '[^']*',$/m, '  author: ' + JSON.stringify(extra.author) + ',');
  vm.runInContext(src, ctx, { filename: id + '.js' });
}
/* A shelf of five French novels made from the SAMPLE: 2 free, 3 Premium (as asked for each language). */
const SHELF = [['fr-a', true], ['fr-b', true], ['fr-c', false], ['fr-d', false], ['fr-e', false]].map(([id, free], k) => ({
  id, lang: 'fr', title: 'Roman ' + 'ABCDE'[k], author: 'Autrice ' + k, year: 1900 + k, free, chapters: 3, words: 900,
  source: 'https://www.gutenberg.org/ebooks/' + (100 + k), licence: 'Public domain' }));
function withShelf(ctx, list) {
  /* a shelf of the test's own (the real js/books/index.js is checked on its own below) */
  ctx.BellatrixBooks._reset();
  ctx.BellatrixBooks.index(list || SHELF);
  const loads = [];
  ctx.BellatrixBooks._useLoader((id, done) => {
    loads.push(id);
    const e = ctx.BellatrixBooks.entry(id);
    if (!e) { done(new Error('404')); return; }
    setTimeout(() => { sampleAs(ctx, id, { free: e.free, title: e.title, author: e.author }); done(null); }, 1);
  });
  return loads;
}
/* Premium v3 as agreed (contract 1): products 'play' and 'books', per resident. */
function premiumV3() {
  const on = {}, asks = [], n = (c) => String(c == null ? '' : c).trim().toUpperCase();
  return {
    asks,
    isOn: (code, product) => !!on[product + ':' + n(code)],
    activate: (code, product) => { on[product + ':' + n(code)] = true; },
    deactivate: (code, product) => { delete on[product + ':' + n(code)]; },
    ask: (code, product) => { asks.push([n(code), product]); },
    asked: (code, product) => asks.some((a) => a[0] === n(code) && a[1] === product)
  };
}
/* The source without comments and string contents. */
function code(file) {
  const s = read(file);
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; out += q; i++; while (i < s.length && s[i] !== q && s[i] !== '\n') { if (s[i] === '\\') i++; i++; } out += q; i++; continue; }
    out += c; i++;
  }
  return out;
}
const noComments = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const READ = ['js/reading-data.js', 'js/books/index.js', 'js/reading.js'];
const I18N_PATIENT = ['i18n.js', 'i18n-core.js', 'i18n-activities.js', 'i18n-play.js', 'i18n-karaoke.js', 'i18n-messages.js', 'i18n-album-reading.js', 'i18n-family.js'].map((f) => 'js/' + f).filter((f) => fs.existsSync(path.join(ROOT, f)));
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const last = (a) => a[a.length - 1];

/* The activity with a small fake Lab (no document: the page turn falls back to a plain page change). */
function runActivity(opts = {}) {
  const storage = opts.storage || memoryStorage();
  const ctx = load(I18N_PATIENT.concat(['js/reading-data.js', 'js/books/index.js']), storage, { fetch: (...a) => { (ctx.fetched = ctx.fetched || []).push(a); return Promise.reject(new Error('no network')); }, ...(opts.extra || {}) });
  const loads = withShelf(ctx, opts.shelf);
  const defined = [];
  ctx.Lab = { esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), define: (a) => defined.push(a),
    patient: opts.patient || 'P1', opt: { rate: 0.92, life: {} }, _t: { state: { rec: { preview: !!opts.preview } } } };
  vm.runInContext(read('js/reading.js'), ctx, { filename: 'js/reading.js' });
  const act = defined[0], said = [], steps = [], stats = {}, later = [];
  const lang = opts.lang || 'fr';
  const L = {
    lang: () => lang, t: (s, v) => ctx.I18N.t(lang, s, v),
    text: (id) => { if (opts.content && id in opts.content) return opts.content[id]; const f = act.content.find((x) => x.id === id); return f ? String(f.value) : ''; },
    go: (st) => { if (st) steps.push(st); }, say: (t, cb) => { said.push(t); if (cb) cb(); }, quiet: () => {}, refresh: () => {}, later: (f) => later.push(f),
    push: (k, v) => { (stats[k] = stats[k] || []).push(v); }, stat: (k, v) => { stats[k] = v === undefined ? (stats[k] || 0) + 1 : v; },
    log: () => {}, step: () => steps[steps.length - 1], finish: () => steps.push({ id: 'finished' })
  };
  return { ctx, act, L, said, steps, stats, later, loads, storage, R: ctx.Reading };
}
/* the buttons of the step itself (the tabs, Finish, the speed and the arrows of the frame are marked nav) */
const main = (st) => st.actions.filter((a) => !a.nav);
async function openFromList(r, id) {
  let list = r.act.start(r.L), all = list.choices.slice();
  if (!all.some((c) => c.value === id) && list.actions[0].label !== r.L.t('I’m done')) { list.actions[0].run(); all = all.concat(last(r.steps).choices); }
  const c = all.find((x) => x.value === id);
  assert.ok(c, id + ' is on the shelf');
  c.run();
  await tick(20);
  return last(r.steps);
}

/* ---------------------------------------------------------------- books only */
test('books only: no Today (time, weather), horoscope or "50 years ago" code path, and nothing goes to the network', async () => {
  assert.doesNotMatch(noComments('js/reading-data.js'), /open-?meteo|horoscop|horoskop|\bsigns\s*:|\bfacts\s*:|\bweather\s*:/i, 'js/reading-data.js: no data for the removed corners');
  const c = noComments('js/reading.js');
  assert.doesNotMatch(c, /open-?meteo|weather|météo|wetter|horoscop|horoskop|signFor|starSign|factsFrom|clockOf|momentOf|50 years|il y a 50|vor 50 jahren|reading-today|reading-menu|reading-horoscope|reading-fact/i);
  assert.doesNotMatch(c, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket/, 'no network call (a book file is a local <script>)');
  const { Reading: R, READING_DATA: D } = load(READ);
  for (const k of ['weather', 'settings', 'setSettings', 'message', 'signFor', 'factsFrom', 'clockOf', 'momentOf', 'requestPremium', 'progressOf', 'saveProgress']) assert.equal(R[k], undefined, 'Reading.' + k + ' is gone');
  assert.equal(D.facts, undefined); assert.equal(D.horoscope, undefined); assert.equal(D.weather, undefined);
  assert.equal(JSON.parse(read('data/reading-licences.json')).facts, undefined);
  const r = runActivity();
  assert.equal(r.act.key, 'reading');
  assert.deepEqual([...r.act.content.map((f) => f.id)], ['speed', 'turn', 'books']);
  const first = r.act.start(r.L);
  assert.equal(first.id, 'reading-books', 'the first screen is the shelf');
  assert.equal(first.title, 'Quel livre lisons-nous ?');
  assert.equal(r.ctx.fetched, undefined, 'nothing asked from the network');
});

/* ---------------------------------------------------------------- the book format */
test('BellatrixBooks: index (metadata only), add, get on demand (one file per novel), list per language; two books in memory at most', async () => {
  const ctx = load(['js/reading-data.js', 'js/books/index.js']);
  const B = ctx.BellatrixBooks;
  B._reset();
  const loads = withShelf(ctx);
  assert.deepEqual([...B.list('fr').map((e) => e.id)], ['fr-a', 'fr-b', 'fr-c', 'fr-d', 'fr-e']);
  assert.deepEqual([...B.list('de')], []);
  assert.equal(B.loaded('fr-a'), null, 'the index loads no book');
  let got = null;
  B.get('fr-a', (err, b) => { got = err || b; });
  B.get('fr-a', () => {});
  await tick(20);
  assert.deepEqual(loads, ['fr-a'], 'one file, loaded once, only when asked');
  assert.equal(got.id, 'fr-a'); assert.equal(got.chapters.length, 3);
  assert.ok(got.chapters.every((c) => c.title && c.paras.length && c.paras.every((p) => typeof p === 'string' && !/[<>]/.test(p))), 'chapters of plain paragraphs');
  let again = null; B.get('fr-a', (e, b) => { again = b; });
  assert.equal(again, got, 'already loaded: answered at once');
  B.get('fr-b', () => {}); await tick(20); B.get('fr-c', () => {}); await tick(20);
  assert.equal(B.loaded('fr-a'), null, 'the oldest book left memory');
  assert.ok(B.loaded('fr-b') && B.loaded('fr-c'));
  let err = null; B.get('nope', (e) => { err = e; }); await tick(20);
  assert.ok(err, 'a missing file answers with an error');
  let bad = null; B.get('../x', (e) => { bad = e; });
  assert.ok(bad, 'a strange id is refused');
});

test('the shelf: novels only (the 1.15 tales are out), never the SAMPLE, a source and a licence needed; free or Premium from the data', () => {
  const ctx = load(READ);
  const R = ctx.Reading;
  ctx.BellatrixBooks._reset();
  vm.runInContext(read(SAMPLE), ctx, { filename: SAMPLE });
  assert.ok(ctx.BellatrixBooks.entry('sample-fr-demo'), 'the sample registered itself');
  assert.deepEqual([...R.books('fr')], [], 'the sample is never offered');
  assert.equal(R.books('fr', { samples: true }).length, 1, 'tests may see it');
  withShelf(ctx, SHELF.concat([
    { id: 'fr-x', lang: 'fr', title: 'Sans source', author: 'A', free: true, chapters: 2, source: '', licence: 'Public domain' },
    { id: 'fr-y', lang: 'fr', title: 'Sans licence', author: 'A', free: true, chapters: 2, source: 'https://fr.wikisource.org/wiki/Y', licence: '' },
    { id: 'fr-z', lang: 'fr', title: 'Http', author: 'A', free: true, chapters: 2, source: { url: 'http://example.org/z' }, licence: 'PD' }]));
  const ids = R.books('fr').map((b) => b.id);
  assert.deepEqual([...ids], ['fr-a', 'fr-b', 'fr-c', 'fr-d', 'fr-e'], 'no source, no licence or no https: not offered');
  for (const t of R.data.stories) assert.ok(!ids.includes(t.id), t.id + ' (a 1.15 tale) is out of the list');
  const books = R.books('fr');
  assert.equal(books.filter((b) => !b.premium).length, 2, '2 free'); assert.equal(books.filter((b) => b.premium).length, 3, '3 Livres Premium');
  assert.deepEqual([...R.books('fr', { only: ['fr-b', 'fr-e'] }).map((b) => b.id)], ['fr-b', 'fr-e'], 'Personalise can keep only some books');
  /* the licence register of the tales is still there */
  const json = JSON.parse(read('data/reading-licences.json'));
  assert.equal(json.stories.length, R.data.stories.length);
  /* never an empty shelf on the robot: until a language has novels, its tales fill the shelf */
  const c2 = load(READ), R2 = c2.Reading;
  c2.BellatrixBooks._reset();
  assert.deepEqual([...R2.shelfFor('de').map((b) => b.id)], [...R2.stories('de').map((s) => s.id)], 'no novel yet: the tales');
  assert.ok(R2.shelfFor('de').length >= 2);
  assert.equal(R2.bookById('de-sterntaler').chapters[0].paras.length, R2.storyById('de-sterntaler').paragraphs.length, 'a tale opens as a one-chapter book');
  withShelf(c2);
  assert.deepEqual([...R2.shelfFor('fr').map((b) => b.id)], ['fr-a', 'fr-b', 'fr-c', 'fr-d', 'fr-e'], 'novels there: novels only');
  assert.ok(R2.shelfFor('de').every((b) => b.tale), 'German has no novel yet: still its tales');
});

test('the real shelf (js/books/index.js): 2 free and 3 Premium novels per language; each file registers the same book, plain paragraphs', () => {
  const ctx = load(READ);
  const R = ctx.Reading, B = ctx.BellatrixBooks;
  const all = B.list().filter((e) => !e.sample);
  if (!all.length) return; /* the novels are not there yet */
  for (const l of ['fr', 'de', 'en']) {
    const list = R.books(l);
    assert.equal(list.length, B.list(l).filter((e) => !e.sample).length, l + ': every indexed novel is complete (source https, licence, chapters)');
    if (list.length === 5) { assert.equal(list.filter((b) => !b.premium).length, 2, l + ': 2 free'); assert.equal(list.filter((b) => b.premium).length, 3, l + ': 3 Premium'); }
    assert.ok(R.shelfFor(l).every((b) => !b.tale), l + ': no tale once the novels are there');
  }
  for (const e of all) {
    const file = 'js/books/' + e.id + '.js';
    if (!fs.existsSync(path.join(ROOT, file))) continue; /* still being written */
    vm.runInContext(read(file), ctx, { filename: file });
    const b = B.loaded(e.id);
    assert.ok(b, file + ' registers ' + e.id);
    assert.equal(b.lang, e.lang); assert.equal(b.free, e.free); assert.equal(b.chapters.length, e.chapters, e.id + ': chapters as in the index');
    assert.ok(b.chapters.every((c) => c.paras.length && c.paras.every((p) => typeof p === 'string' && !/<\/?[a-z][^>]*>/i.test(p))), e.id + ': plain paragraphs, no HTML');
    /* the first chapter cuts into pages quickly (one chapter at a time) */
    const t0 = Date.now(), pgs = R.chapterPages(b, 0, R.pageSize(false, false));
    assert.ok(pgs.length >= 1 && Date.now() - t0 < 500, e.id + ': chapter 1 paginates');
  }
});

test('covers are drawn SVG from the title, the author and a colour per book (no photo); Premium shows a crown', () => {
  const { Reading: R } = load(READ);
  const a = R.coverSvg({ id: 'fr-a', title: 'Le Tour du monde en quatre-vingts jours', author: 'Jules Verne', premium: false });
  const b = R.coverSvg({ id: 'fr-b', title: 'La Petite Fadette', author: 'George Sand', premium: true });
  assert.match(a, /^<svg[^>]*viewBox="0 0 120 170"/);
  assert.match(a, />Le Tour du</); assert.match(a, /Jules Verne/);
  assert.doesNotMatch(a + b, /<image|href=|url\(|\.jpg|\.png|base64/i, 'nothing but drawing');
  assert.notEqual(/fill="(#[0-9A-F]{6})"/i.exec(a)[1], /fill="(#[0-9A-F]{6})"/i.exec(b)[1], 'one colour per book');
  assert.ok(b.includes('#F2C14E') && !a.includes('#F2C14E'), 'a crown on a Premium cover');
  assert.equal(R.coverSvg({ id: 'x', title: '<script>', author: '"&' }).includes('<script>'), false, 'texts are escaped');
});

/* ---------------------------------------------------------------- Livres Premium */
test('Livres Premium is its own product: Bellatrix Play Premium never opens a book; per resident; asking uses Premium.ask(code, "books")', () => {
  const P = premiumV3();
  const ctx = load(READ, undefined, { Premium: P });
  const R = ctx.Reading;
  withShelf(ctx);
  const prem = R.books('fr').find((b) => b.premium), free = R.books('fr').find((b) => !b.premium);
  assert.equal(R.product, 'books');
  assert.equal(R.locked(free, 'P1'), false, 'free books are always open');
  assert.equal(R.locked(prem, 'P1'), true);
  P.activate('P1', 'play');
  assert.equal(R.locked(prem, 'P1'), true, 'Play Premium does NOT open a Premium book');
  assert.equal(R.toggleFav('P1', free.id), false, 'no favourites with Play Premium only');
  P.activate('P1', 'books');
  assert.equal(R.locked(prem, 'P1'), false, 'books Premium opens it');
  assert.equal(R.locked(prem, 'p1 '), false, 'codes are not case-sensitive');
  assert.equal(R.locked(prem, 'P2'), true, 'only for that resident');
  P.deactivate('P1', 'play');
  assert.equal(R.locked(prem, 'P1'), false, 'turning Play off changes nothing for books');
  assert.equal(R.toggleFav('P1', free.id), true);
  P.deactivate('P1', 'books');
  assert.equal(R.locked(prem, 'P1'), true, 'books Premium off: locked again');
  assert.equal(R.asked('P2'), false);
  assert.equal(R.ask('P2'), true);
  assert.deepEqual(P.asks, [['P2', 'books']], 'the request is for the product books, for this resident');
  assert.equal(R.asked('P2'), true); assert.equal(R.asked('P3'), false);
  assert.equal(R.ask(''), false, 'no resident, no request');
});

test('Livres Premium with the real js/premium.js: v3 keeps books apart from Play; the 1.15 file (Play only) opens no book', () => {
  const ctx = load(['js/premium.js'].concat(READ), memoryStorage());
  const { Reading: R, Premium } = ctx;
  withShelf(ctx);
  const prem = R.books('fr').find((b) => b.premium);
  if (typeof Premium.ask === 'function') {
    Premium.activate('P1', 'play', { until: null, by: 'T', source: 'team' });
    assert.equal(R.locked(prem, 'P1'), true, 'Play Premium (v3) does not open a book');
    Premium.activate('P1', 'books', { until: null, by: 'T', source: 'team' });
    assert.equal(R.locked(prem, 'P1'), false, 'books Premium (v3) opens it');
    assert.equal(R.locked(prem, 'P2'), true);
    R.ask('P2');
    assert.equal(!!Premium.asked('P2', 'books'), true);
    assert.equal(!!Premium.asked('P2', 'play'), false, 'asking for a book is not asking for Play');
  } else {
    Premium.activate('P1', 'team-1', { until: null, source: 'team' });
    assert.equal(R.locked(prem, 'P1'), true, 'the 1.15 Premium (Play only) never opens a book');
  }
});

/* ---------------------------------------------------------------- pages, chapters, places */
test('pages: one chapter at a time, every word kept, the chapter title on top; the place is a paragraph and survives another page size', () => {
  const ctx = load(READ);
  const R = ctx.Reading;
  vm.runInContext(read(SAMPLE), ctx, { filename: SAMPLE });
  const book = ctx.BellatrixBooks.loaded('sample-fr-demo');
  const words = (t) => t.replace(/\s+/g, ' ').trim();
  for (const [two, big] of [[false, false], [true, false], [false, true], [true, true]]) {
    const size = R.pageSize(two, big);
    book.chapters.forEach((ch, c) => {
      const pgs = R.chapterPages(book, c, size);
      assert.ok(pgs.length >= 1);
      assert.equal(pgs[0].parts[0].head, ch.title, 'the chapter title opens its first page');
      assert.equal(words(pgs.map(R.pageText).join(' ')), words(ch.title + ' ' + ch.paras.join(' ')), 'chapter ' + c + ': the text is kept as it is');
      for (const p of pgs) assert.ok(R.pageText(p).length <= size.chars * 1.6, 'page too long');
    });
  }
  /* a place saved on the upright screen opens on the page holding the same paragraph on the wide one */
  const small = R.chapterPages(book, 0, R.pageSize(false, true)), wide = R.chapterPages(book, 0, R.pageSize(true, false));
  for (let i = 0; i < small.length; i++) {
    const para = R.paraOfPage(small[i]), j = R.pageAtPara(wide, para);
    assert.ok(wide[j].parts.some((p) => p.pi === para), 'page ' + i + ': paragraph ' + para + ' is on the page it opens');
    assert.ok(wide[j].parts.some((p) => p.pi === para && !p.cont) || j === 0 || wide[j].parts[0].pi === para, 'it opens where the paragraph starts');
  }
  assert.equal(R.pageAtPara(small, 0), 0);
  assert.equal(R.percentAt(book, 0, 0), 0);
  assert.ok(R.percentAt(book, 1, 0) > 20 && R.percentAt(book, 1, 0) < 60);
  assert.ok(R.percentAt(book, 2, 3) > R.percentAt(book, 2, 0));
  assert.ok(R.percentAt(book, 2, 99) <= 100);
});

test('long chapters are cut a window at a time; a place deep inside a long chapter opens on its paragraph, on any screen', async () => {
  const ctx = load(READ);
  const R = ctx.Reading;
  /* a chapter of 2 000 paragraphs (about 400 000 characters), like the biggest chapters of the shelf */
  const paras = Array.from({ length: 2000 }, (_, i) => 'Paragraphe ' + i + '. ' + 'Une phrase assez longue pour remplir la page, et qui continue encore un peu. '.repeat(2 + (i % 4)));
  const book = { id: 'long', title: 'Long', author: 'A', chapters: [{ title: 'Un', paras }, { title: 'Deux', paras: ['Fin.'] }] };
  const w = R.windowsOf(book.chapters[0]);
  assert.ok(w.length > 40, 'many windows');
  assert.equal(w[0], 0);
  const words = (t) => t.replace(/\s+/g, ' ').trim();
  const size = R.pageSize(false, false);
  let t0 = Date.now(), first = R.windowPages(book, 0, 0, size);
  const tFirst = Date.now() - t0;
  assert.equal(first[0].parts[0].head, 'Un', 'the chapter title on the first page of the first window only');
  assert.ok(tFirst < 50, 'one window is quick to cut (' + tFirst + ' ms)');
  /* every word of the chapter is in its windows, once, in order */
  let all = [];
  for (let k = 0; k < w.length; k++) all = all.concat(R.windowPages(book, 0, k, size).map(R.pageText));
  assert.equal(words(all.join(' ')), words('Un ' + paras.join(' ')));
  /* a deep place: its window, then the page where the paragraph starts, on every page size */
  for (const para of [0, 777, 1234, 1999]) {
    const k = R.windowOfPara(book.chapters[0], para);
    assert.ok(w[k] <= para && (k + 1 === w.length || w[k + 1] > para), 'window ' + k + ' holds paragraph ' + para);
    for (const [two, big] of [[false, false], [true, false], [true, true]]) {
      const pgs = R.windowPages(book, 0, k, R.pageSize(two, big)), i = R.pageAtPara(pgs, para);
      assert.ok(pgs[i].parts.some((p) => p.pi === para && !p.cont), 'paragraph ' + para + ' starts on the page it opens');
      assert.equal(R.paraOfPage(pgs[i]), para, 'and the page saves the same paragraph again');
    }
  }
  assert.ok(R.percentAt(book, 0, 1000) > 40 && R.percentAt(book, 0, 1000) < 60);
});

test('page navigation: views of one or two pages, turns forward and back, across chapters', () => {
  const { Reading: R } = load(READ);
  assert.equal(R.viewCount(5, true), 3); assert.equal(R.viewCount(5, false), 5); assert.equal(R.viewCount(0, true), 1);
  assert.deepEqual([...R.viewPages(5, 2, true)], [4, -1], 'the last spread of an odd chapter has a blank right page');
  assert.equal(R.viewOfPage(3, true), 1); assert.equal(R.viewOfPage(3, false), 3);
  assert.deepEqual({ ...R.turnPlan(5, 0, 1, true) }, { to: 1, reverse: false, front: 1, back: 2, left: 0, right: 3 });
  assert.deepEqual({ ...R.turnPlan(5, 1, -1, true) }, { to: 0, reverse: true, front: 1, back: 2, left: 0, right: 3 });
  assert.deepEqual({ ...R.turnPlan(5, 0, 1, false) }, { to: 1, reverse: false, front: 0, back: -1, left: null, right: 1 });
  assert.equal(R.turnPlan(5, 0, -1, true), null); assert.equal(R.turnPlan(5, 2, 1, true), null);
  for (const two of [true, false]) for (let n = 1; n <= 7; n++) for (let v = 0; v < R.viewCount(n, two) - 1; v++) {
    const f = R.turnPlan(n, v, 1, two), b = R.turnPlan(n, v + 1, -1, two);
    assert.deepEqual({ ...f, to: 0, reverse: 0 }, { ...b, to: 0, reverse: 0 }, 'forward and back use the same leaf');
  }
  /* across chapters: chapter 0 has 3 views, chapter 1 has 2 */
  const counts = (c) => [3, 2][c];
  assert.deepEqual({ ...R.stepFrom({ c: 0, v: 2 }, 1, 2, counts) }, { c: 1, k: 0, v: 0 });
  assert.deepEqual({ ...R.stepFrom({ c: 1, v: 0 }, -1, 2, counts) }, { c: 0, k: 0, v: 2 });
  /* with windows: chapter 0 has 3 windows of 2 views, chapter 1 has 1 */
  const wc = (c, k) => 2, ww = (c) => [3, 1][c];
  assert.deepEqual({ ...R.stepFrom({ c: 0, k: 0, v: 1 }, 1, 2, wc, ww) }, { c: 0, k: 1, v: 0 }, 'into the next window');
  assert.deepEqual({ ...R.stepFrom({ c: 0, k: 2, v: 1 }, 1, 2, wc, ww) }, { c: 1, k: 0, v: 0 }, 'into the next chapter');
  assert.deepEqual({ ...R.stepFrom({ c: 0, k: 1, v: 0 }, -1, 2, wc, ww) }, { c: 0, k: 0, v: 1 }, 'back into the window before');
  assert.deepEqual({ ...R.stepFrom({ c: 1, k: 0, v: 0 }, -1, 2, wc, ww) }, { c: 0, k: 2, v: 1 }, 'back into the last window of the chapter before');
  assert.equal(R.stepFrom({ c: 1, v: 1 }, 1, 2, counts), null, 'the end of the book');
  assert.equal(R.stepFrom({ c: 0, v: 0 }, -1, 2, counts), null);
  const a = ['A4', null], b = ['B0', 'B1'];
  assert.deepEqual({ ...R.turnBetween(a, b, 1, true) }, { reverse: false, front: null, back: 'B0', left: 'A4', right: 'B1' }, 'into the next chapter');
});

test('places: per resident and per book, for everyone; they survive a restart, another language and another resident', () => {
  const st = memoryStorage();
  let ctx = load(READ, st);
  let R = ctx.Reading;
  assert.equal(R.placeOf('P1', 'fr-a'), null);
  assert.equal(R.savePlace('P1', 'fr-a', { ch: 2, para: 7, pct: 41 }, Date.UTC(2026, 10, 10, 9)), true);
  R.savePlace('P2', 'fr-a', { ch: 0, para: 3, pct: 2 });
  R.savePlace('p1', 'de-x', { ch: 1, para: 0, pct: 30 });
  const saved = JSON.parse(st.getItem('bellatrix-reading-places'));
  assert.deepEqual(saved.P1['fr-a'], { ch: 2, para: 7, at: '2026-11-10T09:00:00.000Z', pct: 41 });
  assert.equal(R.savePlace('', 'fr-a', { ch: 1, para: 1 }), false, 'no resident, no place');
  /* a restart (a new page on the same storage), another language: the same places */
  ctx = load(READ, st); R = ctx.Reading;
  assert.equal(R.placeOf('P1', 'fr-a').para, 7);
  assert.equal(R.placeOf('P2', 'fr-a').para, 3, 'each resident keeps their own place');
  assert.equal(R.placeOf('P1', 'de-x').ch, 1);
  const t = (k, v) => ctx.I18N ? ctx.I18N.t('fr', k, v) : String(k).replace(/\{(\w+)\}/g, (m, x) => v[x]);
  assert.equal(R.progressLabel(R.placeOf('P1', 'fr-a'), 5), 'Chapter 3 · 41 %');
  assert.equal(R.progressLabel(R.placeOf('P1', 'fr-a'), 1), '41 %');
  assert.equal(R.progressLabel({ ch: 0, para: 0, done: true }, 5), 'Finished');
  assert.equal(R.progressLabel(null, 5), '');
  void t;
});

test('a session: the shelf shows this resident’s progress; a book opens on demand at their page, with one short line; chapters and "From the beginning"; the end', async () => {
  const storage = memoryStorage();
  let r = runActivity({ storage, patient: 'P1' });
  const list = r.act.start(r.L);
  /* the upright tablet (2026-11-14, the Bellatrix Play family look): every book at once, as covers */
  assert.equal(list.style, 'cards'); assert.equal(list.choices.length, SHELF.filter((b) => b.lang === 'fr').length);
  assert.deepEqual([...main(list).map((a) => a.label)], ['J’ai fini']);
  assert.equal(list.cls, 'bp-screen bk-screen');
  assert.ok(list.body.includes('class="bp m-app bk') && list.body.includes('m-song-grid') && list.body.includes('m-main-nav') && list.body.includes('m-player'), 'Play’s frame: covers, tabs, player bar');
  assert.equal((list.body.match(/data-a="c"/g) || []).length, list.choices.length, 'one cover per book, pressing the step’s own choice');
  assert.ok(list.choices[0].art.includes('<svg class="rdcoverart"'), 'a drawn cover');
  let pg = await openFromList(r, 'fr-a');
  assert.deepEqual(r.loads, ['fr-a'], 'the book file is loaded when it is opened');
  assert.equal(pg.id, 'reading-page');
  assert.ok(pg.body.includes('class="rdbook one'), 'one page on the upright screen');
  assert.deepEqual([...main(pg).map((a) => a.label)], ['Page précédente', 'Page suivante', 'Pause'], 'three big buttons');
  assert.deepEqual([...pg.actions.filter((a) => a.nav).map((a) => a.label)], ['Accueil', 'Chapitres', 'Vitesse de lecture', 'J’ai fini'], 'the frame: tabs, speed, Finish');
  for (const k of [0, 1, 2]) assert.ok(pg.body.includes('data-a="a" data-i="' + k + '"'), 'the player bar presses action ' + k);
  assert.ok(pg.body.includes('m-main-play bp-pp') && pg.body.includes('m-progress'), 'a big play / pause and the progress, as in Play');
  assert.ok(/Chapitre premier/.test(pg.say()), 'the voice reads the chapter title and the page');
  assert.equal(pg.actions[0].disabled, true);
  /* read on into chapter 2 (auto-turn after reading, then Next) */
  pg.afterSay(); assert.equal(r.later.length, 1, 'a short pause, then the page turns'); r.later.shift()();
  let guard = 0;
  while (last(r.steps).reading.chapter < 1 && guard++ < 40) last(r.steps).actions[1].run();
  last(r.steps).actions[1].run();
  pg = last(r.steps);
  assert.equal(pg.reading.chapter, 1);
  const place = JSON.parse(storage.getItem('bellatrix-reading-places')).P1['fr-a'];
  assert.equal(place.ch, 1); assert.equal(place.para, pg.reading.para); assert.ok(place.pct > 0 && place.pct < 100);
  /* another resident in between, then P1 again after a "restart" */
  const r2 = runActivity({ storage, patient: 'P2' });
  const p2 = await openFromList(r2, 'fr-a');
  assert.equal(p2.reading.chapter, 0, 'P2 starts at the beginning');
  r = runActivity({ storage, patient: 'P1' });
  const shelf = r.act.start(r.L);
  assert.equal(shelf.choices[0].value, 'fr-a', 'the book being read comes first');
  assert.ok(shelf.choices[0].art.includes('Chapitre 2 · ' + place.pct + ' %'), 'its progress for P1');
  assert.ok(pg.body.includes('Chapitre 2 · ' + place.pct + ' %'), 'the same line in the book');
  pg = await openFromList(r, 'fr-a');
  assert.equal(pg.reading.chapter, 1);
  assert.equal(pg.reading.para, place.para, 'back on the same paragraph');
  assert.match(pg.say(), /^On reprend à la page \d+\. /, 'one short line, then the page');
  /* the chapters, with "From the beginning" */
  const chs = pg.chapters();
  assert.equal(chs.id, 'reading-chapters');
  assert.equal(chs.choices.length, 3);
  assert.equal(chs.choices[1].cls, 'rdchnow');
  assert.deepEqual([...main(chs).map((a) => a.label)], ['Depuis le début']);
  chs.choices[2].run();
  assert.equal(last(r.steps).reading.chapter, 2);
  chs.actions[0].run();
  assert.equal(last(r.steps).reading.chapter, 0); assert.equal(last(r.steps).reading.view, 0);
  /* to the end */
  guard = 0;
  while (last(r.steps).id === 'reading-page' && guard++ < 80) last(r.steps).actions[1].run();
  assert.equal(last(r.steps).id, 'reading-end');
  assert.equal(last(r.steps).title, 'Fin du livre.');
  assert.equal(JSON.parse(storage.getItem('bellatrix-reading-places')).P1['fr-a'].done, true);
  assert.ok(r.act.start(r.L).choices.find((c) => c.value === 'fr-a').art.includes('Terminé'));
  /* opening it again starts from the beginning, without the line */
  pg = await openFromList(r, 'fr-a');
  assert.equal(pg.reading.chapter, 0); assert.doesNotMatch(pg.say(), /^On reprend/);
  /* the family feed hears what was read (js/family-sync.js, when it is on the page) */
  const heard = [];
  const fs2 = runActivity({ extra: { FamilySync: { listen: (d) => { heard.push(d); return true; } } } });
  const fp = await openFromList(fs2, 'fr-b');
  fp.say(); fp.afterSay();
  assert.equal(heard.length, 1);
  assert.equal(heard[0].type, 'book'); assert.equal(heard[0].title, 'Roman B'); assert.equal(heard[0].artist, 'Autrice 1');
  assert.ok(heard[0].durationS >= 0 && !isNaN(Date.parse(heard[0].start)));
  const fsPrev = runActivity({ preview: true, extra: { FamilySync: { listen: (d) => { heard.push(d); return true; } } } });
  const pp = await openFromList(fsPrev, 'fr-b'); pp.say(); pp.afterSay();
  assert.equal(heard.length, 1, 'the Care Team preview tells the family nothing');
  /* manual pages: no auto-turn */
  const m = runActivity({ content: { turn: 'manual' } });
  const mp = await openFromList(m, 'fr-b');
  mp.afterSay(); assert.equal(m.later.length, 0, '"Wait for Next": the page waits');
});

test('a session in the Care Team preview never saves a place; a missing book file says so; Premium books ask the team (no price)', async () => {
  const storage = memoryStorage();
  const pv = runActivity({ storage, preview: true });
  const pg = await openFromList(pv, 'fr-a');
  pg.actions[1].run();
  assert.equal(storage.getItem('bellatrix-reading-places'), null, 'preview: no place saved');
  /* a book whose file is missing */
  const miss = runActivity({ shelf: SHELF.concat([{ id: 'fr-missing', lang: 'fr', title: 'Absent', author: 'A', free: true, chapters: 2, source: 'https://x.org/a', licence: 'PD' }]) });
  miss.ctx.BellatrixBooks._useLoader((id, done) => setTimeout(() => done(new Error('404')), 1));
  const nf = await openFromList(miss, 'fr-missing');
  assert.equal(nf.id, 'reading-noopen');
  assert.equal(nf.title, 'Ce livre ne s’ouvre pas pour le moment.');
  /* Premium */
  const P = premiumV3();
  P.activate('P1', 'play');
  const r = runActivity({ lang: 'fr', extra: { Premium: P } });
  const list = r.act.start(r.L), all = list.choices.slice();
  const c = all.find((x) => x.value === 'fr-c');
  assert.ok(/rdlocked/.test(c.cls), 'locked with a crown (Play Premium does not count)');
  c.run();
  const lk = last(r.steps);
  assert.equal(lk.id, 'reading-locked');
  assert.ok(!/€|price|prix|preis|\d+[.,]\d\d/i.test(lk.title + lk.say + lk.pic + lk.actions.map((a) => a.label).join(' ')), 'no price');
  lk.actions[0].run();
  assert.deepEqual(P.asks, [['P1', 'books']]);
  P.activate('P1', 'books');
  const open = await openFromList(r, 'fr-c');
  assert.equal(open.id, 'reading-page');
  assert.ok(open.body.includes('class="m-like'), 'favourites with books Premium');
});

/* ---------------------------------------------------------------- the 1.15 tales: licence register */
test('the licence register of the 1.15 tales is kept (rows complete), even though the tales are no longer offered', () => {
  const { Reading: R } = load(READ);
  const GOOD = { id: 'x', title: 'T', author: 'A', authorDeath: 1695, translator: null, translatorDeath: null, sourceUrl: 'https://fr.wikisource.org/wiki/X', verifiedOn: '2026-11-09', verifiedBy: 'Claude (research, to be confirmed by LabLand)' };
  assert.equal(R.licenceOk(GOOD, 2026), true);
  assert.equal(R.licenceOk({ ...GOOD, sourceUrl: 'http://insecure.example/x' }, 2026), false);
  assert.equal(R.licenceOk({ ...GOOD, authorDeath: 1960 }, 2026), false, 'died less than 70 years ago');
  assert.equal(R.licenceOk({ ...GOOD, translator: 'X', translatorDeath: null }, 2026), false);
  for (const s of R.data.stories) assert.equal(R.licenceOk(R.licenceFor(s.id), 2026), true, s.id);
  const json = JSON.parse(read('data/reading-licences.json'));
  for (const row of json.stories) {
    const emb = R.licenceFor(row.id);
    for (const k of ['title', 'author', 'authorDeath', 'translator', 'translatorDeath', 'sourceUrl', 'verifiedOn', 'verifiedBy']) assert.deepEqual(emb[k], row[k], row.id + ' ' + k);
  }
  assert.equal(R.spoken('Il estoit une fois & sa mere-grand luy dit', 'fr'), 'Il était une fois et sa mère-grand lui dit');
});

/* ---------------------------------------------------------------- texts, ES5, CSS, pages */
test('i18n: every reading text has French and German on the patient screen (js/reading.js brings its own)', () => {
  const ctx = load(I18N_PATIENT.concat(READ));
  const s = read('js/reading.js'), keys = new Set();
  const Q = "'((?:[^'\\\\]|\\\\.)*)'";
  for (const m of s.matchAll(new RegExp('L\\.t\\(\\s*' + Q, 'g'))) keys.add(m[1]);
  for (const m of s.matchAll(new RegExp("\\bt\\(\\s*" + Q, 'g'))) keys.add(m[1]);
  for (const m of s.matchAll(new RegExp('(?:label|flow|learn|againQuestion|name): ' + Q, 'g'))) keys.add(m[1]);
  for (const m of s.matchAll(/\[\s*'(?:slow|normal|fast|auto|manual)',\s*'([^']+)'\s*\]/g)) keys.add(m[1]);
  assert.ok(keys.size > 30, 'found the texts');
  const missing = [...keys].filter((k) => ctx.I18N.dict.fr[k] === undefined || ctx.I18N.dict.de[k] === undefined);
  assert.deepEqual(missing, []);
});

test('browser code is ES5; css/reading.css: 3D transforms and gradients only, fonts by token, the leaf stays in the book; pages link the files', () => {
  for (const f of ['js/reading.js', 'js/reading-data.js', 'js/books/index.js', SAMPLE]) assert.doesNotMatch(code(f), /\blet\s|\bconst\s|=>|`|\?\.|\?\?|\bclass\s|\.\.\.[a-zA-Z]/, f);
  const css = read('css/reading.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/:has\(|color-mix|mix-blend-mode|background-blend-mode|(?:^|[;{\s])filter\s*:|backdrop-filter/.test(css), 'no :has, color-mix, blend modes or filters');
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^(?:var\(--font(?:-text|-label|-display)?(?:,\s*var\(--font\))?\)|inherit)$/, 'fonts only through the tokens: ' + m[1]);
  assert.match(css, /var\(--font-text, var\(--font\)\)/);
  for (let k = 0; k < 8; k++) { assert.match(css, new RegExp('@keyframes rdk' + k + ' \\{')); assert.match(css, new RegExp('@keyframes rdsh' + k + ' \\{')); }
  assert.match(css, /\.rdbook \{[^}]*overflow: hidden/, 'the book clips the leaf');
  assert.match(css, /\.rdleaf \{[^}]*transform: scaleZ\(\.5\)/, 'the leaf has half the depth');
  const k0 = /@keyframes rdk0 \{([^\n]+)\}/.exec(css)[1];
  assert.match(k0, /^\s*0% \{ transform: rotateY\(0deg\); \}/); assert.match(k0, /100% \{ transform: rotateY\(-180deg\); \}\s*$/);
  for (const html of ['patient.html', 'staff.html']) {
    const h = read(html);
    assert.match(h, /<link rel="stylesheet" href="css\/album-reading\.css[^"]*">\r?\n<link rel="stylesheet" href="css\/reading\.css[^"]*">/, html + ': css/reading.css right after css/album-reading.css');
    assert.match(h, /<script src="js\/reading-data\.js[^"]*"><\/script>\r?\n<script src="js\/books\/index\.js[^"]*"><\/script>\r?\n<script src="js\/reading\.js/, html + ': js/books/index.js between reading-data.js and reading.js');
    assert.doesNotMatch(h, /js\/books\/(?!index\.js)/, html + ': the novels are not in the page (loaded on demand)');
  }
});

test('resume line and incremental pagination: the page number, a deep place, never the whole chapter', () => {
  const ctx = load(READ);
  const R = ctx.Reading;
  const paras = Array.from({ length: 1500 }, (_, i) => 'Paragraphe ' + i + '. ' + 'Une phrase assez longue pour remplir la page. '.repeat(3));
  const book = { id: 'big', title: 'Big', author: 'A', chapters: [{ title: 'Un', paras }] };
  const size = R.pageSize(true, false);
  assert.equal(R.pageNumber(book, 0, 0, size), 1);
  assert.ok(R.pageNumber(book, 0, 1000, size) > R.pageNumber(book, 0, 500, size));
  /* pages are cut only for the window asked: far fewer characters than the chapter */
  const k = R.windowOfPara(book.chapters[0], 1200);
  const pgs = R.windowPages(book, 0, k, size);
  const chars = pgs.map((p) => R.pageText(p).length).reduce((a, b) => a + b, 0);
  const total = paras.join(' ').length;
  assert.ok(chars < total / 20, 'one window is a small part of the chapter (' + chars + ' of ' + total + ')');
  assert.ok(R.windowsOf(book.chapters[0]).length > 20);
  const t0 = Date.now(); R.windowPages(book, 0, k, size);
  assert.ok(Date.now() - t0 < 50, 'a window is cut in under 50 ms');
});
