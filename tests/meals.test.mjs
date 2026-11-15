// "Menu" (15 Nov): tomorrow's meals chosen on the patient tablet, the kitchen page, the head's daily round.
//   1. labland/meals.mjs in this process (temporary folders, a fixed clock): the menu (save, read, copy, empty),
//      the team code (kitchen sign-in, wrong codes, rate limit, the head's key), tickets and orders (deadline,
//      unknown dish, another resident), the kitchen's totals and list per room, "delivered", a restart.
//   2. js/meals.js without a browser: the resident's restrictions on a dish (blocked / said gently).
//   3. The real server (labland/store-server.mjs with BELLATRIX_DATA, like the robot head) and ONE muted headless
//      Chrome (--mute-audio, speech stubbed: no sound), the devices one after the other:
//        head    staff.html   1098 x 618   the line "Menüwahl: 2 Bewohner ohne Auswahl für morgen", ONE tap
//                                          starts the round; a fake robot bridge (rooms, drive, "arrived")
//        tablet  patient.html 1080 x 1920  greeting, one course per screen, the restricted dish shown and not
//                                          choosable, summary, thanks; the second resident says "Jetzt nicht"
//        kitchen cuisine.html 1440 x 900   the orders with totals and the list per room, the print view, the
//                                          sign-in with the team code from another computer
//      then a restart of the server with the same data folder: the orders are still there.
// Screenshots: OUT=<folder> (default: a temporary folder, printed at the end). Run: node tests/meals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-meals-'));
const OUT = process.env.OUT || path.join(TMP, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = await import('../labland/meals.mjs');
const { crc32 } = await import('../labland/games.mjs');

/* ---------- helpers ---------- */
const HEAD = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
function req(method, headers = {}, ip = '10.0.0.5') { return { method, headers, socket: { remoteAddress: ip } }; }
/* HEAD: the head on this machine; GET without a body, POST with one */
function call(meals, r, p, body = {}, raw) {
  if (r === HEAD) r = Object.assign({}, HEAD, { method: Object.keys(body).length ? 'POST' : 'GET' });
  return meals.api(r, new URL('http://x/meals/api/' + p), body, raw);
}
/* a small "photo": a plate on a coloured table (PNG, made here) */
function png(w, h, bg, plate) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - w / 2, y - h / 2), r = h * 0.36, c = d < r * 0.78 ? plate : d < r ? [250, 250, 248] : bg, o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const TODAY = M.dayOf(Date.now()), TOMORROW = M.addDays(TODAY, 1);
/* the menu of the tests: the deadline tomorrow morning, so the orders stay open whatever the hour of the run */
function menuBody(date, photos = {}) {
  return { date, deadline: M.addDays(date, 0) + 'T10:00', meals: {
    lunch: {
      starter: [{ name: 'Kürbiscremesuppe', desc: 'Mit Kürbiskernöl und Croutons', tags: ['veg', 'soft'], allergens: 'Sellerie, Milch', photo: photos.soup || '' },
        { name: 'Gemischter Salat', desc: 'Blattsalat, Gurke, Tomate', tags: ['veg'], allergens: 'Senf' }],
      main: [{ name: 'Schweinebraten mit Sauerkraut', desc: 'Mit Semmelknödel', tags: ['pork'], allergens: 'Gluten', photo: photos.pork || '' },
        { name: 'Gemüselasagne', desc: 'Mit Spinat und Béchamel', tags: ['veg'], allergens: 'Gluten, Milch, Ei' },
        { name: 'Rinderroulade mit Rotkohl', desc: 'Nach Hausfrauenart', tags: [], allergens: 'Senf, Sellerie', photo: photos.beef || '' }],
      dessert: [{ name: 'Apfelstrudel mit Vanillesoße', desc: 'Warm serviert', tags: ['veg'], allergens: 'Gluten, Nüsse' },
        { name: 'Frischer Obstsalat', desc: 'Ohne Zuckerzusatz', tags: ['veg', 'diabetic', 'soft'], allergens: '' }]
    },
    dinner: {
      main: [{ name: 'Brotzeit mit Käse', desc: 'Bauernbrot, Butter, Gurke', tags: ['veg'], allergens: 'Gluten, Milch' },
        { name: 'Grießbrei mit Kirschen', desc: 'Warm, mit Zimt', tags: ['veg', 'soft'], allergens: 'Milch' }],
      dessert: [{ name: 'Naturjoghurt', desc: '', tags: ['veg', 'soft', 'diabetic'], allergens: 'Milch' }]
    } } };
}

/* ================= 1. the server module ================= */
test('the menu: save, read, copy, empty; at most 3 dishes, known tags only', async () => {
  let now = new Date(TODAY + 'T12:00:00').getTime();
  const meals = M.createMeals({ dataDir: path.join(TMP, 'm1'), gamesDir: path.join(TMP, 'g1'), now: () => now, log: () => {} });
  const body = menuBody(TOMORROW);
  body.meals.lunch.main.push({ name: 'Vierte' });
  body.meals.lunch.main[0].tags.push('spicy');
  let r = call(meals, HEAD, 'kitchen/menu', body);
  assert.equal(r[0], 200);
  assert.equal(r[1].menu.meals.lunch.main.length, 3, 'three dishes per course at most');
  assert.deepEqual(r[1].menu.meals.lunch.main[0].tags, ['pork'], 'unknown tags dropped');
  assert.deepEqual(r[1].menu.meals.lunch.dessert[0].allergens, ['Gluten', 'Nüsse'], 'allergens as plain text tags');
  r = call(meals, req('GET'), 'menu?date=' + TOMORROW);
  assert.equal(r[0], 200, 'the menu is public (the tablet reads it)');
  assert.equal(r[1].open, true);
  assert.equal(r[1].menu.meals.dinner.dessert[0].name, 'Naturjoghurt');
  assert.equal(call(meals, req('GET'), 'menu')[1].date, TOMORROW, 'without a date: tomorrow');
  const ids = r[1].menu.meals.lunch.main.map((d) => d.id);
  assert.equal(new Set(ids).size, 3);
  const day3 = M.addDays(TOMORROW, 2);
  r = call(meals, HEAD, 'kitchen/copy', { from: TOMORROW, to: day3 });
  assert.equal(r[0], 200);
  assert.equal(r[1].menu.meals.lunch.main[2].name, 'Rinderroulade mit Rotkohl', 'copied');
  assert.ok(r[1].menu.meals.lunch.main.every((d) => ids.indexOf(d.id) < 0), 'with new dish ids');
  assert.equal(r[1].menu.deadline, M.addDays(day3, -1) + 'T18:00', 'and the default deadline of the new day');
  assert.deepEqual(call(meals, HEAD, 'kitchen/days')[1].days.map((d) => d.date), [day3, TOMORROW]);
  assert.equal(call(meals, HEAD, 'kitchen/menu', { date: day3, meals: {} })[1].menu, null, 'an empty menu removes the day');
  assert.equal(call(meals, req('GET'), 'menu?date=' + day3)[1].menu, null);
});

