/* Bellatrix: hand detection in a background worker.
   On the front tablet the hand model needs about 100 ms per picture. Run on the page itself, it froze the screen
   for those 100 ms each time, so the pointer could only jump. In a worker the page stays free (about 3 ms per
   picture to hand it over) and the pointer glides at the screen's own rate.
   core.js starts the worker from the source of the function below (a blob worker: no extra file request), sends
   it pictures as ImageBitmaps and receives the 21 landmarks of one hand. Measured on the tablet 2026-11-13:
   GPU in the worker works (118 ms per picture). A classic worker is needed: MediaPipe loads its wasm with
   importScripts, which module workers refuse. */
(function (root) {
  'use strict';
  root.HandWorkerSrc = function () {
    var model = null;
    self.onmessage = function (e) {
      var d = e.data || {};
      if (d.init) {
        import(d.base + '/vision_bundle.js').then(function (V) {
          return V.FilesetResolver.forVisionTasks(d.base + '/wasm').then(function (fs) {
            function make(dlg) {
              return V.HandLandmarker.createFromOptions(fs, {
                baseOptions: { modelAssetPath: d.base + '/hand_landmarker.task', delegate: dlg },
                runningMode: 'VIDEO', numHands: 1,
                minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
              }).then(function (m) { model = m; self.postMessage({ ready: dlg }); });
            }
            return make('GPU').catch(function () { return make('CPU'); });
          });
        }).catch(function (err) { self.postMessage({ fail: String(err && err.message || err) }); });
        return;
      }
      if (!d.bmp) return;
      if (!model) { try { d.bmp.close(); } catch (x) {} self.postMessage({ id: d.id, lm: null }); return; }
      var t0 = Date.now(), lm = null;
      try {
        var r = model.detectForVideo(d.bmp, d.ts);
        if (r && r.landmarks && r.landmarks.length) lm = r.landmarks[0].map(function (p) { return { x: p.x, y: p.y, z: p.z }; });
      } catch (err) { self.postMessage({ id: d.id, lm: null, err: String(err && err.message || err) }); try { d.bmp.close(); } catch (x) {} return; }
      try { d.bmp.close(); } catch (x) {}
      self.postMessage({ id: d.id, lm: lm, ms: Date.now() - t0 });
    };
  };
})(typeof window !== 'undefined' ? window : this);
