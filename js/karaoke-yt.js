/* Video karaoke (1.16, route 1 of KARAOKE-OPTIONS.md): karaoke videos from OFFICIAL channels (the
   karaoke label or the music producer's own channel), played by YouTube's own embedded player
   (the IFrame Player API, privacy-enhanced host youtube-nocookie.com). Nothing is downloaded,
   converted, recorded or stored: the app keeps only the video id, the title and the channel name.
   The words are in the video itself; no lyrics are stored in the app.
   - Needs the internet: js/karaoke.js marks these songs "Internet" and hides them when offline.
   - Every id was checked on the date in `checked` twice: YouTube's oEmbed endpoint (HTTP 200 = public
     and embeddable) and a real start in the official player (no error 101/150, `seconds` read by the
     player). Its channel is in CHANNELS. Re-check oEmbed: node tests/karaoke.test.mjs --videos
   - YouTube rules kept: the player is never smaller than 200 x 200 pixels on the screen, nothing is
     drawn over it, its sound is only changed through the player itself.
   - Many big karaoke channels do not allow it: Sing King and KaraFun France answer 401 (embedding
     off); most Stingray Karaoke and Edel Kids videos answer 200 to oEmbed but refuse to play in an
     embedded player (error 150). Those are left out; the player check is what counts.
   The robot screen uses window.KaraokeVideo (js/karaoke.js). */
