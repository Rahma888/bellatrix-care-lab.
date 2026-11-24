package de.labland.bellatrix.hands;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Process;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import android.view.Surface;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Native hand tracking for the pages (pointing in the air, hand signs): the camera, the two hand
 * models and the frame-to-frame following, all in the app instead of MediaPipe in the WebView,
 * which saw the hand only ~8 times a second on the big tablet.
 *
 * One per app process, shared by the two screens (care team, patient): the one that started it
 * last receives the points. Threads: the camera thread copies frames, ONE compute thread converts
 * and runs the models; one frame in flight, the frames in between are dropped.
 *
 * The page receives {t, w, h, lm: [[x, y, z] x 21] normalised 0..1 in the upright picture, or
 * lm: null} at most 30 times a second (no hand: at most 10 times a second), and {error} when the
 * camera or the models fail, so it can go back to its own detection.
 *
 * Built after LabLand's Telekom app (ai.labland.telekom.tracking.direct.*), which follows hands at
 * 28.5 frames a second on the same tablet with the lite models.
 */
public final class Hands {
    static final String TAG = HandModels.TAG;

    /** Where the results go (any thread). */
    public interface Sink {
        void hands(String json);
    }

    private static Hands instance;

    public static synchronized Hands get(Context context) {
        if (instance == null) instance = new Hands(context.getApplicationContext());
        return instance;
    }

    /** The tracker if a page has used it, else null (the screens' pause/resume need not create it). */
    public static synchronized Hands existing() { return instance; }

    final Context app;
    final Handler work, camHandler;
    final HandsCamera camera;
    final HandModels models = new HandModels();
    final HandEngine engine = new HandEngine(models);
    final PixelFrame frame = new PixelFrame();
    final PixelFrame.Yuv yuv = new PixelFrame.Yuv();
    final InFlightGate gate = new InFlightGate(2000);
    final ProcessTask processTask = new ProcessTask(this);

    volatile boolean running, modelsReady, cameraOn;
    volatile Sink sink;
    volatile Object owner, pausedOwner;
    volatile String error = "", cameraText = "", camerasText = "[]";
    volatile int rotation;
    boolean loadedGpu;

    // Settings from the page (handsConfig), used at the next start.
    volatile boolean preferGpu = true;
    volatile int extraRotation;
    volatile String cameraOverride;

    // Measurements (compute thread writes, any thread reads).
    volatile float fps, inferMs, detectMs;
    int windowFrames;
    long windowStart;
    /* 24 Nov: to compare with the Telekom app on the tablet: the whole work per frame (workMs), frames worked
     * on a second (procFps), frames the camera sent a second (camFps), hands lost since the start (lost).
     * lazy = convert only the pixels the models read (PixelFrame.prepare / at); false = every pixel, as before. */
    volatile float workMs, procFps, camFps;
    volatile int lost;
    volatile boolean lazy = true;
    volatile int cameraFrames;
    int windowProc, windowCam;
    long procWindowStart;

    /* 24 Nov (Rahma: "copy the Telekom pointer as it is"): the palm (mean of points 0, 5, 9, 13, 17) through
     * the Telekom app's one-euro filter (shell/HandCursor.kt: MIN_CUTOFF_HZ 1.2, BETA 1.5, DERIVATIVE_CUTOFF_HZ
     * 1; a hand gone 250 ms starts afresh), at EVERY picture the tracker works on. The result goes to the
     * pointer drawn by the app (CursorOverlay, when the page turned it on) and to the page as "cur", so the
     * page chooses the buttons at the very place the pointer is drawn. */
    static final float CUR_MIN_CUT = 1.2f, CUR_BETA = 1.5f, CUR_D_CUT = 1f;
    static final long CUR_GONE_MS = 250;
    public volatile CursorOverlay overlay;
    static final int[] PALM_IDS = {0, 5, 9, 13, 17};
    float curX, curY, curDx, curDy;
    long curT, curLast;
    boolean curHas;

    // Delivery to the page (compute thread).
    long nextHandAt, lastNullAt;
    boolean lastHad;

    /* 16 Nov (Rahma: Seated Move Along must point as smoothly as the other activities): while the page counts
     * movements, the camera stays with the hands here and the page gets a small picture of the same frame every
     * picturesEveryMs for its body model, as {"pic":"data:image/jpeg;base64,.."}. 0 = off. Nothing is kept. */
    static final int PIC_STEP = 2;          // every 2nd pixel: 640 x 480 -> 320 x 240, enough for the body model
    static final int PIC_QUALITY = 70;      // JPEG quality: about 15 KB a picture
    volatile int picturesEveryMs;
    long lastPictureAt;
    int[] picPixels = new int[0];

