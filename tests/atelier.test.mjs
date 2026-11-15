// Bellatrix Atelier: the care team writes a short request and a game is added to the menu.
// Run: node tests/atelier.test.mjs          (ATELIER_SHOTS=<folder> also saves 1080x1920 screenshots)
// 1. The spec validator refuses everything that is not exactly a game (no code, no unknown field).
// 2. The offline generator builds the 6 kinds of game in FR, DE and EN; an unknown topic asks for the items.
// 3. The engine plays every kind of game to the end (a quiz step by step).
// 4. The AI endpoint: { ai: false } without a key; with a (fake) key only a valid spec gets through.
// 5. In a MUTED headless Chrome (--mute-audio, speechSynthesis stubbed: no sound at all): the Atelier page
//    creates a game, shows the preview, adds it to the menu; the game then shows in the Care Team's
//    activity list and plays on the patient screen to the end; removing it takes it out again.
// The server it starts runs on a free port with a temporary data folder, without ANTHROPIC_API_KEY.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const E = require('../js/atelier-engine.js');
const G = require('../js/atelier-bank.js');
const { createAtelier } = await import('../labland/atelier.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.ATELIER_SHOTS || '';
const clone = (o) => JSON.parse(JSON.stringify(o));
/* a fixed random source: the same games on every run */
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

const QUIZ = { type: 'quiz', lang: 'de', title: 'Quiz · Bayern', items: [
  { q: 'Wie heißt die Hauptstadt von Bayern?', a: 'München', wrong: ['Nürnberg', 'Augsburg'] },
  { q: 'Welcher Fluss fließt durch Passau?', a: 'Die Donau', wrong: ['Der Rhein', 'Die Elbe'] },
  { q: 'Wie heißt der höchste Berg Deutschlands?', a: 'Die Zugspitze', wrong: ['Der Brocken'] }] };

/* ------------------------------------------------------------------ 1. validation ---------------- */
test('a valid spec passes and comes back as a clean copy', () => {
  const r = E.validate(clone(QUIZ));
  assert.equal(r.ok, true);
  assert.equal(r.spec.v, 1);
  assert.deepEqual(r.spec.items[0], QUIZ.items[0]);
  assert.notEqual(r.spec.items, QUIZ.items);
  assert.equal(E.validate({ type: 'quiz', lang: 'fr', title: '  Un   quiz ', items: QUIZ.items }).spec.title, 'Un quiz');
});
test('bad specs are refused', () => {
  const bad = (change, why) => { const s = clone(QUIZ); change(s); const r = E.validate(s); assert.equal(r.ok, false, why); assert.equal(typeof r.error, 'string'); };
  for (const v of [null, undefined, 42, 'quiz', [], [QUIZ]]) assert.equal(E.validate(v).ok, false);
  bad((s) => { s.type = 'script'; }, 'unknown type');
  bad((s) => { s.lang = 'es'; }, 'unknown language');
  bad((s) => { s.code = 'alert(1)'; }, 'unknown top field');
  bad((s) => { s.items[0].onclick = 'alert(1)'; }, 'unknown item field');
  bad((s) => { s.items[0].run = function () {}; }, 'a function');
  bad((s) => { s.title = ''; }, 'empty title');
  bad((s) => { s.title = 'x'.repeat(41); }, 'title too long');
  bad((s) => { s.title = { toString() { return 'x'; } }; }, 'title not a text');
  bad((s) => { s.items = []; }, 'no items');
  bad((s) => { s.items = s.items.slice(0, 1); }, 'too few items');
  bad((s) => { s.items = Array.from({ length: 13 }, () => clone(QUIZ.items[0])); }, 'too many items');
  bad((s) => { s.items[0].wrong = []; }, 'no wrong answer');
  bad((s) => { s.items[0].wrong = ['münchen']; }, 'the right answer among the wrong ones');
  bad((s) => { s.items[0].q = 'x'.repeat(111); }, 'question too long');
  bad((s) => { s.items[0].a = 7; }, 'answer not a text');
  bad((s) => { s.items[0].a = 'a\u0000b'; }, 'control character');
  bad((s) => { s.cats = ['A', 'B']; }, 'categories on a quiz');
  bad((s) => { s.id = '../x'; }, 'bad id');
  bad((s) => { s.v = 2; }, 'unknown version');
  bad((s) => { s.source = 'web'; }, 'unknown source');
  const sort = { type: 'sort', lang: 'en', title: 'Sort', cats: ['Fruit', 'Vegetables'], items: [{ t: 'apple', c: 0 }, { t: 'pear', c: 0 }, { t: 'leek', c: 1 }, { t: 'bean', c: 1 }] };
  assert.equal(E.validate(sort).ok, true);
  assert.equal(E.validate(Object.assign({}, sort, { cats: ['Fruit'] })).ok, false);
  assert.equal(E.validate(Object.assign({}, sort, { cats: ['Fruit', 'fruit'] })).ok, false);
  assert.equal(E.validate(Object.assign({}, sort, { items: sort.items.map((it) => ({ t: it.t, c: 0 })) })).ok, false, 'one empty category');
  assert.equal(E.validate(Object.assign({}, sort, { items: sort.items.map((it, i) => ({ t: it.t, c: i === 0 ? 2 : it.c })) })).ok, false, 'category 2');
  assert.equal(E.validate({ type: 'order', lang: 'en', title: 'Order', items: [{ q: 'The day', steps: ['Morning', 'Evening'] }] }).ok, false, 'two steps only');
  assert.equal(E.validate({ type: 'odd', lang: 'en', title: 'Odd', items: [{ set: ['a', 'b', 'c'], odd: 'a' }, { set: ['a', 'b', 'c'], odd: 'd' }] }).ok, false, 'the odd one is in the set');
  assert.equal(E.validate({ type: 'pairs', lang: 'en', title: 'Pairs', items: [{ a: 'cat' }, { a: 'dog' }, { a: 'cat' }] }).ok, false, 'the same card twice');
});
test('text with HTML stays text: it is escaped on the screen, never run', () => {
  const s = clone(QUIZ); s.items[0].a = '<img src=x onerror=alert(1)>';
  const r = E.validate(s);
  assert.equal(r.ok, true);
  assert.equal(E.esc(r.spec.items[0].a), '&lt;img src=x onerror=alert(1)&gt;');
});

/* ------------------------------------------------------------------ 2. offline generator --------- */
const PROMPTS = {
  en: { quiz: 'a quiz about Bavarian food', sort: 'sort fruits and vegetables', pairs: 'pairs with animals', saying: 'finish the saying', odd: 'odd one out in the garden', order: 'put the seasons in order' },
  fr: { quiz: 'un quiz sur la cuisine bavaroise', sort: 'trier les fruits et les légumes', pairs: 'des paires avec des animaux', saying: 'compléter les dictons', odd: 'l’intrus au jardin', order: 'les saisons dans l’ordre' },
  de: { quiz: 'ein Quiz über bayerisches Essen', sort: 'Obst und Gemüse sortieren', pairs: 'Paare mit Tieren', saying: 'Sprichwörter ergänzen', odd: 'Was passt nicht im Garten?', order: 'die Jahreszeiten in der richtigen Reihenfolge' }
};
test('the offline generator builds the 6 kinds of game in 3 languages', () => {
  let n = 0;
  for (const lang of E.LANGS) for (const type of E.TYPES) {
    const r = G.offline(PROMPTS[lang][type], lang, { rng: rng(7) });
    assert.ok(r.spec, lang + ' ' + type + ': ' + PROMPTS[lang][type]);
    assert.equal(r.spec.type, type, lang + ' ' + type);
    assert.equal(r.spec.lang, lang);
    assert.equal(r.spec.source, 'offline');
    assert.equal(E.validate(r.spec).ok, true);
    n++;
  }
  assert.equal(n, 18);
  assert.equal(G.offline(PROMPTS.de.quiz, 'de').spec.title, 'Quiz · Bayern');
  assert.deepEqual(G.offline(PROMPTS.fr.sort, 'fr').spec.cats, ['Fruits', 'Légumes']);
  assert.equal(G.offline('animals', 'en').spec.type, 'quiz', 'a topic alone gives a quiz');
});
test('every topic of the bank gives every kind of game, in every language, and it validates', () => {
  let n = 0;
  for (const topic of G.topics()) for (const type of E.TYPES) for (const lang of E.LANGS) {
    const r = G.offline('', lang, { type, topic, rng: rng(n + 1) });
    assert.ok(r.spec, topic + ' ' + type + ' ' + lang);
    assert.equal(r.spec.type, topic === 'sayings' ? 'saying' : type);
    n++;
  }
  assert.ok(n >= 12 * 6 * 3);
});
test('the ideas shown on the Atelier page are understood in their own language', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'i18n-atelier.js'), 'utf8');
  const ideas = { 'A quiz about music': 'quiz', 'Sort fruit and vegetables': 'sort', 'Pairs with flowers': 'pairs', 'Finish the sayings': 'saying', 'Odd one out in the garden': 'odd', 'The seasons in order': 'order' };
  const ctx = { I18N: { dict: { fr: {}, de: {} }, add(l, t) { Object.assign(this.dict[l], t); } } };
  new Function('I18N', src)(ctx.I18N);
  for (const [en, type] of Object.entries(ideas)) {
    for (const [lang, text] of [['en', en], ['fr', ctx.I18N.dict.fr[en]], ['de', ctx.I18N.dict.de[en]]]) {
      const r = G.offline(text, lang);
      assert.ok(r.spec && r.spec.type === type, lang + ': ' + text);
    }
  }
  for (const lang of ['fr', 'de']) assert.ok(G.offline(ctx.I18N.dict[lang]['For example: a quiz about Bavarian food'], lang).spec, 'the placeholder example, ' + lang);
  /* 15 Nov: the animal quiz is gone from the ideas, and one already saved is hidden from the activity lists */
  assert.ok(!/animal|animaux|Tiere/i.test(fs.readFileSync(path.join(ROOT, 'js', 'atelier.js'), 'utf8').match(/var IDEAS = \[[^\]]*\]/)[0]), 'no animal idea');
  for (const [lang, text] of [['en', 'A quiz about animals'], ['fr', 'Un quiz sur les animaux'], ['de', 'Ein Quiz über Tiere']]) {
    const r = G.offline(text, lang);
    assert.equal(E.activity(r.spec, 0).hidden, true, 'an old animal quiz is hidden, ' + lang);
    assert.equal(E.activity(Object.assign({}, r.spec, { prompt: undefined }), 0).hidden, true, 'hidden by its title too, ' + lang);
    for (const name of ['Animal quiz', 'Quiz des animaux', 'Tierquiz']) {
      assert.equal(E.activity(Object.assign({}, r.spec, { prompt: undefined, title: name }), 0).hidden, true, 'hidden when named ' + name);
    }
  }
  assert.equal(E.activity(G.offline('A quiz about music', 'en').spec, 0).hidden, false, 'other quizzes stay');
  assert.equal(E.activity(G.offline('', 'en', { type: 'pairs', topic: 'animals', rng: rng(3) }).spec, 0).hidden, false, 'pairs with animals stay');
});
test('an unknown topic asks for the items; typed lines make a game', () => {
  const r = G.offline('a quiz about trains', 'en');
  assert.equal(r.need, true); assert.equal(r.type, 'quiz'); assert.equal(r.spec, undefined);
  assert.equal(G.offline('trains', 'en').need, true);
  const q = G.fromLines('quiz', 'Züge', 'de', 'Wie heißt der schnelle Zug? | ICE\nWo hält der Zug? | Am Bahnhof\n\nWer fährt die Lok? | Der Lokführer');
  assert.ok(q.spec); assert.equal(q.spec.items.length, 3); assert.equal(q.spec.source, 'manual'); assert.equal(q.spec.items[0].wrong.length, 2);
  assert.ok(G.fromLines('sort', 'Tri', 'fr', 'train | sur rails\ntram | sur rails\nvoiture | sur route\nvélo | sur route').spec);
  assert.equal(G.fromLines('sort', 'Tri', 'fr', 'train | rails\ntram | rails\nvoiture | route\nvélo | air').error, 'cats');
  assert.ok(G.fromLines('pairs', 'Pairs', 'en', 'train\nbus\ntram | rails').spec);
  assert.ok(G.fromLines('saying', 'Sätze', 'de', 'Die Lok zieht den | Zug\nDer Zug hält am | Bahnhof').spec);
  assert.ok(G.fromLines('odd', 'Odd', 'en', 'train | tram | bus | apple\nred | blue | green | dog').spec);
  assert.ok(G.fromLines('order', 'Order', 'en', 'A journey | Buy a ticket | Get on | Arrive').spec);
  assert.equal(G.fromLines('quiz', 'Q', 'en', 'only a question').error, 'format');
  assert.equal(G.fromLines('quiz', 'Q', 'en', '').error, 'invalid');
});