test('the team code: the kitchen signs in with it, wrong codes are refused and slowed down, the head has its key', async () => {
  const meals = M.createMeals({ dataDir: path.join(TMP, 'm2'), gamesDir: path.join(TMP, 'g2'), log: () => {} });
  const team = meals.team();
  assert.match(team.code, /^[A-Z0-9]{6}$/, 'the same 6-character code as "Add a game" (games/team.json)');
  assert.ok(fs.existsSync(path.join(TMP, 'g2', 'team.json')));
  const pc = (h) => req('GET', h, '192.168.1.40');
  assert.equal(call(meals, pc(), 'kitchen/day')[0], 403, 'a kitchen PC needs the code');
  assert.equal(call(meals, req('POST', {}, '192.168.1.40'), 'kitchen/login', { code: 'WRONG1' })[0], 403);
  const ok = call(meals, req('POST', {}, '192.168.1.40'), 'kitchen/login', { code: ' ' + team.code.toLowerCase() + ' ' });
  assert.equal(ok[0], 200, 'spaces and small letters are fine');
  assert.equal(call(meals, pc({ authorization: 'Kitchen ' + ok[1].token }), 'kitchen/day')[0], 200, 'then the token opens the kitchen routes');
  assert.equal(call(meals, pc({ authorization: 'Kitchen ' + ok[1].token }), 'head/status')[0], 403, 'but not the head routes');
  assert.equal(call(meals, req('GET', { 'x-forwarded-for': '203.0.113.9' }, '127.0.0.1'), 'kitchen/day')[0], 403, 'through the tunnel: never "this machine"');
  assert.equal(call(meals, pc({ authorization: 'Team ' + team.key }), 'head/status')[0], 200, 'the head with its key');
  assert.equal(call(meals, HEAD, 'head/status')[0], 200, 'the head on this machine');
  const slow = M.createMeals({ dataDir: path.join(TMP, 'm2b'), gamesDir: path.join(TMP, 'g2'), log: () => {} });
  let last = 0;
  for (let i = 0; i < 11; i++) last = call(slow, req('POST', {}, '192.168.1.41'), 'kitchen/login', { code: 'NOPE0' + (i % 10) })[0];
  assert.equal(last, 429, 'after 10 wrong codes: slow down');
  assert.equal(call(slow, req('POST', {}, '192.168.1.41'), 'kitchen/login', { code: team.code })[0], 429, 'even the right code waits');
});

test('orders: a ticket per resident and day, the deadline, unknown dishes; the kitchen\'s totals and trays; a restart', async () => {
  let now = new Date(TODAY + 'T12:00:00').getTime();
  const opts = { dataDir: path.join(TMP, 'm3'), gamesDir: path.join(TMP, 'g3'), now: () => now, log: () => {} };
  const meals = M.createMeals(opts);
  const menu = call(meals, HEAD, 'kitchen/menu', menuBody(TOMORROW))[1].menu;
  const id = (m, c, i) => menu.meals[m][c][i].id;
  assert.equal(call(meals, HEAD, 'head/profiles', { residents: [
    { code: 'P1', name: 'Frau Huber', room: 'Zimmer 12', diet: { nopork: true, allergies: 'Nüsse' } },
    { code: 'P2', name: 'Herr Maier', room: 'Zimmer 4', portion: 'small', diet: { veg: true } },
    { code: 'P3', name: 'Frau Koch', room: 'Zimmer 30', off: true }] })[0], 200);
  const t1 = call(meals, HEAD, 'head/ticket', { code: 'P1', date: TOMORROW })[1].ticket;
  const tablet = () => req('POST', {}, '192.168.69.186');
  const pick = { lunch: { starter: id('lunch', 'starter', 0), main: id('lunch', 'main', 2), dessert: id('lunch', 'dessert', 1) }, dinner: { main: 'none', dessert: id('dinner', 'dessert', 0) } };
  assert.equal(call(meals, tablet(), 'order', { code: 'P1', date: TOMORROW, meals: pick })[0], 403, 'no ticket, no order');
  assert.equal(call(meals, tablet(), 'order', { ticket: t1, code: 'P2', date: TOMORROW, meals: pick })[0], 403, 'the ticket is for one resident');
  assert.equal(call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: M.addDays(TOMORROW, 1), meals: pick })[0], 403, 'and one day');
  assert.equal(call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, meals: { lunch: { main: id('lunch', 'starter', 0) } } })[0], 400, 'a dish of another course');
  let r = call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, status: 'chosen', meals: pick });
  assert.equal(r[0], 200);
  const t2 = call(meals, HEAD, 'head/ticket', { code: 'P2', date: TOMORROW })[1].ticket;
  assert.equal(call(meals, tablet(), 'order', { ticket: t2, code: 'P2', date: TOMORROW, status: 'declined' })[0], 200, '"Not now": the kitchen asks the team');
  assert.deepEqual(call(meals, HEAD, 'head/status')[1].answered.sort(), ['P1', 'P2']);
  /* the kitchen */
  let v = call(meals, HEAD, 'kitchen/day?date=' + TOMORROW)[1];
  assert.equal(v.counts.residents, 2, 'P3 does not take part');
  assert.deepEqual(v.rows.map((x) => x.room), ['Zimmer 4', 'Zimmer 12'], 'per room, in number order');
  const beef = v.totals.lunch.main.dishes.find((d) => d.name === 'Rinderroulade mit Rotkohl');
  assert.equal(beef.n, 1);
  assert.equal(v.totals.lunch.main.none, 1, 'the resident who said "not now" counts as "ask the team"');
  assert.equal(v.totals.dinner.main.none, 2, '"Nothing for me" and "not now"');
  const p1 = v.rows.find((x) => x.code === 'P1');
  assert.equal(p1.name, 'Frau Huber'); assert.equal(p1.diet.allergies, 'Nüsse'); assert.equal(p1.meals.lunch.main.name, 'Rinderroulade mit Rotkohl'); assert.equal(p1.meals.dinner.main.none, true);
  assert.equal(v.rows.find((x) => x.code === 'P2').portion, 'small');
  assert.equal(call(meals, HEAD, 'kitchen/delivered', { date: TOMORROW, code: 'P1', meal: 'lunch', on: true })[0], 200);
  /* names never in the log */
  const lines = [];
  const logged = M.createMeals(Object.assign({}, opts, { log: (t) => lines.push(t) }));
  call(logged, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, status: 'chosen', meals: pick });
  assert.ok(lines.length && lines.every((l) => !/Huber|Maier/.test(l)), 'no resident name in the log');
  /* a restart: the same files */
  const again = M.createMeals(opts);
  v = call(again, HEAD, 'kitchen/day?date=' + TOMORROW)[1];
  assert.equal(v.counts.answered, 2, 'the orders survive a restart');
  assert.ok(v.rows.find((x) => x.code === 'P1').delivered.lunch, 'and "delivered"');
  assert.equal(call(again, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, status: 'chosen', meals: pick })[0], 200, 'and the tickets');
  /* the deadline */
  now = new Date(TOMORROW + 'T10:01:00').getTime();
  assert.equal(call(again, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, status: 'chosen', meals: pick })[0], 403, 'a ticket lasts 12 hours');
  const t3 = call(again, HEAD, 'head/ticket', { code: 'P1', date: TOMORROW })[1].ticket;
  assert.equal(call(again, tablet(), 'order', { ticket: t3, code: 'P1', date: TOMORROW, status: 'chosen', meals: pick })[0], 409, 'after the deadline the kitchen takes no change');
  assert.equal(call(again, req('GET'), 'menu?date=' + TOMORROW)[1].open, false);
});

