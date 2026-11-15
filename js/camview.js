/* Bellatrix: the camera on the patient screen (what the patient sees of themself, the stream that is asked for,
   the camera's light) and the one conversion from the camera picture to the screen used by the pointer.
   - The picture is shown upright, whole and without zoom (object-fit: contain, centred); a second video of the
     same stream fills the rest of the box behind it (object-fit: cover, blurred, darker, a little bigger), so
     there are no black bars. Mirror, rotation ('bellatrix-cam-rot') and flips ('bellatrix-cam-flipx' / '-flipy')
     follow the same rules as the pointing in js/core.js, so what the patient sees moves like the cursor.
   - The stream is asked for in 4:3 (more field of view) and the zoom is set to its minimum when the camera has one.
   - The camera's own light (exposure, brightness, backlight) is set from what the camera offers; a CSS filter
     brightens the shown picture only (the hand detection sees the untouched picture).
   - A small live panel (key C, or the Camera button of the staff panel) has 3 sliders; the values are kept.
   Everything is wrapped: a camera or a WebView without these settings only gets a console.warn. ES5. */
(function (root) {
  'use strict';

  /* ===================== RÉGLAGES (caméra) =====================
     Toutes les valeurs à régler sont ici. Les trois curseurs du panneau « C » changent EXPO, LUM_CSS et CON_CSS
     en direct et les gardent dans le localStorage ('bellatrix-cam-expo', 'bellatrix-cam-lum', 'bellatrix-cam-con').
     Les marges du pointage peuvent être changées en direct : 'bellatrix-air-marge-x', 'bellatrix-air-marge-y'
     (0 et 0 = l'ancienne correspondance, toute l'image pour tout l'écran). */
  var REGLAGES = {
    MIROIR: true,        /* image en miroir (scaleX(-1)), comme dans une glace ; le pointeur va dans le même sens.
                            'bellatrix-cam-flipx' = '1' l'inverse (caméra qui donne déjà une image miroir). */
    LARGEUR: 1280,       /* flux demandé en 4:3 pour plus de champ (valeurs « idéales », jamais obligatoires) */
    HAUTEUR: 960,
    RATIO: 4 / 3,
    IPS: 30,             /* images par seconde demandées */
    DETECT_MAX: 640,     /* côté long de l'image donnée à la détection des mains (comme avant : 640 x 480) */
    MARGE_X: 0.05,       /* pointage : part de l'image laissée de côté à gauche et à droite */
    MARGE_Y: 0.18,       /* pointage : part laissée de côté en haut et en bas (le haut et le bas de l'écran restent atteignables) */
    LISSAGE: 0.35,       /* lissage du pointeur, seulement là où rien ne lisse déjà (les moteurs de airpointer.js lissent) */
    EXPO: 0.7,           /* lumière de la caméra 0..1 : exposureCompensation et brightness = min + (max - min) * EXPO */
    LUM_CSS: 1.4,        /* luminosité de l'image affichée (filtre CSS, affichage seulement) */
    CON_CSS: 1.1,        /* contraste de l'image affichée */
    SAT_CSS: 1.05,       /* saturation de l'image affichée */
    FLOU_PX: 28,         /* flou du fond */
    FOND_LUM: 0.6,       /* le fond est plus sombre : brightness(LUM_CSS * FOND_LUM) */
    FOND_ECHELLE: 1.12   /* le fond est un peu agrandi : pas de bord net autour du flou */
  };
  var R = REGLAGES;
  var KEYS = { EXPO: 'bellatrix-cam-expo', LUM_CSS: 'bellatrix-cam-lum', CON_CSS: 'bellatrix-cam-con' };
  var RANGE = { EXPO: [0, 1], LUM_CSS: [0.8, 2.5], CON_CSS: [0.8, 1.6] };

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function ls(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (root.localStorage) root.localStorage.setItem(k, String(v)); } catch (e) { /* not kept */ } }
  function warn(m) { try { if (root.console && root.console.warn) root.console.warn('[Bellatrix camera] ' + m); } catch (e) { /* no console */ } }
  function tr(s) { return root.Lab && root.Lab.t ? root.Lab.t(s) : s; }

  /* A live value: the slider's (localStorage) if there is one, else the RÉGLAGES default. */
  function value(name) {
    var v = parseFloat(ls(KEYS[name])), r = RANGE[name];
    return isFinite(v) && r ? clamp(v, r[0], r[1]) : R[name];
  }

  /* Rotation of the camera picture: the same rule as camRot() in js/core.js (default 0). */
  function rot() {
    var o = ls('bellatrix-cam-rot');
    return o === '90' || o === '180' || o === '270' ? +o : 0;
  }
  /* The flips of the pointing, as before in js/core.js camFlip(): x flipped by default on the small portrait tablet. */
  function flip() {
    var scr = root.screen || {}, fx = scr.height > scr.width && scr.width < 1000, fy = false, ox = ls('bellatrix-cam-flipx'), oy = ls('bellatrix-cam-flipy');
    if (ox === '1' || ox === '0') fx = ox === '1';
    if (oy === '1' || oy === '0') fy = oy === '1';
    return { x: fx, y: fy };
  }
  /* Mirrored picture and mirrored pointing go together (before: mirrorX = !flip().x, which is MIROIR true). */
  function mirror() { return flip().x ? !R.MIROIR : R.MIROIR; }

  /* ---------- the stream ---------- */
  /* Video constraints in 4:3; "extra" adds deviceId or facingMode. A camera that only has 16:9 still opens (ideal only). */
  function constraints(extra) {
    var c = { width: { ideal: R.LARGEUR }, height: { ideal: R.HAUTEUR }, aspectRatio: { ideal: R.RATIO }, frameRate: { ideal: R.IPS } }, k;
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k];
    return c;
  }
  var last = { stream: null, report: null };
  function track(s) { try { return s && s.getVideoTracks ? s.getVideoTracks()[0] || null : null; } catch (e) { return null; } }
  function isRange(c) { return !!c && typeof c === 'object' && isFinite(c.min) && isFinite(c.max) && c.max > c.min; }
  function lerp(c, k) {
    var v = c.min + (c.max - c.min) * clamp(k, 0, 1);
    if (isFinite(c.step) && c.step > 0) v = c.min + Math.round((v - c.min) / c.step) * c.step;
    return clamp(v, c.min, c.max);
  }
  /* One setting at a time, so a refused one does not stop the others. Never throws, never rejects. */
  function applyOne(t, c, name, rep) {
    return new Promise(function (done) {
      function no(e) { rep.unsupported.push(name); warn(name + ' not applied: ' + (e && e.message ? e.message : e)); done(); }
      try {
        var p = t.applyConstraints({ advanced: [c] });
        if (!p || typeof p.then !== 'function') { rep.applied.push(name); done(); return; }
        p.then(function () { rep.applied.push(name); done(); }, no);
      } catch (e) { no(e); }
    });
  }
  /* At camera start: zoom to its minimum (whole field), continuous exposure, the camera light (EXPO), backlight
     compensation. lightOnly: only exposureCompensation and brightness again (the slider). Resolves with a report
     { applied: [...], unsupported: [...] } (unsupported: not offered by the camera or refused). */
  function tune(stream, lightOnly) {
    var rep = { applied: [], unsupported: [] }, t, cap = null, jobs = [], e = value('EXPO'), b;
    if (stream) last.stream = stream;
    if (!lightOnly) last.report = rep;
    try {
      t = track(stream || last.stream);
      if (!t) { rep.unsupported.push('track'); warn('no video track'); return Promise.resolve(rep); }
      if (typeof t.getCapabilities !== 'function') { rep.unsupported.push('getCapabilities'); warn('getCapabilities not supported: zoom and light stay as the camera sets them'); return Promise.resolve(rep); }
      cap = t.getCapabilities() || {};
    } catch (err) { rep.unsupported.push('getCapabilities'); warn('getCapabilities failed: ' + (err && err.message ? err.message : err)); return Promise.resolve(rep); }
    function offer(name, ok, c) { if (ok) jobs.push([c, name]); else { rep.unsupported.push(name); } }
    if (!lightOnly) {
      offer('zoom', isRange(cap.zoom), isRange(cap.zoom) ? { zoom: cap.zoom.min } : null);
      offer('exposureMode', !!(cap.exposureMode && cap.exposureMode.indexOf && cap.exposureMode.indexOf('continuous') >= 0), { exposureMode: 'continuous' });
    }
    offer('exposureCompensation', isRange(cap.exposureCompensation), isRange(cap.exposureCompensation) ? { exposureCompensation: lerp(cap.exposureCompensation, e) } : null);
    offer('brightness', isRange(cap.brightness), isRange(cap.brightness) ? { brightness: lerp(cap.brightness, e) } : null);
    if (!lightOnly) {
      b = cap.backlightCompensation;
      if (b === true || (b && b.indexOf && b.indexOf(true) >= 0)) jobs.push([{ backlightCompensation: true }, 'backlightCompensation']);
      else if (isRange(b)) jobs.push([{ backlightCompensation: b.max }, 'backlightCompensation']);
      else rep.unsupported.push('backlightCompensation');
    }
    if (rep.unsupported.length) warn('not offered by this camera: ' + rep.unsupported.join(', '));
    var chain = Promise.resolve();
    jobs.forEach(function (j) { chain = chain.then(function () { return applyOne(t, j[0], j[1], rep); }); });
    return chain.then(function () { refreshPanel(); return rep; }, function () { return rep; });
  }
  /* The camera light can be set on this camera (unknown before the first start: shown as available). */
  function lightOffered() {
    var r = last.report;
    if (!r) return true;
    return r.applied.indexOf('exposureCompensation') >= 0 || r.applied.indexOf('brightness') >= 0;
  }
  function liveStream() { var t = track(last.stream); return t && t.readyState === 'live' ? last.stream : null; }

  /* ---------- the one conversion: camera picture -> screen ----------
     x, y: 0..1 in the camera picture (after the rotation, as the hand model saw it). Mirror, flip, then the useful
     zone (margins) is stretched over the whole screen and clamped. box: where the screen is, in window pixels
     (default the window: x * innerWidth, y * innerHeight); js/core.js passes the stage's rectangle.
     zone: [x0, y0, x1, y1] instead of the margins (zone() gives the default). Returns { x, y } in window pixels
     and u, v (0..1 across the box). The drawn cursor and the hit test both use this result. */
  function zone() {
    var s = ls('bellatrix-air-zone'), z = s ? String(s).split(',').map(parseFloat) : null, mx, my;
    if (z && z.length === 4 && z[2] - z[0] > 0.05 && z[3] - z[1] > 0.05) return z;
    mx = parseFloat(ls('bellatrix-air-marge-x')); my = parseFloat(ls('bellatrix-air-marge-y'));
    mx = isFinite(mx) ? clamp(mx, 0, 0.4) : R.MARGE_X; my = isFinite(my) ? clamp(my, 0, 0.4) : R.MARGE_Y;
    return [mx, my, 1 - mx, 1 - my];
  }
  function toScreen(x, y, box, z) {
    var f = flip(), sx = mirror() ? 1 - x : x, sy = f.y ? 1 - y : y;
    z = z || zone();
    sx = clamp((sx - z[0]) / (z[2] - z[0]), 0, 1);
    sy = clamp((sy - z[1]) / (z[3] - z[1]), 0, 1);
    if (!box) box = { left: 0, top: 0, width: root.innerWidth || 0, height: root.innerHeight || 0 };
    return { x: box.left + sx * box.width, y: box.top + sy * box.height, u: sx, v: sy };
  }

  /* ---------- the shown picture ---------- */
  function filters() {
    var l = value('LUM_CSS'), c = value('CON_CSS');
    return {
      img: 'brightness(' + l + ') contrast(' + c + ') saturate(' + R.SAT_CSS + ')',
      fill: 'brightness(' + Math.round(l * R.FOND_LUM * 1000) / 1000 + ') blur(' + R.FLOU_PX + 'px)'
    };
  }
  /* A camera box: the blurred fill behind, the whole picture in front. Both are video.selfview, so js/core.js
     gives them the stream like any self view. */
  function boxHtml(cls) {
    return '<div class="camview' + (cls ? ' ' + cls : '') + '">' +
      '<video class="selfview camfill" muted playsinline autoplay aria-hidden="true"></video>' +
      '<video class="selfview camimg" muted playsinline autoplay></video></div>';
  }
  function setStyle(el, prop, v) { el.style[prop] = v; el.style['webkit' + prop.charAt(0).toUpperCase() + prop.slice(1)] = v; }
  /* Turns, mirrors and filters every camera box (inside "scope", default the page). Called again when the camera
     starts or stops, when a slider moves and when the window changes size. */
  function apply(scope) {
    var doc = root.document;
    if (!doc) return;
    var boxes = (scope || doc).querySelectorAll ? (scope || doc).querySelectorAll('.camview') : [], f = filters(), r = rot(), m = mirror(), fy = flip().y, i, j, vids, v, w, h, side, fill;
    for (i = 0; i < boxes.length; i++) {
      w = boxes[i].clientWidth; h = boxes[i].clientHeight; side = r === 90 || r === 270;
      vids = boxes[i].querySelectorAll('video');
      for (j = 0; j < vids.length; j++) {
        v = vids[j]; fill = v.className.indexOf('camfill') >= 0;
        /* A picture turned by a quarter: the video is laid out with width and height swapped, then turned into the box. */
        v.style.width = side && h ? h + 'px' : '100%';
        v.style.height = side && w ? w + 'px' : '100%';
        setStyle(v, 'transform', 'translate(-50%, -50%)' + (m ? ' scaleX(-1)' : '') + (fy ? ' scaleY(-1)' : '') + (r ? ' rotate(' + r + 'deg)' : '') + (fill ? ' scale(' + R.FOND_ECHELLE + ')' : ''));
        setStyle(v, 'filter', fill ? f.fill : f.img);
      }
    }
    refreshPanel();
  }
  function attach(scope) {
    var s = liveStream(), doc = root.document, vids, i, p;
    if (!s || !doc) return;
    vids = (scope || doc).querySelectorAll('.camview video');
    for (i = 0; i < vids.length; i++) if (vids[i].srcObject !== s) { vids[i].srcObject = s; try { p = vids[i].play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* plays later */ } }
  }

  /* ---------- the live panel (key C) ---------- */
  var SLIDERS = [
    { name: 'EXPO', label: 'Camera light', step: 0.05 },
    { name: 'LUM_CSS', label: 'Image brightness', step: 0.05 },
    { name: 'CON_CSS', label: 'Contrast', step: 0.05 }
  ];
  var panel = null;
  function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function build() {
    if (panel || !root.document || !root.document.body) return panel;
    var doc = root.document, h = '<div class="campanel-head"><h3 data-t="Camera"></h3><button type="button" class="campanel-close" data-t="Close"></button></div>' +
      boxHtml('campanel-box') + '<p class="campanel-note" hidden data-t="No camera picture right now"></p>';
    SLIDERS.forEach(function (s) {
      var r = RANGE[s.name];
      h += '<div class="campanel-row" data-k="' + s.name + '"><label for="camSet' + s.name + '"><span data-t="' + s.label + '"></span><output></output></label>' +
        '<input id="camSet' + s.name + '" type="range" min="' + r[0] + '" max="' + r[1] + '" step="' + s.step + '">' +
        (s.name === 'EXPO' ? '<small class="campanel-na" hidden data-t="Not available on this camera"></small>' : '') + '</div>';
    });
    panel = doc.createElement('div');
    panel.id = 'camPanel'; panel.className = 'campanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = h;
    doc.body.appendChild(panel);
    panel.querySelector('.campanel-close').addEventListener('click', close);
    Array.prototype.forEach.call(panel.querySelectorAll('input[type=range]'), function (inp) {
      var name = inp.parentNode.getAttribute('data-k');
      inp.addEventListener('input', function () { set(name, parseFloat(inp.value)); });
      inp.addEventListener('change', function () { set(name, parseFloat(inp.value)); });
    });
    return panel;
  }
  /* The panel's words in the patient screen's language (Lab.t), at each opening. */
  function texts() {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-t]'), function (el) { el.textContent = tr(el.getAttribute('data-t')); });
    panel.setAttribute('aria-label', tr('Camera'));
  }
  function refreshPanel() {
    if (!panel) return;
    SLIDERS.forEach(function (s) {
      var row = panel.querySelector('[data-k="' + s.name + '"]'), v = value(s.name);
      if (!row) return;
      var inp = row.querySelector('input'), out = row.querySelector('output');
      if (inp && root.document.activeElement !== inp) inp.value = v;
      if (out) out.textContent = fmt(v);
    });
    var na = panel.querySelector('.campanel-na');
    if (na) na.hidden = lightOffered();
    var note = panel.querySelector('.campanel-note');
    if (note) note.hidden = !!liveStream();
  }
  /* A slider moved: kept, the shown picture changes at once, the camera light goes to the camera. */
  function set(name, v) {
    var r = RANGE[name];
    if (!r || !isFinite(v)) return;
    v = clamp(v, r[0], r[1]);
    lsSet(KEYS[name], v);
    if (name === 'EXPO' && liveStream()) tune(null, true);
    apply();
  }
  function isOpen() { return !!panel && !panel.hidden; }
  function open() {
    if (!build()) return;
    texts();
    panel.hidden = false;
    attach(panel);
    apply(panel);
    refreshPanel();
  }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    /* The panel's videos let go of the stream (the camera itself is core.js's). */
    Array.prototype.forEach.call(panel.querySelectorAll('video'), function (v) { try { v.srcObject = null; } catch (e) { /* gone */ } });
  }
  function toggle() { if (isOpen()) close(); else open(); }

  function onKey(e) {
    var k = e.key, t = e.target, tag = t && t.tagName ? t.tagName : '';
    if ((k !== 'c' && k !== 'C') || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((/TEXTAREA|SELECT/.test(tag) || (tag === 'INPUT' && t.type !== 'range')) || (t && t.isContentEditable)) return;
    toggle();
  }
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('keydown', onKey);
    root.document.addEventListener('DOMContentLoaded', function () {
      var b = root.document.getElementById('pCam');
      if (b) b.addEventListener('click', function () { var sp = root.document.getElementById('staffpanel'); if (sp) sp.hidden = true; open(); });
    });
    if (root.addEventListener) root.addEventListener('resize', function () { apply(); });
  }

  var CamView = {
    R: REGLAGES, RANGE: RANGE, KEYS: KEYS,
    constraints: constraints, tune: tune, value: value, set: set, filters: filters,
    rot: rot, flip: flip, mirror: mirror, zone: zone, toScreen: toScreen,
    boxHtml: boxHtml, apply: apply, attach: attach,
    open: open, close: close, toggle: toggle, isOpen: isOpen,
    report: function () { return last.report; }, stream: liveStream
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CamView;
  if (root) root.CamView = CamView;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