    private Hands(Context app) {
        this.app = app;
        HandlerThread w = new HandlerThread("bellatrix-hands", Process.THREAD_PRIORITY_VIDEO);
        w.start();
        work = new Handler(w.getLooper());
        HandlerThread c = new HandlerThread("bellatrix-hands-camera", Process.THREAD_PRIORITY_VIDEO);
        c.start();
        camHandler = new Handler(c.getLooper());
        camera = new HandsCamera(this, app, camHandler);
    }

    /** {camera:"id", backend:"gpu"|"cpu", rot:0|90|180|270}; any part may be left out. Applies at the next start. */
    public synchronized void config(String json) {
        try {
            JSONObject o = new JSONObject(json == null || json.isEmpty() ? "{}" : json);
            if (o.has("camera")) cameraOverride = o.optString("camera", "");
            if (o.has("backend")) preferGpu = !"cpu".equals(o.optString("backend"));
            if (o.has("lazy")) lazy = o.optBoolean("lazy", true);
            if (o.has("rot")) {
                int r = o.optInt("rot", 0);
                extraRotation = (r == 90 || r == 180 || r == 270) ? r : 0;
            }
        } catch (Exception e) {
            Log.w(TAG, "handsConfig: " + e);
        }
    }

    /** "ok", "no-camera" or "error:..". The camera and the models then start in the background. */
    public synchronized String start(Activity a, Sink s) {
        if (a.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return "error:no camera permission";
        if (running) {
            owner = a;
            sink = s;
            return "ok";
        }
        HandsCamera.Choice choice;
        try {
            CameraManager m = (CameraManager) app.getSystemService(Context.CAMERA_SERVICE);
            List<HandsCamera.Choice> all = HandsCamera.list(m);
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < all.size(); i++) b.append(i > 0 ? "," : "").append(JSONObject.quote(all.get(i).describe()));
            camerasText = b.append(']').toString();
            choice = HandsCamera.choose(all, cameraOverride);
        } catch (Exception e) {
            return "error:" + e;
        }
        if (choice == null) return "no-camera";
        int display = 0;
        try {
            switch (a.getWindowManager().getDefaultDisplay().getRotation()) {
                case Surface.ROTATION_90: display = 90; break;
                case Surface.ROTATION_180: display = 180; break;
                case Surface.ROTATION_270: display = 270; break;
                default: display = 0;
            }
        } catch (RuntimeException e) { /* 0 */ }
        rotation = HandsCamera.rotationFor(choice, display, extraRotation);
        cameraText = choice.describe() + ", " + choice.size.getWidth() + "x" + choice.size.getHeight() + ", turned " + rotation;
        owner = a;
        sink = s;
        error = "";
        running = true;
        cameraOn = false;
        gate.reset();
        work.post(new LoadTask(this));
        camera.open(choice);
        Log.i(TAG, "Hands start: camera " + cameraText + " (screen " + display + ")");
        return "ok";
    }

    /** Stops the camera (and waits until it is free) when who started it, or who is null. */
    public void stop(Object who) {
        synchronized (this) {
            if (who != null && owner != null && who != owner) return;
            if (who == null || who == owner) pausedOwner = null;
            if (!running) return;
            running = false;
            cameraOn = false;
        }
        camera.close();
        work.post(new ResetTask(this));
        Log.i(TAG, "Hands stopped");
    }

    /** The screen goes to the background: its camera closes, and opens again on resume. */
    public void pause(Activity a) {
        Sink s;
        synchronized (this) {
            if (!running || owner != a) return;
            s = sink;
        }
        stop(a);
        synchronized (this) {
            pausedOwner = a;
            sink = s;
        }
    }

    public void resume(Activity a) {
        Sink s;
        synchronized (this) {
            if (pausedOwner != a) return;
            pausedOwner = null;
            s = sink;
        }
        if (s != null) start(a, s);
    }

    /** {running, backend, fps, inferMs, detectMs, camera, cameras, error}. */
    public String stateJson() {
        StringBuilder b = new StringBuilder(256);
        b.append("{\"running\":").append(running && cameraOn)
                .append(",\"starting\":").append(running && !(cameraOn && modelsReady))
                .append(",\"backend\":").append(JSONObject.quote(modelsReady ? models.backend() : ""))
                .append(",\"fps\":").append(Math.round(fps * 10) / 10.0)
                .append(",\"inferMs\":").append(Math.round(inferMs * 10) / 10.0)
                .append(",\"detectMs\":").append(Math.round(detectMs * 10) / 10.0)
                .append(",\"workMs\":").append(Math.round(workMs * 10) / 10.0)
                .append(",\"procFps\":").append(Math.round(procFps * 10) / 10.0)
                .append(",\"camFps\":").append(Math.round(camFps * 10) / 10.0)
                .append(",\"lost\":").append(lost)
                .append(",\"lazy\":").append(lazy)
                .append(",\"camera\":").append(JSONObject.quote(cameraText))
                .append(",\"cameras\":").append(camerasText)
                .append(",\"error\":").append(JSONObject.quote(error))
                .append('}');
        return b.toString();
    }

