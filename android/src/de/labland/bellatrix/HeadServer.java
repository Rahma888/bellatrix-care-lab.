package de.labland.bellatrix;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The whole Bellatrix server on the robot head (1.17), for the days without the PC.
 *
 * Node (NodeService, its own process) runs labland/store-server.mjs unchanged on port 8765: family
 * portal, accounts, feed, push, calls, the head <-> tablet link (/link/api/, same routes as LinkServer),
 * games and the pages. cloudflared gives it a public https address (https://<random>.trycloudflare.com,
 * a new one at every start) for the families' phones; the Care Team page shows it with a QR code
 * (js/head-server.js) through BellatrixApp.serverInfo().
 *
 * Only the head APK carries the runtime (lib/arm64-v8a: libnode.so, libc++_shared.so, libbellatrixnode.so,
 * libcloudflared.so; assets/server). Without it, or while Node does not answer, LinkServer keeps the link
 * on 8765 exactly as before. Files: files/server/app (a copy of the pages and modules, made again after
 * each app update), files/server/data (BELLATRIX_DATA: portal, accounts, Web Push keys; kept),
 * files/server/head.log, node.log, tunnel.log.
 *
 * cloudflared is a Linux program: on Android it finds no /etc/resolv.conf, so it may not resolve names.
 * First way: the app resolves the Cloudflare edge itself (--edge <ip>:7844) and passes the one quick-tunnel
 * request (POST https://api.trycloudflare.com/tunnel) through a small loopback forwarder (--quick-service).
 * Second way, when the first gets no address: cloudflared alone. The two alternate after each failure.
 *
 * Build note: static nested classes only, no lambdas, no anonymous classes (see WebActivity).
 */
final class HeadServer {

    static final String TAG = "Bellatrix";
    static final int PORT = 8765;
    static final Charset UTF8 = Charset.forName("UTF-8");
    static final Pattern TUNNEL_URL = Pattern.compile("https://([a-z0-9-]+)\\.trycloudflare\\.com");
    static final Pattern HOSTNAME = Pattern.compile("\"hostname\"\\s*:\\s*\"([a-z0-9-]+\\.trycloudflare\\.com)\"");
    static final String[] EDGE = {"region1.v2.argotunnel.com", "region2.v2.argotunnel.com"};

    static final Object LOCK = new Object();
    static boolean started;              // guarded by LOCK
    static boolean tunnelStarted;        // guarded by LOCK
    static Context ctx;                  // guarded by LOCK
    static volatile String node = "unavailable";   // unavailable | starting | running | stopped
    static volatile String tunnel;                   // https://….trycloudflare.com, or null

    private HeadServer() {}

    static File root(Context c) { return new File(c.getFilesDir(), "server"); }

    static File appDir(Context c) { return new File(root(c), "app"); }

    static File dataDir(Context c) { return new File(root(c), "data"); }

    static File libDir(Context c) { return new File(c.getApplicationInfo().nativeLibraryDir); }

    /** True in the head APK: the Node runtime and the server files are in it. */
    static boolean available(Context c) {
        File lib = libDir(c);
        if (!new File(lib, "libnode.so").isFile() || !new File(lib, "libbellatrixnode.so").isFile()) return false;
        try {
            c.getAssets().open("server/index.txt").close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** Once per process, from the Care Team screen. The link relay starts at once; Node takes over 8765 when it is ready. */
    static void start(Context c) {
        Context app;
        synchronized (LOCK) {
            if (started) return;
            started = true;
            ctx = app = c.getApplicationContext();
        }
        LinkServer.start();
        if (!available(app)) {
            node = "unavailable";
            return;
        }
        node = "starting";
        Thread t = new Thread(new Manager(app), "bellatrix-head-server");
        t.setDaemon(true);
        t.start();
    }

    static boolean nodeRunning() { return "running".equals(node); }

    /** For BellatrixApp.serverInfo(): {node, tunnel, lan, port, portal}. */
    static String info() {
        JSONObject o = new JSONObject();
        try {
            String t = tunnel;
            List<String> ips = LinkServer.ips();
            o.put("node", node);
            o.put("tunnel", t == null ? JSONObject.NULL : t);
            o.put("portal", t == null ? JSONObject.NULL : t + "/portail.html");
            o.put("lan", ips.isEmpty() ? "" : ips.get(0));
            o.put("port", PORT);
        } catch (Throwable e) {
            Log.w(TAG, "Server info failed: " + e);
        }
        return o.toString();
    }

    /** What LinkServer answers on /head/api/info while Node is not there (Node answers "running" itself). */
    static String relayInfo() {
        JSONObject o = new JSONObject();
        try {
            String t = tunnel;
            o.put("node", "relay");
            o.put("tunnel", t == null ? JSONObject.NULL : t);
        } catch (Throwable e) { /* cannot happen */ }
        return o.toString();
    }

    /* ------------------------------------------------------------------ Node */

    static final class Manager implements Runnable {
        final Context c;

        Manager(Context c) { this.c = c; }

        public void run() {
            try {
                prepare(c);
            } catch (Throwable t) {
                log(c, "server files could not be prepared: " + t);
                node = "stopped";
                return;   // LinkServer keeps the link
            }
            long[] pause = {10000L, 30000L, 60000L, 120000L, 300000L};
            int fails = 0;
            while (true) {
                if (!nodeUp()) {
                    node = "starting";
                    LinkServer.stop();
                    waitPortFree(5000L);
                    startService(c);
                    if (!waitUp(fails == 0 ? 90000L : 45000L)) {
                        log(c, "Node does not answer on " + PORT + ": the link relay takes over (see node.log)");
                        logTail(new File(root(c), "node.log"));
                        node = "stopped";
                        stopService(c);
                        sleep(1500L);
                        LinkServer.start();
                        sleep(pause[Math.min(fails, pause.length - 1)]);
                        fails++;
                        continue;
                    }
                    log(c, "Node answers on " + PORT);
                }
                node = "running";
                fails = 0;
                startTunnel(c);
                int miss = 0;
                while (miss < 3) {
                    sleep(5000L);
                    miss = nodeUp() ? 0 : miss + 1;
                }
                log(c, "Node stopped answering: the link relay takes over, Node starts again");
                logTail(new File(root(c), "node.log"));
                node = "stopped";
                stopService(c);
                sleep(1500L);
                LinkServer.start();
                sleep(3000L);
            }
        }
    }

    static void startService(Context c) {
        try {
            c.startForegroundService(new Intent(c, NodeService.class));
        } catch (Throwable t) {
            log(c, "Node service did not start: " + t);
        }
    }

    static void stopService(Context c) {
        try {
            c.stopService(new Intent(c, NodeService.class));
        } catch (Throwable t) {
            Log.w(TAG, "Node service stop: " + t);
        }
    }

    /** Node answers its own /head/api/info with "running" (LinkServer answers "relay"). */
    static boolean nodeUp() {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("http://127.0.0.1:" + PORT + "/head/api/info").openConnection();
            h.setConnectTimeout(1500);
            h.setReadTimeout(3000);
            h.setUseCaches(false);
            if (h.getResponseCode() != 200) return false;
            return new String(readAll(h.getInputStream(), 4096), UTF8).contains("\"node\":\"running\"");
        } catch (Throwable t) {
            return false;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    static boolean waitUp(long ms) {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            if (nodeUp()) return true;
            sleep(1000L);
        }
        return false;
    }

    static void waitPortFree(long ms) {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            ServerSocket s = null;
            try {
                s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress("0.0.0.0", PORT));
                return;
            } catch (IOException e) {
                sleep(250L);
            } finally {
                try { if (s != null) s.close(); } catch (IOException e) { /* closed */ }
            }
        }
    }

    /** Copies the pages and modules (assets/server/index.txt) to files/server/app once per app version. */
    static void prepare(Context c) throws IOException {
        File root = root(c), app = appDir(c), data = dataDir(c);
        mkdirs(root);
        mkdirs(data);
        mkdirs(new File(data, "portal"));
        mkdirs(new File(root, "home"));
        mkdirs(new File(root, "tmp"));
        String stamp = "?";
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            stamp = p.versionCode + ":" + p.lastUpdateTime;
        } catch (Exception e) { /* copy again */ }
        File stampFile = new File(root, "app.stamp");
        if (stamp.equals(readText(stampFile)) && new File(app, "labland/store-server.mjs").isFile()) return;
        long t0 = System.currentTimeMillis();
        File next = new File(root, "app.new");
        deleteTree(next);
        AssetManager am = c.getAssets();
        BufferedReader r = new BufferedReader(new InputStreamReader(am.open("server/index.txt"), UTF8));
        byte[] buf = new byte[65536];
        int n = 0;
        try {
            String line;
            while ((line = r.readLine()) != null) {
                line = line.trim();
                int k = line.indexOf('/');
                if (k <= 0 || line.contains("..") || line.startsWith("#")) continue;
                File out = new File(next, line.substring(k + 1));
                mkdirs(out.getParentFile());
                copy(am.open(line), out, buf);
                n++;
            }
        } finally {
            r.close();
        }
        deleteTree(app);
        if (!next.renameTo(app)) throw new IOException("could not rename " + next);
        writeText(stampFile, stamp);
        log(c, "server files ready: " + n + " files in " + (System.currentTimeMillis() - t0) + " ms");
    }

    /* ------------------------------------------------------------------ cloudflared */

    static void startTunnel(Context c) {
        synchronized (LOCK) {
            if (tunnelStarted) return;
            tunnelStarted = true;
        }
        Thread t = new Thread(new Tunnel(c), "bellatrix-tunnel");
        t.setDaemon(true);
        t.start();
    }

    static void setTunnel(Context c, String url) {
        String old = tunnel;
        tunnel = url;
        if (url == null ? old == null : url.equals(old)) return;
        try {
            JSONObject o = new JSONObject();
            o.put("tunnel", url == null ? JSONObject.NULL : url);
            o.put("at", System.currentTimeMillis());
            File f = new File(dataDir(c), "head-info.json"), tmp = new File(dataDir(c), "head-info.json.tmp");
            writeText(tmp, o.toString());
            if (!tmp.renameTo(f)) writeText(f, o.toString());
        } catch (Throwable t) {
            Log.w(TAG, "head-info.json: " + t);
        }
        log(c, url == null ? "public address gone" : "public address " + url);
    }

    static final class Tunnel implements Runnable {
        final Context c;
        volatile String candidate;
        volatile boolean registered;

        Tunnel(Context c) { this.c = c; }

        public void run() {
            File bin = new File(libDir(c), "libcloudflared.so");
            if (!bin.isFile()) {
                log(c, "no cloudflared in this app: no public address");
                return;
            }
            killStale(bin.getAbsolutePath());
            boolean resolved = true;
            int fails = 0;
            long[] pause = {3000L, 15000L, 30000L, 60000L, 120000L};
            while (true) {
                long t0 = System.currentTimeMillis();
                once(bin, resolved);
                setTunnel(c, null);
                if (System.currentTimeMillis() - t0 > 600000L) fails = 0;
                if (!registered) resolved = !resolved;
                sleep(pause[Math.min(fails, pause.length - 1)]);
                fails++;
            }
        }

        void once(File bin, boolean resolved) {
            candidate = null;
            registered = false;
            List<String> cmd = new ArrayList<String>();
            cmd.add(bin.getAbsolutePath());
            cmd.add("tunnel");
            cmd.add("--no-autoupdate");
            cmd.add("--url");
            cmd.add("http://127.0.0.1:" + PORT);
            Forwarder fwd = null;
            if (resolved) {
                List<String> edge = edge();
                fwd = edge.isEmpty() ? null : Forwarder.open(this);
                if (fwd != null) {
                    cmd.add("--quick-service");
                    cmd.add("http://127.0.0.1:" + fwd.port);
                    for (int i = 0; i < edge.size(); i++) {
                        cmd.add("--edge");
                        cmd.add(edge.get(i));
                    }
                }
            }
            log(c, "cloudflared starts" + (fwd != null ? " (edge resolved by the app)" : ""));
            Process p = null;
            OutputStream logOut = null;
            try {
                File lf = new File(root(c), "tunnel.log");
                if (lf.length() > 512L * 1024L) {
                    File old = new File(root(c), "tunnel.log.1");
                    if (old.exists() && !old.delete()) Log.w(TAG, "tunnel.log.1 not deleted");
                    if (!lf.renameTo(old)) Log.w(TAG, "tunnel.log not rotated");
                }
                logOut = new FileOutputStream(lf, true);
                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.redirectErrorStream(true);
                pb.directory(root(c));
                Map<String, String> env = pb.environment();
                env.put("HOME", new File(root(c), "home").getAbsolutePath());
                env.put("TMPDIR", new File(root(c), "tmp").getAbsolutePath());
                p = pb.start();
                BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), UTF8));
                String line;
                while ((line = r.readLine()) != null) {
                    logOut.write((line + "\n").getBytes(UTF8));
                    logOut.flush();
                    Matcher m = TUNNEL_URL.matcher(line);
                    if (m.find() && !"api".equals(m.group(1)) && candidate == null) candidate = m.group(0);
                    if (line.contains("Registered tunnel connection")) registered = true;
                    if (registered && candidate != null && tunnel == null) setTunnel(c, candidate);
                }
                log(c, "cloudflared ended (exit " + p.waitFor() + ")");
                if (!registered) logTail(new File(root(c), "tunnel.log"));
            } catch (Throwable t) {
                log(c, "cloudflared: " + t);
            } finally {
                if (fwd != null) fwd.close();
                if (p != null) p.destroy();
                try { if (logOut != null) logOut.close(); } catch (IOException e) { /* closed */ }
            }
        }

        /** The Cloudflare edge as IPv4 addresses (port 7844), resolved by Android. */
        List<String> edge() {
            List<String> out = new ArrayList<String>();
            for (int i = 0; i < EDGE.length; i++) {
                try {
                    InetAddress[] a = InetAddress.getAllByName(EDGE[i]);
                    int n = 0;
                    for (int j = 0; j < a.length && n < 4; j++) {
                        if (a[j] instanceof Inet4Address) { out.add(a[j].getHostAddress() + ":7844"); n++; }
                    }
                } catch (Throwable t) {
                    log(c, "edge " + EDGE[i] + " not resolved: " + t);
                }
            }
            return out;
        }
    }

    /** A cloudflared left by an earlier run of the app (same user only: Android shows no other /proc entries). */
    static void killStale(String bin) {
        File[] procs = new File("/proc").listFiles();
        if (procs == null) return;
        for (int i = 0; i < procs.length; i++) {
            String name = procs[i].getName();
            if (!name.matches("[0-9]+")) continue;
            String cmd = readText(new File(procs[i], "cmdline"));
            if (cmd != null && cmd.startsWith(bin)) {
                Log.i(TAG, "Head server: ending an old cloudflared (" + name + ")");
                android.os.Process.killProcess(Integer.parseInt(name));
            }
        }
    }

    /**
     * The quick-tunnel request of cloudflared (POST /tunnel, no names to resolve on its side), passed to
     * https://api.trycloudflare.com/tunnel by Android. Loopback only, one request at a time, nothing else.
     */
    static final class Forwarder implements Runnable {
        final ServerSocket ss;
        final int port;
        final Tunnel owner;

        Forwarder(ServerSocket ss, Tunnel owner) { this.ss = ss; this.port = ss.getLocalPort(); this.owner = owner; }

        static Forwarder open(Tunnel owner) {
            try {
                ServerSocket ss = new ServerSocket();
                ss.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
                Forwarder f = new Forwarder(ss, owner);
                Thread t = new Thread(f, "bellatrix-tunnel-fwd");
                t.setDaemon(true);
                t.start();
                return f;
            } catch (Throwable t) {
                Log.w(TAG, "Tunnel forwarder: " + t);
                return null;
            }
        }

        void close() {
            try { ss.close(); } catch (IOException e) { /* closed */ }
        }

        public void run() {
            while (!ss.isClosed()) {
                Socket s = null;
                try {
                    s = ss.accept();
                    s.setSoTimeout(20000);
                    handle(s);
                } catch (Throwable t) {
                    if (ss.isClosed()) return;
                } finally {
                    try { if (s != null) s.close(); } catch (IOException e) { /* closed */ }
                }
            }
        }

        void handle(Socket s) throws IOException {
            InputStream in = new BufferedInputStream(s.getInputStream(), 4096);
            String head = LinkServer.readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] first = lines[0].split(" ");
            String type = "application/json", agent = "cloudflared";
            int len = 0;
            for (int i = 1; i < lines.length; i++) {
                int k = lines[i].indexOf(':');
                if (k <= 0) continue;
                String name = lines[i].substring(0, k).trim().toLowerCase(Locale.ROOT), value = lines[i].substring(k + 1).trim();
                if ("content-length".equals(name)) { try { len = Integer.parseInt(value); } catch (NumberFormatException e) { len = 0; } }
                else if ("content-type".equals(name)) type = value;
                else if ("user-agent".equals(name)) agent = value;
            }
            if (first.length < 2 || !"POST".equals(first[0]) || !"/tunnel".equals(first[1]) || len < 0 || len > 16384) {
                reply(s, 404, "{}".getBytes(UTF8));
                return;
            }
            byte[] body = new byte[len];
            int got = 0;
            while (got < len) {
                int r = in.read(body, got, len - got);
                if (r < 0) break;
                got += r;
            }
            HttpURLConnection h = null;
            try {
                h = (HttpURLConnection) new URL("https://api.trycloudflare.com/tunnel").openConnection();
                h.setRequestMethod("POST");
                h.setConnectTimeout(15000);
                h.setReadTimeout(20000);
                h.setUseCaches(false);
                h.setRequestProperty("Content-Type", type);
                h.setRequestProperty("User-Agent", agent);
                h.setDoOutput(true);
                h.setFixedLengthStreamingMode(got);
                OutputStream o = h.getOutputStream();
                o.write(body, 0, got);
                o.close();
                int code = h.getResponseCode();
                InputStream rs = code >= 400 ? h.getErrorStream() : h.getInputStream();
                byte[] out = rs == null ? new byte[0] : readAll(rs, 65536);
                Matcher m = HOSTNAME.matcher(new String(out, UTF8));
                if (m.find()) owner.candidate = "https://" + m.group(1);
                reply(s, code, out);
            } catch (Throwable t) {
                Log.w(TAG, "Tunnel forwarder: api.trycloudflare.com: " + t);
                reply(s, 502, "{\"success\":false}".getBytes(UTF8));
            } finally {
                if (h != null) h.disconnect();
            }
        }

        static void reply(Socket s, int code, byte[] body) throws IOException {
            String h = "HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error") + "\r\nContent-Type: application/json\r\nContent-Length: "
                + body.length + "\r\nConnection: close\r\n\r\n";
            OutputStream out = s.getOutputStream();
            out.write(h.getBytes(UTF8));
            out.write(body);
            out.flush();
        }
    }

    /* ------------------------------------------------------------------ small helpers */

    static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    static void mkdirs(File d) throws IOException {
        if (d != null && !d.isDirectory() && !d.mkdirs()) throw new IOException("could not make " + d);
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (int i = 0; i < kids.length; i++) deleteTree(kids[i]);
        if (!f.delete()) Log.w(TAG, "Not deleted: " + f);
    }

    static void copy(InputStream in, File out, byte[] buf) throws IOException {
        OutputStream o = new FileOutputStream(out);
        try {
            int r;
            while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        } finally {
            o.close();
            in.close();
        }
    }

    static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        try {
            int r;
            while ((r = in.read(buf)) > 0 && b.size() < max) b.write(buf, 0, r);
        } finally {
            in.close();
        }
        return b.toByteArray();
    }

    static String readText(File f) {
        if (!f.isFile()) return null;
        try {
            return new String(readAll(new FileInputStream(f), 65536), UTF8).trim();
        } catch (IOException e) {
            return null;
        }
    }

    static void writeText(File f, String s) throws IOException {
        OutputStream o = new FileOutputStream(f);
        try { o.write(s.getBytes(UTF8)); } finally { o.close(); }
    }

    /** The last lines of node.log / tunnel.log into logcat ("adb logcat -s Bellatrix"): the app is not
     *  debuggable, so these files cannot be read from a PC. */
    static void logTail(File f) {
        if (!f.isFile()) return;
        try {
            long skip = Math.max(0L, f.length() - 4096L);
            InputStream in = new FileInputStream(f);
            if (in.skip(skip) < skip) Log.w(TAG, "short skip in " + f.getName());
            String[] lines = new String(readAll(in, 8192), UTF8).split("\n");
            for (int i = Math.max(0, lines.length - 30); i < lines.length; i++) Log.w(TAG, f.getName() + ": " + lines[i]);
        } catch (Throwable t) {
            Log.w(TAG, "Could not read " + f.getName() + ": " + t);
        }
    }

    /** logcat, and files/server/head.log (kept under 256 KB). */
    static void log(Context c, String msg) {
        Log.i(TAG, "Head server: " + msg);
        try {
            File f = new File(root(c), "head.log");
            if (f.length() > 256L * 1024L && !f.delete()) return;
            OutputStream o = new FileOutputStream(f, true);
            try {
                String t = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ROOT).format(new Date());
                o.write((t + "  " + msg + "\n").getBytes(UTF8));
            } finally {
                o.close();
            }
        } catch (Throwable t) { /* logcat has it */ }
    }
}
