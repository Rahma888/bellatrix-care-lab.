package de.labland.bellatrix;

import de.labland.vergil.navigation.PathSimplifier;
import de.labland.vergil.navigation.PgmMap;
import de.labland.vergil.navigation.RoutePlanner;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The route drive (android/src/de/labland/bellatrix/RouteDrive.java) on the PC, with the real Vergil planner, against a
 * simulated robot and bridge on a virtual clock: no Android, no robot, no network, nothing written. Run by
 * tests/route-drive.test.mjs; by hand (from the repo root, after compiling it with RouteDrive.java):
 *   java -cp <out>;android/vendor/vergil-navigation.jar;android/vendor/kotlin-stdlib-2.0.20.jar de.labland.bellatrix.RouteSim <office.pgm>
 *
 * The simulated SDK does what PLAN-NAV.md says the real one does: -1 to any new goal while a navigation runs, result 3
 * 30 ms after stopNavigation, result 1 when within the tolerance (after turning onto the goal heading), -109 at its own
 * time limit. The robot drives straight at 0.7 m/s after turning on the spot at 90 degrees a second. A "box" stops the
 * robot BOX_STOP_M before it when the leg runs through the box's footprint (the SDK cannot get past it); legs that miss
 * the footprint go by (the SDK's own avoidance).
 *
 * Prints one line per scenario, "ok - name" or "not ok - name: why", and exits 1 when one failed.
 * Same build rules as the app: static nested classes only, no lambdas, no inner or anonymous classes.
 */
final class RouteSim {

    static final long STEP_MS = 10L;                 // the simulation's tick
    static final double SPEED = 0.7;                 // m/s, the SDK's default
    static final double TURN_RAD_S = Math.PI / 2;    // turning on the spot
    static final double BOX_STOP_M = 0.9;            // the robot stops this far before a box in its way
    static final long LIMIT_MS = 5 * 60 * 1000L;     // RobotBridge.GLOBAL_LIMIT_MS
    static final long RESUME_MS = 1500L;             // RobotBridge.RESUME_DELAY_MS
    static final long RUNAWAY_MS = 30 * 60 * 1000L;  // a drive that is still running after this is a bug

    static final int EV_RESULT = 1, EV_ERROR = 2, EV_STATUS = 3, EV_CANCEL = 4;

    static final class Event {
        final long at; final int kind; final RouteDrive.Start s; final int code;
        Event(long at, int kind, RouteDrive.Start s, int code) { this.at = at; this.kind = kind; this.s = s; this.code = code; }
    }

    /** The simulated robot, SDK and bridge state (what RobotBridge.RouteHost gives a drive on the robot). */
    static final class Sim implements RouteDrive.Host {
        long t;
        int token = 1;
        String state = "moving", reason = "", mode = "route", codeText = "", placeText = null;
        int attempt, leg, legs, code;
        boolean suspended, estop, poseMissing;
        int suspensions;
        double x, y, th;
        byte[] map;
        // the running navigation
        boolean navOn, wiggle, boxed;
        RouteDrive.Start navS;
        double gx, gy, gth, tol, sx, sy;
        long navDeadline, standUntil, arriveAt = -1, wiggleAt;
        int wiggleSign = 1;
        final List<Event> events = new ArrayList<Event>();
        // what happened
        final List<String> reasons = new ArrayList<String>(), logs = new ArrayList<String>();
        final List<double[]> starts = new ArrayList<double[]>();      // t, x, y, theta, accepted (1/0)
        final List<double[]> handovers = new ArrayList<double[]>();   // moved, leg length (both from the leg's start pose)
        final List<Long> stopTimes = new ArrayList<Long>();
        final List<Long> codeTimes = new ArrayList<Long>();
        int results1, accepted;
        long endAt = -1;
        // the scenario
        boolean busyAlways, heldStill;
        int answer113At = -1, timeoutAt = -1, noPathAt = -1, cancelAt = -1, avoidAt = -1;
        double boxX = Double.NaN, boxY = Double.NaN, boxFoot = 0.5;
        long stopAt = -1, estopAt = -1, suspendAt = -1, suspendFlagAt = -1, recoverAt = -1;

        Sim(byte[] map, double x, double y, double th) { this.map = map; this.x = x; this.y = y; this.th = th; }

        void at(long when, int kind, RouteDrive.Start s, int c) { events.add(new Event(when, kind, s, c)); }

        void navOff() { navOn = false; wiggle = false; arriveAt = -1; }

        void bridgeEnd(String st, String r) { token++; state = st; reason = r; endAt = t; }

        void step() {
            t += STEP_MS;
            if (t > RUNAWAY_MS) throw new IllegalStateException("the drive ran " + (RUNAWAY_MS / 60000) + " simulated minutes");
            if (stopAt >= 0 && t >= stopAt) {          // the team presses STOP (RobotBridge.stop)
                stopAt = -1;
                if ("moving".equals(state)) { bridgeEnd("idle", "stopped"); stop(); }
            }
            if (estopAt >= 0 && t >= estopAt) {        // the emergency stop (RobotBridge.onEstop)
                estopAt = -1; estop = true;
                if ("moving".equals(state)) { bridgeEnd("failed", "emergency"); stop(); }
            }
            if (suspendAt >= 0 && t >= suspendAt) {    // RobotOS takes over: its stop answers first, onSuspend 100 ms later
                suspendAt = -1;
                if (navOn) { RouteDrive.Start s = navS; navOff(); at(t, EV_RESULT, s, 3); }
                suspendFlagAt = t + 100;
            }
            if (suspendFlagAt >= 0 && t >= suspendFlagAt) {
                suspendFlagAt = -1; suspended = true; suspensions++;
                if ("moving".equals(state)) reason = "suspended";
                reasons.add("suspended");
            }
            if (recoverAt >= 0 && t >= recoverAt) {    // RobotBridge.onRecovery
                recoverAt = -1; suspended = false;
                if ("moving".equals(state)) reason = "waiting";
            }
            for (int i = 0; i < events.size(); i++) {
                Event e = events.get(i);
                if (e.at > t) continue;
                events.remove(i--);
                if (e.kind == EV_RESULT) { if (e.code == 1) results1++; e.s.onResult(e.code, "sim"); }
                else if (e.kind == EV_ERROR) e.s.onError(e.code, "sim " + e.code);
                else if (e.kind == EV_STATUS) e.s.onStatusUpdate(e.code, "sim");
                else if (e.kind == EV_CANCEL) { if (navOn && navS == e.s) { navOff(); e.s.onResult(3, "sim: stopped from outside"); } }
            }
            if (!navOn) return;
            if (t >= navDeadline) { RouteDrive.Start s = navS; navOff(); at(t, EV_ERROR, s, -109); return; }
            if (arriveAt >= 0) { if (t >= arriveAt) { RouteDrive.Start s = navS; navOff(); at(t, EV_RESULT, s, 1); } return; }
            if (t < standUntil || heldStill) return;
            double step = SPEED * STEP_MS / 1000.0;
            if (wiggle) {                              // swerving to and fro, getting nowhere
                if (t - wiggleAt >= 1000) { wiggleAt = t; wiggleSign = -wiggleSign; }
                x += step * wiggleSign * -Math.sin(th);
                y += step * wiggleSign * Math.cos(th);
                return;
            }
            double dx = gx - x, dy = gy - y, d = Math.hypot(dx, dy);
            if (d <= tol) { arriveAt = t + turnMs(gth) + 200; return; }
            double nx = x + dx / d * Math.min(step, d), ny = y + dy / d * Math.min(step, d);
            if (boxed && Math.hypot(nx - boxX, ny - boxY) < BOX_STOP_M) return;   // cannot get past the box
            th = Math.atan2(dy, dx);
            x = nx; y = ny;
        }

        long turnMs(double to) {
            double a = Math.abs(Math.atan2(Math.sin(to - th), Math.cos(to - th)));
            return Math.round(a / TURN_RAD_S * 1000);
        }

        /** The leg from here to (ax, ay) runs into the box's footprint (through it or ending in it), ahead of the robot. */
        boolean crossesBox(double ax, double ay) {
            if (Double.isNaN(boxX)) return false;
            double dx = ax - x, dy = ay - y, len = Math.hypot(dx, dy);
            if (len <= 0) return false;
            double u = ((boxX - x) * dx + (boxY - y) * dy) / (len * len);
            if (u <= 0) return false;
            u = Math.min(u, 1.0);
            double px = x + u * dx, py = y + u * dy;
            return Math.hypot(boxX - px, boxY - py) < boxFoot;
        }

        void advance(long ms, RouteDrive.Start s) {
            long end = t + ms;
            while (t < end) {
                step();
                if (s != null && s.outcome() != 0) return;
            }
        }

        // ---- RouteDrive.Host
        @Override public long now() { return t; }
        @Override public void sleep(long ms) { advance(ms, null); }
        @Override public void await(RouteDrive.Start s, long ms) { advance(ms, s); }
        @Override public boolean alive(int tok) { return tok == token && "moving".equals(state) && "route".equals(mode); }
        @Override public boolean moving() { return "moving".equals(state); }
        @Override public boolean suspended() { return suspended; }
        @Override public int suspensions() { return suspensions; }
        @Override public boolean estop() { return estop; }
        @Override public double[] pose() { return poseMissing ? null : new double[] {x, y, th}; }
        @Override public byte[] map() { return map; }

        @Override
        public String start(RouteDrive.Start s, double ax, double ay, double atheta, double toleranceM, long timeoutMs) {
            if (busyAlways || navOn) {
                if (navOn && navS != null) handovers.add(new double[] {Math.hypot(x - sx, y - sy), Math.hypot(gx - sx, gy - sy)});
                starts.add(new double[] {t, ax, ay, atheta, 0});
                at(t + 5, EV_ERROR, s, -1);            // the SDK never takes a new goal while a navigation runs
                return null;
            }
            starts.add(new double[] {t, ax, ay, atheta, 1});
            int n = ++accepted;
            if (n == answer113At) { at(t + 5, EV_ERROR, s, -113); return null; }
            navOn = true; navS = s; gx = ax; gy = ay; gth = atheta; tol = toleranceM; sx = x; sy = y;
            navDeadline = t + (n == timeoutAt ? 2000 : timeoutMs);
            standUntil = t + turnMs(Math.atan2(ay - y, ax - x));
            boxed = crossesBox(ax, ay);
            wiggle = n == avoidAt;
            wiggleAt = t;
            if (wiggle) at(t + 500, EV_STATUS, s, 1018);
            if (n == noPathAt) at(t + 1000, EV_STATUS, s, 1025);
            if (n == cancelAt) at(t + 2000, EV_CANCEL, s, 3);
            at(t + 20, EV_STATUS, s, 1014);
            return null;
        }

        @Override
        public void stop() {
            stopTimes.add(t);
            if (navOn) { RouteDrive.Start s = navS; navOff(); at(t + 30, EV_RESULT, s, 3); }
        }

        @Override public void leg(int tok, int l, int n) { if (alive(tok)) { leg = l; legs = n; } }
        @Override public void reason(int tok, String r) {
            if (alive(tok) && !suspended && r != null && !r.equals(reason)) { reason = r; reasons.add(r); }
        }
        @Override public void attempt(int tok, int a) { if (alive(tok)) attempt = a; }
        @Override public void code(int tok, int c, String text) { if (alive(tok)) { code = c; codeText = text; codeTimes.add(t); } }
        @Override public boolean end(int tok, String st, String r) { if (!alive(tok)) return false; bridgeEnd(st, r); return true; }
        @Override public void toPlace(int tok, String text) { if (alive(tok)) { mode = "place"; codeText = text; placeText = text; } }
        @Override public void log(String line) { logs.add("[" + t + "] " + line); }

        void drive(double goalX, double goalY, double goalTheta, long limitMs) {
            new RouteDrive(this, token, "Zimmer 12", goalX, goalY, goalTheta, 0L, limitMs, RESUME_MS).run();
        }

        int startsAfter(long when) { int n = 0; for (double[] s : starts) if (s[0] > when) n++; return n; }
        int startsBetween(long a, long b) { int n = 0; for (double[] s : starts) if (s[0] >= a && s[0] <= b) n++; return n; }
        boolean logHas(String part) { for (String l : logs) if (l.contains(part)) return true; return false; }
        int logCount(String part) { int n = 0; for (String l : logs) if (l.contains(part)) n++; return n; }
    }

    /* ---------------------------------------------------------------- the maps */

    /** A 12 x 6 m hall at 5 cm, origin (0, 0), with a wall at x = 6 m from the floor up to y = 4 m: the way from the
     *  left half to the right half goes through the 1.9 m gap at the top (1.2 m once the planner grows the walls). */
    static byte[] hallMap() {
        int w = 240, h = 120;
        byte[] px = new byte[w * h];
        for (int gy = 0; gy < h; gy++) {
            for (int gx = 0; gx < w; gx++) {
                boolean wall = gx < 2 || gy < 2 || gx >= w - 2 || gy >= h - 2 || (gx >= 118 && gx <= 121 && gy >= 40);
                px[gy * w + gx] = (byte) (wall ? 0 : 255);
            }
        }
        return pgm(w, h, 0.05, 0.0f, 0.0f, px);
    }

    static byte[] pgm(int w, int h, double res, float ox, float oy, byte[] px) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] head = ("P5\n" + w + " " + h + "\n255\n").getBytes();
        out.write(head, 0, head.length);
        out.write(px, 0, px.length);
        long r = Double.doubleToLongBits(res);
        for (int i = 0; i < 8; i++) out.write((int) (r >>> (8 * i)) & 0xFF);
        int bx = Float.floatToIntBits(ox), by = Float.floatToIntBits(oy);
        for (int i = 0; i < 4; i++) out.write((bx >>> (8 * i)) & 0xFF);
        for (int i = 0; i < 4; i++) out.write((by >>> (8 * i)) & 0xFF);
        return out.toByteArray();
    }

    static byte[] readAll(File f) throws Exception {
        InputStream in = new FileInputStream(f);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    static List<PathSimplifier.Waypoint> plan(byte[] map, double sx, double sy, double gx, double gy) {
        RoutePlanner p = new RoutePlanner(PgmMap.INSTANCE.parse(map, Double.valueOf(RouteDrive.INFLATE_M)));
        RoutePlanner.Route r = p.plan(sx, sy, gx, gy, Double.valueOf(RouteDrive.MAX_LEG_M));
        return r == null ? null : r.getWaypoints();
    }

    /* ---------------------------------------------------------------- the scenarios */

    static int failed, run;
    static boolean verbose;

    static void report(String name, Sim s, String problem) {
        run++;
        String facts = "state " + s.state + (s.reason.isEmpty() ? "" : " \"" + s.reason + "\"") + ", attempt " + s.attempt + ", leg "
                + s.leg + "/" + s.legs + ", starts " + s.starts.size() + ", stops " + s.stopTimes.size() + ", "
                + String.format(Locale.ROOT, "%.1f", (s.endAt >= 0 ? s.endAt : s.t) / 1000.0) + " s";
        if (problem == null) {
            System.out.println("ok - " + name + " (" + facts + ")");
        } else {
            failed++;
            System.out.println("not ok - " + name + ": " + problem + " (" + facts + ")");
        }
        if (problem != null || verbose) for (String l : s.logs) System.out.println("#   " + l);
    }

    /** The first two numbers of "3.87, 2.67) radius ...". */
    static double[] numbers(String text) {
        try {
            String[] parts = text.split("[,)]");
            return new double[] {Double.parseDouble(parts[0].trim()), Double.parseDouble(parts[1].trim())};
        } catch (RuntimeException e) {
            return null;
        }
    }

    static String handoverProblem(Sim s) {
        for (double[] h : s.handovers) {
            if (h[0] + 1e-6 < h[1] * RouteDrive.HANDOVER_LEG_SHARE) {
                return String.format(Locale.ROOT, "handed over after %.2f m of a %.2f m leg (less than half)", h[0], h[1]);
            }
        }
        return null;
    }

    static String arrivedProblem(Sim s, double gx, double gy) {
        if (!"arrived".equals(s.state)) return "not arrived";
        if (!s.reason.isEmpty()) return "reason should be empty";
        double d = Math.hypot(s.x - gx, s.y - gy);
        if (d > RouteDrive.TOLERANCE_M + 0.01) return String.format(Locale.ROOT, "%.2f m from the place", d);
        if (s.leg != s.legs || s.legs < 1) return "leg " + s.leg + " of " + s.legs + " at the end";
        if (s.startsAfter(s.endAt) > 0) return "a start after the end";
        return handoverProblem(s);
    }

    public static void main(String[] args) throws Exception {
        verbose = System.getenv("ROUTE_SIM_VERBOSE") != null;
        byte[] hall = hallMap();
        double sx = 2.0, sy = 1.0, gx = 10.0, gy = 1.0, gth = Math.PI / 2;

        { // 1. through the door: every point, rolling on (handover), the place itself at the end with its heading
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            List<PathSimplifier.Waypoint> pts = plan(hall, sx, sy, gx, gy);
            if (p == null && pts == null) p = "the planner found no route";
            if (p == null && s.legs != pts.size() - 1) p = "legs " + s.legs + ", the planner has " + (pts.size() - 1);
            if (p == null && s.attempt != 1) p = "attempt " + s.attempt;
            if (p == null) {   // the starts in order: each point with the heading of the point BEFORE it, the place last
                List<double[]> acc = new ArrayList<double[]>();
                double[] lastT = null;
                for (double[] st : s.starts) if (lastT == null || st[1] != lastT[1] || st[2] != lastT[2]) { acc.add(st); lastT = st; }
                if (acc.size() != pts.size() - 1) p = acc.size() + " distinct targets for " + (pts.size() - 1) + " legs";
                for (int i = 1; p == null && i < pts.size(); i++) {
                    double[] st = acc.get(i - 1);
                    boolean last = i == pts.size() - 1;
                    double ex = last ? gx : pts.get(i).getX(), ey = last ? gy : pts.get(i).getY();
                    double et = last ? gth : pts.get(i - 1).getHeading();
                    if (Math.abs(st[1] - ex) > 1e-9 || Math.abs(st[2] - ey) > 1e-9 || Math.abs(st[3] - et) > 1e-9) {
                        p = String.format(Locale.ROOT, "leg %d went to (%.2f, %.2f, %.2f), expected (%.2f, %.2f, %.2f)", i, st[1], st[2], st[3], ex, ey, et);
                    }
                }
            }
            if (p == null && s.handovers.isEmpty()) p = "no handover: the robot stopped at every point";
            if (p == null && s.reasons.contains("replanning")) p = "replanned on a free way";
            report("through the door: " + (s.legs) + " legs, rolling on between points, the place and its heading at the end", s, p);
        }

        { // 2. a box in the hall: standstill, the spot blocked, a way around, arrived. The simulated robot drives
          //    straight and cuts the corner after a handover (the real SDK plans its own way and avoids), so it may
          //    need more than one replan here.
            List<PathSimplifier.Waypoint> pts = plan(hall, sx, sy, gx, gy);
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.boxX = (pts.get(0).getX() + pts.get(1).getX()) / 2; s.boxY = (pts.get(0).getY() + pts.get(1).getY()) / 2;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && (s.attempt < 2 || s.attempt > RouteDrive.MAX_REPLANS + 1)) p = "attempt " + s.attempt + ", expected 2 to 7";
            if (p == null && !s.reasons.contains("replanning")) p = "reason \"replanning\" never shown";
            if (p == null && !s.logHas("standstill")) p = "not ended by the standstill watch";
            if (p == null && s.logCount("block (") != s.attempt - 1) p = s.logCount("block (") + " blocks for attempt " + s.attempt;
            if (p == null) {   // the first block sits on the box: the robot stayed on the route (BlockSpot: from the route, 0.9 m clear of the robot, in 5 cm steps)
                String first = null;
                for (String l : s.logs) if (l.contains("block (")) { first = l; break; }
                double[] at = first == null ? null : numbers(first.substring(first.indexOf("block (") + 7));
                if (first != null && !first.contains("from route at")) p = "first block not laid from the route: " + first;
                else if (at == null || Math.hypot(at[0] - s.boxX, at[1] - s.boxY) > 0.1) {
                    p = "first block not on the box: " + first + String.format(Locale.ROOT, ", box at (%.3f, %.3f)", s.boxX, s.boxY);
                }
            }
            report("a box in the hall: standstill, block 0.9 m ahead, replanning, arrives another way (" + (s.attempt - 1) + " replan(s))", s, p);
        }

        { // 3. a cart in the door: the blocks pile up, are dropped, and after 6 replans "blocked". With PLAN-NAV-UPDATE-1
          //    the blocks lie on the cart, so the simulated robot (a point that only stops within boxFoot of the cart)
          //    may also find the gap beside it and arrive: both end within the limits.
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.boxX = 6.0; s.boxY = 4.6; s.boxFoot = 0.7;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = null;
            if ("arrived".equals(s.state)) p = arrivedProblem(s, gx, gy);
            else if (!"failed".equals(s.state)) p = "neither failed nor arrived";
            else if (!"blocked".equals(s.reason) && !"no-route".equals(s.reason)) p = "reason \"" + s.reason + "\"";
            else if ("blocked".equals(s.reason) && s.attempt != RouteDrive.MAX_REPLANS + 1) p = "attempt " + s.attempt;
            else if (s.attempt > RouteDrive.MAX_REPLANS + 1) p = "more than " + RouteDrive.MAX_REPLANS + " replans";
            else if (!s.logHas("leave no route")) p = "the blocks were never dropped";
            else if (s.startsAfter(s.endAt) > 0) p = "a start after the end";
            else if (s.endAt > LIMIT_MS + RouteDrive.LEG_MAX_MS + RouteDrive.TIMEOUT_GRACE_MS) p = "longer than the drive limit";
            if (p == null && "arrived".equals(s.state) && s.endAt > LIMIT_MS + RouteDrive.LEG_MAX_MS + RouteDrive.TIMEOUT_GRACE_MS) p = "longer than the drive limit";
            report("a cart in the door: blocks dropped when they leave no route, ends \"" + s.reason + "\" within the limits", s, p);
        }

        { // 4. the drive limit: a robot that cannot move ends "blocked" at the first plan after the limit
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.heldStill = true;
            long limit = 20000L;
            s.drive(gx, gy, gth, limit);
            String p = null;
            if (!"failed".equals(s.state) || !"blocked".equals(s.reason)) p = "not failed \"blocked\"";
            else if (s.endAt < limit || s.endAt > limit + RouteDrive.LEG_MAX_MS + RouteDrive.TIMEOUT_GRACE_MS) p = "ended at " + s.endAt + " ms";
            else if (s.attempt >= RouteDrive.MAX_REPLANS + 1) p = "ran out of replans instead";
            report("drive limit (20 s here, 5 min on the robot): \"blocked\" at the next plan", s, p);
        }

        { // 5. 1025 on a leg: stopNavigation at once, blocked, replanning, arrived
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.noPathAt = 1;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && s.attempt != 2) p = "attempt " + s.attempt;
            if (p == null && s.codeTimes.isEmpty()) p = "code 1025 not shown";
            if (p == null) {
                long c = s.codeTimes.get(0), first = -1;
                for (long st : s.stopTimes) if (st >= c) { first = st; break; }
                if (first < 0 || first - c > RouteDrive.WATCH_MS + STEP_MS) p = "no stopNavigation within one look after the 1025";
            }
            report("status 1025: stopNavigation, blocked, replanning, arrives", s, p);
        }

        { // 6. -109, the SDK's own time limit: blocked (not failed), replanning, arrived
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.timeoutAt = 1;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && s.attempt != 2) p = "attempt " + s.attempt;
            report("error -109: a blockage, not a failure: replanning, arrives", s, p);
        }

        { // 7. -113 at the first start: already there counts as arrived, the drive goes on
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.answer113At = 1;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && s.attempt != 1) p = "attempt " + s.attempt;
            report("error -113: already at the point = arrived, next leg", s, p);
        }

        { // 8. a navigation that stays busy: 3 starts with stopNavigation, 150 ms, 400 ms; then failed, code -1
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.busyAlways = true;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = null;
            if (!"failed".equals(s.state) || !s.reason.isEmpty()) p = "not failed with an empty reason";
            else if (s.starts.size() != RouteDrive.LEG_STARTS) p = s.starts.size() + " starts";
            else if (s.code != -1) p = "code " + s.code;
            else {
                long g1 = (long) (s.starts.get(1)[0] - s.stopTimes.get(0)), g2 = (long) (s.starts.get(2)[0] - s.stopTimes.get(1));
                if (g1 < 150 || g1 > 150 + STEP_MS || g2 < 400 || g2 > 400 + STEP_MS) p = "waits " + g1 + " / " + g2 + " ms after stopNavigation";
            }
            report("busy 3 times: stopNavigation + 150 ms, + 400 ms, then failed (code -1)", s, p);
        }

        { // 9. result 3 nobody here asked for: failed "stopped"
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.cancelAt = 1;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = null;
            if (!"failed".equals(s.state) || !"stopped".equals(s.reason)) p = "not failed \"stopped\"";
            else if (s.startsAfter(s.endAt) > 0) p = "a start after the end";
            report("result 3 from outside: failed \"stopped\"", s, p);
        }

        { // 10. endless avoidance: 1018 without 1019 for 12 s, blocked, replanning, arrived
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.avoidAt = 1;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && !s.reasons.contains("avoiding")) p = "reason \"avoiding\" never shown";
            if (p == null && !s.logHas("avoiding for 12 s")) p = "not ended by the avoidance watch";
            if (p == null && s.attempt != 2) p = "attempt " + s.attempt;
            report("avoiding for 12 s: blocked, replanning, arrives", s, p);
        }

        { // 11. suspend and recovery: the interrupted leg does not count, 1.5 s after the recovery a new plan (not a replan)
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.suspendAt = 3000; s.recoverAt = 9000;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = arrivedProblem(s, gx, gy);
            if (p == null && s.attempt != 1) p = "attempt " + s.attempt + " (a suspension is not a replan)";
            if (p == null && s.startsBetween(3000, 9000 + RESUME_MS - 1) > 0) p = "a start while suspended or before the 1.5 s";
            if (p == null && s.startsAfter(9000 + RESUME_MS - 1) == 0) p = "no start after the recovery";
            report("suspend + recovery: answers of the interrupted leg ignored, planned again 1.5 s after onRecovery", s, p);
        }

        { // 12. STOP during a drive: nothing more goes to the robot
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.stopAt = 4000;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = null;
            if (!"idle".equals(s.state) || !"stopped".equals(s.reason)) p = "not idle \"stopped\"";
            else if (s.startsAfter(4000) > 0) p = s.startsAfter(4000) + " start(s) after STOP";
            else if (s.t > 4000 + 2 * RouteDrive.WATCH_MS + STEP_MS) p = "the drive went on " + (s.t - 4000) + " ms after STOP";
            report("STOP: the drive ends at once, no start after it", s, p);
        }

        { // 13. the emergency stop during a drive
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.estopAt = 4000;
            s.drive(gx, gy, gth, LIMIT_MS);
            String p = null;
            if (!"failed".equals(s.state) || !"emergency".equals(s.reason)) p = "not failed \"emergency\"";
            else if (s.startsAfter(4000) > 0) p = "a start after the emergency stop";
            report("emergency stop: the drive ends at once, no start after it", s, p);
        }

        { // 14. no map, a broken map, no pose: this one drive in mode place, the text for the panel
            String p = null;
            Sim a = new Sim(null, sx, sy, 0.0);
            a.drive(gx, gy, gth, LIMIT_MS);
            if (!"route: no map, robot navigation".equals(a.placeText) || !"moving".equals(a.state) || !a.starts.isEmpty()) p = "no map: " + a.placeText;
            Sim b = new Sim("P5\n10 10\n255\nbroken".getBytes(), sx, sy, 0.0);
            b.drive(gx, gy, gth, LIMIT_MS);
            if (p == null && (!"route: no map, robot navigation".equals(b.placeText) || !b.starts.isEmpty())) p = "broken map: " + b.placeText;
            Sim c = new Sim(hall, sx, sy, 0.0);
            c.poseMissing = true;
            c.drive(gx, gy, gth, LIMIT_MS);
            if (p == null && (!"route: no pose, robot navigation".equals(c.placeText) || !c.starts.isEmpty())) p = "no pose: " + c.placeText;
            report("no map / broken map / no pose: mode place for this drive, \"route: no map, robot navigation\"", a, p);
        }

        { // 15. no way on the map, and already there
            Sim s = new Sim(hall, sx, sy, 0.0);
            s.drive(40.0, 40.0, 0.0, LIMIT_MS);
            String p = null;
            if (!"failed".equals(s.state) || !"no-route".equals(s.reason)) p = "outside the map: not failed \"no-route\"";
            else if (!s.starts.isEmpty() || !s.stopTimes.isEmpty()) p = "the robot was sent somewhere";
            Sim h = new Sim(hall, sx, sy, 0.0);
            h.drive(sx, sy, 0.0, LIMIT_MS);
            if (p == null && (!"arrived".equals(h.state) || !h.starts.isEmpty())) p = "already there: " + h.state + ", " + h.starts.size() + " starts";
            report("no route: failed \"no-route\" without moving; already there: arrived without moving", s, p);
        }

        if (args.length > 0 && new File(args[0]).isFile()) { // 16. Vergil's office map: couch to kitchen (NavProbe)
            byte[] office = readAll(new File(args[0]));
            double ox = -3.685, oy = 1.775, kx = 28.620, ky = -1.269;
            Sim s = new Sim(office, ox, oy, 0.0);
            s.drive(kx, ky, 0.0, LIMIT_MS);
            String p = arrivedProblem(s, kx, ky);
            if (p == null && s.attempt != 1) p = "attempt " + s.attempt;
            if (p == null && s.legs < 10) p = "only " + s.legs + " legs";
            report("Vergil's office map, couch to kitchen: " + s.legs + " legs, arrived", s, p);
        }

        System.out.println("# " + run + " scenarios, " + failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}
