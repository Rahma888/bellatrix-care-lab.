package com.k2fsa.sherpa.onnx;

/* Mirror of sherpa-onnx 1.12.22 kotlin-api/Tts.kt (Apache-2.0). libsherpa-onnx-jni.so reads these
   fields by name and type through JNI: names, types and the package must stay exactly as they are. */
public final class OfflineTtsMatchaModelConfig {
    public String acousticModel = "";
    public String vocoder = "";
    public String lexicon = "";
    public String tokens = "";
    public String dataDir = "";
    public String dictDir = "";
    public float noiseScale = 1.0f;
    public float lengthScale = 1.0f;
}
