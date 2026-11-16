package de.labland.bellatrix;

import java.util.List;

/**
 * Where the block circle goes when a leg of a route is blocked.
 *
 * Port of Vergil's fix of 15 November 2026 (`Barriers.reached`, Vergil master `6364a07`) to the circle of
 * `PLAN-NAV.md`. The robot's own navigation does not stop where the obstacle is: it turns, looks for its own way
 * round, through another corridor if need be, until the leg runs out. Where the robot stands then says nothing
 * about the obstacle. The circle therefore goes ahead of the point of the route the robot got farthest to while
 * it was on the route, and only keeps its distance from where the robot stands now.
 *
 * Plain Java 8 without Android, static methods and a static nested class only (Bellatrix build rules). Points are
 * {@code double[] {x, y}} in map metres, like the planner's waypoints and the SDK's poses.
 */
public final class BlockSpot {

    /** A pose this close to the route counts as on it: above the sway and the cut corners of the handover (up to 0.47 m on Vergil's drive 47), below a detour round a block (1.4 and 2.6 m). */
    public static final double ON_ROUTE_METERS = 0.5;

    /** The circle's centre lies this far along the route past the reached point, so the 0.6 m circle begins where the robot met the obstacle. */
    public static final double AHEAD_OF_REACHED_METERS = 0.6;

    /** The centre keeps this distance from where the robot stands now: 0.9 > 0.6 keeps the robot's own cell free. Same value as the lookahead of PLAN-NAV.md, which stays the fallback. */
    public static final double ROBOT_CLEARANCE_METERS = 0.9;

    /** Step of the walk along the route when the centre is too close to the robot: one cell of the 5 cm grid. */
    public static final double STEP_METERS = 0.05;

    private BlockSpot() {
    }

    /** The centre of the block circle and what it was laid from, for the log. */
    public static final class Spot {
        public final double x;
        public final double y;
        /** True when laid from the reached point on the route, false for the fallback from the robot's pose. */
        public final boolean fromRoute;
        /** The reached point, or the robot's pose for the fallback. */
        public final double anchorX;
        public final double anchorY;

        Spot(double x, double y, boolean fromRoute, double anchorX, double anchorY) {
            this.x = x;
            this.y = y;
            this.fromRoute = fromRoute;
            this.anchorX = anchorX;
            this.anchorY = anchorY;
        }
    }

    /**
     * Where to block after the leg to {@code route.get(blockedIndex)} came back Blocked.
     *
     * @param route the waypoints of the route being driven, the robot's position at planning first (index 0)
     * @param blockedIndex index in {@code route} of the waypoint whose leg was blocked, 1 or more
     * @param driven the robot's poses since it set off on this route, in order, the pose at the blockade last
     * @param robotX where the robot stands now
     * @param robotY where the robot stands now
     * @return the circle's centre; laid from the robot's pose as before when the robot was never on the route or
     *     the route ends before the clearance
     */
    public static Spot centre(List<double[]> route, int blockedIndex, List<double[]> driven, double robotX, double robotY) {
        double[] reached = reached(route, blockedIndex, driven);
        if (reached != null) {
            for (int step = 0; ; step++) {
                double[] p = pointAt(route, reached[0] + AHEAD_OF_REACHED_METERS + step * STEP_METERS);
                if (p == null) break;
                if (Math.hypot(p[0] - robotX, p[1] - robotY) >= ROBOT_CLEARANCE_METERS) {
                    return new Spot(p[0], p[1], true, reached[1], reached[2]);
                }
            }
        }
        double[] wp = route.get(blockedIndex);
        double[] old = aheadOfRobot(wp[0], wp[1], robotX, robotY);
        return new Spot(old[0], old[1], false, robotX, robotY);
    }

    /**
     * The point of the route up to {@code route.get(lastIndex)} farthest along that a pose of {@code driven} came
     * within {@link #ON_ROUTE_METERS} of.
     *
     * Only up to the blocked waypoint: the robot never got past that leg, and a pose beside a later part of a
     * bending route must not count as progress.
     *
     * @return {@code {along, x, y}} with {@code along} in metres from the route's start, or {@code null} when no
     *     pose came close enough
     */
    public static double[] reached(List<double[]> route, int lastIndex, List<double[]> driven) {
        double[] best = null;
        for (int i = 0; i < driven.size(); i++) {
            double[] p = driven.get(i);
            double[] nearest = nearestOnRoute(route, lastIndex, p[0], p[1]);
            if (nearest == null || nearest[3] > ON_ROUTE_METERS) continue;
            if (best == null || nearest[0] > best[0]) best = new double[] {nearest[0], nearest[1], nearest[2]};
        }
        return best;
    }

    /** The old rule of PLAN-NAV.md: 0.9 m from the robot towards the waypoint, at the waypoint if that is closer. */
    public static double[] aheadOfRobot(double wpX, double wpY, double robotX, double robotY) {
        double dx = wpX - robotX;
        double dy = wpY - robotY;
        double distance = Math.hypot(dx, dy);
        if (distance < 1e-6) return new double[] {wpX, wpY};
        double fraction = Math.min(1.0, ROBOT_CLEARANCE_METERS / distance);
        return new double[] {robotX + dx * fraction, robotY + dy * fraction};
    }

    /** {@code {along, x, y, distance}} of the point of the route up to lastIndex nearest (px, py). */
    private static double[] nearestOnRoute(List<double[]> route, int lastIndex, double px, double py) {
        double[] best = null;
        double start = 0.0;
        int end = Math.min(lastIndex, route.size() - 1);
        for (int i = 1; i <= end; i++) {
            double[] a = route.get(i - 1);
            double[] b = route.get(i);
            double dx = b[0] - a[0];
            double dy = b[1] - a[1];
            double length = Math.hypot(dx, dy);
            double t = 0.0;
            if (length > 1e-6) t = Math.max(0.0, Math.min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / (length * length)));
            double qx = a[0] + t * dx;
            double qy = a[1] + t * dy;
            double distance = Math.hypot(px - qx, py - qy);
            if (best == null || distance < best[3]) best = new double[] {start + t * length, qx, qy, distance};
            start += length;
        }
        return best;
    }

    /** The point {@code along} metres from the route's start, or {@code null} past its end. */
    private static double[] pointAt(List<double[]> route, double along) {
        double start = 0.0;
        for (int i = 1; i < route.size(); i++) {
            double[] a = route.get(i - 1);
            double[] b = route.get(i);
            double length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (start + length >= along) {
                double t = length < 1e-6 ? 0.0 : (along - start) / length;
                return new double[] {a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])};
            }
            start += length;
        }
        return null;
    }
}
