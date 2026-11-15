/* Memories (album + memory postcards, 1.16) and the album storage: logic tests without a browser.
   Run: node tests/album-reading.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function memoryStorage(limit) {
  const m = {};
  return {
    m,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => {
      v = String(v);
      if (limit && Object.keys(m).reduce((n, x) => n + (x === k ? 0 : m[x].length), 0) + v.length > limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m[k] = v;
    },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] === undefined ? null : Object.keys(m)[i],
    get length() { return Object.keys(m).length; }
  };
}
/* The browser files, run as the page runs them (no Lab: only the logic). extra: more globals
   (indexedDB, BellatrixDemo). */
function load(files, storage, extra) {
  const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, localStorage: storage || memoryStorage(), ...(extra || {}) };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
/* A small in-memory IndexedDB, enough for js/album-data.js: open (with upgrade), transactions that
   complete or abort as a whole, put / delete / get / count / openCursor. Several pages can share one
   (same robot app). opts: { openFails, failPut, abortWrites } can be changed while it runs. */
function fakeIndexedDB(opts = {}) {
  const dbs = {};
  const tick = (f) => setTimeout(f, 0);
  function database(name) {
    const rec = dbs[name];
    return {
      objectStoreNames: { contains: (s) => !!rec.stores[s] },
      createObjectStore: (s) => { rec.stores[s] = new Map(); },
      close() {},
      transaction(store, mode) {
        const map = rec.stores[store], ops = [], tx = { aborted: false };
        tx.abort = () => { tx.aborted = true; };
        tx.objectStore = () => ({
          put(v, k) { if (opts.failPut) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } ops.push(() => map.set(k, v)); },
          delete(k) { ops.push(() => map.delete(k)); },
          get(k) { const rq = {}; ops.push(() => { rq.result = map.get(k); if (rq.onsuccess) rq.onsuccess(); }); return rq; },
          count() { const rq = {}; ops.push(() => { rq.result = map.size; if (rq.onsuccess) rq.onsuccess(); }); return rq; },
          openCursor() {
            const rq = {};
            ops.push(() => {
              const keys = [...map.keys()]; let i = 0;
              const step = () => { if (i < keys.length) { const k = keys[i++]; rq.result = { key: k, value: map.get(k), continue: step }; } else rq.result = null; if (rq.onsuccess) rq.onsuccess(); };
              step();
            });
            return rq;
          }
        });
        tick(() => {
          if (tx.aborted || (opts.abortWrites && mode === 'readwrite')) { if (tx.onabort) tx.onabort({}); return; }
          ops.forEach((f) => f());
          if (tx.oncomplete) tx.oncomplete({});
        });
        return tx;
      }
    };
  }
  return {
    dbs, opts,
    open(name) {
      const rq = {};
      tick(() => {
        if (opts.openFails) { if (rq.onerror) rq.onerror({ preventDefault() {} }); return; }
        const fresh = !dbs[name];
        if (fresh) dbs[name] = { stores: {} };
        rq.result = database(name);
        if (fresh && rq.onupgradeneeded) rq.onupgradeneeded({});
        if (rq.onsuccess) rq.onsuccess({});
      });
      return rq;
    },
    keys: (name = 'bellatrix-album', store = 'img') => (dbs[name] && dbs[name].stores[store] ? [...dbs[name].stores[store].keys()] : []),
    value: (id, name = 'bellatrix-album', store = 'img') => dbs[name].stores[store].get(id)
  };
}
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const PNG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==';

/* ---------- Album store ---------- */
test('album: add accepts a family photo (data URL or server URL), list and theme names', () => {
  const { Album } = load(['js/album-data.js']);
  const a = Album.add('P1', { theme: 'Famille', src: PNG, caption: 'Mariage de Paul, 1978', question: 'Qui est à côté de Paul ?', addedBy: 'family' });
  assert.ok(a && a.id);
  assert.equal(a.theme, 'family');
  assert.equal(a.family, true);
  assert.equal(a.src, PNG);
  const b = Album.add('P1', { theme: 'Ma ville', src: 'https://portal.example.test/photos/42.jpg', caption: 'La place du marché', addedBy: 'family' });
  assert.equal(b.theme, 'town');
  assert.equal(b.src, 'https://portal.example.test/photos/42.jpg');
  assert.equal(Album.add('P1', { theme: 'Reisen', src: PNG }).theme, 'travel');
  assert.equal(Album.add('P1', { theme: 'fêtes', src: PNG }).theme, 'celebrations');
  assert.equal(Album.add('P1', { src: 'javascript:alert(1)' }), null);
  assert.equal(Album.lastError, 'src');
  assert.equal(Album.add('P1', { src: '' }), null);
  assert.equal(Album.list('P1').length, 4);
  assert.equal(Album.list('P2').length, 0);
  assert.equal(Album.list('P1', { theme: 'family' }).length, 1);
  assert.ok(Album.add('P1', { caption: 'x'.repeat(200), src: PNG }).caption.length <= 90);
});

