package de.labland.bellatrix;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * How the robots find each other's games on the Wi-Fi, without typing addresses.
 *
 * A robot that hosts a game announces it: every second it broadcasts a small UDP packet on port
 * 8781 (to 255.255.255.255 and to the subnet's own broadcast address):
 *     {"app":"bellatrix","ip":"192.168.1.157","port":8780,"info":<the JSON the page gave>}
 * Every robot listens on 8781 and keeps what it heard (its own announcement too) for 4 seconds,
 * one entry per robot and room (the "room" member of info, when there is one). games() lists them:
 *     [{"ip":"192.168.1.157","port":8780,"self":true,"info":{...},"ageMs":123}, ...]
 *
 * Plain Java, so it can be tested on a desktop. On Android, Wi-Fi drivers often drop broadcasts
 * unless the app holds a WifiManager.MulticastLock: Net takes it.
 *
 * Build note: no inner, anonymous or private nested classes and no lambdas (see WebActivity), and
 * no class implementing a generic interface for a given type (Comparator<Heard>): javac adds a
 * bridge method whose parameters d8 cannot read either.
 */
final class NetDiscovery {

    static final int PORT = 8781;
    static final int HTTP_PORT = 8780;
    static final long EVERY_MS = 1000;
    static final long FORGET_MS = 4000;
    static final int MAX_PACKET = 8192;
    static final int MAX_HEARD = 256;
    static final long REFRESH_MS = 3000;

    /** A second way to learn this device's IPv4 when the interfaces tell nothing (Net: WifiManager). */
    interface IpHint { String ip(); }

    static volatile IpHint hint;

    static NetDiscovery main;   // guarded by NetDiscovery.class

    final int udpPort;
    final int httpPort;
    final String bindHost;                       // null: every interface
    final List<InetSocketAddress> fixedTargets;  // null: the broadcast addresses (tests: loopback)

    final Object lock = new Object();
    String info = "";              // guarded by lock: what we announce, "" for nothing
    long changes;                  // guarded by lock
    String selfKey;                // guarded by lock: the entry of our own announcement
    boolean listening;             // guarded by lock
    boolean sending;               // guarded by lock
    final Map<String, Heard> heard = new HashMap<String, Heard>();   // guarded by lock

    volatile Set<String> localIps = new HashSet<String>();
    volatile List<InetSocketAddress> broadcasts = new ArrayList<InetSocketAddress>();
    volatile long refreshed = Long.MIN_VALUE / 2;

    NetDiscovery(int udpPort, int httpPort, String bindHost, List<InetSocketAddress> fixedTargets) {
        this.udpPort = udpPort;
        this.httpPort = httpPort;
        this.bindHost = bindHost;
        this.fixedTargets = fixedTargets;
    }

    static NetDiscovery get() {
        synchronized (NetDiscovery.class) {
            if (main == null) main = new NetDiscovery(PORT, HTTP_PORT, null, null);
            return main;
        }
    }

    /** Starts listening for announcements (once). Never throws. */
    static void listen() {
        try { get().startListening(); } catch (Throwable t) { NetServer.log("discovery: " + t); }
    }

    /** Announces json (a JSON text) every second until called with "". False when it is too long. */
    static boolean announce(String json) {
        try {
            NetDiscovery d = get();
            d.startListening();
            return d.setInfo(json);
        } catch (Throwable t) {
            NetServer.log("announce: " + t);
            return false;
        }
    }

    /** The games heard in the last 4 seconds, as a JSON array text. Never throws. */
    static String games() {
        try {
            NetDiscovery d = get();
            d.startListening();
            return d.list();
        } catch (Throwable t) {
            NetServer.log("games: " + t);
            return "[]";
        }
    }

    // ---------------------------------------------------------------- announcing

    boolean setInfo(String json) {
        String j = json == null ? "" : json.trim();
        if (j.equals("null")) j = "";
        if (!j.isEmpty() && !NetServer.Json.valid(j)) j = NetServer.Json.quote(j);
        if (j.getBytes(StandardCharsets.UTF_8).length + 120 > MAX_PACKET) return false;
        synchronized (lock) {
            if (j.equals(info)) return true;
            info = j;
            changes++;
            if (selfKey != null) { heard.remove(selfKey); selfKey = null; }
            if (!j.isEmpty() && !sending) {
                sending = true;
                Thread t = new Thread(new Task(this, Task.SEND), "bellatrix-announce");
                t.setDaemon(true);
                t.start();
            }
            lock.notifyAll();
        }
        return true;
    }

    String packet(String ip, String json) {
        return "{\"app\":\"bellatrix\",\"ip\":" + NetServer.Json.quote(ip) + ",\"port\":" + httpPort + ",\"info\":" + json + "}";
    }

    void sendLoop() {
        DatagramSocket out = null;
        int failures = 0;
        while (true) {
            try {
                String cur;
                long seen;
                synchronized (lock) {
                    while (info.isEmpty()) lock.wait();
                    cur = info;
                    seen = changes;
                }
                String ip = localAddress();
                // Our own entry, even when the broadcast does not come back to us (no Wi-Fi).
                heardSelf(ip.isEmpty() ? "127.0.0.1" : ip, cur, seen);
                byte[] data = packet(ip, cur).getBytes(StandardCharsets.UTF_8);
                if (out == null) {
                    out = new DatagramSocket();
                    out.setBroadcast(true);
                }
                IOException last = null;
                int sent = 0;
                for (InetSocketAddress to : targets()) {
                    try {
                        out.send(new DatagramPacket(data, data.length, to));
                        sent++;
                    } catch (IOException e) {
                        last = e;
                    }
                }
                if (sent == 0 && last != null && (failures++ < 3 || failures % 60 == 0)) NetServer.log("announce: " + last);
                if (sent > 0) failures = 0;
                synchronized (lock) {
                    long until = System.nanoTime() + EVERY_MS * 1000000L;
                    while (changes == seen) {
                        long left = until - System.nanoTime();
                        if (left <= 0) break;
                        TimeUnit.NANOSECONDS.timedWait(lock, left);
                    }
                }
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                if (failures++ < 3 || failures % 60 == 0) NetServer.log("announce: " + t);
                if (out != null) out.close();
                out = null;
                try { Thread.sleep(EVERY_MS); } catch (InterruptedException e) { return; }
            }
        }
    }

    void heardSelf(String ip, String json, long seen) {
        String key = ip + "|" + roomKey(json);
        synchronized (lock) {
            if (changes != seen) return;   // changed meanwhile: the next round records it
            if (selfKey != null && !selfKey.equals(key)) heard.remove(selfKey);
            selfKey = key;
            put(key, ip, httpPort, json, true);
        }
    }

    List<InetSocketAddress> targets() {
        if (fixedTargets != null) return fixedTargets;
        refresh();
        return broadcasts;
    }

    // ---------------------------------------------------------------- listening

    void startListening() {
        synchronized (lock) {
            if (listening) return;
            listening = true;
        }
        Thread t = new Thread(new Task(this, Task.LISTEN), "bellatrix-discovery");
        t.setDaemon(true);
        t.start();
    }

    void listenLoop() {
        byte[] buf = new byte[65536];
        int failures = 0;
        while (true) {
            DatagramSocket s = null;
            try {
                s = new DatagramSocket(null);
                s.setReuseAddress(true);
                try { s.setBroadcast(true); } catch (Throwable ignored) { }
                s.bind(bindHost == null ? new InetSocketAddress(udpPort) : new InetSocketAddress(bindHost, udpPort));
                failures = 0;
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                while (true) {
                    p.setLength(buf.length);
                    s.receive(p);
                    try {
                        if (p.getLength() <= MAX_PACKET) heard(p.getAddress(), new String(buf, 0, p.getLength(), StandardCharsets.UTF_8));
                    } catch (Throwable ignored) {
                        // A strange packet: skip it.
                    }
                }
            } catch (Throwable t) {
                if (failures++ < 3 || failures % 30 == 0) NetServer.log("discovery listener: " + t);
            } finally {
                if (s != null) s.close();
            }
            try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
        }
    }

    /** One packet heard from the address from. */
    void heard(InetAddress from, String text) {
        String t = text.trim();
        if (!NetServer.Json.valid(t)) return;
        if (!"bellatrix".equals(NetServer.Json.text(NetServer.Json.field(t, "app")))) return;
        String json = NetServer.Json.field(t, "info");
        if (json == null) return;
        String said = NetServer.Json.text(NetServer.Json.field(t, "ip"));
        long port = NetServer.digits(NetServer.Json.field(t, "port"));
        if (port < 1 || port > 65535) port = HTTP_PORT;
        // The sender's address is the one that reaches it; what it says is only for loopback.
        String src = from == null ? "" : from.getHostAddress();
        boolean real = from instanceof Inet4Address && !from.isLoopbackAddress() && !from.isAnyLocalAddress();
        String ip = real ? src : (ipv4(said) ? said : src);
        boolean self = (from != null && from.isLoopbackAddress()) || isLocal(ip);
        synchronized (lock) {
            put(ip + "|" + roomKey(json), ip, (int) port, json, self);
        }
    }

    /** Caller holds lock. */
    void put(String key, String ip, int port, String json, boolean self) {
        long now = NetServer.nowMs();
        Heard h = heard.get(key);
        if (h == null) {
            if (heard.size() >= MAX_HEARD) purge(now);
            if (heard.size() >= MAX_HEARD) {
                String oldest = null;
                long at = Long.MAX_VALUE;
                for (Map.Entry<String, Heard> e : heard.entrySet()) {
                    if (e.getValue().at < at) { at = e.getValue().at; oldest = e.getKey(); }
                }
                if (oldest != null) heard.remove(oldest);
            }
            h = new Heard();
            heard.put(key, h);
        }
        h.ip = ip;
        h.port = port;
        h.info = json;
        h.self = self;
        h.at = now;
    }

    /** Caller holds lock. */
    void purge(long now) {
        Iterator<Heard> it = heard.values().iterator();
        while (it.hasNext()) {
            if (now - it.next().at > FORGET_MS) it.remove();
        }
    }

    String list() {
        long now = NetServer.nowMs();
        synchronized (lock) {
            purge(now);
            ArrayList<Heard> all = new ArrayList<Heard>(heard.values());
            // Insertion sort: a Comparator<Heard> class would get a bridge method, which d8 rejects.
            for (int i = 1; i < all.size(); i++) {
                Heard h = all.get(i);
                int j = i - 1;
                while (j >= 0 && before(h, all.get(j))) {
                    all.set(j + 1, all.get(j));
                    j--;
                }
                all.set(j + 1, h);
            }
            StringBuilder b = new StringBuilder(256);
            b.append('[');
            for (int i = 0; i < all.size(); i++) {
                Heard h = all.get(i);
                if (i > 0) b.append(',');
                b.append("{\"ip\":").append(NetServer.Json.quote(h.ip))
                        .append(",\"port\":").append(h.port)
                        .append(",\"self\":").append(h.self)
                        .append(",\"info\":").append(h.info)
                        .append(",\"ageMs\":").append(Math.max(0, now - h.at))
                        .append('}');
            }
            return b.append(']').toString();
        }
    }

    static String roomKey(String json) {
        String r = NetServer.Json.field(json, "room");
        return r == null ? "" : r;
    }

    static boolean ipv4(String s) {
        if (s == null) return false;
        String[] p = s.split("\\.", -1);
        if (p.length != 4) return false;
        for (String x : p) {
            long v = NetServer.digits(x);
            if (v < 0 || v > 255 || x.length() > 3) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------- this device's addresses

    boolean isLocal(String ip) {
        if (ip == null) return false;
        if (ip.startsWith("127.")) return true;
        refresh();
        return localIps.contains(ip);
    }

    /** Every few seconds: our own IPv4 addresses and the broadcast addresses to announce to. */
    void refresh() {
        long now = NetServer.nowMs();
        if (now - refreshed < REFRESH_MS) return;
        refreshed = now;
        Set<String> ips = new HashSet<String>();
        List<InetSocketAddress> to = new ArrayList<InetSocketAddress>();
        Set<String> seen = new HashSet<String>();
        to.add(new InetSocketAddress("255.255.255.255", udpPort));
        seen.add("255.255.255.255");
        try {
            Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces();
            while (e != null && e.hasMoreElements()) {
                NetworkInterface ni = e.nextElement();
                try {
                    if (!ni.isUp()) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        InetAddress a = ia.getAddress();
                        if (!(a instanceof Inet4Address)) continue;
                        ips.add(a.getHostAddress());
                        InetAddress bc = ia.getBroadcast();
                        if (bc instanceof Inet4Address && !ni.isLoopback() && seen.add(bc.getHostAddress())) {
                            to.add(new InetSocketAddress(bc, udpPort));
                        }
                    }
                } catch (Throwable ignored) { }
            }
        } catch (Throwable ignored) { }
        String hinted = hinted();
        if (!hinted.isEmpty()) ips.add(hinted);
        localIps = ips;
        broadcasts = to;
    }

    /** This device's Wi-Fi (or else LAN) IPv4, "" when there is none. Never throws. */
    static String localAddress() {
        String ip = interfaceAddress();
        return ip.isEmpty() ? hinted() : ip;
    }

    static String hinted() {
        IpHint h = hint;
        if (h == null) return "";
        try {
            String ip = h.ip();
            return ipv4(ip) ? ip : "";
        } catch (Throwable t) {
            return "";
        }
    }

    /** The best non-loopback IPv4 of the interfaces that are up: wlan first, then eth, then any. */
    static String interfaceAddress() {
        String best = "";
        int bestScore = Integer.MIN_VALUE;
        try {
            Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces();
            while (e != null && e.hasMoreElements()) {
                NetworkInterface ni = e.nextElement();
                try {
                    if (!ni.isUp() || ni.isLoopback()) continue;
                    String n = ni.getName() == null ? "" : ni.getName().toLowerCase(java.util.Locale.ROOT);
                    String shown = ni.getDisplayName() == null ? "" : ni.getDisplayName().toLowerCase(java.util.Locale.ROOT);
                    int score = 0;
                    // Android: wlan0, eth0. Desktop JDKs on Windows: wireless_N, ethernet_N.
                    if (n.startsWith("wlan") || n.startsWith("wireless") || n.startsWith("wifi")) score = 100;
                    else if (n.startsWith("eth")) score = 50;
                    else if (n.startsWith("p2p") || n.startsWith("rmnet") || n.startsWith("tun") || n.startsWith("dummy")
                            || n.startsWith("ccmni") || n.startsWith("rndis") || n.startsWith("v4-")) score = -50;
                    if (ni.isVirtual() || ni.isPointToPoint() || shown.contains("virtual") || shown.contains("host-only")) score -= 20;
                    Enumeration<InetAddress> as = ni.getInetAddresses();
                    while (as.hasMoreElements()) {
                        InetAddress a = as.nextElement();
                        if (!(a instanceof Inet4Address) || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress()) continue;
                        int s = score + (a.isSiteLocalAddress() ? 10 : 0);
                        if (s > bestScore) { bestScore = s; best = a.getHostAddress(); }
                    }
                } catch (Throwable ignored) { }
            }
        } catch (Throwable ignored) { }
        return best;
    }

    // ---------------------------------------------------------------- small helpers

    static final class Heard {
        String ip;
        int port;
        String info;
        boolean self;
        long at;
    }

    /** The order of games(): our own games first, then by address and room. */
    static boolean before(Heard a, Heard b) {
        if (a.self != b.self) return a.self;
        int c = a.ip.compareTo(b.ip);
        return c != 0 ? c < 0 : roomKey(a.info).compareTo(roomKey(b.info)) < 0;
    }

    static final class Task implements Runnable {
        static final int LISTEN = 1;
        static final int SEND = 2;
        final NetDiscovery d;
        final int what;

        Task(NetDiscovery d, int what) { this.d = d; this.what = what; }

        @Override
        public void run() {
            if (what == LISTEN) d.listenLoop();
            else d.sendLoop();
        }
    }
}