/* ------------------------------------------------------------------ 3. the engine ---------------- */
test('the engine plays a quiz to the end', () => {
  const spec = E.validate(clone(QUIZ)).spec, g = E.create(spec, { rng: rng(3) });
  let v = g.view();
  assert.equal(v.kind, 'round'); assert.equal(v.n, 1); assert.equal(v.total, 3); assert.equal(v.title, QUIZ.items[0].q);
  assert.deepEqual(v.options.map((o) => o.label).sort(), ['Augsburg', 'München', 'Nürnberg']);
  /* a wrong answer first: it is greyed out, the round goes on */
  const wrong = v.options.findIndex((o) => o.label === 'Augsburg');
  assert.equal(g.pick(wrong), 'wrong');
  assert.equal(g.view().options[wrong].state, 'tried');
  assert.equal(g.pick(wrong), null, 'a tried answer does nothing');
  assert.equal(g.advance(), false, 'no next question before the answer');
  assert.equal(g.pick(g.view().options.findIndex((o) => o.label === 'München')), 'right');
  v = g.view();
  assert.equal(v.revealed, true); assert.equal(v.answer, 'München');
  assert.equal(g.pick(0), null, 'nothing to pick while the answer shows');
  for (let i = 1; i < 3; i++) {
    assert.equal(g.advance(), true);
    v = g.view();
    assert.equal(v.n, i + 1);
    assert.equal(g.pick(v.options.findIndex((o) => o.label === QUIZ.items[i].a)), 'right');
  }
  assert.equal(g.advance(), true);
  assert.equal(g.isEnded(), true);
  assert.equal(g.view().kind, 'end');
  assert.deepEqual(g.score, { rounds: 3, firstTry: 2, notQuite: 1 });
  assert.equal(g.pick(0), null);
});
test('every kind of game can be played to the end', () => {
  for (const type of E.TYPES) {
    const spec = G.offline(PROMPTS.en[type], 'en', { rng: rng(11) }).spec, g = E.create(spec, { rng: rng(5) });
    let guard = 0;
    while (!g.isEnded() && guard++ < 400) {
      const v = g.view();
      if (v.revealed) { g.advance(); continue; }
      if (type === 'pairs') {
        /* first a wrong pair (it turns back), then each card with its partner */
        const pairOf = (c) => spec.items.findIndex((it) => it.a === c.label || it.b === c.label);
        const down = v.cards.map((c, i) => (c.state === 'down' ? i : -1)).filter((i) => i >= 0);
        const mate = down.find((i) => i !== down[0] && pairOf(v.cards[i]) === pairOf(v.cards[down[0]]));
        const other = down.find((i) => i !== down[0] && i !== mate);
        if (guard === 1 && other !== undefined) { assert.equal(g.pick(down[0]), 'flip'); assert.equal(g.pick(other), 'nomatch'); continue; }
        assert.equal(g.pick(down[0]), 'flip');
        assert.ok(['match', 'right'].includes(g.pick(mate)), 'pairs');
      } else {
        const idle = v.options.map((o, i) => (o.state === 'idle' ? i : -1)).filter((i) => i >= 0);
        assert.ok(idle.length > 0, type + ': an answer is always left');
        assert.ok(['right', 'wrong', 'step'].includes(g.pick(idle[guard % idle.length])), type);
      }
    }
    assert.equal(g.isEnded(), true, type + ' ends');
    assert.equal(g.view().kind, 'end');
  }
});
test('order: only the next step counts; pairs: a wrong pair turns back', () => {
  const o = E.create(E.validate({ type: 'order', lang: 'en', title: 'Order', items: [{ q: 'The day', steps: ['Morning', 'Noon', 'Evening'] }] }).spec, { rng: rng(2) });
  const at = (l) => o.view().options.findIndex((x) => x.label === l);
  assert.notDeepEqual(o.view().options.map((x) => x.label), ['Morning', 'Noon', 'Evening'], 'never shown already in order');
  assert.equal(o.pick(at('Noon')), 'wrong');
  assert.equal(o.view().options[at('Noon')].state, 'idle', 'a step picked too early stays available');
  assert.equal(o.pick(at('Morning')), 'step');
  assert.equal(o.view().options[at('Morning')].pos, 1);
  assert.equal(o.pick(at('Noon')), 'step');
  assert.equal(o.pick(at('Evening')), 'right');
  const p = E.create(E.validate({ type: 'pairs', lang: 'en', title: 'Pairs', items: [{ a: 'cat' }, { a: 'dog' }, { a: 'sun', b: 'moon' }] }).spec, { rng: rng(4) });
  const cards = p.view().cards, cat = cards.map((c, i) => (c.label === 'cat' ? i : -1)).filter((i) => i >= 0), dog = cards.findIndex((c) => c.label === 'dog');
  assert.equal(cards.length, 6);
  assert.equal(p.pick(cat[0]), 'flip');
  assert.equal(p.pick(dog), 'nomatch');
  assert.equal(p.view().cards[dog].state, 'wrong');
  assert.equal(p.settle(), true);
  assert.equal(p.view().cards[dog].state, 'down');
  assert.equal(p.pick(cat[0]), 'flip');
  assert.equal(p.pick(cat[1]), 'match');
  assert.equal(p.view().cards[cat[0]].state, 'found');
  assert.equal(p.pick(cards.findIndex((c) => c.label === 'sun')), 'flip');
  assert.equal(p.pick(cards.findIndex((c) => c.label === 'moon')), 'match', 'two different words can be a pair');
});