test('album: hidden photos and hidden themes are left out for the resident, kept for the team', () => {
  const { Album } = load(['js/album-data.js']);
  const a = Album.add('P1', { theme: 'family', src: PNG, caption: 'Le mari', addedBy: 'family' });
  Album.add('P1', { theme: 'animals', src: PNG, caption: 'Rex' });
  Album.add('P1', { theme: 'travel', src: PNG, caption: 'Venise' });
  Album.update('P1', a.id, { hidden: true });
  assert.deepEqual(Album.list('P1').map((r) => r.caption).sort(), ['Rex', 'Venise']);
  Album.hideTheme('P1', 'Tiere', true);
  assert.deepEqual(Album.hiddenThemes('P1'), ['animals']);
  assert.deepEqual(Album.list('P1').map((r) => r.caption), ['Venise']);
  assert.equal(Album.list('P1', { all: true }).length, 3);
  assert.equal(Album.cardsFor('P1', 'animals', 'auto', 'fr').length, 0 + Album.generic('animals').length, 'the generic cards of a theme without visible photos');
  Album.hideTheme('P1', 'animals', false);
  assert.equal(Album.list('P1').length, 2);
  Album.setNotes('P1', 'Ne pas montrer les photos de son mari en ce moment.');
  assert.match(Album.notes('P1'), /mari/);
  assert.equal(Album.remove('P1', a.id), true);
  assert.equal(Album.list('P1', { all: true }).length, 2);
});

test('album: likes count once per session, can be taken back, and feed the dashboard', () => {
  const st = memoryStorage();
  const { Album } = load(['js/album-data.js'], st);
  const a = Album.add('P1', { theme: 'family', src: PNG, caption: 'Noël 1975', addedBy: 'family' });
  const s1 = Album.sessionStart('P1', ['family', 'travel', 'town']);
  Album.sessionTouch('P1', s1, { chose: 'family', view: true });
  assert.equal(Album.like('P1', a.id, true, s1), true);
  assert.equal(Album.like('P1', a.id, true, s1), true);
  assert.equal(Album.likes('P1')[a.id], 1, 'twice in one session counts once');
  assert.equal(Album.like('P1', 'g-town-tram', undefined, s1), true);
  assert.equal(Album.like('P1', 'g-town-tram', undefined, s1), false, 'pressing again takes the heart back');
  assert.equal(Album.likes('P1')['g-town-tram'], undefined);
  const s2 = Album.sessionStart('P1', ['family', 'travel', 'childhood']);
  Album.sessionTouch('P1', s2, { chose: 'family', view: true });
  Album.like('P1', a.id, true, s2);
  Album.like('P1', 'g-travel-train', true, s2);
  assert.equal(Album.likes('P1')[a.id], 2);
  const stats = Album.stats('P1', 'fr');
  assert.equal(stats.topLiked[0].id, a.id);
  assert.equal(stats.topLiked[0].family, true, 'family photos count like the others');
  assert.equal(stats.topLiked[1].caption, 'Le train à vapeur');
  assert.equal(stats.family, 1);
  assert.equal(stats.sessions, 2);
  const travel = stats.themes.find((t) => t.id === 'travel');
  assert.equal(travel.offered, 2); assert.equal(travel.chosen, 0); assert.equal(travel.avoided, true, 'offered twice, never chosen');
  assert.equal(stats.themes.find((t) => t.id === 'family').avoided, false);
  Album.hideTheme('P1', 'town', true);
  assert.equal(Album.stats('P1').themes.find((t) => t.id === 'town').avoided, true, 'hidden by the team counts as avoided');
  /* session length from the first to the last screen */
  const meta = JSON.parse(st.getItem('bellatrix-album-v1'));
  meta.patients.P1.sessions[0].at = '2026-11-09T10:00:00.000Z'; meta.patients.P1.sessions[0].end = '2026-11-09T10:12:30.000Z';
  st.setItem('bellatrix-album-v1', JSON.stringify(meta));
  assert.equal(Album.stats('P1').sessions, 2);
  assert.ok(Album.stats('P1').avgS >= 375);
});

test('album: pictures live in their own keys; a full storage refuses cleanly', () => {
  const st = memoryStorage(4000);
  const { Album } = load(['js/album-data.js'], st);
  const a = Album.add('P1', { theme: 'family', src: PNG });
  assert.ok(st.getItem('bellatrix-album-img-' + a.id));
  assert.ok(!st.getItem('bellatrix-album-v1').includes('base64'), 'the metadata never holds the pictures');
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  assert.equal(Album.add('P1', { theme: 'family', src: big }), null);
  assert.equal(Album.lastError, 'full');
  Album.remove('P1', a.id);
  assert.equal(st.getItem('bellatrix-album-img-' + a.id), null);
});

