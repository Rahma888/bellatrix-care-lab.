package de.labland.bellatrix;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;

import java.io.File;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bellatrix's own voices, inside the app: English, French and German, without internet.
 *
 * The robot runs Android 9 and has no multi-language speech engine, so the app carries the
 * sherpa-onnx library (lib/arm64-v8a) and reads the voices from its own folder on the robot:
 *   files/voices/espeak-ng-data/          pronunciation data, shared
 *   files/voices/en|fr|de/model.onnx      one Piper voice per language
 *   files/voices/en|fr|de/tokens.txt
 * The install script puts them there. A language without a voice falls back to Voice (Android's
 * engine, English) or to subtitles.
 *
 * One worker thread makes and plays the speech; a new line or stop() cuts the current one.
 * Top-level and static classes only: see the build note in WebActivity.
 */
final class Speaker {

    static final String[] LANGS = {"en", "fr", "de"};

    final WebActivity a;
    final File root;
    final ExecutorService worker = Executors.newSingleThreadExecutor();
    final Map<String, OfflineTts> loaded = new HashMap<>();
    volatile int generation;
    AudioTrack track;
    int trackRate;
    static volatile Boolean libraryOk;

    Speaker(WebActivity a) {
        this.a = a;
        root = a.getExternalFilesDir("voices");
    }

    /** True when this language's voice files are on the robot and the library loads. */
    boolean has(String lang) {
        if (root == null || lang == null) return false;
        File d = new File(root, lang);
        return new File(d, "model.onnx").isFile() && new File(d, "tokens.txt").isFile()
                && new File(root, "espeak-ng-data").isDirectory() && library();
    }

    static boolean library() {
        if (libraryOk == null) {
            try {
                Class.forName("com.k2fsa.sherpa.onnx.OfflineTts");
                libraryOk = Boolean.TRUE;
            } catch (Throwable e) {
                Log.w(WebActivity.TAG, "Voice library not available: " + e);
                libraryOk = Boolean.FALSE;
            }
        }
        return libraryOk;
    }

    /** Loads a voice ahead of time, so the first sentence starts without waiting. */
    void prepare(String lang) {
        if (has(lang)) worker.execute(new Load(this, lang));
    }

    void speak(String id, String text, float rate, float volume, String lang) {
        int gen = ++generation;
        cut();
        worker.execute(new Say(this, gen, id, text, rate, volume, lang));
    }

    void stop() {
        generation++;
        cut();
    }

    void shutdown() {
        stop();
        worker.execute(new Close(this));
        worker.shutdown();
    }

    /** Silences what is playing now (the worker then sees the new generation and stops making more). */
    void cut() {
        AudioTrack t = track;
        if (t == null) return;
        try {
            t.pause();
            t.flush();
        } catch (IllegalStateException e) {
            // already released
        }
    }

    /* Runs on the worker. */
    OfflineTts load(String lang) {
        OfflineTts tts = loaded.get(lang);
        if (tts != null) return tts;
        if (!has(lang)) return null;
        long t0 = System.currentTimeMillis();
        try {
            File d = new File(root, lang);
            OfflineTtsConfig c = new OfflineTtsConfig();
            c.model.vits.model = new File(d, "model.onnx").getAbsolutePath();
            c.model.vits.tokens = new File(d, "tokens.txt").getAbsolutePath();
            c.model.vits.dataDir = new File(root, "espeak-ng-data").getAbsolutePath();
            c.model.numThreads = 4;
            c.model.provider = "cpu";
            c.maxNumSentences = 1;
            tts = new OfflineTts(c);
            loaded.put(lang, tts);
            Log.i(WebActivity.TAG, "Voice " + lang + " loaded in " + (System.currentTimeMillis() - t0) + " ms (" + tts.sampleRate() + " Hz).");
            return tts;
        } catch (Throwable e) {
            Log.w(WebActivity.TAG, "Voice " + lang + " could not load: " + e);
            return null;
        }
    }

    /* Runs on the worker. */
    AudioTrack trackFor(int rate) {
        if (track != null && trackRate == rate) return track;
        if (track != null) track.release();
        int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                .setBufferSizeInBytes(Math.max(min * 4, rate * 4))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
        trackRate = rate;
        return track;
    }
}

/** Loads one voice on the worker. */
final class Load implements Runnable {
    final Speaker s;
    final String lang;

    Load(Speaker s, String lang) { this.s = s; this.lang = lang; }

    @Override
    public void run() { s.load(lang); }
}

/** Releases the voices and the audio on the worker. */
final class Close implements Runnable {
    final Speaker s;

    Close(Speaker s) { this.s = s; }

    @Override
    public void run() {
        for (OfflineTts t : s.loaded.values()) t.release();
        s.loaded.clear();
        if (s.track != null) { s.track.release(); s.track = null; }
    }
}

/** Makes one line of speech and plays it while it is being made. */
final class Say implements Runnable, OfflineTts.Chunk {
    final Speaker s;
    final int gen;
    final String id, text, lang;
    final float rate, volume;
    AudioTrack track;
    boolean started;
    long written;

    Say(Speaker s, int gen, String id, String text, float rate, float volume, String lang) {
        this.s = s; this.gen = gen; this.id = id; this.text = text; this.rate = rate; this.volume = volume; this.lang = lang;
    }

    boolean current() { return gen == s.generation; }

    @Override
    public void run() {
        if (!current()) return;
        OfflineTts tts = s.load(lang);
        if (tts == null) { s.a.voiceDone(id); return; }
        if (!current()) return;
        try {
            int sr = tts.sampleRate();
            track = s.trackFor(sr);
            track.pause();
            track.flush();
            track.setVolume(Math.max(0f, Math.min(1f, volume)));
            int base = track.getPlaybackHeadPosition();
            track.play();
            tts.generate(text, 0, rate > 0 ? rate : 1f, this);
            // Wait until the last sample has been heard, then the page may go on.
            long limit = System.currentTimeMillis() + written * 1000L / sr + 2000;
            while (current() && track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING
                    && track.getPlaybackHeadPosition() - base < written && System.currentTimeMillis() < limit) {
                Thread.sleep(25);
            }
        } catch (Throwable e) {
            Log.w(WebActivity.TAG, "Speaking failed: " + e);
        }
        if (current()) s.a.voiceDone(id);
    }

    @Override
    public Integer invoke(float[] samples) {
        if (!current()) return 0;
        if (!started) { started = true; s.a.voiceStarted(id); }
        int n = track.write(samples, 0, samples.length, AudioTrack.WRITE_BLOCKING);
        if (n > 0) written += n;
        return current() ? 1 : 0;
    }
}