test('the menu card: always there (default card), offered next to the daily menu, ordered alone on a day without one; the kitchen saves and resets it', async () => {
  let now = new Date(TODAY + 'T12:00:00').getTime();
  const opts = { dataDir: path.join(TMP, 'm4'), gamesDir: path.join(TMP, 'g4'), now: () => now, log: () => {} };
  const meals = M.createMeals(opts);
  /* the default card: German care-home dishes with French and English names */
  const card = call(meals, req('GET'), 'card')[1].card;
  assert.deepEqual(M.CATS.map((c) => card.cats[c].length), [3, 5, 3, 4], 'starters, main dishes, desserts, drinks');
  const all = [].concat(...M.CATS.map((c) => card.cats[c]));
  for (const n of ['Tomatensuppe', 'Kartoffelsuppe', 'Gemischter Salat', 'Schnitzel mit Kartoffelsalat', 'Gemüselasagne', 'Fischfilet mit Reis', 'Leberkäse mit Püree', 'Kaiserschmarrn',
    'Apfelstrudel', 'Obstsalat', 'Vanillepudding', 'Apfelschorle', 'Kaffee', 'Tee', 'Wasser']) assert.ok(all.some((d) => d.name === n), n + ' on the default card');
  assert.ok(all.every((d) => d.tr.fr.name && d.tr.en.name), 'every dish has a French and an English name');
  assert.deepEqual(card.cats.main.find((d) => d.name === 'Leberkäse mit Püree').tags, ['pork', 'soft'], 'Leberkäse: with pork');
  assert.ok(card.cats.main.find((d) => d.name === 'Gemüselasagne').tags.includes('veg'), 'the lasagne is vegetarian');
  assert.deepEqual(card.meals, ['lunch'], 'the card is offered for lunch by default');
  /* no daily menu: the card alone, never "not ready" */
  let r = call(meals, req('GET'), 'menu?date=' + TOMORROW)[1];
  assert.equal(r.menu, null); assert.equal(r.daily, false);
  assert.deepEqual(Object.keys(r.offer), ['lunch'], 'lunch from the card');
  assert.deepEqual(Object.keys(r.offer.lunch), ['starter', 'main', 'dessert', 'drinks'], 'one screen per category');
  assert.equal(r.offer.lunch.main.daily.length, 0); assert.equal(r.offer.lunch.main.card.length, 5);
  assert.equal(r.deadline, TODAY + 'T18:00', 'card-only days close the evening before at the card\'s hour');
  assert.equal(r.open, true);
  assert.equal(call(meals, HEAD, 'head/status?date=' + TOMORROW)[1].menu, true, 'the head\'s round has something to offer');
  /* an order from the card: the kitchen's totals and trays show it like a daily dish */
  call(meals, HEAD, 'head/profiles', { residents: [{ code: 'P1', name: 'Frau Huber', room: 'Zimmer 12', diet: { nopork: true } }, { code: 'P2', name: 'Herr Maier', room: 'Zimmer 4' }] });
  const t1 = call(meals, HEAD, 'head/ticket', { code: 'P1', date: TOMORROW })[1].ticket;
  const tablet = () => req('POST', {}, '192.168.69.186');
  assert.equal(call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, meals: { lunch: { main: 'nosuchdish' } } })[0], 400, 'an unknown dish');
  assert.equal(call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, meals: { lunch: { drinks: 'cardlasagne' } } })[0], 400, 'a dish of another category');
  r = call(meals, tablet(), 'order', { ticket: t1, code: 'P1', date: TOMORROW, status: 'chosen', meals: { lunch: { starter: 'cardtomato', main: 'cardlasagne', dessert: 'none', drinks: 'cardwater' } } });
  assert.equal(r[0], 200);
  let v = call(meals, HEAD, 'kitchen/day?date=' + TOMORROW)[1];
  assert.equal(v.daily, false); assert.deepEqual(v.courses.lunch, ['starter', 'main', 'dessert', 'drinks']);
  assert.deepEqual(v.totals.lunch.main.dishes.map((d) => d.name + ':' + d.n + ':' + !!d.card), ['Gemüselasagne:1:true'], 'only the card dishes ordered are listed');
  assert.equal(v.totals.lunch.dessert.none, 1);
  const p1 = v.rows.find((x) => x.code === 'P1');
  assert.equal(p1.meals.lunch.main.name, 'Gemüselasagne'); assert.equal(p1.meals.lunch.drinks.name, 'Wasser'); assert.equal(p1.meals.lunch.dessert.none, true);
  /* with a daily menu: the daily dishes first, the card next to them (lunch), plus the drinks; dinner as the kitchen made it */
  const daily = call(meals, HEAD, 'kitchen/menu', menuBody(TOMORROW))[1].menu;
  r = call(meals, req('GET'), 'menu?date=' + TOMORROW)[1];
  assert.equal(r.daily, true);
  assert.deepEqual(r.offer.lunch.main.daily.map((d) => d.name), daily.meals.lunch.main.map((d) => d.name), 'the daily dishes first');
  assert.equal(r.offer.lunch.main.card.length, 5, 'and the card next to them');
  assert.ok(r.offer.lunch.drinks && !r.offer.lunch.drinks.daily.length && r.offer.lunch.drinks.card.length === 4, 'the drinks from the card');
  assert.deepEqual(Object.keys(r.offer.dinner), ['main', 'dessert'], 'dinner: the daily courses only (the card is for lunch)');
  assert.equal(r.offer.dinner.main.card.length, 0);
  assert.equal(r.deadline, daily.deadline, 'the daily menu\'s deadline');
  const t2 = call(meals, HEAD, 'head/ticket', { code: 'P2', date: TOMORROW })[1].ticket;
  assert.equal(call(meals, tablet(), 'order', { ticket: t2, code: 'P2', date: TOMORROW, status: 'chosen',
    meals: { lunch: { starter: daily.meals.lunch.starter[0].id, main: 'cardfish', dessert: daily.meals.lunch.dessert[1].id, drinks: 'cardcoffee' }, dinner: { main: daily.meals.dinner.main[0].id } } })[0], 200, 'daily and card dishes in one order');
  v = call(meals, HEAD, 'kitchen/day?date=' + TOMORROW)[1];
  assert.deepEqual(v.totals.lunch.main.dishes.map((d) => d.name + ':' + d.n + (d.card ? ':card' : '')),
    ['Schweinebraten mit Sauerkraut:0', 'Gemüselasagne:0', 'Rinderroulade mit Rotkohl:0', 'Gemüselasagne:1:card', 'Fischfilet mit Reis:1:card'],
    'the daily dishes always, then the card dishes that were ordered (P1 chose the card\'s lasagne before the daily menu was there)');
  /* the kitchen's own card; a card dish ordered and removed later keeps its name for the trays */
  const mine = JSON.parse(JSON.stringify(card));
  mine.cats.main = mine.cats.main.filter((d) => d.id !== 'cardfish');
  mine.cats.starter.push({ name: 'Grießnockerlsuppe', desc: 'Klare Brühe', tags: ['soft', 'veg', 'spicy'], allergens: 'Gluten, Ei', tr: { fr: { name: 'Bouillon aux quenelles' }, de: { name: 'x' } } });
  mine.meals = ['lunch', 'dinner', 'breakfast']; mine.until = '25:00';
  r = call(meals, HEAD, 'kitchen/card', { card: mine });
  assert.equal(r[0], 200); assert.equal(r[1].isDefault, false);
  assert.equal(r[1].card.cats.starter.length, 4); assert.deepEqual(r[1].card.cats.starter[3].tags, ['veg', 'soft']);
  assert.deepEqual(Object.keys(r[1].card.cats.starter[3].tr), ['fr'], 'translations: French and English only');
  assert.deepEqual(r[1].card.meals, ['lunch', 'dinner']); assert.equal(r[1].card.until, '18:00', 'a wrong hour: 18:00');
  assert.ok(fs.existsSync(path.join(TMP, 'm4', 'card.json')));
  v = call(meals, HEAD, 'kitchen/day?date=' + TOMORROW)[1];
  assert.equal(v.rows.find((x) => x.code === 'P2').meals.lunch.main.name, 'Fischfilet mit Reis', 'the tray still says what was ordered');
  assert.ok(call(meals, req('GET'), 'menu?date=' + TOMORROW)[1].offer.dinner.main.card.length === 4, 'now the card is offered at dinner too');
  const big = JSON.parse(JSON.stringify(card)); for (let i = 0; i < 4; i++) big.cats.drinks.push({ name: 'Saft ' + i });
  assert.equal(call(meals, HEAD, 'kitchen/card', { card: big })[1].card.cats.drinks.length, 6, 'six dishes per category at most');
  /* the kitchen only */
  assert.equal(call(meals, req('POST', {}, '192.168.1.40'), 'kitchen/card', { reset: true })[0], 403, 'a PC without the code');
  assert.equal(call(meals, HEAD, 'kitchen/card', { card: { cats: {} } })[1].isDefault, true, 'an empty card brings the default card back');
  assert.equal(call(meals, HEAD, 'kitchen/card', { reset: true })[1].card.cats.main.length, 5);
  assert.equal(call(meals, HEAD, 'kitchen/card')[1].isDefault, true);
  assert.ok(!fs.existsSync(path.join(TMP, 'm4', 'card.json')));
  /* after the card's hour on a card-only day: closed, like a daily menu after its deadline */
  const d3 = M.addDays(TOMORROW, 1);
  assert.equal(call(meals, req('GET'), 'menu?date=' + d3)[1].open, true);
  now = new Date(TOMORROW + 'T18:00:00').getTime();
  assert.equal(call(meals, req('GET'), 'menu?date=' + d3)[1].open, false);
  const t3 = call(meals, HEAD, 'head/ticket', { code: 'P1', date: d3 })[1].ticket;
  assert.equal(call(meals, tablet(), 'order', { ticket: t3, code: 'P1', date: d3, status: 'chosen', meals: { lunch: { main: 'cardlasagne' } } })[0], 409);
});

