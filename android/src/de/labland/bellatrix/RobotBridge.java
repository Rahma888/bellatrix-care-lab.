package de.labland.bellatrix;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;

import com.ainirobot.coreservice.client.ApiListener;
import com.ainirobot.coreservice.client.Definition;
import com.ainirobot.coreservice.client.RobotApi;
import com.ainirobot.coreservice.client.StatusListener;
import com.ainirobot.coreservice.client.actionbean.Pose;
import com.ainirobot.coreservice.client.listener.ActionListener;
import com.ainirobot.coreservice.client.listener.CommandListener;
import com.ainirobot.coreservice.client.module.ModuleCallbackApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The bridge from the head app (Care Team) to the LuckiBot Pro: Orionstar's RobotApi.
 *
 * One instance per process (the connection belongs to the process, not to the Activity). The pages
 * never get callbacks: they read a state ({@link #stateJson()}, {@link #navJson()}) that this class
 * keeps up to date. Rules from LabLand's measured briefing (luckibot-briefing.md):
 * - Every SDK call is guarded: while the service is not connected the jar throws raw
 *   NullPointerExceptions.
 * - Listeners are kept in fields (the CoreService holds only a weak reference).
 * - A second connectServer on an existing connection never answers: check isApiConnectedService first.
 * - Navigation: -1 / -6 mean "another action still runs": stopNavigation, wait 150 ms, then 400 ms,
 *   3 tries at most. 1014 = started, 1018/1019 = harmless avoidance, 1020 = "outside the map" (does not
 *   end a drive by itself), 1025 = no path. Arrival (1, or -113) is success.
 * - Nothing starts when the robot is not localised, or while the emergency stop is pressed.
 *
 * Build note: only static nested classes, no lambdas (JDK 25 + d8, see WebActivity).
 */
public final class RobotBridge {
    static final String TAG = "RobotBridge";
    static final String SDK_PACKAGE = "com.ainirobot.coreservice";

    static final int RESULT_ARRIVED = 1;
    static final int RESULT_STOPPED = 3;
    static final int ERR_ALREADY_RUN = -1;
    static final int ERR_REQUEST_RES = -6;
    static final int ERR_IN_DESTINATION = -113;
    static final int ERR_TIMEOUT = -109;
    static final int ST_STARTED = 1014;
    static final int ST_AVOID = 1018;
    static final int ST_AVOID_END = 1019;
    static final int ST_OUT_MAP = 1020;
    static final int ST_NO_PATH = 1025;

    static final double TOLERANCE_M = 0.5;
    static final long NAV_TIMEOUT_MS = 120000L;
    static final int MAX_TRIES = 3;
    static final long[] RETRY_DELAYS_MS = {150L, 400L};
    static final long POLL_MS = 3000L;
    static final long OUT_MAP_CHECK_MS = 10000L;
    static final double OUT_MAP_MOVE_M = 0.10;
    static final long GLOBAL_LIMIT_MS = 5 * 60 * 1000L;   // tolerant: only after 5 minutes does a drive fail ('blocked')
    static final long STALL_MS = 8000L;                   // less than 10 cm of progress in 8 s = stuck, try again
    static final long WATCH_MS = 500L;
    static final long RESUME_DELAY_MS = 1500L;            // after onRecovery
    static final long BACKOFF_CAP_MS = 8000L;
    static final int RELOC_RETRIES = 3;                   // resetEstimate: relocalisation at the charging pile
    static final long RELOC_TIMEOUT_MS = 60000L;

    private static final RobotBridge INSTANCE = new RobotBridge();

    public static RobotBridge get() { return INSTANCE; }

    private final AtomicInteger reqIds = new AtomicInteger(1);
    private final Handler main = new Handler(Looper.getMainLooper());
    private HandlerThread thread;
    private Handler work;

    private Context app;
    private boolean connecting, connected, disabled, suspended, pollRunning;
    private volatile boolean localized;
    private volatile String mapName = "";
    private volatile int battery = -1;
    private volatile String lastError = "";
    private Boolean estop;           // null = unknown
    private volatile boolean charging;
    private volatile float poseX = Float.NaN, poseY = Float.NaN, poseTheta = Float.NaN;

    // Navigation test panel (js/places.js): the last SDK code of the current drive, and the relocalisation
    private int navCode;
    private String navCodeText = "";
    private String relocState = "idle";   // idle | running | ok | failed
    private String relocText = "";
    private long relocAt;
    private int relocToken;
    private CommandListener relocListener;

    // Navigation state
    private String navState = "idle";
    private String navPlace = "";
    private String navReason = "";
    private long navSince = System.currentTimeMillis();
    private int navToken;            // changes with every new drive or stop: stale callbacks are ignored
    private int navTries;            // attempts of the current drive
    private int curAttempt = -1;     // id of the live listener; -1 while a retry is pending (stale answers ignored)
    private int attemptSeq;
    private int retryCount;          // backoff step; back to 0 when the robot makes progress
    private long navStartedAt, navEndedAt;

    // Listeners held in fields on purpose (weak references in the CoreService).
    private ApiListener apiListener;
    private ModuleCallbackApi moduleCallback;
    private StatusListener estopListener;
    private ActionListener navListener;

    private RobotBridge() { }

    /* ---------------------------------------------------------------- connection */

    /** Starts the connection once. Safe to call again and again. */
    public void connect(Context context) {
        try {
            synchronized (this) {
                if (connecting || connected) return;
                app = context.getApplicationContext();
                try {
                    app.getPackageManager().getPackageInfo(SDK_PACKAGE, 0);
                } catch (PackageManager.NameNotFoundException e) {
                    lastError = "no-robot-service";
                    return;
                }
                if (work == null) {
                    thread = new HandlerThread("robot-bridge");
                    thread.start();
                    work = new Handler(thread.getLooper());
                }
                connecting = true;
                lastError = "";
            }
            main.post(new ConnectTask(this));
        } catch (Throwable t) {
            fail("connect", t);
            synchronized (this) { connecting = false; }
        }
    }

    void doConnect() {
        try {
            RobotApi api = RobotApi.getInstance();
            if (api.isApiConnectedService()) {   // already connected: only re-register
                onConnected();
                return;
            }
            apiListener = new Api(this);
            api.connectServer(app, apiListener);
        } catch (Throwable t) {
            fail("connectServer", t);
            synchronized (this) { connecting = false; }
        }
    }

    void onConnected() {
        synchronized (this) {
            connected = true;
            connecting = false;
            disabled = false;
            suspended = false;
            lastError = "";
        }
        try {
            moduleCallback = new Module(this);
            RobotApi.getInstance().setCallback(moduleCallback);
        } catch (Throwable t) {
            fail("setCallback", t);
        }
        registerEstop();
        startPolling();
    }

    void onDisconnected() {
        synchronized (this) {
            connected = false;
            connecting = false;
            localized = false;
            failNavLocked("disconnected");
        }
    }

    void onDisabled() {
        synchronized (this) {
            disabled = true;
            connecting = false;
            connected = false;
            lastError = "api-disabled";   // older ROMs: the app must be started from its icon
        }
    }

    void onSuspend() {
        synchronized (this) {
            suspended = true;
            if ("moving".equals(navState)) {
                curAttempt = -1;                 // answers of the interrupted action are ignored
                navReason = "suspended";
                Log.i(TAG, "SUSPENDED while moving to \"" + navPlace + "\": waiting for onRecovery");
            }
        }
    }

    void onRecovery() {
        synchronized (this) {
            suspended = false;
            if ("moving".equals(navState) && work != null) {
                Log.i(TAG, "RECOVERY: restarting the drive to \"" + navPlace + "\" in " + RESUME_DELAY_MS + " ms");
                navReason = "waiting";
                work.postDelayed(new Attempt(this, navToken), RESUME_DELAY_MS);
            }
        }
    }

    private void registerEstop() {
        try {
            estopListener = new Estop(this);
            RobotApi api = RobotApi.getInstance();
            api.registerStatusListener(Definition.STATUS_EMERGENCY, estopListener);
            api.getEmergencyStatus(reqIds.getAndIncrement(), new EstopQuery(this));
        } catch (Throwable t) {
            fail("emergency", t);
        }
    }

    void onEstop(Boolean pressed) {
        if (pressed == null) return;
        Log.i(TAG, "Emergency stop " + (pressed ? "PRESSED" : "released"));
        boolean stopNow;
        synchronized (this) {
            estop = pressed;
            stopNow = pressed && "moving".equals(navState);
            if (stopNow) {
                navToken++;
                setNavLocked("failed", navPlace, "emergency");
            }
        }
        if (stopNow) sdkStop();
    }

    /* ---------------------------------------------------------------- state polling */

    private void startPolling() {
        synchronized (this) {
            if (pollRunning || work == null) return;
            pollRunning = true;
        }
        work.post(new Poll(this));
    }

    /** One round of reads. Runs on the worker thread: these getters are binder calls. */
    void poll() {
        boolean keep;
        synchronized (this) { keep = connected; if (!keep) pollRunning = false; }
        if (!keep) return;
        try {
            RobotApi api = RobotApi.getInstance();
            localized = api.isRobotEstimate();
            String m = api.getMapName();
            mapName = m == null ? "" : m;
            battery = api.getBatteryLevel();
        } catch (Throwable t) {
            fail("poll", t);
        }
        try {   // for the Navigation test panel only: never in the way of the reads above
            RobotApi api = RobotApi.getInstance();
            charging = api.getChargeStatus();
            Pose p = api.getCurrentPose();
            if (p != null) { poseX = p.getX(); poseY = p.getY(); poseTheta = p.getTheta(); }
        } catch (Throwable t) {
            fail("pose", t);
        }
        work.postDelayed(new Poll(this), POLL_MS);
    }

    /* ---------------------------------------------------------------- navigation */

    /** "ok" (a drive started, or it was refused and the state says why), "busy" or "not-connected". */
    public String go(String place) {
        synchronized (this) {
            if (!connected) return "not-connected";
            if ("moving".equals(navState)) return "busy";
        }
        boolean loc;
        try {
            loc = RobotApi.getInstance().isRobotEstimate();
            localized = loc;
        } catch (Throwable t) {
            fail("isRobotEstimate", t);
            loc = false;
        }
        String name = place == null ? "" : place.trim();
        boolean known = true;   // unknown only when the list could be read and the name is not in it
        try {
            List<Pose> list = RobotApi.getInstance().getPlaceList();
            if (list != null && !list.isEmpty()) {
                known = false;
                for (Pose p : list) if (p != null && name.equals(p.getName())) { known = true; break; }
            }
        } catch (Throwable t) {
            fail("getPlaceList", t);
        }
        synchronized (this) {
            if ("moving".equals(navState)) return "busy";   // never two drives at once
            if (!connected) return "not-connected";
            navCode = 0;                                    // a new drive (or a refusal): its own code and time
            navCodeText = "";
            navTries = 0;
            navStartedAt = System.currentTimeMillis();
            if (name.isEmpty() || !known) { setNavLocked("failed", name, "unknown-place"); return "ok"; }
            if (Boolean.TRUE.equals(estop)) { setNavLocked("failed", name, "emergency"); return "ok"; }
            if (!loc) { setNavLocked("failed", name, "not-localized"); return "ok"; }
            navToken++;
            navTries = 0;
            curAttempt = -1;
            retryCount = 0;
            navStartedAt = System.currentTimeMillis();
            setNavLocked("moving", name, suspended ? "suspended" : "");
            if (!suspended) work.post(new Attempt(this, navToken));   // else onRecovery starts it
        }
        return "ok";
    }

    /** Stops the current drive (if any): the team's cancel, immediate. */
    public String stop() {
        boolean was;
        synchronized (this) {
            was = "moving".equals(navState);
            if (was) {
                navToken++;
                curAttempt = -1;
                setNavLocked("idle", navPlace, "stopped");
            }
        }
        if (was) sdkStop();
        return "ok";
    }

    /** One try of startNavigation (worker thread). */
    void attempt(int token) {
        String place;
        int tries, att;
        ActionListener l;
        synchronized (this) {
            if (token != navToken || !"moving".equals(navState)) return;
            if (suspended) { navReason = "suspended"; return; }   // onRecovery calls us again
            if (curAttempt != -1) return;   // a live attempt exists (duplicate start)
            if (Boolean.TRUE.equals(estop)) { navToken++; setNavLocked("failed", navPlace, "emergency"); return; }
            if (System.currentTimeMillis() - navStartedAt > GLOBAL_LIMIT_MS) {
                navToken++;
                setNavLocked("failed", navPlace, "blocked");
                return;
            }
            tries = ++navTries;
            att = curAttempt = ++attemptSeq;
            navReason = tries > 1 ? "retrying" : "";
            place = navPlace;
            l = new Nav(this, token, att);
            navListener = l;
        }
        try {
            int id = reqIds.getAndIncrement();
            Log.i(TAG, "startNavigation(\"" + place + "\") try " + tries + " req=" + id);
            RobotApi.getInstance().startNavigation(id, place, TOLERANCE_M, NAV_TIMEOUT_MS, l);
            work.postDelayed(new Watch(this, token, att, Float.NaN, Float.NaN, 0L), WATCH_MS);
        } catch (Throwable t) {
            fail("startNavigation", t);
            retry(token, att, "start failed " + t.getClass().getSimpleName());
        }
    }

    /** Anything that stops the robot short of the goal: stop, wait 2 / 4 / 8 s (cap), start again. Never fails before 5 minutes. */
    void retry(int token, int att, String why) {
        long delay;
        synchronized (this) {
            if (token != navToken || att != curAttempt || !"moving".equals(navState)) return;
            curAttempt = -1;   // the answer of the action we are about to stop must not count
            if (System.currentTimeMillis() - navStartedAt > GLOBAL_LIMIT_MS) {
                navToken++;
                Log.i(TAG, "giving up after 5 minutes (" + why + ")");
                setNavLocked("failed", navPlace, "blocked");
                work.post(new StopTask(this));
                return;
            }
            delay = Math.min(2000L << Math.min(retryCount, 2), BACKOFF_CAP_MS);
            retryCount++;
            navReason = suspended ? "suspended" : "waiting";
            Log.i(TAG, "obstacle/stop (" + why + "): stop, wait " + delay + " ms, try again (retry " + retryCount + ")");
        }
        sdkStop();
        work.postDelayed(new Attempt(this, token), delay);
    }

    /** Arrival: the only success. */
    void arrived(int token, int att, String why) {
        synchronized (this) {
            if (token != navToken || att != curAttempt || !"moving".equals(navState)) return;
            navToken++;
            curAttempt = -1;
            Log.i(TAG, "arrived (" + why + ")");
            setNavLocked("arrived", navPlace, "");
        }
    }

    void avoiding(int token, int att, boolean on) {
        synchronized (this) {
            if (token != navToken || att != curAttempt || !"moving".equals(navState)) return;
            if (on) navReason = "avoiding";
            else if ("avoiding".equals(navReason)) navReason = "";
        }
    }

    /** Called by the watcher every 500 ms with its reference pose. */
    void watch(int token, int att, float x0, float y0, long t0) {
        synchronized (this) {
            if (token != navToken || att != curAttempt || !"moving".equals(navState) || suspended) return;
        }
        long now = System.currentTimeMillis();
        float x = Float.NaN, y = Float.NaN;
        try {
            Pose p = RobotApi.getInstance().getCurrentPose();
            if (p != null) { x = p.getX(); y = p.getY(); }
        } catch (Throwable t) {
            fail("getCurrentPose", t);
        }
        if (!Float.isNaN(x)) {
            if (Float.isNaN(x0)) { x0 = x; y0 = y; t0 = now; }
            else if (Math.hypot(x - x0, y - y0) >= OUT_MAP_MOVE_M) {
                x0 = x; y0 = y; t0 = now;
                synchronized (this) { retryCount = 0; }   // progress: the backoff starts over
            } else if (now - t0 >= STALL_MS) {
                retry(token, att, "no progress for 8 s");
                return;
            }
        }
        work.postDelayed(new Watch(this, token, att, x0, y0, t0), WATCH_MS);
    }

    void sdkStop() {
        try {
            RobotApi.getInstance().stopNavigation(reqIds.getAndIncrement());
        } catch (Throwable t) {
            fail("stopNavigation", t);
        }
    }

    /** The code an attempt of the current drive got (e.g. 20010016 "The destination is not within the route"). */
    void sdkCode(int token, int att, int code, String text) {
        synchronized (this) {
            if (token != navToken || att != curAttempt) return;
            navCode = code;
            String s = text == null ? "" : text;
            navCodeText = s.length() > 200 ? s.substring(0, 200) : s;
        }
    }

    /* ---------------------------------------------------------------- relocalisation (charging pile) */

    /** Relocalises at the charging pile (the robot must stand on it). "ok", "busy" or "not-connected";
     *  the result shows in stateJson().reloc. It never moves the robot. */
    public String relocalize() {
        int token;
        synchronized (this) {
            if (!connected || work == null) return "not-connected";
            if ("moving".equals(navState) || "running".equals(relocState)) return "busy";
            token = ++relocToken;
            relocState = "running";
            relocText = "";
            relocAt = System.currentTimeMillis();
            work.post(new RelocTask(this, token));
            work.postDelayed(new RelocTimeout(this, token), RELOC_TIMEOUT_MS);
        }
        return "ok";
    }

    void doRelocalize(int token) {
        CommandListener l;
        synchronized (this) {
            if (token != relocToken || !"running".equals(relocState)) return;
            l = new Reloc(this, token);
            relocListener = l;
        }
        try {
            Log.i(TAG, "resetEstimate (charging pile), " + RELOC_RETRIES + " tries");
            RobotApi.getInstance().resetEstimate(reqIds.getAndIncrement(), RELOC_RETRIES, l);
        } catch (Throwable t) {
            fail("resetEstimate", t);
            relocDone(token, false, "start failed " + t.getClass().getSimpleName());
        }
    }

    void relocDone(int token, boolean ok, String text) {
        synchronized (this) {
            if (token != relocToken || !"running".equals(relocState)) return;
            relocState = ok ? "ok" : "failed";
            String s = text == null ? "" : text;
            relocText = s.length() > 200 ? s.substring(0, 200) : s;
            relocAt = System.currentTimeMillis();
            Log.i(TAG, "relocalisation " + relocState + " (" + relocText + ")");
        }
        try {
            localized = RobotApi.getInstance().isRobotEstimate();
        } catch (Throwable t) {
            fail("isRobotEstimate", t);
        }
    }

    private void failNavLocked(String reason) {
        if ("moving".equals(navState)) {
            navToken++;
            setNavLocked("failed", navPlace, reason);
        }
    }

    private void setNavLocked(String state, String place, String reason) {
        navState = state;
        navPlace = place == null ? "" : place;
        navReason = reason == null ? "" : reason;
        navSince = System.currentTimeMillis();
        if (!"moving".equals(state)) navEndedAt = navSince;
        Log.i(TAG, "nav -> " + state + " place=\"" + navPlace + "\" reason=\"" + navReason + "\"");
    }

    private void fail(String what, Throwable t) {
        lastError = what + ": " + t.getClass().getSimpleName();
        Log.w(TAG, "SDK call failed: " + what + " (" + t + ")");
    }

    /* ---------------------------------------------------------------- JSON for the pages */

    public String stateJson() {
        try {
            JSONObject o = new JSONObject();
            synchronized (this) {
                o.put("connected", connected);
                o.put("connecting", connecting);
                o.put("disabled", disabled);
                o.put("suspended", suspended);
                if (estop != null) o.put("estop", estop.booleanValue());
                o.put("nav", navObject());
                JSONObject r = new JSONObject();
                r.put("state", relocState);
                r.put("text", relocText);
                r.put("at", relocAt);
                o.put("reloc", r);
            }
            o.put("localized", localized);
            o.put("mapName", mapName);
            o.put("battery", battery);
            o.put("charging", charging);
            float px = poseX, py = poseY, pt = poseTheta;
            if (!Float.isNaN(px) && !Float.isNaN(py)) {
                JSONObject p = new JSONObject();
                p.put("x", (double) px);
                p.put("y", (double) py);
                if (!Float.isNaN(pt)) p.put("theta", (double) pt);
                o.put("pose", p);
            }
            o.put("lastError", lastError);
            return o.toString();
        } catch (Throwable t) {
            return "{\"connected\":false}";
        }
    }

    public String navJson() {
        try {
            synchronized (this) { return navObject().toString(); }
        } catch (Throwable t) {
            return "{\"state\":\"idle\",\"place\":\"\",\"reason\":\"\",\"since\":0}";
        }
    }

    private JSONObject navObject() throws org.json.JSONException {
        JSONObject n = new JSONObject();
        n.put("state", navState);
        n.put("place", navPlace);
        n.put("reason", navReason);
        n.put("since", navSince);
        n.put("attempt", navTries);
        long end = "moving".equals(navState) ? System.currentTimeMillis() : navEndedAt;
        n.put("waitedS", navStartedAt == 0 || end < navStartedAt ? 0 : (end - navStartedAt) / 1000);
        n.put("code", navCode);
        n.put("codeText", navCodeText);
        return n;
    }

    /** [{"name":..,"x":..,"y":..}], empty when not connected. */
    public String placesJson() {
        JSONArray a = new JSONArray();
        try {
            synchronized (this) { if (!connected) return "[]"; }
            List<Pose> list = RobotApi.getInstance().getPlaceList();
            if (list != null) {
                for (Pose p : list) {
                    if (p == null || p.getName() == null) continue;
                    JSONObject o = new JSONObject();
                    o.put("name", p.getName());
                    o.put("x", p.getX());
                    o.put("y", p.getY());
                    a.put(o);
                }
            }
        } catch (Throwable t) {
            fail("getPlaceList", t);
            return "[]";
        }
        return a.toString();
    }

    /** Reads the emergency stop out of what the SDK reports; null = do not know (never "released" by guess). */
    static Boolean parseEstop(String raw) {
        if (raw == null) return null;
        String t = raw.trim().toLowerCase(Locale.ROOT);
        if (t.isEmpty()) return null;
        if (t.equals("true") || t.equals("1")) return Boolean.TRUE;
        if (t.equals("false") || t.equals("0")) return Boolean.FALSE;
        if (hasPair(t, "emergency", "true") || hasPair(t, "estop", "true")) return Boolean.TRUE;
        if (hasPair(t, "emergency", "false") || hasPair(t, "estop", "false")) return Boolean.FALSE;
        if (hasPair(t, "status", "1") || hasPair(t, "emergency", "1")) return Boolean.TRUE;
        if (hasPair(t, "status", "0") || hasPair(t, "emergency", "0")) return Boolean.FALSE;
        if (t.contains("release")) return Boolean.FALSE;
        if (t.contains("press")) return Boolean.TRUE;
        return null;
    }

    private static boolean hasPair(String text, String key, String value) {
        int at = text.indexOf(key);
        if (at < 0) return false;
        String rest = text.substring(at + key.length());
        int i = 0;
        while (i < rest.length() && "\"': =".indexOf(rest.charAt(i)) >= 0) i++;
        return rest.startsWith(value, i);
    }

    /* ---------------------------------------------------------------- static helper classes */

    static final class ConnectTask implements Runnable {
        final RobotBridge b;
        ConnectTask(RobotBridge b) { this.b = b; }
        @Override public void run() { b.doConnect(); }
    }

    static final class Poll implements Runnable {
        final RobotBridge b;
        Poll(RobotBridge b) { this.b = b; }
        @Override public void run() { b.poll(); }
    }

    static final class Attempt implements Runnable {
        final RobotBridge b;
        final int token;
        Attempt(RobotBridge b, int token) { this.b = b; this.token = token; }
        @Override public void run() { b.attempt(token); }
    }

    static final class Watch implements Runnable {
        final RobotBridge b;
        final int token, att;
        final float x, y;
        final long t;
        Watch(RobotBridge b, int token, int att, float x, float y, long t) {
            this.b = b; this.token = token; this.att = att; this.x = x; this.y = y; this.t = t;
        }
        @Override public void run() { b.watch(token, att, x, y, t); }
    }

    static final class StopTask implements Runnable {
        final RobotBridge b;
        StopTask(RobotBridge b) { this.b = b; }
        @Override public void run() { b.sdkStop(); }
    }

    static final class Api implements ApiListener {
        final RobotBridge b;
        Api(RobotBridge b) { this.b = b; }
        @Override public void handleApiConnected() { b.onConnected(); }
        @Override public void handleApiDisabled() { b.onDisabled(); }
        @Override public void handleApiDisconnected() { b.onDisconnected(); }
    }

    static final class Module extends ModuleCallbackApi {
        final RobotBridge b;
        Module(RobotBridge b) { this.b = b; }
        @Override public boolean onSendRequest(int reqId, String reqType, String reqText, String reqParam) { return true; }
        @Override public void onSuspend() { b.onSuspend(); }
        @Override public void onRecovery() { b.onRecovery(); }
    }

    static final class Estop extends StatusListener {
        final RobotBridge b;
        Estop(RobotBridge b) { this.b = b; }
        @Override public void onStatusUpdate(String type, String data) { b.onEstop(parseEstop(data)); }
    }

    static final class EstopQuery extends CommandListener {
        final RobotBridge b;
        EstopQuery(RobotBridge b) { this.b = b; }
        @Override public void onResult(int result, String message) { b.onEstop(parseEstop(message)); }
    }

    /** Listener of one startNavigation attempt. Nothing here ends a drive except arrival. */
    static final class Nav extends ActionListener {
        final RobotBridge b;
        final int token, att;
        Nav(RobotBridge b, int token, int att) { this.b = b; this.token = token; this.att = att; }

        @Override
        public void onResult(int status, String response) {
            Log.i(TAG, "onResult " + status + " " + response);
            if (status == RESULT_ARRIVED) b.arrived(token, att, "result 1");
            else { b.sdkCode(token, att, status, response); b.retry(token, att, "result " + status); }
        }

        @Override
        public void onError(int code, String text) {
            Log.i(TAG, "onError " + code + " " + text);
            if (code == ERR_IN_DESTINATION) b.arrived(token, att, "already at the goal");
            else { b.sdkCode(token, att, code, text); b.retry(token, att, "error " + code); }   // -1, -6, -109, 20010016...: wait and try again
        }

        @Override
        public void onStatusUpdate(int status, String data) {
            Log.i(TAG, "onStatusUpdate " + status + " " + data);
            if (status == ST_AVOID) b.avoiding(token, att, true);
            else if (status == ST_AVOID_END) b.avoiding(token, att, false);
            else if (status == ST_NO_PATH) { b.sdkCode(token, att, status, data); b.retry(token, att, "status 1025 no path"); }
            else if (status == ST_OUT_MAP) b.sdkCode(token, att, status, data);
            // 1014 started, 1020 "outside the map": only logged (and shown); the 8 s progress watch decides.
        }
    }

    static final class RelocTask implements Runnable {
        final RobotBridge b;
        final int token;
        RelocTask(RobotBridge b, int token) { this.b = b; this.token = token; }
        @Override public void run() { b.doRelocalize(token); }
    }

    static final class RelocTimeout implements Runnable {
        final RobotBridge b;
        final int token;
        RelocTimeout(RobotBridge b, int token) { this.b = b; this.token = token; }
        @Override public void run() { b.relocDone(token, false, "timeout"); }
    }

    /** Answer of resetEstimate. "succeed" (or result 1 without a failure word) = relocalised; the page
     *  also shows the localisation itself (isRobotEstimate), which is the truth. */
    static final class Reloc extends CommandListener {
        final RobotBridge b;
        final int token;
        Reloc(RobotBridge b, int token) { this.b = b; this.token = token; }

        @Override
        public void onResult(int result, String message) {
            Log.i(TAG, "resetEstimate onResult " + result + " " + message);
            String m = message == null ? "" : message.trim().toLowerCase(Locale.ROOT);
            boolean ok = m.equals("succeed") || m.equals("success") || m.equals("true")
                    || (result == 1 && !m.contains("fail") && !m.contains("false"));
            b.relocDone(token, ok, "result " + result + (message == null ? "" : " " + message));
        }

        @Override
        public void onError(int code, String message) {
            Log.i(TAG, "resetEstimate onError " + code + " " + message);
            b.relocDone(token, false, "error " + code + (message == null ? "" : " " + message));
        }
    }
}
