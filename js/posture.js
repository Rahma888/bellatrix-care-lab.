/* Bellatrix posture check: before an activity starts, make sure the person is sitting.
   The tablet camera delivers upside-down images (180 degrees): each frame is turned back on a
   canvas before the pose model sees it. Nothing is recorded or sent anywhere.
   Test switch: localStorage 'bellatrix-posture-off' = '1' skips the check. */
(function (root) {
  'use strict';

  var MP_LOCAL = 'vendor/mediapipe', MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var POSE_MODEL = 'pose_landmarker_lite.task';
  var POSE_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  var T = {
    SMOOTH_MS: 1500, SEATED_MS: 2000, BAD_MS: 3000, UNKNOWN_MS: 8000, REPEAT_MS: 25000, TICK_MS: 250
  };
  var TEXT = {
    en: 'Could you please sit down comfortably? I will wait for you.',
    fr: 'Pourriez-vous vous asseoir confortablement s’il vous plaît ? Je vous attends.',
    de: 'Würden Sie sich bitte bequem hinsetzen? Ich warte auf Sie.'
  };

  /* ---------- classification (pure) ---------- */
  function ok(p) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
    if (typeof p.visibility === 'number' && p.visibility < 0.5) return false;
    return p.y > -0.05 && p.y < 1.05 && p.x > -0.05 && p.x < 1.05;
  }
  function mid(lm, a, b, k) {
    var pa = ok(lm[a]) ? lm[a] : null, pb = ok(lm[b]) ? lm[b] : null;
    if (!pa && !pb) return null;
    if (pa && pb) return { x: (pa.x + pb.x) / 2 * k, y: (pa.y + pb.y) / 2 };
    var p = pa || pb; return { x: p.x * k, y: p.y };
  }
  /* 16 Nov (Rahma's test: lying on her bed, the robot arrived and started without asking her to sit up):
     a back leaning on pillows was taken for "seated", because only more than 60 degrees counted as lying and
     legs stretched out on a bed look like thighs on a chair. Now:
     LYING_DEG   the back more than 45 degrees from upright is lying (in a chair people lean 10 to 25 degrees);
     HALF_DEG    from 25 degrees, with the lower legs flat (ankles at the knees' height, not below them), it is
                 half-lying in bed, not sitting on a chair;
     HEAD_DEG    the head beside the shoulders (more than 55 degrees from above them) is lying, also when the
                 hips are under the blanket and cannot be seen. */
  var A = { LYING_DEG: 45, HALF_DEG: 25, HEAD_DEG: 55 };
  function deg(x, y) { return Math.atan2(Math.abs(x), Math.abs(y)) * 180 / Math.PI; } /* from vertical */
  function headOf(lm, k) {
    var e = mid(lm, 7, 8, k);
    if (e) return e;
    return ok(lm[0]) ? { x: lm[0].x * k, y: lm[0].y } : null;
  }
  /* What the last picture showed (angles only, for the test on the tablet: Posture._last()). */
  var last = {};
  /* landmarks: MediaPipe pose list (33 points, y down), image already upright.
     aspect = width / height of the image (x is scaled to keep angles true). */
  function classify(lm, aspect) {
    last = {};
    if (!lm || lm.length < 29) return 'unknown';
    var k = aspect > 0 ? aspect : 0.75;
    var S = mid(lm, 11, 12, k), H = mid(lm, 23, 24, k), Hd = headOf(lm, k);
    if (!S) return 'unknown';
    if (Hd) {
      var hx = Hd.x - S.x, hy = Hd.y - S.y;
      if (Math.sqrt(hx * hx + hy * hy) >= 0.03) {
        last.head = Math.round(deg(hx, hy));
        if (last.head > A.HEAD_DEG) return 'lying';
      }
    }
    if (!H) return 'unknown';
    var tx = H.x - S.x, ty = H.y - S.y, L = Math.sqrt(tx * tx + ty * ty);
    if (L < 0.04) return 'unknown';
    var torsoAngle = deg(tx, ty);
    last.torso = Math.round(torsoAngle);
    if (torsoAngle > A.LYING_DEG) return 'lying';
    var Kn = mid(lm, 25, 26, k);
    if (!Kn) return 'unknown';
    var dx = Kn.x - H.x, dy = Kn.y - H.y;
    var thighAngle = deg(dx, dy);
    last.thigh = Math.round(thighAngle);
    if (dy > 0.75 * L && thighAngle < 35) return 'standing';
    if (Math.abs(dy) < 0.5 * L) {
      var An = mid(lm, 27, 28, k);
      if (An) {
        var ax = An.x - Kn.x, ay = An.y - Kn.y;
        last.shin = Math.round(deg(ax, ay));
        if (torsoAngle > A.HALF_DEG && Math.sqrt(ax * ax + ay * ay) > 0.3 * L && last.shin > 60) return 'lying';
      }
      return 'seated';
    }
    return 'unknown';
  }

  /* ---------- smoothing and timing (pure, driven by feed(label, nowMs)) ---------- */
  function createWatcher(cb) {
    var win = [], run = { label: null, since: 0 }, badSince = null, overlay = false, lastSay = 0, done = false;
    function majority(now) {
      var i, counts = {}, best = null, bc = 0;
      while (win.length && now - win[0].t > T.SMOOTH_MS) win.shift();
      for (i = 0; i < win.length; i++) counts[win[i].l] = (counts[win[i].l] || 0) + 1;
      for (i = win.length - 1; i >= 0; i--) { /* ties: the most recent wins */
        var l = win[i].l; if (counts[l] > bc) { bc = counts[l]; best = l; }
      }
      return best;
    }
    function finish(r) { if (done) return; done = true; if (overlay) { overlay = false; cb.hide(); } cb.done(r); }
    return {
      feed: function (label, now) {
        if (done) return;
        win.push({ t: now, l: label });
        var m = majority(now);
        if (m !== run.label) { run.label = m; run.since = now; }
        var bad = m === 'standing' || m === 'lying';
        if (bad) { if (badSince === null) badSince = now; } else badSince = null;
        if (m === 'seated') {
          if (overlay) { overlay = false; cb.hide(); }
          if (now - run.since >= T.SEATED_MS) return finish('seated');
        }
        if (m === 'unknown' && now - run.since >= T.UNKNOWN_MS) return finish('unknown');
        if (bad && now - badSince >= T.BAD_MS) {
          if (!overlay) { overlay = true; lastSay = now; cb.show(); cb.say(); }
          else if (now - lastSay >= T.REPEAT_MS) { lastSay = now; cb.say(); }
        }
      },
      stop: function () { done = true; if (overlay) { overlay = false; cb.hide(); } },
      isOverlay: function () { return overlay; }
    };
  }

  /* ---------- real-world parts (browser) ---------- */
  var visionP = null;
  function loadVision() {
    if (!visionP) {
      var localBase = new URL(MP_LOCAL, document.baseURI).href;
      var from = function (base) {
        var local = base === localBase;
        return import(base + (local ? '/vision_bundle.js' : '/vision_bundle.mjs')).then(function (V) {
          return V.FilesetResolver.forVisionTasks(base + '/wasm').then(function (fs) { return { V: V, fs: fs, base: local ? base : null }; });
        });
      };
      visionP = location.protocol !== 'file:' ? from(localBase).catch(function () { return from(MP_CDN); }) : from(MP_CDN);
      visionP.catch(function () { visionP = null; });
    }
    return visionP;
  }
  function defaultLoadModel() {
    return loadVision().then(function (x) {
      var path = x.base ? x.base + '/' + POSE_MODEL : POSE_CDN;
      function make(delegate) {
        return x.V.PoseLandmarker.createFromOptions(x.fs, { baseOptions: { modelAssetPath: path, delegate: delegate }, runningMode: 'VIDEO', numPoses: 1 });
      }
      return make('GPU').catch(function () { return make('CPU'); });
    }).then(function (m) {
      var last = 0;
      return {
        detect: function (src, ts) {
          if (ts <= last) ts = last + 1; last = ts;
          var r = m.detectForVideo(src, ts);
          return r && r.landmarks && r.landmarks[0] ? r.landmarks[0] : null;
        },
        close: function () { try { m.close(); } catch (e) {} }
      };
    });
  }
  /* The same camera and turn as the pointer in core.js: 'bellatrix-cam-label' picks a USB webcam by name and
     'bellatrix-cam-rot' (0, 90, 180, 270) turns it; with no label the tablet's own camera is used, upside-down (180). */
  function camSetup() {
    var lab = null, rot = 180;
    try { lab = root.localStorage.getItem('bellatrix-cam-label'); var r = root.localStorage.getItem('bellatrix-cam-rot'); if (lab) rot = (r === '90' || r === '180' || r === '270') ? +r : 0; else if (r === '0' || r === '90' || r === '270') rot = +r; } catch (e) { /* defaults */ }
    return { label: lab, rot: rot };
  }
  function getStream(label) {
    var md = navigator.mediaDevices;
    return md.getUserMedia({ video: true, audio: false }).then(function (first) {
      if (!label || !md.enumerateDevices) return first;
      return md.enumerateDevices().then(function (list) {
        var d = null, i;
        for (i = 0; i < list.length; i++) if (list[i].kind === 'videoinput' && String(list[i].label).toLowerCase().indexOf(label.toLowerCase()) === 0) d = list[i];
        if (!d) return first;
        first.getTracks().forEach(function (t) { t.stop(); });
        return md.getUserMedia({ video: { deviceId: { exact: d.deviceId }, width: 640, height: 480 }, audio: false });
      });
    });
  }
  function defaultOpenCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no camera'));
    /* The robot app may hold the camera for the hands (core.js): it lets go first, the camera has one user. */
    try { if (typeof root.__bellatrixHandsRelease === 'function') root.__bellatrixHandsRelease(); } catch (e) { /* not in the app */ }
    var cs = camSetup();
    return getStream(cs.label).then(function (stream) {
      var v = document.createElement('video');
      v.setAttribute('playsinline', ''); v.muted = true; v.srcObject = stream;
      var cv = document.createElement('canvas'), cx = cv.getContext('2d');
      function stop() { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} try { v.srcObject = null; } catch (e) {} }
      return v.play().then(function () {
        return {
          stop: stop,
          frame: function () {
            var w = v.videoWidth, h = v.videoHeight, sw = cs.rot === 90 || cs.rot === 270, cw = sw ? h : w, ch = sw ? w : h;
            if (!w || !h) return null;
            if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
            if (cs.rot === 180) cx.setTransform(-1, 0, 0, -1, cw, ch);
            else if (cs.rot === 90) cx.setTransform(0, 1, -1, 0, cw, 0);
            else if (cs.rot === 270) cx.setTransform(0, -1, 1, 0, 0, ch);
            else cx.setTransform(1, 0, 0, 1, 0, 0);
            cx.drawImage(v, 0, 0);
            cx.setTransform(1, 0, 0, 1, 0, 0);
            return { source: cv, aspect: cw / ch };
          }
        };
      }, function (e) { stop(); throw e; });
    });
  }
  function defaultOverlay(getText) {
    var el = null;
    return {
      show: function () {
        if (el) return;
        el = document.createElement('div');
        el.setAttribute('role', 'alert');
        el.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;background:#FFFFFF;color:#00519E;' +
          'display:flex;align-items:center;justify-content:center;text-align:center;padding:6vw;box-sizing:border-box;' +
          'font-family:var(--font);font-size:84px;line-height:1.2;font-weight:500';
        el.textContent = getText();
        document.body.appendChild(el);
      },
      hide: function () { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }
    };
  }

  function offSwitch(deps) {
    try { return (deps.storage || root.localStorage).getItem('bellatrix-posture-off') === '1'; } catch (e) { return false; }
  }

  /* opts: {lang, say(text), deps?}. done(result): 'seated' | 'unknown' | 'unavailable' | 'off'. Returns cancel(). */
  function ensureSeated(opts, done) {
    opts = opts || {};
    var deps = opts.deps || {};
    var lang = TEXT[opts.lang] ? opts.lang : 'en';
    var text = TEXT[lang];
    var now = deps.now || function () { return Date.now(); };
    var setI = deps.setInterval || root.setInterval.bind(root), clrI = deps.clearInterval || root.clearInterval.bind(root);
    var overlay = deps.overlay || defaultOverlay(function () { return text; });
    var finished = false, timer = null, cam = null, model = null, busy = false;

    function cleanup() {
      if (timer !== null) { clrI(timer); timer = null; }
      if (cam) { try { cam.stop(); } catch (e) {} cam = null; }
      if (model) { try { model.close && model.close(); } catch (e) {} model = null; }
    }
    var watcher = createWatcher({
      show: function () { overlay.show(); },
      hide: function () { overlay.hide(); },
      say: function () { if (typeof opts.say === 'function') { try { opts.say(text); } catch (e) {} } },
      done: function (r) { end(r); }
    });
    /* 16 Nov: what the check saw is kept on the tablet (labels and counts only, never a picture) and in the
       console, so a test that went wrong can be read afterwards: localStorage 'bellatrix-posture-last'. */
    var seen = { seated: 0, standing: 0, lying: 0, unknown: 0, none: 0 }, t0 = now(), lastSeen = null;
    function note(r) {
      var n = { at: Date.now(), result: r, ms: now() - t0, frames: seen, last: lastSeen };
      try { var st = deps.storage || root.localStorage; if (st.setItem) st.setItem('bellatrix-posture-last', JSON.stringify(n)); } catch (e) { /* no storage */ }
      try { if (root.console && console.info) console.info('[posture] ' + JSON.stringify(n)); } catch (e) { /* silent */ }
    }
    function end(r) {
      if (finished) return; finished = true;
      watcher.stop(); cleanup();
      note(r);
      if (typeof done === 'function') done(r);
    }
    function cancel() { if (finished) return; finished = true; watcher.stop(); cleanup(); }

    if (offSwitch(deps)) { end('off'); return cancel; }

    var openCam = deps.openCamera || defaultOpenCamera, loadModel = deps.loadModel || defaultLoadModel;
    var camP, modelP;
    try { camP = Promise.resolve(openCam()); modelP = Promise.resolve(loadModel()); }
    catch (e) { end('unavailable'); return cancel; }
    Promise.all([camP.catch(function () { return null; }), modelP.catch(function () { return null; })]).then(function (r) {
      if (finished) { if (r[0]) try { r[0].stop(); } catch (e) {} if (r[1] && r[1].close) try { r[1].close(); } catch (e) {} return; }
      cam = r[0]; model = r[1];
      if (!cam || !model) { end('unavailable'); return; }
      timer = setI(function () {
        if (finished || busy) return;
        busy = true;
        try {
          var f = cam.frame();
          if (f) {
            var t = now(), lm = model.detect(f.source, t), lab = lm ? classify(lm, f.aspect) : 'unknown';
            seen[lm ? lab : 'none']++;
            if (lm) lastSeen = { label: lab, head: last.head, torso: last.torso, thigh: last.thigh, shin: last.shin };
            watcher.feed(lab, t);
          }
        } catch (e) { busy = false; end('unavailable'); return; }
        busy = false;
      }, T.TICK_MS);
    });
    return cancel;
  }

  var Posture = { classify: classify, ensureSeated: ensureSeated, _createWatcher: createWatcher, _T: T, _TEXT: TEXT, _A: A,
    _last: function () { return last; } };
  root.Posture = Posture;
  if (typeof module !== 'undefined' && module.exports) module.exports = Posture;
})(typeof window !== 'undefined' ? window : globalThis);
