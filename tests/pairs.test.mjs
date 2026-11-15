/* Picture Pair (1.17): a classic memory game. Every card starts face down, the patient turns two
   at a time, a pair stays open and two cards that do not match turn back after a calm moment.
   Also the Care Team settings of Picture Pair, Chess and Ludo: only the essentials are asked.
   Logic tests without a browser and without any sound (speech is a stub).
   Run:  node tests/pairs.test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); }
}

/* The page's files in a sandbox with a small Lab: define, and the timers kept in a list so that
   the test decides when the "calm moment" is over. */
function load(files) {
  const defined = {}, timers = [];
  /* The shuffle is the same at every run (a small seeded generator), so the test never depends on luck. */
  let seed = 20261114;
  const M = Object.create(Math); M.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ctx = { console, Date, Math: M, JSON, Object, Array, String, Number, RegExp, Error, parseInt, parseFloat, isNaN,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {} };
  ctx.window = ctx; ctx.navigator = { onLine: true, language: 'en' }; ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.Lab = { esc: (s) => String(s == null ? '' : s), define: (a) => { defined[a.key] = a; }, byKey: defined, opt: {}, patient: 'P1', content: {}, isOn: () => true,
    _t: { state: { help: false }, choose() {} } };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, defined, timers };
}
/* The engine's API as an activity sees it. */
function engine(timers, o = {}) {
  const E = { said: [], stats: {}, pushed: {}, logs: [], step: null, refreshed: 0, later: [] };
  E.L = {
    t: (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m)),
    text: (id) => (o.content && o.content[id] !== undefined ? o.content[id] : ''),
    images: () => o.images || [], lang: () => 'en', air: () => !!o.air, voice: () => false,
    say: (s) => { E.said.push(s); }, ack() {}, log: (m) => { E.logs.push(m); },
    stat: (k, v) => { E.stats[k] = v === undefined ? (E.stats[k] || 0) + 1 : v; },
    push: (k, v) => { (E.pushed[k] = E.pushed[k] || []).push(v); },
    go: (s) => { E.step = s; }, refresh: () => { E.refreshed++; }, step: () => E.step, finish() { E.finished = true; },
    later: (fn, ms) => { E.later.push({ fn, ms }); }
  };
  E.runLater = () => { const l = E.later.splice(0); l.forEach((x) => x.fn()); return l; };
  return E;
}
const A = load(['js/art.js', 'js/activities.js']);
const pairs = A.defined.pairs;
function startLevel(o) {
  const E = engine(A.timers, o);
  const intro = pairs.start(E.L);
  assert.equal(intro.id, 'intro');
  intro.actions[0].run();
  return E;
}
const faceDown = (c) => /\bback\b/.test(c.cls) && /cback/.test(c.art);
/* What is under a card: turn it, read it, and let it turn back with a second, different card. */
function layout(E) {
  /* A fresh level, turned one card at a time: the picture appears on the card that was chosen. */
  const seen = [];
  for (let i = 0; i < E.step.choices.length; i++) {
    if (seen[i] !== undefined) continue;
    E.step.choices[i].run();
    seen[i] = E.step.choices[i].art;
    /* close it again with any other closed card (a pair may be found by chance: then both are known) */
    const j = E.step.choices.findIndex((c, k) => k !== i && faceDown(c));
    E.step.choices[j].run(); seen[j] = E.step.choices[j].art;
    E.runLater();
  }
  return seen;
}

test('the cards are NOT visible at the start: every card is face down, nothing to wait for', () => {
  for (const start of ['1', '2', '3', '4']) {
    const E = startLevel({ content: { start } });
    const n = [4, 6, 8, 12][start - 1];
    assert.equal(E.step.id, 'pairs-' + start);
    assert.equal(E.step.choices.length, n);
    assert.equal(E.step.gridCls, 'g' + n);
    assert.ok(E.step.choices.every(faceDown), 'all face down');
    assert.ok(E.step.choices.every((c) => /face down/.test(c.label) && !c.disabled), 'no picture name is read out, every card can be chosen');
    assert.ok(!E.step.afterSay && !E.step.lead, 'no look phase, no countdown');
    assert.ok(!E.step.actions.some((a) => /ready/i.test(a.label)), 'no "I am ready" button');
    assert.equal(E.later.length, 0, 'no timer runs before the first card');
    assert.equal(E.step.title, 'Find the pairs');
    assert.equal(E.step.airPointer, true, 'air pointing stays on');
  }
});