/* ================= 2. the tablet's restrictions ================= */
test('a resident\'s restrictions: blocked and explained (allergy, vegetarian, no pork), or said gently (soft, diabetes)', () => {
  const ctx = { console, localStorage: { getItem: () => null }, navigator: {} }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'meals.js'), 'utf8'), ctx);
  const plain = (v) => JSON.parse(JSON.stringify(v));   /* objects of the vm context: compared as plain values */
  const f = (a, b, c) => plain(ctx.Meals.flags(a, b, c)), key = (x) => x.map((k) => k[0]);
  const pork = { tags: ['pork'], allergens: ['Gluten'] }, cake = { tags: ['veg'], allergens: ['Gluten', 'Haselnüsse'] }, salad = { tags: ['veg', 'soft', 'diabetic'], allergens: [] };
  assert.deepEqual(key(f(pork, { nopork: true }, 'main').block), ['Contains pork']);
  assert.deepEqual(key(f(pork, { veg: true }, 'main').block), ['Not vegetarian']);
  assert.deepEqual(key(f(cake, { allergies: 'nüsse, Milch' }, 'dessert').block), [], '"nüsse" is not the start of "Haselnüsse": no false alarm');
  assert.deepEqual(key(f(cake, { allergies: 'Haselnuss' }, 'dessert').block), ['Contains {list}'], 'the same word stem');
  assert.equal(f(cake, { allergies: 'Gluten' }, 'dessert').block[0][1].list, 'Gluten');
  assert.deepEqual(key(f(pork, { soft: true }, 'main').note), ['Rather firm'], 'soft food: said, still choosable');
  assert.deepEqual(key(f(cake, { diabetic: true }, 'dessert').note), ['Contains sugar']);
  assert.deepEqual(f(salad, { veg: true, soft: true, diabetic: true }, 'dessert'), { block: [], note: [] });
  assert.deepEqual(key(f(pork, { diabetic: true }, 'main').note), [], 'sugar only on desserts');
  /* the card's drinks: no "not vegetarian", no "rather firm"; sugar said */
  const schorle = { tags: ['veg'], allergens: [] }, juice = { tags: [], allergens: [] };
  assert.deepEqual(f(juice, { veg: true, soft: true }, 'drinks'), { block: [], note: [] }, 'a drink is neither meat nor firm');
  assert.deepEqual(key(f(schorle, { diabetic: true }, 'drinks').note), ['Contains sugar']);
  /* the usual allergen words in the resident's language, found whatever the language typed */
  const lasagne = { tags: ['veg'], allergens: ['Gluten', 'Milch', 'Ei'] };
  assert.equal(ctx.Meals.flags(lasagne, { allergies: 'lait' }, 'main', 'fr').block[0][1].list, 'lait', 'a French resident: "lait"');
  assert.equal(ctx.Meals.flags(lasagne, { allergies: 'Eier' }, 'main', 'de').block[0][1].list, 'Ei', '"Eier" is "Ei"');
  assert.equal(ctx.Meals.flags(lasagne, { allergies: 'egg' }, 'main', 'en').block[0][1].list, 'egg');
  assert.equal(ctx.Meals.flags(lasagne, { allergies: 'Eisbein' }, 'main', 'de').block.length, 0, 'no false alarm on a longer word');
  const dish = { name: 'Tomatensuppe', desc: 'Mit Sahne', tr: { fr: { name: 'Soupe de tomates', desc: 'Avec de la crème' }, en: { name: 'Tomato soup' } } };
  assert.equal(ctx.Meals.dishName(dish, 'fr'), 'Soupe de tomates'); assert.equal(ctx.Meals.dishDesc(dish, 'fr'), 'Avec de la crème');
  assert.equal(ctx.Meals.dishDesc(dish, 'en'), '', 'an English name without description: no German description under it');
  assert.equal(ctx.Meals.dishName(dish, 'de'), 'Tomatensuppe'); assert.equal(ctx.Meals.dishName({ name: 'Brotzeit' }, 'fr'), 'Brotzeit', 'no translation: as typed');
});

/* ================= 3. the real server and the three devices ================= */
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const DATA = path.join(TMP, 'head-data');
const children = new Set();
function startServer(port) {
  const env = Object.assign({}, process.env, { BELLATRIX_DATA: DATA });
  for (const k of ['PORTAL_DATA', 'GAMES_DATA', 'MEALS_DATA', 'FEED_DATA', 'NOTIFY_DATA', 'CALLREQ_DATA', 'ANTHROPIC_API_KEY', 'PORT']) delete env[k];
  env.BELLATRIX_NOTIFY_NO_REGISTER = '1';
  const child = spawn(process.execPath, ['labland/store-server.mjs', String(port)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child); child.on('exit', () => children.delete(child));
  let out = '';
  const ready = new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('server did not start: ' + out)), 20000);
    child.stdout.on('data', (b) => { out += b; if (out.includes('Close this window')) { clearTimeout(t); ok(); } });
    child.stderr.on('data', (b) => { out += b; });
    child.on('exit', (c) => { clearTimeout(t); ko(new Error('server exited ' + c + ': ' + out)); });
  });
  return { child, ready, log: () => out };
}
const stop = (c) => new Promise((ok) => { if (c.exitCode !== null) { ok(); return; } c.once('exit', () => ok()); c.kill(); });
const killTree = (pid) => { try { if (process.platform === 'win32') execSync('taskkill /T /F /PID ' + pid, { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };

const SILENT = '(function(){try{var s=window.speechSynthesis;if(s){s.speak=function(u){setTimeout(function(){u.onstart&&u.onstart();u.onend&&u.onend();},30);};s.cancel=function(){};}}catch(e){}})();';
/* the head's robot bridge: three rooms on the map, a drive that "arrives" after 2 s */
const ROBOTAPP = "(function(){var t=0;window.BellatrixApp={robotPlaces:function(){return JSON.stringify([{name:'Zimmer 12'},{name:'Zimmer 14'},{name:'Zimmer 20'}]);},robotState:function(){return JSON.stringify({connected:true});},robotConnect:function(){},robotGo:function(p){window.__went=(window.__went||[]).concat([p]);t=Date.now();return 'ok';},robotNav:function(){return JSON.stringify({state:Date.now()-t>2000?'arrived':'moving'});},robotStop:function(){}};})();";
let chrome = null, ws = null, seq = 0;
const pend = {};
function send(method, params = {}, sessionId) {
  return new Promise((res, rej) => { const i = ++seq; const t = setTimeout(() => { delete pend[i]; rej(new Error(method + ': no answer')); }, 30000); pend[i] = (d) => { clearTimeout(t); return d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result); }; ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
}
class Page {
  static async open(name, w, h, o = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: w, height: h });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(); p.name = name; p.sid = sessionId; p.targetId = targetId;
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!o.mobile }, sessionId);
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    if (o.headers) { await send('Network.enable', {}, sessionId); await send('Network.setExtraHTTPHeaders', { headers: o.headers }, sessionId); }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SILENT + (o.extra || '') }, sessionId);
    return p;
  }
  async go(url, wait = 1500) { await send('Page.navigate', { url }, this.sid); await sleep(wait); }
  async ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, this.sid);
    if (r.exceptionDetails) throw new Error(this.name + ': ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
  async waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; }
  async shot(file) { await sleep(500); const r = await send('Page.captureScreenshot', { format: 'png' }, this.sid); const f = path.join(OUT, file); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); SHOTS.push(f); return f; }
  async close() { try { await send('Target.closeTarget', { targetId: this.targetId }); } catch (e) { /* closed */ } }
}
const SHOTS = [];
const X = {};
const STEP_ID = "(Lab.isOn()&&Lab._t.state.step?Lab._t.state.step.id:'')";

