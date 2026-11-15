/* Seated Move Along (1.16, workstream E) and the removal of "My Music Moment".
   Logic tests without a browser: the parts of the body, the daily rotation, Daily (js/daily.js) when
   it is there, the official videos and the drawn fallback, the patient-screen rules, the texts in
   FR and DE, and that 'musicmoment' is gone.
   Run:  node tests/move.test.mjs
         node tests/move.test.mjs --online   also asks YouTube oEmbed that every video is still public,
                                             embeddable and on the same channel (no video is downloaded)
         node tests/move.test.mjs --strict   also fails while files of other owners still name musicmoment */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '');
const ONLINE = process.argv.includes('--online'), STRICT = process.argv.includes('--strict');
let pass = 0, fail = 0;
async function test(name, a, b) {
  const fn = typeof a === 'function' ? a : b;
  if (a && a.skip) { console.log('SKIP ' + name); return; }
  try { await fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); }
}

/* The page's files in a sandbox, with a small Lab (only define and what move.js reads) and,
   optionally, a document and a navigator. */
function load(o = {}) {
  const defined = [];
  const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval, Object, Array, String, Number, RegExp, Error };
  ctx.window = ctx;
  ctx.navigator = { onLine: o.online !== false };
  if (o.document) ctx.document = o.document;
  if (o.Daily) ctx.Daily = o.Daily;
  if (o.YT) ctx.YT = o.YT;
  if (o.storage) ctx.localStorage = o.storage;
  ctx.Lab = { esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    define: (a) => { defined.push(a); ctx.Lab.byKey[a.key] = a; }, byKey: {}, opt: { camMove: !!o.camMove, volume: 0.9 }, patient: o.code || 'P1', content: {}, _t: { state: { help: false } } };
  vm.createContext(ctx);
  const files = o.files || ['js/i18n.js', 'js/i18n-core.js', 'js/i18n-activities.js', 'js/i18n-staff.js', 'js/art.js', 'js/activities.js', 'js/move.js'];
  for (const f of files) {
    const src = read(f);
    if (f === 'js/i18n-staff.js') { try { vm.runInContext(src, ctx, { filename: f }); } catch (e) { /* needs the staff page; only its dictionary matters */ } continue; }
    vm.runInContext(src, ctx, { filename: f });
  }
  return { ctx, defined, M: ctx.MoveLab, act: ctx.Lab.byKey.move };
}
function fakeDocument() {
  const el = () => ({ appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], style: {} });
  return { getElementById: (id) => (id === 'move-css' ? null : el()), createElement: () => el(), querySelector: () => null, head: el(), documentElement: el() };
}
/* A fake engine API (js/core.js "API") that records the screens. */
function engine(env, opts = {}) {
  const { ctx, act } = env, lang = opts.lang || 'en';
  const content = Object.assign({}, opts.content || {});
  const L = {
    shown: [], said: [], stats: {}, logs: [], finished: false, timers: [], consent: {}, cur: null,
    t: (s, v) => ctx.I18N.t(lang, s, v), lang: () => lang,
    go(step) { if (step) { if (L.cur && L.cur.leave) L.cur.leave(); L.cur = step; L.shown.push(step); if (step.after) step.after(); } },
    finish() { L.finished = true; }, say: (s) => L.said.push(s), log: (m) => L.logs.push(m),
    stat: (k, v) => { L.stats[k] = v === undefined ? (L.stats[k] || 0) + 1 : v; }, push: (k, v) => { (L.stats[k] = L.stats[k] || []).push(v); },
    text: (id) => (content[id] !== undefined ? String(content[id]) : ctx.I18N.pick(lang, (act.content.find((f) => f.id === id) || {}).value) || ''),
    later: (fn, ms) => L.timers.push({ fn, ms }), every: () => {}, ack: () => {},
    consent: (o, done) => { done(true); return null; }, setConsent: (k, v) => { L.consent[k] = v; }, consentOf: (k) => L.consent[k],
    step: () => L.cur
  };
  L.go(act.start(L));
  return L;
}
const tap = (L, label) => {
  const st = L.cur, a = (st.actions || []).find((x) => x.label === label), c = (st.choices || []).find((x) => x.label === label);
  assert.ok(a || c, 'no button "' + label + '" on ' + st.id + ' (' + [...(st.actions || []), ...(st.choices || [])].map((x) => x.label).join(', ') + ')');
  (a || c).run('touch');
};
const sentences = (s) => String(s).split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean).length;
const env = load();
const { M } = env;

