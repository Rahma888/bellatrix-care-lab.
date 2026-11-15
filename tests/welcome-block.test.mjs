/* 1.16: the daily welcome on the waiting screen, and "Ne plus proposer" in the Care Team panel.
   Run: node tests/welcome-block.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function load() {
  const m = {};
  const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, localStorage: { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('js/daily.js'), ctx);
  return ctx.Daily;
}

test('welcome: title, date card with season and time, one short line, in three languages', () => {
  const D = load();
  for (const lang of ['en', 'fr', 'de']) {
    const w = D.welcome({ lang, code: 'T1', now: new Date(2026, 10, 11, 9, 5) });
    assert.ok(w.greeting && w.line);
    assert.match(w.card, /class="today s-autumn"/);
    assert.match(w.card, /tseason/); assert.match(w.card, /ttime/);
  }
});

test('waiting screen: uses Daily.welcome, keeps the face and header the family-call button needs', () => {
  const p = read('js/patient.js');
  assert.match(p, /Daily\.welcome\(/);
  assert.match(p, /picture facebox dwface/);
  assert.match(p, /<header>/);
  assert.match(p, /Hello, I am Bellatrix\./); /* fallback without daily.js */
});

test('Care Team: hello tile hidden (not deleted), welcome-only description', () => {
  const s = read('js/staff.js');
  assert.match(s, /a\.key !== 'hello'/);
  assert.match(s, /hello: 'The day’s welcome/);
  assert.match(read('js/activities.js'), /key: 'hello'/);
});

test('Care Team: "Contenu du jour" for the four daily activities, block and unblock', () => {
  const s = read('js/staff.js');
  assert.match(s, /DAILY_KIND = \{ sayings: 'sayings', quiz: 'quiz', album: 'memories', move: 'move' \}/);
  for (const k of ["Today’s content", 'Do not offer again', 'Removed: {n}', 'Offer again']) assert.ok(s.includes(k));
  const D = load();
  const o = { lang: 'fr', code: 'T1' };
  const day = D.get('sayings', o);
  const first = day[0].id;
  assert.equal(D.peek('sayings', o).length, day.length);
  assert.equal(D.block('sayings', first, 'T1'), true);
  assert.ok(!D.peek('sayings', o).some((x) => x.id === first));
  assert.equal(D.blocked('sayings', 'T1').length, 1);
  D.unblock('sayings', first, 'T1');
  assert.equal(D.blocked('sayings', 'T1').length, 0);
});
