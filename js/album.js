/* Memories (1.16): the life album and the memory postcards in ONE activity, key 'album'.
   A support for conversation, not a slideshow: the care team sits with the resident and a picture
   opens the door to a memory. An engagement activity: no score, no test, no comment on emotions.
   1. Three big theme cards (the resident chooses, or the care team taps for them).
   2. One picture at a time: the resident's own photo, or (without one) today's content from
      js/daily.js (Daily.get('memories', …)) and the generic cards, among them the three memory
      postcards (theme "Nature"). A big caption ("Mariage de Paul, 1978"); Bellatrix says the
      caption, tells the picture's story when it has one, then asks the opening question.
      "Hear again" (small, under the caption) tells it again. Previous / Next as a pair and
      "I like it" (heart): at most 3 main buttons. Back (to the themes), Help and Stop come from the core.
   3. After about 12 minutes (Personalise) or when the themes offered are seen: "Merci pour ce beau
      moment", then the usual closing of the core.
   The postcards' Personalise content and pictures move into the album once (Album.migratePostcards,
   js/album-data.js); the 'postcards' key is gone. Step ids stay 'album-themes' / 'album-photo'
   (the Care Team demo uses them). Also here: the "Photo du jour" on the robot's waiting screen
   (off unless the care team turns it on). ES5 only (Chrome 95). */