test('album: Plan B generic cards, cardsFor modes and the photo of the day', () => {
  const { Album } = load(['js/album-data.js']);
  assert.equal(Album.GENERIC.length, 24, '21 cards + the 3 memory postcards (1.16)');
  for (const t of Album.THEMES) assert.equal(Album.generic(t.id).length, 3, t.id);
  for (const g of Album.GENERIC) {
    const svg = g.art();
    assert.match(svg, /^<svg class="albart" viewBox="0 0 800 600"/);
    assert.ok(!/<image|href=|https?:/i.test(svg.replace('http://www.w3.org/2000/svg', '')), g.id + ' draws everything itself');
    for (const l of ['en', 'fr', 'de']) { assert.ok(g.caption[l] && g.question[l], g.id + ' ' + l); assert.ok(g.caption[l].length <= 40); }
  }
  assert.equal(Album.cardsFor('P1', 'work', 'auto', 'de')[0].caption, 'Die Bäckerei');
  Album.add('P1', { theme: 'work', src: PNG, caption: 'Mon atelier' });
  assert.equal(Album.cardsFor('P1', 'work', 'auto', 'fr').length, 1);
  assert.equal(Album.cardsFor('P1', 'work', 'generic', 'fr').length, 3);
  assert.equal(Album.cardsFor('P1', 'travel', 'own', 'fr').length, 0);
  assert.equal(Album.photoOfDay(new Date(2026, 10, 9), 'fr'), null, 'off by default');
  Album.photoDay({ on: true, patient: 'P1' });
  const p = Album.photoOfDay(new Date(2026, 10, 9), 'fr');
  assert.equal(p.caption, 'Mon atelier');
  Album.photoDay({ on: true, patient: 'P1', generic: true });
  const g = Album.photoOfDay(new Date(2026, 10, 9), 'fr');
  assert.equal(g.own, false); assert.ok(g.art.startsWith('<svg'));
  Album.photoDay({ on: true, patient: 'P9' });
  assert.equal(Album.photoOfDay(new Date(2026, 10, 9), 'en').own, false, 'no photo: a generic card');
});

/* ---------- 1.16: Memories (the album and the memory postcards together) ---------- */
const POSTCARDS_115 = {
  /* What js/activities.js showed until 1.15 (kept here to prove nothing of it is lost). */
  sea: { title: { en: 'The sea', fr: 'La mer', de: 'Das Meer' }, q: { fr: 'Avez-vous déjà passé du temps au bord de la mer ?' }, storyStart: { fr: 'Imaginez une belle journée chaude au bord de la mer.', de: 'Stellen Sie sich einen warmen Tag am Meer vor.' } },
  mountain: { title: { en: 'The mountain', fr: 'La montagne', de: 'Die Berge' }, q: { de: 'Waren Sie schon einmal in den Bergen?' }, storyStart: { en: 'Picture a clear morning in the mountains.' } },
  forest: { title: { en: 'The forest', fr: 'La forêt', de: 'Der Wald' }, q: { en: 'Do you like walking in the forest?' }, storyStart: { fr: 'Imaginez un chemin doux à travers la forêt.' } }
};
test('memories: every picture has a told story in three languages; the postcards are the "Nature" cards', () => {
  const { Album } = load(['js/album-data.js']);
  for (const g of Album.GENERIC) for (const l of ['en', 'fr', 'de']) {
    assert.ok(g.story && g.story[l] && g.story[l].length > 60 && g.story[l].length <= 400, g.id + ' story ' + l);
    assert.ok(!/(?:^|[^a-zà-ÿ])(mort|death|tod|malad|ill|krank|guerre|war|krieg)(?![a-zà-ÿ])/i.test(g.story[l]), g.id + ' gentle ' + l);
  }
  assert.ok(Album.themeOf('nature'));
  assert.equal(Album.themeId('Paysages'), 'nature');
  for (const [id, pc] of Object.entries(POSTCARDS_115)) {
    const g = Album.GENERIC.find((x) => x.id === 'g-postcard-' + id);
    assert.ok(g && g.theme === 'nature', id);
    for (const l of Object.keys(pc.title)) assert.equal(g.caption[l], pc.title[l]);
    for (const l of Object.keys(pc.q)) assert.equal(g.question[l], pc.q[l]);
    for (const l of Object.keys(pc.storyStart)) assert.ok(g.story[l].startsWith(pc.storyStart[l]), id + ' story ' + l);
  }
  const de = Album.cardsFor('P1', 'nature', 'auto', 'de');
  assert.deepEqual([...de.map((c) => c.caption)], ['Das Meer', 'Die Berge', 'Der Wald']);
  assert.ok(de[0].story.startsWith('Stellen Sie sich einen warmen Tag am Meer vor.'));
});

