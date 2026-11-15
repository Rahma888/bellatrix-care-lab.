package com.k2fsa.sherpa.onnx;

/* Mirror of sherpa-onnx 1.12.22 kotlin-api/Tts.kt (Apache-2.0). libsherpa-onnx-jni.so reads these
   fields by name and type through JNI: names, types and the package must stay exactly as they are. */
public final class OfflineTts {
    static {
        System.loadLibrary("sherpa-onnx-jni");
    }

    /** Receives the audio sentence by sentence while it is made; returns 1 to go on, 0 to stop.
     *  The library calls invoke([F)Ljava/lang/Integer; on the object it is given. */
    public interface Chunk {
        Integer invoke(float[] samples);
    }

    private long ptr;

    public OfflineTts(OfflineTtsConfig config) {
        ptr = newFromFile(config);
    }

    public int sampleRate() { return getSampleRate(ptr); }

    /** Makes the speech for text; chunk gets it piece by piece. Returns all samples. */
    public float[] generate(String text, int sid, float speed, Chunk chunk) {
        Object[] r = generateWithCallbackImpl(ptr, text, sid, speed, chunk);
        return (float[]) r[0];
    }

    public void release() {
        if (ptr != 0) {
            delete(ptr);
            ptr = 0;
        }
    }

    private native long newFromFile(OfflineTtsConfig config);
    private native void delete(long ptr);
    private native int getSampleRate(long ptr);
    private native int getNumSpeakers(long ptr);
    private native Object[] generateImpl(long ptr, String text, int sid, float speed);
    private native Object[] generateWithCallbackImpl(long ptr, String text, int sid, float speed, Object callback);
}