test('the robot head\'s server: BELLATRIX_DATA/meals, /cuisine, the menu with photos', { skip: !CHROME && 'no Chrome' }, async () => {
  X.port = await freePort();
  X.A = 'http://127.0.0.1:' + X.port; X.T = 'http://localhost:' + X.port;
  const before = fs.existsSync(path.join(ROOT, 'labland', 'data', 'meals')) ? fs.statSync(path.join(ROOT, 'labland', 'data', 'meals')).mtimeMs : null;
  X.srv = startServer(X.port);
  await X.srv.ready;
  assert.equal((await fetch(X.A + '/cuisine')).status, 200, '/cuisine');
  assert.equal((await fetch(X.A + '/cuisine/', { redirect: 'manual' })).status, 301);
  const up = async (buf) => (await (await fetch(X.A + '/meals/api/kitchen/photo', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: buf })).json()).id;
  const photos = { soup: await up(png(480, 320, [120, 72, 40], [226, 138, 40])), pork: await up(png(480, 320, [96, 64, 44], [150, 84, 50])), beef: await up(png(480, 320, [86, 52, 40], [110, 40, 30])) };
  assert.ok(photos.soup && photos.pork && photos.beef, 'photos uploaded');
  assert.equal((await fetch(X.A + '/meals/api/kitchen/photo', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })).status, 415, 'not a picture');
  assert.equal((await fetch(X.A + '/meals/photo/' + photos.soup)).headers.get('content-type'), 'image/png');
  const saved = await (await fetch(X.A + '/meals/api/kitchen/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(menuBody(TOMORROW, photos)) })).json();
  assert.equal(saved.ok, true);
  X.menu = saved.menu;
  assert.ok(fs.existsSync(path.join(DATA, 'meals', 'menus.json')), 'in BELLATRIX_DATA/meals');
  assert.ok(fs.existsSync(path.join(DATA, 'meals', 'photos')), 'photos too');
  const after = fs.existsSync(path.join(ROOT, 'labland', 'data', 'meals')) ? fs.statSync(path.join(ROOT, 'labland', 'data', 'meals')).mtimeMs : null;
  assert.equal(after, before, 'labland/data is not touched');
  X.team = await (await fetch(X.A + '/meals/api/head/kitchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();   /* as the head asks it */
  assert.match(X.team.code, /^[A-Z0-9]{6}$/);
  assert.ok(fs.existsSync(path.join(DATA, 'games', 'team.json')), 'the team code in BELLATRIX_DATA/games, shared with "Add a game"');
  /* one Chrome for everything, muted */
  const profile = path.join(TMP, 'profile');
  chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let dport = 0;
  for (let i = 0; i < 120 && !dport; i++) { try { dport = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(150); } }
  let ver = null;
  for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + dport + '/json/version')).json(); } catch (e) { await sleep(150); } }
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
});

test('head: "Menüwahl: 2 Bewohner ohne Auswahl für morgen", ONE tap, the robot drives to the first room', { skip: !CHROME && 'no Chrome' }, async () => {
  assert.ok(ws, 'Chrome is there');
  const store = { patients: {
    P1: { prefs: { greet: 'Frau Huber', lang: 'de', place: 'Zimmer 12', rate: 0.92, volume: 0.9, diet: { nopork: true, allergies: 'Nüsse' } }, content: {} },
    P2: { prefs: { greet: 'Herr Maier', lang: 'de', place: 'Zimmer 14', diet: { veg: true, portion: 'small' } }, content: {} },
    P3: { prefs: { greet: 'Frau Koch', lang: 'de', place: 'Zimmer 20', diet: { off: true } }, content: {} } },
    settings: { participant: 'P1', staff: 'RB', camMode: 'off' } };
  X.head = await Page.open('head', 1098, 618, { mobile: true, extra: ROBOTAPP });
  await X.head.go(X.A + '/icons/portail-192.png', 300);
  await X.head.ev("localStorage.clear();localStorage.setItem('bellatrix-staff-lang','de');localStorage.setItem('bellatrix-link-code','MEALS2026');localStorage.setItem('bellatrix-link-server'," + JSON.stringify(X.A) + ");" +
    "localStorage.setItem('bellatrix-care-lab-v1'," + JSON.stringify(JSON.stringify(store)) + ");true");
  X.tablet = await Page.open('tablet', 1080, 1920);
  await X.tablet.go(X.T + '/icons/portail-192.png', 300);
  await X.tablet.ev("localStorage.clear();localStorage.setItem('bellatrix-link-code','MEALS2026');localStorage.setItem('bellatrix-link-server'," + JSON.stringify(X.T) + ");localStorage.setItem('bellatrix-presence-off','1');true");
  await X.tablet.go(X.T + '/patient.html', 2500);
  await X.tablet.ev('window.Posture&&(Posture.ensureSeated=function(o,done){setTimeout(done,300);return null;});true');
  await X.head.go(X.A + '/staff.html', 3500);
  assert.ok(await X.head.waitFor("!!document.getElementById('mlNote') && !document.getElementById('mlNote').hidden", 20000), 'the line is there');
  const txt = await X.head.ev("document.getElementById('mlNote').textContent");
  assert.match(txt, /Menüwahl: 2 Bewohner ohne Auswahl für morgen/, 'P3 does not take part');
  assert.match(txt, /Runde starten/);
  assert.equal(await X.head.ev("document.querySelectorAll('#mlNote [data-ml=go]').length"), 1, 'ONE button');
  /* the kitchen got the residents (names, rooms, diets) from the head */
  const prof = JSON.parse(fs.readFileSync(path.join(DATA, 'meals', 'profiles.json'), 'utf8')).residents;
  assert.equal(prof.P1.room, 'Zimmer 12'); assert.equal(prof.P1.diet.nopork, true); assert.equal(prof.P2.portion, 'small'); assert.equal(prof.P3.off, true);
  await X.head.shot('head-notification.png');
  await X.head.ev("document.querySelector('#mlNote [data-ml=go]').click();true");
  assert.ok(await X.head.waitFor("!!document.querySelector('.lk-top:not([hidden])')", 15000), 'the head shows the status only');
  assert.deepEqual(await X.head.ev('window.__went'), ['Zimmer 12'], 'to the first resident\'s room');
  const run = await X.head.ev("JSON.parse(localStorage.getItem('bellatrix-meals-round'))");
  assert.deepEqual(run.queue, ['P1', 'P2'], 'the round: room after room');
  await X.head.shot('head-status.png');
  /* pointing in the air is ON for the round unless the team chose otherwise (here the test chose 'off': no camera in this run) */
  const cm = await X.head.ev("(function(){var k='bellatrix-care-lab-v1',o=localStorage.getItem(k),s=JSON.parse(o);delete s.settings.camMode;localStorage.setItem(k,JSON.stringify(s));" +
    "var r=MealsStaff.runFor('P2').opt;localStorage.setItem(k,o);return [r.camMode,MealsStaff.runFor('P2').opt.camMode];})()");
  assert.deepEqual(cm, ['air', 'off'], 'the round: pointing by default, the team\'s choice when set');
  assert.ok(!(await X.head.ev("!!(Lab.byKey.meals && Lab.byKey.meals.noHandSigns)")), 'the menu never turns the hands off');
});

