package de.labland.bellatrix;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Display link relay on the robot head: the same addresses and JSON as labland/display-link.mjs
 * (/link/api/:code/run|next|status|cancel|arrived|ping), HTTP/1.1 on 0.0.0.0:8765, memory only.
 * Started once by the Care Team app (StaffActivity); the patient tablet talks to it over the Wi-Fi.
 * Nothing is logged except start and errors (a run carries the greeting first name, a code is a secret).
 *
 * Build note: static nested classes only, no lambdas, no anonymous classes (see WebActivity).
 */
final class LinkServer {

    static final String TAG = "Bellatrix";
    static final int PORT = 8765;
    static final int MAX_BODY = 200 * 1024;
    static final int MAX_RESULT = 150 * 1024;
    static final long WAIT_MS = 25000L;
    static final long IDLE_MS = 4L * 3600L * 1000L;
    static final int MAX_CHANNELS = 50;
    static final int RATE = 120;
    static final Charset UTF8 = Charset.forName("UTF-8");
    static final Pattern PATH = Pattern.compile("^/link/api/([^/]+)/([a-z]+)$");
    static final Pattern CODE = Pattern.compile("^[A-Za-z0-9]{6,12}$");
    static final String[] TABLET_STATES = {"received", "present", "absent", "started", "finished", "cancelled",
        "arrived", "seated", "waiting-seat", "returning", "home"};
    static final String[] CANCELABLE = {"sent", "delivered", "received", "present", "started", "arrived", "seated", "waiting-seat"};

    static final Object LOCK = new Object();
    static boolean started;                       // guarded by LOCK
    static boolean running;                       // guarded by LOCK
    static ServerSocket server;                   // guarded by LOCK
    static ExecutorService pool;                  // guarded by LOCK
    static int gen;                               // guarded by LOCK; a stop() makes a pending start give up the port
    static final Map<String, Channel> CHANNELS = new HashMap<String, Channel>();   // guarded by CHANNELS
    static final Map<String, long[]> HITS = new HashMap<String, long[]>();         // guarded by HITS

    private LinkServer() {}

    /** Starts the relay (again after stop()). Returns at once; never throws; a busy port is only logged.
     *  On a head with Node (HeadServer) the relay only covers 8765 while Node is not there. */
    static void start() {
        int g;
        synchronized (LOCK) {
            if (started) return;
            started = true;
            g = ++gen;
        }
        try {
            Thread t = new Thread(new Acceptor(g), "bellatrix-link-accept");
            t.setDaemon(true);
            t.start();
        } catch (Throwable t) {
            Log.w(TAG, "Link server start failed: " + t);
        }
    }

    static boolean isRunning() {
        synchronized (LOCK) { return running; }
    }

    /** Stops the relay (the process closing does it too: every thread is a daemon). */
    static void stop() {
        synchronized (LOCK) {
            running = false;
            started = false;
            gen++;
            try { if (server != null) server.close(); } catch (Throwable t) { /* closed */ }
            server = null;
            if (pool != null) pool.shutdownNow();
            pool = null;
        }
    }

    /** {running, port, ips:[IPv4 of the Wi-Fi], url} for the pages (BellatrixApp.linkServer()). */
    static String info() {
        JSONObject o = new JSONObject();
        try {
            List<String> ips = ips();
            JSONArray a = new JSONArray();
            for (int i = 0; i < ips.size(); i++) a.put(ips.get(i));
            o.put("running", isRunning() || HeadServer.nodeRunning());   // Node serves the same /link/api/ on 8765
            o.put("port", PORT);
            o.put("ips", a);
            o.put("url", ips.isEmpty() ? "" : "http://" + ips.get(0) + ":" + PORT);
        } catch (Throwable t) {
            Log.w(TAG, "Link info failed: " + t);
        }
        return o.toString();
    }

