package de.labland.bellatrix;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import de.labland.bellatrix.hands.Hands;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Shows one page of the Care Lab, bundled in the app, full screen.
 *
 * The pages are served from the app's assets under https://app.bellatrix/, a made-up https
 * address: the WebView treats it as secure, so the camera, the microphone and the browser
 * storage work, and nothing needs the laptop or the internet. Both screens (care team and
 * patient) run in this one app, so they share the patients, the pictures and the results.
 *
 * One file is not bundled: transfer/patients.json, the patients prepared on a laptop. The
 * install script copies it into this app's own folder on the device (see tools/robot.ps1).
 *
 * Build note: the helper classes below are static, with package-level access. New JDKs
 * describe the hidden parameter of inner and anonymous classes in a way the Android
 * converter (d8) cannot read, so the build would fail with them.
 */
public abstract class WebActivity extends Activity implements Hands.Sink {

    static final String TAG = "Bellatrix";
    static final String HOST = "app.bellatrix";
    static final int PICK_FILES = 42;
    static final int ASK_PERMISSIONS = 43;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    Voice voice;
    Speaker speaker;

    /** The page this screen shows, for example "patient.html". */
    protected abstract String page();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // The layout has its own large type; the system font size must not scale it again.
        s.setTextZoom(100);
        // Ludo between robots: the pages (https://app.bellatrix) talk to the robots' message
        // servers over plain http on the Wi-Fi (Net, port 8780).
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        Net.start(this);
        // The display link relay (head -> tablet) runs on the head only: the Care Team app, not the patient screen.
        // HeadServer starts it, and the whole Node server in the head APK (see HeadServer).
        if (this instanceof StaffActivity) HeadServer.start(this);