(function (root) {
  'use strict';
  var CHECKED = '2026-11-10';
  /* The official channels allowed: the oEmbed author_name, the channel's address and who it is. */
  var CHANNELS = {
    'Zoom Karaoke Official': { url: 'https://www.youtube.com/@ZoomKaraokeOfficial', who: 'Zoom Entertainments Ltd (karaoke label, owns its recordings)' },
    'Stingray Karaoke': { url: 'https://www.youtube.com/@StingrayKaraoke', who: 'Stingray Digital (licensed karaoke label)' },
    'Tracks Planet Karaoke': { url: 'https://www.youtube.com/@TracksPlanetKaraoke', who: 'Tracks Planet (karaoke producer)' },
    'Phoenix Music International Ltd': { url: 'https://www.youtube.com/@Phoenixmusicinternational', who: 'Phoenix Music International (karaoke label)' },
    'EasyKaraoke': { url: 'https://www.youtube.com/@EasyKaraokeOfficial', who: 'EasyKaraoke (karaoke label)' },
    'KaraFun Deutschland - Karaoke': { url: 'https://www.youtube.com/@karafunde', who: 'KaraFun / Recisio (licensed karaoke label)' },
    'HeyKids - Chansons Pour Enfants': { url: 'https://www.youtube.com/@HeyKids_fr', who: 'HeyKids (producer of its own songs for children)' },
    'HeyKids - Kinderlieder TV': { url: 'https://www.youtube.com/@HeyKids_de', who: 'HeyKids (producer of its own songs for children)' },
    'HeyKids - Nursery Rhymes': { url: 'https://www.youtube.com/@HeyKids', who: 'HeyKids (producer of its own songs for children)' }
  };
  /* { id, yt (video id), lang, cat (popular | christmas | children), title, artist, channel, seconds, checked }
     seconds: the length read by the official player on `checked` (null when it could not be read). */
  var VIDEOS = /* VIDEOS-BEGIN */ [
    { id: 'v-en-my-way', yt: 'TFoXx8WmOZE', lang: 'en', cat: 'popular', title: 'My Way', artist: 'Frank Sinatra', channel: 'Zoom Karaoke Official', seconds: 280, checked: CHECKED },
    { id: 'v-en-let-it-be', yt: '8MeGHWRQyag', lang: 'en', cat: 'popular', title: 'Let It Be', artist: 'The Beatles', channel: 'Zoom Karaoke Official', seconds: 227, checked: CHECKED },
    { id: 'v-en-volare', yt: '-mnzm4j0Ix0', lang: 'en', cat: 'popular', title: 'Volare', artist: 'Dean Martin', channel: 'Zoom Karaoke Official', seconds: 191, checked: CHECKED },
    { id: 'v-en-standing-on-the-corner', yt: '6sNE2ElMxbs', lang: 'en', cat: 'popular', title: 'Standing on the Corner', artist: 'Dean Martin', channel: 'Zoom Karaoke Official', seconds: 175, checked: CHECKED },
    { id: 'v-en-love', yt: '8GBLDKt3c2E', lang: 'en', cat: 'popular', title: 'L-O-V-E', artist: 'Nat King Cole', channel: 'Zoom Karaoke Official', seconds: 157, checked: CHECKED },
    { id: 'v-en-dancing-queen', yt: 'ir14kJwqaus', lang: 'en', cat: 'popular', title: 'Dancing Queen', artist: 'ABBA', channel: 'Phoenix Music International Ltd', seconds: 224, checked: CHECKED },
    { id: 'v-en-que-sera-sera', yt: 'Qz5vArzNb1E', lang: 'en', cat: 'popular', title: 'Que Sera, Sera', artist: 'Doris Day', channel: 'EasyKaraoke', seconds: 144, checked: CHECKED },
    { id: 'v-en-joy-to-the-world', yt: 'z_EsjR9qP1w', lang: 'en', cat: 'christmas', title: 'Joy to the World (video)', artist: '', channel: 'Zoom Karaoke Official', seconds: 129, checked: CHECKED },
    { id: 'v-en-christmas-alphabet', yt: 'kr3LCHgxiVw', lang: 'en', cat: 'christmas', title: 'Christmas Alphabet', artist: 'Dickie Valentine', channel: 'Zoom Karaoke Official', seconds: 133, checked: CHECKED },
    { id: 'v-en-white-christmas', yt: 'vFlRdjqZrvk', lang: 'en', cat: 'christmas', title: 'White Christmas', artist: 'Bing Crosby', channel: 'Tracks Planet Karaoke', seconds: 288, checked: CHECKED },
    { id: 'v-en-wheels-on-the-bus', yt: 'et9q7KTQkOc', lang: 'en', cat: 'children', title: 'The Wheels on the Bus', artist: '', channel: 'HeyKids - Nursery Rhymes', seconds: 336, checked: CHECKED },
    { id: 'v-en-nursery-rhymes', yt: 'j5AwW-iu10E', lang: 'en', cat: 'children', title: 'Nursery rhymes, 15 minutes', artist: '', channel: 'HeyKids - Nursery Rhymes', seconds: 935, checked: CHECKED },
    { id: 'v-fr-je-ne-regrette-rien', yt: 'W15wBawANV4', lang: 'fr', cat: 'popular', title: 'Non, je ne regrette rien', artist: 'Édith Piaf', channel: 'Stingray Karaoke', seconds: 148, checked: CHECKED },
    { id: 'v-fr-papa-noel', yt: 'zzRONEGRvP0', lang: 'fr', cat: 'christmas', title: 'Chansons de Noël, 9 minutes', artist: '', channel: 'HeyKids - Chansons Pour Enfants', seconds: 522, checked: CHECKED },
    { id: 'v-fr-comptines', yt: '59ab0irzG4s', lang: 'fr', cat: 'children', title: 'Comptines, 13 minutes', artist: '', channel: 'HeyKids - Chansons Pour Enfants', seconds: 808, checked: CHECKED },
    { id: 'v-de-sieben-faesser-wein', yt: 'ESHVyukw8FA', lang: 'de', cat: 'popular', title: 'Sieben Fässer Wein', artist: 'Roland Kaiser', channel: 'KaraFun Deutschland - Karaoke', seconds: 199, checked: CHECKED },
    { id: 'v-de-santa-maria', yt: '4OVyA9RuWmY', lang: 'de', cat: 'popular', title: 'Santa Maria', artist: 'Roland Kaiser', channel: 'KaraFun Deutschland - Karaoke', seconds: 263, checked: CHECKED },
    { id: 'v-de-leise-rieselt', yt: '2yN7okZNMQg', lang: 'de', cat: 'christmas', title: 'Leise rieselt der Schnee (Video)', artist: 'Helene Fischer', channel: 'KaraFun Deutschland - Karaoke', seconds: 203, checked: CHECKED },
    { id: 'v-de-kinderlieder-entchen', yt: 'c2kC00dRnK0', lang: 'de', cat: 'children', title: 'Kinderlieder, 15 Minuten', artist: '', channel: 'HeyKids - Kinderlieder TV', seconds: 907, checked: CHECKED },
    { id: 'v-de-kinderlieder-haenschen', yt: '_GTiFolHHrw', lang: 'de', cat: 'children', title: 'Hänschen klein und mehr, 16 Minuten', artist: '', channel: 'HeyKids - Kinderlieder TV', seconds: 996, checked: CHECKED }
  ] /* VIDEOS-END */;

  var LANGS = ['fr', 'de', 'en'], CATS = ['popular', 'christmas', 'children'];
  var MIN_PX = 200;                     /* YouTube: an embedded player is at least 200 x 200 pixels */
  var API_URL = 'https://www.youtube.com/iframe_api', HOST = 'https://www.youtube-nocookie.com';

  /* Everything wrong with an entry (an empty list means it may be shown). */
  function check(v) {
    var bad = [];
    if (!v || typeof v !== 'object') return ['not an entry'];
    if (!/^v-(fr|de|en)-[a-z0-9-]+$/.test(v.id || '')) bad.push('id must be "v-<lang>-slug"');
    if (!/^[A-Za-z0-9_-]{11}$/.test(v.yt || '')) bad.push('yt must be an 11-character video id');
    if (LANGS.indexOf(v.lang) < 0) bad.push('lang must be fr, de or en');
    if (v.id && v.id.split('-')[1] !== v.lang) bad.push('id and lang differ');
    if (CATS.indexOf(v.cat) < 0) bad.push('cat must be popular, christmas or children');
    if (!String(v.title || '').trim()) bad.push('no title');
    if (!CHANNELS.hasOwnProperty(v.channel)) bad.push('channel not in the official list');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checked || '')) bad.push('checked must be a date');
    if (v.seconds !== null && v.seconds !== undefined && !(v.seconds > 0)) bad.push('seconds must be a number or null');
    return bad;
  }
  /* The videos that may be shown. opts: { lang, cat, exclude: [ids], videos } */
  function available(opts) {
    opts = opts || {};
    var ex = opts.exclude || [];
    return (opts.videos || VIDEOS).filter(function (v) {
      if (opts.lang && v.lang !== opts.lang) return false;
      if (opts.cat && v.cat !== opts.cat) return false;
      if (ex.indexOf(v.id) >= 0 || v.enabled === false) return false;
      return !check(v).length;
    });
  }
  function byId(id) { for (var i = 0; i < VIDEOS.length; i++) if (VIDEOS[i].id === id) return VIDEOS[i]; return null; }
  function online() { try { return !root.navigator || root.navigator.onLine !== false; } catch (e) { return true; } }

  /* YouTube's player API, loaded once (Bellatrix Play may have loaded it already). */
  var apiPromise = null;
  function load() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (ok, fail) {
      var prev = root.onYouTubeIframeAPIReady, done = false;
      root.onYouTubeIframeAPIReady = function () { done = true; if (prev) { try { prev(); } catch (e) { /* not ours */ } } ok(root.YT); };
      var have = document.querySelector('script[src="' + API_URL + '"]');
      if (!have) {
        var s = document.createElement('script');
        s.src = API_URL; s.async = true;
        s.onerror = function () { apiPromise = null; fail(new Error('offline')); };
        document.head.appendChild(s);
      }
      /* the script was already there: it may have finished before we listened */
      var poll = setInterval(function () { if (root.YT && root.YT.Player) { clearInterval(poll); done = true; ok(root.YT); } }, 250);
      setTimeout(function () { clearInterval(poll); if (!done && !(root.YT && root.YT.Player)) { apiPromise = null; fail(new Error('timeout')); } }, 12000);
    });
    return apiPromise;
  }

  /* One player in a box on the stage (outside #screen, so a redraw of the screen never stops it).
     place(slot) puts the box over the slot; the box is at least 200 x 200 real pixels.
     opts: { volume 0..1, rate, lang, onReady, onState(state), onEnd, onError(code) } */
  function player(stage, v, opts) {
    opts = opts || {};
    var box = document.createElement('div'), yt = null, ready = false, gone = false, state = -1, vol = opts.volume === undefined ? 0.8 : opts.volume, rate = opts.rate || 1, lastKey = '';
    box.className = 'kv-box kv-hide';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<div class="kv-frame"></div>';
    (stage || document.body).appendChild(box);
    function call(fn, a) { if (!yt || !ready || gone || typeof yt[fn] !== 'function') return undefined; try { return yt[fn](a); } catch (e) { return undefined; } }
    function num(fn) { var x = call(fn); return typeof x === 'number' && isFinite(x) ? x : 0; }
    load().then(function (YT) {
      if (gone) return;
      yt = new YT.Player(box.firstChild, {
        host: HOST, videoId: v.yt, width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1, modestbranding: 1, cc_load_policy: 0, hl: opts.lang || 'en' },
        events: {
          onReady: function () {
            if (gone) return;
            ready = true;
            call('unMute'); call('setVolume', Math.round(vol * 100));
            if (rate !== 1) call('setPlaybackRate', rate);
            call('playVideo');
            if (opts.onReady) opts.onReady();
          },
          onStateChange: function (e) {
            if (gone) return;
            state = e.data;
            if (opts.onState) opts.onState(state);
            if (state === 0 && opts.onEnd) opts.onEnd();
          },
          onError: function (e) { if (!gone && opts.onError) opts.onError(e && e.data); }
        }
      });
    }, function (e) { if (!gone && opts.onError) opts.onError(e && e.message || 'offline'); });
    var h = {
      video: v,
      box: box,
      ready: function () { return ready; },
      live: function () { return !gone; },
      state: function () { return state; },
      playing: function () { return state === 1 || state === 3; },
      paused: function () { return state === 2; },
      ended: function () { return state === 0; },
      pause: function () { call('pauseVideo'); },
      resume: function () { call('playVideo'); },
      setVolume: function (x) { vol = Math.max(0, Math.min(1, x)); call('setVolume', Math.round(vol * 100)); return vol; },
      volume: function () { return vol; },
      /* the speeds this video offers between 0.7 and 1.3 (YouTube rounds other values towards 1) */
      rates: function () {
        var r = call('getAvailablePlaybackRates');
        r = Array.isArray(r) && r.length ? r : [0.75, 1, 1.25];
        return r.filter(function (x) { return x >= 0.7 && x <= 1.3; });
      },
      setRate: function (x) { rate = x; call('setPlaybackRate', x); return rate; },
      rate: function () { return num('getPlaybackRate') || rate; },
      time: function () { return num('getCurrentTime'); },
      duration: function () { return num('getDuration'); },
      place: function (slot, scale) {
        if (gone) return;
        if (!slot || !slot.getBoundingClientRect) { if (lastKey !== 'hide') { box.className = 'kv-box kv-hide'; lastKey = 'hide'; } return; }
        var sr = (stage || document.body).getBoundingClientRect(), r = slot.getBoundingClientRect(), s = scale || 1;
        if (!r.width || !s) return;
        /* real pixels on the screen: never under 200 x 200 */
        var w = Math.max(r.width, MIN_PX), hh = Math.max(r.height, MIN_PX);
        var x = (r.left - sr.left - (w - r.width) / 2) / s, y = (r.top - sr.top - (hh - r.height) / 2) / s;
        var key = [x, y, w / s, hh / s].map(Math.round).join(',');
        if (key === lastKey) return;
        lastKey = key;
        box.className = 'kv-box';
        box.style.left = x.toFixed(1) + 'px'; box.style.top = y.toFixed(1) + 'px';
        box.style.width = (w / s).toFixed(1) + 'px'; box.style.height = (hh / s).toFixed(1) + 'px';
      },
      hide: function () { if (!gone) { box.className = 'kv-box kv-hide'; lastKey = 'hide'; } },
      /* Stop: the player is destroyed and its frame removed, so the sound ends at once. */
      destroy: function () {
        if (gone) return;
        call('stopVideo');
        gone = true;
        try { if (yt && yt.destroy) yt.destroy(); } catch (e) { /* already gone */ }
        if (box.parentNode) box.parentNode.removeChild(box);
      }
    };
    return h;
  }

  var KV = { VIDEOS: VIDEOS, CHANNELS: CHANNELS, LANGS: LANGS, CATS: CATS, MIN_PX: MIN_PX, CHECKED: CHECKED,
    check: check, available: available, byId: byId, online: online, load: load, player: player };
  root.KaraokeVideo = KV;
  if (typeof module !== 'undefined' && module.exports) module.exports = KV;
})(typeof window !== 'undefined' ? window : this);