    /* ---------------- from the camera thread ---------------- */

    /** Whether a frame arriving now would be used (otherwise it is closed without a copy). */
    boolean ready(long now) {
        return running && modelsReady && gate.isFree(now) && engine.wantsFrame(now);
    }

    void submit(long now) {
        gate.submitted(now);
        work.post(processTask);
    }

    void cameraStarted() { cameraOn = true; }

    void cameraFailed(String why) {
        Log.w(TAG, "Hands camera failed: " + why);
        fail("camera: " + why);
    }

    void fail(String why) {
        Sink s;
        synchronized (this) {
            if (!running) return;
            error = why;
            running = false;
            cameraOn = false;
            s = sink;
        }
        camHandler.post(new CloseCameraTask(camera));
        if (s != null) s.hands("{\"error\":" + JSONObject.quote(why) + "}");
    }

    /* ---------------- compute thread ---------------- */

    void loadModels() {
        if (modelsReady && loadedGpu == preferGpu) return;
        modelsReady = false;
        boolean gpu = preferGpu;
        try {
            models.load(app, gpu);
            loadedGpu = gpu;
            modelsReady = true;
        } catch (Throwable t) {
            Log.w(TAG, "Hand models could not load: " + t);
            fail("models: " + t);
        }
    }

    /** The page asks for pictures (ms between two) or stops them (0). */
    public void pictures(int everyMs) {
        picturesEveryMs = everyMs <= 0 ? 0 : Math.max(100, everyMs);
    }

    /** A small upright copy of the frame for the page (compute thread). */
    private void publishPicture(long arrived) {
        Sink s = sink;
        if (s == null || frame.width < PIC_STEP || frame.height < PIC_STEP) return;
        int w = frame.width / PIC_STEP, h = frame.height / PIC_STEP;
        if (picPixels.length != w * h) picPixels = new int[w * h];
        for (int y = 0; y < h; y++) {
            int di = y * w;
            for (int x = 0; x < w; x++) {
                int c = frame.at(x * PIC_STEP, y * PIC_STEP);   // ABGR (red lowest) -> ARGB for the Bitmap
                picPixels[di + x] = (c & 0xFF00FF00) | ((c & 0xFF) << 16) | ((c >> 16) & 0xFF);
            }
        }
        Bitmap b = Bitmap.createBitmap(picPixels, w, h, Bitmap.Config.ARGB_8888);
        ByteArrayOutputStream out = new ByteArrayOutputStream(24000);
        b.compress(Bitmap.CompressFormat.JPEG, PIC_QUALITY, out);
        b.recycle();
        String data = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        if (running) s.hands("{\"pic\":\"data:image/jpeg;base64," + data + "\",\"w\":" + w + ",\"h\":" + h + "}");
    }

    void process() {
        long arrived = yuv.arrivedAtMs;
        long t0 = System.nanoTime();
        boolean had = engine.hasHand;
        try {
            if (!running || !modelsReady) return;
            if (lazy) frame.prepare(yuv, rotation); else frame.fill(yuv, rotation);
            int every = picturesEveryMs;
            if (every > 0 && arrived - lastPictureAt >= every) {
                lastPictureAt = arrived;
                try { publishPicture(arrived); } catch (Throwable t) { Log.w(TAG, "picture: " + t); }
            }
            if (!engine.process(frame, arrived)) return;
            if (had && !engine.hasHand) lost++;
            measure();
            publish(arrived);
        } catch (Throwable t) {
            Log.w(TAG, "Hand frame: " + t);
            engine.reset();
        } finally {
            gate.completed(arrived);
            float ms = (System.nanoTime() - t0) / 1e6f;
            workMs = workMs == 0 ? ms : workMs * 0.9f + ms * 0.1f;
            countWindow();
        }
    }

    /** Frames worked on and frames sent by the camera, per second (compute thread). */
    private void countWindow() {
        windowProc++;
        long now = SystemClock.uptimeMillis();
        if (procWindowStart == 0) { procWindowStart = now; windowCam = cameraFrames; }
        if (now - procWindowStart >= 1000) {
            float s = (now - procWindowStart) / 1000f;
            int cam = cameraFrames;
            procFps = windowProc / s;
            camFps = (cam - windowCam) / s;
            windowProc = 0;
            windowCam = cam;
            procWindowStart = now;
        }
    }

