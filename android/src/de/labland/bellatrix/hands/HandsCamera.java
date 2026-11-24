package de.labland.bellatrix.hands;

import android.content.Context;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.util.Range;
import android.util.Size;
import android.view.Surface;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The camera for the hands, through Camera2: an ImageReader with YUV_420_888 frames at 640x480.
 *
 * Which camera: the USB webcam (Logitech). On the big tablet its own cameras are USB cameras too
 * ("iVi camera", also LENS_FACING_EXTERNAL), so among the external cameras the one whose largest
 * size is 1920x1080 is taken, and of several the one with the highest number; without an external
 * camera, the first one. handsConfig({camera:"id"}) can name one.
 *
 * Which way up: the same turn Chrome gives the page's camera picture (sensor orientation and screen
 * rotation; external and front cameras one way, back cameras the other), plus an optional extra
 * turn from the page ('bellatrix-hands-rot' or 'bellatrix-cam-rot'), so the points mean the same as
 * before.
 *
 * All camera calls and callbacks run on the camera thread. Each frame is copied (three bulk copies)
 * and closed at once; while the compute thread is busy, frames are dropped, never queued.
 *
 * New code (the Telekom app uses CameraX); the camera choice follows its TrackingModels.kt
 * (external cameras are numbered from 100 on some devices).
 */
final class HandsCamera {
    static final String TAG = HandModels.TAG;
    static final int WANT_W = 640, WANT_H = 480;
    static final int FIRST_EXTERNAL_ID = 100;

    /** One camera of the device, as the system describes it. */
    static final class Choice {
        String id;
        int facing;
        boolean external;
        int sensorOrientation;
        Size max;
        Size size;
        Range<Integer> fps;

        String describe() {
            String f = external ? "external" : facing == CameraCharacteristics.LENS_FACING_FRONT ? "front" : "back";
            return id + " " + f + " max " + (max == null ? "?" : max.getWidth() + "x" + max.getHeight());
        }
    }

    final Hands hands;
    final Handler handler;
    final CameraManager manager;

    // Camera thread only.
    Choice choice;
    int generation;
    boolean wanted, opening;
    int attempts;
    CameraDevice device;
    CameraCaptureSession session;
    ImageReader reader;
    CountDownLatch closedLatch;
    final OpenTask openTask = new OpenTask(this);

    HandsCamera(Hands hands, Context context, Handler handler) {
        this.hands = hands;
        this.handler = handler;
        this.manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
    }