        web.setWebViewClient(new Pages(this));
        web.setWebChromeClient(new Browser(this));
        web.addJavascriptInterface(new Bridge(this), "BellatrixApp");
        setContentView(web);
        voice = new Voice(this);
        speaker = new Speaker(this);
        askPermissions();
        web.loadUrl("https://" + HOST + "/" + page() + "?robot=1");
    }

    /** Serves the bundled pages. */
    static final class Pages extends WebViewClient {
        final WebActivity a;

        Pages(WebActivity a) { this.a = a; }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return a.serve(request.getUrl());
        }

        /** Links to other places (WhatsApp, SMS, the family page on the call server) open in the
         *  robot's own apps; the care-team and patient pages stay in this WebView. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u == null || HOST.equals(u.getHost())) return false;
            try {
                a.startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) {
                Log.w(TAG, "No app opens " + u + " (" + e + ")");
            }
            return true;
        }
    }

    /** Camera and microphone for our own pages, the file picker, and the page log in logcat. */
    static final class Browser extends WebChromeClient {
        final WebActivity a;

        Browser(WebActivity a) { this.a = a; }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            // Only our own pages ask; the page itself asks the participant for consent first.
            if (HOST.equals(request.getOrigin().getHost())) request.grant(request.getResources());
            else request.deny();
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (a.fileCallback != null) a.fileCallback.onReceiveValue(null);
            a.fileCallback = callback;
            Intent pick = params.createIntent();
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                a.startActivityForResult(pick, PICK_FILES);
            } catch (Exception e) {
                a.fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.i(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }
    }

    /** The two screens open each other through this, from JavaScript. */
    static final class Bridge {
        final WebActivity a;

        Bridge(WebActivity a) { this.a = a; }

        /** The display link relay of this head: {running, port, ips:[Wi-Fi IPv4], url:'http://<ip>:8765'}. */
        @JavascriptInterface
        public String linkServer() { return LinkServer.info(); }

        /** The whole server on this head (HeadServer): {"node":"running|starting|stopped|unavailable",
         *  "tunnel":"https://….trycloudflare.com"|null, "portal":tunnel+"/portail.html"|null, "lan":"<ip>", "port":8765}. */
        @JavascriptInterface
        public String serverInfo() { return HeadServer.info(); }

        @JavascriptInterface
        public void openPatient() { a.runOnUiThread(new Opener(a, PatientActivity.class)); }

        @JavascriptInterface
        public void openStaff() { a.runOnUiThread(new Opener(a, StaffActivity.class)); }

        /** True when Bellatrix can speak this language ('en', 'fr', 'de'): her own voice for it is on
         *  the robot, or (English) Android's engine is ready. Otherwise the pages show subtitles. */
        @JavascriptInterface
        public boolean canSpeak(String lang) {
            if (a.speaker != null && a.speaker.has(lang)) return true;
            return "en".equals(lang) && a.voice != null && a.voice.ready;
        }

        /** Loads the voice for a language ahead of time (a session is about to start). */
        @JavascriptInterface
        public void prepareVoice(String lang) { if (a.speaker != null) a.speaker.prepare(lang); }

        /** Speaks one line. The page hears BellatrixVoice.start(id) when the sound starts and
         *  BellatrixVoice.done(id) when it has been said. */
        @JavascriptInterface
        public void speak(String id, String text, float rate, float volume, float pitch, String lang) {
            String safe = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
            String line = text == null ? "" : text;
            if (a.speaker != null && a.speaker.has(lang)) {
                if (a.voice != null) a.voice.stop();
                a.speaker.speak(safe, line, rate, volume, lang);
            } else if ("en".equals(lang) && a.voice != null && a.voice.ready) {
                a.voice.speak(safe, line, rate, volume, pitch);
            } else {
                a.voiceDone(safe);
            }
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (a.speaker != null) a.speaker.stop();
            if (a.voice != null) a.voice.stop();
        }

        /** Ludo between robots. Announces this robot's open game on the Wi-Fi every second
         *  (a JSON text), or stops announcing with "". */
        @JavascriptInterface
        public boolean netAnnounce(String json) { return NetDiscovery.announce(json == null ? "" : json); }

        /** The games other robots (and this one) announced in the last seconds, as a JSON array. */
        @JavascriptInterface
        public String netGames() { return NetDiscovery.games(); }

        /** This robot's Wi-Fi address, "" without Wi-Fi. */
        @JavascriptInterface
        public String netAddress() { return Net.address(a); }

        /** A name the other robots show, for example "Bellatrix (157)". */
        @JavascriptInterface
        public String netRobotName() { return Net.name(a); }

        /** Family video call sound (js/familycall.js). During a WebRTC call Android plays the other
         *  side on STREAM_VOICE_CALL in MODE_IN_COMMUNICATION, not on STREAM_MUSIC, and that stream
         *  is low on this robot (4 of 5). true: call mode, loudspeaker on, call volume at its
         *  maximum, the volume keys on the call; the settings before are kept. false: all of it
         *  back, and MODE_NORMAL. Returns false when the sound could not be changed. */
        @JavascriptInterface
        public boolean callAudio(boolean on) { return a.callAudio(on); }

        /** Reports and tables: a download link does nothing in a WebView, so the care-team page
         *  saves them here, in this app's folder (files/reports). "Collect results from robot.bat"
         *  copies them to the laptop. Returns the path, or "" when it failed. */
        @JavascriptInterface
        public String saveFile(String name, String text) {
            String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (safe.isEmpty() || safe.startsWith(".")) safe = "bellatrix-file.txt";
            File dir = a.getExternalFilesDir("reports");
            if (dir == null) return "";
            File f = new File(dir, safe);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
                Log.i(TAG, "Saved " + f.getAbsolutePath());
                return f.getAbsolutePath();
            } catch (IOException e) {
                Log.w(TAG, "Could not save " + safe + " (" + e + ")");
                return "";
            }
        }

        /* ---- LuckiBot (Orionstar RobotApi) through RobotBridge. Always valid JSON, never an exception.
         *  On the tablet (no robot service) everything answers {"connected":false} / []. ---- */

        /** Starts the connection to the robot (once). Returns "ok". */
        @JavascriptInterface
        public String robotConnect() {
            try { RobotBridge.get().connect(a); } catch (Throwable t) { Log.w(TAG, "robotConnect: " + t); }
            return "ok";
        }

        /** {"connected":..,"localized":..,"mapName":..,"battery":..,"lastError":..,"nav":{..}} */
        @JavascriptInterface
        public String robotState() {
            try { return RobotBridge.get().stateJson(); } catch (Throwable t) { return "{\"connected\":false}"; }
        }

        /** [{"name":..,"x":..,"y":..}], [] when not connected. */
        @JavascriptInterface
        public String robotPlaces() {
            try { return RobotBridge.get().placesJson(); } catch (Throwable t) { return "[]"; }
        }

        /** Drives to a saved place. "ok", "busy" or "not-connected"; a refusal (not localised, emergency
         *  stop) shows in robotNav(): state "failed" with its reason. */
        @JavascriptInterface
        public String robotGo(String place) {
            try { return RobotBridge.get().go(place); } catch (Throwable t) { return "not-connected"; }
        }

        @JavascriptInterface
        public String robotStop() {
            try { return RobotBridge.get().stop(); } catch (Throwable t) { return "ok"; }
        }

        /** {"state":"idle|moving|arrived|failed","place":..,"reason":..,"since":epochMs,"attempt":..,"waitedS":..,
         *  "code":..,"codeText":..,"mode":"route|place","leg":..,"legs":..} */
        @JavascriptInterface
        public String robotNav() {
            try { return RobotBridge.get().navJson(); } catch (Throwable t) { return "{\"state\":\"idle\",\"place\":\"\",\"reason\":\"\",\"since\":0}"; }
        }

        /** Navigation mode for the next drives (PLAN-NAV.md): "route" (Bellatrix plans the route, the default) or
         *  "place" (the robot's own navigation, as before). A running drive keeps its mode. Returns the mode in
         *  effect; anything else changes nothing. robotState().navMode reports it too. */
        @JavascriptInterface
        public String robotNavMode(String mode) {
            try { return RobotBridge.get().setNavMode(mode); } catch (Throwable t) { return ""; }
        }

        /** Navigation test (js/places.js): relocalise at the charging pile (the robot must stand on it; it
         *  does not move). "ok", "busy" or "not-connected"; the result shows in robotState().reloc. */
        @JavascriptInterface
        public String robotRelocalize() {
            try { return RobotBridge.get().relocalize(); } catch (Throwable t) { return "not-connected"; }
        }

        /** Start-of-shift checklist (js/staff-tools.js): the battery as Android reports it,
         *  {"level":82,"charging":true}, or {} when Android gives no level. Nothing is guessed. */
        @JavascriptInterface
        public String battery() {
            try {
                Intent b = a.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b == null || !b.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)) return "{}";
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level < 0 || scale <= 0) return "{}";
                int status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
                return "{\"level\":" + Math.round(level * 100f / scale) + ",\"charging\":" + charging + "}";
            } catch (RuntimeException e) {
                Log.w(TAG, "No battery reading (" + e + ")");
                return "{}";
            }
        }

        /** Start-of-shift checklist: {"connected":true,"type":"wifi","internet":true} (type "wifi",
         *  "ethernet", "mobile", "other" or "none"; connected = a network is up, internet = Android
         *  checked that it reaches the internet), or {} when Android does not say. Needs ACCESS_NETWORK_STATE. */
        /* ---- Pointing in the air / hand signs, tracked in the app (de.labland.bellatrix.hands): the page
         *  then does not open its own camera. Results arrive as window.__bellatrixHands({t, w, h, lm}). ---- */

        /** Starts the camera and the hand models: "ok", "no-camera" or "error:..". */
        @JavascriptInterface
        public String handsStart() {
            try { return Hands.get(a).start(a, a); } catch (Throwable t) { Log.w(TAG, "handsStart: " + t); return "error:" + t; }
        }

        /** Stops the camera; returns when it is free for the page again. */
        @JavascriptInterface
        public void handsStop() {
            try { Hands.get(a).stop(a); } catch (Throwable t) { Log.w(TAG, "handsStop: " + t); }
        }

        /** {"running":..,"backend":"gpu|cpu","fps":..,"inferMs":..,"camera":"..",..} */
        @JavascriptInterface
        public String handsState() {
            try { return Hands.get(a).stateJson(); } catch (Throwable t) { return "{\"running\":false,\"error\":\"" + t.getClass().getSimpleName() + "\"}"; }
        }

        /** Settings for the next handsStart: {"camera":"id","backend":"cpu|gpu","rot":0|90|180|270}. */
        @JavascriptInterface
        public void handsConfig(String json) {
            try { Hands.get(a).config(json); } catch (Throwable t) { Log.w(TAG, "handsConfig: " + t); }
        }

        @JavascriptInterface
        public String network() {
            try {
                ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm == null) return "{}";
                Network n = cm.getActiveNetwork();
                NetworkCapabilities c = n == null ? null : cm.getNetworkCapabilities(n);
                if (c == null) return "{\"connected\":false,\"type\":\"none\",\"internet\":false}";
                String type = c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                    : c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet"
                    : c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "mobile" : "other";
                boolean internet = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                return "{\"connected\":true,\"type\":\"" + type + "\",\"internet\":" + internet + "}";
            } catch (RuntimeException e) {
                Log.w(TAG, "No network reading (" + e + ")");
                return "{}";
            }
        }
    }

    /** Brings the other screen to the front (it keeps its state when it is already open). */
    static final class Opener implements Runnable {
        final WebActivity a;
        final Class<?> screen;

        Opener(WebActivity a, Class<?> screen) { this.a = a; this.screen = screen; }

        @Override
        public void run() {
            Intent i = new Intent(a, screen);
            i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            a.startActivity(i);
        }
    }

    /* ---------- family call sound ---------- */
    boolean callAudioOn;
    int savedMode = AudioManager.MODE_NORMAL, savedCallVolume = -1;
    boolean savedSpeaker;

    synchronized boolean callAudio(boolean on) {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (am == null) return false;
        try {
            if (on) {
                if (!callAudioOn) {
                    savedMode = am.getMode();
                    savedSpeaker = am.isSpeakerphoneOn();
                    savedCallVolume = am.getStreamVolume(AudioManager.STREAM_VOICE_CALL);
                    callAudioOn = true;
                }
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                am.setSpeakerphoneOn(true);
                am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL), 0);
                runOnUiThread(new VolumeKeys(this, AudioManager.STREAM_VOICE_CALL));
                Log.i(TAG, "Call sound: IN_COMMUNICATION, speaker on, call volume " + am.getStreamVolume(AudioManager.STREAM_VOICE_CALL) + "/" + am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL));
            } else {
                if (!callAudioOn) return true;
                if (savedCallVolume >= 0) am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, savedCallVolume, 0);
                am.setSpeakerphoneOn(savedSpeaker);
                am.setMode(AudioManager.MODE_NORMAL);
                runOnUiThread(new VolumeKeys(this, AudioManager.USE_DEFAULT_STREAM_TYPE));
                callAudioOn = false;
                Log.i(TAG, "Call sound: back to normal (mode before the call was " + savedMode + ")");
            }
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "Call sound could not be changed (" + e + ")");
            return false;
        }
    }

    /** Which sound the volume keys change (the activity's setting, on the UI thread). */
    static final class VolumeKeys implements Runnable {
        final WebActivity a;
        final int stream;

        VolumeKeys(WebActivity a, int stream) { this.a = a; this.stream = stream; }

        @Override
        public void run() { a.setVolumeControlStream(stream); }
    }

    /** Runs a line of JavaScript in the page, from any thread. */
    void js(String code) { runOnUiThread(new Js(this, code)); }

    /** The sound of a line has started (the face moves its mouth) / the line has been said. */
    void voiceStarted(String id) { js("window.BellatrixVoice && BellatrixVoice.start && BellatrixVoice.start('" + id + "')"); }

    void voiceDone(String id) { js("window.BellatrixVoice && BellatrixVoice.done('" + id + "')"); }

    /* ---------- hand points from the app's own tracking (Hands) ---------- */
    volatile String handsLatest;
    final AtomicBoolean handsPending = new AtomicBoolean(false);

    /** Called by Hands on its own thread: only the newest result waits for the UI thread, never a queue. */
    @Override
    public void hands(String json) {
        handsLatest = json;
        if (handsPending.compareAndSet(false, true)) runOnUiThread(new HandsDelivery(this));
    }

    static final class HandsDelivery implements Runnable {
        final WebActivity a;

        HandsDelivery(WebActivity a) { this.a = a; }

        @Override
        public void run() {
            a.handsPending.set(false);
            String j = a.handsLatest;
            if (j != null && a.web != null && !a.isDestroyed()) a.web.evaluateJavascript("window.__bellatrixHands&&window.__bellatrixHands(" + j + ")", null);
        }
    }

    static final class Js implements Runnable {
        final WebActivity a;
        final String code;

        Js(WebActivity a, String code) { this.a = a; this.code = code; }

        @Override
        public void run() { if (a.web != null && !a.isDestroyed()) a.web.evaluateJavascript(code, null); }
    }

    WebResourceResponse serve(Uri url) {
        if (!HOST.equals(url.getHost())) return null;
        String path = url.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        try {
            InputStream in;
            if (path.equals("/transfer/patients.json")) {
                File f = new File(getExternalFilesDir(null), "patients.json");
                if (!f.exists()) {
                    Log.i(TAG, "No patients from the laptop on this device yet.");
                    return notFound();
                }
                in = new FileInputStream(f);
            } else {
                in = getAssets().open("web" + path);
            }
            WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            Log.w(TAG, "Not found in the app: " + path + " (" + e + ")");
            return notFound();
        }
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".task") || p.endsWith(".tflite")) return "application/octet-stream";
        return "application/octet-stream";
    }

    void askPermissions() {
        List<String> missing = new ArrayList<>();
        for (String p : new String[] {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]), ASK_PERMISSIONS);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILES || fileCallback == null) return;
        Uri[] picked = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                picked = new Uri[clip.getItemCount()];
                for (int i = 0; i < picked.length; i++) picked[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                picked = new Uri[] {data.getData()};
            }
        }
        fileCallback.onReceiveValue(picked);
        fileCallback = null;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        try { Hands h = Hands.existing(); if (h != null) h.resume(this); } catch (Throwable t) { Log.w(TAG, "hands resume: " + t); }
        // Tells the page it is in front again: the patient screen then looks for a prepared
        // session, the care-team screen for finished ones.
        web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null);
    }

    @Override
    protected void onPause() {
        // The other screen comes to the front: this one stops talking, and its camera for the hands closes.
        try { Hands h = Hands.existing(); if (h != null) h.pause(this); } catch (Throwable t) { Log.w(TAG, "hands pause: " + t); }
        if (voice != null) voice.stop();
        if (speaker != null) speaker.stop();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        // A call that did not end cleanly must not leave the robot in call mode.
        callAudio(false);
        try { Hands h = Hands.existing(); if (h != null) h.stop(this); } catch (Throwable t) { Log.w(TAG, "hands stop: " + t); }
        if (voice != null) voice.shutdown();
        if (speaker != null) speaker.shutdown();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
    }
}