/* ---------------------------------------------------------------- the activity and its parts */
await test('"move" is defined once, by js/move.js, with the part of the body, count, repetitions and videos', () => {
  const moves = env.defined.filter((a) => a.key === 'move');
  assert.equal(moves.length, 1);
  assert.ok(!/key:\s*'move'/.test(code('js/activities.js')), 'js/activities.js no longer defines move');
  assert.ok(/key:\s*'move'/.test(read('js/move.js')));
  assert.deepEqual([...env.act.content.map((f) => f.id)], ['zone', 'count', 'reps', 'video']);
  assert.equal(env.act.day, 5); assert.equal(env.act.name, 'Seated Move Along');
  assert.deepEqual([...env.act.content[0].options.map((o) => o[0])],['ask', 'legs', 'upper', 'back', 'arms', 'neck', 'breath']);
});
await test('six parts of the body, each with at least four movements and words in FR, DE and EN', () => {
  assert.deepEqual([...M.ZONE_IDS], ['legs', 'upper', 'back', 'arms', 'neck', 'breath']);
  for (const z of M.ZONES) {
    for (const k of ['name', 'today', 'say']) for (const l of ['en', 'fr', 'de']) assert.ok(z[k][l], z.id + ' ' + k + ' ' + l);
    assert.equal(sentences(z.say.en), 1, z.id + ': one sentence');
    assert.ok(M.BANK.filter((x) => x.zone === z.id).length >= 4, z.id);
  }
});
await test('every movement: one short sentence in each language, seated and gentle, a drawing that exists', () => {
  const ids = new Set();
  for (const x of M.BANK) {
    assert.ok(!ids.has(x.id), 'duplicate ' + x.id); ids.add(x.id);
    assert.ok(M.ZONE_IDS.includes(x.zone), x.id);
    for (const l of ['en', 'fr', 'de']) {
      assert.ok(x.title[l] && x.title[l].length <= 32, x.id + ' title ' + l);
      assert.ok(x.how[l] && x.how[l].length <= 100, x.id + ' how ' + l + ' (' + (x.how[l] || '').length + ')');
      assert.equal(sentences(x.how[l]), 1, x.id + ' one sentence ' + l);
      assert.ok(!M.UNSAFE.test(x.title[l] + ' ' + x.how[l]), x.id + ' must stay seated: ' + x.how[l]);
    }
    assert.ok(M.ANIMS[x.anim], x.id + ' anim'); assert.equal(M.ANIMS[x.anim].fig, x.fig, x.id + ' drawing');
    assert.ok(x.pose === null || ['one', 'both', 'cross', 'out'].includes(x.pose), x.id + ' pose the camera knows');
  }
});