    /** IPv4 addresses of this device on the local network; the Wi-Fi ones (wlan*) come first and alone when any. */
    static List<String> ips() {
        List<String> wlan = new ArrayList<String>();
        List<String> other = new ArrayList<String>();
        try {
            Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces();
            while (e != null && e.hasMoreElements()) {
                NetworkInterface ni = e.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> ae = ni.getInetAddresses();
                while (ae.hasMoreElements()) {
                    InetAddress ad = ae.nextElement();
                    if (!(ad instanceof Inet4Address) || ad.isLoopbackAddress() || ad.isLinkLocalAddress()) continue;
                    if (ni.getName().startsWith("wlan")) wlan.add(ad.getHostAddress()); else other.add(ad.getHostAddress());
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "Link ips failed: " + t);
        }
        return wlan.isEmpty() ? other : wlan;
    }

    /* ------------------------------------------------------------------ sockets */

    static final class Names implements ThreadFactory {
        int n;
        public synchronized Thread newThread(Runnable r) {
            Thread t = new Thread(r, "bellatrix-link-" + (++n));
            t.setDaemon(true);
            return t;
        }
    }

    static final class Acceptor implements Runnable {
        final int g;

        Acceptor(int g) { this.g = g; }

        public void run() {
            ServerSocket ss;
            try {
                ss = new ServerSocket();
                ss.setReuseAddress(true);
                ss.bind(new InetSocketAddress("0.0.0.0", PORT));
            } catch (Throwable t) {
                Log.w(TAG, "Link server: port " + PORT + " not available: " + t);
                synchronized (LOCK) { if (gen == g) started = false; }
                return;
            }
            ExecutorService ex;
            synchronized (LOCK) {
                if (gen != g) {   // stop() came first: the port is for Node
                    try { ss.close(); } catch (Throwable t) { /* closed */ }
                    return;
                }
                ex = Executors.newFixedThreadPool(16, new Names());
                server = ss;
                pool = ex;
                running = true;
            }
            Log.i(TAG, "Link server listening on " + PORT);
            while (true) {
                try {
                    Socket s = ss.accept();
                    ex.execute(new Conn(s));
                } catch (Throwable t) {
                    synchronized (LOCK) { if (server != ss) return; }   // stopped
                    if (ss.isClosed()) return;
                    try { Thread.sleep(200); } catch (InterruptedException ie) { return; }
                }
            }
        }
    }

    static final class Conn implements Runnable {
        final Socket s;

        Conn(Socket s) { this.s = s; }

        public void run() {
            try {
                s.setSoTimeout(10000);
                handle(s);
            } catch (Throwable t) {
                // a dropped connection: nothing to tell
            } finally {
                try { s.close(); } catch (Throwable t) { /* closed */ }
            }
        }
    }

    /** A reply: status and JSON text; null means the client left. */
    static final class Reply {
        final int status;
        final String json;

        Reply(int status, String json) { this.status = status; this.json = json; }
    }

    static Reply ok(JSONObject o) { return new Reply(200, o.toString()); }

    static Reply err(int status, String error) {
        JSONObject o = new JSONObject();
        try { o.put("error", error); } catch (JSONException e) { /* cannot happen */ }
        return new Reply(status, o.toString());
    }

    static String reason(int c) {
        switch (c) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 503: return "Service Unavailable";
            default: return "Error";
        }
    }

    static void send(Socket s, int status, String json) throws IOException {
        byte[] body = json == null ? new byte[0] : json.getBytes(UTF8);
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        h.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        h.append("Access-Control-Allow-Headers: Content-Type\r\n");
        h.append("Access-Control-Allow-Private-Network: true\r\n");
        h.append("Access-Control-Max-Age: 600\r\n");
        h.append("Cache-Control: no-store\r\n");
        if (status != 204) h.append("Content-Type: application/json; charset=utf-8\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        OutputStream out = s.getOutputStream();
        out.write(h.toString().getBytes(UTF8));
        if (body.length > 0) out.write(body);
        out.flush();
    }

    /** Reads the head of the request (up to 16 KB) as text. */
    static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c, n = 0, state = 0;
        while ((c = in.read()) >= 0) {
            b.write(c);
            if (++n > 16384) return null;
            if ((state == 0 || state == 2) && c == '\r') state++;
            else if ((state == 1 || state == 3) && c == '\n') { state++; if (state == 4) break; }
            else state = c == '\r' ? 1 : 0;
        }
        if (state != 4) return null;
        return new String(b.toByteArray(), UTF8);
    }