test('memories: a photo keeps its own story; the team’s words on a generic card replace the defaults', () => {
  const { Album } = load(['js/album-data.js']);
  const a = Album.add('P1', { theme: 'family', src: PNG, caption: 'Mariage de Paul, 1978', story: 'Paul et Marie se sont mariés au printemps, dans le jardin de la grand-mère.', question: 'Qui est à côté de Paul ?', addedBy: 'family' });
  assert.equal(a.story, 'Paul et Marie se sont mariés au printemps, dans le jardin de la grand-mère.');
  assert.equal(Album.list('P1')[0].story, a.story);
  assert.equal(Album.update('P1', a.id, { story: '' }).story, undefined, 'an empty story is dropped');
  assert.equal(Album.update('P1', a.id, { story: 'x'.repeat(900) }).story.length, 700);
  Album.setCardText('P1', 'g-postcard-sea', { caption: 'Notre maison à Biarritz', story: 'La maison bleue près de la plage.', question: '' });
  const sea = Album.cardsFor('P1', 'nature', 'auto', 'fr')[0];
  assert.equal(sea.caption, 'Notre maison à Biarritz');
  assert.equal(sea.story, 'La maison bleue près de la plage.');
  assert.equal(sea.question, 'Avez-vous déjà passé du temps au bord de la mer ?', 'no own question: the default stays');
  assert.equal(Album.cardsFor('P2', 'nature', 'auto', 'fr')[0].caption, 'La mer', 'only for that resident');
  Album.setCardText('P1', 'g-postcard-sea', {});
  assert.equal(Album.cardText('P1', 'g-postcard-sea'), null);
});

test('memories: the "postcards" key becomes "album" in the Care Team favourites, last activity and a waiting session', () => {
  const st = memoryStorage();
  st.setItem('bellatrix-care-lab-v1', JSON.stringify({ settings: { activity: 'postcards', participant: 'P1' }, sessions: [{ activity: 'postcards', activityName: 'Memory Postcards' }],
    patients: { P1: { prefs: { favs: ['hello', 'postcards'] }, content: {} }, P2: { prefs: { favs: ['postcards', 'album'] } }, P3: { prefs: {} } } }));
  st.setItem('bellatrix-care-lab-run', JSON.stringify({ id: 'R1', key: 'postcards', patient: 'P1', at: 1 }));
  load(['js/album-data.js'], st);
  const s = JSON.parse(st.getItem('bellatrix-care-lab-v1'));
  assert.equal(s.settings.activity, 'album');
  assert.deepEqual(s.patients.P1.prefs.favs, ['hello', 'album']);
  assert.deepEqual(s.patients.P2.prefs.favs, ['album'], 'no double');
  assert.equal(s.sessions[0].activity, 'postcards', 'the history stays as it was');
  assert.equal(JSON.parse(st.getItem('bellatrix-care-lab-run')).key, 'album');
  /* the demo frame never writes */
  const st2 = memoryStorage();
  st2.setItem('bellatrix-care-lab-v1', JSON.stringify({ settings: { activity: 'postcards' }, patients: {} }));
  load(['js/album-data.js'], st2, { BellatrixDemo: true });
  assert.equal(JSON.parse(st2.getItem('bellatrix-care-lab-v1')).settings.activity, 'postcards');
});

test('memories: each resident’s postcards (pictures, titles, captions, stories, questions) move into the album once', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  st.setItem('bellatrix-care-lab-v1', JSON.stringify({ settings: {}, patients: {
    /* P1: an own picture on postcard 1 with a caption; postcard 2 untouched; postcard 3 only a new story */
    P1: { prefs: { lang: 'fr' }, content: { postcards: { title1: 'Le lac', caption1: 'Ton petit-fils Léo, au lac', question1: 'Te souviens-tu de ce jour ?', story3: 'Une balade en forêt avec Papa, un dimanche.' } } },
    /* P2: an own picture on postcard 2, no text changed (German) */
    P2: { prefs: { lang: 'de' }, content: { postcards: { title2: 'Die Berge' } } },
    /* P3: nothing */
    P3: { prefs: { lang: 'en' }, content: {} } } }));
  const { Album } = load(['js/album-data.js'], st, { indexedDB: idb });
  await Album.ready;
  const pictures = { 'P1/pic1': PNG + 'lake', 'P2/pic2': PNG + 'alps' };
  const asked = [];
  const r = await Album.migratePostcards({ picture: (c, slot) => { asked.push(c + '/' + slot); return pictures[c + '/' + slot] || ''; } });
  assert.deepEqual({ ...r }, { residents: 3, photos: 2, words: 1 });
  const p1 = Album.list('P1');
  assert.equal(p1.length, 1);
  assert.deepEqual([p1[0].theme, p1[0].caption, p1[0].question, p1[0].src, p1[0].from], ['family', 'Ton petit-fils Léo, au lac', 'Te souviens-tu de ce jour ?', PNG + 'lake', 'postcards']);
  assert.equal(p1[0].story, undefined, 'a family photo does not get the sea story');
  const forest = Album.cardsFor('P1', 'nature', 'generic', 'fr')[2];
  assert.equal(forest.story, 'Une balade en forêt avec Papa, un dimanche.');
  assert.equal(forest.caption, 'La forêt');
  const p2 = Album.list('P2');
  assert.deepEqual([p2[0].theme, p2[0].caption, p2[0].question], ['nature', 'Die Berge', 'Waren Sie schon einmal in den Bergen?']);
  assert.ok(p2[0].story.startsWith('Stellen Sie sich einen klaren Morgen in den Bergen vor.'), 'a landscape photo keeps its postcard story');
  assert.equal(Album.list('P3').length, 0);
  await wait();
  assert.equal(idb.keys().length, 2, 'the pictures are in IndexedDB');
  /* once only: a second start does nothing */
  const again = await Album.migratePostcards({ picture: () => PNG + 'again' });
  assert.deepEqual({ ...again }, { residents: 0, photos: 0, words: 0 });
  assert.equal(Album.list('P1').length, 1);
  /* the old content is kept as it was */
  assert.equal(JSON.parse(st.getItem('bellatrix-care-lab-v1')).patients.P1.content.postcards.title1, 'Le lac');
  /* pure plan: untouched postcards leave nothing */
  assert.ok(Album.postcardsPlan({}, 'en').every((x) => x.words === null));
});