test('tablet: the greeting, one course per screen, the restricted dish explained, summary, thanks; the order is in', { skip: !CHROME && 'no Chrome' }, async () => {
  const T = X.tablet;
  assert.ok(await T.waitFor(STEP_ID + "==='meal-hello'", 40000), 'after the drive, the greeting');
  const hello = await T.ev("document.querySelector('#screen header').textContent");
  assert.match(hello, /(Guten Morgen|Guten Tag|Guten Abend), Frau Huber!/);
  assert.match(hello, /Darf ich Ihnen das Menü für morgen zeigen\?/);
  await T.shot('tablet-greeting.png');
  await T.ev("document.querySelector('#screen [data-a=a][data-i=\"0\"]').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-starter'", 15000), 'the first course');
  assert.equal(await T.ev("document.querySelectorAll('#screen .card[data-b]').length"), 2, 'two big cards, each a pointing target');
  await T.ev("document.querySelector('#screen [data-a=c][data-i=\"0\"]').click();true");          /* touch */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-main'", 10000));
  const cards = await T.ev("[].map.call(document.querySelectorAll('#screen .card'),function(c){return {dis:c.disabled,txt:c.textContent};})");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].dis, true, 'pork is not choosable for her');
  assert.match(cards[0].txt, /Enthält Schwein/, 'and the card says why');
  assert.equal(cards[2].dis, false);
  assert.equal(await T.ev("!!document.querySelector('#screen .card .mc-photo img')"), true, 'the kitchen\'s photos');
  assert.match(cards[1].txt, /Tagesempfehlung/, 'the daily dishes are marked "Tagesempfehlung"');
  assert.match(await T.ev("document.querySelector('#screen .btn.mc-tocard').textContent"), /Aus der Speisekarte wählen/, 'the card is offered next to them');
  await T.shot('tablet-course.png');
  /* a look at the card's main dishes, then back to the daily dishes */
  await T.ev("document.querySelector('#screen .btn.mc-tocard').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-main-card'", 10000), 'the card\'s category');
  assert.match(await T.ev("document.querySelector('#screen header').textContent"), /Mittagessen · Hauptgerichte/);
  const onCard = await T.ev("[].map.call(document.querySelectorAll('#screen .card'),function(c){return {dis:c.disabled,txt:c.textContent};})");
  assert.equal(onCard.length, 5, 'five main dishes on the card');
  assert.ok(onCard.some((c) => c.dis && /Leberkäse/.test(c.txt) && /Enthält Schwein/.test(c.txt)), 'Leberkäse greyed for her, with the reason');
  assert.ok(onCard.every((c) => !/Tagesempfehlung/.test(c.txt)));
  await T.ev("document.querySelector('#screen [data-a=back]').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-main'", 10000), 'Back: the daily dishes again');
  /* the same choice a held pointing (dwell) makes: core.js dispatches it with the source 'air' */
  await T.ev("Lab._t.choose(0,'air');true");
  assert.equal(await T.ev(STEP_ID), 'meal-lunch-main', 'the blocked dish does nothing');
  await T.ev("Lab._t.choose(2,'air');true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-dessert'", 10000));
  assert.match(await T.ev("document.querySelector('#screen .card').textContent"), /Enthält Nüsse/, 'her allergy');
  await T.ev("document.querySelector('#screen [data-a=c][data-i=\"1\"]').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-drinks'", 10000), 'the drinks, from the card');
  assert.match(await T.ev("document.querySelector('#screen header').textContent"), /Mittagessen · Getränke/);
  assert.equal(await T.ev("document.querySelectorAll('#screen .card').length"), 4);
  await T.ev("document.querySelector('#screen [data-a=c][data-i=\"1\"]').click();true");                  /* Kaffee */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-dinner-main'", 10000));
  await T.ev("document.querySelector('#screen .btn.mc-none').click();true");                        /* "Nichts für mich" */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-summary'", 10000), 'the summary');
  const sum = await T.ev("document.getElementById('screen').textContent");
  assert.match(sum, /Ihre Wahl/); assert.match(sum, /Rinderroulade mit Rotkohl/); assert.match(sum, /Nichts für mich/); assert.match(sum, /Naturjoghurt/, 'the single dish is included');
  assert.match(sum, /Getränk/); assert.match(sum, /Kaffee/, 'the drink from the card');
  assert.match(sum, /Bestätigen/); assert.match(sum, /Ändern/);
  await T.shot('tablet-summary.png');
  await T.ev("document.querySelector('#screen .btn.primary').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-end'", 15000), 'thanks');
  const end = await T.ev("document.getElementById('screen').textContent");
  assert.match(end, /Vielen Dank, die Küche ist informiert\./); assert.match(end, /Guten Appetit morgen!/);
  await T.shot('tablet-thanks.png');
  const counts = await T.ev('Lab._t.state.rec.counts');
  assert.ok(counts.touch >= 3 && counts.air === 1, 'touch and pointing inputs counted');
  const day = await (await fetch(X.A + '/meals/api/kitchen/day?date=' + TOMORROW)).json();
  const p1 = day.rows.find((r) => r.code === 'P1');
  assert.equal(p1.status, 'chosen');
  assert.equal(p1.meals.lunch.main.name, 'Rinderroulade mit Rotkohl');
  assert.equal(p1.meals.dinner.main.none, true);
  assert.equal(p1.meals.lunch.drinks.name, 'Kaffee', 'the card\'s drink on her tray');
  assert.deepEqual(day.totals.lunch.drinks.dishes.map((d) => d.name + ':' + d.n), ['Kaffee:1'], 'and in the totals');
  assert.equal(JSON.parse(fs.readFileSync(path.join(DATA, 'meals', 'orders.json'), 'utf8')).days[TOMORROW].P1.by, 'tablet', 'ordered with the ticket of the run');
  await T.ev("document.querySelector('#screen .btn.primary').click();true");                         /* Fertig */
});

test('the round goes on: the next room without a trip to the base; "Jetzt nicht"; then back to the base', { skip: !CHROME && 'no Chrome' }, async () => {
  const T = X.tablet, H = X.head;
  assert.ok(await H.waitFor("(window.__went||[]).length===2", 20000), 'the robot drives on');
  assert.deepEqual(await H.ev('window.__went'), ['Zimmer 12', 'Zimmer 14'], 'straight to the next resident');
  assert.ok(await T.waitFor(STEP_ID + "==='meal-hello'", 40000), 'the second resident');
  assert.match(await T.ev("document.querySelector('#screen header').textContent"), /Herr Maier/);
  await T.ev("document.querySelector('#screen [data-a=a][data-i=\"1\"]').click();true");              /* Jetzt nicht */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-end'", 10000));
  assert.match(await T.ev("document.getElementById('screen').textContent"), /Das Team fragt Sie später/);
  await sleep(800);
  await T.ev("document.querySelector('#screen .btn.primary').click();true");
  assert.ok(await H.waitFor("(window.__went||[]).length===3", 20000), 'after the last resident');
  assert.equal((await H.ev('window.__went'))[2], 'Standby-Punkt', 'back to the base');
  assert.ok(await H.waitFor("localStorage.getItem('bellatrix-meals-round')===null || localStorage.getItem('bellatrix-meals-round')==='null'", 10000), 'the round is over');
  await H.ev("var t=document.querySelector('.lk-top');t&&t.click();true"); await sleep(1700);
  await H.ev("var t=document.querySelector('.lk-top');t&&t.click();MealsStaff.refresh();true");
  assert.ok(await H.waitFor("document.getElementById('mlNote').hidden", 10000), 'nobody without an answer: no line');
  const day = await (await fetch(X.A + '/meals/api/kitchen/day?date=' + TOMORROW)).json();
  assert.equal(day.rows.find((r) => r.code === 'P2').status, 'declined', 'the kitchen sees "no choice, ask the team"');
});

