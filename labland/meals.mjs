// "Menu" (Menüwahl, Menu du jour): the residents choose tomorrow's meals on the patient tablet, as in a hotel,
// instead of the handwritten lists. Mounted by store-server.mjs for /meals/... and /cuisine. Plain Node, no packages,
// Node 18 (nodejs-mobile on the robot head).
//
//   GET  /cuisine                         the kitchen page (cuisine.html), short address for the kitchen PC or tablet
//   GET  /meals/api/menu?date=            public: the menu of a day (tomorrow without date) and whether orders are open
//   GET  /meals/photo/<id>                public: a dish photo
//   kitchen (Authorization: Kitchen <token>, or the head itself):
//   POST /meals/api/kitchen/login {code}  the care team's 6-character code (the same as "Add a game") -> { token }
//   GET  /meals/api/kitchen/me            200 when the page may open
//   GET  /meals/api/kitchen/day?date=     the menu, the totals per dish and the list per room
//   GET  /meals/api/kitchen/days          the days that have a menu (to copy one)
//   GET  /meals/api/kitchen/card          the menu card ("Speisekarte") and whether it is the default one
//   POST /meals/api/kitchen/card          { card: { meals, until, cats } } or { reset: true } (back to the default card)
//   POST /meals/api/kitchen/menu          { date, deadline, meals }
//   POST /meals/api/kitchen/copy          { from, to }
//   POST /meals/api/kitchen/photo         raw image/jpeg|png|webp body -> { id }
//   POST /meals/api/kitchen/delivered     { date, code, meal, on }
//   head (this machine, or Authorization: Team <key> of labland/games.mjs):
//   GET  /meals/api/head/status?date=     { date, menu, open, deadline, answered: [codes] }
//   POST /meals/api/head/profiles         { residents: [{ code, name, room, diet, portion, off }] } (replaces the list)
//   POST /meals/api/head/ticket           { code, date } -> { ticket }   the tablet's right to order for this resident
//   POST /meals/api/head/kitchen          -> { code, token }              the head opens the kitchen page / shows the code
//   tablet:
//   POST /meals/api/order                 { ticket, code, date, meals, status, portion }   (or the head itself)
//
// The menu card (15 Nov, Rahma: "make it like a restaurant card"): a permanent card with starters, main dishes,
// desserts and drinks (up to 6 each), ALWAYS available, so the tablet never says "the menu is not ready". A day with
// the kitchen's daily menu shows it first ("Tagesempfehlung") and offers the card next to it for the meals the card
// covers (card.meals, lunch by default); a day without a daily menu is ordered from the card alone. Orders close the
// day before at card.until (18:00) on card-only days. GET /meals/api/menu answers `offer`: per meal and course the
// daily dishes and the card's dishes; an order may name a dish of either (the kitchen sees both in its totals).
// The default card (DEFAULT_CARD, German care-home dishes with FR / EN names) is used until the kitchen saves its own.
// No resident name in a URL and never in the log (names travel in bodies only: the kitchen needs them for the trays).
// Data: <data dir>/meals (MEALS_DATA, or BELLATRIX_DATA/meals, or labland/data/meals): menus.json, card.json,
// orders.json, profiles.json, tickets.json, photos/. Every file is written whole and renamed (a restart never sees half a file).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGames } from './games.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(HERE, '..');
export const MEALS = ['lunch', 'dinner'];
export const COURSES = ['starter', 'main', 'dessert'];
export const TAGS = ['veg', 'pork', 'soft', 'diabetic'];
/* the menu card's categories: the daily courses and the drinks */
export const CATS = ['starter', 'main', 'dessert', 'drinks'];
const LANGS = ['fr', 'en'], MAX_CARD = 6, UNTIL_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DISHES = 3, KEEP_DAYS = 120, TICKET_MS = 12 * 3600 * 1000, PHOTO_MAX = 3 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, ID_RE = /^[a-z0-9]{6,24}$/;
const PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const EXT_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const rnd = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') => { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += abc[b[i] % abc.length]; return s; };
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function sameKey(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function viaTunnel(req) { const h = req.headers || {}; return !!(h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['forwarded']); }
function loopback(req) { if (viaTunnel(req)) return false; const a = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, ''); return a === '127.0.0.1' || a === '::1'; }
function clientIp(req) { return String((req.headers && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])) || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim(); }
const pad = (n) => (n < 10 ? '0' : '') + n;
/* Local time of this machine (the care home's clock): "2026-11-16" and "2026-11-16T18:00". */
export function dayOf(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function stampOf(t) { const d = new Date(t); return dayOf(t) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
export function addDays(day, n) { const p = day.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + n, 12); return dayOf(d.getTime()); }
/* Orders for a day close the evening before (the kitchen can change it). */
export function defaultDeadline(day) { return addDays(day, -1) + 'T18:00'; }

/* ---------- what the kitchen may write ---------- */
function cleanDish(d) {
  if (!d || typeof d !== 'object') return null;
  const name = str(d.name, 60);
  if (!name) return null;
  const tags = Array.isArray(d.tags) ? TAGS.filter((t) => d.tags.indexOf(t) >= 0) : [];
  const allergens = (Array.isArray(d.allergens) ? d.allergens : String(d.allergens || '').split(/[,;]/)).map((a) => str(a, 30)).filter(Boolean).slice(0, 8);
  const id = ID_RE.test(String(d.id || '')) ? String(d.id) : rnd(10);
  const photo = ID_RE.test(String(d.photo || '')) ? String(d.photo) : '';
  return { id, name, desc: str(d.desc, 140), tags, allergens, photo };
}
export function cleanMenu(body, day) {
  const meals = {};
  const seen = new Set();
  for (const m of MEALS) {
    const src = body && body.meals && body.meals[m];
    if (!src || typeof src !== 'object') continue;
    const out = {};
    for (const c of COURSES) {
      const list = (Array.isArray(src[c]) ? src[c] : []).map(cleanDish).filter(Boolean).slice(0, MAX_DISHES);
      for (const d of list) { while (seen.has(d.id)) d.id = rnd(10); seen.add(d.id); }
      if (list.length) out[c] = list;
    }
    if (Object.keys(out).length) meals[m] = out;
  }
  const deadline = STAMP_RE.test(String((body && body.deadline) || '')) ? String(body.deadline) : defaultDeadline(day);
  return { deadline, meals };
}

/* ---------- the menu card ---------- */
/* [id, German name, description, tags, allergens, [French name, description], [English name, description]] */
const CARD_SRC = {
  starter: [
    ['cardtomato', 'Tomatensuppe', 'Mit einem Klecks Sahne und Basilikum', ['veg', 'soft'], ['Sellerie', 'Milch'],
      ['Soupe de tomates', 'Avec une touche de crème et du basilic'], ['Tomato soup', 'With a swirl of cream and basil']],
    ['cardpotato', 'Kartoffelsuppe', 'Cremig, mit Lauch und Majoran', ['veg', 'soft'], ['Sellerie', 'Milch'],
      ['Soupe de pommes de terre', 'Onctueuse, aux poireaux et à la marjolaine'], ['Potato soup', 'Creamy, with leek and marjoram']],
    ['cardsalad', 'Gemischter Salat', 'Blattsalat, Gurke, Tomate, Joghurtdressing', ['veg', 'diabetic'], ['Senf', 'Milch'],
      ['Salade composée', 'Laitue, concombre, tomate, sauce au yaourt'], ['Mixed salad', 'Lettuce, cucumber, tomato, yoghurt dressing']]
  ],
  main: [
    ['cardschnitzel', 'Schnitzel mit Kartoffelsalat', 'Paniertes Putenschnitzel, hausgemachter Kartoffelsalat', [], ['Gluten', 'Ei', 'Senf'],
      ['Escalope panée et salade de pommes de terre', 'Escalope de dinde panée, salade de pommes de terre maison'], ['Schnitzel with potato salad', 'Breaded turkey escalope, home-made potato salad']],
    ['cardlasagne', 'Gemüselasagne', 'Vegetarisch, mit Spinat, Zucchini und Béchamel', ['veg', 'soft'], ['Gluten', 'Milch', 'Ei'],
      ['Lasagnes aux légumes', 'Végétariennes, aux épinards, courgettes et béchamel'], ['Vegetable lasagne', 'Vegetarian, with spinach, courgette and béchamel']],
    ['cardfish', 'Fischfilet mit Reis', 'Gedünstetes Seelachsfilet mit Dillsoße', ['soft'], ['Fisch', 'Milch'],
      ['Filet de poisson et riz', 'Filet de colin à la vapeur, sauce à l’aneth'], ['Fish fillet with rice', 'Steamed pollock fillet with dill sauce']],
    ['cardleberkaese', 'Leberkäse mit Püree', 'Mit Schwein, Kartoffelpüree und Bratensoße', ['pork', 'soft'], ['Milch', 'Sellerie'],
      ['Leberkäse et purée', 'Avec du porc, purée de pommes de terre et sauce'], ['Leberkäse with mash', 'With pork, mashed potatoes and gravy']],
    ['cardschmarrn', 'Kaiserschmarrn', 'Mit Apfelmus und Puderzucker', ['veg', 'soft'], ['Gluten', 'Milch', 'Ei'],
      ['Kaiserschmarrn', 'Crêpe épaisse émiettée, compote de pommes et sucre glace'], ['Kaiserschmarrn', 'Shredded pancake with apple sauce and icing sugar']]
  ],
  dessert: [
    ['cardstrudel', 'Apfelstrudel', 'Warm, mit Vanillesoße', ['veg'], ['Gluten', 'Milch', 'Ei'],
      ['Strudel aux pommes', 'Tiède, avec une crème vanille'], ['Apple strudel', 'Warm, with vanilla sauce']],
    ['cardfruit', 'Obstsalat', 'Frisches Obst, ohne Zuckerzusatz', ['veg', 'soft', 'diabetic'], [],
      ['Salade de fruits', 'Fruits frais, sans sucre ajouté'], ['Fruit salad', 'Fresh fruit, no added sugar']],
    ['cardpudding', 'Vanillepudding', 'Mit Kirschsoße', ['veg', 'soft'], ['Milch'],
      ['Flan à la vanille', 'Avec un coulis de cerises'], ['Vanilla pudding', 'With cherry sauce']]
  ],
  drinks: [
    ['cardschorle', 'Apfelschorle', 'Apfelsaft mit Mineralwasser', ['veg'], [],
      ['Jus de pomme pétillant', 'Jus de pomme et eau gazeuse'], ['Apple spritzer', 'Apple juice with sparkling water']],
    ['cardcoffee', 'Kaffee', 'Auch koffeinfrei', ['veg', 'diabetic'], [],
      ['Café', 'Aussi décaféiné'], ['Coffee', 'Decaf too']],
    ['cardtea', 'Tee', 'Kräuter-, Früchte- oder Schwarztee', ['veg', 'diabetic'], [],
      ['Thé', 'Tisane, thé aux fruits ou thé noir'], ['Tea', 'Herbal, fruit or black tea']],
    ['cardwater', 'Wasser', 'Still oder mit Kohlensäure', ['veg', 'diabetic'], [],
      ['Eau', 'Plate ou gazeuse'], ['Water', 'Still or sparkling']]
  ]
};
export function defaultCard() {
  const cats = {};
  for (const c of CATS) cats[c] = CARD_SRC[c].map((x) => ({ id: x[0], name: x[1], desc: x[2], tags: x[3].slice(), allergens: x[4].slice(), photo: '',
    tr: { fr: { name: x[5][0], desc: x[5][1] }, en: { name: x[6][0], desc: x[6][1] } } }));
  return { meals: ['lunch'], until: '18:00', cats };
}
function cleanTr(t) {
  const out = {};
  for (const l of LANGS) {
    const x = t && typeof t === 'object' ? t[l] : null;
    const name = x ? str(x.name, 60) : '', desc = x ? str(x.desc, 140) : '';
    if (name || desc) out[l] = { name, desc };
  }
  return out;
}
/* what the kitchen may write for its card; null when no dish is left (the default card comes back) */
export function cleanCard(body) {
  const src = body && typeof body === 'object' ? body : {}, cats = {}, seen = new Set();
  let n = 0;
  for (const c of CATS) {
    const list = (Array.isArray(src.cats && src.cats[c]) ? src.cats[c] : []).map((d) => {
      const x = cleanDish(d);
      if (x) x.tr = cleanTr(d.tr);
      return x;
    }).filter(Boolean).slice(0, MAX_CARD);
    for (const d of list) { while (seen.has(d.id)) d.id = rnd(10); seen.add(d.id); }
    cats[c] = list; n += list.length;
  }
  if (!n) return null;
  const meals = MEALS.filter((m) => Array.isArray(src.meals) && src.meals.indexOf(m) >= 0);
  return { meals: meals.length ? meals : ['lunch'], until: UNTIL_RE.test(String(src.until || '')) ? String(src.until) : '18:00', cats };
}
/* What a resident may choose on a day: per meal and course the kitchen's daily dishes, then the card's.
   - a meal of the daily menu keeps its courses; the card is offered next to them when the card covers the meal
     (and its drinks are added);
   - a meal without a daily menu that the card covers: every category of the card. */
export function offerOf(menu, card) {
  const out = {};
  for (const m of MEALS) {
    const daily = (menu && menu.meals && menu.meals[m]) || null, withCard = !!card && card.meals.indexOf(m) >= 0;
    if (!daily && !withCard) continue;
    const meal = {};
    for (const c of CATS) {
      const d = (daily && daily[c]) || [], k = withCard ? ((card.cats && card.cats[c]) || []) : [];
      if (daily && !d.length && c !== 'drinks') continue;   /* the daily menu decides the courses of its meal */
      if (!d.length && !k.length) continue;
      meal[c] = { daily: d, card: k };
    }
    if (Object.keys(meal).length) out[m] = meal;
  }
  return out;
}
/* the day before at the card's hour */
export function cardDeadline(day, card) { return addDays(day, -1) + 'T' + ((card && UNTIL_RE.test(card.until || '')) ? card.until : '18:00'); }

/* ---------- the restrictions of a resident on a dish (the tablet does the same in js/meals.js) ---------- */
function words(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ß]+/).filter((w) => w.length >= 3); }
export function allergyHits(dish, allergies) {
  const mine = words(allergies), out = [];
  if (!mine.length) return out;
  for (const a of dish.allergens || []) {
    const w = words(a);
    if (w.some((x) => mine.some((y) => x === y || (y.length >= 4 && x.indexOf(y) === 0) || (x.length >= 4 && y.indexOf(x) === 0)))) out.push(a);
  }
  return out;
}