    /** All cameras, in the system's order. */
    static List<Choice> list(CameraManager m) throws CameraAccessException {
        List<Choice> all = new ArrayList<>();
        for (String id : m.getCameraIdList()) {
            try {
                CameraCharacteristics c = m.getCameraCharacteristics(id);
                Choice ch = new Choice();
                ch.id = id;
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                ch.facing = facing == null ? CameraCharacteristics.LENS_FACING_EXTERNAL : facing;
                ch.external = ch.facing == CameraCharacteristics.LENS_FACING_EXTERNAL || number(id) >= FIRST_EXTERNAL_ID;
                Integer so = c.get(CameraCharacteristics.SENSOR_ORIENTATION);
                ch.sensorOrientation = so == null ? 0 : so;
                StreamConfigurationMap map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                Size[] sizes = map == null ? null : map.getOutputSizes(ImageFormat.YUV_420_888);
                if (sizes == null || sizes.length == 0) continue;
                ch.max = sizes[0];
                for (Size s : sizes) if ((long) s.getWidth() * s.getHeight() > (long) ch.max.getWidth() * ch.max.getHeight()) ch.max = s;
                ch.size = pickSize(sizes);
                ch.fps = pickFps(c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES));
                all.add(ch);
            } catch (RuntimeException e) {
                Log.w(TAG, "Camera " + id + " not readable: " + e);
            }
        }
        return all;
    }

    /** The camera for the hands (see the class note); null when the device has none. */
    static Choice choose(List<Choice> all, String override) {
        if (override != null && override.length() > 0) {
            for (Choice c : all) if (c.id.equals(override)) return c;
        }
        List<Choice> external = new ArrayList<>(), fullHd = new ArrayList<>();
        for (Choice c : all) {
            if (!c.external) continue;
            external.add(c);
            if (c.max != null && c.max.getWidth() == 1920 && c.max.getHeight() == 1080) fullHd.add(c);
        }
        List<Choice> pool = !fullHd.isEmpty() ? fullHd : external;
        Choice best = null;
        for (Choice c : pool) if (best == null || number(c.id) > number(best.id)) best = c;
        if (best != null) return best;
        return all.isEmpty() ? null : all.get(0);
    }

    /** Clockwise turn that makes the picture upright, as Chrome turns it for the page, plus extra. */
    static int rotationFor(Choice c, int displayDegrees, int extra) {
        int base = c.facing == CameraCharacteristics.LENS_FACING_BACK
                ? (c.sensorOrientation - displayDegrees + 360) % 360
                : (c.sensorOrientation + displayDegrees) % 360;
        base = (base / 90) * 90;
        return (base + extra + 360) % 360;
    }

    static Size pickSize(Size[] sizes) {
        Size best = null;
        long bestScore = Long.MAX_VALUE;
        for (Size s : sizes) {
            if (s.getWidth() == WANT_W && s.getHeight() == WANT_H) return s;
            long area = (long) s.getWidth() * s.getHeight();
            long score = Math.abs(area - (long) WANT_W * WANT_H);
            if (s.getWidth() * 3 != s.getHeight() * 4) score += 100000;   // 4:3 first
            if (score < bestScore) { bestScore = score; best = s; }
        }
        return best;
    }

    static Range<Integer> pickFps(Range<Integer>[] ranges) {
        if (ranges == null) return null;
        Range<Integer> best = null;
        for (Range<Integer> r : ranges) {
            if (r.getUpper() > 30) continue;
            if (best == null || r.getUpper() > best.getUpper()
                    || (r.getUpper().equals(best.getUpper()) && r.getLower() > best.getLower())) best = r;
        }
        return best;
    }

    static int number(String id) {
        try { return Integer.parseInt(id); } catch (NumberFormatException e) { return -1; }
    }

    /* ---------------- opening and closing (any thread) ---------------- */

    void open(Choice c) {
        handler.post(new StartTask(this, c));
    }

    /** Closes the camera and waits (at most 1.5 s) until it is really free for somebody else. */
    void close() {
        CountDownLatch latch = new CountDownLatch(1);
        if (Looper.myLooper() == handler.getLooper()) {
            closeNow(latch);
            return;
        }
        handler.post(new CloseTask(this, latch));
        try {
            if (!latch.await(1500, TimeUnit.MILLISECONDS)) Log.w(TAG, "Camera still closing after 1.5 s");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /* ---------------- camera thread ---------------- */

    void startNow(Choice c) {
        closeNow(null);
        choice = c;
        wanted = true;
        attempts = 0;
        generation++;
        openNow();
    }

    void openNow() {
        if (!wanted || device != null || opening) return;
        attempts++;
        opening = true;
        try {
            manager.openCamera(choice.id, new DeviceCallback(this, generation), handler);
        } catch (CameraAccessException | SecurityException | IllegalArgumentException e) {
            opening = false;
            retryOrFail("camera " + choice.id + " could not be opened: " + e);
        }
    }

    void retryOrFail(String why) {
        if (wanted && attempts < 5) {
            Log.w(TAG, why + " (attempt " + attempts + ", again shortly)");
            handler.removeCallbacks(openTask);
            handler.postDelayed(openTask, 400);
        } else if (wanted) {
            wanted = false;
            hands.cameraFailed(why);
        }
    }

    void closeNow(CountDownLatch latch) {
        wanted = false;
        handler.removeCallbacks(openTask);
        if (session != null) {
            try { session.close(); } catch (RuntimeException e) { Log.w(TAG, "session close: " + e); }
            session = null;
        }
        if (device != null) {
            if (closedLatch != null) closedLatch.countDown();
            closedLatch = latch;
            CameraDevice d = device;
            device = null;
            try { d.close(); } catch (RuntimeException e) { Log.w(TAG, "device close: " + e); releaseReader(); countDown(); }
            return;
        }
        if (opening) {
            // onOpened will close it; then onClosed frees the waiting page.
            if (closedLatch != null) closedLatch.countDown();
            closedLatch = latch;
            return;
        }
        releaseReader();
        if (latch != null) latch.countDown();
    }

    void countDown() {
        if (closedLatch != null) closedLatch.countDown();
        closedLatch = null;
    }

    void releaseReader() {
        if (reader != null) {
            try { reader.close(); } catch (RuntimeException e) { Log.w(TAG, "reader close: " + e); }
            reader = null;
        }
    }

    void onOpened(CameraDevice d, int gen) {
        opening = false;
        if (!wanted || gen != generation) {
            try { d.close(); } catch (RuntimeException e) { countDown(); }
            return;
        }
        device = d;
        try {
            releaseReader();
            reader = ImageReader.newInstance(choice.size.getWidth(), choice.size.getHeight(), ImageFormat.YUV_420_888, 3);
            reader.setOnImageAvailableListener(new FrameListener(this), handler);
            List<Surface> targets = Collections.singletonList(reader.getSurface());
            d.createCaptureSession(targets, new SessionCallback(this, gen), handler);
        } catch (CameraAccessException | RuntimeException e) {
            fail("camera session: " + e);
        }
    }

    void onConfigured(CameraCaptureSession s, int gen) {
        if (!wanted || gen != generation || device == null) {
            try { s.close(); } catch (RuntimeException e) { /* gone */ }
            return;
        }
        session = s;
        try {
            CaptureRequest.Builder b = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            b.addTarget(reader.getSurface());
            if (choice.fps != null) b.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, choice.fps);
            s.setRepeatingRequest(b.build(), null, handler);
            Log.i(TAG, "Camera on for the hands: " + choice.describe() + ", " + choice.size.getWidth() + "x" + choice.size.getHeight()
                    + (choice.fps == null ? "" : " at " + choice.fps));
            hands.cameraStarted();
        } catch (CameraAccessException | RuntimeException e) {
            fail("camera request: " + e);
        }
    }

    void fail(String why) {
        Log.w(TAG, why);
        boolean was = wanted;
        closeNow(null);
        if (was) hands.cameraFailed(why);
    }

    void onDeviceClosed(int gen) {
        // A camera closed for a restart must not take the new frames' reader with it.
        if (gen == generation && device == null) releaseReader();
        countDown();
    }

    void onDeviceError(CameraDevice d, int error, int gen) {
        boolean current = gen == generation && wanted;
        opening = false;
        if (device == d) device = null;
        try { d.close(); } catch (RuntimeException e) { countDown(); }
        if (!current) return;
        if (error == CameraDevice.StateCallback.ERROR_CAMERA_IN_USE || error == CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE) {
            retryOrFail("camera " + choice.id + " in use (error " + error + ")");
        } else {
            wanted = false;
            hands.cameraFailed("camera " + choice.id + " error " + error);
        }
    }

    /** A new frame: copied and handed to the compute thread if it is free, otherwise dropped. */
    void onFrame(ImageReader r) {
        Image img;
        try { img = r.acquireLatestImage(); } catch (RuntimeException e) { return; }
        if (img == null) return;
        try {
            long now = SystemClock.uptimeMillis();
            hands.cameraFrames++;
            if (!wanted || !hands.ready(now)) return;
            Image.Plane[] p = img.getPlanes();
            PixelFrame.Yuv y = hands.yuv;
            y.width = img.getWidth();
            y.height = img.getHeight();
            y.yRowStride = p[0].getRowStride();
            y.uvRowStride = p[1].getRowStride();
            y.uvPixelStride = p[1].getPixelStride();
            y.y = copy(p[0].getBuffer(), y.y);
            y.u = copy(p[1].getBuffer(), y.u);
            y.v = copy(p[2].getBuffer(), y.v);
            y.arrivedAtMs = now;
            hands.submit(now);
        } catch (RuntimeException e) {
            Log.w(TAG, "frame copy: " + e);
        } finally {
            img.close();
        }
    }

    static byte[] copy(ByteBuffer b, byte[] into) {
        b.rewind();
        int n = b.remaining();
        // Rows can be padded; the last row may end without its padding. Keep room for a full stride.
        if (into.length < n) into = new byte[n];
        b.get(into, 0, n);
        return into;
    }

    /* ---------------- callbacks (static classes: see the build note in WebActivity) ---------------- */

    static final class StartTask implements Runnable {
        final HandsCamera cam;
        final Choice choice;

        StartTask(HandsCamera cam, Choice choice) { this.cam = cam; this.choice = choice; }

        @Override
        public void run() { cam.startNow(choice); }
    }

    static final class OpenTask implements Runnable {
        final HandsCamera cam;

        OpenTask(HandsCamera cam) { this.cam = cam; }

        @Override
        public void run() { cam.openNow(); }
    }

    static final class CloseTask implements Runnable {
        final HandsCamera cam;
        final CountDownLatch latch;

        CloseTask(HandsCamera cam, CountDownLatch latch) { this.cam = cam; this.latch = latch; }

        @Override
        public void run() { cam.closeNow(latch); }
    }

    static final class DeviceCallback extends CameraDevice.StateCallback {
        final HandsCamera cam;
        final int gen;

        DeviceCallback(HandsCamera cam, int gen) { this.cam = cam; this.gen = gen; }

        @Override
        public void onOpened(CameraDevice d) { cam.onOpened(d, gen); }

        @Override
        public void onDisconnected(CameraDevice d) { cam.onDeviceError(d, -1, gen); }

        @Override
        public void onError(CameraDevice d, int error) { cam.onDeviceError(d, error, gen); }

        @Override
        public void onClosed(CameraDevice d) { cam.onDeviceClosed(gen); }
    }

    static final class SessionCallback extends CameraCaptureSession.StateCallback {
        final HandsCamera cam;
        final int gen;

        SessionCallback(HandsCamera cam, int gen) { this.cam = cam; this.gen = gen; }

        @Override
        public void onConfigured(CameraCaptureSession s) { cam.onConfigured(s, gen); }

        @Override
        public void onConfigureFailed(CameraCaptureSession s) {
            if (gen == cam.generation) cam.fail("camera session could not be configured");
        }
    }

    static final class FrameListener implements ImageReader.OnImageAvailableListener {
        final HandsCamera cam;

        FrameListener(HandsCamera cam) { this.cam = cam; }

        @Override
        public void onImageAvailable(ImageReader r) { cam.onFrame(r); }
    }
}