    static void handle(Socket s) throws IOException {
        InputStream in = new BufferedInputStream(s.getInputStream(), 4096);
        String head = readHead(in);
        if (head == null) { send(s, 400, "{\"error\":\"bad-request\"}"); return; }
        String[] lines = head.split("\r\n");
        String[] first = lines[0].split(" ");
        if (first.length < 2) { send(s, 400, "{\"error\":\"bad-request\"}"); return; }
        String method = first[0].toUpperCase();
        String target = first[1];
        int len = 0;
        for (int i = 1; i < lines.length; i++) {
            int k = lines[i].indexOf(':');
            if (k > 0 && lines[i].substring(0, k).trim().equalsIgnoreCase("content-length")) {
                try { len = Integer.parseInt(lines[i].substring(k + 1).trim()); } catch (NumberFormatException e) { len = 0; }
            }
        }
        if ("OPTIONS".equals(method)) { send(s, 204, null); return; }
        if (len > MAX_BODY) { send(s, 413, "{\"error\":\"too-large\"}"); return; }
        byte[] raw = new byte[len];
        int got = 0;
        while (got < len) {
            int r = in.read(raw, got, len - got);
            if (r < 0) break;
            got += r;
        }
        String path = target, query = "";
        int q = target.indexOf('?');
        if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
        Object body = null;
        if (got > 0) {
            String text = new String(raw, 0, got, UTF8).trim();
            if (text.length() > 0) {
                try { body = new JSONTokener(text).nextValue(); } catch (JSONException e) { send(s, 400, "{\"error\":\"bad-json\"}"); return; }
            }
        }
        JSONObject obj = body instanceof JSONObject ? (JSONObject) body : new JSONObject();
        String ip = s.getInetAddress() == null ? "?" : s.getInetAddress().getHostAddress();
        Reply r;
        try {
            r = route(method, path, query, obj, ip, s);
        } catch (Throwable t) {
            Log.w(TAG, "Link request failed: " + t);
            r = err(500, "server-error");
        }
        if (r == null) return;   // the client left while waiting
        send(s, r.status, r.json);
    }

    static Map<String, String> params(String query) {
        Map<String, String> m = new HashMap<String, String>();
        String[] parts = query.split("&");
        for (int i = 0; i < parts.length; i++) {
            int k = parts[i].indexOf('=');
            if (k > 0) m.put(parts[i].substring(0, k), parts[i].substring(k + 1));
        }
        return m;
    }

    static double num(String v) {
        if (v == null || v.length() == 0) return 0;
        try { return Double.parseDouble(v); } catch (NumberFormatException e) { return Double.NaN; }
    }

    static boolean in(String v, String[] list) {
        for (int i = 0; i < list.length; i++) if (list[i].equals(v)) return true;
        return false;
    }

    static String str(Object v, int max) {
        if (!(v instanceof String)) return "";
        String s = (String) v;
        return s.length() > max ? s.substring(0, max) : s;
    }

    static boolean limited(String ip) {
        long t = System.currentTimeMillis();
        synchronized (HITS) {
            if (HITS.size() > 200) {
                Iterator<Map.Entry<String, long[]>> it = HITS.entrySet().iterator();
                while (it.hasNext()) if (t - it.next().getValue()[0] >= 60000L) it.remove();
            }
            long[] h = HITS.get(ip);
            if (h == null || t - h[0] >= 60000L) { h = new long[]{t, 0}; HITS.put(ip, h); }
            return ++h[1] > RATE;
        }
    }

    /* ------------------------------------------------------------------ channels */

    /** One pairing code: the live run, its state, and what the tablet has still to be told. */
    static final class Channel {
        long seq;
        JSONObject run;
        String state = "";
        JSONObject result;
        boolean cancelPending;
        boolean arrivedPending;
        long active = System.currentTimeMillis();
        int waiters;
    }

