package de.labland.bellatrix;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The robots' own little web server (port 8780), so that several robots on the same Wi-Fi can
 * play one game: the pages of every robot send their moves to the host robot's server and read
 * the others' moves back from it. The game itself is JavaScript on the host; this is only a
 * dumb, reliable message relay.
 *
 *   GET  /net/hello                 {"app":"bellatrix","name":"Bellatrix (157)","port":8780,"ip":"192.168.1.157"}
 *   POST /room/ROOM/send            body: any JSON text, kept as it is     answer {"seq":n}
 *   GET  /room/ROOM/since/N?wait=S  {"seq":last,"epoch":e,"messages":[{"seq":k,"body":<JSON as sent>},...]}
 *                                   every message after N; when there is none yet it waits up to
 *                                   S seconds (default 15, at most 25) for one (long poll).
 *   GET  /net/games                 the games heard on the Wi-Fi (NetDiscovery.games())
 *   POST /net/announce              body: the JSON to announce, "" or null stops (this device only)
 *
 * ROOM is [A-Za-z0-9_-]{1,40}. A room starts with its first message, keeps the last 1000 (and at
 * most about 2 MB of text) and is forgotten an hour after its last message. "epoch" changes when a
 * room is made again (for example after the host app restarted); asking for N beyond the room's
 * last seq answers at once with every kept message and "reset":true. When an answer would be very
 * long it stops early with "more":true; "seq" is then the last seq it holds, so ask again from it.
 *
 * Every answer carries the CORS headers, so the pages (https://app.bellatrix) and a laptop browser
 * can fetch() it; OPTIONS answers 204. Plain Java (no android.*), so it can be tested on a desktop.
 *
 * Build note: no inner, anonymous or private nested classes and no lambdas (see WebActivity).
 */
final class NetServer implements Runnable {

    static final int MAX_BODY = 64 * 1024;
    static final int MAX_HEAD = 16 * 1024;
    static final int KEEP = 1000;
    static final long ROOM_CHARS = 2000000;
    static final long ALL_CHARS = 8000000;
    static final int MAX_ROOMS = 200;
    static final int REPLY_CHARS = 1000000;
    static final int WAIT_DEFAULT = 15;
    static final int WAIT_MAX = 25;
    static final int READ_TIMEOUT_MS = 10000;
    /** Each waiting long poll holds one thread, so the pool grows on demand up to THREADS_MAX;
     *  beyond that a request gets 503 at once instead of waiting behind the long polls. */
    static final int THREADS_MIN = 4;
    static final int THREADS_MAX = 64;

    /** Where the server's few log lines go (Net sends them to logcat). */
    interface Sink { void log(String line); }

    /** Gives the robot's name when /net/hello is asked (Net: the device name and the IP). */
    interface Namer { String name(); }

    static volatile String name = "Bellatrix";
    static volatile Namer namer;
    static volatile Sink sink;
    /** null: every interface. The desktop tests use 127.0.0.1. */
    static volatile String bindHost;
    /** A room is forgotten this long after its last message (tests make it short). */
    static volatile long forgetMs = 60L * 60 * 1000;

    static volatile String cachedName;
    static volatile long cachedAt;

    static NetServer server;   // guarded by NetServer.class

    // The rooms: one lock for all of them, which is also what the long polls wait on.
    static final Object ROOMS = new Object();
    static final Map<String, Room> rooms = new HashMap<String, Room>();
    static long allChars;
    static long lastEpoch;

    final int port;
    volatile int bound = -1;
    final ThreadPoolExecutor pool;

    NetServer(int port) {
        this.port = port;
        pool = new ThreadPoolExecutor(THREADS_MIN, THREADS_MAX, 30, TimeUnit.SECONDS,
                new SynchronousQueue<Runnable>(), new Threads());
    }

    /** Starts the server once per process; later calls do nothing. Never throws. */
    static void start(int port) {
        try {
            synchronized (NetServer.class) {
                if (server != null) return;
                NetServer s = new NetServer(port);
                Thread t = new Thread(s, "bellatrix-http");
                t.setDaemon(true);
                t.start();
                server = s;
            }
        } catch (Throwable t) {
            log("could not start the server: " + t);
        }
    }

    /** The port the server listens on, or -1 while it is not (yet) listening. */
    static int port() {
        synchronized (NetServer.class) { return server == null ? -1 : server.bound; }
    }

    static void setName(String n) {
        if (n != null && !n.trim().isEmpty()) name = n.trim();
    }

    static void log(String line) {
        Sink k = sink;
        if (k != null) {
            try { k.log(line); return; } catch (Throwable ignored) { }
        }
        System.out.println("Bellatrix net: " + line);
    }

    /** Accepts connections; when the socket fails it opens it again two seconds later. */
    @Override
    public void run() {
        int failures = 0;
        while (true) {
            ServerSocket ss = null;
            try {
                ss = new ServerSocket();
                ss.setReuseAddress(true);
                String h = bindHost;
                ss.bind(h == null ? new InetSocketAddress(port) : new InetSocketAddress(h, port), 64);
                bound = ss.getLocalPort();
                log("server listening on port " + bound);
                failures = 0;
                while (true) hand(ss.accept());
            } catch (Throwable t) {
                if (failures++ < 3 || failures % 30 == 0) log("server socket: " + t);
            } finally {
                bound = -1;
                close(ss);
            }
            try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
        }
    }

    void hand(Socket s) {
        try {
            s.setSoTimeout(READ_TIMEOUT_MS);
            s.setTcpNoDelay(true);
            pool.execute(new Conn(s));
        } catch (RejectedExecutionException e) {
            busy(s);
        } catch (Throwable t) {
            close(s);
        }
    }

    static void busy(Socket s) {
        try {
            s.setSoTimeout(1000);
            reply(s.getOutputStream(), 503, error("busy, try again"), "Retry-After: 1");
        } catch (Throwable ignored) {
        } finally {
            close(s);
        }
    }

    static void close(ServerSocket c) {
        if (c == null) return;
        try { c.close(); } catch (Throwable ignored) { }
    }

    static void close(Socket c) {
        if (c == null) return;
        try { c.close(); } catch (Throwable ignored) { }
    }

    static long nowMs() { return System.nanoTime() / 1000000L; }

    // ---------------------------------------------------------------- the rooms (in-process API too)

    static boolean roomOk(String r) {
        if (r == null || r.isEmpty() || r.length() > 40) return false;
        for (int i = 0; i < r.length(); i++) {
            char c = r.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
            if (!ok) return false;
        }
        return true;
    }

    /** Adds a message (a JSON text) to a room. Returns its seq, or -1 for a bad room or bad JSON. */
    static long send(String room, String json) {
        if (!roomOk(room) || json == null) return -1;
        String body = json.trim();
        if (body.length() > MAX_BODY || !Json.valid(body)) return -1;
        synchronized (ROOMS) {
            long now = nowMs();
            sweep(now);
            Room r = rooms.get(room);
            if (r == null) {
                if (rooms.size() >= MAX_ROOMS) evictOldest(null);
                long e = System.currentTimeMillis();
                if (e <= lastEpoch) e = lastEpoch + 1;
                lastEpoch = e;
                r = new Room(room, e);
                rooms.put(room, r);
            }
            Msg m = new Msg(++r.seq, body);
            r.msgs.addLast(m);
            r.chars += body.length();
            allChars += body.length();
            r.last = now;
            while (r.msgs.size() > KEEP || (r.chars > ROOM_CHARS && r.msgs.size() > 1)) {
                Msg old = r.msgs.removeFirst();
                r.chars -= old.body.length();
                allChars -= old.body.length();
            }
            while (allChars > ALL_CHARS && evictOldest(r)) { /* the oldest other rooms go first */ }
            ROOMS.notifyAll();
            return m.seq;
        }
    }

    /** The messages after n, at once (no waiting). */
    static String since(String room, long n) { return since(room, n, 0); }

    /** The messages after n; when there is none yet, waits up to waitMs for one. */
    static String since(String room, long n, long waitMs) {
        long until = System.nanoTime() + Math.max(0, waitMs) * 1000000L;
        ArrayList<Msg> got = new ArrayList<Msg>();
        long seq = 0, epoch = 0;
        boolean reset = false, more = false;
        if (roomOk(room)) {
            synchronized (ROOMS) {
                sweep(nowMs());
                while (true) {
                    Room r = rooms.get(room);
                    long cur = r == null ? 0 : r.seq;
                    // Beyond the last seq: the room was made again (host restarted). Start over.
                    if (n > cur) { reset = true; n = 0; }
                    seq = cur;
                    epoch = r == null ? 0 : r.epoch;
                    if (r != null && cur > n) {
                        long chars = 0;
                        for (Msg m : r.msgs) {
                            if (m.seq <= n) continue;
                            if (!got.isEmpty() && chars + m.body.length() > REPLY_CHARS) {
                                more = true;
                                seq = got.get(got.size() - 1).seq;
                                break;
                            }
                            got.add(m);
                            chars += m.body.length();
                        }
                        break;
                    }
                    if (reset) break;
                    long left = until - System.nanoTime();
                    if (left <= 0) break;
                    try { TimeUnit.NANOSECONDS.timedWait(ROOMS, left); } catch (InterruptedException e) { break; }
                }
            }
        }
        int size = 64;
        for (Msg m : got) size += m.body.length() + 32;
        StringBuilder b = new StringBuilder(size);
        b.append("{\"seq\":").append(seq).append(",\"epoch\":").append(epoch);
        if (reset) b.append(",\"reset\":true");
        if (more) b.append(",\"more\":true");
        b.append(",\"messages\":[");
        for (int i = 0; i < got.size(); i++) {
            Msg m = got.get(i);
            if (i > 0) b.append(',');
            b.append("{\"seq\":").append(m.seq).append(",\"body\":").append(m.body).append('}');
        }
        return b.append("]}").toString();
    }

    /** Forgets the rooms that have been quiet too long. Caller holds ROOMS. */
    static void sweep(long now) {
        long limit = forgetMs;
        Iterator<Room> it = rooms.values().iterator();
        while (it.hasNext()) {
            Room r = it.next();
            if (now - r.last > limit) {
                allChars -= r.chars;
                it.remove();
            }
        }
    }

    /** Drops the room quiet the longest, except keep. Caller holds ROOMS. */
    static boolean evictOldest(Room keep) {
        Room oldest = null;
        for (Room r : rooms.values()) {
            if (r != keep && (oldest == null || r.last < oldest.last)) oldest = r;
        }
        if (oldest == null) return false;
        rooms.remove(oldest.id);
        allChars -= oldest.chars;
        return true;
    }

    static final class Room {
        final String id;
        final long epoch;
        final ArrayDeque<Msg> msgs = new ArrayDeque<Msg>();
        long seq;
        long chars;
        long last;

        Room(String id, long epoch) { this.id = id; this.epoch = epoch; }
    }

    static final class Msg {
        final long seq;
        final String body;

        Msg(long seq, String body) { this.seq = seq; this.body = body; }
    }

    // ---------------------------------------------------------------- HTTP

    static final class Conn implements Runnable {
        final Socket s;

        Conn(Socket s) { this.s = s; }

        @Override
        public void run() {
            try {
                serve(s);
            } catch (IOException ignored) {
                // The other side went away; nothing to answer.
            } catch (Throwable t) {
                log("request failed: " + t);
                try { reply(s.getOutputStream(), 500, error("server error"), null); } catch (Throwable ignored) { }
            } finally {
                close(s);
            }
        }
    }

    static final class Threads implements ThreadFactory {
        final AtomicInteger count = new AtomicInteger();

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, "bellatrix-http-" + count.incrementAndGet());
            t.setDaemon(true);
            return t;
        }
    }

    /** One request, as far as this server cares. */
    static final class Req {
        String method = "";
        String path = "/";
        String query = "";
        long length;
        boolean chunked;
        boolean expectContinue;
        int status;          // not 0: answer this error at once
        String problem = "";

        void fail(int st, String why) {
            if (status == 0) { status = st; problem = why; }
        }
    }

    /** Reads the head (request line and headers); null when the connection closed first. */
    static Req readHead(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(512);
        int w = 0;
        int c;
        while ((c = in.read()) != -1) {
            b.write(c);
            w = (w << 8) | c;
            if (c == '\n' && (w == 0x0D0A0D0A || (w & 0xFFFF) == 0x0A0A)) return parseHead(b.toByteArray());
            if (b.size() > MAX_HEAD) {
                Req q = new Req();
                q.fail(431, "request head too long");
                return q;
            }
        }
        return null;
    }

    static Req parseHead(byte[] head) {
        Req q = new Req();
        String[] lines = new String(head, StandardCharsets.ISO_8859_1).split("\r?\n");
        int k = 0;
        while (k < lines.length && lines[k].isEmpty()) k++;
        if (k >= lines.length) { q.fail(400, "empty request"); return q; }
        String[] rl = lines[k].split(" ");
        if (rl.length != 3 || !rl[2].startsWith("HTTP/1.") || !upper(rl[0])) { q.fail(400, "bad request line"); return q; }
        q.method = rl[0];
        String target = rl[1];
        if (target.startsWith("http://") || target.startsWith("https://")) {
            int slash = target.indexOf('/', target.indexOf("//") + 2);
            target = slash < 0 ? "/" : target.substring(slash);
        }
        if (!target.startsWith("/")) { q.fail(400, "bad request target"); return q; }
        int hash = target.indexOf('#');
        if (hash >= 0) target = target.substring(0, hash);
        int qm = target.indexOf('?');
        q.path = qm < 0 ? target : target.substring(0, qm);
        q.query = qm < 0 ? "" : target.substring(qm + 1);
        long length = -1;
        for (int i = k + 1; i < lines.length; i++) {
            String line = lines[i];
            if (line.isEmpty()) break;
            if (line.charAt(0) == ' ' || line.charAt(0) == '\t') continue;   // old folded header
            int colon = line.indexOf(':');
            if (colon <= 0) { q.fail(400, "bad header"); return q; }
            String key = line.substring(0, colon).trim().toLowerCase(java.util.Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            if (key.equals("content-length")) {
                long v = digits(value);
                if (v < 0 || (length >= 0 && v != length)) { q.fail(400, "bad Content-Length"); return q; }
                length = v;
            } else if (key.equals("transfer-encoding")) {
                if (!value.equalsIgnoreCase("identity")) q.chunked = true;
            } else if (key.equals("expect")) {
                if (value.equalsIgnoreCase("100-continue")) q.expectContinue = true;
            }
        }
        q.length = Math.max(0, length);
        return q;
    }

    static boolean upper(String s) {
        if (s.isEmpty() || s.length() > 16) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < 'A' || c > 'Z') return false;
        }
        return true;
    }

    /** A non-negative decimal number of at most 18 digits, or -1. */
    static long digits(String s) {
        if (s == null || s.isEmpty() || s.length() > 18) return -1;
        long v = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') return -1;
            v = v * 10 + (c - '0');
        }
        return v;
    }

    static void serve(Socket s) throws IOException {
        InputStream in = new BufferedInputStream(s.getInputStream(), 8192);
        OutputStream out = s.getOutputStream();
        Req q = readHead(in);
        if (q == null) return;
        if (q.status == 0 && q.chunked) q.fail(411, "send a Content-Length");
        if (q.status == 0 && q.length > MAX_BODY) q.fail(413, "body larger than " + MAX_BODY + " bytes");
        if (q.status != 0) {
            reply(out, q.status, error(q.problem), null);
            drain(s, in);
            return;
        }
        String body = "";
        if (q.length > 0) {
            if (q.expectContinue) {
                out.write("HTTP/1.1 100 Continue\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
            }
            byte[] b = new byte[(int) q.length];
            int got = 0;
            while (got < b.length) {
                int r = in.read(b, got, b.length - got);
                if (r < 0) return;
                got += r;
            }
            body = new String(b, StandardCharsets.UTF_8);
        }
        route(s, out, q, body);
    }

    /** After an early error: lets the client finish sending, so it reads the answer, not a reset. */
    static void drain(Socket s, InputStream in) {
        try {
            s.shutdownOutput();
            s.setSoTimeout(2000);
            byte[] junk = new byte[8192];
            long total = 0;
            while (total < (1 << 20)) {
                int r = in.read(junk);
                if (r < 0) break;
                total += r;
            }
        } catch (Throwable ignored) { }
    }

    static void route(Socket s, OutputStream out, Req q, String body) throws IOException {
        String m = q.method;
        String p = q.path;
        if (m.equals("OPTIONS")) { reply(out, 204, null, null); return; }

        if (p.equals("/net/hello")) {
            if (!m.equals("GET")) { notAllowed(out, "GET"); return; }
            reply(out, 200, hello(), null);
            return;
        }
        if (p.equals("/net/games")) {
            if (!m.equals("GET")) { notAllowed(out, "GET"); return; }
            reply(out, 200, NetDiscovery.games(), null);
            return;
        }
        if (p.equals("/net/announce")) {
            if (!m.equals("POST")) { notAllowed(out, "POST"); return; }
            InetAddress from = s.getInetAddress();
            if (from == null || !from.isLoopbackAddress()) { reply(out, 403, error("only this device may announce (use 127.0.0.1)"), null); return; }
            String j = body.trim();
            if (j.equals("null")) j = "";
            if (!j.isEmpty() && !Json.valid(j)) { reply(out, 400, error("the body is not JSON"), null); return; }
            if (!NetDiscovery.announce(j)) { reply(out, 413, error("announcement too long for one packet"), null); return; }
            reply(out, 200, "{\"ok\":true}", null);
            return;
        }

        String[] parts = p.split("/");
        if (parts.length >= 4 && parts.length <= 5 && parts[0].isEmpty() && parts[1].equals("room")) {
            String room = parts[2];
            if (parts.length == 4 && parts[3].equals("send")) {
                if (!m.equals("POST")) { notAllowed(out, "POST"); return; }
                if (!roomOk(room)) { reply(out, 400, error("bad room name (A-Z a-z 0-9 _ -, 1 to 40)"), null); return; }
                long seq = send(room, body);
                if (seq < 0) { reply(out, 400, error("the body is not JSON"), null); return; }
                reply(out, 200, "{\"seq\":" + seq + "}", null);
                return;
            }
            if (parts.length == 5 && parts[3].equals("since")) {
                if (!m.equals("GET")) { notAllowed(out, "GET"); return; }
                if (!roomOk(room)) { reply(out, 400, error("bad room name (A-Z a-z 0-9 _ -, 1 to 40)"), null); return; }
                long n = digits(parts[4]);
                if (n < 0) { reply(out, 400, error("bad seq"), null); return; }
                reply(out, 200, since(room, n, waitMs(q.query)), null);
                return;
            }
        }
        reply(out, 404, error("not found"), null);
    }

    /** wait=S in seconds (decimals allowed): default 15, between 0 and 25. */
    static long waitMs(String query) {
        double sec = WAIT_DEFAULT;
        if (query != null) {
            for (String pair : query.split("&")) {
                if (!pair.startsWith("wait=")) continue;
                try {
                    double v = Double.parseDouble(pair.substring(5));
                    if (!Double.isNaN(v)) sec = v;
                } catch (NumberFormatException ignored) { }
            }
        }
        if (sec < 0) sec = 0;
        if (sec > WAIT_MAX) sec = WAIT_MAX;
        return (long) (sec * 1000);
    }

    static String hello() {
        String ip = "";
        try { ip = NetDiscovery.localAddress(); } catch (Throwable ignored) { }
        int p = port();
        return "{\"app\":\"bellatrix\",\"name\":" + Json.quote(currentName()) + ",\"port\":" + p
                + ",\"ip\":" + Json.quote(ip) + "}";
    }

    static String currentName() {
        Namer nm = namer;
        if (nm == null) return name;
        String c = cachedName;
        long now = nowMs();
        if (c != null && now - cachedAt < 5000) return c;
        try {
            String v = nm.name();
            if (v != null && !v.trim().isEmpty()) {
                cachedName = v.trim();
                cachedAt = now;
                return cachedName;
            }
        } catch (Throwable ignored) { }
        return name;
    }

    static String error(String why) { return "{\"error\":" + Json.quote(why) + "}"; }

    static void notAllowed(OutputStream out, String allow) throws IOException {
        reply(out, 405, error("method not allowed"), "Allow: " + allow + ", OPTIONS");
    }

    static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 411: return "Length Required";
            case 413: return "Payload Too Large";
            case 431: return "Request Header Fields Too Large";
            case 503: return "Service Unavailable";
            default: return "Internal Server Error";
        }
    }

    static void reply(OutputStream out, int status, String json, String extraHeader) throws IOException {
        byte[] body = json == null || status == 204 ? new byte[0] : json.getBytes(StandardCharsets.UTF_8);
        StringBuilder h = new StringBuilder(420);
        h.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        if (status != 204) {
            h.append("Content-Type: application/json; charset=utf-8\r\n");
            h.append("Content-Length: ").append(body.length).append("\r\n");
        }
        h.append("Cache-Control: no-store\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        h.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        h.append("Access-Control-Allow-Headers: Content-Type\r\n");
        h.append("Access-Control-Allow-Private-Network: true\r\n");
        h.append("Access-Control-Max-Age: 600\r\n");
        h.append("Connection: close\r\n");
        if (extraHeader != null) h.append(extraHeader).append("\r\n");
        h.append("\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (body.length > 0) out.write(body);
        out.flush();
    }

    // ---------------------------------------------------------------- JSON (checking, not building trees)

    /** Just enough JSON: checks a text, finds a top-level member, quotes and unquotes strings. */
    static final class Json {
        static final int DEPTH = 256;

        static boolean valid(String s) {
            if (s == null) return false;
            int e = value(s, 0, 0);
            return e >= 0 && skip(s, e) == s.length();
        }

        static int skip(String s, int i) {
            int n = s.length();
            while (i < n) {
                char c = s.charAt(i);
                if (c != ' ' && c != '\t' && c != '\n' && c != '\r') break;
                i++;
            }
            return i;
        }

        /** The index just after the JSON value that starts at i (after blanks), or -1. */
        static int value(String s, int i, int depth) {
            int n = s.length();
            i = skip(s, i);
            if (i >= n) return -1;
            char c = s.charAt(i);
            if (c == '{' || c == '[') {
                if (depth >= DEPTH) return -1;
                char end = c == '{' ? '}' : ']';
                i = skip(s, i + 1);
                if (i < n && s.charAt(i) == end) return i + 1;
                while (true) {
                    if (c == '{') {
                        i = skip(s, i);
                        if (i >= n || s.charAt(i) != '"') return -1;
                        i = string(s, i);
                        if (i < 0) return -1;
                        i = skip(s, i);
                        if (i >= n || s.charAt(i) != ':') return -1;
                        i++;
                    }
                    i = value(s, i, depth + 1);
                    if (i < 0) return -1;
                    i = skip(s, i);
                    if (i >= n) return -1;
                    char d = s.charAt(i);
                    if (d == ',') { i++; continue; }
                    if (d == end) return i + 1;
                    return -1;
                }
            }
            if (c == '"') return string(s, i);
            if (c == 't') return word(s, i, "true");
            if (c == 'f') return word(s, i, "false");
            if (c == 'n') return word(s, i, "null");
            return number(s, i);
        }

        static int word(String s, int i, String w) { return s.startsWith(w, i) ? i + w.length() : -1; }

        static boolean hex(char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }

        static boolean digit(char c) { return c >= '0' && c <= '9'; }

        /** The index just after the string literal that starts (with its quote) at i, or -1. */
        static int string(String s, int i) {
            int n = s.length();
            i++;
            while (i < n) {
                char c = s.charAt(i);
                if (c == '"') return i + 1;
                if (c < 0x20) return -1;
                if (c == '\\') {
                    if (i + 1 >= n) return -1;
                    char e = s.charAt(i + 1);
                    if (e == 'u') {
                        if (i + 6 > n) return -1;
                        for (int k = i + 2; k < i + 6; k++) if (!hex(s.charAt(k))) return -1;
                        i += 6;
                    } else if ("\"\\/bfnrt".indexOf(e) >= 0) {
                        i += 2;
                    } else {
                        return -1;
                    }
                } else {
                    i++;
                }
            }
            return -1;
        }

        static int number(String s, int i) {
            int n = s.length();
            if (i < n && s.charAt(i) == '-') i++;
            if (i >= n) return -1;
            char c = s.charAt(i);
            if (c == '0') {
                i++;
            } else if (c >= '1' && c <= '9') {
                while (i < n && digit(s.charAt(i))) i++;
            } else {
                return -1;
            }
            if (i < n && s.charAt(i) == '.') {
                int st = ++i;
                while (i < n && digit(s.charAt(i))) i++;
                if (i == st) return -1;
            }
            if (i < n && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                i++;
                if (i < n && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                int st = i;
                while (i < n && digit(s.charAt(i))) i++;
                if (i == st) return -1;
            }
            return i;
        }

        /** The JSON text of a top-level member of an object, or null. */
        static String field(String s, String key) {
            if (s == null || key == null) return null;
            int n = s.length();
            int i = skip(s, 0);
            if (i >= n || s.charAt(i) != '{') return null;
            i = skip(s, i + 1);
            if (i < n && s.charAt(i) == '}') return null;
            while (true) {
                i = skip(s, i);
                if (i >= n || s.charAt(i) != '"') return null;
                int ke = string(s, i);
                if (ke < 0) return null;
                String k = text(s.substring(i, ke));
                i = skip(s, ke);
                if (i >= n || s.charAt(i) != ':') return null;
                int vs = skip(s, i + 1);
                int ve = value(s, vs, 1);
                if (ve < 0) return null;
                if (key.equals(k)) return s.substring(vs, ve);
                i = skip(s, ve);
                if (i >= n || s.charAt(i) != ',') return null;
                i++;
            }
        }

        /** The text of a JSON string literal, or null when raw is not one. */
        static String text(String raw) {
            if (raw == null || raw.length() < 2 || raw.charAt(0) != '"' || string(raw, 0) != raw.length()) return null;
            StringBuilder b = new StringBuilder(raw.length());
            int end = raw.length() - 1;
            for (int i = 1; i < end; i++) {
                char c = raw.charAt(i);
                if (c != '\\') { b.append(c); continue; }
                char e = raw.charAt(++i);
                switch (e) {
                    case 'b': b.append('\b'); break;
                    case 'f': b.append('\f'); break;
                    case 'n': b.append('\n'); break;
                    case 'r': b.append('\r'); break;
                    case 't': b.append('\t'); break;
                    case 'u':
                        b.append((char) Integer.parseInt(raw.substring(i + 1, i + 5), 16));
                        i += 4;
                        break;
                    default: b.append(e);
                }
            }
            return b.toString();
        }

        static String quote(String s) {
            if (s == null) return "null";
            StringBuilder b = new StringBuilder(s.length() + 8).append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"': b.append("\\\""); break;
                    case '\\': b.append("\\\\"); break;
                    case '\n': b.append("\\n"); break;
                    case '\r': b.append("\\r"); break;
                    case '\t': b.append("\\t"); break;
                    case '\b': b.append("\\b"); break;
                    case '\f': b.append("\\f"); break;
                    default:
                        if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                            String h = Integer.toHexString(c);
                            b.append("\\u");
                            for (int k = h.length(); k < 4; k++) b.append('0');
                            b.append(h);
                        } else {
                            b.append(c);
                        }
                }
            }
            return b.append('"').toString();
        }
    }
}