/* the day after tomorrow has no daily menu: the card alone (its orders close tomorrow at 18:00, open whatever the hour of the run) */
test('tablet: a day without a menu plan goes straight to the menu card, one category per screen; the kitchen sees the order', { skip: !CHROME && 'no Chrome' }, async () => {
  const T = X.tablet, H = X.head, D2 = M.addDays(TOMORROW, 1);
  X.D2 = D2;
  assert.ok(await H.waitFor("!MealsStaff._state().round && (!LinkStaff._cur() || ['finished','cancelled'].indexOf(LinkStaff._cur().state)>=0)", 15000), 'the head is free');
  await H.ev("MealsStaff.prepare(MealsStaff.runFor('P1')," + JSON.stringify(D2) + ").then(function(r){return LinkStaff.send(r,'Zimmer 12');}).then(function(){return true;})");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-hello'", 40000), 'the greeting');
  await T.ev("document.querySelector('#screen [data-a=a][data-i=\"0\"]').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-starter'", 15000), 'the card\'s starters at once, never "not ready"');
  let txt = await T.ev("document.getElementById('screen').textContent");
  assert.match(txt, /Mittagessen · Vorspeisen/); assert.match(txt, /Tomatensuppe/); assert.match(txt, /Kartoffelsuppe/); assert.match(txt, /Gemischter Salat/);
  assert.doesNotMatch(txt, /noch nicht fertig|Tagesempfehlung/);
  assert.equal(await T.ev("document.querySelectorAll('#screen .btn.mc-tocard').length"), 0, 'already the card');
  await T.ev("document.querySelector('#screen [data-a=c][data-i=\"0\"]').click();true");                  /* Tomatensuppe */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-main'", 10000));
  const cards = await T.ev("[].map.call(document.querySelectorAll('#screen .card'),function(c){return {dis:c.disabled,txt:c.textContent,w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height};})");
  assert.equal(cards.length, 5, 'Hauptgerichte: five big cards');
  assert.equal(await T.ev("document.getElementById('screen').classList.contains('mgrid')"), true, 'in two columns');
  assert.ok(cards.every((c) => c.w > 400 && c.h > 250), 'each card a big target: ' + JSON.stringify(cards.map((c) => [Math.round(c.w), Math.round(c.h)])));
  const lk = cards.find((c) => /Leberkäse/.test(c.txt));
  assert.ok(lk.dis && /Enthält Schwein/.test(lk.txt), 'Leberkäse greyed with the reason');
  assert.ok(cards.some((c) => /Gemüselasagne/.test(c.txt) && /Vegetarisch/.test(c.txt) && !c.dis));
  assert.match(await T.ev("document.querySelector('#screen header').textContent"), /Mittagessen · Hauptgerichte/);
  assert.match(await T.ev("document.querySelector('#screen .btn.mc-none').textContent"), /Nichts für mich/);
  X.cardShot = await T.shot('tablet-card-category.png');
  await T.ev("Lab._t.choose(1,'air');true");                                                              /* Gemüselasagne, by pointing */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-dessert'", 10000));
  assert.match(await T.ev("document.querySelector('#screen header').textContent"), /Desserts/);
  await T.ev("document.querySelector('#screen .btn.mc-none').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-lunch-drinks'", 10000));
  await T.ev("document.querySelector('#screen [data-a=c][data-i=\"3\"]').click();true");                  /* Wasser */
  assert.ok(await T.waitFor(STEP_ID + "==='meal-summary'", 10000), 'the summary');
  txt = await T.ev("document.getElementById('screen').textContent");
  for (const w of ['Tomatensuppe', 'Gemüselasagne', 'Nichts für mich', 'Wasser', 'Getränk']) assert.ok(txt.includes(w), w + ' in the summary');
  await T.ev("document.querySelector('#screen .btn.primary').click();true");
  assert.ok(await T.waitFor(STEP_ID + "==='meal-end'", 15000));
  assert.match(await T.ev("document.getElementById('screen').textContent"), /Vielen Dank, die Küche ist informiert\./);
  const day = await (await fetch(X.A + '/meals/api/kitchen/day?date=' + D2)).json();
  assert.equal(day.daily, false);
  const p1 = day.rows.find((r) => r.code === 'P1');
  assert.equal(p1.status, 'chosen');
  assert.deepEqual([p1.meals.lunch.starter.name, p1.meals.lunch.main.name, !!p1.meals.lunch.dessert.none, p1.meals.lunch.drinks.name], ['Tomatensuppe', 'Gemüselasagne', true, 'Wasser']);
  assert.deepEqual(day.totals.lunch.main.dishes.map((d) => d.name + ':' + d.n), ['Gemüselasagne:1']);
  await T.ev("document.querySelector('#screen .btn.primary').click();true");                             /* Fertig */
  assert.ok(await H.waitFor("(window.__went||[]).slice(-1)[0]==='Standby-Punkt'", 20000), 'the robot goes back to the base');
});

test('kitchen: the orders (totals for the cooks, trays per room), delivered, the print view, German first', { skip: !CHROME && 'no Chrome' }, async () => {
  await X.head.close(); await X.tablet.close();
  const K = await Page.open('kitchen', 1440, 900);
  await K.go(X.A + '/cuisine.html', 2500);
  assert.ok(await K.waitFor('window.Cuisine && Cuisine.state().authed && !!Cuisine.state().day', 15000), 'this machine: no code needed');
  assert.equal(await K.ev('document.documentElement.lang'), 'de');
  await K.ev("Cuisine.show('orders');true");
  assert.ok(await K.waitFor("document.querySelectorAll('#cRooms tr[data-code]').length===4", 15000), 'two residents, lunch and dinner');
  const t = await K.ev("document.getElementById('cOrders').textContent");
  assert.match(t, /Rinderroulade mit Rotkohl/); assert.match(t, /Frau Huber/); assert.match(t, /Zimmer 12/); assert.match(t, /Allergien/);
  assert.match(t, /keine Wahl, bitte Team fragen/, 'the resident who said "not now"');
  assert.equal(await K.ev("document.querySelector('#cTotals-lunch [data-course=main] tr[data-dish] .cnum') && [].map.call(document.querySelectorAll('#cTotals-lunch [data-course=main] tr[data-dish]'),function(r){return r.querySelector('.cnum').textContent;}).join(',')"), '0,0,1');
  await K.ev("document.querySelector('#cRooms tr[data-code=P1][data-meal=lunch] .cdel').click();true");
  assert.ok(await K.waitFor("document.querySelector('#cRooms tr[data-code=P1][data-meal=lunch]').classList.contains('cdone')", 8000), 'delivered');
  await K.shot('kitchen-orders.png');
  await K.ev("Cuisine.show('menu');true"); await sleep(600);
  await K.shot('kitchen-menu.png');
  await K.ev("Cuisine.show('orders');true"); await sleep(400);
  await send('Emulation.setEmulatedMedia', { media: 'print' }, K.sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false }, K.sid);
  await sleep(400);
  const pr = await K.ev("({head: getComputedStyle(document.querySelector('.chead')).display, title: document.getElementById('cPrintHead').textContent, rooms: getComputedStyle(document.getElementById('cRooms')).display})");
  assert.equal(pr.head, 'none', 'no blue bar on paper');
  assert.match(pr.title, /Bestellungen für/, 'a title on paper');
  assert.notEqual(pr.rooms, 'none', 'the trays are printed');
  await K.shot('kitchen-print.png');
  const pdf = await send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, printBackground: false, preferCSSPageSize: true }, K.sid);
  assert.ok(Buffer.from(pdf.data, 'base64').slice(0, 4).toString() === '%PDF', 'A4 PDF');
  await K.close();
});