test('memories: today’s content from js/daily.js becomes album cards (any reasonable shape)', () => {
  const { Album } = load(['js/album-data.js']);
  const cards = Album.fromDaily({ items: [
    { id: 'm1', theme: 'Fêtes', title: { fr: 'Le carnaval', en: 'Carnival' }, story: { fr: 'Imaginez les confettis…', en: 'Imagine the confetti…' }, question: { fr: 'Aimiez-vous vous déguiser ?' } },
    { id: 'm2', title: 'Un jardin en été', text: 'Les tomates rougissent au soleil.' },
    { id: 'm3', theme: 'animals', caption: 'Le cheval de trait', art: '<svg viewBox="0 0 10 10"></svg>' },
    { id: 'bad' }, null
  ] }, 'fr', ['family', 'town']);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((c) => c.theme), ['celebrations', 'town', 'animals']);
  assert.equal(cards[0].caption, 'Le carnaval'); assert.equal(cards[0].question, 'Aimiez-vous vous déguiser ?');
  assert.equal(cards[1].story, 'Les tomates rougissent au soleil.');
  assert.ok(cards[1].art.startsWith('<svg'), 'no picture: the drawing of a generic card');
  assert.equal(cards[2].art, '<svg viewBox="0 0 10 10"></svg>');
  assert.ok(cards.every((c) => c.daily && c.id.startsWith('d-')));
  assert.deepEqual([...Album.fromDaily(null, 'fr')], []);
  assert.equal(Album.fromDaily([{ id: 'x', title: 'Image', src: 'javascript:alert(1)' }], 'en')[0].src, '');
});

/* A small engine stand-in, to run the activity's steps without a browser. */
function runActivity(extra) {
  const ctx = load(['js/i18n.js', 'js/i18n-core.js', 'js/i18n-activities.js', 'js/i18n-play.js', 'js/i18n-messages.js', 'js/i18n-album-reading.js', 'js/album-data.js'], undefined, { document: { addEventListener() {}, getElementById() { return null; } }, ...(extra || {}) });
  const defined = [];
  ctx.Lab = { esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), define: (a) => defined.push(a),
    patient: 'P1', opt: { life: {} }, isOn: () => false, _t: { state: { rec: { preview: false } } }, content: {} };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/album.js'), 'utf8'), ctx, { filename: 'js/album.js' });
  const act = defined[0], said = [], steps = [], stats = {};
  const L = {
    lang: () => 'fr', t: (s, v) => ctx.I18N.t('fr', s, v),
    text: (id) => { const f = act.content.find((x) => x.id === id); return f ? String(f.value) : ''; },
    go: (st) => { if (st) steps.push(st); }, say: (t) => said.push(t), push: (k, v) => { (stats[k] = stats[k] || []).push(v); }, stat: (k, v) => { stats[k] = v; },
    log: () => {}, refresh: () => {}, finish: () => steps.push({ id: 'finished' })
  };
  return { ctx, act, L, said, steps, stats };
}
test('memories: one activity "album" (named Memories); the postcards activity is gone', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/activities.js'), 'utf8');
  assert.ok(!/key:\s*'postcards'/.test(src), 'no postcards activity any more');
  const { act } = runActivity();
  assert.equal(act.key, 'album'); assert.equal(act.name, 'Memories');
  assert.deepEqual([...act.content.map((f) => f.id)], ['source', 'themes', 'first', 'minutes']);
  assert.ok(act.content.find((f) => f.id === 'themes').options.some((o) => o[0] === 'nature'));
  const { ctx } = runActivity();
  for (const k of [act.name, act.flow, act.againQuestion, 'Nature', 'Open directly: Nature', 'Hear again']) {
    assert.ok(ctx.I18N.dict.fr[k] && ctx.I18N.dict.de[k], 'FR and DE for: ' + k);
  }
  assert.equal(ctx.I18N.t('fr', act.name), 'Souvenirs'); assert.equal(ctx.I18N.t('de', act.name), 'Erinnerungen');
});