/* ---------------------------------------------------------------- daily rotation */
const day = (n) => new Date(2026, 10, 10 + n, 9, 30);
await test('the suggested part of the body changes every day and covers all six in six days', () => {
  for (const code of ['P1', 'P2', 'ROSE-7']) {
    const seen = new Set();
    for (let i = 0; i < 6; i++) { assert.notEqual(M.zoneOfDay(day(i), code), M.zoneOfDay(day(i + 1), code)); seen.add(M.zoneOfDay(day(i), code)); }
    assert.equal(seen.size, 6, code);
  }
  assert.equal(M.zoneOfDay(new Date(2026, 10, 10, 7), 'P1'), M.zoneOfDay(new Date(2026, 10, 10, 22), 'P1'), 'same all day');
});
await test('the movements change every day (never the same set two days running) and stay the same all day', () => {
  for (const z of M.ZONE_IDS) for (const code of ['P1', 'P2']) {
    let prev = null;
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const ids = M.plan(z, { date: day(i), code, count: 3, daily: null }).items.map((x) => x.id);
      assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
      ids.forEach((id) => seen.add(id));
      if (prev) assert.notDeepEqual([...ids].sort(), [...prev].sort(), z + ' ' + code + ' day ' + i);
      prev = ids;
    }
    assert.equal(seen.size, M.BANK.filter((x) => x.zone === z).length, z + ': every movement comes up');
    assert.deepEqual(M.plan(z, { date: new Date(2026, 10, 10, 8), code, count: 3, daily: null }).items.map((x) => x.id),
      M.plan(z, { date: new Date(2026, 10, 10, 20), code, count: 3, daily: null }).items.map((x) => x.id));
  }
});
await test('Daily.get("move") comes first: bank ids and safe new movements, unsafe ones left out, the bank fills up', () => {
  let asked = null;
  const Daily = { get: (kind, o) => { asked = [kind, o]; return { items: ['back-lean', { id: 'n1', zone: 'back', title: 'Shoulder blades', how: { en: 'Squeeze your shoulder blades together, then relax.', fr: 'Serrez les omoplates, puis relâchez.', de: 'Ziehen Sie die Schulterblätter zusammen und lassen Sie locker.' }, anim: 'twist' },
    { id: 'n2', zone: 'back', title: 'Stand up', how: 'Stand up and touch the floor.' }, { id: 'n3', zone: 'legs', title: 'x', how: 'Lift a knee.' }, 'not-a-movement'] }; } };
  const e = load({ Daily });
  const p = e.M.plan('back', { date: day(0), code: 'P1', count: 3, lang: 'fr' });
  assert.equal(asked[0], 'move'); assert.equal(asked[1].lang, 'fr'); assert.equal(asked[1].code, 'P1');
  assert.equal(p.items[0].id, 'back-lean'); assert.equal(p.items[1].id, 'daily-n1'); assert.equal(p.items[1].anim, 'twist');
  assert.ok(!p.items.some((x) => /n2|n3/.test(x.id)), 'standing and other parts left out');
  assert.equal(p.items.length, 3); assert.equal(p.source, 'daily+bank');
  assert.equal(e.M.pick('fr', p.items[1].how), 'Serrez les omoplates, puis relâchez.');
  for (const broken of [{ get: () => { throw new Error('no'); } }, { get: () => Promise.resolve([]) }, { get: () => null }, {}]) {
    const q = load({ Daily: broken }).M.plan('back', { date: day(0), code: 'P1', count: 3 });
    assert.equal(q.source, 'bank'); assert.equal(q.items.length, 3);
  }
});