test('the spoken instruction says the cards are face down (pointing or touch)', () => {
  const air = startLevel({ air: true }).step.say(), touch = startLevel({}).step.say();
  assert.match(air, /Level 1\. 2 pairs\./); assert.match(air, /face down\. Point at a card/);
  assert.match(touch, /face down\. Tap a card/);
});

test('turning one card shows only that card', () => {
  const E = startLevel({ content: { start: '3' } });
  E.step.choices[2].run();
  assert.ok(!faceDown(E.step.choices[2]));
  assert.match(E.step.choices[2].cls, /\bup\b/);
  assert.equal(E.step.choices.filter(faceDown).length, 7);
  E.step.choices[2].run();
  assert.ok(!faceDown(E.step.choices[2]), 'choosing the open card again changes nothing');
  assert.equal(E.later.length, 0);
});

test('two cards that do not match stay open for a calm moment, then turn back', () => {
  const E0 = startLevel({ content: { start: '3' } });
  const seen = layout(E0);
  /* the same level object is still there: choose two closed cards that differ */
  const closed = E0.step.choices.map((c, i) => i).filter((i) => faceDown(E0.step.choices[i]));
  let a = -1, b = -1;
  for (const i of closed) for (const j of closed) if (a < 0 && i < j && seen[i] !== seen[j]) { a = i; b = j; }
  assert.ok(a >= 0, 'two different closed cards left');
  const before = E0.stats.notAPair || 0;
  E0.step.choices[a].run(); E0.step.choices[b].run();
  assert.match(E0.step.choices[a].cls, /wrong/); assert.match(E0.step.choices[b].cls, /wrong/);
  assert.equal(E0.stats.notAPair, before + 1);
  assert.equal(E0.later.length, 1);
  assert.ok(E0.later[0].ms >= 2000 && E0.later[0].ms <= 4000, 'a calm delay: ' + E0.later[0].ms + ' ms');
  /* during that moment a third card cannot be turned */
  const third = closed.find((i) => i !== a && i !== b);
  if (third !== undefined) { E0.step.choices[third].run(); assert.ok(faceDown(E0.step.choices[third]), 'no third card meanwhile'); }
  E0.runLater();
  assert.ok(faceDown(E0.step.choices[a]) && faceDown(E0.step.choices[b]), 'both turned back');
  assert.ok(!/wrong/.test(E0.step.choices[a].cls));
});

test('a pair stays open; all pairs found ends the level', () => {
  const E = startLevel({ content: { start: '3' } });
  const seen = layout(E);
  const todo = () => E.step.choices.map((c, i) => i).filter((i) => faceDown(E.step.choices[i]));
  let guard = 0;
  while (todo().length && guard++ < 20) {
    const i = todo()[0], j = todo().find((k) => k !== i && seen[k] === seen[i]);
    const lvl = E.step;
    lvl.choices[i].run(); lvl.choices[j].run();
    assert.match(lvl.choices[i].cls, /found/); assert.match(lvl.choices[j].cls, /found/);
    assert.ok(lvl.choices[i].disabled && lvl.choices[j].disabled, 'a found pair stays open and is not chosen again');
    if (E.step !== lvl) break;
  }
  assert.equal(E.stats.levelReached, 3);
  assert.equal(E.stats.roundsDone, 1);
  assert.ok(E.said.some((s) => /found all the pairs/.test(s)));
  E.runLater();
  assert.equal(E.step.id, 'between-3', 'then the question: next level?');
});

