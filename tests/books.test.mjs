/* Bellatrix 1.16: the 15 public-domain novels of the reading app (js/books/<id>.js and js/books/index.js).
   Content checks only, without a browser: each file runs in a vm with a stub BellatrixBooks.
   The reader itself (js/reading-data.js, js/reading.js) is tested in tests/reading.test.mjs.
   Run: node tests/books.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'js', 'books');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

/* The list agreed for 1.16, in this order: 5 novels per language, 2 of them free. */
const EXPECTED = [
  'fr-verne-tour-du-monde', 'fr-sand-petite-fadette', 'fr-dumas-trois-mousquetaires', 'fr-alain-fournier-grand-meaulnes', 'fr-colette-maison-de-claudine',
  'de-spyri-heidi', 'de-storm-immensee', 'de-fontane-frau-jenny-treibel', 'de-keller-kleider-machen-leute', 'de-mann-koenigliche-hoheit',
  'en-austen-pride-and-prejudice', 'en-gaskell-cranford', 'en-montgomery-anne-of-green-gables', 'en-doyle-adventures-of-sherlock-holmes', 'en-jerome-three-men-in-a-boat'
];
const FREE = ['fr-verne-tour-du-monde', 'fr-sand-petite-fadette', 'de-spyri-heidi', 'de-storm-immensee', 'en-austen-pride-and-prejudice', 'en-gaskell-cranford'];
const NOVELLAS = ['de-storm-immensee', 'de-keller-kleider-machen-leute'];   /* no chapters of their own: 1 is enough */
const MAX_BYTES = 2 * 1024 * 1024;

/* The novel files: everything in js/books except the index and the SAMPLE files of the reader tests. */
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('sample-')).sort();