(function () {
  'use strict';
  if (!window.Lab || !window.Album) return;
  var esc = Lab.esc;
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21.2C5.6 16.4 2 13 2 8.8 2 5.6 4.5 3.2 7.5 3.2c1.8 0 3.4.9 4.5 2.3 1.1-1.4 2.7-2.3 4.5-2.3 3 0 5.5 2.4 5.5 5.6 0 4.2-3.6 7.6-10 12.4z" fill="currentColor"/></svg>';
  var SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var THEME_WORDS = {
    family: ['family', 'famille', 'familie'], travel: ['travel', 'travels', 'voyage', 'voyages', 'reisen'], childhood: ['childhood', 'enfance', 'kindheit', 'school'],
    work: ['work', 'job', 'metier', 'beruf'], animals: ['animals', 'animaux', 'tiere'], celebrations: ['celebrations', 'parties', 'fetes', 'feste'], town: ['town', 'city', 'ville', 'stadt'],
    nature: ['nature', 'natur', 'sea', 'mer', 'meer', 'mountain', 'montagne', 'berge', 'forest', 'foret', 'wald']
  };
  var ALL = Album.THEMES.map(function (t) { return t.id; });

  /* The few new texts of 1.16, in French and German (English is the key); never over an existing translation. */
  (function () {
    function addNew(l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); }
    addNew('fr', {
      'Memories': 'Souvenirs', 'Nature': 'Nature', 'Open directly: Nature': 'Ouvrir directement : Nature',
      'Photos and pictures by theme, each with its story, to talk about together.': 'Des photos et des images par thème, chacune avec son histoire, pour en parler ensemble.',
      'Would you like to look at memories again another time?': 'Voulez-vous regarder des souvenirs une autre fois ?'
    });
    addNew('de', {
      'Memories': 'Erinnerungen', 'Nature': 'Natur', 'Open directly: Nature': 'Direkt öffnen: Natur',
      'Photos and pictures by theme, each with its story, to talk about together.': 'Fotos und Bilder nach Themen, jedes mit seiner Geschichte, um gemeinsam darüber zu sprechen.',
      'Would you like to look at memories again another time?': 'Möchten Sie ein anderes Mal wieder Erinnerungen anschauen?'
    });
  })();

  function isPreview() { var s = Lab._t && Lab._t.state; return !!(s && s.rec && s.rec.preview); }
  function pictureHtml(c) { return c.src ? '<img class="albimg" src="' + esc(c.src) + '" alt="">' : (c.art || ''); }

  Lab.define({
    key: 'album', day: 2, name: 'Memories', zone: 'HUBER_ROOM',
    flow: 'Photos and pictures by theme, each with its story, to talk about together.',
    learn: 'Conversation with the care team around a picture; which themes the resident enjoys.',
    againQuestion: 'Would you like to look at memories again another time?',
    art: function () { return Album.GENERIC[1].art(); },
    content: [
      { id: 'source', hide: true, label: 'Pictures to show', type: 'select', value: 'auto', options: [
        ['auto', 'Their photos, and generic cards for themes without photos'], ['own', 'Only their own photos'], ['generic', 'Only the generic cards']] },
      { id: 'themes', hide: true, label: 'Themes that may be offered', type: 'checks', value: ALL.join(','), options: Album.THEMES.map(function (t) { return [t.id, t.label]; }) },
      { id: 'first', hide: true, label: 'Start with', type: 'select', value: 'choose', options: [['choose', 'Three theme cards to choose from']].concat(Album.THEMES.map(function (t) { return [t.id, 'Open directly: ' + t.label]; })) },
      { id: 'minutes', hide: true, label: 'About how long (minutes)', type: 'number', min: 5, max: 20, value: 12 }
    ],
    start: function (L) {
      var lang = L.lang(), code = Lab.patient, preview = isPreview();
      var mode = L.text('source') || 'auto', t0 = Date.now();
      var limit = Math.max(5, Math.min(20, parseInt(L.text('minutes'), 10) || 12)) * 60000;
      var hidden = Album.hiddenThemes(code);
      var wanted = String(L.text('themes') || ALL.join(',')).split(',').filter(function (t) { return ALL.indexOf(t) >= 0 && hidden.indexOf(t) < 0; });
      var deck = {}, seen = {}, offeredNow = [], liked = {}, told = {}, shown = 0;
      /* Today's content (js/daily.js) for the pictures without a personal photo, when it is there. */
      var daily = [];
      if (mode !== 'own' && window.Daily && typeof Daily.get === 'function') {
        var batch = null;
        try { batch = Daily.get('memories', { lang: lang, code: code, life: Lab.opt.life || {} }); } catch (e) { batch = null; }
        if (batch && typeof batch.then !== 'function') daily = Album.fromDaily(batch, lang, wanted);
      }
      function cards(t) {
        if (deck[t]) return deck[t];
        var own = mode === 'generic' ? [] : Album.list(code, { theme: t }).filter(function (r) { return r.src; }).map(function (r) { return Album.localize(r, lang); });
        if (own.length || mode === 'own') return (deck[t] = own);
        var today = daily.filter(function (d) { return d.theme === t; });
        var gen = Album.cardsFor(code, t, 'generic', lang);
        return (deck[t] = today.length ? today.concat(gen).slice(0, Math.max(4, today.length)) : gen);
      }
      var themes = wanted.filter(function (t) { return cards(t).length > 0; });
      /* In a preview nothing is kept: likes and the session stay in this page. */
      var sid = preview ? null : Album.sessionStart(code, []);
      function touch(p) { if (sid) Album.sessionTouch(code, sid, p); }
      function label(t) { var th = Album.themeOf(t); return L.t(th ? th.label : t); }

      /* The three themes: first those with the resident's own photos, then those with today's
         content, then those offered least often lately, so the albums rotate from one session to the next. */
      var past = {};
      Album.sessions(code).slice(-6).forEach(function (s) { s.offered.forEach(function (t) { past[t] = (past[t] || 0) + 1; }); });
      function ownCount(t) { return Album.list(code, { theme: t }).length; }
      function dailyCount(t) { return daily.filter(function (d) { return d.theme === t; }).length; }
      function nextThree() {
        var left = themes.filter(function (t) { return !seen[t]; });
        return left.map(function (t, k) { return { t: t, own: mode === 'generic' ? 0 : ownCount(t), today: dailyCount(t), past: past[t] || 0, k: k }; })
          .sort(function (a, b) { return (b.own > 0) - (a.own > 0) || (b.today > 0) - (a.today > 0) || a.past - b.past || a.k - b.k; })
          .slice(0, 3).map(function (x) { return x.t; });
      }

      function choose() {
        offeredNow = nextThree();
        touch({ offered: offeredNow });
        return {
          id: 'album-themes', title: L.t('Which album shall we open?'), style: 'cards', back: false, cls: 'albthemes', noReprompt: true,
          say: L.t('Which album shall we open?'),
          choices: offeredNow.map(function (t) {
            var c = cards(t)[0];
            return { label: label(t), value: t, art: '<span class="albcover' + (c.src ? ' own' : '') + '">' + pictureHtml(c) + '</span>', words: THEME_WORDS[t] || [], noLabelWords: true,
              run: function () { open(t); } };
          })
        };
      }
      function open(t) {
        seen[t] = 1;
        touch({ chose: t });
        L.push('albumThemes', t);
        L.go(photo(t, 0));
      }
      /* What Bellatrix says with a picture: the caption, its story (the postcards' narration), the question. */
      function tellOf(c) { return [c.caption || '', c.story || '', c.question || ''].filter(function (x) { return String(x).trim(); }).join(' '); }
      function photo(t, i) {
        var list = cards(t), c = list[i], cap = c.caption || '', q = c.question || '', words = tellOf(c), acked = false;
        shown++; L.stat('albumPictures', shown);
        touch({ view: true });
        if (c.daily) L.push('albumDaily', c.dailyId || c.id);
        /* A family photo shown for the first time: the family portal shows it as "Montré". */
        if (c.family && !preview && !told[c.id]) {
          told[c.id] = 1;
          try { if (window.FamilyMessages && FamilyMessages.albumShown) FamilyMessages.albumShown(c.id); } catch (e) { /* the portal is optional */ }
        }
        var st = {
          id: 'album-photo', cls: 'albphoto', pic: pictureHtml(c), picCls: 'albpic kenburns' + (c.src ? ' own' : ''), noReprompt: true,
          body: '<div class="albtext">' + (cap ? '<p class="albcaption">' + esc(cap) + '</p>' : '') + (q ? '<p class="albq">' + esc(q) + '</p>' : '') +
            '<p class="albmeta">' + (c.story ? '<button type="button" class="albagain" data-albagain="1">' + SPEAKER + '<span>' + esc(L.t('Hear again')) + '</span></button>' : '') +
            (list.length > 1 ? '<span class="albcount" aria-hidden="true">' + (i + 1) + ' / ' + list.length + '</span>' : '') + '</p></div>',
          say: words,
          after: function (el) {
            var b = el.querySelector('[data-albagain]');
            if (b) b.addEventListener('click', function () { L.stat('storyRepeats'); L.log('Story told again', 'app'); L.say(words); });
          },
          actions: [
            { label: L.t('Previous photo'), pair: true, disabled: i === 0, words: ['previous', 'before', 'back one'], noLabelWords: true,
              run: function () { L.go(photo(t, i - 1), { replace: true }); } },
            { label: L.t('Next photo'), pair: true, primary: true, words: ['next', 'another', 'more', 'continue'], noLabelWords: true,
              run: function () { if (i + 1 < list.length) L.go(photo(t, i + 1), { replace: true }); else afterTheme(); } },
            { label: L.t('I like it'), icon: HEART, cls: 'albheart' + (liked[c.id] ? ' on' : ''), words: ['i like it', 'like', 'heart', 'lovely', 'beautiful'], noLabelWords: true,
              run: function (src, a) {
                liked[c.id] = !liked[c.id];
                if (sid) Album.like(code, c.id, liked[c.id], sid);
                if (liked[c.id]) L.push('albumLiked', cap || c.id);
                a.cls = 'albheart' + (liked[c.id] ? ' on' : '');
                L.log((liked[c.id] ? 'Heart for ' : 'Heart taken back for ') + (cap || c.id), 'result');
                L.refresh();
              } }
          ],
          /* Listening to a memory (from the postcards): never "I did not catch that", one warm reply per picture. */
          free: function (txt, n) {
            if (n >= 3 && !acked) { acked = true; L.stat('memoriesShared'); L.log('Participant is sharing a memory', 'memory'); L.say(L.t('Thank you for sharing that.')); }
            return true;
          }
        };
        return st;
      }
      function afterTheme() {
        var more = nextThree().length > 0, late = Date.now() - t0 >= limit;
        if (!more || late) { L.go(thanks(), { clear: true }); return; }
        L.go({
          id: 'album-more', title: L.t('Shall we open another album?'), center: true, back: false, noHistory: true, noReprompt: true,
          say: L.t('Shall we open another album?'),
          actions: [
            { label: L.t('Yes, another album'), primary: true, gesture: 'open', words: ['yes', 'another', 'more', 'yeah', 'sure', 'ok', 'okay'], noLabelWords: true, run: function () { L.go(choose(), { clear: true }); } },
            { label: L.t('No, thank you'), gesture: 'fist', words: ['no', 'nope', 'no thanks', 'enough', 'done'], noLabelWords: true, run: function () { L.go(thanks(), { clear: true }); } }
          ]
        }, { clear: true });
      }
      /* The positive end, then the core's own closing (how they feel, again another time). */
      function thanks() {
        L.stat('albumMinutes', Math.round((Date.now() - t0) / 6000) / 10);
        return {
          id: 'album-thanks', title: L.t('Thank you for this lovely moment.'), back: false, noHistory: true, noReprompt: true,
          pic: '<span class="albthanks">' + HEART + '</span>', picCls: 'albthanksbox',
          say: L.t('Thank you for this lovely moment.'),
          actions: [{ label: L.t('Finish'), primary: true, gesture: 'open', words: ['finish', 'thank you', 'thanks', 'ok', 'okay', 'done'], noLabelWords: true, run: function () { L.finish(); } }]
        };
      }
      if (!themes.length) {
        return {
          id: 'album-empty', title: L.t('The album is empty for now.'), center: true, back: false,
          say: L.t('The album is empty for now.'),
          actions: [{ label: L.t('Finish'), primary: true, noLabelWords: true, run: function () { L.finish(); } }]
        };
      }
      var first = L.text('first');
      if (first && first !== 'choose' && themes.indexOf(first) >= 0) {
        touch({ offered: [first] });
        seen[first] = 1; touch({ chose: first }); L.push('albumThemes', first);
        return photo(first, 0);
      }
      return choose();
    }
  });

  /* ---------- Photo du jour on the robot's waiting screen ----------
     patient.js paints the waiting screen (Bellatrix's face). When the care team turned the photo of
     the day on, it is added under the face; nothing changes when it is off. This watches the
     screen instead of changing patient.js (a two-line hook there would be cleaner, see the report). */
  var LASTLANG = 'bellatrix-care-lab-lastlang';
  function waitingLang() { try { return I18N.valid(localStorage.getItem(LASTLANG)); } catch (e) { return 'en'; } }
  /* Nothing automatic while the care team keeps the robot for staff only, nor inside a frame
     (the demo mode of the Care Team app): only on the real patient screen. */
  function staffOnly() { try { return !!(JSON.parse(localStorage.getItem('bellatrix-staff-only') || 'null') || {}).on; } catch (e) { return false; } }
  function framed() { try { return window.self !== window.top; } catch (e) { return true; } }
  function paintDay() {
    var s = document.getElementById('screen');
    if (!s || Lab.isOn() || !s.querySelector('.facebox')) return;
    var lang = waitingLang(), p = null;
    try { p = staffOnly() || framed() ? null : Album.photoOfDay(new Date(), lang); } catch (e) { p = null; }
    var old = s.querySelector('.albday');
    if (old && (!p || old.getAttribute('data-id') !== p.id)) { old.parentNode.removeChild(old); old = null; }
    if (!p || old) return;
    var html = '<figure class="albday" data-id="' + esc(p.id) + '"><span class="albdaypic">' + (p.src ? '<img class="albimg" src="' + esc(p.src) + '" alt="">' : p.art) + '</span>' +
      '<figcaption><b>' + esc(I18N.t(lang, 'Photo of the day')) + '</b>' + (p.caption ? '<span>' + esc(p.caption) + '</span>' : '') + '</figcaption></figure>';
    var col = s.querySelector('.lcol') || s;
    col.insertAdjacentHTML('beforeend', html);
  }
  /* ---------- 1.16: the memory postcards move into the album, once per resident ----------
     On whichever page of the app opens first (Care Team or patient screen), after the album and the
     postcards' pictures (js/media.js) are read. Never in the Care Team's demo frame. */
  function migratePostcards() {
    if (window.BellatrixDemo || framed()) return;
    var M = window.Media;
    Promise.all([Album.ready, M && M.ready ? M.ready : Promise.resolve()]).then(function () {
      /* The postcards' pictures could not be read on this start (no IndexedDB for js/media.js):
         nothing is marked, the next start tries again, so no picture is left behind. */
      if (M && M.persistent && !M.persistent()) return null;
      return Album.migratePostcards({
        picture: function (c, slot) {
          var m = M && M.list ? M.list({ patient: c, activity: 'postcards', slot: slot, type: 'image' })[0] : null;
          return m && m.blob ? Album.shrink(m.blob) : '';
        }
      });
    }).then(function (r) {
      if (r && (r.photos || r.words)) try { console.info('Memories: postcards taken over', JSON.stringify(r)); } catch (e) { /* quiet */ }
    }, function () { /* tried again at the next start (only the residents not marked yet) */ });
  }
  document.addEventListener('DOMContentLoaded', function () {
    migratePostcards();
    var s = document.getElementById('screen');
    if (!s || !document.getElementById('stage') || document.getElementById('setup')) return;
    var busy = false;
    function later() { if (busy) return; busy = true; setTimeout(function () { busy = false; paintDay(); }, 60); }
    if (window.MutationObserver) new MutationObserver(later).observe(s, { childList: true });
    window.addEventListener('storage', function (e) { if (!e.key || e.key.indexOf('bellatrix-album') === 0 || e.key === 'bellatrix-staff-only') later(); });
    /* The photos load from IndexedDB at start-up: repaint the photo of the day when they are ready. */
    window.addEventListener('bellatrix-album-ready', later);
    setInterval(paintDay, 60000);
    later();
    /* Pictures the family portal gave as server addresses are copied here for offline use. */
    setTimeout(function () { Album.cache(); }, 3000);
  });
})();