    static Channel channel(String code) {
        long t = System.currentTimeMillis();
        synchronized (CHANNELS) {
            Channel ch = CHANNELS.get(code);
            if (ch != null && t - ch.active > IDLE_MS && ch.waiters == 0) { CHANNELS.remove(code); ch = null; }
            if (ch == null) {
                Iterator<Map.Entry<String, Channel>> it = CHANNELS.entrySet().iterator();
                while (it.hasNext()) {
                    Channel c = it.next().getValue();
                    if (t - c.active > IDLE_MS && c.waiters == 0) it.remove();
                }
                if (CHANNELS.size() >= MAX_CHANNELS) return null;
                ch = new Channel();
                CHANNELS.put(code, ch);
            }
            ch.active = t;
            return ch;
        }
    }

    /** Call with the channel locked. */
    static void bump(Channel ch) {
        ch.seq++;
        ch.active = System.currentTimeMillis();
        ch.notifyAll();
    }

    static JSONObject view(Channel ch) throws JSONException {
        JSONObject out = new JSONObject();
        out.put("seq", ch.seq);
        if (ch.run != null) {
            out.put("id", ch.run.opt("id"));
            out.put("state", ch.state);
            out.put("position", ch.run.has("position") ? ch.run.get("position") : JSONObject.NULL);
            if (ch.run.has("place")) out.put("place", ch.run.get("place"));
        }
        if (ch.result != null) out.put("result", ch.result);
        return out;
    }

    /** True when the client closed its end (a held request must not take a run it cannot receive). */
    static boolean gone(Socket s) {
        try {
            s.setSoTimeout(1);
            int r = s.getInputStream().read();
            return r < 0;
        } catch (SocketTimeoutException e) {
            return false;
        } catch (Throwable t) {
            return true;
        }
    }

    static boolean cancelled(Channel ch) { return "cancelled".equals(ch.state); }

    /** What /next hands out now, or null. Channel locked. */
    static JSONObject take(Channel ch) throws JSONException {
        if (ch.cancelPending && ch.run != null) {
            ch.cancelPending = false;
            return new JSONObject().put("cancel", ch.run.get("id"));
        }
        if (ch.run != null && "sent".equals(ch.state)) {
            ch.state = "delivered";
            bump(ch);
            return new JSONObject().put("run", ch.run);
        }
        if (ch.arrivedPending && ch.run != null && !"sent".equals(ch.state)) {
            ch.arrivedPending = false;
            if ("delivered".equals(ch.state)) ch.state = "arrived";
            bump(ch);
            return new JSONObject().put("arrived", ch.run.get("id"));
        }
        return null;
    }