export function createMeals(opts = {}) {
  const DIR = opts.dataDir || process.env.MEALS_DATA || (process.env.BELLATRIX_DATA ? path.join(path.resolve(process.env.BELLATRIX_DATA), 'meals') : path.join(HERE, 'data', 'meals'));
  const games = opts.games || createGames({ dataDir: opts.gamesDir, log: () => {} });
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((t) => console.log(new Date(now()).toLocaleTimeString('en-GB') + '  meals: ' + t));
  const limitOn = opts.rateLimit !== false;
  const F = { menus: path.join(DIR, 'menus.json'), card: path.join(DIR, 'card.json'), orders: path.join(DIR, 'orders.json'), profiles: path.join(DIR, 'profiles.json'), tickets: path.join(DIR, 'tickets.json') };
  const PHOTOS = path.join(DIR, 'photos');

  /* ---------- storage ---------- */
  function readJson(f, d) { try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } }
  function writeJson(f, v) { fs.mkdirSync(DIR, { recursive: true }); const t = f + '.' + rnd(6) + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }
  const menus = () => { const v = readJson(F.menus, null); return v && v.days ? v : { days: {} }; };
  const orders = () => { const v = readJson(F.orders, null); return v && v.days ? v : { days: {} }; };
  const profiles = () => { const v = readJson(F.profiles, null); return v && v.residents ? v : { residents: {} }; };
  function prune(store) { const old = addDays(dayOf(now()), -KEEP_DAYS); for (const d of Object.keys(store.days)) if (d < old) delete store.days[d]; return store; }
  const tomorrow = () => addDays(dayOf(now()), 1);
  /* the kitchen's card, or the default card (never empty) */
  function cardRaw() { const v = readJson(F.card, null); return v && v.card ? v : null; }
  function card() { const v = cardRaw(), c = v && cleanCard(v.card); return c || defaultCard(); }
  /* everything the tablet and the kitchen need to know about a day */
  function dayInfo(date) {
    const menu = menus().days[date] || null, k = card(), offer = offerOf(menu, k);
    const deadline = menu ? menu.deadline : cardDeadline(date, k);
    const has = Object.keys(offer).length > 0;
    return { menu, card: k, offer, deadline, has, open: has && stampOf(now()) < deadline };
  }
  /* a dish of the offer: { dish, from: 'daily' | 'card' } */
  function inOffer(offer, m, c, id) {
    const x = offer[m] && offer[m][c];
    if (!x || !id) return null;
    for (const from of ['daily', 'card']) for (const d of x[from]) if (d.id === id) return { dish: d, from };
    return null;
  }

  /* ---------- who may do what ---------- */
  const team = () => games.team();
  function kitchenToken() { const t = team(); return crypto.createHmac('sha256', t.key).update('meals-kitchen|' + t.code).digest('base64url').slice(0, 32); }
  function isHead(req) {
    const m = /^Team\s+([A-Za-z0-9]{20,64})$/.exec(String((req.headers || {}).authorization || ''));
    return loopback(req) || !!(m && sameKey(m[1], team().key));
  }
  function isKitchen(req) {
    const m = /^Kitchen\s+([A-Za-z0-9_-]{20,64})$/.exec(String((req.headers || {}).authorization || ''));
    return isHead(req) || !!(m && sameKey(m[1], kitchenToken()));
  }
  const hits = new Map();
  function bump(req, what) {
    if (!limitOn) return 0;
    const k = what + '|' + clientIp(req), t = now();
    let h = hits.get(k);
    if (!h || t > h.reset) { h = { n: 0, reset: t + 10 * 60 * 1000 }; hits.set(k, h); }
    h.n++;
    if (hits.size > 5000) hits.clear();
    return h.n;
  }
  function count(req, what) { const h = limitOn && hits.get(what + '|' + clientIp(req)); return h && now() <= h.reset ? h.n : 0; }

  /* ---------- tickets: the head gives the tablet the right to order for one resident and one day ---------- */
  function tickets() { const v = readJson(F.tickets, null), t = now(), out = {}; for (const [k, x] of Object.entries((v && v.tickets) || {})) if (x && x.exp > t) out[k] = x; return out; }
  function newTicket(code, date) {
    const all = tickets(), id = rnd(24);
    all[id] = { code, date, exp: now() + TICKET_MS };
    writeJson(F.tickets, { tickets: all });
    return id;
  }

  /* ---------- the kitchen's views ---------- */
  /* the totals per dish: the daily dishes always, the card's only when someone chose them (card: true) */
  function dayView(date) {
    const info = dayInfo(date), menu = info.menu, offer = info.offer, list = (orders().days[date]) || {}, prof = profiles().residents;
    const totals = {}, rows = [], courses = {};
    for (const m of Object.keys(offer)) {
      totals[m] = {}; courses[m] = Object.keys(offer[m]);
      for (const c of courses[m]) {
        totals[m][c] = { dishes: offer[m][c].daily.map((d) => ({ id: d.id, name: d.name, n: 0, small: 0 }))
          .concat(offer[m][c].card.map((d) => ({ id: d.id, name: d.name, n: 0, small: 0, card: true }))), none: 0 };
      }
    }
    const codes = new Set(Object.keys(prof).filter((c) => !prof[c].off).concat(Object.keys(list)));
    for (const code of codes) {
      const p = prof[code] || {}, o = list[code] || null;
      const row = { code, name: p.name || (o && o.name) || '', room: p.room || (o && o.room) || '', portion: (o && o.portion) || p.portion || 'normal', diet: p.diet || (o && o.diet) || {},
        status: o ? o.status : 'open', at: o ? o.at : '', meals: {}, delivered: (o && o.delivered) || {} };
      if (o) {
        for (const m of Object.keys(offer)) {
          const mine = (o.meals && o.meals[m]) || {}, outM = {};
          for (const c of courses[m]) {
            const v = o.status === 'declined' ? 'none' : mine[c];
            const t = totals[m][c];
            let d = t.dishes.find((x) => x.id === v);
            /* a dish the card no longer has: the kitchen still sees what was ordered */
            if (!d && v && v !== 'none' && o.names && o.names[v]) { d = { id: v, name: o.names[v], n: 0, small: 0, card: true }; t.dishes.push(d); }
            if (d) { d.n++; if (row.portion === 'small') d.small++; outM[c] = d.card ? { id: d.id, name: d.name, card: true } : { id: d.id, name: d.name }; }
            else if (v === 'none') { t.none++; outM[c] = { none: true }; }
          }
          row.meals[m] = outM;
        }
      }
      rows.push(row);
    }
    for (const m of Object.keys(totals)) for (const c of Object.keys(totals[m])) totals[m][c].dishes = totals[m][c].dishes.filter((d) => !d.card || d.n > 0);
    const coll = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
    rows.sort((a, b) => coll.compare(a.room || '~', b.room || '~') || coll.compare(a.name, b.name) || coll.compare(a.code, b.code));
    const answered = rows.filter((r) => r.status !== 'open').length;
    return { date, today: dayOf(now()), tomorrow: tomorrow(), now: stampOf(now()), menu, daily: !!menu, deadline: info.deadline, courses, open: info.open, totals, rows, counts: { residents: rows.length, answered } };
  }

  /* ---------- the API ---------- */
  function photoSave(req, raw) {
    const type = String((req.headers || {})['content-type'] || '').split(';')[0].trim().toLowerCase(), ext = PHOTO_TYPES[type];
    if (!ext) return [415, { error: 'not-a-photo' }];
    if (!raw || raw.length < 8 || raw.length > PHOTO_MAX) return [413, { error: 'too-big' }];
    const sig = raw.slice(0, 12).toString('latin1');
    const ok = (ext === '.jpg' && raw[0] === 0xFF && raw[1] === 0xD8) || (ext === '.png' && sig.slice(1, 4) === 'PNG') || (ext === '.webp' && sig.slice(0, 4) === 'RIFF' && sig.slice(8, 12) === 'WEBP');
    if (!ok) return [415, { error: 'not-a-photo' }];
    const id = rnd(16);
    fs.mkdirSync(PHOTOS, { recursive: true });
    fs.writeFileSync(path.join(PHOTOS, id + ext), raw);
    return [200, { id }];
  }
  function api(req, url, body, raw) {
    const p = url.pathname.slice('/meals/api/'.length);
    const date = DATE_RE.test(String(url.searchParams.get('date') || body.date || '')) ? String(url.searchParams.get('date') || body.date) : tomorrow();
    if (p === 'menu' && req.method === 'GET') {
      const info = dayInfo(date), menu = info.menu;
      return [200, { date, menu: menu ? { deadline: menu.deadline, meals: menu.meals } : null, daily: !!menu, offer: info.offer, deadline: info.deadline, open: info.open }];
    }
    if (p === 'card' && req.method === 'GET') { const k = card(); return [200, { card: k }]; }
    /* ---------- the kitchen ---------- */
    if (p === 'kitchen/login' && req.method === 'POST') {
      if (count(req, 'code') >= 10 || bump(req, 'login') > 40) return [429, { error: 'slow-down' }];
      const code = String(body.code || '').replace(/\s+/g, '').toUpperCase();
      if (!code || !sameKey(code, team().code)) { bump(req, 'code'); return [403, { error: 'bad-code' }]; }
      log('the kitchen page signed in with the team code');
      return [200, { token: kitchenToken() }];
    }
    if (p.startsWith('kitchen/')) {
      if (!isKitchen(req)) return [403, { error: 'need-code' }];
      if (p === 'kitchen/me') return [200, { ok: true, tomorrow: tomorrow(), today: dayOf(now()) }];
      if (p === 'kitchen/day' && req.method === 'GET') return [200, dayView(date)];
      if (p === 'kitchen/days' && req.method === 'GET') {
        return [200, { days: Object.keys(menus().days).sort().reverse().slice(0, 60).map((d) => ({ date: d, dishes: Object.values(menus().days[d].meals).reduce((n, m) => n + Object.values(m).reduce((k, l) => k + l.length, 0), 0) })) }];
      }
      if (p === 'kitchen/card' && req.method === 'GET') { const v = cardRaw(); return [200, { card: card(), isDefault: !(v && cleanCard(v.card)), updated: (v && v.updated) || '' }]; }
      if (req.method !== 'POST') return [405, { error: 'POST only' }];
      if (p === 'kitchen/photo') return photoSave(req, raw);
      if (p === 'kitchen/card') {
        const clean = body.reset ? null : cleanCard(body.card);
        if (!clean) { try { fs.unlinkSync(F.card); } catch (e) { /* the default card already */ } log('menu card: the default card'); return [200, { ok: true, card: defaultCard(), isDefault: true }]; }
        const updated = new Date(now()).toISOString();
        writeJson(F.card, { card: clean, updated });
        log('menu card saved (' + CATS.map((c) => clean.cats[c].length).join('/') + ' dishes)');
        return [200, { ok: true, card: clean, isDefault: false, updated }];
      }
      if (p === 'kitchen/menu') {
        const m = menus();
        const clean = cleanMenu(body, date);
        if (!Object.keys(clean.meals).length) delete m.days[date];
        else m.days[date] = Object.assign(clean, { updated: new Date(now()).toISOString() });
        writeJson(F.menus, prune(m));
        log('menu of ' + date + ' saved (' + Object.keys(clean.meals).join(', ') + ')');
        return [200, { ok: true, menu: m.days[date] || null }];
      }
      if (p === 'kitchen/copy') {
        const from = String(body.from || ''), to = String(body.to || '');
        if (!DATE_RE.test(from) || !DATE_RE.test(to) || from === to) return [400, { error: 'bad-date' }];
        const m = menus(), src = m.days[from];
        if (!src) return [404, { error: 'no-menu' }];
        const copy = JSON.parse(JSON.stringify(src.meals));
        for (const meal of Object.values(copy)) for (const list of Object.values(meal)) for (const d of list) d.id = rnd(10);
        m.days[to] = { deadline: defaultDeadline(to), meals: copy, updated: new Date(now()).toISOString() };
        writeJson(F.menus, prune(m));
        log('menu of ' + from + ' copied to ' + to);
        return [200, { ok: true, menu: m.days[to] }];
      }
      if (p === 'kitchen/delivered') {
        const code = str(body.code, 24), meal = MEALS.includes(body.meal) ? body.meal : '';
        if (!code || !meal) return [400, { error: 'bad-request' }];
        const o = orders(), day = o.days[date] = o.days[date] || {};
        const cur = day[code] = day[code] || { code, status: 'open', meals: {}, at: '' };
        cur.delivered = cur.delivered || {};
        if (body.on) cur.delivered[meal] = stampOf(now()); else delete cur.delivered[meal];
        writeJson(F.orders, prune(o));
        return [200, { ok: true, delivered: cur.delivered }];
      }
      return [404, { error: 'not found' }];
    }
    /* ---------- the head ---------- */
    if (p.startsWith('head/')) {
      if (!isHead(req)) return [403, { error: 'not-the-head' }];
      if (p === 'head/status' && req.method === 'GET') {
        const info = dayInfo(date), day = orders().days[date] || {};
        /* menu: something to choose (the daily menu or the card), daily: the kitchen's menu of the day */
        return [200, { date, menu: info.has, daily: !!info.menu, open: info.open, deadline: info.deadline, answered: Object.keys(day).filter((c) => day[c].status && day[c].status !== 'open') }];
      }
      if (req.method !== 'POST') return [405, { error: 'POST only' }];
      if (p === 'head/kitchen') return [200, { code: team().code, token: kitchenToken() }];
      if (p === 'head/profiles') {
        const out = {};
        for (const r of (Array.isArray(body.residents) ? body.residents : []).slice(0, 300)) {
          const code = str(r && r.code, 24);
          if (!code) continue;
          const d = (r.diet && typeof r.diet === 'object') ? r.diet : {};
          out[code] = { code, name: str(r.name, 40), room: str(r.room, 40), portion: r.portion === 'small' ? 'small' : 'normal', off: !!r.off,
            diet: { veg: !!d.veg, nopork: !!d.nopork, soft: !!d.soft, diabetic: !!d.diabetic, allergies: str(d.allergies, 120) } };
        }
        writeJson(F.profiles, { residents: out, updated: new Date(now()).toISOString() });
        return [200, { ok: true, n: Object.keys(out).length }];
      }
      if (p === 'head/ticket') {
        const code = str(body.code, 24);
        if (!code) return [400, { error: 'bad-request' }];
        return [200, { ticket: newTicket(code, date), date }];
      }
      return [404, { error: 'not found' }];
    }
    /* ---------- the tablet's order ---------- */
    if (p === 'order' && req.method === 'POST') {
      const tk = tickets()[String(body.ticket || '')] || null;
      const code = str(body.code, 24) || (tk && tk.code) || '';
      if (!(isHead(req) || (tk && tk.code === code && tk.date === date))) { bump(req, 'order'); return [403, { error: 'no-ticket' }]; }
      if (bump(req, 'orders') > 600) return [429, { error: 'slow-down' }];
      const info = dayInfo(date), offer = info.offer;
      if (!info.has) return [404, { error: 'no-menu' }];
      if (!info.open) return [409, { error: 'closed', deadline: info.deadline }];
      const status = body.status === 'declined' ? 'declined' : 'chosen', meals = {}, names = {};
      let fromCard = 0;
      if (status === 'chosen') {
        for (const m of Object.keys(offer)) {
          const src = (body.meals && body.meals[m]) || {}, out = {};
          for (const c of Object.keys(offer[m])) {
            const v = String(src[c] || ''), hit = inOffer(offer, m, c, v);
            if (v === 'none') out[c] = 'none';
            else if (hit) { out[c] = v; names[v] = hit.dish.name; if (hit.from === 'card') fromCard++; }
            else if (v) return [400, { error: 'unknown-dish', meal: m, course: c }];
          }
          meals[m] = out;
        }
      }
      const prof = profiles().residents[code] || {};
      const o = orders(), day = o.days[date] = o.days[date] || {}, old = day[code] || {};
      day[code] = { code, status, meals, names, portion: body.portion === 'small' || (!body.portion && prof.portion === 'small') ? 'small' : 'normal', at: new Date(now()).toISOString(),
        by: tk ? 'tablet' : 'head', delivered: old.delivered || {}, name: prof.name || '', room: prof.room || '', diet: prof.diet || {} };
      writeJson(F.orders, prune(o));
      log('order for ' + date + ': ' + status + ' (' + (tk ? 'tablet' : 'head') + (fromCard ? ', ' + fromCard + ' from the menu card' : '') + ')');
      return [200, { ok: true, date, status }];
    }
    return [404, { error: 'not found' }];
  }

  /* ---------- files and the entry point (store-server.mjs hands over /meals/... and /cuisine) ---------- */
  function json(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  }
  function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
  function handle(req, res, url) {
    if (url.pathname === '/cuisine/') { res.writeHead(301, { Location: '/cuisine' }); res.end(); return true; }   /* the page's files are relative to / */
    if (url.pathname === '/cuisine') {
      fs.readFile(path.join(APP_DIR, 'cuisine.html'), (err, buf) => {
        if (err) { notFound(res); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
        res.end(buf);
      });
      return true;
    }
    if (!url.pathname.startsWith('/meals/')) return false;
    if (url.pathname.startsWith('/meals/photo/')) {
      const m = /^\/meals\/photo\/([a-z0-9]{6,24})$/.exec(url.pathname);
      if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) { notFound(res); return true; }
      const ext = ['.jpg', '.png', '.webp'].find((e) => fs.existsSync(path.join(PHOTOS, m[1] + e)));
      if (!ext) { notFound(res); return true; }
      fs.readFile(path.join(PHOTOS, m[1] + ext), (err, buf) => {
        if (err) { notFound(res); return; }
        res.writeHead(200, { 'Content-Type': EXT_TYPES[ext], 'Content-Length': buf.length, 'Cache-Control': 'max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });
        res.end(req.method === 'HEAD' ? undefined : buf);
      });
      return true;
    }
    if (!url.pathname.startsWith('/meals/api/')) { notFound(res); return true; }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' });
      res.end();
      return true;
    }
    const isPhoto = url.pathname === '/meals/api/kitchen/photo' && req.method === 'POST';
    const max = isPhoto ? PHOTO_MAX + 1024 : 256 * 1024;
    const chunks = []; let n = 0, tooBig = false;
    req.on('data', (c) => { if (tooBig) return; n += c.length; if (n > max) { tooBig = true; chunks.length = 0; return; } chunks.push(c); });
    req.on('end', () => {
      if (tooBig) { json(res, 413, { error: 'too-big' }); return; }
      const raw = Buffer.concat(chunks);
      let body = {};
      if (!isPhoto && raw.length) { try { body = JSON.parse(raw.toString('utf8')) || {}; } catch (e) { json(res, 400, { error: 'bad JSON' }); return; } }
      if (!body || typeof body !== 'object') body = {};
      try { const out = api(req, url, body, raw); json(res, out[0], out[1]); }
      catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server' }); }
    });
    return true;
  }
  return { handle, api, dayView, team, kitchenToken, dir: DIR };
}

/* The shared instance store-server.mjs uses (data: MEALS_DATA, BELLATRIX_DATA/meals or labland/data/meals). */
let shared = null;
export function mealsApi(req, res, url) { if (!shared) shared = createMeals(); return shared.handle(req, res, url); }