/* ------------------------------------------------------------------ 4. the AI endpoint ----------- */
const reqOf = (method) => ({ method });
const urlOf = (p) => new URL('http://localhost' + p);
function fakeApi(answer, seen) {
  return async (url, init) => {
    seen.push({ url, init });
    if (answer && answer.status) return { ok: false, status: answer.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer };
  };
}
const says = (text, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] });
test('AI endpoint: { ai: false } without a key, and the API is never called', async () => {
  const seen = [], A = createAtelier({ key: '', fetch: fakeApi(null, seen) });
  assert.deepEqual(await A.api(reqOf('GET'), urlOf('/atelier/api/status'), {}), [200, { ai: false }]);
  assert.deepEqual(await A.api(reqOf('POST'), urlOf('/atelier/api/generate'), { prompt: 'a quiz about trains', lang: 'en' }), [200, { ai: false }]);
  assert.equal(seen.length, 0);
  assert.equal((await A.api(reqOf('GET'), urlOf('/atelier/api/other'), {}))[0], 404);
});
test('AI endpoint with a key: a valid spec gets through, anything else is refused', async () => {
  const seen = [];
  let A = createAtelier({ key: 'test-key-not-real', fetch: fakeApi(says('```json\n' + JSON.stringify(QUIZ) + '\n```'), seen) });
  assert.deepEqual(await A.api(reqOf('GET'), urlOf('/atelier/api/status'), {}), [200, { ai: true }]);
  let out = await A.api(reqOf('POST'), urlOf('/atelier/api/generate'), { prompt: 'ein Quiz über Bayern', lang: 'de', type: 'quiz' });
  assert.equal(out[0], 200); assert.equal(out[1].ai, true);
  assert.equal(out[1].spec.source, 'ai'); assert.equal(out[1].spec.items.length, 3); assert.equal(E.validate(out[1].spec).ok, true);
  /* the call itself: the documented endpoint, headers and model; the key only in the header */
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0].init.headers['x-api-key'], 'test-key-not-real');
  assert.equal(seen[0].init.headers['anthropic-version'], '2023-06-01');
  const sent = JSON.parse(seen[0].init.body);
  assert.equal(sent.model, 'claude-haiku-5-5');
  assert.ok(!seen[0].init.body.includes('test-key-not-real'));
  assert.ok(sent.messages[0].content.includes('German') && sent.messages[0].content.includes('Bayern'));
  const refused = async (answer, body = { prompt: 'x y', lang: 'de' }) => {
    A = createAtelier({ key: 'k', fetch: fakeApi(answer, []) });
    const r = await A.api(reqOf('POST'), urlOf('/atelier/api/generate'), body);
    assert.equal(r[1].spec, undefined); assert.equal(typeof r[1].error, 'string');
    return r[1].error;
  };
  assert.equal(await refused(says('Here is a game: <script>alert(1)</script>')), 'not-a-game');
  assert.equal(await refused(says(JSON.stringify(Object.assign({}, QUIZ, { code: 'alert(1)' })))), 'not-a-game');
  assert.equal(await refused(says(JSON.stringify(Object.assign({}, QUIZ, { lang: 'en' })))), 'not-a-game', 'another language than asked');
  assert.equal(await refused(says(JSON.stringify(Object.assign({}, QUIZ, { id: 'abcd1234' })))), 'not-a-game');
  assert.equal(await refused(says(JSON.stringify(QUIZ), 'refusal')), 'no-answer');
  assert.equal(await refused(says(JSON.stringify(QUIZ).slice(0, 80), 'max_tokens')), 'no-answer');
  assert.equal(await refused({ status: 401 }), 'api-401');
  assert.equal(await refused(says(JSON.stringify(QUIZ)), { prompt: '', lang: 'de' }), 'bad-request');
  assert.equal(await refused(says(JSON.stringify(QUIZ)), { prompt: 'x', lang: 'es' }), 'bad-request');
  /* a ceiling per hour: the key costs money */
  A = createAtelier({ key: 'k', perHour: 2, fetch: fakeApi(says(JSON.stringify(QUIZ)), []) });
  for (let i = 0; i < 2; i++) assert.ok((await A.generate({ prompt: 'quiz', lang: 'de' }))[1].spec);
  assert.equal((await A.generate({ prompt: 'quiz', lang: 'de' }))[0], 429);
});
test('no API key in the code, the page or the tests', () => {
  for (const f of ['labland/atelier.mjs', 'js/atelier.js', 'js/atelier-engine.js', 'js/atelier-bank.js', 'atelier.html', 'tests/atelier.test.mjs']) {
    assert.ok(!/sk-ant-[A-Za-z0-9]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  }
});
test('browser files are plain ES5 with LF line endings', () => {
  for (const f of ['js/atelier.js', 'js/atelier-engine.js', 'js/atelier-bank.js', 'js/i18n-atelier.js', 'css/atelier.css', 'atelier.html', 'labland/atelier.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!src.includes('\r'), f + ' has CR');
    if (!/^js\//.test(f)) continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/=>|`|\b(?:let|const|class|async|await)\s/.test(code), f + ' uses newer JavaScript');
  }
});

/* ------------------------------------------------------------------ 5. server and browser -------- */
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const killTree = (pid) => { try { if (process.platform === 'win32') execSync('taskkill /T /F /PID ' + pid, { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };
/* Silent: speechSynthesis never speaks, it only records what Bellatrix would say; Chrome is muted too. */
const SILENT = `(function(){window.__said=[];try{var s=window.speechSynthesis;if(s){s.speak=function(u){try{window.__said.push(String(u.text||''));}catch(e){}setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();`;
async function startServer(tmp) {
  const port = await freePort(), env = Object.assign({}, process.env, { PORTAL_DATA: path.join(tmp, 'portal'), FEED_DATA: path.join(tmp, 'feed'), NOTIFY_DATA: path.join(tmp, 'notify'), CALLREQ_DATA: path.join(tmp, 'callreq') });
  delete env.ANTHROPIC_API_KEY;
  const child = spawn(process.execPath, [path.join(ROOT, 'labland', 'store-server.mjs'), String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/atelier/api/status'); if (r.ok) return { base, child }; } catch (e) { /* not yet */ } await sleep(150); }
  killTree(child.pid);
  throw new Error('The server did not start: ' + err.slice(0, 300));
}
async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-atelier-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
  const B = { errors: [], closed: false };
  B.close = async () => {
    if (B.closed) return; B.closed = true;
    try { await Promise.race([B.send('Browser.close'), sleep(2000)]); } catch (e) { /* closing */ }
    try { B.ws.close(); } catch (e) { /* closed */ }
    await sleep(300); killTree(chrome.pid);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
  };
  B.send = () => Promise.reject(new Error('not connected'));
  let port = 0, list = null;
  for (let i = 0; i < 100 && !port; i++) { try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(150); } }
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch (e) { await sleep(150); } }
  if (!list) { await B.close(); throw new Error('Chrome did not start'); }
  const ws = B.ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = {};
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; return; }
    if (d.method === 'Runtime.exceptionThrown') B.errors.push(String((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
    if (d.method === 'Page.javascriptDialogOpening') B.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  };
  B.send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; const t = setTimeout(() => { delete pending[i]; rej(new Error(method + ': no answer')); }, 20000); pending[i] = (d) => { clearTimeout(t); return d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); }; ws.send(JSON.stringify({ id: i, method, params })); });
  B.ev = async (expr) => { const r = await B.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; };
  B.waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await B.ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; };
  B.go = async (url, ready = 'true') => { await B.send('Page.navigate', { url }); await sleep(200); return B.waitFor('document.readyState === "complete" && (' + ready + ')'); };
  B.shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await B.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  await B.send('Runtime.enable'); await B.send('Page.enable'); await B.send('Network.enable');
  await B.send('Network.setCacheDisabled', { cacheDisabled: true });
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT });
  return B;
}

