package de.labland.bellatrix.hands;

import android.content.Context;
import android.util.Log;

import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.Tensor;
import org.tensorflow.lite.gpu.GpuDelegate;
import org.tensorflow.lite.gpu.GpuDelegateFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;

/**
 * The two hand models (palm detector and hand landmarks, the "lite" pair in assets/models/), each
 * in a TensorFlow Lite interpreter. The graphics chip (GpuDelegate) is tried first; if it cannot
 * take a model, that model runs on 4 processor cores instead.
 *
 * Everything here, loading included, must run on the one compute thread: the GPU delegate is bound
 * to the thread that created it.
 *
 * Port of LabLand's Telekom app (ai.labland.telekom.tracking.direct.InferenceUnit.kt), which uses
 * LiteRT's CompiledModel; here the classic Interpreter of TensorFlow Lite 2.16.1 does the same job.
 */
final class HandModels {
    static final String TAG = "BellatrixHands";
    static final int CPU_THREADS = 4;

    /** One model with its interpreter and its input/output memory. */
    static final class Model {
        final String name;
        Interpreter interpreter;
        GpuDelegate gpu;
        ByteBuffer file;
        ByteBuffer input;
        FloatBuffer inputFloats;
        final Map<Integer, Object> outputs = new HashMap<>();
        ByteBuffer[] outputBuffers = new ByteBuffer[0];
        FloatBuffer[] outputFloats = new FloatBuffer[0];
        String backend = "";
        long lastNs;

        Model(String name) { this.name = name; }

        void run(float[] values) {
            inputFloats.clear();
            inputFloats.put(values);
            input.rewind();
            for (ByteBuffer b : outputBuffers) b.rewind();
            long t0 = System.nanoTime();
            interpreter.runForMultipleInputsOutputs(new Object[] {input}, outputs);
            lastNs = System.nanoTime() - t0;
        }

        /** Output i as floats (into dst, which must have its size). */
        void read(int i, float[] dst) {
            FloatBuffer f = outputFloats[i];
            f.rewind();
            f.get(dst);
        }

        String[] outputNames = new String[0];

        String outputName(int i) { return i < outputNames.length && outputNames[i] != null ? outputNames[i] : ""; }

        int outputCount() { return outputBuffers.length; }

        int outputSize(int i) { return outputFloats[i].capacity(); }

        void close() {
            try { if (interpreter != null) interpreter.close(); } catch (Throwable t) { Log.w(TAG, name + " close: " + t); }
            try { if (gpu != null) gpu.close(); } catch (Throwable t) { Log.w(TAG, name + " gpu close: " + t); }
            interpreter = null;
            gpu = null;
        }
    }

    final Model palm = new Model("palm");
    final Model marks = new Model("landmarks");
    final TensorImage palmInput = new TensorImage(HandGeometry.PALM_INPUT_SIZE);
    final TensorImage landmarkInput = new TensorImage(HandGeometry.LANDMARK_INPUT_SIZE);

    // Which output is which (found from the shapes at load time).
    int palmBoxesOut = 0, palmScoresOut = 1, marksOut = 0, presenceOut = 1, handednessOut = 2;

    final float[] palmRegressors = new float[HandGeometry.PALM_ANCHOR_COUNT * HandGeometry.PALM_VALUES_PER_ANCHOR];
    final float[] palmScores = new float[HandGeometry.PALM_ANCHOR_COUNT];
    final float[] rawLandmarks = new float[HandGeometry.HAND_LANDMARK_COUNT * HandGeometry.LANDMARK_VALUES_PER_POINT];
    final float[] one = new float[1];
    float presence, rightHandScore;

    /** "gpu", "cpu" or "gpu+cpu" (palm detector + landmarks on different chips). */
    String backend() {
        if (palm.backend.equals(marks.backend)) return marks.backend;
        return palm.backend + "+" + marks.backend;
    }

    boolean loaded() { return palm.interpreter != null && marks.interpreter != null; }