test('memories: a session tells the picture’s story, keeps Previous / Next / I like it, and "Hear again" retells it', () => {
  const { act, L, said, steps, ctx } = runActivity();
  ctx.Album.add('P1', { theme: 'family', src: PNG, caption: 'Noël 1985', story: 'Toute la famille autour du sapin.', question: 'Qui avait fait le gâteau ?', addedBy: 'family' });
  const first = act.start(L);
  assert.equal(first.id, 'album-themes', 'the demo still finds its step ids');
  assert.equal(first.choices.length, 3);
  assert.equal(first.choices[0].label, 'Famille', 'own photos come first');
  first.choices[0].run();
  const photo = steps[steps.length - 1];
  assert.equal(photo.id, 'album-photo');
  assert.equal(photo.say, 'Noël 1985 Toute la famille autour du sapin. Qui avait fait le gâteau ?');
  assert.deepEqual([...photo.actions.map((a) => a.label)], ['Précédente', 'Suivante', 'J’aime'], 'three main buttons, as in 1.15');
  assert.ok(photo.body.includes('data-albagain'), '"Hear again" is there when there is a story');
  /* the button retells the same words */
  const btn = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
  photo.after({ querySelector: (q) => (q === '[data-albagain]' ? btn : null) });
  btn.listeners.click();
  assert.equal(said[said.length - 1], photo.say);
  /* no story, no button */
  photo.actions[1].run();
  const nextScreen = steps[steps.length - 1];
  assert.ok(nextScreen.id === 'album-more' || nextScreen.id === 'album-thanks');
});

test('memories: without personal photos, today’s Daily content comes first, then the generic cards', () => {
  const batch = [{ id: 'd1', theme: 'nature', title: 'Les vendanges', story: 'Imaginez les grappes dorées.', question: 'Avez-vous cueilli du raisin ?' }];
  const calls = [];
  const { act, L, steps } = runActivity({ Daily: { get: (kind, o) => { calls.push([kind, o.lang, o.code]); return batch; } } });
  const first = act.start(L);
  assert.deepEqual(calls[0], ['memories', 'fr', 'P1']);
  const k = first.choices.findIndex((c) => c.value === 'nature');
  assert.ok(k >= 0, 'the theme with today’s content is offered');
  first.choices[k].run();
  const photo = steps[steps.length - 1];
  assert.equal(photo.say, 'Les vendanges Imaginez les grappes dorées. Avez-vous cueilli du raisin ?');
  assert.ok(photo.body.includes('1 / 4'), 'then the three Nature cards');
  /* Daily missing or still loading: the generic cards as before */
  const r2 = runActivity({ Daily: { get: () => new Promise(() => {}) } });
  const f2 = r2.act.start(r2.L);
  assert.equal(f2.id, 'album-themes');
});

/* ---------- Album pictures in IndexedDB ---------- */
function oldAlbum(st) {
  /* An album written by the localStorage version: metadata plus one key per picture. */
  const meta = { patients: { P1: { photos: [], hiddenThemes: [], likes: {}, sessions: [], notes: '' } }, photoDay: { on: true, patient: 'P1', generic: false } };
  for (const [id, by] of [['oldA', 'family'], ['oldB', 'staff']]) {
    st.setItem('bellatrix-album-img-' + id, PNG + id);
    meta.patients.P1.photos.push({ id, theme: 'family', caption: 'Photo ' + id, question: '', addedBy: by, addedAt: '2026-11-01T10:00:00.000Z', hidden: false, img: 1 });
  }
  st.setItem('bellatrix-album-v1', JSON.stringify(meta));
}
const imgKeys = (st) => Object.keys(st.m).filter((k) => k.startsWith('bellatrix-album-img-'));

test('album storage: old localStorage pictures move into IndexedDB once, then leave localStorage', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  oldAlbum(st);
  const { Album } = load(['js/album-data.js'], st, { indexedDB: idb });
  assert.equal(Album.storage(), 'pending');
  assert.deepEqual(Album.list('P1').map((r) => r.src), [PNG + 'oldA', PNG + 'oldB'], 'still readable while IndexedDB opens');
  assert.equal(await Album.ready, 'idb');
  assert.equal(Album.storage(), 'idb');
  assert.deepEqual(imgKeys(st), [], 'localStorage keys removed');
  assert.deepEqual(idb.keys().sort(), ['oldA', 'oldB']);
  assert.equal(idb.value('oldA'), PNG + 'oldA');
  assert.deepEqual(Album.list('P1').map((r) => r.src), [PNG + 'oldA', PNG + 'oldB'], 'list() is still synchronous, with src');
  assert.equal(Album.imgSync('oldB'), PNG + 'oldB');
  assert.equal(await Album.img('oldA'), PNG + 'oldA');
  assert.equal(Album.photoOfDay(new Date(2026, 10, 9), 'fr').src.startsWith(PNG), true);
  /* the next start finds them in IndexedDB, nothing to migrate */
  const again = load(['js/album-data.js'], st, { indexedDB: idb });
  await again.Album.ready;
  assert.equal(again.Album.list('P1').length, 2);
  assert.equal(again.Album.list('P1')[0].src, PNG + 'oldA');
});

