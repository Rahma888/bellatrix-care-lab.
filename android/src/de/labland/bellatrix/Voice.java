package de.labland.bellatrix;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.util.Locale;

/**
 * Bellatrix's voice on the robot. The WebView has no voices of its own, so the pages speak
 * through Android's speech engine. The robot ships without one; the install script adds the
 * offline engine below (sherpa-onnx with an English Piper voice). Without any engine the pages
 * show subtitles instead.
 *
 * Top-level classes, not inner ones: see the build note in WebActivity.
 */
final class Voice implements TextToSpeech.OnInitListener {

    /** The offline engine the install script puts on the robot. Any other engine works too. */
    static final String ENGINE = "com.k2fsa.sherpa.onnx.tts.engine";

    final WebActivity a;
    final TextToSpeech tts;
    volatile boolean ready;

    Voice(WebActivity a) {
        this.a = a;
        tts = installed(a, ENGINE) ? new TextToSpeech(a, this, ENGINE) : new TextToSpeech(a, this);
    }

    static boolean installed(Context c, String pkg) {
        try {
            c.getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            Log.i(WebActivity.TAG, "No speech engine on this device: the pages show subtitles.");
            return;
        }
        int lang = tts.setLanguage(Locale.US);
        if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.ENGLISH);
        tts.setOnUtteranceProgressListener(new VoiceProgress(this));
        ready = true;
        Log.i(WebActivity.TAG, "Voice ready (" + tts.getDefaultEngine() + ").");
        // The care-team page then stops saying "no voice".
        a.js("window.dispatchEvent(new Event('bellatrixvoice'))");
    }

    void speak(String id, String text, float rate, float volume, float pitch) {
        if (!ready) { finished(id); return; }
        tts.setSpeechRate(rate > 0 ? rate : 1f);
        tts.setPitch(pitch > 0 ? pitch : 1f);
        Bundle p = new Bundle();
        p.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, p, id) != TextToSpeech.SUCCESS) finished(id);
    }

    void stop() { if (ready) tts.stop(); }

    void shutdown() { ready = false; tts.shutdown(); }

    /** Tells the page that a sentence has been spoken, so the step can go on. */
    void finished(String id) { a.voiceDone(id); }

    void started(String id) { a.voiceStarted(id); }
}

final class VoiceProgress extends UtteranceProgressListener {
    final Voice v;

    VoiceProgress(Voice v) { this.v = v; }

    @Override
    public void onStart(String id) { v.started(id); }

    @Override
    public void onDone(String id) { v.finished(id); }

    @Override
    @SuppressWarnings("deprecation")
    public void onError(String id) { v.finished(id); }

    @Override
    public void onError(String id, int code) { v.finished(id); }
}
