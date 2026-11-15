/* Bellatrix Play (version 1.13): the resident's own music, in the style of Spotify.
   The resident chooses and searches by themselves: three big tabs at the bottom (Home, Search,
   My music), rows of big cards with the real YouTube pictures, a big on-screen keyboard, artist
   pages and a big player. Every target is big, for touch and for pointing in the air. Bellatrix
   says one short sentence when the music opens and nothing per song: the title is on the screen.

   The songs and films are official YouTube videos (js/play-catalog.js, checked by LabLand with
   labland/play-check.mjs), played by YouTube's own player from youtube-nocookie.com. Nothing is
   downloaded or recorded. Without internet Bellatrix plays her own calm music instead.

   The persistent player: the engine rebuilds #screen on every step change and refresh, so the
   YouTube player lives outside it, in one box on the stage (.bp-yt). After every render the box is
   moved and scaled onto the empty slot of the current view: big on the player view, tiny on the
   cover of the "now playing" bar while the resident browses. The music never stops for a screen
   change. The box is removed when the session leaves Bellatrix Play.

   Learning, per resident, on this device (localStorage 'bellatrix-play-taste', read by the Care Team
   app and the monthly summary): heart +2, heart removed -2, listened to the end +1, skipped in the
   first 20 seconds -1, "not this song" -2. A song at -3 or lower is never played again; favourites
   come first.

   Recommendations (briefing b1, block C): one engine, js/reco.js with js/reco-config.js. Play sends
   it the listening events (end, replay, heart, next, "not this song", with who acted: resident, or
   staff for "Calm music now" and "Staff is tapping") and asks it for "Your recommendations", the
   radio, the next-song cards (at most three, the most similar first), DJ Bellatrix and the AI
   playlists. The weekly and monthly playlists are made on the robot as drafts; only the ones the
   care team approved appear on Home. Everything depends on the resident's music consent (Care Team,
   Music tab): without it nothing about the listening is written (hearts excepted: they are the
   resident's own list) and Play shows the catalogue without personal recommendations.

   Version 1.16 (agent R, BRIEF-1.16 chantiers I and J):
   - the lyrics are free for everyone (no crown, no lock);
   - free and Premium Play are two clear sets of rules (PlayRules below, tested in node by
     tests/play.test.mjs). Premium is per resident and per product: Premium.isOn(code, 'play').
     Free: a gentle "Bellatrix message" now and then (one card on Home, and at most every third
     song a 5-second card between two songs, only at the natural end of a song, never during a
     choice, a panel, the keyboard, the DJ, a group session, the team's calm music or listening
     together; one real button), 6 skips an hour (the "Not this song" button, the pause and the
     care team are never limited), lists and rows start in shuffle (a song they touch plays
     first), no listening together, no podcast list. The music catalogue, the podcasts and the
     discovery are all there. Premium: none of that, the shuffle is their choice (Up next),
     listening together with the family (contract 3, FamilyMessages.request) and "My podcasts".
     Honest about YouTube: through the official embedded player nothing can be downloaded and
     the sound quality cannot be chosen, so "music offline" and "better sound" are shown as
     coming with the licensed catalogue, for everyone; offline listening works for podcasts.
   - podcasts (js/podcasts.js): a fifth tab, the shows of the resident's language, episodes,
     listening with an <audio> element (the YouTube video pauses), downloads kept on the robot
     with their size and a delete button;
   - "Your mixes" (Reco.mixes) from hearts and listening, with the music consent;
   - the life story is an optional layer: only when the care team switches it on for this
     resident (Personalise, "Use the life story"), the year of birth and the favourite music shape
     the rows and the DJ. Music to avoid is always respected. */

