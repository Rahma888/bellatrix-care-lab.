package de.labland.bellatrix;

import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

/**
 * The Android side of the robots' network: starts the message server (NetServer, port 8780) and
 * the game announcements (NetDiscovery, UDP 8781), keeps the Wi-Fi locks that let broadcasts in,
 * and tells this robot's address and name.
 *
 * Call Net.start(this) in WebActivity.onCreate. Everything here is safe from any thread and never
 * throws. Needs, in the manifest: ACCESS_WIFI_STATE, CHANGE_WIFI_MULTICAST_STATE (and WAKE_LOCK
 * for the optional low-latency Wi-Fi lock), and android:usesCleartextTraffic="true" so the pages
 * may fetch() http://<robot>:8780.
 *
 * Build note: no inner, anonymous or private nested classes and no lambdas (see WebActivity).
 */
final class Net {

    static final String TAG = "Bellatrix";
    static final int PORT = 8780;

    static boolean started;                       // guarded by Net.class
    static WifiManager.MulticastLock multicast;   // guarded by Net.class: kept for the app's life
    static WifiManager.WifiLock wifi;             // guarded by Net.class

    /** Starts the server, the listener and the locks, once per process. Returns at once. */
    static void start(Context c) {
        try {
            Context app;
            synchronized (Net.class) {
                if (started || c == null) return;
                started = true;
                app = c.getApplicationContext() != null ? c.getApplicationContext() : c;
            }
            NetGlue glue = new NetGlue(app);
            NetServer.sink = glue;
            NetServer.namer = glue;
            NetDiscovery.hint = glue;
            // Off the UI thread: the interfaces, the settings and the sockets may take a moment.
            Thread t = new Thread(new NetStarter(app), "bellatrix-net-start");
            t.setDaemon(true);
            t.start();
        } catch (Throwable t) {
            Log.w(TAG, "Network start failed: " + t);
        }
    }

    static void startNow(Context app) {
        try {
            NetServer.setName(name(app));
            NetServer.start(PORT);
            NetDiscovery.listen();
        } catch (Throwable t) {
            Log.w(TAG, "Network start failed: " + t);
        }
        locks(app);
        Log.i(TAG, "Network: " + name(app) + " at " + address(app) + ":" + PORT);
    }

    /** Broadcasts reach the app only with the multicast lock on many Wi-Fi drivers; the high
     *  performance lock keeps Wi-Fi power saving from delaying the game messages. */
    static void locks(Context app) {
        WifiManager wm = null;
        try {
            wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
        } catch (Throwable t) {
            Log.w(TAG, "No Wi-Fi service: " + t);
        }
        if (wm == null) return;
        try {
            WifiManager.MulticastLock m = wm.createMulticastLock("bellatrix");
            m.setReferenceCounted(false);
            m.acquire();
            synchronized (Net.class) { multicast = m; }
        } catch (Throwable t) {
            Log.w(TAG, "No multicast lock (CHANGE_WIFI_MULTICAST_STATE?): other robots' games may not be seen. " + t);
        }
        try {
            WifiManager.WifiLock w = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "bellatrix");
            w.setReferenceCounted(false);
            w.acquire();
            synchronized (Net.class) { wifi = w; }
        } catch (Throwable t) {
            Log.i(TAG, "No Wi-Fi lock (WAKE_LOCK?), fine: " + t);
        }
    }

    /** This device's Wi-Fi IPv4, "" when it has none. */
    static String address(Context c) {
        try {
            String ip = NetDiscovery.interfaceAddress();
            if (!ip.isEmpty()) return ip;
        } catch (Throwable ignored) { }
        return wifiAddress(c);
    }

    /** The address WifiManager knows (the fallback when the interfaces say nothing). */
    static String wifiAddress(Context c) {
        try {
            if (c == null) return "";
            Context app = c.getApplicationContext() != null ? c.getApplicationContext() : c;
            WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return "";
            WifiInfo info = wm.getConnectionInfo();
            if (info == null) return "";
            int ip = info.getIpAddress();
            if (ip == 0) return "";
            return (ip & 255) + "." + ((ip >> 8) & 255) + "." + ((ip >> 16) & 255) + "." + ((ip >>> 24) & 255);
        } catch (Throwable t) {
            return "";
        }
    }

    /** A friendly name: the device name (or the model) and the last number of the address,
     *  for example "Bellatrix (157)", so robots of the same kind can be told apart. */
    static String name(Context c) {
        String base = null;
        try {
            if (c != null) base = Settings.Global.getString(c.getContentResolver(), "device_name");
        } catch (Throwable ignored) { }
        if (base == null || base.trim().isEmpty()) base = Build.MODEL;
        if (base == null || base.trim().isEmpty()) base = "Bellatrix";
        base = base.trim();
        if (base.length() > 40) base = base.substring(0, 40).trim();
        String ip = address(c);
        int dot = ip.lastIndexOf('.');
        return dot > 0 ? base + " (" + ip.substring(dot + 1) + ")" : base;
    }
}

/** Hands the Android bits to the plain-Java server and discovery. */
final class NetGlue implements NetServer.Sink, NetServer.Namer, NetDiscovery.IpHint {
    final Context c;

    NetGlue(Context c) { this.c = c; }

    @Override
    public void log(String line) { Log.i(Net.TAG, "Network: " + line); }

    @Override
    public String name() { return Net.name(c); }

    @Override
    public String ip() { return Net.wifiAddress(c); }
}

final class NetStarter implements Runnable {
    final Context c;

    NetStarter(Context c) { this.c = c; }

    @Override
    public void run() { Net.startNow(c); }
}