test('server: the Atelier page is served and the AI endpoint answers { ai: false } without a key', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-atelier-data-'));
  const S = await startServer(tmp);
  try {
    assert.deepEqual(await (await fetch(S.base + '/atelier/api/status')).json(), { ai: false });
    const r = await fetch(S.base + '/atelier/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'a quiz about Bavarian food', lang: 'en' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ai: false });
    const page = await fetch(S.base + '/atelier.html');
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('js/atelier.js'));
  } finally { killTree(S.child.pid); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ } }
});

test('browser: create, preview, add to the menu, play on the patient screen, remove', { skip: !CHROME && 'no Chrome on this computer', timeout: 180000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-atelier-data-'));
  const S = await startServer(tmp);
  const B = await browser();
  const click = async (q, ms = 350) => { const ok = await B.ev(`(function(){var b=document.querySelector(${JSON.stringify(q)}); if (b) b.click(); return !!b;})()`); await sleep(ms); return ok; };
  try {
    /* --- the Atelier page, in German --- */
    await B.go(S.base + '/atelier.html');
    await B.ev(`localStorage.clear(); localStorage.setItem('bellatrix-staff-lang', 'de')`);
    assert.ok(await B.go(S.base + '/atelier.html', 'window.Atelier && document.querySelector("#atLang .on")'));
    assert.equal(await B.ev(`document.documentElement.lang`), 'de');
    assert.equal(await B.ev(`document.getElementById('atCreate').textContent`), 'Erstellen');
    assert.equal(await B.ev(`document.querySelectorAll('#atIdeas button').length`), 6);
    assert.equal(await B.ev(`document.getElementById('atEmpty').hidden`), false);
    assert.equal(await B.ev(`Atelier.aiOn()`), false, 'no key on the server: the AI is off');
    await B.shot('atelier-1-home');
    /* an empty request does nothing */
    await click('#atCreate');
    assert.equal(await B.ev(`document.getElementById('vHome').hidden`), false);
    /* --- a request: preview --- */
    await B.ev(`document.getElementById('atPrompt').value = 'ein Quiz über bayerisches Essen'`);
    await click('#atCreate');
    assert.ok(await B.waitFor(`!document.getElementById('vPreview').hidden && document.querySelectorAll('#screen .opt').length >= 2`), 'the preview shows a question');
    assert.equal(await B.ev(`document.getElementById('atTitle').value`), 'Quiz · Bayern');
    const box = await B.ev(`(function(){ var r = document.getElementById('atFit').getBoundingClientRect(), o = document.querySelector('#screen .opt').getBoundingClientRect(); return { w: r.width, h: r.height, bottom: r.bottom, vh: innerHeight, opt: o.height }; })()`);
    assert.ok(box.w > 500 && Math.abs(box.h / box.w - 1920 / 1080) < 0.01, 'the preview keeps the shape of the patient screen');
    assert.ok(box.opt >= 60, 'the answers are big buttons in the preview (' + box.opt + ' px)');
    assert.equal(await B.ev(`document.querySelectorAll('.atbtn.primary:not([hidden])').length - document.querySelectorAll('section[hidden] .atbtn.primary').length`), 1, 'one filled button on the screen');
    await B.shot('atelier-2-preview');
    /* --- add to the menu --- */
    await click('#atAdd', 500);
    assert.equal(await B.ev(`document.getElementById('vHome').hidden`), false);
    const saved = await B.ev(`JSON.parse(localStorage.getItem('bellatrix-atelier-games'))`);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].type, 'quiz'); assert.equal(saved[0].lang, 'de'); assert.match(saved[0].id, /^[a-z0-9]{8}$/);
    assert.equal(await B.ev(`document.querySelector('#atList .atname').textContent`), 'Quiz · Bayern');
    await B.shot('atelier-3-in-the-menu');
    const key = 'atelier-' + saved[0].id;
    /* a second game through an idea, and a topic the bank does not know (typed items) */
    await click('#atIdeas li:nth-child(3) button', 600);
    assert.ok(await B.waitFor(`document.querySelectorAll('#screen .pcard').length === 8`), 'pairs: 8 cards');
    await B.shot('atelier-4-preview-pairs');
    await click('#atPrevBack');
    await B.ev(`document.getElementById('atPrompt').value = 'Quiz über Züge'`);
    await click('#atCreate', 600);
    assert.equal(await B.ev(`document.getElementById('vForm').hidden`), false, 'unknown topic: the form');
    assert.equal(await B.ev(`document.getElementById('atFormType').value`), 'quiz');
    await B.ev(`document.getElementById('atFormText').value = 'Wie heißt der schnelle Zug? | ICE | Trabi\\nWo hält der Zug? | Am Bahnhof | Am Hafen'`);
    await B.shot('atelier-5-form');
    await click('#atFormCreate', 600);
    assert.ok(await B.waitFor(`!document.getElementById('vPreview').hidden && document.querySelector('#screen h2').textContent === 'Wie heißt der schnelle Zug?'`));
    /* play this one in the preview to the end: a wrong answer first, then the right ones */
    await click('#screen .opt:not([disabled])', 200);
    for (let i = 0; i < 2; i++) {
      const right = i === 0 ? 'ICE' : 'Am Bahnhof';
      await B.ev(`(function(){ [].forEach.call(document.querySelectorAll('#screen .opt:not([disabled])'), function (b) { if (b.textContent === ${JSON.stringify(right)}) b.click(); }); })()`);
      assert.ok(await B.waitFor(`!!document.querySelector('#screen .atanswer')`, 3000), 'the answer shows');
      assert.ok(await B.waitFor(`!document.querySelector('#screen .atanswer')`, 5000), 'then the next screen comes by itself');
    }
    assert.ok(await B.waitFor(`!!document.querySelector('#screen .center h2') && document.querySelector('#screen .center h2').textContent === 'Gut gemacht!'`), 'a calm end screen');
    await B.shot('atelier-6-preview-end');
    await click('#atAdd', 500);
    assert.equal(await B.ev(`document.querySelectorAll('#atList li').length`), 2);

    /* --- the Care Team's activity list shows the games --- */
    assert.ok(await B.go(S.base + '/staff.html', `window.Lab && document.querySelectorAll('#actList .tile').length > 3`));
    await sleep(800);
    assert.equal(await B.ev(`!!document.querySelector('#actList .tile[data-key="${key}"]')`), true, 'the new game is a tile of the menu');
    assert.equal(await B.ev(`document.querySelector('#actList .tile[data-key="${key}"] .tname').textContent`), 'Quiz · Bayern');
    assert.equal(await B.ev(`document.querySelectorAll('#actList .tile[data-key^="atelier-"]').length`), 2);
    assert.equal(await B.ev(`(function(){ var a = document.getElementById('toAtelier'); return a && a.getAttribute('href') + '|' + a.textContent; })()`), 'atelier.html|Atelier');
    await B.ev(`(function(){ var t = document.querySelector('#actList .tile[data-key="${key}"]'); t.scrollIntoView({ block: 'center' }); t.querySelector('input').click(); })()`);
    await sleep(500);
    await B.shot('atelier-7-care-team-menu');

    /* --- the patient screen knows the game and plays it to the end --- */
    assert.ok(await B.go(S.base + '/patient.html', `window.Lab && !!Lab.byKey[${JSON.stringify(key)}]`), 'the patient screen has the game');
    assert.equal(await B.ev(`Lab.activities.filter(function (a) { return a.atelier; }).length`), 2);
    /* handed over exactly like every other activity: the run note the Care Team writes */
    await B.ev(`localStorage.setItem('bellatrix-care-lab-run', JSON.stringify({ id: 'R1', key: ${JSON.stringify(key)}, patient: 'P1', at: Date.now(), preview: true, auto: true, opt: { lang: 'fr', voice: false, camMode: 'off', participant: 'P1' } }))`);
    assert.ok(await B.waitFor(`Lab.isOn() && !!document.querySelector('#screen [data-a="a"]')`, 8000), 'the session starts');
    await B.ev(`document.querySelector('#screen [data-a="a"][data-i="0"]').click()`);   /* "Yes" on the welcome */
    const quiz = saved[0];
    for (let i = 0; i < quiz.items.length; i++) {
      assert.ok(await B.waitFor(`!!document.querySelector('#screen .opt') && document.querySelector('#screen h2').textContent === ${JSON.stringify(quiz.items[i].q)}`, 8000), 'question ' + (i + 1));
      if (i === 0) {
        assert.equal(await B.ev(`Lab.lang()`), 'de', 'the screen speaks the language of the game');
        assert.equal(await B.ev(`document.querySelector('.foot [data-a="help"]').textContent`), 'Hilfe');
        await B.shot('atelier-8-patient-question');
        /* a wrong answer is greyed out */
        await B.ev(`(function(){ [].some.call(document.querySelectorAll('#screen .opt'), function (b) { if (b.querySelector('.lbl').textContent !== ${JSON.stringify(quiz.items[0].a)}) { b.click(); return true; } }); })()`);
        await sleep(300);
        assert.equal(await B.ev(`document.querySelectorAll('#screen .opt.tried').length`), 1);
      }
      await B.ev(`(function(){ [].forEach.call(document.querySelectorAll('#screen .opt'), function (b) { if (b.querySelector('.lbl').textContent === ${JSON.stringify(quiz.items[i].a)}) b.click(); }); })()`);
      await sleep(250);
      /* the answer shows; "Weiter" (or the end of the sentence Bellatrix says) goes on */
      await B.ev(`(function(){ var b = document.querySelector('#screen .btn.primary'); if (b && document.querySelector('#screen .atanswer')) b.click(); })()`);
    }
    assert.ok(await B.waitFor(`(function(){ var s = Lab._t.state; return !Lab.isOn() || !!(s.step && (s.step.final || s.step.id === 'again')); })()`, 10000), 'the game reaches the closing screens');
    await B.shot('atelier-9-patient-end');
    assert.ok((await B.ev(`window.__said.join(' | ')`)).includes(quiz.items[0].q), 'Bellatrix reads the question (to the stub: no sound)');
    await B.ev(`Lab.isOn() && Lab.endSession()`);

    /* --- removing a game takes it out of the menu --- */
    assert.ok(await B.go(S.base + '/atelier.html', 'window.Atelier && document.querySelectorAll("#atList li").length === 2'));
    await click('#atList li:first-child [data-do="remove"]');
    assert.equal(await B.ev(`document.querySelectorAll('#atList li').length`), 2, 'the first tap only asks');
    assert.equal(await B.ev(`document.querySelector('#atList li:first-child [data-do="remove"]').textContent`), 'Ja, entfernen');
    await click('#atList li:first-child [data-do="remove"]');
    assert.equal(await B.ev(`document.querySelectorAll('#atList li').length`), 1);
    assert.ok(await B.go(S.base + '/patient.html', 'window.Lab && Lab.activities.length > 3'));
    assert.equal(await B.ev(`!!Lab.byKey[${JSON.stringify(key)}]`), false, 'gone from the patient screen too');
    /* a damaged entry in the storage is ignored, the rest still loads */
    await B.ev(`(function(){ var l = JSON.parse(localStorage.getItem('bellatrix-atelier-games')); l.push({ type: 'quiz', lang: 'de', title: 'x', id: 'abcd1234', items: [], code: 'alert(1)' }); l.push('nonsense'); localStorage.setItem('bellatrix-atelier-games', JSON.stringify(l)); })()`);
    assert.equal(await B.ev(`AtelierEngine.load().length`), 1);
    assert.deepEqual(B.errors, [], 'no script error on the pages');
  } finally {
    await B.close();
    killTree(S.child.pid);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ }
  }
});
