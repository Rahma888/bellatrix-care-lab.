import de.labland.vergil.navigation.OccupancyGrid;
import de.labland.vergil.navigation.PathSimplifier;
import de.labland.vergil.navigation.PgmMap;
import de.labland.vergil.navigation.RoutePlanner;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.List;

/**
 * Calls the Vergil planner from Java 8 the way a RobotBridge would: parse the robot's PGM,
 * plan, block a spot, plan again, clear. Static methods only, no lambdas (Bellatrix build rules).
 */
public final class NavProbe {
    public static void main(String[] args) throws Exception {
        byte[] bytes = readAll(new File(args[0]));
        long t0 = System.currentTimeMillis();
        OccupancyGrid grid = PgmMap.INSTANCE.parse(bytes, Double.valueOf(PgmMap.DEFAULT_ROBOT_RADIUS_METERS));
        System.out.println("grid " + grid.getWidth() + "x" + grid.getHeight() + " res " + grid.getResolution()
                + " parsed+inflated in " + (System.currentTimeMillis() - t0) + " ms");

        RoutePlanner planner = new RoutePlanner(grid);
        double sx = -3.685, sy = 1.775, gx = 28.620, gy = -1.269;   // couch -> kitchen, office map

        RoutePlanner.Route route = planner.plan(sx, sy, gx, gy, Double.valueOf(10.0));
        if (route == null) throw new IllegalStateException("no route");
        List<PathSimplifier.Waypoint> wps = route.getWaypoints();
        System.out.println("route " + wps.size() + " waypoints, " + String.format("%.1f", route.getLengthMeters()) + " m");
        for (PathSimplifier.Waypoint w : wps) {
            System.out.println(String.format("  %.2f %.2f %.2f", w.getX(), w.getY(), w.getHeading()));
        }

        PathSimplifier.Waypoint middle = wps.get(wps.size() / 2);
        planner.block(middle.getX(), middle.getY(), 1.0);
        RoutePlanner.Route around = planner.plan(sx, sy, gx, gy, Double.valueOf(10.0));
        System.out.println("after block: " + (around == null ? "no route" : around.getWaypoints().size() + " waypoints, "
                + String.format("%.1f", around.getLengthMeters()) + " m"));
        planner.clearObstacles();
        System.out.println("after clear: " + (planner.plan(sx, sy, gx, gy, null) != null ? "route" : "no route"));
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
}