    /** Loads both models. preferGpu false: processor cores only. Throws if a model cannot run at all. */
    void load(Context context, boolean preferGpu) throws IOException {
        close();
        File cache = new File(context.getCodeCacheDir(), "hands-gpu");
        cache.mkdirs();
        open(context, palm, "models/palm_detection_lite.tflite", "palm-lite-2161", preferGpu, cache);
        open(context, marks, "models/hand_landmark_lite.tflite", "marks-lite-2161", preferGpu, cache);
        mapOutputs();
        // A first run, so a model that loads but cannot run shows here, not in the first frame.
        detectPalms();
        locateLandmarks();
        Log.i(TAG, "Hand models ready: palm " + palm.backend + " " + palm.lastNs / 1000000 + " ms, landmarks "
                + marks.backend + " " + marks.lastNs / 1000000 + " ms");
    }

    private static void open(Context context, Model m, String asset, String token, boolean preferGpu, File cache) throws IOException {
        if (m.file == null) m.file = readAsset(context, asset);
        if (preferGpu) {
            GpuDelegate gpu = null;
            try {
                GpuDelegate.Options o = new GpuDelegate.Options();
                o.setPrecisionLossAllowed(true);
                o.setInferencePreference(GpuDelegateFactory.Options.INFERENCE_PREFERENCE_SUSTAINED_SPEED);
                o.setSerializationParams(cache.getAbsolutePath(), token);
                gpu = new GpuDelegate(o);
                Interpreter.Options io = new Interpreter.Options();
                io.addDelegate(gpu);
                m.file.rewind();
                m.interpreter = new Interpreter(m.file, io);
                m.gpu = gpu;
                m.backend = "gpu";
                buffers(m);
                m.run(new float[m.inputFloats.capacity()]);
                return;
            } catch (Throwable t) {
                Log.w(TAG, m.name + ": graphics chip refused (" + t + "), processor cores instead");
                try { if (m.interpreter != null) m.interpreter.close(); } catch (Throwable ignored) { /* gone */ }
                try { if (gpu != null) gpu.close(); } catch (Throwable ignored) { /* gone */ }
                m.interpreter = null;
                m.gpu = null;
            }
        }
        Interpreter.Options io = new Interpreter.Options();
        io.setNumThreads(CPU_THREADS);
        m.file.rewind();
        m.interpreter = new Interpreter(m.file, io);
        m.backend = "cpu";
        buffers(m);
    }

    /** Input and output memory in the device's byte order, the size of each tensor. */
    private static void buffers(Model m) {
        Tensor in = m.interpreter.getInputTensor(0);
        m.input = ByteBuffer.allocateDirect(in.numBytes()).order(ByteOrder.nativeOrder());
        m.inputFloats = m.input.asFloatBuffer();
        int n = m.interpreter.getOutputTensorCount();
        m.outputBuffers = new ByteBuffer[n];
        m.outputFloats = new FloatBuffer[n];
        m.outputNames = new String[n];
        m.outputs.clear();
        for (int i = 0; i < n; i++) {
            Tensor t = m.interpreter.getOutputTensor(i);
            m.outputNames[i] = t.name();
            m.outputBuffers[i] = ByteBuffer.allocateDirect(t.numBytes()).order(ByteOrder.nativeOrder());
            m.outputFloats[i] = m.outputBuffers[i].asFloatBuffer();
            m.outputs.put(i, m.outputBuffers[i]);
            Log.i(TAG, m.name + " output " + i + " " + t.name() + " " + java.util.Arrays.toString(t.shape()));
        }
    }