    static Reply route(String method, String path, String query, JSONObject body, String ip, Socket sock) throws JSONException {
        // The head's public address for its tablet (js/head-server.js); Node answers it too when it runs.
        if ("/head/api/info".equals(path) && "GET".equals(method)) return new Reply(200, HeadServer.relayInfo());
        Matcher m = PATH.matcher(path);
        if (!m.matches()) return err(404, "not found");
        String code = m.group(1), act = m.group(2);
        boolean post = "POST".equals(method);
        if (!CODE.matcher(code).matches()) {
            JSONObject o = new JSONObject();
            o.put("error", "bad-code");
            o.put("message", "The pairing code is 6 to 12 letters or digits.");
            return new Reply(400, o.toString());
        }
        if (limited(ip)) return err(429, "too-many-requests");
        if ("ping".equals(act) && !post) {
            return ok(new JSONObject().put("ok", true).put("t", System.currentTimeMillis()));
        }
        if (!("run".equals(act) || "next".equals(act) || "status".equals(act) || "cancel".equals(act) || "arrived".equals(act))) return err(404, "not found");
        Channel ch = channel(code);
        if (ch == null) return err(503, "too-many-channels");
        Map<String, String> p = params(query);

        if ("run".equals(act) && post) {
            Object ro = body.opt("run");
            if (!(ro instanceof JSONObject)) return err(400, "bad-run");
            JSONObject r = (JSONObject) ro;
            Object id = r.opt("id");
            if (!(id instanceof String) || ((String) id).length() == 0 || ((String) id).length() > 64) return err(400, "bad-run");
            JSONObject run = new JSONObject();
            String[] keys = {"id", "key", "patient", "opt", "position", "at", "preview"};
            for (int i = 0; i < keys.length; i++) if (r.has(keys[i])) run.put(keys[i], r.get(keys[i]));
            String place = str(r.opt("place"), 60);
            if (place.length() > 0) run.put("place", place);
            synchronized (ch) {
                ch.run = run;
                ch.state = "sent";
                ch.result = null;
                ch.cancelPending = false;
                ch.arrivedPending = false;
                bump(ch);
            }
            return ok(new JSONObject().put("ok", true).put("id", id));
        }
        if ("cancel".equals(act) && post) {
            synchronized (ch) {
                if (ch.run != null && in(ch.state, CANCELABLE)) {
                    ch.state = "cancelled";
                    ch.cancelPending = true;
                    bump(ch);
                }
                return ok(new JSONObject().put("ok", true).put("state", ch.run != null ? ch.state : ""));
            }
        }
        if ("arrived".equals(act) && post) {
            Object id = body.opt("id");
            synchronized (ch) {
                if (!(id instanceof String) || ch.run == null || !id.equals(ch.run.opt("id"))) return err(409, "stale-run");
                if ("sent".equals(ch.state) || "delivered".equals(ch.state) || "received".equals(ch.state)) {
                    ch.arrivedPending = true;
                    if (!"sent".equals(ch.state)) ch.state = "arrived";
                    bump(ch);
                }
                return ok(new JSONObject().put("ok", true).put("state", ch.state));
            }
        }
        if ("next".equals(act) && !post) {
            double w = num(p.get("wait"));
            long ms = w > 0 ? (long) Math.min(w * 1000, WAIT_MS) : 0;
            return hold(ch, ms, sock, 0, 0);
        }
        if ("status".equals(act) && post) {
            Object id = body.opt("id");
            Object state = body.opt("state");
            if (!(id instanceof String) || !(state instanceof String) || !in((String) state, TABLET_STATES)) return err(400, "bad-status");
            synchronized (ch) {
                if (ch.run == null || !id.equals(ch.run.opt("id"))) return err(409, "stale-run");
                if (cancelled(ch)) {
                    if ("returning".equals(state) || "home".equals(state)) return ok(new JSONObject().put("ok", true).put("seq", ch.seq));
                    return err(409, "cancelled");
                }
                JSONObject result = null;
                if (body.has("result") && !body.isNull("result")) {
                    Object ro = body.get("result");
                    if (!"finished".equals(state) || !(ro instanceof JSONObject)) return err(400, "bad-result");
                    if (ro.toString().length() > MAX_RESULT) return err(413, "result-too-large");
                    result = (JSONObject) ro;
                }
                ch.state = (String) state;
                if (result != null) ch.result = result;
                bump(ch);
                return ok(new JSONObject().put("ok", true).put("seq", ch.seq));
            }
        }
        if ("status".equals(act) && !post) {
            double w = num(p.get("wait"));
            long ms = w > 0 ? (long) Math.min(w * 1000, WAIT_MS) : 0;
            double sn = num(p.get("since"));
            long since;
            synchronized (ch) {
                since = (sn >= 0 && sn <= ch.seq) ? (long) sn : 0;   // a restarted server counts from 0 again (NaN fails both tests)
            }
            return hold(ch, ms, sock, 1, since);
        }
        return err(404, "not found");
    }

    /** Long-poll: kind 0 = /next, kind 1 = /status?since. Answers as soon as there is something, or {} after ms. */
    static Reply hold(Channel ch, long ms, Socket sock, int kind, long since) throws JSONException {
        long end = System.currentTimeMillis() + ms;
        synchronized (ch) { ch.waiters++; }
        try {
            while (true) {
                synchronized (ch) {
                    JSONObject o = null;
                    if (kind == 0) o = take(ch);
                    else if (ch.seq > since) o = view(ch);
                    if (o != null) return ok(o);
                    long left = end - System.currentTimeMillis();
                    if (left <= 0) {
                        if (kind == 0) return new Reply(200, "{}");
                        return ok(new JSONObject().put("seq", ch.seq));
                    }
                    try { ch.wait(Math.min(left, 500L)); } catch (InterruptedException e) { return null; }
                }
                if (gone(sock)) return null;
            }
        } finally {
            synchronized (ch) { ch.waiters--; }
        }
    }
}
