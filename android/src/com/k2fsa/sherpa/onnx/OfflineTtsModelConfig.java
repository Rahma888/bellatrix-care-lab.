package com.k2fsa.sherpa.onnx;

/* Mirror of sherpa-onnx 1.12.22 kotlin-api/Tts.kt (Apache-2.0). libsherpa-onnx-jni.so reads these
   fields by name and type through JNI: names, types and the package must stay exactly as they are. */
public final class OfflineTtsModelConfig {
    public OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
    public OfflineTtsMatchaModelConfig matcha = new OfflineTtsMatchaModelConfig();
    public OfflineTtsKokoroModelConfig kokoro = new OfflineTtsKokoroModelConfig();
    public OfflineTtsKittenModelConfig kitten = new OfflineTtsKittenModelConfig();
    public int numThreads = 1;
    public boolean debug = false;
    public String provider = "cpu";
}
