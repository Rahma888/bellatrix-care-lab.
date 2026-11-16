package de.labland.bellatrix;

import de.labland.vergil.navigation.OccupancyGrid;
import de.labland.vergil.navigation.PathSimplifier;
import de.labland.vergil.navigation.PgmMap;
import de.labland.vergil.navigation.RoutePlanner;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * One drive in mode "route" (PLAN-NAV.md): Bellatrix plans the way on the robot's own map with LabLand's
 * Vergil planner (android/vendor/vergil-navigation.jar) and drives it waypoint by waypoint.
 *
 * Port of Vergil (repo vergil, branch master, commit e371cab): VergilNavigator.driveLoop, NovaDriver.driveTo,
 * startAndAwait and startLegWatcher. Left out on purpose: the rotating scan, the step aside and the retreat
 * (PLAN-NAV.md, "Deviation"). Instead, when our own blocks leave no route, they are all dropped and the plan
 * is made once more.
 *
 * Threading: one drive is one dedicated thread running {@link #run()}, a plain sequential loop (plan, leg,
 * leg, block, plan again). The SDK listeners only write into the fields of their {@link Start}; the loop
 * looks at them every WATCH_MS (and at once when an answer comes). Before every SDK call and every wait the
 * loop asks the host whether this drive is still the robot's current one, so STOP, the emergency stop, a
 * lost connection and a newer drive end it the way they end a drive today.
 *
 * No Android in this file: the robot is behind {@link Host}. On the robot that is RobotBridge.RouteHost, on
 * the PC the simulation in tests/route-sim (tests/route-drive.test.mjs). Build rules of this repo: javac
 * --release 8, static nested classes only, no lambdas, no inner or anonymous classes.
 */
final class RouteDrive implements Runnable {

    /* ---------------------------------------------------------------- the numbers (PLAN-NAV.md, "The numbers")
     * All of them from Vergil, measured on the robots. */

    /** Obstacles grow by this: the planner sees the robot as a point, grown obstacles turn "the point fits" into "the robot fits". */
    static final double INFLATE_M = 0.32;
    /** Longest leg: longer straights get intermediate points. */
    static final double MAX_LEG_M = 10.0;
    /** How close to a point counts as reached (startNavigation's tolerance). */
    static final double TOLERANCE_M = 0.3;
    /** Hand the next point over this far before a point, still rolling: every navigation ends by braking and turning. */
    static final double HANDOVER_M = 1.2;
    /** At most this share of the leg: without the cap the short legs around an obstacle counted as reached unmoved (3 points in 855 ms, 13 August). */
    static final double HANDOVER_LEG_SHARE = 0.5;
    /** Leg time limit, base: starting, the turn on the spot and braking (a half turn alone takes 4 s). */
    static final long LEG_BASE_MS = 6000L;
    /** Leg time limit, per metre on top: about 0.25 m/s, half the robot's pace. */
    static final long LEG_MS_PER_M = 4000L;
    /** Leg time limit, at most: a fixed 30 s spent 4 of 7 minutes of a drive waiting on legs already decided. */
    static final long LEG_MAX_MS = 30000L;
    /** Standstill: moving less than this from the last pose that counted as moving. */
    static final double STALL_M = 0.10;
    /** Standstill this long blocks the leg: the robot first turns on the spot, a half turn takes 4 s. */
    static final long STALL_MS = 8000L;
    /** Avoiding (1018 without 1019) this long blocks the leg: of 10 avoidance moves that ended by themselves, 9 ended within 10 s. */
    static final long AVOID_MS = 12000L;
    /** A blocked spot is a circle of this radius in the app's copy of the map. */
    static final double BLOCK_RADIUS_M = 0.6;
    /** Replans per drive; one more blocked leg ends the drive ("blocked"). */
    static final int MAX_REPLANS = 6;
    /** Starts per leg: the SDK answers -1 to any new goal while a navigation runs, so the 2nd and 3rd come after stopNavigation. */
    static final int LEG_STARTS = 3;
    /** Waits after stopNavigation before the 2nd and the 3rd start: stopNavigation confirms in 20 to 40 ms, the CarryBot once needed longer. */
    static final long[] RESTART_DELAYS_MS = {150L, 400L};
    /** The loop looks at the leg this often (about 17 cm at 0.7 m/s; every look at the pose is a binder call). */
    static final long WATCH_MS = 250L;
    /** Our own leg limit is the SDK's timeout plus this, so the SDK's own -109 normally comes first. */
    static final long TIMEOUT_GRACE_MS = 5000L;
    /** Pose reads before giving up on a plan: a single failed binder call must not end a drive. */
    static final int POSE_TRIES = 3;
    // Speed: none is passed, so the SDK's default (about 0.7 m/s) holds; Vergil master passes none either.