/* Runs a file as the page runs it, with a stub shelf. */
function run(file) {
  const added = [], indexed = [];
  const ctx = { BellatrixBooks: { add: (b) => { added.push(b); return b; }, index: (l) => { indexed.push(l); return l.length; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: 'js/books/' + file });
  /* Back to plain objects (the vm has its own Array and Object). */
  return JSON.parse(JSON.stringify({ added, indexed }));
}

const BOOKS = {};
for (const f of FILES) BOOKS[f] = run(f).added[0];

function texts(b) {
  const out = [];
  for (const c of b.chapters) { out.push(c.title); for (const p of c.paras) out.push(p); }
  return out;
}
const wordsOf = (b) => b.chapters.reduce((n, c) => n + c.paras.reduce((m, p) => m + p.trim().split(/\s+/).filter(Boolean).length, 0), 0);

test('the 15 novel files are all here, one per id, none extra', () => {
  assert.deepEqual(FILES.map((f) => f.replace(/\.js$/, '')).sort(), EXPECTED.slice().sort());
});

test('each file is ES5: one comment line, then BellatrixBooks.add(<JSON>); and nothing else', () => {
  for (const f of FILES) {
    const src = read(f);
    const m = /^\/\* ([^\n]*?) \*\/\nBellatrixBooks\.add\((\{[\s\S]*\})\);\n$/.exec(src);
    assert.ok(m, f + ': the agreed shape');
    assert.match(m[1], /^.+, .+ \(\d{4}\)\. Public domain\. Source: https:\/\/\S+\. Text cleaned for Bellatrix \(10 Nov 2026\)\.$/, f + ': the header comment');
    /* JSON without raw U+2028/U+2029 is a valid ES5 expression; the script must also compile. */
    assert.doesNotThrow(() => JSON.parse(m[2]), f + ': the object is plain JSON');
    assert.doesNotThrow(() => new vm.Script(src, { filename: f }), f + ': compiles');
    const ran = run(f);
    assert.equal(ran.added.length, 1, f + ': one add() call');
    assert.equal(ran.indexed.length, 0, f + ': a book file does not touch the index');
  }
});

test('U+2028 and U+2029 are escaped (illegal raw in ES5 strings)', () => {
  for (const f of FILES.concat(['index.js'])) assert.doesNotMatch(read(f), /[\u2028\u2029]/, f);
});

test('the fields: id, lang, title, author, year, free, source, licence; chapters of non-empty paragraphs', () => {
  for (const f of FILES) {
    const b = BOOKS[f];
    assert.equal(b.id, f.replace(/\.js$/, ''), f + ': id = file name');
    assert.match(b.id, /^[a-z0-9-]+$/, f + ': id in lower-case ASCII');
    assert.ok(['fr', 'de', 'en'].includes(b.lang), f + ': lang');
    assert.equal(b.id.slice(0, 3), b.lang + '-', f + ': the id starts with the language');
    for (const k of ['title', 'author']) assert.ok(typeof b[k] === 'string' && b[k].trim(), f + ': ' + k);
    assert.ok(Number.isInteger(b.year) && b.year > 1800 && b.year < 1930, f + ': year');
    assert.equal(typeof b.free, 'boolean', f + ': free');
    assert.match(b.source, /^https:\/\/(www\.gutenberg\.org\/ebooks\/\d+|(fr|de)\.wikisource\.org\/\S+)$/, f + ': source');
    assert.equal(b.licence, 'public-domain', f + ': licence');
    assert.ok(read(f).includes('Source: ' + b.source + '.'), f + ': the comment names the same source');
    assert.equal(b.sample, undefined, f + ': not a sample');
    const min = NOVELLAS.includes(b.id) ? 1 : 3;
    assert.ok(Array.isArray(b.chapters) && b.chapters.length >= min, f + ': at least ' + min + ' chapter(s)');
    b.chapters.forEach((c, i) => {
      assert.ok(typeof c.title === 'string' && c.title.trim(), f + ': chapter ' + i + ' has a title');
      assert.ok(Array.isArray(c.paras) && c.paras.length > 0, f + ': chapter ' + i + ' has paragraphs');
      c.paras.forEach((p, j) => assert.ok(typeof p === 'string' && p.trim() && p === p.trim(), f + ': chapter ' + i + ' paragraph ' + j));
    });
  }
});

test('clean text: no trademark, no illustration or footnote marks, no emphasis marks, no HTML', () => {
  for (const f of FILES) {
    const src = read(f), b = BOOKS[f];
    assert.doesNotMatch(src, /Gutenberg/, f + ': "Gutenberg" (the source URL is lower case)');
    for (const s of texts(b)) {
      const at = f + ': ' + s.slice(0, 80);
      assert.doesNotMatch(s, /gutenberg/i, at);
      assert.doesNotMatch(s, /\[(Illustration|Picture|Fußnote|Footnote)/i, at);
      assert.doesNotMatch(s, /\[\d+\]|\{\d+\}/, at + ' (footnote or page mark)');
      assert.doesNotMatch(s, /_/, at + ' (underscore emphasis)');
      assert.doesNotMatch(s, /=\S|\S=/, at + ' (=gesperrt= emphasis)');
      assert.doesNotMatch(s, /\*\*\* /, at);
      assert.doesNotMatch(s, /<\/?[a-zA-Z!][^>]*>|&[a-z]+;|&#\d+;/, at + ' (HTML)');
      assert.doesNotMatch(s, /\s{2}|[\n\r\t]/, at + ' (joined lines)');
      assert.doesNotMatch(s, /(^(e-text )?(produced|prepared) by|distributed proofreading|transcriber|anmerkungen zur transkription|end of (the )?project|www\.|https?:)/i, at + ' (producer or transcriber note)');
    }
  }
});

test('each file is under 2 MB', () => {
  for (const f of FILES) assert.ok(fs.statSync(path.join(DIR, f)).size < MAX_BYTES, f);
});

test('the index: metadata only, in the agreed order, matching the files (ids, free flags, chapter and word counts)', () => {
  const src = read('index.js');
  const ran = run('index.js');
  assert.equal(ran.added.length, 0, 'the index adds no book');
  assert.equal(ran.indexed.length, 1, 'one index() call');
  const list = ran.indexed[0];
  assert.deepEqual(list.map((e) => e.id), EXPECTED, 'the order of the list');
  for (const e of list) {
    const b = BOOKS[e.id + '.js'];
    assert.ok(b, e.id + ': has a file');
    assert.deepEqual(Object.keys(e).sort(), ['author', 'chapters', 'free', 'id', 'lang', 'licence', 'source', 'title', 'words', 'year'], e.id + ': metadata fields only');
    for (const k of ['lang', 'title', 'author', 'year', 'free', 'source', 'licence']) assert.equal(e[k], b[k], e.id + ': ' + k);
    assert.equal(e.chapters, b.chapters.length, e.id + ': chapter count');
    assert.equal(e.words, wordsOf(b), e.id + ': word count');
  }
  assert.ok(src.length < 20000, 'the index stays small (no text)');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /\blet\s|\bconst\s|=>|`|\?\.|\?\?|\bclass\s/, 'ES5');
});

test('2 free books per language, the agreed ones; 5 per language', () => {
  for (const lang of ['fr', 'de', 'en']) {
    const all = Object.values(BOOKS).filter((b) => b.lang === lang);
    assert.equal(all.length, 5, lang + ': 5 novels');
    assert.equal(all.filter((b) => b.free).length, 2, lang + ': 2 free');
  }
  assert.deepEqual(Object.values(BOOKS).filter((b) => b.free).map((b) => b.id).sort(), FREE.slice().sort());
});