    /** Palm detector: boxes (2016 x 18) and scores (2016). Landmarks: the first 63-value output is the
     *  picture points (the second, in metres, is not used), then presence and left/right. */
    private void mapOutputs() {
        for (int i = 0; i < palm.outputCount(); i++) {
            int s = palm.outputSize(i);
            if (s == palmRegressors.length) palmBoxesOut = i;
            else if (s == palmScores.length) palmScoresOut = i;
        }
        if (palm.outputSize(palmBoxesOut) != palmRegressors.length || palm.outputSize(palmScoresOut) != palmScores.length) {
            throw new IllegalStateException("palm model: unexpected outputs");
        }
        /* By name first: in MediaPipe's hand_landmark_lite, "Identity" = the 21 points in input pixels (0..224),
           "Identity_1" = hand present, "Identity_2" = right hand, "Identity_3" = the 21 points in metres (not used).
           The order of the outputs in the file is not that order (measured 2026-11-13: points came out tiny). */
        int byName = -1, flag = -1, hand = -1, world = -1;
        for (int i = 0; i < marks.outputCount(); i++) {
            String nm = marks.outputName(i);
            if (nm.endsWith("Identity") && marks.outputSize(i) == rawLandmarks.length) byName = i;
            else if (nm.endsWith("Identity_1") && marks.outputSize(i) == 1) flag = i;
            else if (nm.endsWith("Identity_2") && marks.outputSize(i) == 1) hand = i;
            else if (nm.endsWith("Identity_3") && marks.outputSize(i) == rawLandmarks.length) world = i;
        }
        if (byName >= 0 && flag >= 0 && hand >= 0) {
            marksOut = byName; presenceOut = flag; handednessOut = hand; otherMarksOut = world;
        } else {
            int found = -1, ones = 0;
            for (int i = 0; i < marks.outputCount(); i++) {
                int s = marks.outputSize(i);
                if (s == rawLandmarks.length) { if (found < 0) found = i; else otherMarksOut = i; }
                else if (s == 1) {
                    if (ones == 0) presenceOut = i;
                    else if (ones == 1) handednessOut = i;
                    ones++;
                }
            }
            if (found < 0 || ones < 2) throw new IllegalStateException("landmark model: unexpected outputs");
            marksOut = found;
        }
        Log.i(TAG, "landmark outputs: points " + marksOut + " (" + marks.outputName(marksOut) + "), present " + presenceOut
                + " (" + marks.outputName(presenceOut) + "), right hand " + handednessOut + " (" + marks.outputName(handednessOut) + ")");
    }

    /** The other 63-value output (points in metres), to swap with if the chosen one turns out to be it. */
    int otherMarksOut = -1;
    private boolean marksChecked = false;

    /** Runs the detector on palmInput; fills palmRegressors and palmScores. */
    void detectPalms() {
        palm.run(palmInput.values);
        palm.read(palmBoxesOut, palmRegressors);
        palm.read(palmScoresOut, palmScores);
    }

    /** Runs the landmark model on landmarkInput; fills rawLandmarks, presence and rightHandScore. */
    void locateLandmarks() {
        marks.run(landmarkInput.values);
        marks.read(marksOut, rawLandmarks);
        /* Picture points lie between 0 and 224; points in metres stay below about 0.3. If the chosen output looks
           like metres while the other 63-value output does not, they were mixed up: swap once and for all. */
        if (!marksChecked && otherMarksOut >= 0) {
            float mx = 0f;
            for (float v : rawLandmarks) mx = Math.max(mx, Math.abs(v));
            if (mx < 2f) {
                float[] alt = new float[rawLandmarks.length];
                marks.read(otherMarksOut, alt);
                float ma = 0f;
                for (float v : alt) ma = Math.max(ma, Math.abs(v));
                if (ma > 2f) {
                    int t = marksOut; marksOut = otherMarksOut; otherMarksOut = t;
                    System.arraycopy(alt, 0, rawLandmarks, 0, alt.length);
                    Log.i(TAG, "landmark outputs swapped: points now " + marksOut);
                }
            }
            marksChecked = mx >= 2f || marksChecked;
        }
        marks.read(presenceOut, one);
        presence = one[0];
        marks.read(handednessOut, one);
        rightHandScore = one[0];
    }

    void close() {
        palm.close();
        marks.close();
    }

    static ByteBuffer readAsset(Context context, String name) throws IOException {
        InputStream in = context.getAssets().open(name);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(1 << 21);
            byte[] chunk = new byte[1 << 16];
            int n;
            while ((n = in.read(chunk)) > 0) bytes.write(chunk, 0, n);
            byte[] all = bytes.toByteArray();
            ByteBuffer b = ByteBuffer.allocateDirect(all.length).order(ByteOrder.nativeOrder());
            b.put(all);
            b.rewind();
            return b;
        } finally {
            in.close();
        }
    }
}
