package de.labland.vergil.navigation

import kotlin.math.hypot

/**
 * Assembles pathfinding and simplification into a drivable route.
 *
 * A* returns a path cell by cell. At 5 cm per cell that is about four hundred
 * points for 20 meters, which would be useless as drive commands: the robot
 * would stop and align four hundred times. Simplification therefore goes by
 * line of sight: a point only survives if the straight line past it would run
 * through an obstacle. A staircase pattern becomes a diagonal, and what
 * remains are the places where the robot actually turns.
 *
 * Douglas-Peucker is deliberately not used. The obvious second smoothing step
 * knows nothing about obstacles: it drops points that lie closer to the
 * straight line than the permitted deviation, and thereby cuts corners that
 * lead around a wall. The test "waypoints have line of sight between them"
 * found exactly that on the real office map: a 20 m straight line across the
 * hall that ran through an obstacle. Line-of-sight simplification is safe by
 * construction because it checks every segment before allowing it.
 * `PathSimplifier.simplifyPath` stays in the module, but it belongs on a
 * drawing board, not in a drive command.
 */
class RoutePlanner(val grid: OccupancyGrid) {

    private val pathfinder = GridPathfinder(grid)

    /**
     * @param gridPath the raw cell-by-cell path from A*, for drawing
     * @param waypoints the points the robot is supposed to drive to
     * @param lengthMeters length of the raw path
     */
    data class Route(
        val gridPath: List<Pair<Int, Int>>,
        val waypoints: List<PathSimplifier.Waypoint>,
        val lengthMeters: Double,
    ) {
        val goal: PathSimplifier.Waypoint? get() = waypoints.lastOrNull()
    }

    /**
     * Plans from the current position to the goal. Returns `null` when there
     * is no path. That is a valid answer and not an exception: doors are
     * closed, shelves get moved.
     *
     * @param maxLegMeters maximum length of a single leg. `null` leaves the
     *   route as coarse as line of sight makes it. A value inserts
     *   intermediate points on long straights, which is needed if the robot
     *   treats our waypoints as distant goals and picks its own way between
     *   them.
     */
    fun plan(
        startX: Double,
        startY: Double,
        goalX: Double,
        goalY: Double,
        maxLegMeters: Double? = null,
    ): Route? {
        val started = System.currentTimeMillis()
        val raw = pathfinder.findPath(startX, startY, goalX, goalY) ?: return null

        val lineOfSight = PathSimplifier.simplifyByLineOfSight(pathfinder, raw.gridPath)
        val coarse = lineOfSight.mapNotNull { (x, y) -> grid.gridToWorld(x, y) }
        val world = maxLegMeters?.let { subdivide(coarse, it) } ?: coarse
        val waypoints = world.mapIndexed { i, (x, y) -> PathSimplifier.Waypoint(x, y, heading(world, i)) }

        NavLog.i(
            TAG,
            "Route planned: ${raw.gridPath.size} cells to ${waypoints.size} waypoints, " +
                "${String.format(java.util.Locale.ROOT, "%.1f", length(raw.worldPath))} m, " +
                "${System.currentTimeMillis() - started} ms",
        )

        return Route(
            gridPath = raw.gridPath,
            waypoints = waypoints,
            lengthMeters = length(raw.worldPath),
        )
    }

