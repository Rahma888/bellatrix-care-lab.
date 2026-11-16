import de.labland.bellatrix.BlockSpot;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Checks {@link BlockSpot} on the desktop, the way NavProbe checks the planner. Prints one line per case and
 * "all passed", or the first case that fails, and exits with 1.
 *
 * The two drive 47 cases are real: Vergil's second Nova on 15 November 2026, route, poses and the obstacles as
 * Sebastian marked them on the map (Vergil's {@code BarriersTest}, "on drive 47 the lines lie at the obstacles").
 */
public final class BlockSpotCheck {

    public static void main(String[] args) {
        drive47First();
        drive47Third();
        onRouteKeepsTheOldSpot();
        offRouteBlocksWhereItGotOnTheRoute();
        neverOnRouteFallsBack();
        laterPartOfABendingRouteDoesNotCount();
        routeEndingBeforeTheClearanceFallsBack();
        reachedIsTheFarthestPoint();
        System.out.println("all passed");
    }

    /** The robot turned before the box and went round a block, 1.4 m beside the route when the leg ran out. */
    static void drive47First() {
        List<double[]> route = points(new double[] {
            11.5, -0.1, 13.65, 3.95, 14.0, 4.2, 14.2, 4.3, 14.5, 5.0, 14.35, 5.3, 14.05, 5.4, 13.75, 5.5});
        List<double[]> driven = points(new double[] {
            11.516, -0.106, 11.589, 0.049, 11.704, 0.27, 11.821, 0.511, 12.001, 0.869, 12.2, 1.255, 12.389, 1.629,
            12.573, 2.0, 12.739, 2.334, 12.93, 2.705, 13.109, 3.065, 13.261, 3.376, 13.415, 3.647, 13.524, 3.819,
            13.612, 3.91, 13.534, 3.863, 13.353, 3.744, 13.101, 3.562, 12.828, 3.371, 12.539, 3.12, 12.332, 2.832,
            12.263, 2.73, 12.203, 2.803, 12.137, 2.932, 12.062, 3.028, 11.932, 3.108, 11.77, 3.165, 11.658, 3.207});
        atObstacle("drive 47, first blockade", route, 2, driven, 13.91, 4.08);
    }

    /** The robot turned before the box and went round a block, 2.6 m beside the route when the leg ran out. */
    static void drive47Third() {
        List<double[]> route = points(new double[] {
            12.1, 5.75, 11.25, 3.7, 11.4, 3.4, 12.3, 2.75, 13.35, 1.75, 14.2, 1.45, 14.4, 1.45, 14.75, 1.7,
            15.35, 3.15, 15.35, 3.45, 15.05, 3.85, 14.4, 5.25, 14.25, 5.35, 14.0, 5.4, 13.75, 5.5});
        List<double[]> driven = points(new double[] {
            12.095, 5.611, 12.021, 5.452, 11.878, 5.183, 11.703, 4.813, 11.537, 4.423, 11.409, 4.138, 11.319, 3.8,
            11.33, 3.627, 11.383, 3.454, 11.464, 3.308, 11.667, 3.151, 11.956, 3.024, 12.202, 2.897, 12.479, 2.603,
            12.697, 2.35, 12.842, 2.074, 12.856, 1.854, 12.699, 1.552, 12.474, 1.259, 12.265, 0.913, 12.107, 0.524,
            11.984, 0.157, 11.967, -0.099, 12.0, -0.309, 12.132, -0.558, 12.411, -0.748, 12.785, -0.921,
            13.098, -0.989, 13.39, -0.975, 13.661, -0.843, 13.774, -0.719, 13.647, -0.859, 13.513, -0.96,
            13.413, -1.004});
        atObstacle("drive 47, third blockade", route, 5, driven, 13.62, 1.59);
    }

    /**
     * Stopped on the route in front of the box and rolled back 3 cm: the clearance pushes the centre to 0.93 m
     * ahead of the robot, next to the 0.9 m of the old rule (3.87, 0).
     */
    static void onRouteKeepsTheOldSpot() {
        List<double[]> driven = points(new double[] {0.0, 0.1, 1.0, -0.1, 2.0, 0.05, 3.0, 0.0, 2.97, 0.0});
        BlockSpot.Spot spot = BlockSpot.centre(straight(), 10, driven, 2.97, 0.0);
        expect("on the route", true, 3.9, 0.0, spot);
    }

    /** Got to x = 3 on the route, then the robot's own navigation took it two metres off. */
    static void offRouteBlocksWhereItGotOnTheRoute() {
        List<double[]> driven = points(new double[] {0.0, 0.1, 1.5, 0.0, 3.0, 0.2, 2.5, -1.0, 2.0, -2.0});
        BlockSpot.Spot spot = BlockSpot.centre(straight(), 4, driven, 2.0, -2.0);
        expect("off the route", true, 3.6, 0.0, spot);
    }

    /** No pose within 0.5 m of the route: the old rule, 0.9 m from the robot towards the waypoint (4, 0). */
    static void neverOnRouteFallsBack() {
        List<double[]> driven = points(new double[] {1.0, 1.0, 2.0, -2.0});
        BlockSpot.Spot spot = BlockSpot.centre(straight(), 4, driven, 2.0, -2.0);
        double f = 0.9 / Math.hypot(2.0, 2.0);
        expect("never on the route", false, 2.0 + 2.0 * f, -2.0 + 2.0 * f, spot);
    }

    /** A U-shaped route, blocked on its first leg; the robot ends up beside the last leg, which must not count. */
    static void laterPartOfABendingRouteDoesNotCount() {
        List<double[]> route = points(new double[] {0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0});
        List<double[]> driven = points(new double[] {0.5, 0.0, 1.0, 0.1, 2.0, 0.0, 1.5, 1.5, 1.0, 3.8});
        BlockSpot.Spot spot = BlockSpot.centre(route, 1, driven, 1.0, 3.8);
        expect("bending route", true, 2.6, 0.0, spot);
    }

    /** The route ends 0.5 m ahead: no point of it keeps the clearance, so the old rule, at the waypoint. */
    static void routeEndingBeforeTheClearanceFallsBack() {
        List<double[]> route = points(new double[] {0.0, 0.0, 0.5, 0.0});
        List<double[]> driven = points(new double[] {0.0, 0.0});
        BlockSpot.Spot spot = BlockSpot.centre(route, 1, driven, 0.0, 0.0);
        expect("route too short", false, 0.5, 0.0, spot);
    }

    /** Back along the route to x = 2 does not undo x = 3, and a metre beside the route at x = 6 is not on it. */
    static void reachedIsTheFarthestPoint() {
        List<double[]> driven = points(new double[] {0.0, 0.1, 1.0, -0.1, 3.0, 0.2, 2.0, 0.1, 6.0, 1.0, 2.0, -2.0});
        double[] reached = BlockSpot.reached(straight(), 10, driven);
        if (reached == null || Math.abs(reached[1] - 3.0) > 1e-6 || Math.abs(reached[2]) > 1e-6) {
            fail("reached: expected (3.00, 0.00), got " + (reached == null ? "null" : format(reached[1], reached[2])));
        }
        System.out.println("ok  reached: " + format(reached[1], reached[2]));
    }

    private static void atObstacle(String name, List<double[]> route, int blockedIndex, List<double[]> driven,
                                   double obstacleX, double obstacleY) {
        double[] here = driven.get(driven.size() - 1);
        BlockSpot.Spot spot = BlockSpot.centre(route, blockedIndex, driven, here[0], here[1]);
        double[] wp = route.get(blockedIndex);
        double[] old = BlockSpot.aheadOfRobot(wp[0], wp[1], here[0], here[1]);
        double off = Math.hypot(spot.x - obstacleX, spot.y - obstacleY);
        double oldOff = Math.hypot(old[0] - obstacleX, old[1] - obstacleY);
        if (!spot.fromRoute || off >= 0.6) {
            fail(name + ": the circle at " + format(spot.x, spot.y) + " is " + meters(off)
                + " from the obstacle, it has to cover it");
        }
        if (oldOff < 0.6) fail(name + ": the old rule covers the obstacle too, so this case shows nothing");
        System.out.println("ok  " + name + ": circle at " + format(spot.x, spot.y) + ", " + meters(off)
            + " from the obstacle (old rule " + format(old[0], old[1]) + ", " + meters(oldOff) + ")");
    }

    private static void expect(String name, boolean fromRoute, double x, double y, BlockSpot.Spot spot) {
        if (spot.fromRoute != fromRoute || Math.abs(spot.x - x) > 1e-6 || Math.abs(spot.y - y) > 1e-6) {
            fail(name + ": expected " + format(x, y) + source(fromRoute) + ", got " + format(spot.x, spot.y)
                + source(spot.fromRoute));
        }
        System.out.println("ok  " + name + ": " + format(spot.x, spot.y) + source(spot.fromRoute));
    }

    private static String source(boolean fromRoute) {
        return fromRoute ? " from the route" : " from the robot";
    }

    /** A straight route along +x from the origin, a point every metre. */
    private static List<double[]> straight() {
        List<double[]> route = new ArrayList<double[]>();
        for (int i = 0; i <= 10; i++) route.add(new double[] {i, 0.0});
        return route;
    }

    private static List<double[]> points(double[] xy) {
        List<double[]> list = new ArrayList<double[]>();
        for (int i = 0; i + 1 < xy.length; i += 2) list.add(new double[] {xy[i], xy[i + 1]});
        return list;
    }

    private static String format(double x, double y) {
        return String.format(Locale.ROOT, "(%.2f, %.2f)", x, y);
    }

    private static String meters(double m) {
        return String.format(Locale.ROOT, "%.2f m", m);
    }

    private static void fail(String message) {
        System.out.println("FAIL " + message);
        System.exit(1);
    }
}