test('album storage: add stays synchronous (staff and family), bytes go to IndexedDB only', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  const { Album } = load(['js/album-data.js'], st, { indexedDB: idb });
  const early = Album.add('P1', { theme: 'famille', src: PNG + 'early', caption: 'Avant l’ouverture', addedBy: 'family' });
  assert.ok(early && early.src === PNG + 'early' && early.family, 'added while IndexedDB still opens');
  await Album.ready;
  const fam = Album.add('P1', { theme: 'voyages', src: PNG + 'fam', caption: 'Biarritz', addedBy: 'family' });
  assert.ok(fam && fam.src === PNG + 'fam');
  assert.equal(Album.list('P1').length, 2);
  assert.deepEqual(imgKeys(st), [], 'nothing in localStorage');
  assert.ok(!st.getItem('bellatrix-album-v1').includes('base64'));
  const kept = await Album.addAsync('P1', { theme: 'work', src: PNG + 'async', caption: 'Atelier' });
  assert.ok(kept && kept.id);
  await wait();
  assert.deepEqual(idb.keys().sort(), [early.id, fam.id, kept.id].sort());
  /* likes, hidden and notes keep working on the same pictures */
  const sid = Album.sessionStart('P1', ['family']);
  assert.equal(Album.like('P1', early.id, true, sid), true);
  Album.update('P1', fam.id, { hidden: true });
  assert.equal(Album.list('P1').length, 2);
  assert.equal(Album.list('P1', { all: true }).length, 3);
  assert.equal(Album.stats('P1').topLiked[0].family, true);
});

test('album storage: a picture added on another page of the app is found (Care Team → patient screen)', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  const patient = load(['js/album-data.js'], st, { indexedDB: idb });
  const team = load(['js/album-data.js'], st, { indexedDB: idb });
  await patient.Album.ready; await team.Album.ready;
  const r = team.Album.add('P1', { theme: 'family', src: PNG + 'team', caption: 'Noël', addedBy: 'family' });
  await wait();
  assert.equal(patient.Album.list('P1').length, 1, 'the metadata is shared at once');
  assert.equal(await patient.Album.sync(), 1, 'the missing picture is read from IndexedDB');
  assert.equal(patient.Album.list('P1')[0].src, PNG + 'team');
  assert.equal(patient.Album.cardsFor('P1', 'family', 'auto', 'fr')[0].id, r.id);
  assert.equal(await patient.Album.img(r.id), PNG + 'team');
});

test('album storage: remove and erase on request also delete from IndexedDB', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  const { Album } = load(['js/album-data.js'], st, { indexedDB: idb });
  await Album.ready;
  const a = Album.add('P1', { theme: 'family', src: PNG + 'a', addedBy: 'family' });
  const b = Album.add('P1', { theme: 'family', src: PNG + 'b', addedBy: 'staff' });
  const c = Album.add('P1', { theme: 'travel', src: PNG + 'c', addedBy: 'family' });
  const d = Album.add('P2', { theme: 'family', src: PNG + 'd' });
  Album.like('P1', a.id, true);
  Album.photoDay({ on: true, patient: 'P1' });
  await wait();
  assert.equal(idb.keys().length, 4);
  assert.equal(Album.remove('P1', b.id), true);
  await wait();
  assert.ok(!idb.keys().includes(b.id), 'remove');
  assert.equal(Album.imgSync(b.id), '');
  assert.equal(Album.erase('P1', { family: true }), 2, 'only the family photos');
  await wait();
  assert.deepEqual(idb.keys(), [d.id]);
  assert.equal(Album.likes('P1')[a.id], undefined);
  Album.add('P1', { theme: 'family', src: PNG + 'e' });
  assert.equal(Album.erase('P1'), 1);
  await wait();
  assert.deepEqual(idb.keys(), [d.id], 'P2 is untouched');
  assert.deepEqual([...Album.patients()], ['P2']);
  assert.equal(Album.photoDay().on, false, 'the photo of the day of an erased resident is turned off');
  assert.equal(Album.erase('P9'), 0);
  void c;
});