    /* ---------------------------------------------------------------- SDK codes (Definition; the same as RobotBridge) */

    static final int RESULT_ARRIVED = 1;
    static final int RESULT_STOPPED = 3;
    static final int ERR_ALREADY_RUN = -1;
    static final int ERR_REQUEST_RES = -6;
    static final int ERR_TIMEOUT = -109;
    static final int ERR_IN_DESTINATION = -113;
    static final int ST_AVOID = 1018;
    static final int ST_AVOID_END = 1019;
    static final int ST_OUT_MAP = 1020;
    static final int ST_NO_PATH = 1025;

    /* ---------------------------------------------------------------- the ends of a start / a leg */

    static final int ARRIVED = 1;     // reached (result 1, -113, or handed over while rolling)
    static final int BLOCKED = 2;     // something is in the way: block the spot, plan again
    static final int CANCELLED = 3;   // a stop nobody here asked for (result 3)
    static final int FAILED = 4;      // went wrong, not because of an obstacle
    static final int BUSY = 5;        // only for one start: another navigation still runs, next start
    static final int GONE = 6;        // the drive ended elsewhere (STOP, emergency stop, connection, newer drive)
    static final int PAUSED = 7;      // RobotOS suspended the robot: the answers of the leg do not count

    static final String MODE_ROUTE = "route";
    static final String MODE_PLACE = "place";

    /** What the drive needs from the robot and from RobotBridge's state. Every method is safe to call: none throws. */
    interface Host {
        long now();
        /** A plain wait on the drive thread. */
        void sleep(long ms);
        /** Waits at most ms for the first answer of this start (returns at once when it has one). */
        void await(Start s, long ms);
        /** This drive (token) is still the robot's current drive, in mode route. */
        boolean alive(int token);
        /** Some drive is moving (this one or a newer one). */
        boolean moving();
        boolean suspended();
        /** Counts onSuspend calls: a suspension shorter than one look is seen too. */
        int suspensions();
        boolean estop();
        /** {x, y, theta} in metres and radians, or null. */
        double[] pose();
        /** The robot's current map as PGM bytes, read now; null when there is none. */
        byte[] map();
        /** startNavigation to a pose with s as the listener: null when it was sent, else why not. */
        String start(Start s, double x, double y, double theta, double toleranceM, long timeoutMs);
        /** stopNavigation. */
        void stop();
        void leg(int token, int leg, int legs);
        /** The reason while moving: "", "avoiding", "replanning", "waiting". Ignored while suspended. */
        void reason(int token, String reason);
        void attempt(int token, int attempt);
        void code(int token, int code, String text);
        /** Ends this drive (state "arrived" or "failed"); false when it had already ended. */
        boolean end(int token, String state, String reason);
        /** This one drive runs in mode place (today's navigation) instead; text goes into codeText. */
        void toPlace(int token, String text);
        void log(String line);
    }

    /**
     * One startNavigation and its answers. The first answer counts, from the listener or from the watch;
     * everything later is ignored: after a handover the old leg's listener still answers 3 when the next
     * start stops it, and that must not end the new leg. The listener rules are PLAN-NAV.md, "One leg".
     */
    static final class Start {
        final Host host;
        final int leg, n;
        private int outcome;            // 0 = no answer yet
        private String why = "";
        private boolean stopFirst;      // the navigation may still run: stopNavigation before going on
        private long avoidSince;        // when the current avoidance move began, 0 = none
        private int code, codeSeq;
        private String codeText = "";