    /**
     * Inserts additional points on legs that are too long.
     *
     * One would like to assume that points on a clear straight line are safe.
     * They are not quite: an intermediate point is rounded to a grid cell, and
     * the rasterised line to that cell runs slightly differently than the one
     * to the original. Close to a corner that is enough to clip it, as proven
     * on the real office map.
     *
     * Every intermediate point is therefore checked and only accepted when the
     * segment from the last accepted point and the segment to the end of the
     * leg are both clear. That makes every resulting segment clear: the start
     * by construction, the end because only points with line of sight to it
     * were taken.
     */
    private fun subdivide(
        points: List<Pair<Double, Double>>,
        maxLegMeters: Double,
    ): List<Pair<Double, Double>> {
        if (points.size < 2 || maxLegMeters <= 0.0) return points

        fun clear(a: Pair<Double, Double>, b: Pair<Double, Double>): Boolean {
            val ca = grid.worldToGrid(a.first, a.second) ?: return false
            val cb = grid.worldToGrid(b.first, b.second) ?: return false
            return pathfinder.isLineClear(ca.first, ca.second, cb.first, cb.second)
        }

        val result = mutableListOf(points.first())
        var discarded = 0

        for ((a, b) in points.zipWithNext()) {
            val legLength = hypot(b.first - a.first, b.second - a.second)
            val pieces = kotlin.math.ceil(legLength / maxLegMeters).toInt().coerceAtLeast(1)
            var last = a
            for (i in 1 until pieces) {
                val t = i.toDouble() / pieces
                val candidate = a.first + (b.first - a.first) * t to a.second + (b.second - a.second) * t
                if (clear(last, candidate) && clear(candidate, b)) {
                    result.add(candidate)
                    last = candidate
                } else {
                    discarded++
                }
            }
            result.add(b)
        }

        if (discarded > 0) {
            NavLog.d(TAG, "Subdivision: $discarded intermediate points discarded (too close to a corner)")
        }
        return result
    }

    /**
     * Heading at a waypoint: towards the next point. At the goal we keep the
     * heading of the last leg, otherwise the robot turns on arrival for no
     * reason.
     */
    private fun heading(points: List<Pair<Double, Double>>, index: Int): Double {
        if (points.size < 2) return 0.0
        val (from, to) = if (index < points.lastIndex) {
            points[index] to points[index + 1]
        } else {
            points[index - 1] to points[index]
        }
        return kotlin.math.atan2(to.second - from.second, to.first - from.first)
    }

    /**
     * Blocks an area for further planning. For obstacles that are not on the
     * map: a parked roll container, a pallet. Valid until [clearObstacles].
     */
    fun block(worldX: Double, worldY: Double, radiusMeters: Double) {
        val cell = grid.worldToGrid(worldX, worldY) ?: return
        // Round up, do not truncate. 0.6 / 0.05 is not 12 in binary but
        // 11.999…, and `toInt` made a 55 cm block out of a requested 60 cm one.
        // Rounding a safety distance down is the wrong direction.
        val radiusPixels = kotlin.math.ceil(radiusMeters / grid.resolution).toInt()
        grid.addTemporaryBlock(cell.first, cell.second, radiusPixels)
    }

    /**
     * Hands a measured direction to the grid: free out to [toMeters].
     *
     * Passed through unchanged. The wedge already speaks in metres and world
     * coordinates, so there is nothing to convert here, but it belongs on the
     * planner all the same: the grid is the planner's, and the caller that
     * blocks an obstacle should not have to reach past it to free one.
     */
    fun clearWedge(
        worldX: Double,
        worldY: Double,
        centerAngleRad: Double,
        halfAngleRad: Double,
        fromMeters: Double,
        toMeters: Double,
        minHalfWidthMeters: Double,
    ): Int = grid.clearWedge(
        worldX, worldY, centerAngleRad, halfAngleRad, fromMeters, toMeters, minHalfWidthMeters,
    )

    /** Hands a measured direction to the grid: blocked from [fromMeters] on. */
    fun blockWedge(
        worldX: Double,
        worldY: Double,
        centerAngleRad: Double,
        halfAngleRad: Double,
        fromMeters: Double,
        toMeters: Double,
    ): Int = grid.blockWedge(
        worldX, worldY, centerAngleRad, halfAngleRad, fromMeters, toMeters,
    )

    fun clearObstacles() = grid.clearTemporaryBlocks()

    private fun length(points: List<Pair<Double, Double>>): Double =
        points.zipWithNext().sumOf { (a, b) -> hypot(b.first - a.first, b.second - a.second) }

    private companion object {
        const val TAG = "RoutePlanner"
    }
}