test('kitchen: the "Speisekarte" section (four categories, add a dish, save, the default card back), the card-only day in the orders', { skip: !CHROME && 'no Chrome' }, async () => {
  const K = await Page.open('kitchen-card', 1440, 900);
  await K.go(X.A + '/cuisine.html', 2500);
  assert.ok(await K.waitFor('window.Cuisine && Cuisine.state().authed && !!Cuisine.card().draft', 15000));
  /* the card-only day: the order from the card in the quantities and on the trays */
  await K.ev('Cuisine.setDate(' + JSON.stringify(X.D2) + ').then(function(){return true;})');
  await K.ev("Cuisine.show('orders');true");
  assert.ok(await K.waitFor("document.querySelectorAll('#cRooms tr[data-code]').length===2", 15000), 'two residents, one meal');
  let t = await K.ev("document.getElementById('cOrders').textContent");
  assert.match(t, /Kein Speiseplan für diesen Tag/); assert.match(t, /Gemüselasagne/); assert.match(t, /Wasser/); assert.match(t, /Getränk/);
  assert.match(await K.ev("document.getElementById('cState').textContent"), /Kein Speiseplan: Es gilt die Speisekarte · Wahl offen bis/);
  await K.shot('kitchen-orders-card-day.png');
  /* the section */
  await K.ev("document.getElementById('cViewCard').click();true");
  assert.ok(await K.waitFor("document.querySelectorAll('#cCardEditor .cdish').length===15", 10000), 'the default card: 15 dishes');
  assert.equal(await K.ev("document.getElementById('cDayBar').hidden"), true, 'no day bar: the card is for every day');
  t = await K.ev("document.getElementById('cCard').textContent");
  for (const w of ['Vorspeisen', 'Hauptgerichte', 'Desserts', 'Getränke', 'Gilt für', 'Bestellschluss am Vortag um', 'Das ist die Standardkarte.']) assert.ok(t.includes(w), w);
  assert.equal(await K.ev("document.getElementById('cCardLunch').checked && !document.getElementById('cCardDinner').checked"), true, 'lunch by default');
  assert.equal(await K.ev("document.getElementById('cCard-main-3-name').value"), 'Leberkäse mit Püree');
  assert.equal(await K.ev("document.getElementById('cCard-main-3-pork').checked"), true, 'with pork');
  assert.equal(await K.ev("document.getElementById('cCard-starter-0-name_fr').value"), 'Soupe de tomates', 'the French name');
  await K.shot('kitchen-card.png');
  /* a new starter, typed as a cook would */
  await K.ev("document.getElementById('cCardAdd-starter').click();true");
  await K.ev("(function(){var f=document.getElementById('cCard-starter-3-name');f.value='Grießnockerlsuppe';f.dispatchEvent(new Event('input',{bubbles:true}));" +
    "var a=document.getElementById('cCard-starter-3-allergens');a.value='Gluten, Ei';a.dispatchEvent(new Event('input',{bubbles:true}));" +
    "var s=document.getElementById('cCard-starter-3-soft');s.checked=true;s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
  assert.match(await K.ev("document.getElementById('cCardState').textContent"), /Nicht gespeichert/);
  await K.ev("document.getElementById('cCardSave').click();true");
  assert.ok(await K.waitFor("/Gespeichert um/.test(document.getElementById('cCardState').textContent)", 10000), 'saved');
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'meals', 'card.json'), 'utf8')).card;
  assert.equal(saved.cats.starter[3].name, 'Grießnockerlsuppe'); assert.deepEqual(saved.cats.starter[3].tags, ['soft']); assert.deepEqual(saved.cats.starter[3].allergens, ['Gluten', 'Ei']);
  assert.equal(saved.cats.starter[0].tr.fr.name, 'Soupe de tomates', 'the translations stay');
  assert.equal(saved.cats.main[3].id, 'cardleberkaese', 'the dishes keep their ids (the orders refer to them)');
  const menu = await (await fetch(X.A + '/meals/api/menu?date=' + M.addDays(TOMORROW, 2))).json();
  assert.equal(menu.offer.lunch.starter.card.length, 4, 'the tablet gets the new starter');
  /* back to the default card */
  await K.ev("window.confirm=function(){return true;};document.getElementById('cCardReset').click();true");
  assert.ok(await K.waitFor("/Die Standardkarte ist wieder da/.test(document.getElementById('cCardState').textContent)", 10000));
  assert.equal(await K.ev("document.querySelectorAll('#cCardEditor .cdish').length"), 15);
  assert.ok(!fs.existsSync(path.join(DATA, 'meals', 'card.json')));
  await K.close();
});

test('kitchen from another computer: the team code', { skip: !CHROME && 'no Chrome' }, async () => {
  const K = await Page.open('kitchen-pc', 1440, 900, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  await K.go(X.A + '/cuisine', 2500);
  assert.ok(await K.waitFor("!document.getElementById('cLoginBox').hidden", 10000), 'asks for the code');
  await K.ev("document.getElementById('cCode').value='ABCDEF';document.getElementById('cLoginForm').dispatchEvent(new Event('submit',{cancelable:true}));true");
  assert.ok(await K.waitFor("!document.getElementById('cLoginErr').hidden", 8000), 'a wrong code is said');
  await K.shot('kitchen-login.png');
  await K.ev("document.getElementById('cCode').value=" + JSON.stringify(X.team.code) + ";document.getElementById('cLoginForm').dispatchEvent(new Event('submit',{cancelable:true}));true");
  assert.ok(await K.waitFor('Cuisine.state().authed && !!Cuisine.state().day', 10000), 'the right code opens it');
  await K.close();
});

test('a restart of the head\'s server: the menu and the orders are still there', { skip: !CHROME && 'no Chrome' }, async () => {
  await stop(X.srv.child);
  X.srv = startServer(X.port);
  await X.srv.ready;
  const day = await (await fetch(X.A + '/meals/api/kitchen/day?date=' + TOMORROW)).json();
  assert.equal(day.menu.meals.lunch.main.length, 3);
  assert.deepEqual(day.rows.map((r) => r.code + ':' + r.status), ['P1:chosen', 'P2:declined']);
  assert.ok(day.rows[0].delivered.lunch, 'delivered too');
  assert.ok(!/Huber|Maier/.test(X.srv.log()), 'no resident name in the server log');
});

test.after(async () => {
  try { if (ws) ws.close(); } catch (e) { /* closed */ }
  if (chrome) { killTree(chrome.pid); await sleep(300); }
  for (const c of [...children]) await stop(c);
  console.log('screenshots: ' + OUT);
  for (const s of SHOTS) console.log('  ' + s);
  try { fs.rmSync(path.join(TMP, 'profile'), { recursive: true, force: true }); } catch (e) { /* locked */ }
  if (!process.env.OUT) { /* the shots live in TMP: kept for a look, printed above */ }
  else { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* locked */ } }
});