/* The rules of free and Premium Play, pure (no page), also for node (tests/play.test.mjs). */
var PlayRules = (function () {
  'use strict';
  var HOUR = 3600000;
  function mul(a, b) { return Math.imul ? Math.imul(a, b) : (a * b) | 0; }
  var R = {
    SKIPS_PER_HOUR: 6,
    AD_EVERY: 3,          /* songs between two "Bellatrix messages" */
    AD_SECONDS: 5,
    AD_QUIET_MS: 20000,   /* no message within 20 s of a touch: never in the middle of a choice */
    /* What a resident has, from Premium Play (true / false). */
    features: function (premium) {
      premium = !!premium;
      return {
        ads: !premium, skipsPerHour: premium ? Infinity : R.SKIPS_PER_HOUR, chooseOrder: premium, together: premium, podcastList: premium,
        podcasts: true, podcastDownloads: true, catalogue: true, discovery: true, lyrics: true,
        /* not possible through YouTube's embedded player, for anyone: with the licensed catalogue */
        musicOffline: false, betterSound: false
      };
    },
    /* skips: the times (ms) of this session's skips. { ok, left, waitMin } */
    canSkip: function (skips, now, premium, staff) {
      if (premium || staff) return { ok: true, left: Infinity, waitMin: 0 };
      var recent = (skips || []).filter(function (t) { return now - t < HOUR; }).sort(function (a, b) { return a - b; });
      var left = Math.max(0, R.SKIPS_PER_HOUR - recent.length);
      return { ok: left > 0, left: left, waitMin: left > 0 ? 0 : Math.max(1, Math.ceil((recent[0] + HOUR - now) / 60000)) };
    },
    /* Lists the engine orders itself (radio, DJ, AI playlist), the team's calm music, a shared
       queue and the queue keep their order; rows, playlists, favourites, mixes and search shuffle
       for free users, and for Premium users when they turned the shuffle on. */
    shuffles: function (key, premium, pref) {
      key = String(key || '');
      if (/^(radio|dj|ai|calm|together|queue|next)$/.test(key)) return false;
      return premium ? !!pref : true;
    },
    /* A seeded shuffle: the item at `first` (or none: -1) stays first, the others are mixed. */
    shuffle: function (list, first, seed) {
      var a = list.slice(), head = [], h = 2166136261, s = String(seed || 'bellatrix');
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = mul(h, 16777619) >>> 0; }
      function rnd() { h = (h + 0x6D2B79F5) >>> 0; var t = h; t = mul(t ^ (t >>> 15), 1 | t); t = (t + mul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      if (first >= 0 && first < a.length) head = a.splice(first, 1);
      for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), x = a[j]; a[j] = a[k]; a[k] = x; }
      return head.concat(a);
    },
    /* o: { premium, why ('ended' only), since (songs since the last message), touchedAgo (ms),
       panel, sheet, keyboard, dj, staff, group, together, podcast } */
    adDue: function (o) {
      return !o.premium && o.why === 'ended' && (o.since || 0) >= R.AD_EVERY && (o.touchedAgo || 0) >= R.AD_QUIET_MS &&
        !o.panel && !o.sheet && !o.keyboard && !o.dj && !o.staff && !o.group && !o.together && !o.podcast;
    },
    /* The house messages, in turn (placeholders for future partners: Bellatrix's own features).
       English text = translation keys (js/i18n-play.js). */
    MESSAGES: [
      { key: 'pods', title: 'Podcasts are here', text: 'Stories, history and music to listen to.', go: 'pods', btn: 'See the podcasts' },
      { key: 'together', title: 'Listen together', text: 'With Premium, your family can listen with you.', go: 'premium', btn: 'Learn more' },
      { key: 'dj', title: 'DJ Bellatrix', text: 'Your favourites and new songs, without end.', go: 'dj', btn: 'Start the DJ' },
      { key: 'premium', title: 'Bellatrix Play Premium', text: 'No messages like this one, and skip as often as you like.', go: 'premium', btn: 'Learn more' }
    ],
    message: function (n) { var m = R.MESSAGES; n = Math.floor(n) || 0; return m[((n % m.length) + m.length) % m.length]; }
  };
  return R;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlayRules;

(function () {
  'use strict';
  if (typeof Lab === 'undefined' || !Lab.define) return;
  var esc = Lab.esc;
  var TASTE = 'bellatrix-play-taste', START = 'bellatrix-play-start';
  /* Colours of the mixes and tiles: the app's own (css/lab.css), so they follow its light and dark
     mode; the text on them is var(--on-accent). */
  var TONES = ['var(--accent)', 'var(--good)', 'var(--mood-after)', 'var(--focus)'];
  /* Names of the styles (the catalogue's `genre` field, English text = translation key). A style
     not listed here is shown as written in the catalogue. */
  var GENRES = {
    chanson: 'French chanson', schlager: 'Schlager', volksmusik: 'Folk music', folk: 'Folk music', pop: 'Pop', rock: 'Rock',
    'rock and roll': 'Rock and roll', jazz: 'Jazz', swing: 'Swing', blues: 'Blues', soul: 'Soul', gospel: 'Gospel',
    classical: 'Classical music', opera: 'Opera', waltz: 'Waltzes', dance: 'Dance', nature: 'Nature',
    rap: 'Rap and hip-hop', 'hip-hop': 'Rap and hip-hop', electro: 'Electronic music', rnb: 'R&B and soul', latin: 'Latin music',
    reggae: 'Reggae', disco: 'Disco', film: 'Film music', kids: 'Children\u2019s songs', country: 'Country'
  };

  function items() { return (window.PLAY_CATALOG && PLAY_CATALOG.items) || []; }
  function getTaste() { try { return JSON.parse(localStorage.getItem(TASTE) || '{}') || {}; } catch (e) { return {}; } }
  function saveTaste(t) { try { localStorage.setItem(TASTE, JSON.stringify(t)); } catch (e) { /* only a preference */ } }
  /* mqdefault: 16:9 without the black bars of hqdefault. */
  function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'; }
  /* A YouTube link or id as the family pastes it: youtu.be/…, watch?v=…, /shorts/…, /embed/… */
  function ytId(s) {
    s = String(s || '').trim();
    var m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(s);
    return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
  }
  /* The care team's "Calm music now" button leaves a one-time wish for the next session. */
  function takeStartWish() {
    try { var w = localStorage.getItem(START); if (w) localStorage.removeItem(START); return w; } catch (e) { return null; }
  }
  /* Lower case, no accents: "édith" is found with E-D-I. */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u00df/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function hash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003; return h; }
  function tone(s) { return TONES[hash(s) % TONES.length]; }
  /* One catalogue entry, read defensively: unknown kinds count as songs, missing fields stay empty. */
  function clean(it) {
    if (!it || !it.id || !it.title) return null;
    return {
      id: String(it.id), title: String(it.title), artist: String(it.artist || ''), year: parseInt(it.year, 10) || 0,
      lang: String(it.lang || '').toLowerCase(), kind: it.kind === 'music' || it.kind === 'video' ? it.kind : 'song',
      tags: Object.prototype.toString.call(it.tags) === '[object Array]' ? it.tags : [], genre: String(it.genre || '').toLowerCase().trim(), channel: String(it.channel || ''),
      premium: it.premium === true || it.tier === 'premium'
    };
  }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* YouTube's player API, loaded once, only when a resident opens the music. */
  var apiPromise = null;
  function youtube() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (ok, fail) {
      var prev = window.onYouTubeIframeAPIReady, done = false;
      window.onYouTubeIframeAPIReady = function () { done = true; if (prev) { try { prev(); } catch (e) { /* not ours */ } } ok(window.YT); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { apiPromise = null; fail(new Error('offline')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!done && !(window.YT && window.YT.Player)) { apiPromise = null; fail(new Error('timeout')); } }, 12000);
    });
    return apiPromise;
  }

  var SVG = {
    home: '<path d="M12 2.8 1.8 11.2h3V21h5.4v-6h3.6v6h5.4v-9.8h3z"/>',
    search: '<circle cx="10.4" cy="10.4" r="6.6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m15.4 15.4 5.6 5.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    lib: '<path d="M3.5 3h3v18h-3zM9 3h3v18H9zM14.3 3.9l2.9-.8 4.6 17.2-2.9.8z"/>',
    heart: '<path d="M12 21.2S3.6 16.3 1.9 10.9C.7 7.1 3.1 3.6 6.7 3.6c2.3 0 3.9 1.3 5.3 3.1 1.4-1.8 3-3.1 5.3-3.1 3.6 0 6 3.5 4.8 7.3-1.7 5.4-10.1 10.3-10.1 10.3z"/>',
    heartO: '<path d="M12 19.9S4.5 15.5 3 10.7C2 7.6 3.9 4.9 6.7 4.9c2 0 3.4 1.2 5.3 3.6 1.9-2.4 3.3-3.6 5.3-3.6 2.8 0 4.7 2.7 3.7 5.8-1.5 4.8-9 9.2-9 9.2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
    play: '<path d="M7 3.8v16.4L20.5 12z"/>',
    pause: '<path d="M5.5 3.5h4.8v17H5.5zM13.7 3.5h4.8v17h-4.8z"/>',
    next: '<path d="M3.8 4.5v15L15 12zM16.5 4.5h3.4v15h-3.4z"/>',
    prev: '<path d="M20.2 4.5v15L9 12zM4.1 4.5h3.4v15H4.1z"/>',
    quieter: '<path d="M2.5 9h4l5-4.5v15l-5-4.5h-4z"/><path d="M15 12h7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    louder: '<path d="M2.5 9h4l5-4.5v15l-5-4.5h-4z"/><path d="M15 12h7M18.5 8.5v7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    left: '<path d="M15.5 4 7.5 12l8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    right: '<path d="m8.5 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    up: '<path d="m4 15.5 8-8 8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="m4 8.5 8 8 8-8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    del: '<path d="M8.2 4.5H21v15H8.2L1.8 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m11.5 8.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    space: '<path d="M3 8.5v6h18v-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    note: '<path d="M9 17.6a3.2 3.2 0 1 1-2.1-3V4.9l12-2.4v12.6a3.2 3.2 0 1 1-2.1-3V7.2L9 8.8z"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    help: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9.4 9.2a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1.1-1.3 2.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.4"/>',
    video: '<rect x="2.5" y="5.5" width="13.5" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m16.5 10.2 5-3v9.6l-5-3z"/>',
    list: '<path d="M8.5 6h13M8.5 12h13M8.5 18h13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="3.8" cy="6" r="1.7"/><circle cx="3.8" cy="12" r="1.7"/><circle cx="3.8" cy="18" r="1.7"/>',
    lyrics: '<path d="M3 5.5h12M3 10.5h12M3 15.5h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19 13.4v-8l3-1v2.4l-3 1M19 17.2a2.2 2.2 0 1 1-1.4-2v-1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16.8" cy="17.4" r="2.2"/>',
    wave: '<path d="M2 9c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1M2 15.5c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    leaf: '<path d="M20.5 3.5C10 3.5 4 8.5 4 15.5c0 1.6.4 3 1 4.2C7 13 11 10 15 8.5 11.5 11 8.5 14.5 7 20.5c1.2.5 2.4.7 3.7.7 6.8 0 9.8-7.2 9.8-17.7z"/>',
    mic: '<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    star: '<path d="m12 2.8 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/>',
    disc: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3"/>',
    person: '<circle cx="12" cy="8" r="4.2"/><path d="M3.8 21c.8-4.4 4-6.8 8.2-6.8s7.4 2.4 8.2 6.8z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    minus: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    plus: '<path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    crown: '<path d="m3 7.5 4.5 4L12 4l4.5 7.5 4.5-4-2 10.5H5z"/><path d="M5 20.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + SVG[n] + '</svg>'; }
  /* A picture from YouTube with a note behind it: without internet the note stays. */
  function art(id, cls, extra) {
    return '<span class="bp-art ' + cls + '">' + ic('note') + (id ? '<img src="' + thumb(id) + '" alt="" loading="lazy">' : '') + (extra || '') + '</span>';
  }
  function playArt() {
    return '<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#F0F0F0"/>' +
      '<rect x="34" y="40" width="150" height="150" rx="18" fill="#00519E"/><rect x="204" y="40" width="150" height="150" rx="18" fill="#9FD3F5"/>' +
      '<path d="M96 146a14 14 0 1 1-9-13V82l52-10v55a14 14 0 1 1-9-13V92l-34 7z" fill="#FFFFFF"/><circle cx="279" cy="115" r="36" fill="#FFFFFF" opacity=".9"/><path d="M268 96 L298 115 L268 134 Z" fill="#9FD3F5"/>' +
      '<rect x="34" y="214" width="200" height="16" rx="8" fill="#9FD3F5"/><rect x="34" y="242" width="130" height="12" rx="6" fill="#1565B0"/>' +
      '<circle cx="320" cy="236" r="40" fill="#00519E"/><path d="M308 214 L338 236 L308 258 Z" fill="#FFFFFF"/></svg>';
  }

  Lab.define({
    key: 'play', day: 13, name: 'Bellatrix Play', zone: 'HUBER_ROOM',
    flow: 'Their own music, like Spotify: they choose and search by themselves. Home shows mixes made from the year of birth (the songs of their youth, favourite singers first) and from what they liked, what they heard last, their artists, moods (calm, dance, nature), today\u2019s hits, the 90s to the 2010s and some styles. Search has a big keyboard and browses by artist, decade and style. A heart keeps a song in My music. Big targets, by touch or by pointing. Bellatrix learns what they enjoy. Needs internet.',
    learn: 'Engagement with personal music, what they choose and search for, what calms each resident, hearts and skips, time listened.',
    art: function () { return playArt(); },
    air: true,
    againQuestion: 'Would you like to listen to your music again another time?',
    content: [
      { hide: true, type: 'heading', label: 'Year of birth, favourite music and music to avoid come from the patient’s life story (Activities, 1 Patient).' },
      /* 1.16 (brief J): the life story is an optional layer. Off: Play learns from listening and
         hearts only (with the music consent). Music to avoid is always left out. */
      { id: 'life', hide: true, label: 'Use the life story for the music', type: 'select', value: 'off', options: [['off', 'No: listening and favourites only'], ['on', 'Yes: year of birth and favourite music too']] },
      { id: 'links', hide: true, label: 'Videos from the family or the team (one per line: title | YouTube link)', type: 'text', rows: 3, value: '',
        note: 'Only with the agreement of the people in the video. For example: Leo’s first steps | https://youtu.be/…' },
      { id: 'minutes', hide: true, label: 'Stop after (minutes)', type: 'number', min: 5, max: 90, value: '30' },
      { id: 'lrclib', hide: true, label: 'Community lyrics (LRCLIB)', type: 'select', value: 'on', options: [['on', 'On: lyrics from lrclib.net (only the artist, title and length are sent)'], ['off', 'Off']] }
    ],
    start: function (L) {
      var T = L.t, lang = L.lang(), patient = Lab.patient || 'P1';
      var stageEl = document.getElementById('stage'), screenEl = document.getElementById('screen'), appEl = document.getElementById('app');
      /* The life story (Care Team, patient card) is the one place for the year of birth and the music. */
      var lifeAll = Lab.opt.life || {}, lifeOn = String(L.text('life') || 'off') === 'on';
      var life = lifeOn ? lifeAll : {};
      var born = Math.max(1915, Math.min(1990, parseInt(life.born, 10) || 1945)), from = born + 10, to = born + 30;
      var limit = Math.max(5, Math.min(90, parseInt(L.text('minutes'), 10) || 30)) * 60000;
      function words(text) { return String(text || '').toLowerCase().split(/[,;\n]+/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 1; }); }
      var loves = words(life.loves), avoid = words(lifeAll.avoid);
      var lovesN = loves.map(norm).filter(Boolean);
      /* 1.15.1, "why only old songs?": the songs of their youth come first only when the life story
         asks for it (a year of birth or favourite music is filled in); otherwise every era is mixed. */
      var lifeAsks = !!parseInt(life.born, 10) || loves.length > 0;
      function hay(it) { return (it.artist + ' ' + it.title + ' ' + (it.tags || []).join(' ') + ' ' + it.kind + ' ' + (it.genre || '') + ' ' + (it.channel || '')).toLowerCase(); }
      function matches(it, list) { var h = hay(it), n = norm(h); return list.some(function (w) { return h.indexOf(w) >= 0 || n.indexOf(norm(w)) >= 0; }); }
      var mine = getTaste()[patient] || {};
      /* Read again before writing: the Care Team app may have changed another patient meanwhile. */
      function saveMine() { var t = getTaste(); t[patient] = mine; saveTaste(t); }
      /* The recommendation engine and this resident's music consent (Care Team, Music tab). */
      var REC = null;
      try { REC = window.Reco && Reco.shared ? Reco.shared() : null; } catch (e) { REC = null; }
      var RS = REC ? REC.songs : null, consentOn = !!(REC && REC.isOn(patient));
      var zone = String(Lab.opt.zone || ''), ctxMode = zone === 'COMMUNITY_CIRCLE' ? 'group' : 'solo';
      /* Who acted last (the engine weighs staff actions differently), who chose the current list,
         and the listening of this session when there is no consent (kept in memory only). */
      var srcNow = 'resident', queueBy = 'resident', curBy = 'resident', profCache = null, sessionPlayed = {}, sess = {};
      function sv(t) { return consentOn ? (t.s || 0) : (t.h === 1 ? 2 : 0); }
      var seenId = {};
      /* Each song once, even if the catalogue lists it twice. */
      var all = items().map(clean).filter(function (it) { if (!it || seenId[it.id] || matches(it, avoid)) return false; seenId[it.id] = 1; return true; });
      var family = L.lines('links').map(function (line) {
        var p = line.split('|'), id = ytId(p.length > 1 ? p[1] : p[0]);
        return id ? { id: id, title: (p.length > 1 ? p[0] : '').trim() || T('A video from your family'), artist: '', year: 0, lang: '', kind: 'video', tags: ['family'], custom: true } : null;
      }).filter(Boolean);
      var known = {};
      all.concat(family).forEach(function (it) { known[it.id] = it; });
      /* One random number per song and session: the order stays the same while they browse. */
      var rnd = {};
      function rank(k) { if (rnd[k] === undefined) rnd[k] = Math.random(); return rnd[k]; }
      if (parseInt(life.born, 10)) L.stat('playBorn', born);
      /* Lists of Home, kept until something changes (a heart, a play, an event, Premium): with about
         1,000 songs they are not computed again on every tap. */
      var dataVer = 0, MEMO = {}, memoVer = '';
      function memo(key, fn) {
        var v = dataVer + (premium() ? 'p' : '');
        if (memoVer !== v) { MEMO = {}; memoVer = v; }
        if (!Object.prototype.hasOwnProperty.call(MEMO, key)) MEMO[key] = fn();
        return MEMO[key];
      }

      /* ---------- what they like ---------- */
      function score(it) { var t = mine[it.id]; return (t ? sv(t) : 0) + (matches(it, loves) ? 3 : 0); }
      function blocked(it) { var t = mine[it.id]; return !!t && (t.s || 0) <= -3; }
      function playable(it) { return !blocked(it); }
      /* A heart (h), or for hearts given before version 1.13 a score of 2 or more. */
      function isLiked(it) { var t = it && mine[it.id]; return !!t && (t.h === 1 || (t.h === undefined && (t.s || 0) >= 2)); }
      function ordered(list, bonus) {
        return list.filter(playable).map(function (it) { return { it: it, k: score(it) + (bonus ? bonus(it) : 0) + rank(it.id) }; })
          .sort(function (a, b) { return b.k - a.k; }).map(function (x) { return x.it; });
      }
      function langFirst(it) { return it.lang === lang ? 100 : it.lang === 'en' ? 50 : 0; }
      function who(it) { return (it.artist ? it.artist + ' – ' : '') + it.title; }
      function remember(it, delta, how) {
        if (!it) return;
        /* Without the music consent only the hearts are kept (the resident's own list); what was
           played stays in this session's memory for "Recently played", and is never written. */
        if (!consentOn && how !== 'like' && how !== 'unlike') {
          var x = sess[it.id] = sess[it.id] || { n: 0 };
          if (how === 'play') x.n++;
          x.last = new Date().toISOString();
          return;
        }
        dataVer++;
        var t = mine[it.id] = mine[it.id] || { s: 0, n: 0 };
        t.s = Math.max(-6, Math.min(12, (t.s || 0) + delta));
        if (how === 'play') t.n = (t.n || 0) + 1;
        if (how === 'like') t.h = 1;
        if (how === 'unlike') t.h = 0;
        t.t = it.title; t.a = it.artist || ''; t.k = it.kind; t.last = new Date().toISOString();
        saveMine();
      }

      /* ---------- the lists ---------- */
      function isSong(it) { return it.kind === 'song'; }
      function inYears(it, pad) { return it.year >= from - pad && it.year <= to + pad; }
      function own(pad) { return all.filter(function (it) { return isSong(it) && it.lang === lang && inYears(it, pad); }); }
      /* The songs of their youth (age 10 to 30) in their language, about one international hit in four. */
      function youth() {
        var o = own(3);
        if (o.length < 8) o = own(12);
        var a = ordered(o);
        var w = lang === 'en' ? [] : ordered(all.filter(function (it) { return isSong(it) && it.lang === 'en' && inYears(it, 5); }));
        w = w.slice(0, Math.max(2, Math.round(a.length / 3)));
        var out = [], j = 0;
        a.forEach(function (it, i) { out.push(it); if (i % 3 === 2 && j < w.length) out.push(w[j++]); });
        while (j < w.length) out.push(w[j++]);
        return out;
      }
      function tagged(tag, kinds) {
        return all.filter(function (it) { return (it.tags || []).indexOf(tag) >= 0 && kinds.indexOf(it.kind) >= 0 && (it.kind !== 'song' || !it.lang || it.lang === lang || it.lang === 'en'); });
      }
      function calmList() { return ordered(tagged('calm', ['song', 'music'])); }
      function danceList() { return ordered(tagged('dance', ['song', 'music']), function (it) { return it.lang === lang ? 1 : 0; }); }
      function natureList() { return ordered(all.filter(function (it) { return it.kind === 'video' && ((it.tags || []).indexOf('nature') >= 0 || (it.tags || []).indexOf('animals') >= 0); })); }
      /* What was played: the stored taste with consent, this session's memory without. */
      function played() { return consentOn ? mine : sess; }
      function recent() {
        var m = played();
        return Object.keys(m).filter(function (id) { return known[id] && m[id].last && playable(known[id]) && (m[id].n || 0) > 0; })
          .sort(function (a, b) { return m[a].last < m[b].last ? 1 : -1; }).slice(0, 12).map(function (id) { return known[id]; });
      }
      function likedList() {
        return all.concat(family).filter(function (it) { return isLiked(it) && playable(it); })
          .sort(function (a, b) { return (mine[a.id].last || '') < (mine[b.id].last || '') ? 1 : -1; });
      }
      function decadeList(d) { return ordered(all.filter(function (it) { return it.kind !== 'video' && it.year >= d && it.year <= d + 9; }), langFirst); }
      /* 1950s / Ann\u00e9es 50 / 50er, and from 2000: 2000s / Ann\u00e9es 2000 / 2000er. */
      function decadeName(d) { return T('{y}s', { y: d, yy: d >= 2000 ? String(d) : String(d).slice(2) }); }
      function decadeSongs(d) { return ordered(all.filter(function (it) { return isSong(it) && it.year >= d && it.year <= d + 9 && it.genre !== 'kids'; }), langFirst); }
      /* "More like this": the songs nearest to this one (js/reco.js, cosine of the song vectors). */
      function radio(seed, k) {
        if (!RS || !seed || !RS.byId[seed.id]) return [];
        return toItems(Reco.similar({ songs: RS, seed: seed.id, exclude: exSet(), k: k || 30, premium: premium() }));
      }
      function genreOf(it) {
        if (it.genre) return it.genre;
        if (it.kind === 'video') return 'nature';
        if (it.kind === 'music') return (it.tags || []).indexOf('dance') >= 0 ? 'dance' : 'classical';
        return it.lang === 'fr' ? 'chanson' : it.lang === 'de' ? 'schlager' : it.lang === 'es' ? 'latin' : 'pop';
      }
      function genreName(g) { return GENRES[g] ? T(GENRES[g]) : g.charAt(0).toUpperCase() + g.slice(1).replace(/[-_]+/g, ' '); }
      function genres() {
        var n = {};
        all.forEach(function (it) { var g = genreOf(it); if (!g || !playable(it)) return; n[g] = (n[g] || 0) + (it.lang === lang || !it.lang ? 3 : 1); });
        return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a < b ? -1 : 1); });
      }
      function genreList(g) { return ordered(all.filter(function (it) { return genreOf(it) === g; }), langFirst); }

      /* Artists: everyone with songs or music in the catalogue (films are not artists). */
      var ARTISTS = {};
      all.forEach(function (it) {
        if (it.kind === 'video' || !it.artist) return;
        var a = ARTISTS[it.artist] = ARTISTS[it.artist] || { name: it.artist, items: [], lang: '' };
        a.items.push(it);
        if (it.lang && !a.lang) a.lang = it.lang;
      });
      function artists() { return Object.keys(ARTISTS).map(function (k) { return ARTISTS[k]; }).filter(function (a) { return a.items.some(playable); }); }
      function loved(a) { var n = norm(a.name); return lovesN.some(function (w) { return n.indexOf(w) >= 0; }); }
      function taste(a) { var s = 0; a.items.forEach(function (it) { var t = mine[it.id]; if (t) s += Math.max(0, sv(t)); }); return s; }
      function artistPic(a) { var l = ordered(a.items); return (l[0] || a.items[0]).id; }
      function byArtist(list) {
        return list.map(function (a) { return { a: a, k: (loved(a) ? 1000 : 0) + taste(a) * 10 + (a.lang === lang ? 4 : a.lang === 'en' ? 2 : 0) + rank('a:' + a.name) }; })
          .sort(function (x, y) { return y.k - x.k; }).map(function (x) { return x.a; });
      }
      function yourArtists() {
        return byArtist(artists().filter(function (a) { return loved(a) || taste(a) > 0 || (a.lang === lang && a.items.some(function (it) { return isSong(it) && inYears(it, 5); })); }));
      }
      function favArtists() {
        var f = artists().filter(function (a) { return loved(a) || taste(a) >= 2 || a.items.some(isLiked); });
        return byArtist(f.length ? f : yourArtists().slice(0, 6));
      }
      function allArtists() {
        return artists().map(function (a) { return { a: a, k: (loved(a) ? 1000 : 0) + (a.lang === lang ? 100 : a.lang === 'en' ? 50 : 0) }; })
          .sort(function (x, y) { return y.k - x.k || (norm(x.a.name) < norm(y.a.name) ? -1 : 1); }).map(function (x) { return x.a; });
      }
      function names(list) {
        var seen = {}, out = [];
        list.forEach(function (it) { if (it.artist && !seen[it.artist] && out.length < 3) { seen[it.artist] = 1; out.push(it.artist); } });
        return out.join(', ');
      }
      function artistMix(a) {
        var mix = ordered(a.items).concat(radio(a.items[0]).filter(function (it) { return it.artist !== a.name && isSong(it); }).slice(0, 12));
        return mix.length >= 2 ? { key: 'mix-' + a.name, title: T('{artist} mix', { artist: a.name }), list: mix, pic: artistPic(a), tone: tone(a.name) } : null;
      }
      /* Songs they liked (a heart, or listened to again and again) from after their youth: then
         "For you" also brings the newer music they enjoy. */
      function likedLater() {
        return all.filter(function (it) { var t = mine[it.id]; return t && (isLiked(it) || sv(t) >= 2) && it.year > to + 4 && playable(it); });
      }
      /* "For you": the mixes of their favourite singers first, then of the newer artists and decades
         they liked, the songs of their youth, the decades of their youth, and for speakers of other
         languages the international hits. */
      function mixes() {
        var out = [], later = likedLater(), decs = {};
        byArtist(artists().filter(loved)).forEach(function (a) { var m = artistMix(a); if (m) out.push(m); });
        byArtist(artists().filter(function (a) { return !loved(a) && a.items.some(function (it) { return later.indexOf(it) >= 0; }); })).slice(0, 3)
          .forEach(function (a) { var m = artistMix(a); if (m) out.push(m); });
        later.forEach(function (it) { decs[Math.floor(it.year / 10) * 10] = 1; });
        Object.keys(decs).map(Number).sort(function (a, b) { return b - a; }).forEach(function (d) {
          var dl = decadeSongs(d);
          var lead = later.filter(function (it) { return it.year >= d && it.year <= d + 9; })[0] || dl[0];
          if (dl.length >= 3) out.push({ key: 'decade-' + d, title: decadeName(d), list: dl, pic: lead.id, tone: TONES[Math.round(d / 10) % TONES.length] });
        });
        var y = youth();
        if (y.length) out.push({ key: 'youth', title: T('Your youth'), sub: from + '\u2013' + to, list: y, tone: TONES[0] });
        for (var d = Math.floor(from / 10) * 10; d <= to; d += 10) {
          if (decs[d]) continue;
          var dl = ordered(all.filter(function (it) { return isSong(it) && (it.lang === lang || it.lang === 'en') && it.year >= d && it.year <= d + 9; }), function (it) { return it.lang === lang ? 2 : 0; });
          if (dl.length >= 3) out.push({ key: 'decade-' + d, title: decadeName(d), list: dl, tone: TONES[Math.round(d / 10) % TONES.length] });
        }
        if (lang !== 'en') {
          var w = ordered(all.filter(function (it) { return isSong(it) && it.lang === 'en' && inYears(it, 8); }));
          if (w.length >= 3) out.push({ key: 'world', title: T('International hits'), list: w, tone: TONES[2] });
        }
        return out;
      }
      /* After the personal rows: today's hits, the 90s to the 2010s and a few styles (the ones they
         liked first), each only with enough songs to fill a row. */
      function laterRows() {
        var rows = [], liked = {}, n = 0;
        var hits = ordered(all.filter(function (it) { return isSong(it) && it.year >= 2015; }), langFirst).slice(0, 20);
        if (hits.length >= 4) rows.push({ key: 'hits', title: T('Hits of the moment'), list: hits });
        [1990, 2000, 2010].forEach(function (d) { var l = decadeSongs(d).slice(0, 20); if (l.length >= 4) rows.push({ key: 'd' + d, title: decadeName(d), list: l }); });
        all.forEach(function (it) { var t = mine[it.id]; if (t && sv(t) > 0) liked[genreOf(it)] = (liked[genreOf(it)] || 0) + sv(t); });
        genres().filter(function (g) { return g !== 'nature'; }).map(function (g, i) { return { g: g, k: (liked[g] || 0) * 100 - i }; })
          .sort(function (a, b) { return b.k - a.k; }).forEach(function (x) {
            if (n >= 3) return;
            var l = genreList(x.g).slice(0, 20);
            if (l.length >= 4) { rows.push({ key: 'g-' + x.g, title: genreName(x.g), list: l }); n++; }
          });
        return rows;
      }
      function moods() {
        return [
          { key: 'calm', title: T('Calm'), list: calmList(), tone: TONES[2] },
          { key: 'dance', title: T('Dance'), list: danceList(), tone: TONES[3] },
          { key: 'nature', title: T('Nature'), list: natureList(), tone: TONES[1] }
        ].filter(function (m) { return m.list.length; });
      }
      function search(q) {
        q = norm(q);
        if (!q) return { artists: [], songs: [] };
        function m(s) { s = norm(s); if (!s) return 0; if (s.indexOf(q) === 0) return 4; if ((' ' + s).indexOf(' ' + q) >= 0) return 3; return s.indexOf(q) >= 0 ? 1 : 0; }
        var arts = artists().map(function (a) { return { a: a, k: m(a.name) }; }).filter(function (x) { return x.k > 0; })
          .sort(function (x, y) { return y.k - x.k || (loved(y.a) ? 1 : 0) - (loved(x.a) ? 1 : 0) || (y.a.lang === lang ? 1 : 0) - (x.a.lang === lang ? 1 : 0); })
          .slice(0, 6).map(function (x) { return x.a; });
        var songs = all.concat(family).filter(playable).map(function (it) { return { it: it, k: Math.max(m(it.title), m(it.artist)) }; })
          .filter(function (x) { return x.k > 0; })
          .sort(function (x, y) { return y.k - x.k || langFirst(y.it) - langFirst(x.it) || score(y.it) - score(x.it); })
          .slice(0, 40).map(function (x) { return x.it; });
        return { artists: arts, songs: songs };
      }

      /* ---------- the player ---------- */
      var ytp = null, ytReady = false, box = null, wantId = null, lastPlace = '', token = {};
      var cur = null, queue = [], qi = 0, queueKey = '';
      var intent = false, started = false, since = 0, playedMs = 0, listened = 0, failures = 0, loadedAt = 0;
      var helpPaused = false, gone = false, ending = false;
      /* 1.16, free and Premium (PlayRules): this session's skips, the resident's shuffle choice
         (Premium), the "Bellatrix message" between songs, a short note at the bottom (toast). */
      var skipTimes = [], shufflePref = false, queueSrc = [], songsSinceAd = 0, adRound = Math.floor(Date.now() / 86400000), adNow = null, adTimer = null, lastTouch = Date.now(), toast = null;
      /* Podcasts (js/podcasts.js): mode 'song' (YouTube) or 'pod' (an <audio> element). */
      var mode = 'song', pod = null, au = null, podIntent = false, podStarted = false, podSince = 0, podMs = 0, podHeard = 0, podHelp = false, podSeek = 0, sessPod = {};
      /* Listening together (Premium Play, contract 3). */
      var tog = null;
      var base = Math.round(Math.max(0.1, Math.min(1, Lab.opt.volume || 0.8)) * 100), vol = base;
      function mins(ms) { return Math.round(ms / 6000) / 10; }
      function running() { return since ? Date.now() - since : 0; }
      function clock() { if (since) { playedMs += Date.now() - since; songMs += Date.now() - since; since = 0; } }
      /* 1.16, the family portal's listening detail (BF-06, js/family-sync.js): one call when a song
         or an episode ends or stops. FamilySync never sends in a demo or a preview; Play calls it
         only with the music consent, like everything about the listening, never for family videos. */
      var songMs = 0, songStart = '', podStart = '';
      function famListen(type, it, ms, start) {
        if (!window.FamilySync || !FamilySync.listen || !it || it.custom || !consentOn || !(ms >= 5000)) return;
        var rec = Lab._t && Lab._t.state && Lab._t.state.rec;
        try {
          FamilySync.listen({ type: type, code: patient, preview: !!(rec && rec.preview), title: String(it.title || ''), start: start || new Date(Date.now() - ms).toISOString(), durationS: Math.round(ms / 1000),
            artist: type === 'podcast' ? ((window.Podcasts && Podcasts.show(it.show)) || {}).title || '' : String(it.artist || '') });
        } catch (e) { /* only a report */ }
      }
      function famSong() { if (cur && songMs) famListen('music', cur, songMs, songStart); songMs = 0; songStart = ''; }
      function ytCall(fn, a, b) {
        if (!ytp || !ytReady || typeof ytp[fn] !== 'function') return undefined;
        try { return ytp[fn](a, b); } catch (e) { return undefined; }
      }
      function ytNum(fn) { var v = ytCall(fn); return typeof v === 'number' && isFinite(v) ? v : 0; }
      function ensureBox() {
        if (box && box.parentNode) return box;
        Array.prototype.forEach.call(document.querySelectorAll('.bp-yt'), function (b) { b.parentNode.removeChild(b); });
        box = document.createElement('div');
        box.className = 'bp-yt hide';
        box.setAttribute('aria-hidden', 'true');
        box.innerHTML = '<div id="bp-ytp"></div>';
        (stageEl || document.body).appendChild(box);
        lastPlace = 'hide';
        return box;
      }
      function makePlayer(YT, id) {
        ensureBox();
        ytReady = false;
        var me = ytp = new YT.Player('bp-ytp', {
          host: 'https://www.youtube-nocookie.com', videoId: id, width: '100%', height: '100%',
          playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1, modestbranding: 1, cc_load_policy: 0, hl: lang },
          events: {
            onReady: function () {
              if (ytp !== me || gone) return;
              ytReady = true;
              try { me.unMute(); me.setVolume(ducking ? Math.round(vol * 0.25) : vol); } catch (e) { /* not ready after all */ }
              if (wantId && wantId !== id) { try { me.loadVideoById(wantId); } catch (e) { /* retried on the next song */ } }
              else if (intent) { try { me.playVideo(); } catch (e) { /* autoplay may need a tap */ } }
            },
            onStateChange: function (e) { if (ytp === me && !gone) onState(e.data); },
            /* A video that cannot play here is skipped; three in a row means something is wrong
               (no internet, blocked videos): stop instead of running through the list. */
            onError: function (e) {
              if (ytp !== me || gone || !cur) return;
              L.log('Video ' + cur.id + ' (' + cur.title + ') could not play here, code ' + e.data, 'error');
              L.stat('playErrors');
              failures++;
              if (failures >= 3) problem(); else next('error');
            }
          }
        });
      }
      function onState(s) {
        if (s === 1) {
          if (!since) since = Date.now();
          failures = 0; intent = true;
          if (!started) { started = true; songStart = new Date().toISOString(); remember(cur, 0, 'play'); if (!captionsWanted) { try { ytp.unloadModule('captions'); ytp.unloadModule('cc'); } catch (e) { /* no captions */ } } }
        } else clock();
        if (s === 2) intent = helpPaused;
        if (s === 0) {
          if (adNow) return;
          intent = false;
          if (cur) { remember(cur, 1, 'end'); emit('complete', cur, 1, curBy); L.stat('playEnded'); songsSinceAd++; }
          next('ended');
          return;
        }
        paint(); place();
      }
      function load(it) {
        if (!it || gone) return;
        if (mode === 'pod') podLeave();
        mode = 'song';
        endAdQuiet();
        if (tog && tog.pend && tog.pend[it.id]) { tog.took.push(tog.pend[it.id]); delete tog.pend[it.id]; }
        clock(); famSong(); listened += playedMs; playedMs = 0;
        cur = it; started = false; intent = true; wantId = it.id; loadedAt = Date.now(); captionsWanted = false; lyIdx = -1;
        curBy = queueBy; sessionPlayed[it.id] = 1; nextOpen = false; nextList = null; nextFor = null;
        L.stat('playItems');
        L.stat('playMinutes', mins(listened));
        L.log('Bellatrix Play: ' + who(it) + (it.year ? ' (' + it.year + ')' : ''), 'result');
        if (djOn && djVoice && queueKey === 'dj') djLine(it);
        youtube().then(function (YT) {
          if (gone || cur !== it) return;
          if (!ytp) makePlayer(YT, it.id);
          else if (ytReady) { try { ytp.loadVideoById(it.id); ytp.setVolume(ducking ? Math.round(vol * 0.25) : vol); } catch (e) { /* the next tap tries again */ } }
        }, function () { offline(); });
      }
      /* pick: the resident chose this very song (a card or a row), not a whole list. */
      function playFrom(list, i, key, pick) {
        if (!list.length) return;
        if (locked(list[Math.max(0, Math.min(i, list.length - 1))])) { openPanel('premium'); return; }
        if (pick) replayCheck(list[Math.max(0, Math.min(i, list.length - 1))]);
        queueBy = srcNow;
        if (key !== 'dj') djOn = false;
        queue = list.slice(); qi = Math.max(0, Math.min(i, queue.length - 1)); queueKey = key || '';
        queueSrc = list.slice();
        /* Free: rows and lists start in shuffle (the song they touched first); Premium: their choice. */
        if (PlayRules.shuffles(key, premium(), shufflePref) && queue.length > 1) { queue = PlayRules.shuffle(queue, pick ? qi : -1, key + '|' + Date.now()); qi = 0; }
        if (!(cur && cur.id === queue[qi].id && ytReady)) load(queue[qi]);
        else if (!intent) togglePlay();
        rebuild();
      }
      /* The resident's skips (Next, a song of the queue, a next-song card): six an hour when free.
         "Not this song", the pause and the care team ("Staff is tapping") are never limited. */
      function skipOk() {
        var c = PlayRules.canSkip(skipTimes, Date.now(), premium(), srcNow === 'staff');
        if (!c.ok) { L.stat('playSkipLimit'); showToast(T('No more skips for now. More in {n} min.', { n: c.waitMin })); }
        return c.ok;
      }
      function noteSkip() { if (srcNow !== 'staff' && !premium()) skipTimes.push(Date.now()); }
      function next(why) {
        if (!cur || gone) return;
        if (why === 'skip' || why === 'pick') { if (!skipOk()) return; noteSkip(); }
        /* At the natural end of a song, now and then (free): one short "Bellatrix message". */
        if (why === 'ended' && PlayRules.adDue({ premium: premium(), why: why, since: songsSinceAd, touchedAgo: Date.now() - lastTouch, panel: !!panel, sheet: nextOpen,
          keyboard: view.name === 'search' || view.name === 'ai', dj: queueKey === 'dj', staff: queueBy === 'staff', group: ctxMode === 'group', together: !!tog, podcast: mode === 'pod' })) { showAd(); return; }
        clock();
        if (why === 'stop') { emit('stop', cur, ratioNow()); remember(cur, -2, 'stop'); }
        else if (why === 'skip' || why === 'pick') {
          emit('skip', cur, ratioNow());
          if (why === 'skip' && started && playedMs < 20000) { remember(cur, -1, 'skip'); L.stat('playDislikes'); L.push('playSkipped', who(cur)); }
        }
        /* 1.16: the care team's "Stop after" is a care setting, for everyone (not a Premium matter). */
        if (listened + playedMs + podMs >= limit) { enough(); return; }
        if (qi + 1 >= queue.length) extendQueue();
        if (qi + 1 < queue.length) { qi++; load(queue[qi]); }
        else { intent = false; ytCall('stopVideo'); }
        rebuild();
      }
      /* At the end of a list: the next-song proposals (the most similar first), more like the last
         song, then the songs of their youth. */
      function extendQueue() {
        if (!cur) return;
        if (queueKey === 'dj' && djOn) { queue = queue.concat(djBatch(6)); return; }
        var seen = {};
        queue.forEach(function (it) { seen[it.id] = 1; });
        if (queueKey === 'radio' || queueKey === 'ai') { queue = queue.concat(nearTo(queue.slice(-3), seen, 10)); return; }
        var more = proposals().map(function (x) { return x.it; }).filter(function (it) { return !seen[it.id]; });
        more.forEach(function (it) { seen[it.id] = 1; });
        more = more.concat(radio(cur).filter(function (it) { return !seen[it.id]; }));
        if (more.length < 3) more = more.concat(youth().filter(function (it) { return !seen[it.id]; }));
        queue = queue.concat(more.slice(0, 15));
      }
      function prev() {
        if (!cur) return;
        if (ytNum('getCurrentTime') > 8 || qi === 0) { emit('replay', cur, ratioNow()); ytCall('seekTo', 0, true); ytCall('playVideo'); return; }
        qi--; load(queue[qi]); rebuild();
      }
      function togglePlay() {
        if (mode === 'pod') { podLeave(); mode = 'song'; intent = false; }
        if (!cur) return;
        if (!ytp || !ytReady) { intent = true; load(cur); paint(); return; }
        var s = ytNum('getPlayerState');
        if (intent && (s === 1 || s === 3)) { intent = false; ytCall('pauseVideo'); }
        else { intent = true; ytCall('playVideo'); }
        paint();
      }
      function setVol(v) {
        vol = Math.max(10, Math.min(100, v));
        ytCall('setVolume', vol);
        if (au) { try { au.volume = vol / 100; } catch (e) { /* not ready */ } }
        Array.prototype.forEach.call(screenEl.querySelectorAll('.bp-vol > i'), function (el) { el.style.width = vol + '%'; });
      }
      function heart(it) {
        if (!it) return;
        if (isLiked(it)) {
          remember(it, -2, 'unlike');
          if (REC && consentOn) { REC.unlike(patient, it.id); profCache = null; }
        } else { remember(it, 2, 'like'); emit('like', it, isCur(it) ? ratioNow() : 1); L.stat('playLikes'); L.push('playLiked', who(it)); }
        rebuild();
      }
      /* "Not this song": the resident stops it; it is left out of the next playlist. */
      function stopSong() {
        if (!cur) return;
        L.stat('playStops'); L.push('playStopped', who(cur));
        L.log('Bellatrix Play: "not this song": ' + who(cur), 'result');
        next('stop');
      }

      /* The box with the YouTube player goes onto the slot of the current view: at least 200 x 200
         screen pixels in the sidebar while the resident browses, big in the clip. It is sized to the
         slot (not scaled), so YouTube's player really has that size. */
      function place() {
        if (!box) return;
        var slot = !gone && L.step() === main && cur ? screenEl.querySelector('[data-slot]') : null;
        if (!slot) { if (lastPlace !== 'hide') { box.className = 'bp-yt hide'; lastPlace = 'hide'; } return; }
        var sr = stageEl.getBoundingClientRect(), s = sr.width / (Lab.stageW() || 1920), r = slot.getBoundingClientRect();
        if (!s || !r.width) return;
        var x = (r.left - sr.left) / s, y = (r.top - sr.top) / s, w = r.width / s, h = r.height / s;
        var mode = slot.getAttribute('data-slot');
        var key = mode + [x, y, w, h].map(Math.round).join(',') + (started ? '+' : '-');
        if (key === lastPlace) return;
        var first = lastPlace === 'hide' || lastPlace === '';
        lastPlace = key;
        box.className = 'bp-yt bp-yt-' + mode + (started ? ' on' : '') + (first ? ' still' : '');
        box.style.transform = '';
        box.style.left = x.toFixed(1) + 'px'; box.style.top = y.toFixed(1) + 'px';
        box.style.width = w.toFixed(1) + 'px'; box.style.height = h.toFixed(1) + 'px';
        if (first) { void box.offsetWidth; box.classList.remove('still'); }
      }
      function playingNow() { return mode === 'pod' ? podIntent : intent; }
      function paint() {
        var root = screenEl.querySelector('.bp');
        if (root) root.classList.toggle('is-playing', playingNow());
      }
      function paintProgress() {
        if (mode === 'pod' ? !pod : !cur) return;
        var d = mode === 'pod' ? podDur() : ytNum('getDuration'), t = mode === 'pod' ? podTime() : ytNum('getCurrentTime'), on = mode === 'pod' ? podStarted : started;
        var p = d > 0 && on ? Math.max(0, Math.min(1, t / d)) : 0;
        function fmt(x) { x = Math.max(0, Math.floor(x || 0)); return Math.floor(x / 60) + ':' + (x % 60 < 10 ? '0' : '') + (x % 60); }
        Array.prototype.forEach.call(screenEl.querySelectorAll('.bp-prog > i'), function (el) { el.style.width = (p * 100).toFixed(2) + '%'; });
        Array.prototype.forEach.call(screenEl.querySelectorAll('.bp-t1'), function (el) { el.textContent = fmt(on ? t : 0); });
        Array.prototype.forEach.call(screenEl.querySelectorAll('.bp-t2'), function (el) { el.textContent = fmt(d); });
      }
      function pauseAll() { clock(); intent = false; ytCall('pauseVideo'); podPause(); }
      function themeOn() { if (stageEl) stageEl.classList.add('bp-on'); if (appEl) appEl.classList.add('bp-on'); }
      function teardown() {
        if (gone) return;
        gone = true;
        clock(); famSong(); listened += playedMs; playedMs = 0;
        L.stat('playMinutes', mins(listened));
        if (ytp) { try { ytp.destroy(); } catch (e) { /* already gone */ } ytp = null; }
        podLeave(true);
        if (au) { try { au.pause(); au.removeAttribute('src'); au.load(); } catch (e) { /* gone */ } au = null; }
        togetherStop(true);
        if (adTimer) { clearTimeout(adTimer); adTimer = null; }
        try { window.removeEventListener('bellatrix-play-premium', onPremium); window.removeEventListener('bellatrix-podcasts', onPodcasts); } catch (e) { /* no events */ }
        if (box && box.parentNode) box.parentNode.removeChild(box);
        box = null;
        screenEl.removeEventListener('scroll', onScroll, true);
        if (stageEl) stageEl.classList.remove('bp-on');
        if (appEl) appEl.classList.remove('bp-on');
        if (Lab._play && Lab._play.owner === token) delete Lab._play;
      }
      function finishPlay() { teardown(); L.finish(); }
      /* After the engine has shown the next step: still Bellatrix Play, or the end of it? */
      function checkLeave() { setTimeout(function () { var s = L.step(); if (!s || !s._play) teardown(); }, 0); }

      /* ---------- Premium: no payment here, only a request to the care team ---------- */
      /* Premium is per resident (js/premium.js): only the resident it was paid for has it. */
      /* Premium v3 (js/premium.js, contract 1): per resident AND per product; Play asks for 'play'. */
      var PREQ = 'bellatrix-play-premium-request', requested = false;
      function askedNow() {
        try { if (window.Premium && Premium.asked) return !!Premium.asked(patient, 'play'); } catch (e) { /* the old way below */ }
        try { return (JSON.parse(localStorage.getItem(PREQ) || 'null') || {}).patient === patient; } catch (e) { return false; }
      }
      requested = askedNow();
      function premium() { try { return !!(window.Premium && Premium.isOn(patient, 'play')); } catch (e) { return false; } }
      function askTeam() {
        var done = false;
        try { if (window.Premium && Premium.ask) { Premium.ask(patient, 'play'); done = true; } } catch (e) { done = false; }
        if (!done) { try { localStorage.setItem(PREQ, JSON.stringify({ patient: patient, at: new Date().toISOString() })); } catch (e) { /* the team can still be told */ } }
        requested = true;
        L.log('Bellatrix Play: Premium asked for, the care team is told', 'result');
        rebuild();
      }

      /* ---------- Lyrics ----------
         1. The words of traditional songs (public domain), spread evenly over the song.
         2. LRCLIB, free community lyrics, when the care team leaves it on (Personalise): only the
            artist, the title and the duration are sent, never anything about the resident.
         3. The video's own captions, shown in the big clip.
         4. Otherwise one short line. */
      var LYR = {}, lyIdx = -1, captionsWanted = false;
      var lrclibOn = String(L.text('lrclib') || 'on') !== 'off';
      var BUILTIN = [
        { m: ['twinkle', 'ah vous dirai je'], l: { en: ['Twinkle, twinkle, little star,', 'How I wonder what you are!', 'Up above the world so high,', 'Like a diamond in the sky.', 'Twinkle, twinkle, little star,', 'How I wonder what you are!'],
          fr: ['Ah ! vous dirai-je, maman,', 'Ce qui cause mon tourment ?', 'Papa veut que je raisonne', 'Comme une grande personne.', 'Moi, je dis que les bonbons', 'Valent mieux que la raison.'] } },
        { m: ['frere jacques', 'bruder jakob', 'are you sleeping'], l: {
          fr: ['Frère Jacques, Frère Jacques,', 'Dormez-vous ? Dormez-vous ?', 'Sonnez les matines, sonnez les matines,', 'Ding, dang, dong. Ding, dang, dong.'],
          de: ['Bruder Jakob, Bruder Jakob,', 'Schläfst du noch? Schläfst du noch?', 'Hörst du nicht die Glocken? Hörst du nicht die Glocken?', 'Ding, dang, dong. Ding, dang, dong.'],
          en: ['Are you sleeping, are you sleeping,', 'Brother John, Brother John?', 'Morning bells are ringing, morning bells are ringing,', 'Ding, dang, dong. Ding, dang, dong.'] } },
        { m: ['mary had a little lamb'], l: { en: ['Mary had a little lamb,', 'Little lamb, little lamb,', 'Mary had a little lamb,', 'Its fleece was white as snow.'] } },
        { m: ['row row row your boat'], l: { en: ['Row, row, row your boat', 'Gently down the stream.', 'Merrily, merrily, merrily, merrily,', 'Life is but a dream.'] } },
        { m: ['london bridge'], l: { en: ['London Bridge is falling down,', 'Falling down, falling down,', 'London Bridge is falling down,', 'My fair lady.'] } },
        { m: ['old macdonald'], l: { en: ['Old MacDonald had a farm,', 'E-I-E-I-O!', 'And on that farm he had a cow,', 'E-I-E-I-O!'] } },
        { m: ['jingle bells'], l: { en: ['Jingle bells, jingle bells,', 'Jingle all the way!', 'Oh, what fun it is to ride', 'In a one-horse open sleigh!'] } },
        { m: ['freude schoner gotterfunken', 'ode an die freude', 'ode to joy'], l: { de: ['Freude, schöner Götterfunken,', 'Tochter aus Elysium,', 'Wir betreten feuertrunken,', 'Himmlische, dein Heiligtum!'] } }
      ];
      function builtinLyrics(it) {
        var n = norm(it.title);
        for (var i = 0; i < BUILTIN.length; i++) {
          if (BUILTIN[i].m.some(function (k) { return n.indexOf(k) >= 0; })) { var l = BUILTIN[i].l; return l[it.lang] || l[lang] || l.en || l.de || l.fr; }
        }
        return null;
      }
      function parseLrc(txt) {
        var out = [];
        String(txt || '').split(/\r?\n/).forEach(function (line) {
          var m = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(line.trim());
          if (m && m[3].trim()) out.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), s: m[3].trim() });
        });
        return out;
      }
      /* "La vie en rose (Remastered)" -> "La vie en rose" for the search. */
      function plainTitle(t) { return String(t).replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim(); }
      function fetchLyrics(it) {
        if (!it || LYR[it.id]) return;
        var b = it.kind === 'song' ? builtinLyrics(it) : null;
        if (b) { LYR[it.id] = { state: 'done', even: true, src: 'builtin', lines: b.map(function (s) { return { t: null, s: s }; }) }; return; }
        if (!lrclibOn || it.kind !== 'song' || !it.artist || !window.fetch) { LYR[it.id] = { state: 'done', src: 'none', lines: [] }; return; }
        var e = LYR[it.id] = { state: 'loading', src: 'none', lines: [] }, title = plainTitle(it.title), d = Math.round(ytNum('getDuration'));
        function json(r) { return r && r.ok ? r.json() : null; }
        function done(j) {
          if (j && j.syncedLyrics) { e.lines = parseLrc(j.syncedLyrics); e.synced = e.lines.length > 0; }
          if (!e.lines.length && j && j.plainLyrics) e.lines = String(j.plainLyrics).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { t: null, s: s }; });
          if (e.lines.length) e.src = 'lrclib';
          e.state = 'done';
          L.log('Bellatrix Play: lyrics for ' + who(it) + ': ' + (e.synced ? 'synced (LRCLIB)' : e.lines.length ? 'not synced (LRCLIB)' : 'none'), 'result');
          if (gone || cur !== it || panel !== 'lyrics') return;
          if (e.lines.length) rebuild(); else tryCaptions();
        }
        fetch('https://lrclib.net/api/get?artist_name=' + encodeURIComponent(it.artist) + '&track_name=' + encodeURIComponent(title) + (d ? '&duration=' + d : ''))
          .then(json, function () { return null; })
          .then(function (j) {
            if (j && (j.syncedLyrics || j.plainLyrics)) return j;
            return fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(it.artist + ' ' + title)).then(json).then(function (a) {
              a = a || [];
              return a.filter(function (x) { return x && x.syncedLyrics; })[0] || a.filter(function (x) { return x && x.plainLyrics; })[0] || null;
            });
          })
          .then(done, function () { done(null); });
      }
      /* 1.16: the lyrics are free for everyone. */
      function openLyrics() {
        if (!cur) return;
        fetchLyrics(cur);
        var e = LYR[cur.id];
        lyIdx = -1;
        if (e.state === 'done' && !e.lines.length) { tryCaptions(); return; }
        openPanel('lyrics');
      }
      /* No lyrics: the video's own captions in the big clip, in the resident's language if there are. */
      function tryCaptions() {
        var it = cur, e = it && LYR[it.id];
        if (!e) return;
        function noneLeft() { e.captions = 'none'; openPanel('lyrics'); }
        if (e.captions === 'yes') { openPanel('clip'); return; }
        if (e.captions === 'none' || !ytp || !ytReady) { noneLeft(); return; }
        captionsWanted = true;
        try { ytp.loadModule('captions'); } catch (x) { /* no captions module */ }
        setTimeout(function () {
          if (gone || cur !== it) return;
          var tl = null;
          try { tl = ytp.getOption('captions', 'tracklist'); } catch (x) { tl = null; }
          if (tl && tl.length) {
            var tr = tl.filter(function (t) { return String(t.languageCode || '').indexOf(lang) === 0; })[0] || tl[0];
            try { ytp.setOption('captions', 'track', tr); } catch (x) { /* shown as it is */ }
            e.captions = 'yes';
            L.log('Bellatrix Play: lyrics from the video captions (' + (tr.languageCode || '?') + ')', 'result');
            openPanel('clip');
          } else {
            captionsWanted = false;
            try { ytp.unloadModule('captions'); } catch (x) { /* already off */ }
            noneLeft();
          }
        }, 1500);
      }
      /* The line being sung: highlighted and kept in the middle (synced lyrics, or traditional words
         spread evenly over the song). */
      function syncLyrics() {
        if (gone || panel !== 'lyrics' || !cur) return;
        var e = LYR[cur.id];
        if (!e || !e.lines.length || !(e.synced || e.even)) return;
        var t = ytNum('getCurrentTime'), i = -1, k;
        if (e.synced) { for (k = 0; k < e.lines.length; k++) if (e.lines[k].t <= t + 0.25) i = k; }
        else { var d = ytNum('getDuration'); if (d > 0 && started) i = Math.min(e.lines.length - 1, Math.floor(t / d * e.lines.length)); }
        if (i === lyIdx && screenEl.querySelector('.bp-ly.is-on')) return;
        lyIdx = i;
        Array.prototype.forEach.call(screenEl.querySelectorAll('.bp-ly'), function (p) {
          var n = parseInt(p.getAttribute('data-ly'), 10);
          p.classList.toggle('is-on', n === i);
          p.classList.toggle('is-past', n < i);
        });
        var on = screenEl.querySelector('.bp-ly.is-on'), sc = screenEl.querySelector('[data-s="lyr"]');
        if (on && sc) {
          var top = Math.max(0, on.offsetTop - sc.clientHeight / 2 + on.offsetHeight / 2);
          try { sc.scrollTo({ top: top, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (x) { sc.scrollTop = top; }
        }
      }

      /* ---------- Recommendations: js/reco.js (on the robot, nothing leaves it) ----------
         The same song vectors and taste profile give "Your recommendations", the radio ("More
         like this"), the next-song cards, DJ Bellatrix, the AI playlists and the approved weekly
         and monthly playlists. Without the music consent there is no profile: the engine then
         works from the songs themselves and the catalogue's well-known songs, nothing personal. */
      function locked(it) { return !!it.premium && !premium(); }
      function free(it) { return playable(it) && !locked(it); }
      function toItem(s) { return s ? known[s.id] || null : null; }
      function toItems(list) { return list.map(toItem).filter(Boolean); }
      /* What Play may not offer here: music to avoid (life story), refused songs, Premium songs. */
      function exSet(more) {
        var base = memo('ex', function () {
          var e = {}, pr = premium();
          if (RS) RS.list.forEach(function (s) { var it = known[s.id]; if (!it || !playable(it) || (it.premium && !pr)) e[s.id] = 1; });
          return e;
        });
        if (!more) return base;
        var ex = {};
        Object.keys(base).forEach(function (k) { ex[k] = 1; });
        Object.keys(more).forEach(function (k) { ex[k] = 1; });
        return ex;
      }
      function prof() {
        if (!REC || !consentOn) return null;
        if (!profCache) { try { profCache = REC.profile(patient, 'next'); } catch (e) { profCache = null; } }
        return profCache;
      }
      function evs() { return REC && consentOn ? REC.events(patient) : []; }
      /* One listening event for the engine (only with consent; family videos are never sent). */
      function emit(event, it, ratio, src) {
        if (!REC || !consentOn || !it || it.custom || !RS.byId[it.id]) return;
        if (REC.log({ residentId: patient, songId: it.id, event: event, playedRatio: ratio, context: { mode: ctxMode, zone: zone }, source: src || srcNow })) { profCache = null; dataVer++; }
      }
      function ratioNow() { var d = ytNum('getDuration'), t = ytNum('getCurrentTime'); return d > 0 && started ? Math.max(0, Math.min(1, t / d)) : 0; }
      /* Choosing again a song heard before is a voluntary replay. */
      function replayCheck(it) {
        if (!it || !consentOn || (cur && cur.id === it.id)) return;
        var p = prof();
        if (sessionPlayed[it.id] || (p && p.heard[it.id])) emit('replay', it, 0);
      }
      function aiRecommended(k) {
        if (!RS) return [];
        return memo('rec' + k, function () { return toItems(Reco.recommend({ songs: RS, profile: prof(), k: k, exclude: exSet(), events: evs(), lang: lang, residentId: patient, day: new Date().toDateString(), premium: premium() })); });
      }
      function nearTo(list, exclude, k) {
        var ids = RS ? list.filter(function (it) { return RS.byId[it.id]; }).map(function (it) { return it.id; }) : [];
        if (!ids.length) return [];
        return toItems(Reco.similar({ songs: RS, vector: Reco.centroid(RS, ids), exclude: exSet(exclude), k: k, premium: premium() }));
      }
      /* The radio: the songs nearest to this one, without end. */
      function startRadio(it) {
        if (!it) return;
        var list = [it].concat(radio(it, 20));
        L.stat('playRadio');
        L.log('Bellatrix Play: radio (AI) from ' + who(it), 'result');
        djOn = false;
        if (isCur(it)) { queue = list; qi = 0; queueKey = 'radio'; queueBy = srcNow; rebuild(); }
        else playFrom(list, 0, 'radio');
      }
      /* DJ Bellatrix: favourites (their hearts), rediscoveries and new songs in turn, without end. */
      var djOn = false, djVoice = true, djKind = {}, djRound = 0;
      function hearts() { var h = {}; Object.keys(mine).forEach(function (id) { if (known[id] && isLiked(known[id])) h[id] = 1; }); return h; }
      function djBatch(n) {
        if (!RS) return [];
        var seen = {}, out = [];
        queue.forEach(function (it) { seen[it.id] = 1; });
        Reco.djBatch({ songs: RS, profile: prof(), liked: hearts(), seen: seen, exclude: exSet(), n: n, youth: lifeAsks ? youth().map(function (it) { return it.id; }) : [], lang: lang,
          residentId: patient, round: djRound++, lastArtist: queue.length ? queue[queue.length - 1].artist : '', premium: premium() })
          .forEach(function (x) { var it = toItem(x.song); if (it) { djKind[it.id] = x.kind; out.push(it); } });
        return out;
      }
      function startDJ() {
        djOn = true;
        queue = [];
        var b = djBatch(8);
        if (!b.length) return;
        L.stat('playDJ');
        L.log('Bellatrix Play: DJ Bellatrix (AI) starts', 'result');
        view = { name: 'dj' }; panel = null;
        playFrom(b, 0, 'dj');
      }
      /* One short line before each song, only in DJ mode (and only with the DJ voice on). */
      var ducking = false, duckAt = 0;
      function djLine(it) {
        var line = it.artist ? (isSong(it) && it.year ? T('Here is {artist}, from {year}.', { artist: it.artist, year: it.year }) : T('Here is {artist}.', { artist: it.artist })) : T('Here is {title}.', { title: it.title });
        ducking = true; duckAt = Date.now();
        ytCall('setVolume', Math.round(vol * 0.25));
        L.say(line, function () { ducking = false; ytCall('setVolume', vol); });
      }

      /* ---------- "Next song": at most three big cards, the most similar first ----------
         They come by themselves in the last 30 seconds of a song (and with the "Next song" button
         at any time). The resident may take one, or anything else: the list goes on as it was. The
         reason of each proposal is in the session log for the care team. */
      var nextList = null, nextFor = null, nextOpen = false, nextShut = {};
      function proposals() {
        if (!cur || !RS) return [];
        if (nextFor === cur.id && nextList) return nextList;
        var ex = {};
        Object.keys(sessionPlayed).forEach(function (id) { ex[id] = 1; });
        queue.slice(qi, qi + 2).forEach(function (it) { ex[it.id] = 1; });
        var r = Reco.nextSongs({ songs: RS, current: RS.byId[cur.id] ? cur.id : null, profile: prof(), events: evs(), exclude: exSet(ex), residentId: patient, premium: premium() });
        nextList = r.map(function (x) { return { it: toItem(x.song), why: x.reasonText }; }).filter(function (x) { return x.it; });
        nextFor = cur.id;
        if (nextList.length) L.log('Bellatrix Play: next-song proposals after ' + who(cur) + ': ' + nextList.map(function (x, k) { return (k + 1) + '. ' + who(x.it) + ' [' + x.why + ']'; }).join(' | '), 'result');
        return nextList;
      }
      function openNext() {
        if (!cur || gone || !proposals().length) return;
        nextOpen = true;
        L.stat('playNextShown');
        rebuild();
      }
      function closeNext() { nextOpen = false; if (cur) nextShut[cur.id] = 1; rebuild(); }
      function pickNext(k) {
        var x = nextList && nextList[k];
        if (!x || !cur) return;
        nextOpen = false;
        L.stat('playNextChosen');
        L.log('Bellatrix Play: next song chosen: ' + who(x.it) + ' (proposal ' + (k + 1) + ': ' + x.why + ')', 'result');
        if (locked(x.it)) { openPanel('premium'); return; }
        if (!PlayRules.canSkip(skipTimes, Date.now(), premium(), srcNow === 'staff').ok) { skipOk(); return; }
        replayCheck(x.it);
        queueBy = srcNow;
        queue = queue.slice(0, qi + 1).concat([x.it]).concat(queue.slice(qi + 1).filter(function (it) { return it.id !== x.it.id; }));
        next('pick');
      }
      function nextSheet() {
        return '<section class="m-next-sheet" role="region" aria-label="' + esc(T('Next song')) + '"><div class="m-next-head"><div><p class="m-section-kicker">' + esc(T('Next song')) + aiBadge() + '</p>' +
          '<h2>' + esc(T('And then?')) + '</h2></div><span class="m-next-acts">' +
          '<button type="button" class="m-next-other m-next-stop"' + A('stop-song', 'Not this song: ' + (cur ? who(cur) : ''), function () { nextOpen = false; stopSong(); }) + '>' + di('ban', 19) + '<span>' + esc(T('Not this song')) + '</span></button>' +
          '<button type="button" class="m-next-other"' + A('radio-next', 'Radio (AI): ' + (cur ? who(cur) : ''), function () { nextOpen = false; if (cur) { nextShut[cur.id] = 1; startRadio(cur); } }) + '>' + di('radio', 19) + '<span>' + esc(T('More like this')) + '</span></button>' +
          '<button type="button" class="m-next-other"' + A('next-other', 'Next song: something else', function () { nextOpen = false; if (cur) nextShut[cur.id] = 1; tabTo('search'); }) + '>' + di('search', 19) + '<span>' + esc(T('Something else')) + '</span></button>' +
          '<button type="button" class="m-next-close"' + A('next-close', 'Next song: close', closeNext) + ' aria-label="' + esc(T('Close')) + '">' + di('close', 21) + '</button></span></div>' +
          '<div class="m-next-cards">' + (nextList || []).map(function (x, k) {
            return '<button type="button" class="m-next-card"' + A('next-' + k, 'Next song: ' + who(x.it), function () { pickNext(k); }) + '>' + art(x.it.id, 'm-next-img', '<span class="m-next-go">' + di('play', 15, true) + '</span>') +
              '<span class="m-next-tx"><strong>' + esc(x.it.title) + '</strong><small>' + esc(x.it.artist || ' ') + '</small></span></button>';
          }).join('') + '</div></section>';
      }

      /* ---------- the weekly and monthly playlists: only the ones the care team approved ---------- */
      function myPlaylists() {
        if (!REC || !consentOn) return [];
        var out = [];
        try {
          REC.proposable(patient).forEach(function (pl) {
            var list = pl.items.map(function (x) { return known[x.songId]; }).filter(function (it) { return it && free(it); });
            if (list.length) out.push({ pl: pl, list: list, key: 'pl-' + pl.period, title: pl.period === 'month' ? T('Your playlist of the month') : T('Your playlist of the week') });
          });
        } catch (e) { out = []; }
        return out;
      }
      function playPlaylist(m) {
        if (queueKey === m.key && cur) { togglePlay(); return; }
        if (m.pl.status === 'approved') REC.activate(m.pl.id, srcNow === 'staff' ? 'staff' : 'resident');
        L.stat('playWeekly');
        L.log('Bellatrix Play: ' + (m.pl.period === 'month' ? 'monthly' : 'weekly') + ' playlist ' + m.pl.periodKey + ' (approved by ' + (m.pl.approvedBy || '?') + ')', 'result');
        playFrom(m.list, 0, m.key);
      }
      function plCard(m) {
        var q = queueKey === m.key && !!cur;
        return '<div class="m-pl-card"><button type="button" class="m-pl-open"' + A(m.key + '-open', 'Open: ' + m.key, function () { view = { name: 'plist', key: m.key }; panel = null; rebuild(); }) + '>' +
          '<span class="m-pl-covers">' + m.list.slice(0, 4).map(function (it) { return art(it.id, 'm-pl-img'); }).join('') + '</span>' +
          '<span class="m-pl-tx"><small>' + esc(T('Prepared for you')) + '</small><strong>' + esc(m.title) + '</strong><span>' + esc(T('{n} songs', { n: m.list.length })) + '</span></span></button>' +
          '<button type="button" class="m-round-play' + (q ? ' is-q' : '') + '"' + A(m.key + '-play', 'Play: ' + m.title, function () { playPlaylist(m); }) + ' aria-label="' + esc(T('Listen')) + '">' + (q ? ppIcons(27) : di('play', 27, true)) + '</button></div>';
      }

      /* ---------- AI playlist: a phrase in French, English or German becomes a playlist ----------
         The words are read by js/reco.js (Reco.parsePhrase), the songs chosen with the same vectors. */
      function aiTitle(r) {
        var parts = [];
        if (r.moods.indexOf('happy') >= 0) parts.push(T('Happy songs'));
        else if (r.moods.indexOf('calm') >= 0) parts.push(T('Calm music'));
        else if (r.moods.indexOf('dance') >= 0) parts.push(T('Let’s dance'));
        else if (r.moods.indexOf('memories') >= 0) parts.push(T('Memories'));
        if (r.genres.length) parts.push(r.genres[0] === 'chanson' ? T('French songs') : genreName(r.genres[0]));
        if (r.decades.length) parts.push(decadeName(r.decades[0]));
        if (r.artist) parts.push(r.like ? T('Like {artist}', { artist: r.artist }) : r.artist);
        return parts.length ? parts.join(' · ') : T('Your playlist');
      }
      function aiPlaylist(phrase) {
        var r = Reco.parsePhrase(phrase, artists().map(function (a) { return a.name; }));
        var res = RS ? Reco.phrasePlaylist({ songs: RS, parsed: r, phrase: phrase, profile: prof(), exclude: exSet(), k: 20, youth: [from, to], residentId: patient, premium: premium() }) : { list: [] };
        return { title: aiTitle(r), list: toItems(res.list), parsed: r };
      }

      /* ---------- 1.16: Premium changes, the "Bellatrix message", the short notes ---------- */
      /* Premium may change while Play is open (the family authorised a payment, the team turned
         it on or off): the lists and the page follow at once. */
      function onPremium() { if (gone) return; requested = askedNow(); dataVer++; if (!premium() && tog) togetherStop(); rebuild(); }
      function onPodcasts() { if (!gone && (view.name === 'pods' || view.name === 'show')) rebuild(); }
      try { window.addEventListener('bellatrix-play-premium', onPremium); window.addEventListener('bellatrix-podcasts', onPodcasts); } catch (e) { /* no events */ }
      function showToast(text) { toast = { text: text, until: Date.now() + 5000 }; rebuild(); }
      /* The message between two songs (free): 5 seconds, then the next song; any touch ends it. */
      function showAd() {
        intent = false;
        adNow = PlayRules.message(adRound++);
        songsSinceAd = 0;
        L.stat('playMessages');
        L.log('Bellatrix Play: a Bellatrix message between two songs (' + adNow.key + ')', 'result');
        if (adTimer) clearTimeout(adTimer);
        adTimer = setTimeout(function () { adTimer = null; endAd(); }, PlayRules.AD_SECONDS * 1000);
        rebuild();
      }
      function endAdQuiet() { if (adTimer) { clearTimeout(adTimer); adTimer = null; } adNow = null; }
      function endAd() {
        if (!adNow) return;
        endAdQuiet();
        if (gone || !cur) { rebuild(); return; }
        next('after-message');
      }
      function adGo(m) {
        endAd();
        if (m.go === 'pods') tabTo('pods');
        else if (m.go === 'dj') { if (!djOn) startDJ(); else { view = { name: 'dj' }; rebuild(); } }
        else openPanel('premium');
      }
      function adSheet() {
        var m = adNow;
        return '<section class="m-ad-sheet" role="status"><div class="m-ad-tx"><p class="m-section-kicker">' + esc(T('Bellatrix message')) + '</p><h2>' + esc(T(m.title)) + '</h2><span>' + esc(T(m.text)) + '</span>' +
          '<i class="m-ad-bar"><i style="animation-duration:' + PlayRules.AD_SECONDS + 's"></i></i></div>' +
          '<span class="m-ad-acts"><button type="button" class="m-ad-go"' + A('ad-go', 'Message: ' + m.key, function () { adGo(m); }) + '>' + esc(T(m.btn)) + '</button>' +
          '<button type="button" class="m-ad-next"' + A('ad-next', 'Message: next song', endAd) + '>' + di('next', 20) + '<span>' + esc(T('Next song')) + '</span></button></span></section>';
      }
      /* The one message card on Home (free): the same messages, one a day. */
      function houseAd() {
        var m = PlayRules.message(Math.floor(Date.now() / 86400000));
        return '<section class="m-premium-banner m-house-ad"><div class="m-premium-badge">' + di(m.go === 'pods' ? 'pod' : m.go === 'dj' ? 'dj' : 'crown', 25) + '</div><div><p>' + esc(T('Bellatrix message')) + '</p><h2>' + esc(T(m.title)) + '</h2>' +
          '<span>' + esc(T(m.text)) + '</span></div><button type="button"' + A('house-ad', 'Message on Home: ' + m.key, function () { adGo(m); }) + '>' + esc(T(m.btn)) + '</button></section>';
      }

      /* ---------- 1.16: podcasts (js/podcasts.js) ---------- */
      var PODS = {}, podOther = false, podAsk = null;
      var PODC = ['#1565B0', '#00519E', '#00519E', '#1565B0', '#00519E', '#00519E'];
      function podTime() { try { return au ? au.currentTime || 0 : 0; } catch (e) { return 0; } }
      function podDur() { try { var d = au ? au.duration : 0; return isFinite(d) && d > 0 ? d : pod && pod.ep.dur || 0; } catch (e) { return 0; } }
      function podClock() { if (podSince) { podMs += Date.now() - podSince; podHeard += Date.now() - podSince; podSince = 0; } }
      function audioEl() {
        if (au) return au;
        au = new Audio();
        au.preload = 'auto';
        au.addEventListener('playing', function () { if (gone || mode !== 'pod') return; podStarted = true; podIntent = true; if (!podSince) podSince = Date.now(); if (!podStart) podStart = new Date().toISOString(); paint(); });
        au.addEventListener('pause', function () { podClock(); if (!podHelp) podIntent = false; paint(); });
        au.addEventListener('loadedmetadata', function () { if (podSeek > 0) { try { au.currentTime = podSeek; } catch (e) { /* from the start */ } podSeek = 0; } });
        au.addEventListener('ended', function () { if (gone || !pod) return; podClock(); podLog(true); podSave(true); podIntent = false; L.stat('podEnded'); paint(); rebuild(); });
        au.addEventListener('error', function () {
          if (gone || !pod || mode !== 'pod' || !au.getAttribute('src')) return;
          L.log('Bellatrix Play: podcast episode could not play: ' + pod.ep.title, 'error');
          podIntent = false; showToast(T('This episode cannot play right now.'));
        });
        return au;
      }
      /* Where they stopped: kept only with the music consent; without it, for this session only. */
      function podSave(end) {
        if (!pod) return;
        var t = end ? 0 : podTime(), d = podDur();
        if (consentOn) { try { Podcasts.saveProgress(patient, pod.ep.id, t, d); } catch (e) { /* only a convenience */ } }
        else sessPod[pod.ep.id] = t && (!d || t < d - 20) ? { t: t, d: d } : null;
      }
      function podLog(done) {
        if (!pod) return;
        var secs = podHeard / 1000;
        famListen('podcast', pod.ep, podHeard, podStart);
        podHeard = 0; podStart = '';
        if (consentOn && secs >= 30) { try { Podcasts.logListen(patient, pod.ep, secs, done); } catch (e) { /* only a record */ } }
      }
      function podPause() { if (au && mode === 'pod') { podSave(); try { au.pause(); } catch (e) { /* not playing */ } } podIntent = false; }
      /* Leaving the episode for a song (or Play ends): its place is kept, the sound stops. */
      function podLeave(quiet) {
        if (!pod) return;
        podClock(); podSave(); podLog(false);
        try { if (au) au.pause(); } catch (e) { /* not playing */ }
        podIntent = false;
        L.stat('playMinutesPodcasts', mins(podMs));
        if (!quiet) mode = 'song';
      }
      function playEpisode(ep) {
        if (!ep || gone || !window.Podcasts) return;
        if (pod && pod.ep.id === ep.id && mode === 'pod') { podToggle(); return; }
        if (mode === 'pod') podLeave(true);
        /* the music waits (its place in the song is kept) */
        if (cur && intent) { clock(); intent = false; ytCall('pauseVideo'); }
        endAdQuiet();
        nextOpen = false;
        mode = 'pod'; pod = { ep: ep, show: Podcasts.show(ep.show) }; podStarted = false; podIntent = true; podHeard = 0; podStart = '';
        var pr = consentOn ? Podcasts.progress(patient, ep.id) : sessPod[ep.id];
        podSeek = pr && pr.t > 30 ? pr.t - 3 : 0;
        L.stat('playPodcasts');
        L.log('Bellatrix Play: podcast ' + (pod.show ? pod.show.title + ': ' : '') + ep.title + (Podcasts.downloaded(ep.id) ? ' (downloaded)' : ''), 'result');
        Podcasts.source(ep).then(function (src) {
          if (gone || !pod || pod.ep !== ep || mode !== 'pod') return;
          var a = audioEl();
          a.src = src.url;
          try { a.volume = vol / 100; } catch (e) { /* default volume */ }
          var p = a.play();
          if (p && p.catch) p.catch(function () { podIntent = false; paint(); });
        }, function () { podIntent = false; showToast(T('This episode cannot play right now.')); });
        rebuild();
      }
      function podToggle() {
        if (!pod) return;
        var a = audioEl();
        if (podIntent && !a.paused) { podPause(); }
        else {
          if (cur && intent) { clock(); intent = false; ytCall('pauseVideo'); }
          mode = 'pod'; podIntent = true;
          if (!a.getAttribute('src')) { playEpisode(pod.ep); return; }
          var p = a.play(); if (p && p.catch) p.catch(function () { podIntent = false; paint(); });
        }
        paint();
      }
      function podJump(sec) { if (!au || !pod) return; try { au.currentTime = Math.max(0, Math.min(podDur() || 1e9, podTime() + sec)); } catch (e) { /* not seekable yet */ } paintProgress(); }
      function loadShow(id, again) {
        if (!window.Podcasts) return;
        var x = PODS[id];
        if (x && !again && (x.state === 'loading' || x.state === 'done')) return;
        PODS[id] = { state: 'loading' };
        Podcasts.load(id).then(function (f) {
          PODS[id] = { state: 'done', feed: f };
          L.log('Bellatrix Play: podcast list ' + id + ' (' + f.episodes.length + ' episodes, from ' + f.from + ')', 'result');
          if (!gone && view.name === 'show' && view.show === id) rebuild();
        }, function () {
          PODS[id] = { state: 'error' };
          L.log('Bellatrix Play: podcast list ' + id + ' could not be read (no internet, no copy)', 'error');
          if (!gone && view.name === 'show' && view.show === id) rebuild();
        });
      }
      function openShow(id) { view = { name: 'show', show: id }; panel = null; loadShow(id); rebuild(); }
      function dlStep(id, f) {
        Array.prototype.forEach.call(screenEl.querySelectorAll('[data-dl="' + id + '"]'), function (el) { el.textContent = Math.round(f * 100) + ' %'; });
      }
      function download(ep) {
        if (!window.Podcasts || Podcasts.downloaded(ep.id) || Podcasts.downloading(ep.id)) return;
        L.stat('podDownloads');
        L.log('Bellatrix Play: downloading the podcast episode ' + ep.title, 'result');
        Podcasts.download(ep, function (f) { dlStep(ep.id, f); }).then(function (d) {
          L.log('Bellatrix Play: podcast episode kept on the robot (' + Podcasts.fmtSize(d.size, 'en') + ')', 'result');
          rebuild();
        }, function (e) {
          var m = String(e && e.message || '');
          L.log('Bellatrix Play: podcast download failed (' + m + ')', 'error');
          showToast(m === 'full' ? T('The robot is full: delete an episode first.') : m === 'blocked' ? T('This episode can only be listened to online.') : T('The download did not work. Try again later.'));
        });
        rebuild();
      }
      /* Deleting asks twice (a touch by mistake deletes nothing): the second touch within 5 s. */
      function askDelete(id, fn) {
        if (podAsk && podAsk.id === id && Date.now() < podAsk.until) { podAsk = null; fn(); return; }
        podAsk = { id: id, until: Date.now() + 5000 };
        rebuild();
      }
      function delEpisode(id) {
        if (pod && pod.ep.id === id && mode === 'pod') { podLeave(); pod = null; }
        L.log('Bellatrix Play: a downloaded podcast episode deleted', 'result');
        Podcasts.remove(id).then(rebuild, rebuild);
      }
      function delAll() {
        if (pod && mode === 'pod' && Podcasts.downloaded(pod.ep.id)) { podLeave(); pod = null; }
        L.log('Bellatrix Play: all downloaded podcast episodes deleted', 'result');
        Podcasts.removeAll().then(rebuild, rebuild);
      }
      function toggleList(ep) {
        if (!premium()) { openPanel('premium'); return; }
        if (Podcasts.inList(patient, ep.id)) Podcasts.dropFromList(patient, ep.id); else { Podcasts.addToList(patient, ep); L.stat('podSaved'); }
        rebuild();
      }

      /* ---------- 1.16: listening together (Premium Play, contract 3) ----------
         POST robot/listen {code} opens a session ({ s }); then every 5 seconds POST robot/listen
         { s, now: { id, title, artist } | null, took: [qid] } (what plays, the shared songs that
         started) answers { open, now, queue: [{ qid, id, title, artist, by }], listeners: [{ name }] }.
         The family's songs (catalogue only) come right after the current song, in their order.
         Closed with { s, close: true } when the resident stops it or leaves Play. */
      function togetherStart() {
        if (!premium()) { openPanel('premium'); return; }
        view = { name: 'together' }; panel = null;
        if (!window.FamilyMessages || !FamilyMessages.request || !FamilyMessages.server || !FamilyMessages.server()) { tog = null; togErr = 'noserver'; rebuild(); return; }
        togErr = '';
        tog = { state: 'opening', s: '', view: null, added: {}, pend: {}, took: [], busy: false, n: 0, fails: 0 };
        rebuild();
        var me = tog;
        FamilyMessages.request('POST', 'robot/listen', { code: patient }).then(function (j) {
          if (gone || tog !== me) return;
          if (!j || !j.s) throw new Error('no session');
          me.state = 'open'; me.s = j.s; me.family = j.family !== false;
          L.stat('playTogether');
          L.log('Bellatrix Play: listening together opened for ' + patient, 'result');
          togPoll();
        }).catch(function (e) {
          if (gone || tog !== me) return;
          tog = null; togErr = e && (e.status === 404 || e.code === 'unknown-resident') ? 'resident' : 'net';
          L.log('Bellatrix Play: listening together could not open (' + togErr + ')', 'error');
          rebuild();
        });
      }
      var togErr = '';
      function togNow() { return mode === 'song' && cur && !cur.custom ? { id: cur.id, title: cur.title, artist: cur.artist || '' } : null; }
      function togPoll() {
        var me = tog;
        if (!me || me.state !== 'open' || me.busy || gone) return;
        me.busy = true;
        var took = me.took.splice(0);
        FamilyMessages.request('POST', 'robot/listen', { s: me.s, now: togNow(), took: took }).then(function (v) {
          me.busy = false; me.fails = 0;
          if (gone || tog !== me) return;
          togApply(v || {});
        }, function (e) {
          me.busy = false; me.took = took.concat(me.took);
          if (gone || tog !== me) return;
          if (e && e.status === 404) { tog = null; togErr = 'ended'; rebuild(); return; }
          if (++me.fails === 3) rebuild();
        });
      }
      function togApply(v) {
        var me = tog, before = JSON.stringify(me.view || {}), fresh = [], live = {};
        me.view = { open: v.open !== false, listeners: (v.listeners || []).map(function (x) { return String(x.name || ''); }).filter(Boolean), queue: (v.queue || []).slice(0, 30) };
        me.view.queue.forEach(function (q) { live[q.qid] = 1; if (!me.added[q.qid]) fresh.push(q); });
        /* a song the family took back before it played leaves the queue */
        Object.keys(me.pend).forEach(function (id) {
          var qid = me.pend[id];
          if (!live[qid]) { delete me.pend[id]; for (var k = queue.length - 1; k > qi; k--) if (queue[k].id === id && addedBy[id]) { queue.splice(k, 1); break; } }
        });
        var at = qi + 1;
        for (var k = qi + 1; k < queue.length; k++) if (addedBy[queue[k].id]) at = k + 1;
        fresh.forEach(function (q) {
          me.added[q.qid] = 1;
          var it = known[q.id];
          if (!it || !playable(it)) { me.took.push(q.qid); return; }
          addedBy[it.id] = String(q.by || '');
          me.pend[it.id] = q.qid;
          L.log('Bellatrix Play: listening together, the family added ' + who(it), 'result');
          if (!cur) { queue = [it]; qi = 0; queueKey = 'together'; queueBy = 'resident'; load(it); at = 1; }
          else { queue.splice(at++, 0, it); }
        });
        if (fresh.length || JSON.stringify(me.view) !== before) rebuild();
      }
      function togetherStop(quiet) {
        var me = tog;
        tog = null;
        if (me && me.s && window.FamilyMessages && FamilyMessages.request) {
          try { FamilyMessages.request('POST', 'robot/listen', { s: me.s, close: true }).then(function () { /* closed */ }, function () { /* the server ends it by itself */ }); } catch (e) { /* ends by itself */ }
          L.log('Bellatrix Play: listening together closed', 'result');
        }
        if (!quiet) rebuild();
      }
      var addedBy = {};

      /* ---------- the screens: the "Mélodie" design (sidebar, page, player bar, panels) ---------- */
      var view = { name: 'home' }, panel = null, query = '', stack = [];
      var acts = {}, nAct = 0, used = {}, scrollMem = {};
      var MOODC = ['#FFFFFF', '#FFFFFF', '#FFFFFF'];
      var D = {
        home: '<path d="m3 11 9-8 9 8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
        heart: '<path d="M20.8 5.7a5.5 5.5 0 0 0-7.8 0L12 6.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 22l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
        play: '<path d="m8 5 11 7-11 7Z"/>',
        pause: '<path d="M9 6v12"/><path d="M15 6v12"/>',
        previous: '<path d="M6 5v14"/><path d="m18 6-9 6 9 6Z"/>',
        next: '<path d="M18 5v14"/><path d="m6 6 9 6-9 6Z"/>',
        volume: '<path d="M11 5 6.5 9H3v6h3.5l4.5 4Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>',
        list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r=".5"/><circle cx="4" cy="12" r=".5"/><circle cx="4" cy="18" r=".5"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.3 1-1.3 2.2"/><path d="M12 17h.01"/>',
        chevron: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
        crown: '<path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5Z"/><path d="M5 21h14"/>',
        close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
        microphone: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/>',
        video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3Z"/>',
        minus: '<path d="M6 12h12"/>', plus: '<path d="M6 12h12M12 6v12"/>',
        del: '<path d="M8.5 5H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8.5L2.5 12Z"/><path d="m11.5 9 6 6M17.5 9l-6 6"/>',
        space: '<path d="M4 10v4h16v-4"/>',
        leaf: '<path d="M20 4c-9 0-15 4.5-15 11 0 1.6.4 3 1 4C7.5 13.5 11 10.5 15 9c-3.5 2.5-6.5 6-7.5 11 1 .4 2 .6 3 .6C17 20.6 20 14 20 4Z"/>',
        radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
        minimize: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
        sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
        dj: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="14" width="5" height="7" rx="2"/><rect x="16.5" y="14" width="5" height="7" rx="2"/>',
        calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
        ban: '<circle cx="12" cy="12" r="9"/><path d="m5.8 5.8 12.4 12.4"/>',
        /* 1.16: podcasts, downloads, shuffle, listening together */
        pod: '<circle cx="12" cy="9.5" r="2.6"/><path d="M8.6 13.6a5 5 0 1 1 6.8 0"/><path d="M5.8 16.4a9 9 0 1 1 12.4 0"/><path d="M12 13v8"/>',
        download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
        check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
        shuffle: '<path d="M3 7h3.5c2.5 0 4 1.5 5.5 4.5S15 17 17.5 17H21"/><path d="M3 17h3.5c1.4 0 2.5-.5 3.4-1.4"/><path d="M14.1 8.4C15 7.5 16.1 7 17.5 7H21"/><path d="m18 4 3 3-3 3"/><path d="m18 14 3 3-3 3"/>',
        together: '<circle cx="8.5" cy="8" r="3.2"/><path d="M2.5 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.2 14.6c.4-.1.9-.2 1.3-.2 2.5 0 4.4 1.7 5 4.8"/>',
        rewind: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4v5h5"/>',
        forward: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M20.5 4v5h-5"/>',
        trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
        listadd: '<path d="M4 6h11M4 12h11M4 18h7"/><path d="M18 14v7M14.5 17.5h7"/>',
        note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
      };
      function di(n, s, fill) {
        return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + D[n] + '</svg>';
      }
      /* Every button is an action of the one Bellatrix Play step, so touch and pointing in the air
         both reach it through the engine (data-a="a"). The actions are an object, not a list, so
         the engine does not draw its own buttons for them. */
      function A(name, label, fn) {
        var i = nAct++, b = String(name).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'b';
        if (used[b]) b += '-' + i;
        used[b] = 1;
        /* Who pressed it: the engine weighs the care team's taps ("Staff is tapping") differently. */
        acts[i] = { label: label, run: function (src) {
          srcNow = src === 'staff' ? 'staff' : 'resident'; lastTouch = Date.now();
          /* a touch during the "Bellatrix message" ends it at once, then does what was touched */
          if (adNow && b.indexOf('ad-') !== 0) endAd();
          fn(src);
        } };
        return ' data-a="a" data-i="' + i + '" data-b="p-' + b + '"';
      }
      function vkey() { return view.name; }
      function tabTo(name) {
        if (view.name === name) Object.keys(scrollMem).forEach(function (k) { if (k.indexOf(name + '|') === 0) delete scrollMem[k]; });
        view = { name: name }; panel = null; rebuild();
      }
      function openPanel(p) { panel = p; rebuild(); }
      function closePanel() { panel = null; rebuild(); }
      function openClip() { if (cur) openPanel('clip'); }
      function jump(k) { if (!queue[k]) return; if (k !== qi && !skipOk()) return; if (k !== qi) noteSkip(); qi = k; load(queue[qi]); rebuild(); }
      function scroller(key, dir, inner) {
        var ar = dir === 'h' ? ['left', 'chevron'] : ['up', 'down'];
        return '<div class="bp-sc bp-sc-' + dir + '"><div class="bp-scin" data-s="' + key + '" data-d="' + dir + '">' + inner + '</div>' +
          '<button type="button" class="bp-arr bp-arr-prev off"' + A('sc-' + key + '-prev', 'Scroll back', function () { scrollStep(key, -1); }) + ' aria-label="' + esc(T('Back')) + '">' + di(ar[0], 26) + '</button>' +
          '<button type="button" class="bp-arr bp-arr-next off"' + A('sc-' + key + '-next', 'Scroll on', function () { scrollStep(key, 1); }) + ' aria-label="' + esc(T('More')) + '">' + di(ar[1], 26) + '</button></div>';
      }
      function isCur(it) { return !!cur && cur.id === it.id; }
      function ppIcons(s) { return '<span class="bp-i-play">' + di('play', s, true) + '</span><span class="bp-i-pause">' + di('pause', s, true) + '</span>'; }
      function likeBtn(it, key, s) {
        var on = isLiked(it);
        return '<button type="button" class="m-like' + (on ? ' liked' : '') + '"' + A('heart-' + key, (on ? 'Heart removed: ' : 'Heart: ') + who(it), function () { heart(it); }) +
          ' aria-pressed="' + on + '" aria-label="' + esc(on ? T('Remove from my favourites') : T('Add to my favourites')) + '">' + di('heart', s, on) + '</button>';
      }
      function songCard(it, list, i, key) {
        var c = isCur(it), lk = locked(it);
        return '<article class="m-song-card' + (c ? ' is-cur' : '') + '"><button type="button" class="m-cover-wrap"' + A(key + '-' + i, 'Play: ' + who(it), function () {
          if (locked(it)) { openPanel('premium'); return; }
          if (isCur(it)) togglePlay(); else playFrom(list, i, key, true);
        }) + ' aria-label="' + esc(T('Listen to {title}', { title: it.title })) + '">' + art(it.id, 'm-cover') + '<span class="m-card-play">' + (lk ? di('crown', 21) : c ? ppIcons(23) : di('play', 23, true)) + '</span></button>' +
          '<button type="button" class="m-card-radio"' + A('radio-' + key + '-' + i, 'Radio (AI): ' + who(it), function () { startRadio(it); }) + ' aria-label="' + esc(T('More like this')) + '">' + di('radio', 17) + '</button>' +
          '<div class="m-song-info"><div><h3>' + esc(it.title) + '</h3><p>' + esc(it.artist || '\u00a0') + '</p></div>' + likeBtn(it, key + '-' + i, 23) + '</div></article>';
      }
      function aiBadge() { return ' <span class="m-ai">' + esc(T('AI')) + '</span>'; }
      function grid(list, key) { return '<div class="m-song-grid">' + list.map(function (it, i) { return songCard(it, list, i, key); }).join('') + '</div>'; }
      function empty(icon, title, text) {
        return '<div class="m-empty-state"><span class="m-empty-icon">' + di(icon, 30) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
      }
      function topbar(kicker, title) {
        return '<div class="m-topbar"><div><p class="m-eyebrow">' + esc(kicker) + '</p><h1>' + esc(title) + '</h1></div>' +
          '<div class="m-top-actions"><button type="button" class="m-search-box"' + A('top-search', 'Tab: search', function () { tabTo('search'); }) + '>' + di('search', 22) +
          '<span' + (query ? ' class="is-q"' : '') + '>' + esc(query || T('What would you like to hear?')) + '</span></button></div></div>';
      }
      /* Children's songs stay in Search and the styles, not in the hits and decade rows. */
      function hitsList() { return ordered(all.filter(function (it) { return isSong(it) && it.year >= 2015 && it.genre !== 'kids'; }), langFirst).slice(0, 20); }
      /* Up to eight songs for "Your recommendations": the family's videos, then the personal mixes in turn. */
      function recommended(mx) {
        var out = family.slice(0, 4), seen = {}, i = 0, more = true;
        out.forEach(function (it) { seen[it.id] = 1; });
        while (out.length < 8 && more) {
          more = false;
          mx.forEach(function (m) { var it = m.list[i]; if (it) { more = true; if (!seen[it.id] && out.length < 8) { seen[it.id] = 1; out.push(it); } } });
          i++;
        }
        return out;
      }
      function decadesOfYouth() {
        var n = {};
        youth().forEach(function (it) { var d = Math.floor(it.year / 10) * 10; n[d] = (n[d] || 0) + (it.lang === lang ? 2 : 1); });
        return Object.keys(n).map(Number).sort(function (a, b) { return n[b] - n[a]; }).slice(0, 2).sort(function (a, b) { return a - b; });
      }
      function yy(d) { return d >= 2000 ? String(d) : String(d).slice(2); }
      /* "Explore easily": their own songs, classical music, the decades of their youth, then calm,
         dance, nature and today's hits, each in one tap. */
      function explore() {
        var out = [], own = lang === 'fr' ? 'chanson' : lang === 'de' ? 'schlager' : 'pop', ol = genreList(own), cl = genreList('classical'), ds = lifeAsks ? decadesOfYouth() : [];
        if (ol.length) out.push({ key: 'own', title: own === 'chanson' ? T('French songs') : genreName(own), sym: '♪', list: ol });
        if (cl.length) out.push({ key: 'classical', title: genreName('classical'), sym: '♫', list: cl });
        if (ds.length) {
          var dl = ordered(all.filter(function (it) { return it.kind !== 'video' && ds.some(function (d) { return it.year >= d && it.year <= d + 9; }); }), langFirst);
          out.push({ key: 'years', title: ds.length === 2 ? T('The {y1}s and {y2}s', { y1: ds[0], y2: ds[1], yy1: yy(ds[0]), yy2: yy(ds[1]) }) : decadeName(ds[0]), sym: '●', list: dl });
        }
        var c = calmList(), d = danceList(), n = natureList(), h = hitsList();
        if (c.length) out.push({ key: 'calm', title: T('Calm'), sym: '≈', list: c });
        if (d.length) out.push({ key: 'dance', title: T('Dance'), sym: '♫', list: d });
        if (n.length) out.push({ key: 'nature', title: T('Nature'), svg: 'leaf', list: n });
        if (h.length >= 4 && out.length < 6) out.push({ key: 'hits', title: T('Hits of the moment'), sym: '★', list: h });
        return out.slice(0, 6);
      }
      function moodCard(m, i) {
        return '<button type="button" class="m-mood-card" style="background:' + MOODC[i % 3] + '"' + A('mood-' + m.key, 'Play: ' + m.key, function () {
          L.stat('playLists'); L.push('playChosen', m.key);
          playFrom(m.list, 0, 'mood-' + m.key);
        }) + '><span class="m-mood-symbol">' + (m.svg ? di(m.svg, 28, true) : m.sym) + '</span><span>' + esc(m.title) + '</span>' + di('chevron', 24) + '</button>';
      }

      /* "For you", played by "Listen now": every era mixed (about 40 % from 2000 on); when the life
         story asks for it, their favourite singers and their youth first, with about 30 % recent songs. */
      function forYou() {
        return memo('foryou', function () {
          function pool(f) { return ordered(all.filter(function (it) { return isSong(it) && free(it) && f(it); }), langFirst); }
          var lists, pattern, seen = {}, pos = {}, out = [], i = 0;
          var rec = pool(function (it) { return it.year >= 2000; });
          if (lifeAsks) {
            var pers = [];
            mixes().forEach(function (m) { pers = pers.concat(m.list.slice(0, 10)); });
            lists = { p: pers, r: rec };
            pattern = ['p', 'p', 'r', 'p', 'p', 'r', 'p', 'r', 'p', 'p'];
          } else {
            lists = { r: rec, o: pool(function (it) { return it.year >= 1900 && it.year < 1975; }), m: pool(function (it) { return it.year >= 1975 && it.year < 2000; }) };
            pattern = ['r', 'o', 'm', 'r', 'm', 'o', 'r', 'o', 'm', 'r'];
          }
          function from(k) {
            var l = lists[k];
            pos[k] = pos[k] || 0;
            while (pos[k] < l.length) { var it = l[pos[k]++]; if (!seen[it.id] && free(it)) return it; }
            return null;
          }
          while (out.length < 30 && i < 400) {
            var it = from(pattern[i++ % pattern.length]);
            if (!it) Object.keys(lists).some(function (k) { it = from(k); return !!it; });
            if (!it) break;
            seen[it.id] = 1; out.push(it);
          }
          return out;
        });
      }
      /* A row of Home: four big cards, and "Play all" for the whole list. */
      function rowSection(key, kicker, title, list) {
        if (list.length < 4) return '';
        var q = queueKey === 'row-' + key && !!cur;
        /* (the right padding keeps "Play all" clear of the round scroll arrow) */
        return '<section class="m-content-section m-row-section"><div class="m-section-heading" style="padding-right:48px"><div><p class="m-section-kicker">' + esc(kicker) + '</p><h2>' + esc(title) + '</h2></div>' +
          '<button type="button" class="m-see-all' + (q ? ' is-q' : '') + '"' + A('row-' + key + '-all', 'Play all: ' + key, function () {
            if (q) { togglePlay(); return; }
            L.stat('playLists'); L.push('playChosen', key);
            playFrom(list, 0, 'row-' + key);
          }) + '>' + esc(T('Play all')) + ' ' + (q ? ppIcons(19) : di('play', 19, true)) + '</button></div>' +
          '<div class="m-song-grid">' + list.slice(0, 4).map(function (it, i) { return songCard(it, list, i, 'row-' + key); }).join('') + '</div></section>';
      }
      function homeRows() {
        var h = rowSection('hits', T('Right now'), T('Hits of the moment'), memo('hits', hitsList));
        h += rowSection('d2000', T('Through the years'), decadeName(2000), memo('d2000', function () { return decadeSongs(2000).slice(0, 20); }));
        h += rowSection('d2010', T('Through the years'), decadeName(2010), memo('d2010', function () { return decadeSongs(2010).slice(0, 20); }));
        if (lifeAsks) h += rowSection('youth', T('From your life story'), T('Your youth'), memo('youth', function () { return youth().slice(0, 30); }));
        return h;
      }
      function homeView() {
        var fy = forYou(), rec = family.slice(0, 2).concat(aiRecommended(8)).slice(0, 8), g = (Lab.opt.greet || '').trim(), h, pls = myPlaylists();
        /* no word alone on the last line of the big title ("feel good", "du bien") */
        var hits = T('The songs|that make you feel good').split('|').map(function (x) { return x.replace(/ (\S+)$/, '\u00a0$1'); });
        h = topbar(T('Your music, simply'), g ? T('Hello, {name}', { name: g }) : T('Hello'));
        /* The weekly and monthly playlists first, and only once the care team approved them. */
        if (pls.length) h += '<section class="m-pl-row' + (pls.length > 1 ? ' two' : '') + '">' + pls.map(plCard).join('') + '</section>';
        h += '<section class="m-hero"><div class="m-hero-copy"><p class="m-hero-kicker">' + esc(T('Your selection of the day')) + '</p>' +
          '<h2>' + esc(hits[0]) + (hits[1] ? '<br>' + esc(hits[1]) : '') + '</h2><p>' + esc(T('Melodies you love, gathered in one place.')) + '</p>' +
          '<button type="button" class="m-primary-button"' + A('hero-play', 'Play: selection of the day', function () {
            if (!fy.length) return;
            if (queueKey === 'foryou' && cur) togglePlay(); else playFrom(fy, 0, 'foryou');
          }) + '><span class="m-play-dot">' + di('play', 21, true) + '</span>' + esc(T('Listen now')) + '</button></div>' +
          '<div class="m-hero-art" aria-hidden="true"><div class="m-record"><div class="m-record-label">BELLATRIX<br><small>' + esc(T('your favourite songs')) + '</small></div></div>' +
          '<div class="m-music-note m-note-one">♪</div><div class="m-music-note m-note-two">♫</div></div></section>';
        /* Right under the hero, for everyone: today's hits, the 2000s, the 2010s (1.15.1). */
        h += homeRows();
        h += homeCards();
        h += '<section class="m-content-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Just for you')) + '</p><h2>' + (consentOn ? esc(T('Your recommendations')) + aiBadge() : esc(T('Well-known songs'))) + '</h2></div>' +
          '<button type="button" class="m-see-all"' + A('see-fav', 'Tab: favourites', function () { tabTo('fav'); }) + '>' + esc(T('My favourites')) + ' ' + di('chevron', 19) + '</button></div>' + grid(rec, 'reco') + '</section>';
        /* "Your mixes": from their hearts and listening (with the music consent) */
        var mx = myMixes();
        if (mx.length) h += '<section class="m-content-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Made for you')) + aiBadge() + '</p><h2>' + esc(T('Your mixes')) + '</h2></div></div>' +
          '<div class="m-pl-row' + (mx.length > 1 ? ' two' : '') + '">' + mx.map(mixCard).join('') + '</div></section>';
        /* free: one "Bellatrix message" (never a fake button: it opens what it says) */
        if (!premium()) h += houseAd();
        h += '<section class="m-content-section m-mood-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Choose a mood')) + '</p><h2>' + esc(T('Explore easily')) + '</h2></div></div>' +
          '<div class="m-mood-grid">' + memo('explore', explore).map(moodCard).join('') + '</div></section>';
        return scroller('home', 'v', h);
      }
      function favView() {
        var liked = likedList(), n = liked.length;
        var h = topbar('Bellatrix Play', T('My favourites')) + '<section class="m-page-view"><div class="m-page-intro"><div class="m-page-intro-icon">' + di('heart', 42, true) + '</div>' +
          '<div><p class="m-section-kicker">' + esc(T('Your collection')) + '</p><h2>' + esc(T('The songs you love')) + '</h2><span>' + esc(n === 1 ? T('1 song saved') : T('{n} songs saved', { n: n })) + '</span></div>' +
          (n ? '<button type="button" class="m-round-play' + (queueKey === 'liked' && cur ? ' is-q' : '') + '"' + A('fav-play', 'Play all: favourites', function () { if (queueKey === 'liked' && cur) togglePlay(); else playFrom(liked, 0, 'liked'); }) +
            ' aria-label="' + esc(T('Play all my favourites')) + '">' + (queueKey === 'liked' && cur ? ppIcons(27) : di('play', 27, true)) + '</button>' : '') + '</div>' +
          (n ? grid(liked, 'liked') : empty('heart', T('No favourites yet'), T('Touch the heart of a song to find it here.'))) + '</section>';
        return scroller('fav', 'v', h);
      }
      function typeKey(k) {
        if (k === null) query = query.slice(0, -1);
        else if (k === ' ') { if (query && query.slice(-1) !== ' ') query += ' '; }
        else if (query.length < 24) query += k;
        delete scrollMem['search|res'];
        rebuild();
      }
      function searchView() {
        var q = norm(query), list = q ? search(query).songs : ordered(all.filter(function (it) { return it.kind !== 'video'; }), langFirst).slice(0, 40);
        var kb = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(function (k) {
          return '<button type="button" class="m-key"' + A('k-' + k, 'Key ' + k, function () { typeKey(k); }) + '>' + k + '</button>';
        }).join('') +
          '<button type="button" class="m-key fn"' + A('k-space', 'Key space', function () { typeKey(' '); }) + ' aria-label="' + esc(T('Space')) + '">' + di('space', 24) + '</button>' +
          '<button type="button" class="m-key fn"' + A('k-del', 'Key delete', function () { typeKey(null); }) + ' aria-label="' + esc(T('Delete')) + '">' + di('del', 24) + '</button>';
        var h = topbar('Bellatrix Play', T('Search')) +
          '<div class="m-search-hero">' + di('search', 30) + '<span class="m-q' + (query ? '' : ' is-ph') + '">' + (query ? esc(query) + '<i class="m-caret"></i>' : '<i class="m-caret"></i>' + esc(T('Song, artist or music style'))) + '</span>' +
          (query ? '<button type="button"' + A('k-clear', 'Clear the search', function () { query = ''; rebuild(); }) + ' aria-label="' + esc(T('Clear the search')) + '">' + di('close', 22) + '</button>' : '') + '</div>' +
          '<div class="m-search-body"><div class="m-kb">' + kb + '</div><div class="m-results"><button type="button" class="m-ai-entry"' + A('ai-open-search', 'AI playlist', function () { aiResult = null; aiQuery = ''; view = { name: 'ai' }; rebuild(); }) + '>' + di('sparkle', 18, true) + '<span>' + esc(T('AI playlist')) + '</span>' + aiBadge() + '</button>' +
          '<div class="m-section-heading m-search-heading"><div><p class="m-section-kicker">' + esc(query ? T('Results') : T('Browse')) + '</p>' +
          '<h2>' + esc(query ? T('For “{q}”', { q: query.toLowerCase() }) : T('All the songs')) + '</h2></div></div>' +
          (list.length ? scroller('res', 'v', grid(list, 'res')) : empty('search', T('No results found'), T('Try the name of another artist or song.'))) + '</div></div>';
        return '<div class="m-page m-search-page">' + h + '</div>';
      }
      /* "Just now", "Today", "Yesterday", "This week", or the date. */
      function when(iso) {
        var d = new Date(iso), now = new Date();
        if (!iso || isNaN(d.getTime())) return '';
        var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), t = d.getTime();
        if (now - t < 3600000) return T('Just now');
        if (t >= day0) return T('Today');
        if (t >= day0 - 86400000) return T('Yesterday');
        if (t >= day0 - 6 * 86400000) return T('This week');
        try { return d.toLocaleDateString(I18N.BCP47[lang] || 'en-US', { day: 'numeric', month: 'long' }); } catch (e) { return d.getDate() + '.' + (d.getMonth() + 1) + '.'; }
      }
      function historyRow(it, i, num, time, fn, key) {
        return '<button type="button" class="m-history-row' + (isCur(it) ? ' is-cur' : '') + '"' + A(key + '-' + i, 'Play: ' + who(it), fn) + '><span class="m-history-number">' + num + '</span>' + art(it.id, 'm-hthumb') +
          '<span class="m-history-song"><strong>' + esc(it.title) + '</strong><small>' + esc(it.artist || ' ') + '</small></span><span class="m-history-time">' + esc(time || '') + '</span>' +
          '<span class="m-history-play">' + (isCur(it) ? ppIcons(18) : di('play', 18, true)) + '</span></button>';
      }
      function summary(cls, icon, kicker, title, text) {
        return '<div class="m-history-summary' + cls + '"><span class="m-page-intro-icon m-history-icon">' + di(icon, 38) + '</span><div><p class="m-section-kicker">' + esc(kicker) + '</p><h2>' + esc(title) + '</h2><span>' + esc(text) + '</span></div></div>';
      }
      function recentAll() {
        var m = played();
        return Object.keys(m).filter(function (id) { return known[id] && m[id].last && playable(known[id]) && (m[id].n || 0) > 0; })
          .sort(function (a, b) { return m[a].last < m[b].last ? 1 : -1; }).slice(0, 30).map(function (id) { return known[id]; });
      }
      function recentView() {
        var r = recentAll();
        return scroller('recent', 'v', topbar('Bellatrix Play', T('Recently played')) + '<section class="m-page-view">' +
          summary('', 'clock', T('Your history'), T('Find what you listened to last'), T('The songs you started recently appear here by themselves.')) +
          (r.length ? '<div class="m-history-list">' + r.map(function (it, i) { return historyRow(it, i, i + 1, when(played()[it.id].last), function () { if (isCur(it)) togglePlay(); else playFrom(r, i, 'recent', true); }, 'recent'); }).join('') + '</div>'
            : empty('clock', T('Nothing played yet'), T('The songs you listen to will appear here.'))) + '</section>');
      }
      function queueView() {
        if (cur && qi + 1 >= queue.length) extendQueue();
        var items = cur ? queue.slice(qi, qi + 30) : [];
        return scroller('queue', 'v', topbar('Bellatrix Play', T('Up next')) + '<section class="m-page-view">' +
          summary(' m-queue-summary', 'list', T('Your queue'), T('What plays next'), T('Touch a song to listen to it now.')) + '<div class="m-queue-tools">' + shuffleBtn() + '</div>' +
          (items.length ? '<div class="m-history-list">' + items.map(function (it, k) {
            var at = qi + k;
            return historyRow(it, k, k === 0 ? '<i class="m-eq"><i></i><i></i><i></i></i>' : String(k), k === 0 ? T('Now playing') : addedBy[it.id] ? T('Added by {name}', { name: addedBy[it.id] }) : '', function () { if (at === qi) togglePlay(); else jump(at); }, 'queue');
          }).join('') + '</div>' : empty('list', T('Nothing in the queue yet'), T('Choose a song and the next ones appear here.'))) + '</section>');
      }
      function lyricsPanel() {
        var it = cur;
        fetchLyrics(it);
        var e = LYR[it.id], body;
        if (e.state === 'loading') body = '<p class="m-lyrics-wait">…</p>';
        else if (!e.lines.length) body = '<p class="m-lyrics-none">' + esc(T('No lyrics for this song.')) + '</p>';
        else body = e.lines.map(function (l, i) { return '<p class="m-lyric-line bp-ly" data-ly="' + i + '">' + esc(l.s) + '</p>'; }).join('');
        var src = e.src === 'lrclib' ? T('Lyrics: LRCLIB') : e.src === 'builtin' ? T('Traditional song') : (it.artist || 'Bellatrix Play');
        return '<div class="m-media-backdrop"><section class="m-lyrics-panel" role="dialog" aria-modal="true"><div class="m-media-panel-header"><div><p>' + esc(T('Lyrics')) + '</p><h2>' + esc(it.title) + '</h2><span>' + esc(it.artist || '') + '</span></div>' +
          '<button type="button"' + A('lyrics-close', 'Close the lyrics', closePanel) + ' aria-label="' + esc(T('Close the lyrics')) + '">' + di('close', 24) + '</button></div>' +
          '<div class="m-lyrics-content' + (e.synced || e.even ? ' is-sync' : '') + '" data-s="lyr">' + body + '</div>' +
          '<footer class="m-lyrics-footer">' + art(it.id, 'm-lf-img') + '<div><strong>' + esc(it.title) + '</strong><span>' + esc(src) + '</span></div>' +
          '<button type="button" class="m-mini-play bp-pp"' + A('lyrics-pp', 'Play or pause', togglePlay) + ' aria-label="' + esc(T('Pause')) + '">' + ppIcons(22) + '</button></footer></section></div>';
      }
      /* The clip: the video itself, big (the box with YouTube's player is moved onto this slot). */
      function clipPanel() {
        var it = cur;
        return '<div class="m-video-backdrop"><section class="m-video-panel" role="dialog" aria-modal="true"><div class="m-video-header"><div><span>' + esc(T('Music video')) + '</span><h2>' + esc(it.title) + '</h2></div>' +
          '<div class="m-vh-actions"><button type="button" class="m-tool-button m-on-dark"' + A('clip-lyrics', 'Lyrics', openLyrics) + '>' + di('microphone', 20) + '<span>' + esc(T('Lyrics')) + '</span></button>' +
          '<button type="button" class="m-tool-button m-on-dark"' + A('clip-radio', 'Radio (AI)', function () { startRadio(cur); }) + '>' + di('radio', 20) + '<span>' + esc(T('More like this')) + '</span></button>' +
          '<button type="button" class="m-reduce"' + A('clip-close', 'Reduce the video', closePanel) + '>' + di('minimize', 20) + '<span>' + esc(T('Reduce')) + '</span></button></div></div>' +
          '<div class="m-video-stage"><span class="m-vslot" data-slot="big">' + art(it.id, 'm-vcover') + '</span></div>' +
          '<div class="m-video-controls"><button type="button" class="bp-pp"' + A('clip-pp', 'Play or pause', togglePlay) + ' aria-label="' + esc(T('Pause')) + '">' + ppIcons(22) + '</button>' +
          '<span class="bp-t1">0:00</span><div class="m-video-progress bp-prog"><i></i></div><span class="bp-t2">0:00</span>' + di('volume', 22) + '</div></section></div>';
      }
      /* Premium: no plans and no prices here. The request goes to the care team, who decide. */
      function premiumModal() {
        var inner;
        if (premium()) {
          inner = '<div class="m-premium-success"><span class="m-success-crown">' + di('crown', 44) + '</span><p class="m-section-kicker">' + esc(T('Welcome')) + '</p><h2>' + esc(T('Premium is active')) + '</h2>' +
            '<p>' + esc(T('No ads, skip as often as you like, listen together.')) + '</p><button type="button" class="m-premium-confirm"' + A('premium-ok', 'Premium: close', closePanel) + '>' + esc(T('Start listening')) + '</button></div>';
        } else if (requested) {
          inner = '<div class="m-premium-success"><span class="m-success-crown">' + di('crown', 44) + '</span><p class="m-section-kicker">' + esc(T('Thank you')) + '</p><h2>' + esc(T('Request sent!')) + '</h2>' +
            '<p>' + esc(T('The care team is taking care of it.')) + '</p><button type="button" class="m-premium-confirm"' + A('premium-ok', 'Premium: back to the music', closePanel) + '>' + esc(T('Back to my music')) + '</button></div>';
        } else {
          inner = '<div class="m-modal-heading"><span class="m-premium-badge">' + di('crown', 24) + '</span><p class="m-section-kicker">Bellatrix Play Premium</p><h2>' + esc(T('Listen without any limit')) + '</h2>' +
            '<p>' + esc(T('Ask the care team: they take care of everything.')) + '</p></div><div class="m-premium-benefits">' +
            ['No ads', 'Skip as often as you like', 'Choose the order', 'Listen together with your family', 'Your own podcast list', 'Nothing to pay here'].map(function (b) { return '<span><b>✓</b> ' + esc(T(b)) + '</span>'; }).join('') +
            /* Honest: through YouTube's embedded player, nobody can have these yet. */
            ['Music without internet', 'Better sound'].map(function (b) { return '<span class="m-soon"><b>○</b> ' + esc(T(b)) + ' <small>' + esc(T('coming with the licensed catalogue')) + '</small></span>'; }).join('') + '</div>' +
            '<button type="button" class="m-premium-confirm"' + A('premium-ask', 'Premium: ask the team', askTeam) + '>' + esc(T('Ask for Premium')) + '</button>';
        }
        return '<div class="m-modal-backdrop"><section class="m-premium-modal" role="dialog" aria-modal="true"><button type="button" class="m-modal-close"' + A('premium-close', 'Close', closePanel) + ' aria-label="' + esc(T('Close')) + '">' + di('close', 24) + '</button>' + inner + '</section></div>';
      }
      /* DJ Bellatrix: what plays now, what comes next and why, the DJ's voice on or off. */
      function djView() {
        var KIND = { fav: T('Favourite'), again: T('Rediscovery'), neu: T('New for you') }, up = djOn && cur ? queue.slice(qi + 1, qi + 6) : [];
        var h = topbar('Bellatrix Play', 'DJ Bellatrix') + '<section class="m-dj-hero"><div class="m-dj-copy"><p class="m-hero-kicker">DJ Bellatrix' + aiBadge() + '</p>' +
          '<h2>' + esc(djOn && cur ? cur.title : 'DJ Bellatrix') + '</h2><p>' + esc(djOn && cur ? (cur.artist || '') + (djKind[cur.id] ? ' · ' + KIND[djKind[cur.id]] : '') : T('Your favourites, rediscoveries and new songs, without end.')) + '</p>' +
          '<div class="m-dj-actions">' + (djOn ? '<button type="button" class="m-primary-button"' + A('dj-stop', 'Stop the DJ', function () { djOn = false; queueKey = ''; rebuild(); }) + '><span class="m-play-dot">' + di('close', 19) + '</span>' + esc(T('Stop the DJ')) + '</button>'
            : '<button type="button" class="m-primary-button"' + A('dj-go', 'Start the DJ', startDJ) + '><span class="m-play-dot">' + di('play', 21, true) + '</span>' + esc(T('Start the DJ')) + '</button>') +
          '<button type="button" class="m-dj-voice' + (djVoice ? ' on' : '') + '"' + A('dj-voice', 'DJ voice', function () { djVoice = !djVoice; L.log('Bellatrix Play: DJ voice ' + (djVoice ? 'on' : 'off'), 'result'); rebuild(); }) + ' aria-pressed="' + djVoice + '">' +
          di('microphone', 18) + '<span>' + esc(djVoice ? T('DJ voice: on') : T('DJ voice: off')) + '</span></button></div></div>' +
          '<div class="m-dj-art" aria-hidden="true"><div class="m-record"><div class="m-record-label">' + di('dj', 34) + '</div></div></div></section>';
        if (up.length) h += '<section class="m-content-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Coming up')) + '</p><h2>' + esc(T('Up next')) + '</h2></div></div><div class="m-history-list">' +
          up.map(function (it, k) { return historyRow(it, k, String(k + 1), KIND[djKind[it.id]] || '', function () { jump(qi + 1 + k); }, 'dj'); }).join('') + '</div></section>';
        return scroller('dj', 'v', h);
      }
      /* An approved weekly or monthly playlist, song by song. */
      function plistView() {
        var m = myPlaylists().filter(function (x) { return x.key === view.key; })[0];
        if (!m) { view = { name: 'home' }; return homeView(); }
        var q = queueKey === m.key && !!cur;
        var h = topbar('Bellatrix Play', m.title) + '<section class="m-page-view"><div class="m-page-intro m-pl-intro"><div class="m-page-intro-icon">' + di('calendar', 40) + '</div>' +
          '<div><p class="m-section-kicker">' + esc(T('Prepared for you')) + '</p><h2>' + esc(m.title) + '</h2><span>' + esc(T('{n} songs', { n: m.list.length })) + '</span></div>' +
          '<button type="button" class="m-round-play' + (q ? ' is-q' : '') + '"' + A('plist-play', 'Play: ' + m.title, function () { playPlaylist(m); }) + ' aria-label="' + esc(T('Listen')) + '">' + (q ? ppIcons(27) : di('play', 27, true)) + '</button></div>' +
          '<div class="m-history-list">' + m.list.map(function (it, k) {
            return historyRow(it, k, String(k + 1), it.year && isSong(it) ? String(it.year) : '', function () {
              if (isCur(it)) { togglePlay(); return; }
              if (m.pl.status === 'approved') REC.activate(m.pl.id, srcNow === 'staff' ? 'staff' : 'resident');
              playFrom(m.list, k, m.key, true);
            }, 'pll');
          }).join('') + '</div></section>';
        return scroller('plist', 'v', h);
      }
      var aiQuery = '', aiResult = null;
      function aiKey(k) {
        if (k === null) aiQuery = aiQuery.slice(0, -1);
        else if (k === ' ') { if (aiQuery && aiQuery.slice(-1) !== ' ') aiQuery += ' '; }
        else if (aiQuery.length < 48) aiQuery += k;
        rebuild();
      }
      function createAI(phrase) {
        if (!norm(phrase)) return;
        var r = aiPlaylist(phrase);
        if (!r.list.length) return;
        aiResult = r; aiQuery = phrase;
        L.stat('playAIPlaylists');
        L.log('Bellatrix Play: AI playlist "' + r.title + '", ' + r.list.length + ' songs', 'result');
        playFrom(r.list, 0, 'ai');
      }
      function aiChips() {
        var fav = byArtist(artists().filter(loved))[0] || ARTISTS['Édith Piaf'] || artists()[0];
        return [T('Happy songs from the 60s'), T('Calm music to rest'), fav ? T('Like {artist}', { artist: fav.name }) : '', T('Let’s dance!')].filter(Boolean);
      }
      /* The AI playlist: a phrase (big keyboard or an idea) becomes twenty songs with a title. */
      function aiView() {
        var h = topbar('Bellatrix Play', T('AI playlist'));
        if (aiResult) {
          var q = queueKey === 'ai' && !!cur;
          h += '<div class="m-page-intro m-ai-intro"><div class="m-page-intro-icon m-ai-icon">' + di('sparkle', 40, true) + '</div><div><p class="m-section-kicker">' + esc(T('AI playlist')) + aiBadge() + '</p>' +
            '<h2>' + esc(aiResult.title) + '</h2><span>' + esc(T('{n} songs', { n: aiResult.list.length })) + '</span></div>' +
            '<button type="button" class="m-ai-new"' + A('ai-new', 'New AI playlist', function () { aiResult = null; aiQuery = ''; rebuild(); }) + '>' + esc(T('New playlist')) + '</button>' +
            '<button type="button" class="m-round-play' + (q ? ' is-q' : '') + '"' + A('ai-play', 'Play the AI playlist', function () { if (q) togglePlay(); else playFrom(aiResult.list, 0, 'ai'); }) + ' aria-label="' + esc(T('Listen')) + '">' + (q ? ppIcons(27) : di('play', 27, true)) + '</button></div>' +
            '<div class="m-history-list">' + aiResult.list.map(function (it, k) { return historyRow(it, k, String(k + 1), it.year && isSong(it) ? String(it.year) : '', function () { if (isCur(it)) togglePlay(); else playFrom(aiResult.list, k, 'ai', true); }, 'ail'); }).join('') + '</div>';
          return scroller('ai', 'v', h);
        }
        var keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map(function (k) {
          return '<button type="button" class="m-key"' + A('a-' + k, 'Key ' + k, function () { aiKey(k); }) + '>' + k + '</button>';
        }).join('') +
          '<button type="button" class="m-key fn"' + A('a-space', 'Key space', function () { aiKey(' '); }) + ' aria-label="' + esc(T('Space')) + '">' + di('space', 22) + '</button>' +
          '<button type="button" class="m-key fn"' + A('a-del', 'Key delete', function () { aiKey(null); }) + ' aria-label="' + esc(T('Delete')) + '">' + di('del', 22) + '</button>';
        h += '<div class="m-search-hero">' + di('sparkle', 26, true) + '<span class="m-q' + (aiQuery ? '' : ' is-ph') + '">' + (aiQuery ? esc(aiQuery) + '<i class="m-caret"></i>' : '<i class="m-caret"></i>' + esc(T('Describe your playlist'))) + '</span>' +
          (aiQuery ? '<button type="button"' + A('a-clear', 'Clear', function () { aiQuery = ''; rebuild(); }) + ' aria-label="' + esc(T('Clear the search')) + '">' + di('close', 22) + '</button>' : '') +
          /* "Create" sits in the field, next to the phrase it makes into a playlist. */
          '<button type="button" class="m-ai-create"' + A('ai-create', 'Create the AI playlist', function () { createAI(aiQuery); }) + (norm(aiQuery) ? '' : ' disabled') + '>' + esc(T('Create the playlist')) + '</button></div>' +
          '<div class="m-search-body"><div class="m-kb m-kb-ai">' + keys + '</div><div class="m-ai-side"><p class="m-section-kicker">' + esc(T('Ideas')) + aiBadge() + '</p>' +
          aiChips().map(function (c, k) { return '<button type="button" class="m-ai-chip"' + A('chip-' + k, 'AI idea: ' + c, function () { createAI(c); }) + '>' + di('sparkle', 15, true) + '<span>' + esc(c) + '</span></button>'; }).join('') + '</div></div>';
        return '<div class="m-page m-search-page m-ai-page">' + h + '</div>';
      }
      /* ---------- 1.16: "Your mixes" (Reco.mixes, with the music consent) ---------- */
      function myMixes() {
        if (!RS || !consentOn || !Reco.mixes) return [];
        return memo('mixes', function () {
          var out = [];
          try {
            Reco.mixes({ songs: RS, profile: prof(), liked: hearts(), exclude: exSet(), n: 3, k: 25, residentId: patient, day: new Date().toDateString(), premium: premium() }).forEach(function (m) {
              var list = toItems(m.list).filter(free);
              if (list.length >= 6) out.push({ key: m.key, title: T('{style} mix', { style: m.genre === 'chanson' ? T('French chanson') : genreName(m.genre) }), sub: names(list), list: list, decade: m.decade });
            });
          } catch (e) { out = []; }
          return out;
        });
      }
      function mixCard(m) {
        var q = queueKey === m.key && !!cur;
        return '<div class="m-pl-card m-mix-card"><button type="button" class="m-pl-open"' + A(m.key + '-open', 'Open: ' + m.key, function () { view = { name: 'mix', key: m.key }; panel = null; rebuild(); }) + '>' +
          '<span class="m-pl-covers">' + m.list.slice(0, 4).map(function (it) { return art(it.id, 'm-pl-img'); }).join('') + '</span>' +
          '<span class="m-pl-tx"><small>' + esc(T('Made for you')) + '</small><strong>' + esc(m.title) + '</strong><span>' + esc(m.sub) + '</span></span></button>' +
          '<button type="button" class="m-round-play' + (q ? ' is-q' : '') + '"' + A(m.key + '-play', 'Play: ' + m.title, function () { if (q) togglePlay(); else { L.stat('playMixes'); playFrom(m.list, 0, m.key); } }) + ' aria-label="' + esc(T('Listen')) + '">' + (q ? ppIcons(27) : di('play', 27, true)) + '</button></div>';
      }
      function mixView() {
        var m = myMixes().filter(function (x) { return x.key === view.key; })[0];
        if (!m) { view = { name: 'home' }; return homeView(); }
        var q = queueKey === m.key && !!cur;
        var h = topbar('Bellatrix Play', m.title) + '<section class="m-page-view"><div class="m-page-intro m-pl-intro"><div class="m-page-intro-icon">' + di('sparkle', 40, true) + '</div>' +
          '<div><p class="m-section-kicker">' + esc(T('Made for you')) + aiBadge() + '</p><h2>' + esc(m.title) + '</h2><span>' + esc(T('{n} songs', { n: m.list.length })) + '</span></div>' +
          '<button type="button" class="m-round-play' + (q ? ' is-q' : '') + '"' + A('mix-play', 'Play: ' + m.title, function () { if (q) togglePlay(); else playFrom(m.list, 0, m.key); }) + ' aria-label="' + esc(T('Listen')) + '">' + (q ? ppIcons(27) : di('play', 27, true)) + '</button></div>' +
          '<div class="m-history-list">' + m.list.map(function (it, k) {
            return historyRow(it, k, String(k + 1), it.year && isSong(it) ? String(it.year) : '', function () { if (isCur(it)) togglePlay(); else playFrom(m.list, k, m.key, true); }, 'mixl');
          }).join('') + '</div></section>';
        return scroller('mix', 'v', h);
      }

      /* ---------- 1.16: the podcasts tab ---------- */
      function podTile(sh) {
        var c = window.Podcasts ? Podcasts.cached(sh.id) : null, img = c && c.image;
        return '<button type="button" class="m-pod-tile"' + A('pod-' + sh.id, 'Podcast: ' + sh.title, function () { openShow(sh.id); }) + '>' +
          '<span class="m-pod-art" style="background:' + PODC[hash(sh.id) % PODC.length] + '"><b>' + esc(sh.title.charAt(0)) + '</b>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</span>' +
          '<span class="m-pod-tx"><strong>' + esc(sh.title) + '</strong><small>' + esc(sh.by) + ' · ' + esc(T(Podcasts.TOPICS[sh.topic] || 'Podcast')) + '</small></span></button>';
      }
      function podArt(ep, cls) {
        var sh = Podcasts.show(ep.show) || { id: ep.show || 'x', title: '?' }, img = ep.image || (Podcasts.cached(sh.id) || {}).image;
        return '<span class="bp-art m-pod-art ' + cls + '" style="background:' + PODC[hash(sh.id) % PODC.length] + '"><b>' + esc(sh.title.charAt(0)) + '</b>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</span>';
      }
      function isPodCur(ep) { return !!pod && mode === 'pod' && pod.ep.id === ep.id; }
      /* One episode: play (the whole left part), download, and "My podcasts" (Premium). */
      function epRow(ep, i, key, opt) {
        opt = opt || {};
        var c = isPodCur(ep), dl = Podcasts.downloaded(ep.id), busy = Podcasts.downloading(ep.id), can = Podcasts.canDownload(ep), inL = Podcasts.inList(patient, ep.id);
        var meta = [ep.date ? when(ep.date) : '', Podcasts.fmtDur(ep.dur), dl ? Podcasts.fmtSize(dl.size, lang) : ''].filter(Boolean).join(' · ');
        var dlBtn;
        if (opt.del) {
          var sure = podAsk && podAsk.id === ep.id && Date.now() < podAsk.until;
          dlBtn = '<button type="button" class="m-ep-btn m-ep-del' + (sure ? ' sure' : '') + '"' + A(key + '-del-' + i, 'Delete the download: ' + ep.title, function () { askDelete(ep.id, function () { delEpisode(ep.id); }); }) + ' aria-label="' + esc(T('Remove download')) + '">' + di('trash', 20) + '<span>' + esc(sure ? T('Remove it?') : T('Remove download')) + '</span></button>';
        } else if (dl) dlBtn = '<span class="m-ep-btn m-ep-done">' + di('check', 20) + '<span>' + esc(T('On the robot')) + '</span></span>';
        else if (busy) dlBtn = '<span class="m-ep-btn m-ep-busy">' + di('download', 20) + '<span data-dl="' + ep.id + '">' + Math.round(busy * 100) + ' %</span></span>';
        else if (can) dlBtn = '<button type="button" class="m-ep-btn"' + A(key + '-dl-' + i, 'Download: ' + ep.title, function () { download(ep); }) + '>' + di('download', 20) + '<span>' + esc(ep.size ? Podcasts.fmtSize(ep.size, lang) : '≈ ' + Podcasts.fmtSize(Podcasts.guessSize(ep), lang)) + '</span></button>';
        else dlBtn = '<span class="m-ep-btn m-ep-online">' + di('radio', 20) + '<span>' + esc(T('Online only')) + '</span></span>';
        var listBtn = opt.del ? '' : '<button type="button" class="m-ep-btn m-ep-add' + (inL ? ' on' : '') + '"' + A(key + '-list-' + i, (inL ? 'Remove from my podcasts: ' : 'Add to my podcasts: ') + ep.title, function () { toggleList(ep); }) +
          ' aria-pressed="' + inL + '" aria-label="' + esc(inL ? T('Remove from my podcasts') : T('Add to my podcasts')) + '">' + di(inL ? 'check' : 'listadd', 20) + (premium() ? '' : '<span class="m-lock">' + di('crown', 10) + '</span>') + '</button>';
        return '<div class="m-ep-row' + (c ? ' is-cur' : '') + '"><button type="button" class="m-ep-main"' + A(key + '-' + i, 'Podcast episode: ' + ep.title, function () { playEpisode(ep); }) + '>' + podArt(ep, 'm-hthumb') +
          '<span class="m-history-song"><strong>' + esc(ep.title) + '</strong><small>' + esc(meta) + '</small></span><span class="m-history-play' + (c ? ' is-cur' : '') + '">' + (c ? ppIcons(18) : di('play', 18, true)) + '</span></button>' + dlBtn + listBtn + '</div>';
      }
      function podsView() {
        if (!window.Podcasts) return scroller('pods', 'v', topbar('Bellatrix Play', T('Podcasts')) + empty('pod', T('No podcasts here'), T('Ask the care team.')));
        var mine = Podcasts.shows(lang), others = Podcasts.SHOWS.filter(function (x) { return x.lang !== lang; }), dls = Podcasts.downloads(), list = Podcasts.list(patient);
        var h = topbar('Bellatrix Play', T('Podcasts'));
        if (dls.length) {
          var sure = podAsk && podAsk.id === 'all' && Date.now() < podAsk.until;
          h += '<section class="m-content-section m-first"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('To listen without internet')) + '</p><h2>' + esc(T('On the robot')) + '</h2>' +
            '<span class="m-pod-total">' + esc(dls.length === 1 ? T('1 episode, {size}', { size: Podcasts.fmtSize(Podcasts.totalSize(), lang) }) : T('{n} episodes, {size}', { n: dls.length, size: Podcasts.fmtSize(Podcasts.totalSize(), lang) })) + '</span></div>' +
            '<button type="button" class="m-see-all m-del-all' + (sure ? ' sure' : '') + '"' + A('pod-del-all', 'Delete all downloads', function () { askDelete('all', delAll); }) + '>' + di('trash', 19) + ' ' + esc(sure ? T('Delete them all?') : T('Delete all')) + '</button></div>' +
            '<div class="m-history-list">' + dls.map(function (d, i) { return epRow(d, i, 'dl', { del: true }); }).join('') + '</div></section>';
        }
        if (premium() && list.length) {
          h += '<section class="m-content-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Your collection')) + '</p><h2>' + esc(T('My podcasts')) + '</h2></div></div>' +
            '<div class="m-history-list">' + list.map(function (e, i) { return epRow(e, i, 'mine'); }).join('') + '</div></section>';
        }
        h += '<section class="m-content-section' + (dls.length || (premium() && list.length) ? '' : ' m-first') + '"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('Free, from public radio')) + '</p><h2>' + esc(T('Podcasts to discover')) + '</h2></div></div>' +
          '<div class="m-pod-grid">' + mine.map(podTile).join('') + '</div></section>';
        if (others.length) {
          h += '<section class="m-content-section"><button type="button" class="m-see-all m-pod-more"' + A('pod-other', 'Podcasts: other languages', function () { podOther = !podOther; rebuild(); }) + '>' + esc(T('Other languages')) + ' ' + di(podOther ? 'up' : 'down', 19) + '</button>' +
            (podOther ? '<div class="m-pod-grid">' + others.map(podTile).join('') + '</div>' : '') + '</section>';
        }
        return scroller('pods', 'v', h);
      }
      function showView() {
        var sh = window.Podcasts && Podcasts.show(view.show);
        if (!sh) { view = { name: 'pods' }; return podsView(); }
        var x = PODS[sh.id] || { state: 'loading' }, f = x.feed, body;
        if (x.state === 'loading') body = '<p class="m-lyrics-wait m-pod-wait">…</p>';
        else if (x.state === 'error' || !f) body = empty('pod', T('The podcasts need internet right now.'), T('The episodes on the robot still play.')) +
          '<div class="m-pod-retry"><button type="button" class="m-primary-button"' + A('pod-retry', 'Podcast: try again', function () { loadShow(sh.id, true); rebuild(); }) + '>' + esc(T('Try again')) + '</button></div>';
        else body = '<div class="m-history-list">' + f.episodes.slice(0, 25).map(function (e, i) { return epRow(e, i, 'ep'); }).join('') + '</div>';
        /* the show's name, often long, is in the intro below (it wraps there); the top bar says where we are */
        var h = topbar('Bellatrix Play', T('Podcasts')) + '<section class="m-page-view"><div class="m-page-intro m-pod-intro">' + podArt({ show: sh.id, image: f && f.image }, 'm-page-intro-icon') +
          '<div><p class="m-section-kicker">' + esc(T(Podcasts.TOPICS[sh.topic] || 'Podcast')) + '</p><h2>' + esc(sh.title) + '</h2><span>' + esc(sh.by + (f && f.from === 'copy' ? ' · ' + T('List saved on the robot') : '')) + '</span></div>' +
          '<button type="button" class="m-ai-new"' + A('pod-back', 'Back to the podcasts', function () { tabTo('pods'); }) + '>' + esc(T('All the podcasts')) + '</button></div>' + body + '</section>';
        return scroller('show', 'v', h);
      }

      /* ---------- 1.16: listening together ---------- */
      function togetherView() {
        var v = tog && tog.view, st = tog ? tog.state : '', title, text, btns = '';
        if (!tog) {
          title = togErr === 'noserver' ? T('The family portal is not set up on this robot.') : togErr === 'resident' ? T('Your family is not on the portal yet.') : togErr === 'ended' ? T('Listening together has ended.') : togErr ? T('No connection to the family portal.') : T('Listen together');
          text = togErr === 'noserver' || togErr === 'resident' ? T('The care team can help.') : T('Your family listens with you from their phone.');
          btns = togErr === 'noserver' ? '' : '<button type="button" class="m-primary-button"' + A('tog-start', 'Listen together: start', togetherStart) + '><span class="m-play-dot">' + di('together', 21) + '</span>' + esc(togErr ? T('Try again') : T('Listen together now')) + '</button>';
        } else if (st === 'opening') { title = T('Opening…'); text = T('Your family listens with you from their phone.'); }
        else {
          var n = v ? v.listeners : [];
          title = n.length ? T('{names} is listening with you.', { names: n.slice(0, 3).join(', ') }) : T('Your family can join now.');
          text = tog.fails >= 3 ? T('No connection to the family portal.') : T('They see the song and can add songs here.');
          btns = '<button type="button" class="m-primary-button"' + A('tog-stop', 'Listen together: stop', function () { togetherStop(); }) + '><span class="m-play-dot">' + di('close', 19) + '</span>' + esc(T('Stop listening together')) + '</button>';
        }
        var h = topbar('Bellatrix Play', T('Listen together')) + '<section class="m-dj-hero m-tog-hero"><div class="m-dj-copy"><p class="m-hero-kicker">' + esc(T('Listen together')) + '</p>' +
          '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="m-dj-actions">' + btns + '</div></div>' +
          '<div class="m-dj-art" aria-hidden="true"><div class="m-record"><div class="m-record-label">' + di('together', 34) + '</div></div></div></section>';
        var added = queue.slice(qi + 1).filter(function (it) { return addedBy[it.id]; });
        if (tog && added.length) h += '<section class="m-content-section"><div class="m-section-heading"><div><p class="m-section-kicker">' + esc(T('From your family')) + '</p><h2>' + esc(T('Up next')) + '</h2></div></div><div class="m-history-list">' +
          added.map(function (it, k) { return historyRow(it, k, String(k + 1), T('Added by {name}', { name: addedBy[it.id] }), function () { jump(queue.indexOf(it)); }, 'tog'); }).join('') + '</div></section>';
        return scroller('together', 'v', h);
      }
      function homeCards() {
        var prem = premium();
        return '<section class="m-ai-row m-ai-row-4">' +
          '<button type="button" class="m-ai-card m-ai-dj"' + A('dj-start', 'DJ Bellatrix (AI)', function () { if (djOn) { view = { name: 'dj' }; panel = null; rebuild(); } else startDJ(); }) + '>' +
          '<span class="m-ai-ic">' + di('dj', 30) + '</span><span class="m-ai-tx"><strong>DJ Bellatrix' + aiBadge() + '</strong><small>' + esc(T('Your favourites, rediscoveries and new songs, without end.')) + '</small></span>' +
          '<span class="m-play-dot">' + di('play', 21, true) + '</span></button>' +
          '<button type="button" class="m-ai-card m-ai-pl"' + A('ai-open', 'AI playlist', function () { aiResult = null; aiQuery = ''; view = { name: 'ai' }; panel = null; rebuild(); }) + '>' +
          '<span class="m-ai-ic">' + di('sparkle', 30, true) + '</span><span class="m-ai-tx"><strong>' + esc(T('AI playlist')) + aiBadge() + '</strong><small>' + esc(T('Say what you would like to hear.')) + '</small></span>' +
          '<span class="m-play-dot">' + di('chevron', 21) + '</span></button>' +
          '<button type="button" class="m-ai-card m-ai-pod"' + A('pods-open', 'Podcasts', function () { tabTo('pods'); }) + '>' +
          '<span class="m-ai-ic">' + di('pod', 30) + '</span><span class="m-ai-tx"><strong>' + esc(T('Podcasts')) + '</strong><small>' + esc(T('Stories, history and music to listen to.')) + '</small></span>' +
          '<span class="m-play-dot">' + di('chevron', 21) + '</span></button>' +
          '<button type="button" class="m-ai-card m-ai-tog"' + A('tog-open', 'Listen together', function () { if (!prem) { openPanel('premium'); return; } view = { name: 'together' }; panel = null; if (!tog && !togErr) togetherStart(); else rebuild(); }) + '>' +
          '<span class="m-ai-ic">' + di('together', 30) + '</span><span class="m-ai-tx"><strong>' + esc(T('Listen together')) + '</strong><small>' + esc(tog ? T('Your family is with you.') : T('With your family, from their phone.')) + '</small></span>' +
          '<span class="m-play-dot">' + (prem ? di('chevron', 21) : di('crown', 19)) + '</span></button></section>';
      }
      function podBar() {
        var ep = pod.ep, sh = pod.show;
        return '<div class="m-player m-player-pod" role="region" aria-label="' + esc(T('Music player')) + '"><div class="m-now-playing">' + podArt(ep, 'm-np-img m-np-pod') + '<div><strong>' + esc(ep.title) + '</strong><span>' + esc(sh ? sh.title : '') + '</span></div></div>' +
          '<div class="m-player-center"><div class="m-transport">' +
            '<button type="button" class="m-skip-btn"' + A('pod-back15', 'Podcast: 15 seconds back', function () { podJump(-15); }) + ' aria-label="' + esc(T('15 seconds back')) + '">' + di('rewind', 23) + '<small>15</small></button>' +
            '<button type="button" class="m-main-play bp-pp"' + A('pp', 'Play or pause', podToggle) + ' aria-label="' + esc(T('Pause')) + '">' + ppIcons(31) + '</button>' +
            '<button type="button" class="m-skip-btn"' + A('pod-fwd30', 'Podcast: 30 seconds on', function () { podJump(30); }) + ' aria-label="' + esc(T('30 seconds on')) + '">' + di('forward', 23) + '<small>30</small></button>' +
          '</div><div class="m-progress-row"><span class="bp-t1">0:00</span><div class="m-progress bp-prog"><i></i></div><span class="bp-t2">0:00</span></div></div>' +
          '<div class="m-player-tools">' +
            '<button type="button" class="m-tool-button"' + A('pod-episodes', 'Podcast: the episodes', function () { if (sh) openShow(sh.id); else tabTo('pods'); }) + '>' + di('pod', 21) + '<span>' + esc(T('Episodes')) + '</span></button>' +
            (cur ? '<button type="button" class="m-tool-button"' + A('pod-music', 'Back to the music', function () { togglePlay(); }) + '>' + di('note', 21) + '<span>' + esc(T('Music')) + '</span></button>' : '') +
            '<div class="m-volume-control"><button type="button" class="m-vol-btn"' + A('quieter', 'Quieter', function () { setVol(vol - 10); }) + ' aria-label="' + esc(T('Quieter')) + '">' + di('minus', 20) + '</button>' +
            '<span class="m-vol bp-vol"><i style="width:' + vol + '%"></i></span>' +
            '<button type="button" class="m-vol-btn"' + A('louder', 'Louder', function () { setVol(vol + 10); }) + ' aria-label="' + esc(T('Louder')) + '">' + di('plus', 20) + '</button></div>' +
          '</div></div>';
      }
      /* Up next: the shuffle (Premium chooses; free: on, the crown says why). */
      function shuffleBtn() {
        var prem = premium(), on = prem ? shufflePref : true;
        return '<button type="button" class="m-ai-new m-shuffle' + (on ? ' on' : '') + '"' + A('shuffle', 'Shuffle ' + (on ? 'on' : 'off'), function () {
          if (!prem) { openPanel('premium'); return; }
          shufflePref = !shufflePref;
          L.log('Bellatrix Play: shuffle ' + (shufflePref ? 'on' : 'off'), 'result');
          if (cur && queueKey && PlayRules.shuffles(queueKey, true, true)) {
            var done = queue.slice(0, qi + 1), seen = {};
            done.forEach(function (it) { seen[it.id] = 1; });
            var rest = shufflePref ? PlayRules.shuffle(queue.slice(qi + 1), -1, queueKey + '|' + Date.now()) : queueSrc.filter(function (it) { return !seen[it.id]; });
            queue = done.concat(rest);
          }
          rebuild();
        }) + ' aria-pressed="' + on + '">' + di('shuffle', 19) + ' ' + esc(on ? T('Shuffle: on') : T('Shuffle: off')) + (prem ? '' : ' ' + di('crown', 15)) + '</button>';
      }

      function sidebar() {
        function nav(name, icon, label) {
          var on = view.name === name || (name === 'pods' && view.name === 'show');
          return '<button type="button" class="m-nav-item' + (on ? ' active' : '') + '"' + A('nav-' + name, 'Tab: ' + name, function () { tabTo(name); }) + '>' + di(icon, 24) + '<span>' + esc(label) + '</span></button>';
        }
        var prem = premium();
        /* While a song is loaded its video stays here, at least 200 x 200 screen pixels (YouTube's
           rule for embedded players); touching it opens the clip. */
        var vid = cur && mode === 'song' && panel !== 'clip' ? '<button type="button" class="m-side-video"' + A('video-open', 'Open the clip', openClip) + ' aria-label="' + esc(T('Music video')) + '"><span class="m-vslot" data-slot="side">' + art(cur.id, 'm-vcover') + '</span></button>' : '';
        return '<aside class="m-sidebar"><div class="m-brand"><span class="m-brand-mark">b</span><span>Bellatrix Play</span></div><nav class="m-main-nav">' +
          nav('home', 'home', T('Home')) + nav('fav', 'heart', T('My favourites')) + nav('search', 'search', T('Search')) + nav('pods', 'pod', T('Podcasts')) + nav('recent', 'clock', T('Recently played')) + '</nav>' +
          /* With the bigger buttons there is room for either the Premium card or the video: while a
             song is loaded the video takes its place (Premium stays on Home and on the Lyrics crown). */
          (vid ? '' : '<button type="button" class="m-premium-sidebar"' + A('premium-side', 'Premium', function () { openPanel('premium'); }) + '><span class="m-premium-icon">' + di('crown', 19) + '</span><span><strong>' +
          esc(prem ? T('Premium active') : T('Ask for Premium')) + '</strong><small>' + esc(prem ? T('Your music without limits') : requested ? T('Request sent') : T('No ads, unlimited skips')) + '</small></span></button>') + vid +
          '<div class="m-sidebar-help"><button type="button" class="m-help" data-a="help" data-b="help">' + di('help', 22) + '<span><strong>' + esc(T('Need help?')).replace(/ ([?!:;])/g, ' $1') + '</strong></span></button>' +
          '<button type="button" class="m-end"' + A('finish', 'Finish', finishPlay) + '>' + di('close', 18) + '<span>' + esc(T('Finish')) + '</span></button></div></aside>';
      }
      function playerBar() {
        if (mode === 'pod' && pod) return podBar();
        var it = cur, dis = it ? '' : ' disabled', lock = '';
        var np = it ? art(it.id, 'm-np-img') + '<div><strong>' + esc(it.title) + '</strong><span>' + esc(it.artist || ' ') + '</span></div>' + likeBtn(it, 'bar', 24)
          : '<span class="bp-art m-np-img">' + ic('note') + '</span><div><strong>' + esc(T('Choose a song')) + '</strong><span>Bellatrix Play</span></div>';
        return '<div class="m-player" role="region" aria-label="' + esc(T('Music player')) + '"><div class="m-now-playing">' + np + '</div>' +
          '<div class="m-player-center"><div class="m-transport">' +
            /* "Not this song": the resident stops it; it is left out of the next playlist. */
            '<button type="button" class="m-tool-stop"' + A('stop-bar', 'Not this song' + (it ? ': ' + who(it) : ''), stopSong) + dis + ' aria-label="' + esc(T('Not this song')) + '" title="' + esc(T('Not this song')) + '">' + di('ban', 21) + '</button>' +
            '<button type="button"' + A('prev', 'Previous', prev) + dis + ' aria-label="' + esc(T('Previous song')) + '">' + di('previous', 25) + '</button>' +
            '<button type="button" class="m-main-play bp-pp"' + A('pp', 'Play or pause', togglePlay) + dis + ' aria-label="' + esc(T('Pause')) + '">' + ppIcons(31) + '</button>' +
            '<button type="button"' + A('next', 'Next', function () { next('skip'); }) + dis + ' aria-label="' + esc(T('Next song')) + '">' + di('next', 25) + '</button>' +
            /* "Next song": the three proposals, at any time (they also come by themselves near the end). */
            '<button type="button" class="m-tool-next' + (nextOpen ? ' active' : '') + '"' + A('next-open', 'Next song', function () { if (nextOpen) closeNext(); else { if (panel) panel = null; if (view.name === 'search' || view.name === 'ai') view = { name: 'home' }; openNext(); } }) + dis + ' aria-label="' + esc(T('Next song')) + '" title="' + esc(T('Next song')) + '">' + di('sparkle', 22, true) + '</button>' +
          '</div><div class="m-progress-row"><span class="bp-t1">0:00</span><div class="m-progress bp-prog"><i></i></div><span class="bp-t2">0:00</span></div></div>' +
          '<div class="m-player-tools">' +
            '<button type="button" class="m-tool-button' + (panel === 'lyrics' ? ' active' : '') + '"' + A('lyrics', 'Lyrics', function () { if (panel === 'lyrics') closePanel(); else openLyrics(); }) + dis + '>' + di('microphone', 21) + '<span>' + esc(T('Lyrics')) + '</span>' + lock + '</button>' +
            '<button type="button" class="m-tool-button' + (panel === 'clip' ? ' active' : '') + '"' + A('clip', 'Clip', function () { if (panel === 'clip') closePanel(); else openClip(); }) + dis + '>' + di('video', 21) + '<span>' + esc(T('Clip')) + '</span></button>' +
            '<div class="m-volume-control"><button type="button" class="m-vol-btn"' + A('quieter', 'Quieter', function () { setVol(vol - 10); }) + ' aria-label="' + esc(T('Quieter')) + '">' + di('minus', 20) + '</button>' +
            '<span class="m-vol bp-vol"><i style="width:' + vol + '%"></i></span>' +
            '<button type="button" class="m-vol-btn"' + A('louder', 'Louder', function () { setVol(vol + 10); }) + ' aria-label="' + esc(T('Louder')) + '">' + di('plus', 20) + '</button>' +
            '<button type="button" class="m-vol-btn' + (view.name === 'queue' ? ' active' : '') + '"' + A('queue', 'Up next', function () { if (view.name === 'queue') tabTo('home'); else tabTo('queue'); }) + ' aria-label="' + esc(T('Up next')) + '">' + di('list', 23) + '</button></div>' +
          '</div></div>';
      }
      function build() {
        acts = {}; nAct = 0; used = {};
        if ((panel === 'clip' || panel === 'lyrics') && !cur) panel = null;
        var v = view.name;
        if (mode === 'pod' && (panel === 'clip' || panel === 'lyrics')) panel = null;
        var inner = v === 'search' ? searchView() : v === 'fav' ? favView() : v === 'recent' ? recentView() : v === 'queue' ? queueView() : v === 'dj' ? djView() : v === 'ai' ? aiView() : v === 'plist' ? plistView() :
          v === 'pods' ? podsView() : v === 'show' ? showView() : v === 'together' ? togetherView() : v === 'mix' ? mixView() : homeView();
        var over = panel === 'lyrics' ? lyricsPanel() : panel === 'clip' ? clipPanel() : panel === 'premium' ? premiumModal() : '';
        /* The next-song cards sit over the bottom of the page, never over the video or a keyboard. */
        if (nextOpen && (!cur || panel || view.name === 'search' || view.name === 'ai')) nextOpen = false;
        if (toast && Date.now() > toast.until) toast = null;
        if (adNow) nextOpen = false;
        return '<div class="bp m-app v-' + view.name + (playingNow() ? ' is-playing' : '') + (cur && mode === 'song' && panel !== 'clip' ? ' has-video' : '') + (mode === 'pod' ? ' is-pod' : '') + '">' + sidebar() + '<main class="m-main">' + inner + (nextOpen ? nextSheet() : '') +
          (adNow ? adSheet() : '') + (toast && !adNow ? '<p class="m-toast" role="status">' + esc(toast.text) + '</p>' : '') + '</main>' + playerBar() + over + '</div>';
      }
      function rebuild() {
        if (gone) return;
        main.body = build();
        main.actions = acts;
        if (L.step() === main) L.refresh();
      }

      /* Scrolling: by touch, or with the big round arrows (pointing cannot swipe). The position of
         each list is kept while the resident moves around. */
      function arrows(el) {
        var h = el.getAttribute('data-d') === 'h', pos = h ? el.scrollLeft : el.scrollTop,
          max = h ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight, kids = el.parentNode ? el.parentNode.children : [];
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].classList.contains('bp-arr-prev')) kids[i].classList.toggle('off', pos <= 10);
          else if (kids[i].classList.contains('bp-arr-next')) kids[i].classList.toggle('off', pos >= max - 10);
        }
      }
      function allArrows() { Array.prototype.forEach.call(screenEl.querySelectorAll('[data-s]'), arrows); }
      function onScroll(e) {
        var el = e.target, k = el && el.getAttribute ? el.getAttribute('data-s') : null;
        if (!k) return;
        scrollMem[vkey() + '|' + k] = [el.scrollLeft, el.scrollTop];
        arrows(el);
      }
      function scrollStep(key, dir) {
        var el = screenEl.querySelector('[data-s="' + key + '"]');
        if (!el) return;
        var h = el.getAttribute('data-d') === 'h', d = Math.round((h ? el.clientWidth : el.clientHeight) * 0.8) * dir;
        try { el.scrollBy({ left: h ? d : 0, top: h ? 0 : d, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
        catch (e) { if (h) el.scrollLeft += d; else el.scrollTop += d; }
      }
      function afterRender(root) {
        themeOn();
        Array.prototype.forEach.call(root.querySelectorAll('[data-s]'), function (el) {
          var m = scrollMem[vkey() + '|' + el.getAttribute('data-s')];
          if (m) { el.scrollLeft = m[0]; el.scrollTop = m[1]; }
          arrows(el);
        });
        paint(); paintProgress(); place();
        setTimeout(function () { if (!gone) { place(); allArrows(); } }, 80);
      }
      function tick() {
        if (gone) return;
        /* A DJ line cut short: the music comes back to its volume anyway. */
        if (ducking && Date.now() - duckAt > 12000) { ducking = false; ytCall('setVolume', vol); }
        L.stat('playMinutes', mins(listened + playedMs + running()));
        /* Help from the care team: the music waits, and goes on when help is closed. */
        var help = !!screenEl.querySelector('.overlay');
        if (help && intent && !helpPaused) { helpPaused = true; ytCall('pauseVideo'); }
        else if (!help && helpPaused) { helpPaused = false; intent = true; ytCall('playVideo'); }
        /* the same for a podcast */
        if (help && mode === 'pod' && podIntent && !podHelp) { podHelp = true; try { au.pause(); } catch (e) { /* not playing */ } }
        else if (!help && podHelp) { podHelp = false; if (mode === 'pod' && au) { var pp = au.play(); if (pp && pp.catch) pp.catch(function () { podIntent = false; paint(); }); } }
        if (mode === 'pod' && pod && podIntent && Date.now() % 15000 < 1000) podSave();
        if (toast && Date.now() > toast.until) { toast = null; rebuild(); }
        if (podAsk && Date.now() > podAsk.until) { podAsk = null; rebuild(); }
        if (tog && tog.state === 'open' && ++tog.n % 5 === 0) togPoll();
        /* Autoplay refused (no tap yet): show the play button instead of a pause button. */
        if (intent && !started && ytReady && Date.now() - loadedAt > 6000 && [-1, 5].indexOf(ytNum('getPlayerState')) >= 0) { intent = false; paint(); }
        /* A very long film: stop after the time the care team chose, plus ten minutes at most. */
        var podRun = podSince ? Date.now() - podSince : 0;
        if ((cur || pod) && listened + playedMs + running() + podMs + podRun > limit + 600000) { enough(); return; }
        /* The last 30 seconds of a song: the next-song cards come by themselves (once per song). */
        if (cur && mode === 'song' && !adNow && started && intent && RS && !nextOpen && !panel && !nextShut[cur.id] && view.name !== 'search' && view.name !== 'ai') {
          var dd = ytNum('getDuration'), tt = ytNum('getCurrentTime');
          if (dd > 45 && dd - tt <= 30 && dd - tt > 2) openNext();
        }
        paintProgress(); place(); allArrows();
      }

      /* ---------- the other screens: no internet, videos that cannot play, time is up ---------- */
      function msgStep(id, line, buttons, extra) {
        var a = {}, h = '';
        buttons.forEach(function (b, i) {
          a[i] = { label: b.log, run: b.run };
          h += '<button type="button" class="bp-msgbtn' + (b.primary ? ' is-pri' : '') + '" data-a="a" data-i="' + i + '" data-b="p-' + b.key + '">' + esc(b.label) + '</button>';
        });
        var st = {
          id: id, _play: true, cls: 'bp-screen', back: false, noHistory: true, noReprompt: true, noAirHint: true, airPointer: true,
          free: function () { return true; }, say: line, actions: a, leave: checkLeave,
          body: '<div class="bp bp-msg"><div class="bp-face">' + Lab.faceHtml('hero') + '</div><p class="bp-line">' + esc(line) + '</p><div class="bp-msgbtns">' + h + '</div></div>'
        };
        Object.keys(extra || {}).forEach(function (k) { st[k] = extra[k]; });
        return st;
      }
      function backToMusic() { failures = 0; ending = false; L.go(main, { clear: true }); }
      function offline() {
        if (gone || ending || (L.step() && L.step().id === 'play-offline')) return;
        L.log('Bellatrix Play: no internet, built-in calm music instead', 'error');
        pauseAll();
        var offBtns = [
          { key: 'retry', label: T('Try again'), log: 'Try again', primary: true, run: function () { L.stopMusic(); backToMusic(); youtube().then(function () { if (cur) load(cur); }, offline); } },
          { key: 'finish', label: T('Finish'), log: 'Finish', run: function () { L.stopMusic(); finishPlay(); } }
        ];
        /* 1.16: the podcast episodes kept on the robot play without internet */
        if (window.Podcasts && Podcasts.downloads().length) offBtns.splice(1, 0, { key: 'pods', label: T('My downloaded podcasts'), log: 'Downloaded podcasts', run: function () { L.stopMusic(); cur = null; queue = []; view = { name: 'pods' }; main.body = build(); main.actions = acts; backToMusic(); } });
        L.go(msgStep('play-offline', T('No internet. Here is my calm music.'), offBtns, {
          afterSay: function () { L.music(Music.MOODS.calm.songs.map(Music.byId), { tempo: Music.MOODS.calm.tempo, wave: 'sine', seconds: 120, onEnd: function () { finishPlay(); } }); }
        }), { clear: true });
      }
      function problem() {
        if (gone || ending) return;
        pauseAll(); ytCall('stopVideo');
        L.go(msgStep('play-problem', T('This music cannot play right now.'), [
          { key: 'home', label: T('Home'), log: 'Back to Home', primary: true, run: function () { cur = null; queue = []; stack = []; view = { name: 'home', tab: 'home' }; main.body = build(); main.actions = acts; backToMusic(); } },
          { key: 'finish', label: T('Finish'), log: 'Finish', run: finishPlay }
        ]), { clear: true });
      }
      function enough() {
        if (gone || ending) return;
        ending = true;
        pauseAll();
        L.go(msgStep('play-enough', T('That was a lovely moment of music.'), [{ key: 'finish', label: T('Finish'), log: 'Finish', primary: true, run: finishPlay }]), { clear: true });
      }

      /* ---------- the one Bellatrix Play step ---------- */
      var said = false, firstPlay = null;
      var main = {
        id: 'play-app', _play: true, cls: 'bp-screen', back: false, noHistory: true, noReprompt: true, noAirHint: true, airPointer: true,
        /* One short sentence when the music opens, never again. */
        say: function () { if (said) return ''; said = true; return T('Here is your music.'); },
        afterSay: function () { if (firstPlay) { var f = firstPlay; firstPlay = null; f(); } },
        /* Words heard (English voice answers) are never taken for a button: songs have words too. */
        free: function () { return true; },
        enter: function () { themeOn(); L.every(tick, 1000); L.every(syncLyrics, 300); },
        after: afterRender,
        leave: function () {
          clock(); listened += playedMs; playedMs = 0;
          L.stat('playMinutes', mins(listened));
          if (box) { box.className = 'bp-yt hide'; lastPlace = 'hide'; }
          checkLeave();
        },
        body: '', actions: {}
      };
      /* For the automated check: the YouTube player of this session. */
      Lab._play = { owner: token, player: function () { return ytp; }, audio: function () { return au; }, state: function () { return { view: view.name, panel: panel, dj: djOn, djVoice: djVoice, queueKey: queueKey, queue: queue.slice(qi, qi + 8).map(function (it) { return it.id; }), cur: cur && cur.id, intent: intent, started: started, vol: vol, query: query,
        premium: premium(), mode: mode, pod: pod ? pod.ep.id : null, podIntent: podIntent, skipsLeft: PlayRules.canSkip(skipTimes, Date.now(), premium(), false).left, shuffle: premium() ? shufflePref : true, message: adNow ? adNow.key : null,
        together: tog ? tog.state : togErr || null, life: lifeOn, mixes: myMixes().map(function (m) { return m.key; }), toast: toast ? toast.text : null,
        consent: consentOn, next: nextOpen ? (nextList || []).map(function (x) { return x.it.id; }) : null, playlists: myPlaylists().map(function (m) { return m.pl.id + ':' + m.pl.status; }), curBy: curBy, srcNow: srcNow }; },
        openNext: function () { openNext(); return nextOpen; },
        /* 1.16, for the automated check only: the natural end of the song, and "no touch lately" */
        test: { end: function () { if (cur && mode === 'song') onState(0); }, quiet: function () { lastTouch = 0; }, poll: function () { togPoll(); } },
        lists: function () { function y(l) { return l.map(function (it) { return it.year; }); } return { lifeAsks: lifeAsks, forYou: y(forYou()), rec: y(aiRecommended(8)), hits: y(hitsList()) }; } };
      screenEl.addEventListener('scroll', onScroll, true);
      ensureBox();
      /* Fonts: LabLand's typography comes with css/lab.css (Inter Tight and Courier Prime); Play no
         longer loads fonts of its own. */

      var wish = takeStartWish();
      L.stat('playStart', wish === 'calm' ? 'calm' : 'home');
      if (wish === 'calm') {
        /* "Calm music now" from the care team: the calm music starts at once, a little softer. */
        var calm = calmList();
        if (calm.length) {
          vol = Math.max(10, Math.round(base * 0.7));
          /* chosen by the care team: these songs do not shape the resident's own profile */
          queueBy = srcNow = 'staff';
          queue = calm; qi = 0; queueKey = 'calm'; cur = calm[0]; intent = true;
          firstPlay = function () { load(calm[0]); };
        }
      }
      /* Load YouTube's player now: without internet, Bellatrix's own calm music at once. */
      youtube().then(function () { /* ready for the first song */ }, function () { offline(); });
      themeOn();
      main.body = build();
      main.actions = acts;
      return main;
    }
  });
})();
