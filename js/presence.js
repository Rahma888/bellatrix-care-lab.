/* Presence by camera motion (patient screen, 1.17). The camera image is shrunk to 64x48 grey values,
   compared with the previous one about every 300 ms, and thrown away at once: nothing is sent,
   nothing is kept. "Present" as soon as something moves; "absent" after about 20 s without motion.
   The algorithm is pure (Presence.diff, Presence.update) and tested with synthetic images
   (tests/presence.test.mjs). The camera is only on while somebody asks for it (Presence.watch)
   and is released with the returned stop function.
   Test switch: localStorage bellatrix-presence-off = 1 means "always present", no camera. ES5. */
(function (root) {
  'use strict';
  var W = 64, H = 48;
  var DEF = { pixel: 24, threshold: 0.02, recentMs: 8000, absentMs: 20000 };

  /* Share of pixels (0..1) whose grey value moved by more than `pixel` between two images. */
  function diff(a, b, pixel) {
    if (!a || !b || a.length !== b.length || !a.length) return 0;
    var lim = pixel == null ? DEF.pixel : pixel, n = 0, i, d;
    for (i = 0; i < a.length; i++) { d = a[i] - b[i]; if (d < 0) d = -d; if (d > lim) n++; }
    return n / a.length;
  }
  function fresh() { return { present: false, lastMotion: null }; }
  /* One step: `share` is the result of diff(), `now` a time in ms. Returns the new state (same object).
     Motion makes the person present at once; absent only after absentMs without motion.
     `recent` tells whether there was motion in the last recentMs. */
  function update(state, share, now, o) {
    o = o || {};
    var th = o.threshold == null ? DEF.threshold : o.threshold, rec = o.recentMs || DEF.recentMs, gone = o.absentMs || DEF.absentMs;
    if (share >= th) { state.lastMotion = now; state.present = true; }
    else if (state.present && state.lastMotion != null && now - state.lastMotion > gone) state.present = false;
    state.recent = state.lastMotion != null && now - state.lastMotion <= rec;
    return state;
  }
  /* Grey values of RGBA pixels (canvas data), 4 bytes per pixel. */
  function grey(rgba) {
    var n = rgba.length >> 2, out = new Uint8Array(n), i;
    for (i = 0; i < n; i++) out[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    return out;
  }

  function off() { try { return root.localStorage.getItem('bellatrix-presence-off') === '1'; } catch (e) { return false; } }
  function cfg() {
    var o = {};
    try { var t = parseFloat(root.localStorage.getItem('bellatrix-presence-threshold')); if (t > 0 && t < 1) o.threshold = t; } catch (e) { /* default */ }
    return o;
  }

  /* ---------- the camera (only when somebody watches) ---------- */
  var watchers = [], cam = null, state = fresh(), seen = false;
  function notify() {
    var p = Presence.isPresent();
    watchers.forEach(function (w) { if (w.last !== p) { w.last = p; try { w.cb(p); } catch (e) { /* a listener must not stop the others */ } } });
  }
  function openCam() {
    if (cam || off() || !root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    cam = { stream: null, timer: null, prev: null, dead: false };
    var me = cam;
    /* The robot app may hold the camera for the hands (core.js): it lets go first, the camera has one user. */
    try { if (typeof root.__bellatrixHandsRelease === 'function') root.__bellatrixHandsRelease(); } catch (e) { /* not in the app */ }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function (stream) {
      if (me.dead) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      me.stream = stream;
      var v = document.createElement('video'), c = document.createElement('canvas'), x;
      v.muted = true; v.setAttribute('playsinline', ''); v.srcObject = stream;
      c.width = W; c.height = H; x = c.getContext('2d');
      try { v.play(); } catch (e) { /* the frames come anyway */ }
      me.timer = setInterval(function () {
        if (!v.videoWidth) return;
        var g;
        try { x.drawImage(v, 0, 0, W, H); g = grey(x.getImageData(0, 0, W, H).data); } catch (e) { return; }
        seen = true;
        if (me.prev) update(state, diff(me.prev, g), Date.now(), cfg());
        me.prev = g;   /* only the last small image, never stored or sent */
        notify();
      }, 300);
    }, function () { cam = null; Presence.noCamera = true; notify(); });
  }
  function closeCam() {
    if (!cam) return;
    cam.dead = true;
    clearInterval(cam.timer);
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam = null; state = fresh(); seen = false;
  }

  var Presence = {
    W: W, H: H, DEFAULTS: DEF, diff: diff, update: update, fresh: fresh, grey: grey,
    noCamera: false,
    /* Without a camera (or in the test switch) nobody can be missed: the screen then behaves as before. */
    isPresent: function () { return off() || Presence.noCamera || (cam ? state.present : false); },
    /* cb(present) at every change (and once at the start). Returns the function that stops watching. */
    watch: function (cb) {
      var w = { cb: cb, last: null };
      watchers.push(w);
      openCam();
      setTimeout(function () { if (watchers.indexOf(w) >= 0) { w.last = Presence.isPresent(); try { cb(w.last); } catch (e) { /* ignore */ } } }, 0);
      return function () {
        var i = watchers.indexOf(w);
        if (i >= 0) watchers.splice(i, 1);
        if (!watchers.length) closeCam();
      };
    }
  };
  root.Presence = Presence;
  if (typeof module !== 'undefined' && module.exports) module.exports = Presence;
})(typeof window !== 'undefined' ? window : this);
