/* 1.16 workstream D: new content every day (js/daily.js), logic tests without a browser.
   Run: node tests/daily.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/daily.js'), 'utf8');
function memoryStorage() {
  const m = {};
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
/* js/daily.js run as the page runs it; storage can be shared between two "pages". */
function load(storage, extra) {
  const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, localStorage: storage === undefined ? memoryStorage() : storage, ...(extra || {}) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'js/daily.js' });
  return ctx.Daily;
}
function day(n) { const d = new Date(2026, 10, 10 + n, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const plain = (x) => JSON.parse(JSON.stringify(x));
const LIFE = { born: '1945', birthday: '14.11', home: 'Lyon', loves: 'Piaf, waltz', avoid: 'rock', talk: 'her garden, her dog Rex' };
const LANGS = ['en', 'fr', 'de'];

test('banks: hundreds of sayings per language, many questions, memories and seated exercises', () => {
  const D = load();
  const n = D.size();
  for (const l of LANGS) assert.ok(n.sayings[l] >= 200, l + ' sayings ' + n.sayings[l]);
  assert.ok(n.quiz >= 50, 'quiz ' + n.quiz);
  assert.ok(n.memories >= 25, 'memories ' + n.memories);
  assert.ok(n.move >= 50, 'moves ' + n.move);
  for (const z of D.ZONES) assert.ok(D._banks.MOVES.filter((m) => m.zone === z).length >= 8, 'zone ' + z);
});

test('stable within a day: same batch on every opening, after a reload, on the other page', () => {
  const st = memoryStorage();
  const D = load(st);
  for (const kind of D.KINDS) {
    const a = plain(D.get(kind, { lang: 'fr', code: 'P1', life: LIFE, date: day(0) }));
    const b = plain(D.get(kind, { lang: 'fr', code: 'P1', life: LIFE, date: day(0) }));
    assert.deepEqual(a, b, kind);
    assert.ok(a.length > 0, kind + ' not empty');
    /* The Care Team page (same robot storage), and the patient page reloaded. */
    const other = load(st);
    assert.deepEqual(plain(other.get(kind, { lang: 'fr', code: 'P1', life: LIFE, date: day(0) })), a, kind + ' after reload');
    /* Called without the life story (e.g. by the Care Team to list today's items): the day's batch as it is. */
    assert.deepEqual(plain(other.get(kind, { lang: 'fr', code: 'P1', date: day(0) })), a, kind + ' peek');
    assert.deepEqual(plain(other.peek(kind, { lang: 'fr', code: 'P1', date: day(0) })), a, kind + ' Daily.peek');
  }
  const s1 = D.get('sayings', { lang: 'en', code: 'P1', life: {}, date: day(0) });
  assert.equal(s1.src, 'local');
  assert.equal(s1.date, day(0));
  assert.deepEqual(plain(s1.items), plain(s1), 'array and .items');
  /* Another resident gets another batch. */
  assert.notDeepEqual(plain(D.get('sayings', { lang: 'en', code: 'P2', life: {}, date: day(0) })).map((x) => x.id), plain(s1).map((x) => x.id));
});

test('new across days: no saying comes back within a month, quiz, memories and moves change daily', () => {
  for (const l of LANGS) {
    const D = load();
    const seen = {};
    for (let i = 0; i < 30; i++) {
      for (const s of D.get('sayings', { lang: l, code: 'P1', life: {}, date: day(i) })) {
        assert.equal(seen[s.id], undefined, l + ': "' + s.start + ' ' + s.end + '" again on day ' + i + ' (first ' + seen[s.id] + ')');
        seen[s.id] = i;
      }
    }
    assert.equal(Object.keys(seen).length, 180, l + ': 30 days × 6 sayings, all different');
  }
  const D = load();
  const last = {};
  function window(kind, n, idsOf) {
    for (let i = 0; i < 40; i++) {
      for (const id of idsOf(D.get(kind, { lang: 'de', code: 'P3', life: {}, date: day(i) }))) {
        if (last[kind + id] !== undefined) assert.ok(i - last[kind + id] >= n, kind + ' ' + id + ' came back after ' + (i - last[kind + id]) + ' days');
        last[kind + id] = i;
      }
    }
  }
  window('quiz', 8, (b) => b.map((x) => x.id));
  window('memories', 5, (b) => b.map((x) => x.id));
  window('move', 2, (b) => b.map((x) => x.id));
  /* The answers of a question that comes back are drawn again. */
  const a = D.get('quiz', { lang: 'en', code: 'P4', life: {}, date: day(0) }), b = D.get('quiz', { lang: 'en', code: 'P4', life: {}, date: day(1) });
  assert.notDeepEqual(plain(a), plain(b));
});

test('the resident’s language: every text comes from that language', () => {
  const D = load();
  const banks = D._banks;
  for (const l of LANGS) {
    const say = D.get('sayings', { lang: l, code: 'P1', life: {}, date: day(0) });
    const lines = banks.SAYINGS[l].map((x) => x.replace(/^\*/, '').split('|')[0].trim());
    for (const s of say) assert.ok(lines.includes(s.start), l + ' saying ' + s.start);
    const q = D.get('quiz', { lang: l, code: 'P1', life: {}, date: day(0) });
    for (const x of q) {
      const f = banks.QUIZ.find((f) => f.id === x.id);
      assert.equal(x.q.replace(/ /g, ' '), f.q[l], l + ' question ' + x.id);
      for (const a of x.a) assert.ok(f.a[l].includes(a.replace(/ /g, ' ')), l + ' answer ' + a);
    }
    const m = D.get('memories', { lang: l, code: 'P1', life: {}, date: day(0) });
    for (const x of m) assert.equal(x.title, banks.MEMORIES.find((t) => 'm-' + t.topic === x.id).title[l], l + ' memory ' + x.id);
    const mv = D.get('move', { lang: l, code: 'P1', life: {}, date: day(0) });
    for (const x of mv) assert.equal(x.title, banks.MOVES.find((t) => t.id === x.id).t[l][0], l + ' move ' + x.id);
    const w = D.get('welcome', { lang: l, code: 'P1', life: {}, date: day(0) });
    assert.equal(w[0].line.replace(/ /g, ' '), banks.WELCOME.find((t) => t.id === w[0].id).t[l]);
  }
  /* French spacing before ? on the big titles. */
  const fr = D.get('quiz', { lang: 'fr', code: 'P9', life: {}, date: day(0) });
  assert.ok(fr.every((x) => !/ \?/.test(x.q)), 'no plain space before ? in French');
});

test('"ne plus proposer": a blocked item leaves today’s batch and never comes back', () => {
  const st = memoryStorage();
  const D = load(st);
  const o = (i) => ({ lang: 'en', code: 'P1', life: LIFE, date: day(i) });
  const s0 = D.get('sayings', o(0)), q0 = D.get('quiz', o(0)), m0 = D.get('memories', o(0)), mv0 = D.get('move', o(0));
  const gone = { sayings: [s0[0].id, s0[1].id], quiz: [q0[0].id], memories: [m0[0].id], move: [mv0[0].id] };
  for (const k of Object.keys(gone)) for (const id of gone[k]) assert.equal(D.block(k, id, 'P1'), true);
  /* Out of today's batch at once, on this page and on the other one. */
  const other = load(st);
  for (const k of Object.keys(gone)) {
    const now = other.get(k, o(0)).map((x) => x.id);
    for (const id of gone[k]) assert.ok(!now.includes(id), k + ' ' + id + ' still today');
    assert.equal(D.blocked(k, 'P1').length, gone[k].length);
    assert.ok(D.blocked(k, 'P1').every((b) => b.label && b.label !== b.id), k + ' labels for the Care Team');
  }
  for (let i = 1; i < 120; i++) {
    for (const k of Object.keys(gone)) {
      const ids = D.get(k, o(i)).map((x) => x.id);
      for (const id of gone[k]) assert.ok(!ids.includes(id), k + ' ' + id + ' came back on day ' + i);
    }
  }
  /* Only for that resident; and it can be undone. */
  let back = false;
  for (let i = 0; i < 60 && !back; i++) back = D.get('sayings', { lang: 'en', code: 'P2', life: {}, date: day(i) }).some((x) => x.id === gone.sayings[0]);
  assert.ok(back, 'another resident still gets it');
  assert.equal(D.unblock('sayings', gone.sayings[0], 'P1'), true);
  assert.equal(D.isBlocked('sayings', gone.sayings[0], 'P1'), false);
  assert.equal(D.isBlocked('sayings', gone.sayings[1], 'P1'), true);
  /* The album's card id ('d-' + item id) works too. */
  D.block('memories', 'd-m-cat', 'P5');
  assert.equal(D.isBlocked('memories', 'm-cat', 'P5'), true);
});

test('offline and failures: always something to show', async () => {
  /* No storage at all (private mode, quota): still a batch, still the same within the day. */
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const D = load(broken);
  const a = plain(D.get('sayings', { lang: 'de', code: 'P1', life: {}, date: day(0) }));
  assert.equal(a.length, 6);
  assert.deepEqual(plain(D.get('sayings', { lang: 'de', code: 'P1', life: {}, date: day(0) })), a);
  assert.deepEqual(plain(load(broken).get('sayings', { lang: 'de', code: 'P1', life: {}, date: day(0) })), a, 'same seed after a reload');
  assert.ok(load(null).get('quiz', { lang: 'fr', code: 'P1', life: {}, date: day(0) }).length > 0, 'without localStorage');

  /* A bank that gives nothing: the content of 1.15. */
  const E = load();
  E._banks.SAYINGS.en.length = 0; E._banks.reset();
  const f = E.get('sayings', { lang: 'en', code: 'P1', life: {}, date: day(0) });
  assert.equal(f.src, 'fallback');
  assert.deepEqual(plain(f).map((x) => x.start + ' ' + x.end).sort(), ['A stitch in time saves nine', 'Actions speak louder than words', 'Better late than never', 'Every cloud has a silver lining', 'Many hands make light work', 'The early bird catches the worm']);
  assert.ok(f.every((x) => x.wrong.length === 2));

  /* The LabLand server hook: off by default, and an unreachable server changes nothing. */
  const st = memoryStorage();
  const R = load(st);
  assert.equal(R.config().remote, false);
  assert.deepEqual(plain(await R.prefetch({ lang: 'en', code: 'P1', life: LIFE })), { src: 'off', kinds: [] });
  R.setConfig({ remote: true, url: 'http://127.0.0.1:9/ai/daily' });
  const sent = [];
  R._transport = (url, body) => { sent.push(body); return Promise.reject(new Error('offline')); };
  const r = await R.prefetch({ lang: 'en', code: 'P7', life: LIFE, date: day(1), kinds: ['sayings', 'quiz'] });
  assert.equal(r.src, 'local');
  assert.equal(R.get('sayings', { lang: 'en', code: 'P7', life: LIFE, date: day(1) }).src, 'local');
  /* Nothing personal leaves the robot: no code, no name, no free text. */
  const wire = JSON.stringify(sent);
  for (const secret of ['P7', 'Lyon', 'Rex', 'garden, her', 'Piaf']) assert.ok(!wire.includes(secret), 'sent ' + secret);
  assert.ok(sent.length === 2 && sent[0].lang === 'en' && sent[0].topics.includes('garden'));
});

test('the LabLand server, when switched on: checked, cached, topped up, never replacing a day', async () => {
  const st = memoryStorage();
  const R = load(st);
  R.setConfig({ remote: true, url: 'http://labland.local/ai/daily' });
  R._transport = (url, body) => Promise.resolve({ items: body.kind === 'quiz' ? [
    { id: 'kind1', q: 'What makes a morning nice?', a: ['Sunshine', 'Coffee', 'Birdsong'], r: 'Lovely.' },
    { id: 'bad1', q: 'Which war film do you prefer?', a: ['A', 'B', 'C'], r: 'Ok.' },
    { id: 'bad2', q: 'Which is the correct answer?', a: ['A', 'B', 'C'], r: 'Wrong!' },
    { id: 'kind2', q: 'Which flower smells best?', a: ['Rose', 'Lilac', 'Lavender'], r: 'That is wrong.' }
  ] : [] });
  const r = await R.prefetch({ lang: 'en', code: 'P1', life: {}, date: day(2), kinds: ['quiz', 'sayings'] });
  assert.deepEqual(plain(r.kinds), ['quiz']);
  const q = R.get('quiz', { lang: 'en', code: 'P1', life: {}, date: day(2) });
  assert.equal(q.src, 'remote');
  assert.equal(q.length, 5, 'topped up by the local generator');
  const ids = q.map((x) => x.id);
  assert.ok(ids.includes('r-kind1') && ids.includes('r-kind2'));
  assert.ok(!ids.includes('r-bad1') && !ids.includes('r-bad2'), 'anxious or scored questions dropped');
  assert.ok(!/wrong/i.test(q.find((x) => x.id === 'r-kind2').r), 'a reply that scores is replaced');
  /* The day exists now: a second answer of the server does not replace it. */
  R._transport = () => Promise.resolve({ items: [{ id: 'other', q: 'Another one?', a: ['Yes', 'Maybe', 'Gladly'], r: 'Fine.' }] });
  await R.prefetch({ lang: 'en', code: 'P1', life: {}, date: day(2), kinds: ['quiz'] });
  assert.deepEqual(plain(R.get('quiz', { lang: 'en', code: 'P1', life: {}, date: day(2) })), plain(q));
  /* get() stays synchronous and asks for tomorrow in the background. */
  let asked = null;
  R._transport = (url, body) => { asked = body; return Promise.resolve({ items: [] }); };
  const today = R.get('memories', { lang: 'en', code: 'P1', life: {}, date: day(5) });
  assert.ok(Array.isArray(today) && typeof today.then !== 'function');
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(asked && asked.date, day(6));
  R.setConfig({ remote: false });
  assert.equal(R.config().remote, false);
});

test('nothing anxious, in any language, any day, any life story', () => {
  /* The test's own list (independent of the one in js/daily.js). */
  const BAD = {
    en: /\b(death|dead|die[sd]?|dying|kill\w*|grave|funeral|cemetery|widow\w*|grief|mourn\w*|sick\w*|illness|disease|hospital|cancer|dementia|pain|war|soldier\w*|guns?|bomb\w*|weapon\w*|politic\w*|election\w*|government|president|god|lord|jesus|church\w*|pray\w*|bible|devil|hell|heaven|angel\w*|lonely|fear\w*|afraid|blood|poison|tears|sad|sorrow)\b/i,
    fr: /\b(mort|morte|morts|mourir|meurt|tuer|tombeau|cimeti[eè]re|enterrement|veuve?|deuil|chagrin|malade|maladie|h[oô]pital|cancer|d[ée]mence|douleur|guerre|soldat\w*|fusil|bombe|arme|armes|arm[ée]e|politique|[ée]lection\w*|gouvernement|pr[ée]sident|dieu|seigneur|j[ée]sus|[ée]glise|pri[eè]re|bible|diable|enfer|paradis|anges?|solitude|peur|sang|poison|larmes?|triste\w*|malheur\w*|mis[eè]re)\b/i,
    de: /(^|[^a-zäöüß])(tod|tot|tote|toten|sterben|stirbt|gestorben|grab|friedhof|beerdigung|witwe\w*|trauer\w*|traurig\w*|krank\w*|spital|klinik|krebs|demenz|schmerz\w*|krieg\w*|soldat\w*|gewehr|bomben?|waffen?|armee|politik\w*|regierung|präsident|gott|götter|jesus|kirche\w*|beten|gebet|bibel|teufel|hölle|sünde|engel|einsam\w*|angst|ängst\w*|blut|gift|weinen|tränen|unglück|elend)(?![a-zäöüß])/i
  };
  const lives = [{}, LIFE, { born: '1932', home: 'Bayern', talk: 'Kochen, Wandern, ihre Katze', loves: 'Walzer, Volksmusik' }, { born: '1960', home: 'Brest', talk: 'la mer, les bateaux, le jardin', loves: 'Brassens' }];
  const D = load();
  for (const l of LANGS) {
    for (const life of lives) {
      /* A day a month for a year: every season. */
      for (let i = 0; i < 12; i += 1) {
        for (const kind of D.KINDS) {
          for (const level of ['usual', 'gentle']) {
            const items = plain(D.get(kind, { lang: l, code: 'S' + lives.indexOf(life) + level, life, level, date: day(i * 30) }));
            const text = JSON.stringify(items.map((x) => { const y = { ...x }; delete y.words; delete y.id; return y; }));
            const m = BAD[l].exec(text);
            assert.equal(m, null, l + ' ' + kind + ' day ' + i + ': "' + (m && m[0]) + '" in ' + text.slice(Math.max(0, (m && m.index) - 80), (m && m.index) + 40));
          }
        }
      }
    }
  }
  /* Every text of every bank passes the filter of js/daily.js too. */
  const b = D._banks;
  for (const l of LANGS) for (const s of b.SAYINGS[l]) assert.ok(D.safe(s.replace('|', ' '), l), l + ': ' + s);
  for (const f of b.QUIZ) for (const l of LANGS) assert.ok(D.safe([f.q[l], f.r[l]].concat(f.a[l]).join(' '), l), f.id + ' ' + l);
  for (const m of b.MEMORIES) for (const l of LANGS) assert.ok(D.safe([m.title[l]].concat(m.opens[l], m.bits[l], m.qs[l]).join(' '), l), m.topic + ' ' + l);
  for (const m of b.MOVES) for (const l of LANGS) assert.ok(D.safe(m.t[l].join(' '), l), m.id + ' ' + l);
  for (const w of b.WELCOME) for (const l of LANGS) assert.ok(D.safe(w.t[l], l), w.id + ' ' + l);
  /* The filter itself works. */
  assert.equal(D.safe('Her late husband died in the war', 'en'), false);
  assert.equal(D.safe('Il est à l’hôpital', 'fr'), false);
  assert.equal(D.safe('Er ist krank', 'de'), false);
  assert.equal(D.safe('Un bienfait n’est jamais perdu', 'fr'), true);
  /* A life story with an anxious word is not used. */
  const sad = D.get('memories', { lang: 'en', code: 'SAD', life: { home: 'the cemetery road' }, date: day(0) });
  assert.ok(!JSON.stringify(plain(sad)).includes('cemetery'));
});

test('the kindness quiz has no right or wrong answer', () => {
  const D = load();
  for (const l of LANGS) {
    for (let i = 0; i < 20; i++) {
      for (const level of ['usual', 'gentle']) {
        const q = plain(D.get('quiz', { lang: l, code: 'Q' + level, life: LIFE, level, date: day(i) }));
        assert.equal(q.length, level === 'gentle' ? 3 : 5);
        for (const x of q) {
          assert.equal(x.a.length, level === 'gentle' ? 2 : 3, x.id);
          assert.ok(!('ok' in x) && !('correct' in x) && !('right' in x), 'no right answer field');
          assert.ok(x.r && !/\b(wrong|incorrect|faux|falsch|richtig)\b/i.test(x.r), x.r);
          assert.ok(!x.a.some((a) => /rock/i.test(a)), 'music to avoid is not offered: ' + x.a);
        }
      }
    }
  }
});

test('the life story personalises; without it nothing personal appears', () => {
  const D = load();
  const days = 10;
  let lyonQ = 0, home = 0, era = 0, lifeSayings = 0, lovesQ = 0;
  for (let i = 0; i < days; i++) {
    const o = { lang: 'en', code: 'L1', life: LIFE, date: day(i) };
    const q = D.get('quiz', o), m = D.get('memories', o), s = D.get('sayings', o);
    if (q.some((x) => x.q.includes('Lyon'))) lyonQ++;
    if (q.some((x) => x.a.includes('Piaf') || x.a.includes('Waltz'))) lovesQ++;
    if (m.some((x) => x.id === 'm-home' && x.title === 'Lyon' && x.story.includes('Lyon'))) home++;
    if (m.some((x) => x.id === 'm-era-1960')) era++;
    if (s.some((x) => x.why === 'life')) lifeSayings++;
  }
  assert.ok(lyonQ >= 1 && lovesQ >= 1, 'questions about Lyon and the favourite music: ' + lyonQ + ', ' + lovesQ);
  assert.ok(home >= 1 && era >= 1, 'memories of Lyon and of the 1960s: ' + home + ', ' + era);
  assert.ok(lifeSayings >= days - 2, 'sayings about the garden or animals most days: ' + lifeSayings);
  /* "her dog Rex" is only a hint: never repeated word for word to the resident. */
  for (let i = 0; i < days; i++) assert.ok(!JSON.stringify(plain(D.get('quiz', { lang: 'en', code: 'L1', life: LIFE, date: day(i) }))).includes('Rex'));
  for (let i = 0; i < days; i++) {
    const o = { lang: 'fr', code: 'N1', life: {}, date: day(i) };
    for (const k of D.KINDS) {
      const items = plain(D.get(k, o));
      assert.ok(items.every((x) => !x.why || x.why === ''), k + ' personal item without a life story');
      assert.ok(!JSON.stringify(items).includes('Lyon'));
    }
  }
  /* The team's own sayings are mixed in, two a day. */
  const own = [{ start: 'Rien ne vaut le café de', end: 'Mamie' }, { start: 'Le jardin de Paul est', end: 'fleuri' }, { start: 'À Brest il fait', end: 'beau' }];
  const t = D.get('sayings', { lang: 'fr', code: 'T1', life: {}, own, date: day(0) });
  assert.equal(t.filter((x) => x.why === 'team').length, 2);
  assert.equal(t.length, 6);
});

test('age and abilities: the easier level, the decade of their youth', () => {
  const D = load();
  const g = D.get('sayings', { lang: 'de', code: 'G1', life: {}, level: 'gentle', date: day(0) });
  assert.equal(g.length, 4);
  assert.ok(g.every((x) => x.wrong.length === 1), 'two buttons only');
  const stars = D._banks.SAYINGS.de.filter((x) => x[0] === '*').map((x) => x.slice(1).split('|')[0].trim());
  assert.ok(g.every((x) => stars.includes(x.start)), 'very well-known sayings only');
  assert.equal(D.get('memories', { lang: 'de', code: 'G1', life: {}, level: 'gentle', date: day(0) }).length, 3);
  const usual = D.get('move', { lang: 'en', code: 'G2', life: {}, date: day(0) }), easy = D.get('move', { lang: 'en', code: 'G3', life: {}, level: 'gentle', date: day(0) });
  assert.equal(usual.length, 15);
  assert.equal(easy.length, 10);
  assert.equal(D.get('move', { lang: 'en', code: 'G2', life: {}, date: day(0), zone: 'legs' }).length, 3);
  const old = D._banks.MOVES.find((m) => m.id === easy[0].id);
  assert.ok(easy[0].reps < old.reps || easy[0].reps === 2);
  const eras = {};
  for (const born of ['1928', '1935', '1945', '1958', '1972']) {
    for (let i = 0; i < 12; i++) for (const x of D.get('memories', { lang: 'en', code: 'E' + born, life: { born }, date: day(i) })) if (x.topic === 'era') eras[born] = x.id;
  }
  assert.deepEqual(eras, { 1928: 'm-era-1940', 1935: 'm-era-1950', 1945: 'm-era-1960', 1958: 'm-era-1970', 1972: 'm-era-1980' });
});

test('the welcome: date, season, time, one line of the day, the birthday', () => {
  const D = load();
  const w = D.welcome({ lang: 'fr', code: 'P1', life: LIFE, now: new Date(2026, 10, 14, 9, 5), name: 'Marie' });
  assert.equal(w.season, 'autumn');
  assert.equal(w.birthday, true);
  assert.match(w.greeting, /^Bonjour, Marie !$/);
  assert.ok(w.line && w.say.includes(w.line.replace(/ /g, ' ')));
  assert.match(w.card, /class="today s-autumn"/);
  assert.match(w.say, /novembre 2026/);
  assert.equal(D.welcome({ lang: 'de', now: new Date(2026, 0, 3, 20, 0) }).season, 'winter');
  assert.match(D.welcome({ lang: 'en', now: new Date(2026, 6, 3, 15, 0) }).greeting, /^Good afternoon!$/);
  /* The line changes from one day to the next. */
  const lines = new Set();
  for (let i = 0; i < 5; i++) lines.add(D.get('welcome', { lang: 'en', code: '', life: {}, date: day(i) })[0].id);
  assert.equal(lines.size, 5);
});

/* 15 Nov (Rahma): the activity "Daily choice" (Choix du jour, Wahl des Tages: key 'choice', js/activities.js) does almost
   what the meal ordering ("Menu", js/meals.js) does: hidden, with the codebase's hidden: true, its code kept. js/daily.js
   (the daily content above) is not that activity and stays as it is. */
test('"Daily choice" is hidden: no tile on the head, nothing on the tablet; the menu stays', () => {
  const deep = () => new Proxy(function () { return ''; }, { get: (t, k) => (k === Symbol.toPrimitive || k === 'toString' ? () => '' : deep()), apply: () => '' });
  const acts = [];
  const ctx = { console, Lab: { esc: (s) => String(s), define: (a) => acts.push(a), byKey: {} }, ART: deep() };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/activities.js'), 'utf8'), ctx, { filename: 'js/activities.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/meals.js'), 'utf8'), ctx, { filename: 'js/meals.js' });
  const choice = acts.find((a) => a.key === 'choice');
  assert.ok(choice, 'the code is still there');
  assert.equal(choice.name, 'Daily Choice');
  assert.equal(choice.hidden, true, 'hidden');
  assert.equal(typeof choice.start, 'function', 'and still runs if an old run asks for it');
  /* the head's list (js/staff.js) and the tablet's lists show what is not hidden */
  const staff = fs.readFileSync(path.join(ROOT, 'js/staff.js'), 'utf8');
  assert.ok(staff.includes("Lab.activities.filter(function (a) { return !a.hidden && a.key !== 'hello'; })"), 'the head lists only activities that are not hidden');
  assert.ok(/if \(!Lab\.byKey\[want\] \|\| Lab\.byKey\[want\]\.hidden\) want = 'hello';/.test(staff), 'a team that had it selected falls back');
  const tiles = acts.filter((a) => !a.hidden && a.key !== 'hello').map((a) => a.key);
  assert.ok(!tiles.includes('choice'), 'no "Daily choice" tile: ' + tiles.join(', '));
  assert.ok(tiles.includes('meals'), 'the meal ordering is the one to use');
  assert.ok(!acts.find((a) => a.key === 'meals').hidden);
});