test('help after five misses shows the cards for a moment, then hides them again', () => {
  const E = startLevel({ content: { start: '4' } });
  const seen = layout(E);
  let n = 0;
  while (!E.step.actions.some((a) => a.label === 'Show me the cards') && n++ < 20) {
    const closed = E.step.choices.map((c, i) => i).filter((i) => faceDown(E.step.choices[i]));
    const a = closed[0], b = closed.find((k) => seen[k] !== seen[a]);
    if (b === undefined) break;
    E.step.choices[a].run(); E.step.choices[b].run(); E.runLater();
  }
  const show = E.step.actions.find((a) => a.label === 'Show me the cards');
  assert.ok(show, 'the help is offered');
  show.run();
  assert.ok(E.step.choices.every((c) => !faceDown(c)), 'all shown');
  E.runLater();
  assert.ok(E.step.choices.some(faceDown), 'hidden again');
  assert.equal(E.stats.peeks, 1);
});

test('Care Team settings of Picture Pair: no "face up" time any more, two things asked', () => {
  const shown = pairs.content.filter((f) => !f.hide);
  assert.deepEqual(Array.from(shown, (f) => f.id), ['pairs', 'start']);
  assert.ok(!pairs.content.some((f) => f.id === 'look'), 'the look time is gone');
  assert.ok(!/face up|I’m ready|look at the pictures/i.test(JSON.stringify(pairs.content) + pairs.flow));
  assert.equal(pairs.content.find((f) => f.id === 'top').value, '4', 'the hidden highest level keeps its default');
});

test('Care Team settings of Chess and Ludo: only the essentials are asked', () => {
  const G = load(['js/art.js', 'js/ludo-board.js', 'labland/packs/board-games/chess.js', 'labland/packs/board-games/chess-ui.js', 'labland/packs/board-games/ludo.js', 'labland/packs/board-games/ludo-ui.js']);
  const chess = G.defined.chess, ludo = G.defined.ludo;
  assert.ok(chess && ludo, 'both games are defined');
  const cs = chess.content.filter((f) => !f.hide), ls = ludo.content.filter((f) => !f.hide);
  assert.deepEqual(Array.from(cs, (f) => f.id), ['level']);
  assert.deepEqual(Array.from(cs[0].options, (o) => o[0]), ['easy', 'medium', 'hard']);
  assert.ok(cs[0].options.every((o) => o[1].length <= 8), 'one short word per level');
  assert.deepEqual(Array.from(ls, (f) => f.id), ['where', 'humans']);
  /* the hidden fields are still there with their defaults: the logic is unchanged */
  const def = (a, id) => a.content.find((f) => f.id === id).value;
  assert.deepEqual(['mode', 'color', 'hints', 'puzzles'].map((id) => def(chess, id)), ['ask', 'w', 'yes', '3']);
  assert.deepEqual(['where', 'players', 'tokens', 'rules', 'level'].map((id) => def(ludo, id)), ['here', '4', '2', 'easy', 'normal']);
});

test('every label of these settings and every new sentence exists in French and German', () => {
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => /^i18n.*\.js$/.test(x)).sort((a, b) => (a === 'i18n.js' ? -1 : b === 'i18n.js' ? 1 : 0))) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const G = load(['js/art.js', 'js/ludo-board.js', 'labland/packs/board-games/chess.js', 'labland/packs/board-games/chess-ui.js', 'labland/packs/board-games/ludo.js', 'labland/packs/board-games/ludo-ui.js']);
  const keys = ['Level {n}. {pairs} pairs.', 'The cards are face down. Point at a card to turn it over, then find its partner.',
    'The cards are face down. Tap a card to turn it over, then find its partner.', 'Here are the cards. Look carefully.', 'Find the pairs', 'Card {n}, face down'];
  for (const a of [pairs, G.defined.chess, G.defined.ludo]) for (const f of a.content.filter((x) => !x.hide)) {
    keys.push(f.label); (f.options || []).forEach((o) => { if (/[A-Za-z]/.test(o[1])) keys.push(o[1]); });
  }
  for (const l of ['fr', 'de']) for (const k of keys) assert.ok(ctx.I18N.dict[l][k], l + ': ' + k);
});

test('old Android WebView: no ES6 in the files changed, LF line endings', () => {
  for (const f of ['js/activities.js', 'labland/packs/board-games/chess-ui.js', 'labland/packs/board-games/ludo-ui.js', 'js/i18n-activities.js', 'js/i18n-staff.js']) {
    const src = read(f);
    assert.ok(!/\r/.test(src), f + ': LF only');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/=>|\blet\s|\bconst\s|`/.test(code), f + ': ES5 only');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