        Start(Host host, int leg, int n) { this.host = host; this.leg = leg; this.n = n; }

        /** The first end wins; false when the start already had one. */
        synchronized boolean end(int result, String reason, boolean stop) {
            if (outcome != 0) return false;
            outcome = result;
            why = reason == null ? "" : reason;
            stopFirst = stop;
            notifyAll();
            return true;
        }

        synchronized int outcome() { return outcome; }
        synchronized String why() { return why; }
        synchronized boolean stopFirst() { return stopFirst; }
        synchronized long avoidSince() { return avoidSince; }
        synchronized int codeSeq() { return codeSeq; }
        synchronized int code() { return code; }
        synchronized String codeText() { return codeText; }

        synchronized void sdkCode(int c, String text) {
            if (outcome != 0) return;
            code = c;
            String t = text == null ? "" : text;
            codeText = t.length() > 200 ? t.substring(0, 200) : t;
            codeSeq++;
        }

        /** The drive thread waits here between two looks; an answer wakes it at once. */
        synchronized void awaitAnswer(long ms) {
            if (outcome != 0 || ms <= 0) return;
            try { wait(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }

        void onResult(int status, String response) {
            if (status == RESULT_ARRIVED) end(ARRIVED, "result 1", false);
            else if (status == RESULT_STOPPED) end(CANCELLED, "result 3, a stop nobody here asked for", false);
            else { sdkCode(status, response); end(FAILED, "result " + status, false); }
        }

        void onError(int c, String text) {
            if (c == ERR_ALREADY_RUN || c == ERR_REQUEST_RES) end(BUSY, "busy " + c, false);
            else if (c == ERR_IN_DESTINATION) end(ARRIVED, "already at the goal (-113)", false);
            else if (c == ERR_TIMEOUT) { sdkCode(c, text); end(BLOCKED, "the SDK's own time limit (-109)", false); }
            else { sdkCode(c, text); end(FAILED, "error " + c, false); }
        }

        void onStatusUpdate(int status, String data) {
            if (status == ST_AVOID) {
                long now = host.now();
                synchronized (this) { if (outcome == 0 && avoidSince == 0L) avoidSince = now; }   // only the first of a series starts the clock
            } else if (status == ST_AVOID_END) {
                synchronized (this) { avoidSince = 0L; }
            } else if (status == ST_NO_PATH) {
                sdkCode(status, data);
                end(BLOCKED, "1025 no path", true);   // the navigation keeps running inside the SDK: the loop stops it
            }
            // 1020 ("outside the map") comes in the middle of drives that end well: logged by the listener, never an end.
        }
    }

    private final Host host;
    private final int token;
    private final String place;
    private final double goalX, goalY, goalTheta;
    private final long startedAt, limitMs, resumeDelayMs;
    private int seenSuspensions;
    private boolean started;          // at least one startNavigation went out in this drive
    /** The poses read on the route being driven (PLAN-NAV-UPDATE-1); only the drive's own thread touches it. */
    private List<double[]> driven = new ArrayList<double[]>();
    private String base = "";         // the reason when nothing else goes on: "" or "replanning"
    private String lastWhy = "";      // why the last leg ended, for the log

    /**
     * @param startedAt when the drive began (RobotBridge.navStartedAt): the drive limit counts from there
     * @param limitMs   the drive limit, RobotBridge.GLOBAL_LIMIT_MS (5 minutes in both modes)
     * @param resumeDelayMs the wait after onRecovery, RobotBridge.RESUME_DELAY_MS
     */
    RouteDrive(Host host, int token, String place, double goalX, double goalY, double goalTheta,
               long startedAt, long limitMs, long resumeDelayMs) {
        this.host = host;
        this.token = token;
        this.place = place == null ? "" : place;
        this.goalX = goalX;
        this.goalY = goalY;
        this.goalTheta = goalTheta;
        this.startedAt = startedAt;
        this.limitMs = limitMs;
        this.resumeDelayMs = resumeDelayMs;
        this.seenSuspensions = host.suspensions();
    }

    /** Leg time limit: 6 s + 4 s per metre of the leg, at most 30 s. */
    static long legTimeoutMs(double legM) {
        long ms = LEG_BASE_MS + Math.round(Math.max(0.0, legM) * LEG_MS_PER_M);
        return Math.min(ms, LEG_MAX_MS);
    }

    @Override
    public void run() {
        try {
            drive();
        } catch (Throwable t) {   // a planner error must never leave the drive "moving" with nobody driving it
            host.log("drive " + token + " to \"" + place + "\": error " + t);
            if (!started) {
                toPlace("route: planner error " + t.getClass().getSimpleName() + ", robot navigation");
            } else if (host.alive(token)) {
                host.stop();
                host.code(token, 0, "route: error " + t.getClass().getSimpleName());
                if (host.end(token, "failed", "")) host.log("drive end: failed (error " + t.getClass().getSimpleName() + ")");
            }
        }
    }

    private void drive() {
        host.log("drive " + token + " to \"" + place + "\" (" + f2(goalX) + ", " + f2(goalY) + ", " + f2(goalTheta) + ")");
        long t0 = host.now();
        byte[] pgm = host.map();
        if (!host.alive(token)) { host.log("drive ended while the map was read"); return; }
        if (pgm == null) { toPlace("route: no map, robot navigation"); return; }
        OccupancyGrid grid;
        try {
            grid = PgmMap.INSTANCE.parse(pgm, Double.valueOf(INFLATE_M));
        } catch (Exception e) {          // PgmMap.ParseException: Kotlin does not declare it, so javac refuses it by name
            host.log("map not readable: " + e.getMessage());
            toPlace("route: no map, robot navigation");
            return;
        } catch (OutOfMemoryError e) {   // the parser rejects absurd sizes first; this is the second line
            host.log("map too large for the memory");
            toPlace("route: no map, robot navigation");
            return;
        }
        host.log("map parsed: " + grid.getWidth() + "x" + grid.getHeight() + " cells of " + f2(grid.getResolution())
                + " m, " + (host.now() - t0) + " ms with reading");
        RoutePlanner planner = new RoutePlanner(grid);
        int replans = 0, blocks = 0;
        // PLAN-NAV-UPDATE-1: the poses of the route being driven, for BlockSpot.centre. Emptied for every new route
        // (start, after Blocked, after clearObstacles, after a recovery: each of them plans again below).
        driven = new ArrayList<double[]>();
        host.attempt(token, 1);
        while (true) {
            if (!host.alive(token)) { host.log("drive ended elsewhere"); return; }
            if (paused()) { if (!waitOutSuspension()) return; continue; }
            if (host.now() - startedAt > limitMs) { finish("failed", "blocked", "no way through for " + (limitMs / 1000) + " s"); return; }
            double[] pose = pose();
            if (pose == null) {
                if (!started) { toPlace("route: no pose, robot navigation"); return; }
                if (!pause(WATCH_MS)) return;
                continue;   // the drive limit above ends it if the pose never comes back
            }
            long tp = host.now();
            RoutePlanner.Route route = planner.plan(pose[0], pose[1], goalX, goalY, Double.valueOf(MAX_LEG_M));
            if (route == null && blocks > 0) {
                // Deviation from Vergil (PLAN-NAV.md): blocks can pile up around a robot that has not moved and
                // wall it in. Drop them all and plan once more.
                host.log("the " + blocks + " block(s) leave no route: all dropped, planning once more");
                planner.clearObstacles();
                blocks = 0;
                route = planner.plan(pose[0], pose[1], goalX, goalY, Double.valueOf(MAX_LEG_M));
            }
            if (route == null) {
                host.log("plan: no route from (" + f2(pose[0]) + ", " + f2(pose[1]) + "), " + (host.now() - tp) + " ms");
                finish("failed", "no-route", "no way on the map");
                return;
            }
            List<PathSimplifier.Waypoint> pts = route.getWaypoints();
            int legs = pts.size() - 1;
            driven.clear();   // a pose from an earlier route must not count as progress on this one
            host.log("plan: " + pts.size() + " points, " + f1(route.getLengthMeters()) + " m, " + (host.now() - tp) + " ms");
            if (legs < 1) { finish("arrived", "", "already there"); return; }   // points.get(0) is the robot itself
            host.leg(token, 0, legs);

            int result = ARRIVED, legAt = 0;
            double tx = goalX, ty = goalY;
            for (int i = 1; i <= legs && result == ARRIVED; i++) {
                legAt = i;
                PathSimplifier.Waypoint prev = pts.get(i - 1), w = pts.get(i);
                boolean last = i == legs;
                // The last leg goes to the place itself (the planner's last point is a cell, up to 1 m off when the
                // place lies inside the grown margin); on the way the heading the robot arrives with: the heading of
                // the point BEFORE this one, so it does not turn at a waypoint.
                tx = last ? goalX : w.getX();
                ty = last ? goalY : w.getY();
                double theta = last ? goalTheta : prev.getHeading();
                double plannedM = Math.hypot(tx - prev.getX(), ty - prev.getY());
                long timeout = legTimeoutMs(plannedM);
                double handover = last ? 0.0 : HANDOVER_M;   // no handover at the last point: it arrives properly
                host.leg(token, i, legs);
                host.log("leg " + i + "/" + legs + " start: (" + f2(tx) + ", " + f2(ty) + ", " + f2(theta) + "), "
                        + f1(plannedM) + " m, timeout " + timeout + " ms" + (last ? ", the place" : ", handover " + f1(handover) + " m"));
                result = leg(i, legs, tx, ty, theta, handover, timeout, plannedM);
                host.log("leg " + i + "/" + legs + " end: " + name(result) + (lastWhy.isEmpty() ? "" : " (" + lastWhy + ")"));
                if (result == ARRIVED && base.length() > 0) { base = ""; host.reason(token, base); }   // the new route got going
            }
            switch (result) {
                case ARRIVED:
                    finish("arrived", "", "all " + legs + " legs");
                    return;
                case BLOCKED: {
                    // PLAN-NAV-UPDATE-1: the circle goes where the robot met the obstacle (BlockSpot.centre), not
                    // 0.9 m from where the robot's own navigation has taken it by now.
                    double[] now = pose();
                    if (now != null) driven.add(new double[] {now[0], now[1]});
                    else if (!driven.isEmpty()) now = driven.get(driven.size() - 1);   // the last pose the watch read
                    List<double[]> way = new ArrayList<double[]>();
                    for (int k = 0; k < pts.size(); k++) {
                        boolean end = k == legs;   // the last leg drives to the place itself, not the planner's last cell
                        way.add(new double[] {end ? goalX : pts.get(k).getX(), end ? goalY : pts.get(k).getY()});
                    }
                    double bx, by;
                    if (now == null) {   // no pose at all: at the point, as the old rule did without a pose
                        bx = tx;
                        by = ty;
                        host.log("block (" + f2(bx) + ", " + f2(by) + ") at the point, no pose");
                    } else {
                        BlockSpot.Spot spot = BlockSpot.centre(way, legAt, driven, now[0], now[1]);
                        bx = spot.x;
                        by = spot.y;
                        host.log(spot.fromRoute
                                ? "block (" + f2(bx) + ", " + f2(by) + ") from route at (" + f2(spot.anchorX) + ", " + f2(spot.anchorY) + "), robot at (" + f2(now[0]) + ", " + f2(now[1]) + ")"
                                : "block (" + f2(bx) + ", " + f2(by) + ") from robot at (" + f2(now[0]) + ", " + f2(now[1]) + ")");
                    }
                    planner.block(bx, by, BLOCK_RADIUS_M);
                    blocks++;
                    replans++;
                    if (replans > MAX_REPLANS) { finish("failed", "blocked", replans - 1 + " replans did not get through"); return; }
                    base = "replanning";
                    host.attempt(token, replans + 1);
                    host.reason(token, base);
                    host.log("replan " + replans + " of " + MAX_REPLANS);
                    continue;
                }
                case CANCELLED:
                    finish("failed", "stopped", lastWhy);
                    return;
                case FAILED:
                    finish("failed", "", lastWhy);   // the SDK code is in code / codeText
                    return;
                case PAUSED:
                    continue;   // the top of the loop waits for the recovery, then plans again: not a replan
                default:
                    host.log("drive ended elsewhere");
                    return;     // GONE
            }
        }
    }

    /** One leg: up to LEG_STARTS starts; before the 2nd and 3rd stopNavigation, then 150 ms, then 400 ms. */
    private int leg(int i, int legs, double x, double y, double theta, double handover, long timeoutMs, double plannedM) {
        lastWhy = "";
        for (int n = 1; n <= LEG_STARTS; n++) {
            if (n > 1) {
                if (!host.alive(token)) return GONE;
                host.reason(token, "waiting");
                host.stop();
                if (!pause(RESTART_DELAYS_MS[Math.min(n - 2, RESTART_DELAYS_MS.length - 1)])) return GONE;
            }
            if (!host.alive(token)) return GONE;
            if (paused()) return PAUSED;
            if (host.estop()) { finish("failed", "emergency", "emergency stop pressed"); return GONE; }   // belt and braces next to onEstop
            Start s = new Start(host, i, n);
            long t = host.now();
            String err = host.start(s, x, y, theta, TOLERANCE_M, timeoutMs);
            if (!host.alive(token)) {
                // STOP or the emergency stop came while the order went out: make sure the robot stands. A newer
                // drive meets this navigation as -1 and stops it itself.
                if (err == null && !host.moving()) host.stop();
                return GONE;
            }
            if (err != null) {
                host.code(token, 0, "route: startNavigation failed (" + err + ")");
                lastWhy = "startNavigation failed: " + err;
                return FAILED;
            }
            started = true;
            int r = watch(s, x, y, handover, timeoutMs, plannedM, t);
            if (r == BUSY) { host.log("leg " + i + "/" + legs + ": navigation still busy, start " + n + " of " + LEG_STARTS); continue; }
            if (r != GONE && r != PAUSED) host.reason(token, base);
            lastWhy = s.why();
            return r;
        }
        host.code(token, ERR_ALREADY_RUN, "route: navigation stayed busy");
        lastWhy = "navigation stayed busy";
        return FAILED;
    }

    /** Waits for the answer of one start and watches the leg every WATCH_MS: handover, standstill, avoiding, time. */
    private int watch(Start s, double x, double y, double handover, long timeoutMs, double plannedM, long t) {
        double[] p0 = pose();
        if (p0 != null) driven.add(new double[] {p0[0], p0[1]});
        // the handover radius is capped against the leg as it lies ahead at the start (the planned length without a pose)
        double legM = p0 != null ? Math.hypot(x - p0[0], y - p0[1]) : plannedM;
        double radius = Math.min(handover, legM * HANDOVER_LEG_SHARE);
        if (handover > 0.0 && radius < handover) host.log("leg " + s.leg + ": handover " + f2(radius) + " m, capped for a " + f2(legM) + " m leg");
        double mx = p0 != null ? p0[0] : Double.NaN, my = p0 != null ? p0[1] : Double.NaN;
        long movedAt = host.now();
        int seq = 0;
        while (true) {
            host.await(s, WATCH_MS);
            if (!host.alive(token)) return GONE;
            if (paused()) return PAUSED;   // suspended: the answers of the interrupted leg are ignored
            int cs = s.codeSeq();
            if (cs != seq) { seq = cs; host.code(token, s.code(), s.codeText()); }
            int o = s.outcome();
            if (o != 0) return answered(s, o);
            long now = host.now();
            double[] p = pose();
            if (p != null) {
                driven.add(new double[] {p[0], p[1]});   // PLAN-NAV-UPDATE-1: every pose of the 250 ms watch
                if (Double.isNaN(mx) || Math.hypot(p[0] - mx, p[1] - my) >= STALL_M) {
                    mx = p[0]; my = p[1]; movedAt = now;   // the last pose that counted as moving
                } else if (now - movedAt >= STALL_MS) {
                    s.end(BLOCKED, "standstill: less than " + f2(STALL_M) + " m in " + (STALL_MS / 1000) + " s", true);
                }
                double left = Math.hypot(x - p[0], y - p[1]);
                if (radius > 0.0 && left <= radius) s.end(ARRIVED, "handover " + f2(left) + " m before the point", false);   // no stopNavigation: the next start takes over
            }
            long a = s.avoidSince();
            if (a != 0L && now - a >= AVOID_MS) s.end(BLOCKED, "avoiding for " + (AVOID_MS / 1000) + " s without getting past", true);
            if (now - t >= timeoutMs + TIMEOUT_GRACE_MS) s.end(BLOCKED, "leg time limit " + timeoutMs + " ms + " + TIMEOUT_GRACE_MS + " ms", true);
            if (s.outcome() == 0) host.reason(token, a != 0L ? "avoiding" : base);
        }
    }

    private int answered(Start s, int o) {
        if (s.stopFirst() && host.alive(token)) host.stop();
        if (o == CANCELLED) {
            // RobotOS' onSuspend may arrive just after the stop's own answer: look once more before calling it a stop.
            if (!pause(WATCH_MS)) return GONE;
            if (paused()) return PAUSED;
        }
        return o;
    }

    private boolean paused() { return host.suspended() || host.suspensions() != seenSuspensions; }

    /** While suspended the drive waits; after onRecovery it waits resumeDelayMs and plans again from the fresh pose. */
    private boolean waitOutSuspension() {
        host.log("suspended by RobotOS: waiting for the recovery");
        while (true) {
            int seq = host.suspensions();
            if (!host.suspended()) { seenSuspensions = seq; break; }
            if (!host.alive(token)) return false;
            host.sleep(WATCH_MS);
        }
        host.log("recovery: planning again in " + resumeDelayMs + " ms (not a replan)");
        if (!pause(resumeDelayMs)) return false;
        if (!paused()) host.reason(token, base);
        return true;
    }

    /** Waits ms in steps of WATCH_MS; false when the drive ended meanwhile. */
    private boolean pause(long ms) {
        long end = host.now() + ms;
        while (true) {
            if (!host.alive(token)) return false;
            long left = end - host.now();
            if (left <= 0) return true;
            host.sleep(Math.min(left, WATCH_MS));
        }
    }

    private double[] pose() {
        for (int i = 0; i < POSE_TRIES; i++) {
            double[] p = host.pose();
            if (p != null && p.length >= 3 && !Double.isNaN(p[0]) && !Double.isNaN(p[1])) return p;
            if (i + 1 < POSE_TRIES && !pause(WATCH_MS)) return null;
        }
        return null;
    }

    private void finish(String state, String reason, String why) {
        if (!"arrived".equals(state) && started && host.alive(token)) host.stop();   // the robot stands when the drive gives up
        if (host.end(token, state, reason)) host.log("drive end: " + state + (reason.isEmpty() ? "" : " \"" + reason + "\"") + " (" + why + ")");
    }

    private void toPlace(String text) {
        host.log("this drive runs in mode place: " + text);
        host.toPlace(token, text);
    }

    static String name(int result) {
        switch (result) {
            case ARRIVED: return "arrived";
            case BLOCKED: return "blocked";
            case CANCELLED: return "cancelled";
            case FAILED: return "failed";
            case BUSY: return "busy";
            case PAUSED: return "paused";
            default: return "ended elsewhere";
        }
    }

    static String f1(double v) { return String.format(Locale.ROOT, "%.1f", v); }
    static String f2(double v) { return String.format(Locale.ROOT, "%.2f", v); }
}