await test('with the real js/daily.js (agent D): every movement of its bank is taken, drawn and placed; no movement twice', { skip: !fs.existsSync(path.join(ROOT, 'js/daily.js')) }, () => {
  const mem = {}, storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const e = load({ storage, files: ['js/i18n.js', 'js/i18n-core.js', 'js/i18n-activities.js', 'js/art.js', 'js/daily.js', 'js/move.js'] });
  const keys = [...read('js/daily.js').matchAll(/MV\('([a-z0-9-]+)', '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 20, 'daily.js bank found');
  const src = read('js/move.js');
  const unmapped = keys.filter((k) => !new RegExp('\\b' + k + ": \\['").test(src));
  assert.deepEqual(unmapped, [], 'js/move.js DAILY_AS: give these Daily movements a part of the body and a drawing');
  for (const lang of ['en', 'fr', 'de']) for (let i = 0; i < 4; i++) {
    const b = e.ctx.Daily.get('move', { lang, code: 'P' + i, life: {}, date: day(i) });
    const rejected = [...b].filter((x) => !e.M.fromDaily(x)).map((x) => x.id + ' ' + x.how);
    assert.deepEqual(rejected, [], lang + ': Daily movements refused by the safety filter');
    for (const z of e.M.ZONE_IDS) {
      const p = e.M.plan(z, { date: day(i), code: 'P' + i, count: 3, lang, life: {} });
      assert.equal(p.items.length, 3, z);
      assert.equal(new Set(p.items.map((x) => x.anim)).size, 3, lang + ' ' + z + ': three different movements ' + p.items.map((x) => x.id));
      assert.ok(p.items.every((x) => x.zone === z && e.M.ANIMS[x.anim]));
      /* Daily's own zones differ (its neck movements are in its "back"): Daily must be used whenever its
         day's batch has a movement for this part of the body. */
      const forZone = [...b].map((x) => e.M.fromDaily(x)).filter((x) => x && x.zone === z);
      if (forZone.length) assert.ok(/daily/.test(p.source), lang + ' ' + z + ' uses Daily (' + forZone.map((x) => x.id) + ')');
      for (const x of p.items) if (x.daily) { assert.equal(typeof x.title, 'string'); assert.ok(x.reps >= 2 && x.reps <= 10, x.id + ' reps'); }
    }
  }
});

/* ---------------------------------------------------------------- videos and the drawn fallback */
const OFFICIAL = ['Homerton Healthcare NHS Foundation Trust', 'West Suffolk NHS Foundation Trust', 'Leicestershire Partnership NHS Trust', 'Arthritis UK',
  'North Bristol NHS Trust', 'NHS 24', 'Coventry and Warwickshire Partnership NHS Trust', 'Siel Bleu', 'GymSana asbl/vzw - Siel Bleu Belgique',
  'Stiftung Pfennigparade', 'Deutsche Rentenversicherung Bund - Ihre Reha', 'AOK - Der Gesundheitskanal', 'BARMER'];
await test('videos: official channels only, unique YouTube ids, at least one per part of the body in FR, DE and EN', () => {
  const ids = new Set();
  for (const v of M.VIDEOS) {
    assert.match(v.id, /^[A-Za-z0-9_-]{11}$/); assert.ok(!ids.has(v.id), 'duplicate ' + v.id); ids.add(v.id);
    assert.ok(OFFICIAL.includes(v.channel), 'not on the list of official channels: ' + v.channel);
    assert.ok(['en', 'fr', 'de'].includes(v.lang)); assert.ok(v.zones.length && v.zones.every((z) => M.ZONE_IDS.includes(z)));
    assert.ok(v.min > 0 && v.min <= 15, v.id + ' short session');
  }
  for (const z of M.ZONE_IDS) for (const l of ['en', 'fr', 'de']) {
    const v = M.videoFor(z, l, day(0));
    assert.ok(v, z + ' ' + l); assert.equal(v.lang, l, 'never a video in another language');
  }
  assert.match(M.VIDEO_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  const src = read('js/move.js');
  assert.ok(src.includes("host: 'https://www.youtube-nocookie.com'") && src.includes('https://www.youtube.com/iframe_api'), 'YouTube\'s own embedded player');
  assert.ok(!/download|\.mp4|googlevideo|ytdl|cnvmp3/i.test(code('js/move.js')), 'nothing is downloaded');
});
await test('patient screens: one title, a picture, three buttons at most, one short sentence (EN, FR, DE)', () => {
  for (const lang of ['en', 'fr', 'de']) {
    const e = load({ document: fakeDocument() });
    const L = engine(e, { lang });
    const check = (st) => {
      assert.ok(st.title, st.id + ' title');
      const n = (st.actions || []).length + (st.choices || []).length;
      assert.ok(n >= 1 && n <= 3, st.id + ': ' + n + ' buttons');
      const say = typeof st.say === 'function' ? st.say() : st.say !== undefined ? st.say : st.title;
      assert.equal(sentences(say), 1, st.id + ' says one sentence: ' + say);
      assert.ok(st.pic || /<svg|class="figure|class="calib/.test(st.body || '') || st.choices, st.id + ' has a picture');
    };
    check(L.cur);
    assert.ok(L.cur.actions.some((a) => a.label === L.t('Watch a video')), 'online: a video is offered');
    tap(L, L.t('Another part'));
    for (let p = 0; p < 3; p++) { check(L.cur); assert.equal(L.cur.choices.length, 3); if (p < 2) tap(L, L.t('Other parts')); }
    tap(L, e.M.pick(lang, e.M.ZONES[5].name));
    assert.equal(L.cur.id, 'zone-breath');
    tap(L, L.t('Let’s begin'));
    for (let i = 0; i < 3; i++) {
      check(L.cur);
      assert.ok(/^move-/.test(L.cur.id));
      assert.equal(L.cur.actions[0].label, L.t('I did one'), '"C’est fait" first');
      if (lang === 'fr') assert.equal(L.cur.actions[0].label, 'C’est fait');
      for (let r = 0; r < 3; r++) tap(L, L.t('I did one'));
      L.timers.pop().fn();
    }
    assert.ok(L.finished, 'finishes after the last movement');
    assert.equal(L.stats.moves.length, 3); assert.equal(L.stats.moveZone, 'Breathing'); assert.equal(L.stats.moveSource, 'bank');
  }
});
await test('fallback: no internet = no video button; a video that fails gives the drawn movements', async () => {
  let L = engine(load({ online: false, document: fakeDocument() }));
  assert.ok(!L.cur.actions.some((a) => a.label === 'Watch a video'), 'offline: no video button');
  assert.ok(L.cur.actions.length <= 2);
  L = engine(load({ document: fakeDocument() }), { content: { video: 'off' } });
  assert.ok(!L.cur.actions.some((a) => a.label === 'Watch a video'), 'videos switched off by the team');
  /* YouTube's player answers with an error (blocked, removed): drawings instead, then the movements. */
  const YT = { Player: function (el, o) { this.destroy = () => {}; this.getCurrentTime = () => 0; setTimeout(() => o.events.onError({ data: 150 }), 0); } };
  const e = load({ document: fakeDocument(), YT });
  L = engine(e, { content: { zone: 'neck' } });
  tap(L, 'Watch a video');
  assert.equal(L.cur.id, 'video-neck');
  assert.equal(L.cur.actions.length, 2);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(L.cur.id, 'novideo', 'the drawn movements take over');
  assert.equal(L.stats.moveVideo, 'not available');
  tap(L, 'Let’s begin');
  assert.ok(/^move-neck-/.test(L.cur.id));
  assert.ok(/<svg class="mvfig/.test(L.cur.body), 'an animated drawing');
  /* No answer at all from YouTube: the 20-second watchdog does the same. */
  const silent = { Player: function () { this.destroy = () => {}; } };
  L = engine(load({ document: fakeDocument(), YT: silent }), { content: { zone: 'legs' } });
  tap(L, 'Watch a video');
  await new Promise((r) => setTimeout(r, 5));
  const dog = L.timers.find((t) => t.ms === 20000);
  assert.ok(dog, 'watchdog'); dog.fn();
  assert.equal(L.cur.id, 'novideo');
  /* The staff can fix the part of the body. */
  assert.equal(engine(load({ document: fakeDocument() }), { content: { zone: 'arms' } }).cur.id, 'zone-arms');
});
await test('camera counting kept as an option: arm movements counted by the camera, the others tapped', () => {
  const e = load({ camMove: true, document: fakeDocument() });
  const L = engine(e, { content: { zone: 'upper', count: '5' } });
  tap(L, 'Let’s begin');
  assert.equal(L.cur.id, 'calibrate');
  assert.ok(L.cur.pose && L.cur.pose.kind === null);
  tap(L, 'Ready');
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const st = L.cur, x = st.pose;
    assert.ok(x, 'camera stays on');
    seen.push(x.kind);
    const did = st.actions.find((a) => a.label === 'I did one');
    assert.equal(!!did.primary, !x.kind, 'tap is the main button only when the camera cannot count');
    for (let r = 0; r < 3; r++) (x.kind ? x.onSeen() : did.run('touch'));
    L.timers.pop().fn();
  }
  assert.ok(seen.some((k) => k) && seen.some((k) => !k), seen.join(','));
  assert.ok(L.stats.moves.some((m) => m.counted === 'camera') && L.stats.moves.some((m) => m.counted === 'tap'));
});
await test('drawings: every movement has an SVG that moves with CSS, and holds still for reduced motion', () => {
  const css = M.css();
  for (const a of Object.keys(M.ANIMS)) {
    const svg = M.figure({ anim: a });
    assert.match(svg, /^<svg class="mvfig [^"]*mv-a-/); assert.ok(svg.includes('viewBox="0 0 400 400"'));
    for (const p of Object.keys(M.ANIMS[a].parts)) {
      assert.ok(svg.includes('mvp-' + p), a + ': part ' + p + ' in the drawing');
      assert.ok(css.includes('@keyframes mv-' + a + '-' + p + ' '), a + '-' + p + ' keyframes');
    }
  }
  assert.ok(/prefers-reduced-motion: reduce[\s\S]*paused/.test(css));
  assert.ok(!/font-family|font:/.test(css), 'no fonts: the type tokens stay in css/lab.css');
  for (const z of M.ZONE_IDS) assert.ok(M.zoneIcon(z).includes('mv-z-' + z) && !M.zoneIcon(z).includes('mv-run'));
  const src = read('js/move.js');
  assert.ok(!/=>|`|\?\.|\blet\s|\bconst\s|\bclass\s|:has\(|color-mix/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''")), 'ES5 for the Android 9 WebView');
});

/* ---------------------------------------------------------------- texts */
await test('every text of move.js exists in French and German (patient screen and Care Team)', () => {
  const src = read('js/move.js'), keys = new Set();
  for (const m of src.matchAll(/L\.t\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
  keys.add(env.act.name); keys.add(env.act.flow);
  for (const f of env.act.content) { keys.add(f.label); (f.options || []).forEach((o) => keys.add(o[1])); }
  ['One', 'Two', 'Three', 'Seated movement: body part', 'Seated movement: video', 'Seated movement: movements of the day', 'Gentle seated movements, new every day.'].forEach((k) => keys.add(k));
  const d = env.ctx.I18N.dict;
  const missing = [...keys].filter((k) => !d.fr[k] || !d.de[k]);
  assert.deepEqual(missing, []);
  assert.equal(env.ctx.I18N.t('fr', 'I did one'), 'C’est fait');
  assert.equal(env.ctx.I18N.t('fr', 'Seated Move Along'), 'Bouger assis');
});

/* ---------------------------------------------------------------- My Music Moment is gone */
await test('"musicmoment" is gone: activities, Library map, catalog source and the signed catalog', async () => {
  assert.ok(!env.defined.some((a) => a.key === 'musicmoment'), 'not defined');
  assert.ok(!/musicmoment|My Music Moment|My music moment|Music\.MOODS/.test(code('js/activities.js')), 'js/activities.js');
  assert.ok(!/musicmoment/.test(read('js/store.js')), 'js/store.js BUILTIN');
  const src = JSON.parse(read('labland/catalog-src.json'));
  assert.ok(!src.games.musicmoment && !src.packs.some((p) => p.games.includes('musicmoment')), 'labland/catalog-src.json');
  assert.deepEqual([...src.packs.find((p) => p.id === 'movement').games], ['move']);
  const signed = JSON.parse(read('labland/store/catalog.json'));
  assert.ok(!signed.catalog.includes('musicmoment'), 'the signed catalog (node labland/store-tool.mjs build)');
  const cat = JSON.parse(signed.catalog);
  for (const p of src.packs) assert.deepEqual(cat.packs.find((x) => x.id === p.id).games, p.games, 'signed catalog = source: ' + p.id);
  const tool = await import('file:///' + path.join(ROOT, 'labland/store-tool.mjs').replace(/\\/g, '/'));
  if (tool.hasKey()) assert.ok(tool.verifyText(signed.catalog, signed.signature), 'signature valid');
});
await test('both pages load js/move.js right after js/activities.js', () => {
  for (const f of ['patient.html', 'staff.html']) assert.match(read(f), /<script src="js\/activities\.js\?v=[^"]+"><\/script>\r?\n<script src="js\/move\.js\?v=[^"]+"><\/script>/, f);
});
await test('files of other owners' + (STRICT ? '' : ' (note only, --strict to fail)'), () => {
  const left = [];
  for (const f of ['js/staff.js', 'js/staff-tools.js', 'js/i18n-activities.js', 'js/i18n-staff.js', 'js/music.js', 'css/lab.css', 'CHECKLIST-TEST-1.15.md', 'CHECKLIST-TEST-1.15.txt']) {
    const t = read(f).split(/\r?\n/);
    t.forEach((l, i) => { if (/musicmoment|My Music Moment|My music moment|Mon moment musical|Mein Musikmoment/.test(l)) left.push(f + ':' + (i + 1)); });
  }
  if (left.length) {
    if (STRICT) assert.deepEqual(left, []);
    console.log('     NOTE still naming My Music Moment (for their owners): ' + left.join(', '));
  }
});

/* ---------------------------------------------------------------- --online: oEmbed */
if (ONLINE) {
  await test('online: every video is public, embeddable and on the listed channel (YouTube oEmbed)', async () => {
    const bad = [];
    for (const v of M.VIDEOS) {
      let r = null;
      for (let i = 0; i < 3 && !r; i++) { try { r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.id), { signal: AbortSignal.timeout(15000) }); } catch (e) { await new Promise((s) => setTimeout(s, 1500)); } }
      if (!r) { bad.push(v.id + ' not reached'); continue; }
      if (r.status !== 200) { bad.push(v.id + ' HTTP ' + r.status); continue; }
      const j = await r.json();
      if (j.author_name !== v.channel) bad.push(v.id + ' channel "' + j.author_name + '"');
      await new Promise((s) => setTimeout(s, 300));
    }
    assert.deepEqual(bad, []);
  });
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
