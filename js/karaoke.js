/* Free group karaoke (briefing b1, block A): everybody sings together in the community room, the
   words in very big letters with the line being sung lit up, word by word.
   - Only public-domain songs from js/karaoke-songs.js, and only those whose licence register row is
     complete (KaraokeSongs.available). No YouTube, no LRCLIB, no Play catalogue, no network at all:
     the accompaniment is synthesised on the robot (Music.track), so it works offline.
   - The sync comes from the same notes as the music: the screen asks the track where it is (in
     beats) and lights the line and the word at that beat. Slower or faster never breaks it.
   - On the screen (2026-11-14, fewer buttons for older residents): Pause / Resume, Next song and Stop
     only. Volume, Slower / Faster and "Chorus only" stay as functions (the Care Team's settings
     in Personalise, the keyboard: arrows, R, N, X, space); "Another one!" is on the end screen.
     No score, no ranking, no victory sound.
   - Lab.start('karaoke', { direct: true, data: { song: '<id>', demo: true } }) goes straight to a
     song and saves nothing (demo mode, agent T).
   - After a real group session (not a preview or a demo, at least one song started) it sets
     localStorage['bellatrix-hygiene-due'] = { kind: 'karaoke', at } for the screen-cleaning reminder.
   - The care team prepares playlists and songs to avoid on staff.html (mounted at the end of this
     file); they are kept in localStorage['bellatrix-karaoke-v1'] (model: js/karaoke-songs.js).
   - 1.16: video karaoke from official channels (js/karaoke-yt.js, window.KaraokeVideo), only with the
     internet. The videos sit in the same categories, marked "Internet", three per screen with the
     songs of Bellatrix, "More choices" for the next three. Their words are in the video; this file
     only drives the official player (pause, volume, speed, next, stop) and never loads anything. */