    private void measure() {
        long now = SystemClock.uptimeMillis();
        if (engine.detectedThisFrame) detectMs = detectMs == 0 ? engine.lastDetectNs / 1e6f : detectMs * 0.8f + engine.lastDetectNs / 1e6f * 0.2f;
        if (engine.hasHand) {
            float ms = engine.lastLandmarkNs / 1e6f;
            inferMs = inferMs == 0 ? ms : inferMs * 0.8f + ms * 0.2f;
            windowFrames++;
        }
        if (windowStart == 0) windowStart = now;
        if (now - windowStart >= 1000) {
            fps = windowFrames * 1000f / (now - windowStart);
            windowFrames = 0;
            windowStart = now;
        }
    }

    private static float euroAlpha(float cut, float dt) { float tau = (float) (1.0 / (2 * Math.PI * cut)); return 1f / (1f + tau / dt); }

    /** One step of the Telekom filter for the palm at time t (ms); returns false when there is no hand. */
    private boolean updateCursor(long t) {
        if (!engine.hasHand) { CursorOverlay o = overlay; if (o != null) o.noHand(); return false; }
        float[] p = engine.points;
        int[] ids = PALM_IDS;
        float x = 0f, y = 0f;
        for (int id : ids) { x += p[3 * id]; y += p[3 * id + 1]; }
        x /= ids.length; y /= ids.length;
        if (!curHas || t - curLast > CUR_GONE_MS) { curHas = true; curX = x; curY = y; curDx = 0f; curDy = 0f; curT = t; }
        else {
            float dt = Math.max(0.001f, (t - curT) / 1000f);
            curT = t;
            float dx = (x - curX) / dt, dy = (y - curY) / dt;
            curDx += euroAlpha(CUR_D_CUT, dt) * (dx - curDx);
            curDy += euroAlpha(CUR_D_CUT, dt) * (dy - curDy);
            curX += euroAlpha(CUR_MIN_CUT + CUR_BETA * Math.abs(curDx), dt) * (x - curX);
            curY += euroAlpha(CUR_MIN_CUT + CUR_BETA * Math.abs(curDy), dt) * (y - curY);
        }
        curLast = t;
        CursorOverlay o = overlay;
        if (o != null) o.hand(curX, curY);
        return true;
    }

    /** At most 30 hands a second, at most 10 "no hand" a second (the first one at once). */
    private void publish(long arrived) {
        boolean cur = updateCursor(arrived);
        Sink s = sink;
        if (s == null) return;
        long now = SystemClock.uptimeMillis();
        long t = System.currentTimeMillis() - (now - arrived);
        StringBuilder b = new StringBuilder(900);
        b.append("{\"t\":").append(t).append(",\"w\":").append(frame.width).append(",\"h\":").append(frame.height);
        if (engine.hasHand) {
            if (now + 8 < nextHandAt) return;
            nextHandAt = Math.max(now, nextHandAt) + 33;
            lastHad = true;
            b.append(",\"lm\":[");
            float[] p = engine.points;
            for (int i = 0; i < HandGeometry.HAND_LANDMARK_COUNT; i++) {
                if (i > 0) b.append(',');
                b.append('[').append(num(p[3 * i])).append(',').append(num(p[3 * i + 1])).append(',').append(num(p[3 * i + 2])).append(']');
            }
            b.append(']');
            if (cur) b.append(",\"cur\":[").append(num(curX)).append(',').append(num(curY)).append(']');
            b.append('}');
        } else {
            if (!lastHad && now - lastNullAt < 100) return;
            lastHad = false;
            lastNullAt = now;
            b.append(",\"lm\":null}");
        }
        // Stopped or failed meanwhile: an error the page has to see must not be replaced by a late frame.
        if (running) s.hands(b.toString());
    }

    private static String num(float v) {
        if (Float.isNaN(v) || Float.isInfinite(v)) return "0";
        return Float.toString(Math.round(v * 100000f) / 100000f);
    }

    void resetEngine() {
        engine.reset();
        lastHad = false;
        fps = 0;
        windowFrames = 0;
        windowStart = 0;
    }

    /* ---------------- tasks (static classes: see the build note in WebActivity) ---------------- */

    static final class LoadTask implements Runnable {
        final Hands h;

        LoadTask(Hands h) { this.h = h; }

        @Override
        public void run() { h.loadModels(); }
    }

    static final class ProcessTask implements Runnable {
        final Hands h;

        ProcessTask(Hands h) { this.h = h; }

        @Override
        public void run() { h.process(); }
    }

    static final class ResetTask implements Runnable {
        final Hands h;

        ResetTask(Hands h) { this.h = h; }

        @Override
        public void run() { h.resetEngine(); }
    }

    static final class CloseCameraTask implements Runnable {
        final HandsCamera cam;

        CloseCameraTask(HandsCamera cam) { this.cam = cam; }

        @Override
        public void run() { cam.closeNow(null); }
    }
}