test('album storage: falls back to localStorage without IndexedDB, or when it refuses', async () => {
  /* no IndexedDB at all: localStorage, as before */
  const st1 = memoryStorage();
  const one = load(['js/album-data.js'], st1);
  assert.equal(await one.Album.ready, 'local');
  const a = one.Album.add('P1', { theme: 'family', src: PNG + 'ls' });
  assert.equal(st1.getItem('bellatrix-album-img-' + a.id), PNG + 'ls');
  /* IndexedDB cannot open */
  const st2 = memoryStorage();
  oldAlbum(st2);
  const two = load(['js/album-data.js'], st2, { indexedDB: fakeIndexedDB({ openFails: true }) });
  assert.equal(await two.Album.ready, 'local');
  assert.equal(imgKeys(st2).length, 2, 'old pictures stay where they are');
  assert.equal(two.Album.list('P1')[0].src, PNG + 'oldA');
  /* IndexedDB opens but refuses a write: localStorage keeps that picture */
  const st3 = memoryStorage(), idb3 = fakeIndexedDB();
  const three = load(['js/album-data.js'], st3, { indexedDB: idb3 });
  await three.Album.ready;
  idb3.opts.failPut = true;
  const b = await three.Album.addAsync('P1', { theme: 'family', src: PNG + 'refused' });
  assert.ok(b, 'kept anyway');
  assert.equal(st3.getItem('bellatrix-album-img-' + b.id), PNG + 'refused');
  assert.equal(three.Album.list('P1')[0].src, PNG + 'refused');
  /* …and when localStorage is full too, the picture is taken out again (never listed without image) */
  const st4 = memoryStorage(600), idb4 = fakeIndexedDB({ abortWrites: true });
  const four = load(['js/album-data.js'], st4, { indexedDB: idb4 });
  await four.Album.ready;
  const lost = four.Album.add('P1', { theme: 'family', src: 'data:image/jpeg;base64,' + 'A'.repeat(900) });
  assert.ok(lost, 'add answers at once');
  assert.equal(await four.Album.addAsync('P1', { theme: 'family', src: 'data:image/jpeg;base64,' + 'B'.repeat(900) }), null);
  await wait();
  assert.equal(four.Album.list('P1').length, 0);
  assert.equal(four.Album.lastError, 'full');
  /* a failed migration copy keeps the old keys for the next start */
  const st5 = memoryStorage();
  oldAlbum(st5);
  const five = load(['js/album-data.js'], st5, { indexedDB: fakeIndexedDB({ abortWrites: true }) });
  assert.equal(await five.Album.ready, 'idb');
  assert.equal(imgKeys(st5).length, 2);
  assert.equal(five.Album.list('P1')[1].src, PNG + 'oldB');
});

test('album storage: orphan pictures are tidied carefully; the Care Team demo frame never writes', async () => {
  const st = memoryStorage(), idb = fakeIndexedDB();
  const first = load(['js/album-data.js'], st, { indexedDB: idb });
  await first.Album.ready;
  const keep = first.Album.add('P1', { theme: 'family', src: PNG + 'keep' });
  await wait();
  idb.dbs['bellatrix-album'].stores.img.set('orphan', PNG + 'orphan');
  const second = load(['js/album-data.js'], st, { indexedDB: idb });
  await second.Album.ready; await wait();
  assert.deepEqual(idb.keys(), [keep.id], 'a picture no resident uses any more is removed');
  /* never on a lost index */
  idb.dbs['bellatrix-album'].stores.img.set('orphan2', PNG + 'orphan2');
  st.removeItem('bellatrix-album-v1');
  const third = load(['js/album-data.js'], st, { indexedDB: idb });
  await third.Album.ready; await wait();
  assert.ok(idb.keys().includes(keep.id) && idb.keys().includes('orphan2'));
  /* demo frame (js/staff-tools.js guard): reads work, nothing is migrated or deleted */
  const st6 = memoryStorage(), idb6 = fakeIndexedDB();
  oldAlbum(st6);
  const demo = load(['js/album-data.js'], st6, { indexedDB: idb6, BellatrixDemo: true });
  await demo.Album.ready;
  assert.equal(imgKeys(st6).length, 2);
  assert.equal(demo.Album.list('P1')[0].src, PNG + 'oldA');
  assert.deepEqual(idb6.keys(), []);
});

/* ---------- Reading: tested in tests/reading.test.mjs since 1.16 (agent H). ---------- */

function keysOf(files, staff) {
  const keys = new Set();
  const Q = "'((?:[^'\\\\]|\\\\.)*)'";
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(new RegExp((staff ? '\\bS' : '(?:L\\.t|I18N\\.t\\(lang,\\s*)') + '\\(\\s*' + Q, 'g'))) keys.add(m[1]);
    if (staff) for (const m of s.matchAll(new RegExp('label: ' + Q, 'g'))) keys.add(m[1]);
  }
  return [...keys];
}
function i18nFiles(list) { return list.map((f) => 'js/' + f).filter((f) => fs.existsSync(path.join(ROOT, f))); }
test('i18n: every patient-screen text has French and German with the patient page’s own files', () => {
  /* patient.html does not load the Care Team texts (i18n-staff.js) */
  const ctx = load(i18nFiles(['i18n.js', 'i18n-core.js', 'i18n-activities.js', 'i18n-play.js', 'i18n-karaoke.js', 'i18n-messages.js', 'i18n-album-reading.js', 'i18n-family.js']));
  const missing = keysOf(['js/album.js'], false).filter((k) => ctx.I18N.dict.fr[k] === undefined || ctx.I18N.dict.de[k] === undefined);
  assert.deepEqual(missing, []);
});
test('i18n: every Care Team text (tab and Personalise fields) has French and German', () => {
  const ctx = load(i18nFiles(['i18n.js', 'i18n-core.js', 'i18n-activities.js', 'i18n-staff.js', 'i18n-play.js', 'i18n-karaoke.js', 'i18n-messages.js', 'i18n-album-reading.js', 'i18n-family.js']));
  const missing = keysOf(['js/album.js'], true).concat(keysOf(['js/album.js'], false))
    .filter((k) => !/\{m\} min/.test(k) && (ctx.I18N.dict.fr[k] === undefined || ctx.I18N.dict.de[k] === undefined));
  assert.deepEqual(missing, []);
});