(function () {
  'use strict';
  var KS = window.KaraokeSongs;
  if (!KS || !window.Lab) return;
  function KV() { return window.KaraokeVideo || null; }
  var esc = Lab.esc;
  var STORE = 'bellatrix-karaoke-v1', HYGIENE = 'bellatrix-hygiene-due';
  var CAT_NAME = { popular: 'Popular songs', christmas: 'Christmas songs', children: 'Nursery rhymes' };
  var LANG_NAME = { fr: 'Français', de: 'Deutsch', en: 'English' };
  var TEMPO_MIN = 0.7, TEMPO_MAX = 1.3, VOL_MIN = 0.1;

  function readStore() { try { return KS.cleanStore(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch (e) { return KS.cleanStore(null); } }
  function writeStore(o) { try { localStorage.setItem(STORE, JSON.stringify(KS.cleanStore(o))); return true; } catch (e) { return false; } }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pct(v) { return Math.round(v * 100) + ' %'; }

  /* ---------- pictures (drawn here, no files; 1.15: in the Melodie palette of the whole product) ---------- */
  function scene(bg, body) { return '<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" style="overflow:visible" aria-hidden="true" focusable="false"><rect x="-4000" y="-4000" width="9000" height="9000" fill="' + bg + '"/>' + body + '</svg>'; }
  function note(x, y, s, c) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + c + '"><ellipse cx="0" cy="62" rx="24" ry="17" transform="rotate(-20 0 62)"/>' +
      '<rect x="17" y="-34" width="9" height="98" rx="3"/><path d="M17 -34 q46 12 44 58 q-12 -28 -44 -32 z"/></g>';
  }
  var ART_TILE = scene('#F0F0F0',
    '<rect x="270" y="38" width="470" height="250" rx="12" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="8"/>' +
    '<rect x="320" y="88" width="250" height="26" rx="13" fill="#E0E0E0"/>' +
    '<rect x="320" y="140" width="370" height="46" rx="23" fill="#00519E"/>' +
    '<rect x="320" y="214" width="300" height="26" rx="13" fill="#E0E0E0"/>' +
    '<rect x="486" y="288" width="38" height="56" fill="#E0E0E0"/><rect x="410" y="338" width="190" height="20" rx="10" fill="#E0E0E0"/>' +
    '<g transform="rotate(-24 150 250)"><rect x="128" y="232" width="44" height="160" rx="18" fill="#9FD3F5"/><circle cx="150" cy="206" r="52" fill="#E0E0E0"/>' +
    '<path d="M108 196 h84 M104 216 h92" stroke="#8F8F8F" stroke-width="7" stroke-linecap="round"/></g>' +
    note(800, 70, 1.5, '#9FD3F5') + note(880, 210, 1.05, '#00519E') + note(60, 40, 0.9, '#E0E0E0'));
  var CAT_ART = {
    popular: scene('#F0F0F0', note(330, 70, 2.3, '#00519E') + note(560, 120, 1.7, '#00519E') +
      '<path d="M720 150 c-40 -60 -120 -20 -90 40 c20 40 90 80 90 80 c0 0 70 -40 90 -80 c30 -60 -50 -100 -90 -40 z" fill="#9FD3F5"/>'),
    christmas: scene('#F0F0F0',
      '<path d="M500 30 L640 200 L580 200 L690 330 L310 330 L420 200 L360 200 Z" fill="#00519E"/><rect x="475" y="330" width="50" height="60" fill="#24507C"/>' +
      '<path d="M500 0 l14 30 l32 4 l-24 22 l7 32 l-29 -16 l-29 16 l7 -32 l-24 -22 l32 -4 z" fill="#9FD3F5"/>' +
      '<circle cx="455" cy="250" r="16" fill="#00519E"/><circle cx="560" cy="275" r="16" fill="#FFFFFF"/><circle cx="505" cy="170" r="14" fill="#9FD3F5"/>'),
    children: scene('#F0F0F0',
      '<path d="M560 60 a150 150 0 1 0 120 250 a120 120 0 1 1 -120 -250 z" fill="#00519E"/>' +
      '<path d="M300 90 l12 26 l28 3 l-21 19 l6 28 l-25 -14 l-25 14 l6 -28 l-21 -19 l28 -3 z" fill="#9FD3F5"/>' +
      '<path d="M790 110 l9 20 l21 2 l-16 14 l5 21 l-19 -11 l-19 11 l5 -21 l-16 -14 l21 -2 z" fill="#9FD3F5"/>' + note(250, 220, 1.1, '#00519E'))
  };
  /* The language on every card; a video card (1.16) also says "Internet" with a play sign. */
  function songArt(s) {
    var a = CAT_ART[s.cat] || CAT_ART.popular;
    var badge = '<g><rect x="30" y="24" width="150" height="86" rx="43" fill="#00519E"/><text x="105" y="86" text-anchor="middle" font-size="54" font-weight="700" fill="#9FD3F5" style="font-family:var(--font)">' + s.lang.toUpperCase() + '</text></g>';
    if (s.yt) badge += '<g class="kvbadge"><rect x="600" y="24" width="370" height="86" rx="43" fill="#00519E"/><path d="M640 44 L684 67 L640 90 Z" fill="#FFFFFF"/>' +
      '<text x="820" y="86" text-anchor="middle" font-size="50" font-weight="700" fill="#FFFFFF" style="font-family:var(--font)">INTERNET</text></g>';
    return a.replace('</svg>', badge + '</svg>');
  }
  var ICON = {
    pause: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="7" width="8" height="26" rx="2"/><rect x="23" y="7" width="8" height="26" rx="2"/></svg>',
    play: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 6 L33 20 L11 34 Z"/></svg>',
    minus: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="17" width="26" height="6" rx="3"/></svg>',
    plus: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="17" width="26" height="6" rx="3"/><rect x="17" y="7" width="6" height="26" rx="3"/></svg>',
    slower: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M22 8 L8 20 L22 32 Z M34 8 L20 20 L34 32 Z"/></svg>',
    faster: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 8 L20 20 L6 32 Z M18 8 L32 20 L18 32 Z"/></svg>',
    next: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 7 L26 20 L7 33 Z"/><rect x="27" y="7" width="6" height="26" rx="2"/></svg>',
    stop: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="8" width="24" height="24" rx="3"/></svg>',
    chorus: '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="13" cy="29" rx="7" ry="5"/><rect x="18" y="6" width="4" height="23"/><path d="M22 6 q12 3 11 15 q-3 -8 -11 -9 z"/></svg>',
    other: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 14 h18 l-5 -6 M32 26 h-18 l5 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------- the end of a group session: the screen-cleaning reminder (agent T reads it) ----------
     One-shot wrapper around Lab.onSessionEnd, so it works however the session ends (Finish, Stop,
     the care team ending it). */
  function watchSessionEnd(K) {
    var prev = Lab.onSessionEnd;
    Lab.onSessionEnd = function (rec) {
      Lab.onSessionEnd = prev;
      try {
        if (rec && rec.activity === 'karaoke' && !rec.preview && !rec.demo && K.started > 0) {
          localStorage.setItem(HYGIENE, JSON.stringify({ kind: 'karaoke', at: new Date().toISOString() }));
        }
      } catch (e) { /* the reminder is only a convenience */ }
      if (prev) prev(rec);
    };
  }

  Lab.define({
    key: 'karaoke', day: 14, name: 'Group karaoke', zone: 'COMMUNITY_CIRCLE',
    flow: 'Everyone sings together, with very big lyrics and music made by Bellatrix.',
    learn: 'Shared atmosphere in a group, lyrics readable at 3 to 4 metres, staff controls.',
    againQuestion: 'Shall we sing together again another time?',
    art: function () { return ART_TILE; },
    content: [
      { id: 'lang', label: 'Songs in', type: 'select', value: 'patient',
        options: [['patient', 'The patient’s language'], ['fr', 'French'], ['de', 'German'], ['en', 'English'], ['all', 'All languages']] },
      { id: 'chorus', label: 'Start in “Chorus only” mode', type: 'select', value: 'off', options: [['off', 'No'], ['on', 'Yes']] },
      { id: 'tempo', label: 'Speed', type: 'select', value: '1', options: [['0.85', 'A little slower'], ['1', 'As written'], ['1.1', 'A little faster']] },
      { id: 'maxVolume', label: 'Volume cap (%)', type: 'number', min: 30, max: 100, value: '85' },
      { id: 'residents', label: 'Residents present (codes, for their songs to avoid)', type: 'line', value: '' }
    ],
    start: function (L) {
      var T = L.t, data = Lab.startData || {}, demo = !!data.demo;
      var langPref = L.text('lang') || 'patient';
      var cap = clamp((parseInt(L.text('maxVolume'), 10) || 85) / 100, 0.3, 1);
      var K = {
        lang: langPref === 'patient' ? L.lang() : (['fr', 'de', 'en', 'all'].indexOf(langPref) >= 0 ? langPref : L.lang()),
        chorus: L.text('chorus') === 'on', tempo: clamp(parseFloat(L.text('tempo')) || 1, TEMPO_MIN, TEMPO_MAX),
        cap: cap, vol: clamp(Lab.opt.volume || 0.9, VOL_MIN, cap), started: 0, finished: 0,
        show: 'all', rate: 1     /* 1.16: which songs (all | local | video) and the video speed */
      };
      var store = readStore();
      K.exclude = KS.excluded(store, { group: Lab.patient, residents: L.text('residents') });
      if (K.exclude.length) L.log('Karaoke: ' + K.exclude.length + ' song(s) left out for this group or these residents', 'karaoke');
      /* Demo mode (agent T): the session record becomes a preview, so nothing is saved. */
      if (demo) {
        var rec = Lab._t && Lab._t.state && Lab._t.state.rec;
        if (rec) { rec.preview = true; rec.demo = true; }
        L.log('Karaoke demo: nothing is saved', 'karaoke');
      }
      watchSessionEnd(K);
      L.stat('Karaoke: songs in', K.lang);

      function langs() { return K.lang === 'all' ? KS.LANGS : [K.lang]; }
      function pool(cat) {
        var out = [];
        langs().forEach(function (l) { out = out.concat(KS.available({ lang: l, cat: cat, exclude: K.exclude })); });
        return out;
      }
      /* 1.16: the videos of a category, only when the robot has the internet. */
      function vpool(cat) {
        var kv = KV(), out = [];
        if (!kv || !kv.online()) return out;
        langs().forEach(function (l) { out = out.concat(kv.available({ lang: l, cat: cat, exclude: K.exclude })); });
        return out;
      }
      /* Two songs of Bellatrix, then one video, so both kinds are on the first screen. */
      function mix(a, b) {
        var out = [], i = 0, j = 0;
        while (i < a.length || j < b.length) {
          if (i < a.length) out.push(a[i++]);
          if (i < a.length) out.push(a[i++]);
          if (j < b.length) out.push(b[j++]);
        }
        return out;
      }
      function list(cat) {
        var a = pool(cat), b = vpool(cat);
        if (!a.length || !b.length) return a.concat(b);
        return K.show === 'local' ? a : K.show === 'video' ? b : mix(a, b);
      }
      function stepFor(s, ctx) { return s && s.yt ? videoStep(s, ctx) : singStep(s, ctx); }
      function playlists() {
        return readStore().playlists.filter(function (p) {
          return (!p.language || K.lang === 'all' || p.language === K.lang) && KS.playlistSongs(store, p.id, { exclude: K.exclude }).length;
        });
      }
      function finishAll() {
        if (demo) {
          var rec = Lab._t && Lab._t.state && Lab._t.state.rec;
          if (rec) rec.outcome = 'completed';
          L.log('Karaoke demo finished', 'karaoke');
          Lab.endSession();
          return;
        }
        L.finish();
      }

      /* ---------- 1. the care team chooses: language and kind of songs (3 cards at most) ---------- */
      function chips() {
        return '<div class="kchips" role="group" aria-label="' + esc(T('Songs in')) + '">' + ['fr', 'de', 'en', 'all'].map(function (l) {
          return '<button type="button" class="kchip' + (K.lang === l ? ' on' : '') + '" data-klang="' + l + '" aria-pressed="' + (K.lang === l) + '">' + esc(l === 'all' ? T('All languages') : LANG_NAME[l]) + '</button>';
        }).join('') + '</div>';
      }
      function wireChips(el) {
        var box = el.querySelector('.kchips');
        if (!box) return;
        box.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('[data-klang]') : null;
          if (!b || b.getAttribute('data-klang') === K.lang) return;
          K.lang = b.getAttribute('data-klang');
          L.log('Karaoke: songs in ' + K.lang, 'karaoke');
          L.go(chooseStep(), { replace: true, silent: true });
        });
      }
      function chooseStep() {
        var cats = KS.CATS.filter(function (c) { return list(c).length; }), lists = playlists();
        var empty = !cats.length ? '<p class="knone">' + esc(T('No songs here. Choose another language.')) + '</p>' : '';
        return {
          id: 'k-choose', title: T('Which songs shall we sing?'), cls: 'kpick', airPointer: true,
          body: chips() + empty, style: 'cards',
          choices: cats.map(function (c) {
            return { label: T(CAT_NAME[c]), art: CAT_ART[c], value: c, words: [c, T(CAT_NAME[c])], run: function () { L.go(songsStep(c, 0)); } };
          }),
          actions: lists.length ? [{ label: T('Prepared playlists'), icon: ART.icon.note, words: ['playlist', 'playlists'], run: function () { L.go(playlistStep(0)); } }] : [],
          after: wireChips
        };
      }
      /* ---------- 2. three songs per screen, then "More choices" ---------- */
      /* 1.16: which kind of song (all, without internet, videos), shown only when both kinds exist,
         and where we are in the list ("2 / 9"). */
      function srcChips(cat, page, pages) {
        var both = pool(cat).length && vpool(cat).length;
        var chips = both ? [['all', T('All songs')], ['local', T('Without internet')], ['video', T('Videos · Internet')]].map(function (o) {
          return '<button type="button" class="kchip' + (K.show === o[0] ? ' on' : '') + '" data-ksrc="' + o[0] + '" aria-pressed="' + (K.show === o[0]) + '">' + esc(o[1]) + '</button>';
        }).join('') : '';
        return '<div class="kchips ksrc" role="group" aria-label="' + esc(T('Which song?')) + '">' + chips +
          (pages > 1 ? '<span class="kpage" aria-hidden="true">' + (page + 1) + ' / ' + pages + '</span>' : '') + '</div>';
      }
      function songsStep(cat, page) {
        var all = list(cat), pages = Math.max(1, Math.ceil(all.length / 3));
        page = ((page % pages) + pages) % pages;
        return {
          id: 'k-songs', title: T('Which song?'), cls: 'kpick', airPointer: true, style: 'cards',
          body: srcChips(cat, page, pages),
          choices: all.slice(page * 3, page * 3 + 3).map(function (s) {
            return { label: s.title, art: songArt(s), value: s.id, cls: s.yt ? 'kvcard' : '', run: function () { L.go(stepFor(s, { list: all, cat: cat, page: page }), { replace: true }); } };
          }),
          actions: all.length > 3 ? [{ label: T('More choices'), words: ['more', 'more choices', 'other songs'], noLabelWords: true, run: function () { L.go(songsStep(cat, page + 1), { replace: true, silent: true }); } }] : [],
          after: function (el) {
            var box = el.querySelector('.ksrc');
            if (box) box.addEventListener('click', function (e) {
              var b = e.target.closest ? e.target.closest('[data-ksrc]') : null;
              if (!b || b.getAttribute('data-ksrc') === K.show) return;
              K.show = b.getAttribute('data-ksrc');
              L.log('Karaoke: songs shown: ' + K.show, 'karaoke');
              L.go(songsStep(cat, 0), { replace: true, silent: true });
            });
          }
        };
      }
      function playlistStep(page) {
        var lists = playlists(), pages = Math.max(1, Math.ceil(lists.length / 3));
        page = ((page % pages) + pages) % pages;
        return {
          id: 'k-lists', title: T('Which playlist?'), cls: 'kpick', airPointer: true,
          choices: lists.slice(page * 3, page * 3 + 3).map(function (p) {
            var songs = KS.playlistSongs(store, p.id, { exclude: K.exclude });
            return { label: p.name, icon: ART.icon.note, value: p.id, run: function () {
              L.stat('Karaoke: playlist', p.name);
              L.go(singStep(songs[0], { list: songs, cat: songs[0].cat, page: 0, playlist: true }), { replace: true });
            } };
          }),
          actions: lists.length > 3 ? [{ label: T('More choices'), run: function () { L.go(playlistStep(page + 1), { replace: true, silent: true }); } }] : []
        };
      }
      /* ---------- 4. the end: one short positive line ---------- */
      function endStep(song) {
        var line = T('Thank you all, that was a lovely moment.');
        return {
          id: 'k-end', center: true, title: line, say: line, back: false, noStop: true, noHistory: true, airPointer: true, cls: 'kend',
          actions: [
            { label: T('Another one!'), primary: true, gesture: 'open', words: ['another', 'another one', 'again', 'more', 'one more'], noLabelWords: true, run: function () { goOther(song); } },
            { label: T('Finish'), gesture: 'fist', words: ['finish', 'done', 'stop', 'end'], noLabelWords: true, run: finishAll }
          ]
        };
      }
      function goOther(song) {
        var cat = song ? song.cat : null;
        if (cat && list(cat).length) { L.go(chooseStep(), { clear: true, silent: true }); L.go(songsStep(cat, 0)); }
        else L.go(chooseStep(), { clear: true });
      }
      /* A8: a song whose data cannot be played: a clear message, back to the choice, no crash. */
      function errorStep(song, why) {
        L.log('Karaoke: "' + (song && song.title) + '" cannot be played: ' + why, 'error');
        var line = T('This song cannot be played.');
        return {
          id: 'k-error', center: true, title: line, say: line, back: false, noHistory: true, airPointer: true,
          actions: [{ label: T('Choose another song'), primary: true, words: ['another', 'choose', 'other'], noLabelWords: true, run: function () { goOther(song); } }]
        };
      }

      /* ---------- 3. singing ---------- */
      function singStep(song, ctx) {
        var tl, ev;
        try {
          if (!song) throw new Error('no such song');
          if (KS.check(song).length) throw new Error(KS.check(song).join('; '));
          tl = KS.build(song); ev = KS.arrange(tl);
          if (!ev.length) throw new Error('no notes');
        } catch (e) { return errorStep(song, e.message); }
        var h = null, held = false, lastBeat = 0, lastLine = -2, lastWord = '', lastMode = null, noSound = false, done = false, keyFn = null, startedHere = false;
        var at = ctx.list.indexOf(song), next = ctx.list.length > 1 && (!ctx.playlist || at + 1 < ctx.list.length) ? ctx.list[(at + 1) % ctx.list.length] : null;

        function ctlBtn(k, label, icon, cls, pressed) {
          return '<button type="button" class="kbtn' + (cls ? ' ' + cls : '') + '" data-k="' + k + '"' + (pressed === undefined ? '' : ' aria-pressed="' + pressed + '"') + '>' +
            (icon ? '<span class="kico">' + icon + '</span>' : '') + '<span class="klbl">' + esc(label) + '</span></button>';
        }
        function isPaused() { return h ? h.paused() || !h.live() : held; }
        function controls() {
          var p = isPaused() && (h || held);
          return '<div class="kctl" role="group" aria-label="' + esc(T('Controls for the care team')) + '">' +
            /* 2026-11-14: three big buttons only on the resident's screen (Pause / Resume, Next song when
               there is one, Stop). Volume, speed, "Chorus only" and "Another one!" keep working (act(),
               the keyboard, the Care Team's settings); "Another one!" is on the screen after Stop. */
            ctlBtn('pause', p ? T('Resume') : T('Pause'), p ? ICON.play : ICON.pause, 'kmain') +
            (next ? ctlBtn('next', T('Next song'), ICON.next) : '') +
            ctlBtn('stop', T('Stop'), ICON.stop, 'kstop') +
            '</div>';
        }
        function body() {
          return '<div class="kara">' +
            '<div class="khead"><span class="ktitle">' + esc(song.title) + '</span><span class="kstate" id="kState">' + esc(stateText()) + '</span></div>' +
            '<div class="kbar" aria-hidden="true"><i id="kProg"></i></div>' +
            '<div class="klyrics" id="kLyrics" lang="' + song.lang + '"></div>' +
            '<p class="knote" id="kNote"' + (noSound ? '' : ' hidden') + '>' + esc(T('No sound on this screen: the words move on without music.')) + '</p>' +
            controls() + '</div>';
        }
        function stateText() {
          /* only what matters on the resident's screen: paused, and the speed when it is not the written one */
          return [isPaused() && (h || held) ? T('Paused') : '', K.tempo !== 1 ? T('Speed {s}', { s: pct(K.tempo) }) : ''].filter(Boolean).join(' · ');
        }
        function beatNow() { if (h) lastBeat = h.live() || h.ended() ? h.pos() : lastBeat; return lastBeat; }
        function wordsHtml(l, cls) {
          return '<p class="kl ' + cls + (l.ch ? ' kch' : '') + (K.chorus && tl.chorus ? (l.ch ? ' kbig' : ' kverse') : '') + (l.text.length > 34 ? ' klong' : l.text.length > 24 ? ' kmid' : '') + '">' +
            l.words.map(function (w, i) { return '<span class="kw" data-w="' + i + '">' + esc(w.text) + '</span>'; }).join(' ') + '</p>';
        }
        function linesHtml(li) {
          var out = '', lines = tl.lines;
          /* Spotify style: two lines before, the current one, then as many as fit (the box clips the rest). */
          out += li > 1 ? wordsHtml(lines[li - 2], 'kprev') : '<p class="kl kprev kempty"></p>';
          out += li > 0 ? wordsHtml(lines[li - 1], 'kprev') : '<p class="kl kprev kempty"></p>';
          if (li < 0) out += '<p class="kl kcur kready"><span class="kw">' + esc(T('Get ready…')) + '</span> <span class="kcount" id="kCount"></span></p>';
          else out += wordsHtml(lines[li], 'kcur');
          for (var n = 1; n <= 8; n++) out += lines[li + n] ? wordsHtml(lines[li + n], 'knext') : '';
          return out;
        }
        /* Draws the lines when the current line changes (a short slide up), and the words every tick. */
        function paint(force) {
          var box = document.getElementById('kLyrics');
          if (!box) return;
          var beat = beatNow(), a = KS.at(tl, beat, 1), mode = K.chorus ? 1 : 0;
          if (force || a.line !== lastLine || mode !== lastMode) {
            var moved = !force && a.line !== lastLine;
            box.innerHTML = linesHtml(a.line);
            if (moved) { box.classList.remove('kmove'); void box.offsetWidth; box.classList.add('kmove'); }
            lastLine = a.line; lastMode = mode; lastWord = '';
          }
          if (a.line >= 0) {
            var l = tl.lines[a.line], doneLine = beat >= l.b1 - 0.05, key = a.word + (doneLine ? 'd' : '');
            if (key !== lastWord) {
              var spans = box.querySelectorAll('.kcur .kw');
              for (var i = 0; i < spans.length; i++) spans[i].className = 'kw' + (doneLine || i < a.word ? ' ks' : i === a.word ? ' kn' : '');
              lastWord = key;
            }
          } else {
            var c = document.getElementById('kCount'), left = Math.ceil(tl.lines[0].b0 - beat);
            if (c) c.textContent = left >= 1 && left <= Math.min(4, tl.meter + 1) ? String(left) : '';
          }
          var p = document.getElementById('kProg');
          if (p) p.style.width = Math.max(0, Math.min(100, beat / tl.beats * 100)).toFixed(1) + '%';
        }
        function refreshControls() {
          var el = document.querySelector('#screen .kctl'), st = document.getElementById('kState');
          if (el) el.outerHTML = controls();
          if (st) st.textContent = stateText();
        }
        function startTrack(from) {
          if (done) return;
          Music.setVolume(K.vol);
          h = Music.track(ev, { bpm: song.bpm, tempo: K.tempo, beats: tl.beats, from: from || 0, onEnd: ended, onNoAudio: function () {
            noSound = true;
            var n = document.getElementById('kNote'); if (n) n.hidden = false;
            L.log('Karaoke: no sound on this screen, the words go on without music', 'error');
          } });
          if (!startedHere) {
            startedHere = true; K.started++;
            L.push('Karaoke: songs', song.title + (ctx.playlist ? ' (playlist)' : ''));
            L.log('Karaoke: "' + song.title + '" starts' + (K.chorus && tl.chorus ? ', chorus only' : '') + ', speed ' + pct(K.tempo) + ', volume ' + pct(K.vol), 'karaoke');
          }
          if (held) { held = false; h.pause(); }
          refreshControls();
        }
        function ended() {
          if (done) return;
          done = true; K.finished++;
          L.stat('Karaoke: songs sung to the end', K.finished);
          L.log('Karaoke: "' + song.title + '" sung to the end', 'karaoke');
          if (ctx.playlist && next) L.go(stepFor(next, ctx), { replace: true });
          else L.go(endStep(song), { replace: true });
        }
        function act(k) {
          var T0 = performance.now();
          if (k === 'pause') {
            if (!h) { held = !held; }
            else if (!h.live() && !h.ended()) { var li = KS.at(tl, lastBeat, 0).line; startTrack(li >= 0 ? tl.lines[li].start : 0); L.log('Karaoke: resumed after an interruption', 'karaoke'); }
            else if (h.paused()) { h.resume(); L.log('Karaoke: Resume', 'karaoke'); }
            else { h.pause(); L.log('Karaoke: Pause', 'karaoke'); }
          } else if (k === 'vdown' || k === 'vup') {
            K.vol = clamp(Math.round((K.vol + (k === 'vup' ? 0.1 : -0.1)) * 100) / 100, VOL_MIN, K.cap);
            Music.setVolume(K.vol);
            L.log('Karaoke: volume ' + pct(K.vol) + (k === 'vup' && K.vol >= K.cap ? ' (cap)' : ''), 'karaoke');
          } else if (k === 'slower' || k === 'faster') {
            K.tempo = clamp(Math.round((K.tempo + (k === 'faster' ? 0.1 : -0.1)) * 100) / 100, TEMPO_MIN, TEMPO_MAX);
            if (h) h.setTempo(K.tempo);
            L.log('Karaoke: speed ' + pct(K.tempo), 'karaoke');
          } else if (k === 'chorus') {
            if (!tl.chorus) return;
            K.chorus = !K.chorus;
            L.log('Karaoke: chorus only ' + (K.chorus ? 'on' : 'off'), 'karaoke');
            if (K.chorus) L.stat('Karaoke: chorus only used', 'yes');
          } else if (k === 'next') {
            if (!next) return;
            done = true; Music.stop();
            L.log('Karaoke: next song', 'karaoke');
            L.go(stepFor(next, ctx), { replace: true });
            return;
          } else if (k === 'other') {
            done = true; Music.stop();
            L.log('Karaoke: another one', 'karaoke');
            goOther(song);
            return;
          } else if (k === 'stop') {
            done = true;
            Music.stop();
            L.log('Karaoke: Stop, sound cut in ' + Math.round(performance.now() - T0) + ' ms', 'karaoke');
            L.go(endStep(song), { replace: true });
            return;
          }
          refreshControls();
          paint(true);
        }
        var KEYS = { ' ': 'pause', ArrowUp: 'vup', ArrowDown: 'vdown', ArrowLeft: 'slower', ArrowRight: 'faster', n: 'next', N: 'next', r: 'chorus', R: 'chorus', x: 'stop', X: 'stop' };
        var step = {
          id: 'k-sing', cls: 'ksing', back: false, noStop: true, noHistory: true, noReprompt: true, noHandSigns: true,
          say: T('Let us sing together: {title}.', { title: song.title }),
          afterSay: function () { if (!h && !done) startTrack(0); },
          after: function (el) {
            var root = el.querySelector('.kara');
            if (root) root.addEventListener('click', function (e) {
              var b = e.target.closest ? e.target.closest('[data-k]') : null;
              if (b) act(b.getAttribute('data-k'));
            });
            lastLine = -2; paint(true);
          },
          enter: function () {
            var stage = document.getElementById('stage');
            if (stage) stage.classList.add('kara-on');
            L.every(function () { if (!done) paint(false); }, 70);
            keyFn = function (e) {
              if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !KEYS[e.key]) return;
              e.preventDefault(); act(KEYS[e.key]);
            };
            document.addEventListener('keydown', keyFn);
            /* For the automated check and the browser console. */
            Lab._karaoke.cur = { song: song, tl: tl, handle: function () { return h; }, seek: function (b) { if (!done) startTrack(b); },
              state: function () { var b = beatNow(), a = KS.at(tl, b, 1); return { id: song.id, beat: b, line: a.line, word: a.word, tempo: K.tempo, vol: K.vol, cap: K.cap, chorus: K.chorus, paused: isPaused(), audio: h ? h.audio() : null, started: K.started }; } };
          },
          leave: function () {
            done = true;
            var stage = document.getElementById('stage');
            if (stage) stage.classList.remove('kara-on');
            if (keyFn) document.removeEventListener('keydown', keyFn);
            Music.setVolume(Lab.opt.volume);
            Lab._karaoke.cur = null;
          }
        };
        /* The words of the screen are built at each drawing, so a change of language or of screen
           orientation draws them again without stopping the song. */
        Object.defineProperty(step, 'body', { get: body, enumerable: true });
        return step;
      }

      /* ---------- 3b. a karaoke video (1.16): the official player in a box on the stage ----------
         The box lives outside #screen (a redraw never stops it) and is moved onto the empty slot of
         the screen after every drawing; nothing covers it and it is never under 200 x 200 pixels.
         Same buttons as a song: Pause, Next song, Stop (volume and speed: keyboard and settings;
         "Another one!" is on the end screen). Stop destroys the player: the sound stops at once. */
      function videoStep(v, ctx) {
        var kv = KV(), h = null, done = false, startedHere = false, keyFn = null, waitTimer = null;
        var at = ctx.list.indexOf(v), next = ctx.list.length > 1 ? ctx.list[(at + 1) % ctx.list.length] : null;
        if (!kv || !kv.online()) return errorStep(v, 'no internet');
        function stageEl() { return document.getElementById('stage'); }
        function scale() { var st = stageEl(); return st ? (st.getBoundingClientRect().width / ((Lab.stageW && Lab.stageW()) || 1080)) || 1 : 1; }
        function isPaused() { return !!h && h.paused(); }
        function rates() { return h ? h.rates() : [1]; }
        function ctlBtn(k, label, icon, cls, pressed) {
          return '<button type="button" class="kbtn' + (cls ? ' ' + cls : '') + '" data-k="' + k + '"' + (pressed === undefined ? '' : ' aria-pressed="' + pressed + '"') + '>' +
            (icon ? '<span class="kico">' + icon + '</span>' : '') + '<span class="klbl">' + esc(label) + '</span></button>';
        }
        function controls() {
          var p = isPaused();
          return '<div class="kctl" role="group" aria-label="' + esc(T('Controls for the care team')) + '">' +
            /* the same three big buttons as for a song (see singStep) */
            ctlBtn('pause', p ? T('Resume') : T('Pause'), p ? ICON.play : ICON.pause, 'kmain') +
            (next ? ctlBtn('next', T('Next song'), ICON.next) : '') +
            ctlBtn('stop', T('Stop'), ICON.stop, 'kstop') +
            '</div>';
        }
        function stateText() {
          return [isPaused() ? T('Paused') : '', K.rate !== 1 ? T('Speed {s}', { s: pct(K.rate) }) : '', T('Internet')].filter(Boolean).join(' · ');
        }
        function body() {
          return '<div class="kara kvid">' +
            '<div class="khead"><span class="ktitle">' + esc(v.title) + '</span><span class="kstate" id="kState">' + esc(stateText()) + '</span></div>' +
            '<div class="kbar" aria-hidden="true"><i id="kProg"></i></div>' +
            '<div class="kvslot" data-kvslot><p class="kvwait">' + esc(T('The video is starting…')) + '</p></div>' +
            '<p class="knote kvsrc">' + esc(T('Video from {channel}. The words are in the video.', { channel: v.channel })) + '</p>' +
            controls() + '</div>';
        }
        function place() {
          if (!h || done) return;
          var scr = document.getElementById('screen');
          var slot = scr && !scr.querySelector('.overlay') ? scr.querySelector('[data-kvslot]') : null;
          if (!slot) { h.hide(); if (h.playing()) h.pause(); return; }
          h.place(slot, scale());
        }
        function refreshControls() {
          var el = document.querySelector('#screen .kctl'), st = document.getElementById('kState');
          if (el) el.outerHTML = controls();
          if (st) st.textContent = stateText();
        }
        function progress() {
          var p = document.getElementById('kProg'), d = h ? h.duration() : 0;
          if (p) p.style.width = (d > 0 ? Math.max(0, Math.min(100, h.time() / d * 100)) : 0).toFixed(1) + '%';
        }
        function fail(why) {
          if (done) return;
          done = true;
          if (h) h.destroy();
          L.go(errorStep(v, 'video: ' + why), { replace: true });
        }
        function startPlayer() {
          if (h || done) return;
          h = kv.player(stageEl(), v, { volume: K.vol, rate: K.rate, lang: L.lang(),
            onReady: function () { place(); refreshControls(); },
            onState: function (s) {
              if (s === 1 && !startedHere) {
                startedHere = true; K.started++;
                clearTimeout(waitTimer);
                L.push('Karaoke: songs', v.title + ' (video)');
                L.log('Karaoke: video "' + v.title + '" (' + v.channel + ') starts, volume ' + pct(K.vol), 'karaoke');
              }
              refreshControls();
            },
            onEnd: ended,
            onError: function (code) { if (!startedHere) fail(code); else L.log('Karaoke: the video stopped, code ' + code, 'error'); }
          });
          place();
          /* No picture after 20 seconds (no internet, blocked video): say so, back to the choice. */
          waitTimer = setTimeout(function () { if (!startedHere && !done) fail('did not start'); }, 20000);
        }
        function ended() {
          if (done) return;
          done = true; K.finished++;
          if (h) h.destroy();
          L.stat('Karaoke: songs sung to the end', K.finished);
          L.log('Karaoke: video "' + v.title + '" sung to the end', 'karaoke');
          L.go(endStep(v), { replace: true });
        }
        function act(k) {
          var T0 = performance.now();
          if (k === 'pause') {
            if (!h) return;
            if (isPaused()) { h.resume(); L.log('Karaoke: Resume', 'karaoke'); }
            else { h.pause(); L.log('Karaoke: Pause', 'karaoke'); }
          } else if (k === 'vdown' || k === 'vup') {
            K.vol = clamp(Math.round((K.vol + (k === 'vup' ? 0.1 : -0.1)) * 100) / 100, VOL_MIN, K.cap);
            if (h) h.setVolume(K.vol);
            L.log('Karaoke: volume ' + pct(K.vol) + (k === 'vup' && K.vol >= K.cap ? ' (cap)' : ''), 'karaoke');
          } else if (k === 'slower' || k === 'faster') {
            var r = rates(), i = r.indexOf(K.rate);
            if (i < 0) i = r.indexOf(1);
            var j = clamp(i + (k === 'faster' ? 1 : -1), 0, r.length - 1);
            if (r[j] === undefined || j === i) return;
            K.rate = r[j];
            if (h) h.setRate(K.rate);
            L.log('Karaoke: video speed ' + pct(K.rate), 'karaoke');
          } else if (k === 'next') {
            if (!next) return;
            done = true; if (h) h.destroy();
            L.log('Karaoke: next song', 'karaoke');
            L.go(stepFor(next, ctx), { replace: true });
            return;
          } else if (k === 'other') {
            done = true; if (h) h.destroy();
            L.log('Karaoke: another one', 'karaoke');
            goOther(v);
            return;
          } else if (k === 'stop') {
            done = true;
            if (h) h.destroy();
            L.log('Karaoke: Stop, video sound cut in ' + Math.round(performance.now() - T0) + ' ms', 'karaoke');
            L.go(endStep(v), { replace: true });
            return;
          } else return;
          refreshControls();
        }
        var KEYS = { ' ': 'pause', ArrowUp: 'vup', ArrowDown: 'vdown', ArrowLeft: 'slower', ArrowRight: 'faster', n: 'next', N: 'next', x: 'stop', X: 'stop' };
        var step = {
          id: 'k-video', cls: 'ksing kvideo', back: false, noStop: true, noHistory: true, noReprompt: true, noHandSigns: true,
          say: T('Let us sing together: {title}.', { title: v.title }),
          afterSay: function () { startPlayer(); },
          after: function (el) {
            var root = el.querySelector('.kara');
            if (root) root.addEventListener('click', function (e) {
              var b = e.target.closest ? e.target.closest('[data-k]') : null;
              if (b) act(b.getAttribute('data-k'));
            });
            place();
          },
          enter: function () {
            var stage = stageEl();
            if (stage) stage.classList.add('kara-on');
            L.every(function () { if (!done) { place(); progress(); } }, 400);
            keyFn = function (e) {
              if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !KEYS[e.key]) return;
              e.preventDefault(); act(KEYS[e.key]);
            };
            document.addEventListener('keydown', keyFn);
            Lab._karaoke.cur = { video: v, handle: function () { return h; }, act: act,
              state: function () { return { id: v.id, kind: 'video', yt: v.yt, paused: isPaused(), vol: K.vol, cap: K.cap, rate: K.rate, started: K.started, playing: !!h && h.playing(),
                time: h ? h.time() : 0, duration: h ? h.duration() : 0, box: h && h.box && h.box.parentNode ? h.box.getBoundingClientRect() : null }; } };
          },
          leave: function () {
            done = true;
            clearTimeout(waitTimer);
            if (h) h.destroy();
            var stage = stageEl();
            if (stage) stage.classList.remove('kara-on');
            if (keyFn) document.removeEventListener('keydown', keyFn);
            Lab._karaoke.cur = null;
          }
        };
        Object.defineProperty(step, 'body', { get: body, enumerable: true });
        return step;
      }

      /* ---------- the way in ---------- */
      if (data.song) {
        var kv0 = KV(), vid = kv0 ? kv0.byId(data.song) : null;
        if (vid && kv0.available({ exclude: [] }).indexOf(vid) >= 0) return videoStep(vid, { list: kv0.available({ lang: vid.lang, cat: vid.cat }), cat: vid.cat, page: 0 });
        var s = KS.byId(data.song), ok = s && KS.available({ exclude: [] }).indexOf(s) >= 0;
        if (!ok) { L.log('Karaoke: song "' + data.song + '" is not available, the choice is shown instead', 'error'); return chooseStep(); }
        return singStep(s, { list: KS.available({ lang: s.lang, cat: s.cat }), cat: s.cat, page: 0 });
      }
      return chooseStep();
    }
  });

  /* ---------- Care Team (staff.html): playlists and songs to avoid (A6) ----------
     A folding section under "Personalise", shown when the karaoke tile is selected. Every text goes
     through ST(); the lists are kept on this device (the robot's tablet), like the rest of the
     Care Team data. The end-of-session smiley and note are the usual session notes. */
  function SX(k, v) { return window.ST ? window.ST(k, v) : I18N.t('en', k, v); }
  function mountStaff() {
    /* 1.15 (agent C): its own place, Contents > "Karaoke" (#kStaffHost); before, a fold under "Personalise".
       15 Nov (Rahma): #kStaffHost is inside Group karaoke > Personalise (the "Music & photos" tab is gone);
       staff.js shows it for that activity only and says so with the 'bellatrix-staff-act' event. */
    var host = document.getElementById('kStaffHost');
    var after = document.getElementById('persBox'), list = document.getElementById('actList');
    if ((!host && (!after || !list)) || document.getElementById('karaokeBox')) return;
    var box = document.createElement(host ? 'div' : 'details');
    box.id = 'karaokeBox'; box.className = host ? 'section kstaff' : 'more kstaff'; box.hidden = !host;
    if (host) host.appendChild(box); else after.parentNode.insertBefore(box, after.nextSibling);
    var draft = { name: '', language: '', songIds: [] }, msg = '';
    function songs() { return KS.available({ exclude: [] }); }
    function videos() { var kv = KV(); return kv ? kv.available({}).length : 0; }
    function title(id) { var s = KS.byId(id); return s ? s.title + ' (' + s.lang.toUpperCase() + ')' : id; }
    function code() { var f = document.getElementById('fParticipant'); return ((f && f.value) || 'P1').trim().toUpperCase(); }
    function render() {
      var st = readStore(), all = songs(), n = { fr: 0, de: 0, en: 0 };
      all.forEach(function (s) { n[s.lang]++; });
      var opts = all.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(title(s.id)) + '</option>'; }).join('');
      var cur = st.exclusions.filter(function (x) { return x.id.toUpperCase() === code(); })[0];
      box.innerHTML = (host ? '<h2>' + esc(SX('Karaoke: playlists and songs to avoid')) + '</h2>' : '<summary>' + esc(SX('Karaoke: playlists and songs to avoid')) + '</summary>') +
        '<p class="note">' + esc(SX('{n} songs, {v} videos (internet).', { n: all.length, fr: n.fr, de: n.de, en: n.en, v: videos() })) + '</p>' +
        '<h3 class="ph">' + esc(SX('Playlists prepared in advance')) + '</h3>' +
        (st.playlists.length ? '<ul class="klist">' + st.playlists.map(function (p) {
          return '<li><b>' + esc(p.name) + '</b>' + (p.language ? ' · ' + esc(LANG_NAME[p.language]) : '') + '<br><span class="note">' + esc(p.songIds.map(title).join(' · ')) + '</span> ' +
            '<button type="button" class="ghost sm danger" data-kdel="' + esc(p.id) + '">' + esc(SX('Delete')) + '</button></li>';
        }).join('') + '</ul>' : '<p class="note">' + esc(SX('No playlists yet.')) + '</p>') +
        '<div class="kform"><label class="field"><span>' + esc(SX('Name')) + '</span><input type="text" id="kpName" value="' + esc(draft.name) + '" placeholder="' + esc(SX('e.g. Christmas afternoon')) + '"></label>' +
        '<label class="field"><span>' + esc(SX('Language')) + '</span><select id="kpLang"><option value="">' + esc(SX('All languages')) + '</option>' +
          ['fr', 'de', 'en'].map(function (l) { return '<option value="' + l + '"' + (draft.language === l ? ' selected' : '') + '>' + LANG_NAME[l] + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>' + esc(SX('Songs, in order')) + '</span><span class="row"><select id="kpSong">' + opts + '</select> <button type="button" class="ghost sm" id="kpAdd">' + esc(SX('Add')) + '</button></span></label>' +
        (draft.songIds.length ? '<ol class="klist">' + draft.songIds.map(function (id, i) {
          return '<li>' + esc(title(id)) + ' <button type="button" class="ghost sm" data-kup="' + i + '" aria-label="' + esc(SX('Up')) + '">↑</button>' +
            '<button type="button" class="ghost sm" data-kdown="' + i + '" aria-label="' + esc(SX('Down')) + '">↓</button>' +
            '<button type="button" class="ghost sm danger" data-krm="' + i + '">' + esc(SX('Remove')) + '</button></li>';
        }).join('') + '</ol>' : '') +
        '<div class="row"><button type="button" class="go" id="kpSave">' + esc(SX('Save the playlist')) + '</button></div></div>' +
        '<h3 class="ph">' + esc(SX('Songs to avoid')) + '</h3>' +
        (st.exclusions.length ? '<ul class="klist">' + st.exclusions.map(function (x, i) {
          return '<li><b>' + esc(x.scope === 'group' ? (x.id === '*' ? SX('Every group') : SX('Group {code}', { code: x.id })) : SX('Resident {code}', { code: x.id })) + '</b>: ' +
            esc(x.songIds.map(title).join(' · ') || '–') + ' <button type="button" class="ghost sm danger" data-kxdel="' + i + '">' + esc(SX('Delete')) + '</button></li>';
        }).join('') + '</ul>' : '<p class="note">' + esc(SX('Nothing to avoid yet.')) + '</p>') +
        '<div class="kform"><div class="row"><label class="field"><span>' + esc(SX('For')) + '</span><select id="kxScope"><option value="group"' + (cur && cur.scope === 'group' ? ' selected' : '') + '>' + esc(SX('A group (session code)')) + '</option>' +
          '<option value="resident"' + (cur && cur.scope === 'resident' ? ' selected' : '') + '>' + esc(SX('A resident (code)')) + '</option></select></label>' +
        '<label class="field"><span>' + esc(SX('Code')) + '</span><input type="text" id="kxCode" value="' + esc(code()) + '" placeholder="' + esc(SX('e.g. G1, P3, or * for every group')) + '"></label></div>' +
        '<div class="checks kchecks">' + all.map(function (s) {
          return '<label class="check"><input type="checkbox" value="' + esc(s.id) + '"' + (cur && cur.songIds.indexOf(s.id) >= 0 ? ' checked' : '') + '> ' + esc(title(s.id)) + '</label>';
        }).join('') + '</div>' +
        '<div class="row"><button type="button" class="go" id="kxSave">' + esc(SX('Save')) + '</button></div></div>' +
        (msg ? '<p class="note kmsg">' + esc(msg) + '</p>' : '');
      msg = '';
    }
    function keepDraft() {
      var n = document.getElementById('kpName'), l = document.getElementById('kpLang');
      if (n) draft.name = n.value; if (l) draft.language = l.value;
    }
    box.addEventListener('click', function (e) {
      var t = e.target, st = readStore(), i;
      if (!t.closest) return;
      if (t.id === 'kpAdd') { keepDraft(); var v = document.getElementById('kpSong').value; if (v) draft.songIds.push(v); render(); return; }
      if (t.closest('[data-kup]')) { keepDraft(); i = +t.closest('[data-kup]').getAttribute('data-kup'); if (i > 0) draft.songIds.splice(i - 1, 0, draft.songIds.splice(i, 1)[0]); render(); return; }
      if (t.closest('[data-kdown]')) { keepDraft(); i = +t.closest('[data-kdown]').getAttribute('data-kdown'); if (i < draft.songIds.length - 1) draft.songIds.splice(i + 1, 0, draft.songIds.splice(i, 1)[0]); render(); return; }
      if (t.closest('[data-krm]')) { keepDraft(); draft.songIds.splice(+t.closest('[data-krm]').getAttribute('data-krm'), 1); render(); return; }
      if (t.id === 'kpSave') {
        keepDraft();
        if (!draft.name.trim() || !draft.songIds.length) { msg = SX('Give the playlist a name and at least one song.'); render(); return; }
        st.playlists.push({ id: 'PL' + Date.now().toString(36), name: draft.name.trim(), language: draft.language, songIds: draft.songIds.slice(), createdBy: (Lab.opt && Lab.opt.staff) || 'care team', createdAt: new Date().toISOString() });
        msg = writeStore(st) ? SX('Saved.') : SX('This device could not save.');
        draft = { name: '', language: '', songIds: [] }; render(); return;
      }
      if (t.closest('[data-kdel]')) {
        var id = t.closest('[data-kdel]').getAttribute('data-kdel');
        if (!window.confirm(SX('Delete this playlist?'))) return;
        st.playlists = st.playlists.filter(function (p) { return p.id !== id; }); writeStore(st); render(); return;
      }
      if (t.closest('[data-kxdel]')) { st.exclusions.splice(+t.closest('[data-kxdel]').getAttribute('data-kxdel'), 1); writeStore(st); render(); return; }
      if (t.id === 'kxSave') {
        var c = (document.getElementById('kxCode').value || '').trim().toUpperCase(), scope = document.getElementById('kxScope').value;
        if (!c) { msg = SX('Enter a code.'); render(); return; }
        var picked = Array.prototype.slice.call(box.querySelectorAll('.kchecks input:checked')).map(function (x) { return x.value; });
        st.exclusions = st.exclusions.filter(function (x) { return !(x.scope === scope && x.id.toUpperCase() === c); });
        if (picked.length) st.exclusions.push({ scope: scope, id: c, songIds: picked });
        msg = writeStore(st) ? SX('Saved.') : SX('This device could not save.');
        render();
      }
    });
    /* Another code or scope typed in: tick that list's songs. */
    box.addEventListener('change', function (e) {
      if (e.target.id !== 'kxCode' && e.target.id !== 'kxScope') return;
      var c = (document.getElementById('kxCode').value || '').trim().toUpperCase(), scope = document.getElementById('kxScope').value;
      var x = readStore().exclusions.filter(function (y) { return y.scope === scope && y.id.toUpperCase() === c; })[0];
      Array.prototype.forEach.call(box.querySelectorAll('.kchecks input'), function (i) { i.checked = !!x && x.songIds.indexOf(i.value) >= 0; });
    });
    function sync() {
      if (host) return;
      var r = document.querySelector('input[name="activity"]:checked');
      box.hidden = !r || r.value !== 'karaoke';
      if (!box.hidden && !box.children.length) render();
    }
    if (host) window.addEventListener('bellatrix-staff-act', function (e) { if (e.detail && e.detail.key === 'karaoke') render(); });
    else {
      list.addEventListener('change', function () { setTimeout(sync, 0); });
      list.addEventListener('click', function () { setTimeout(sync, 0); });
    }
    var f = document.getElementById('fParticipant');
    if (f) f.addEventListener('change', function () { if (!box.hidden) render(); });
    box.addEventListener('toggle', function () { if (box.open) render(); });
    render(); sync();
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('stage')) return;
    setTimeout(mountStaff, 0);
  });
  Lab._karaoke = { readStore: readStore, writeStore: writeStore, STORE: STORE, HYGIENE: HYGIENE };
})();
