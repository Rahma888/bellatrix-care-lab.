package de.labland.vergil.navigation

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * PathSimplifier: Reduces path points using Douglas-Peucker algorithm
 *
 * Grid A* produces a point for every pixel visited (potentially 1000+ points).
 * This simplifier reduces them to just the essential waypoints (typically 5-15).
 *
 * Benefits:
 * - Fewer waypoints = smoother cruise navigation
 * - Only keeps points where direction changes significantly
 * - Preserves path accuracy within epsilon tolerance
 */
object PathSimplifier {

    private const val TAG = "PathSimplifier"

    /**
     * Simplified waypoint with position and heading
     */
    data class Waypoint(
        val x: Double,          // X in meters
        val y: Double,          // Y in meters
        val heading: Double     // Heading in radians (optional, for smooth turning)
    )

    /**
     * Simplify a path using Douglas-Peucker algorithm
     *
     * @param path List of (x, y) points in world coordinates (meters)
     * @param epsilon Maximum deviation allowed in meters (default 0.3m = 30cm)
     * @return Simplified list of waypoints
     */
    fun simplifyPath(
        path: List<Pair<Double, Double>>,
        epsilon: Double = 0.3
    ): List<Waypoint> {
        if (path.size <= 2) {
            NavLog.d(TAG, "Path too short to simplify (${path.size} points)")
            return path.mapIndexed { index, (x, y) ->
                Waypoint(x, y, calculateHeading(path, index))
            }
        }

        NavLog.d(TAG, "Simplifying path: ${path.size} points, epsilon=${epsilon}m")

        // Douglas-Peucker algorithm
        val simplified = douglasPeucker(path, epsilon)

        // Convert to waypoints with headings
        val waypoints = simplified.mapIndexed { index, (x, y) ->
            Waypoint(x, y, calculateHeading(simplified, index))
        }

        NavLog.i(TAG, "✅ Simplified: ${path.size} → ${waypoints.size} waypoints (${String.format(java.util.Locale.ROOT, "%.1f", 100.0 * waypoints.size / path.size)}%)")

        return waypoints
    }

    /**
     * Douglas-Peucker recursive simplification
     */
    private fun douglasPeucker(
        points: List<Pair<Double, Double>>,
        epsilon: Double
    ): List<Pair<Double, Double>> {
        if (points.size <= 2) return points

        // Find point with maximum distance from line (start → end)
        var maxDist = 0.0
        var maxIndex = 0

        val start = points.first()
        val end = points.last()

        for (i in 1 until points.size - 1) {
            val dist = perpendicularDistance(points[i], start, end)
            if (dist > maxDist) {
                maxDist = dist
                maxIndex = i
            }
        }

        // If max distance exceeds epsilon, recursively simplify
        return if (maxDist > epsilon) {
            val left = douglasPeucker(points.subList(0, maxIndex + 1), epsilon)
            val right = douglasPeucker(points.subList(maxIndex, points.size), epsilon)
            // Combine, avoiding duplicate at split point
            left.dropLast(1) + right
        } else {
            // All points within epsilon - keep only start and end
            listOf(start, end)
        }
    }

    /**
     * Calculate perpendicular distance from point to line
     */
    private fun perpendicularDistance(
        point: Pair<Double, Double>,
        lineStart: Pair<Double, Double>,
        lineEnd: Pair<Double, Double>
    ): Double {
        val dx = lineEnd.first - lineStart.first
        val dy = lineEnd.second - lineStart.second

        val length = sqrt(dx * dx + dy * dy)
        if (length == 0.0) return 0.0

        // Distance = |cross product| / |line length|
        return abs(
            dy * point.first - dx * point.second +
            lineEnd.first * lineStart.second - lineEnd.second * lineStart.first
        ) / length
    }

    /**
     * Calculate heading (direction) at a point in the path
     * Returns angle in radians from positive X axis
     */
    private fun calculateHeading(
        path: List<Pair<Double, Double>>,
        index: Int
    ): Double {
        val (x, y) = path[index]

        // Use next point for heading (or previous if at end)
        val (nextX, nextY) = when {
            index < path.size - 1 -> path[index + 1]
            index > 0 -> path[index] // At end, keep same direction
            else -> Pair(x + 1.0, y) // Single point, default to east
        }

        return atan2(nextY - y, nextX - x)
    }

    /**
     * Alternative simplification using line-of-sight
     * Only keeps points where we need to turn (can't see next waypoint)
     *
     * @param pathfinder The pathfinder to check line visibility
     * @param gridPath Path in grid coordinates
     * @param grid The occupancy grid
     * @return Simplified path in grid coordinates
     */
    fun simplifyByLineOfSight(
        pathfinder: GridPathfinder,
        gridPath: List<Pair<Int, Int>>
    ): List<Pair<Int, Int>> {
        if (gridPath.size <= 2) return gridPath

        val result = mutableListOf<Pair<Int, Int>>()
        result.add(gridPath.first())

        var lastAdded = 0

        for (i in 2 until gridPath.size) {
            val from = gridPath[lastAdded]
            val to = gridPath[i]

            // Can we see directly to this point?
            if (!pathfinder.isLineClear(from.first, from.second, to.first, to.second)) {
                // No - add the previous point as a waypoint
                result.add(gridPath[i - 1])
                lastAdded = i - 1
            }
        }

        // Always add the goal
        result.add(gridPath.last())

        NavLog.d(TAG, "Line-of-sight simplification: ${gridPath.size} → ${result.size} points")
        return result
    }

    /**
     * Sample a path at regular intervals (e.g., every 50cm)
     *
     * This creates evenly-spaced points along the path for tracking purposes.
     * Used for precise obstacle blocking - when blocked, we know exactly where on the path.
     *
     * @param path List of (x, y) points in world coordinates (meters)
     * @param intervalMeters Distance between sample points (default 0.5m = 50cm)
     * @return List of evenly-spaced points along the path
     */
    fun samplePathAtInterval(
        path: List<Pair<Double, Double>>,
        intervalMeters: Double = 0.5
    ): List<Pair<Double, Double>> {
        if (path.size < 2) return path

        val result = mutableListOf<Pair<Double, Double>>()
        result.add(path.first())

        var accumulated = 0.0

        for (i in 1 until path.size) {
            val prev = path[i - 1]
            val curr = path[i]
            val dx = curr.first - prev.first
            val dy = curr.second - prev.second
            val segmentDist = sqrt(dx * dx + dy * dy)

            if (segmentDist < 0.001) continue  // Skip zero-length segments

            var remaining = segmentDist
            var segmentStart = prev

            // Sample points along this segment
            while (accumulated + remaining >= intervalMeters) {
                val needed = intervalMeters - accumulated
                val t = needed / sqrt(
                    (curr.first - segmentStart.first).let { it * it } +
                    (curr.second - segmentStart.second).let { it * it }
                ).coerceAtLeast(0.001)

                val sampleX = segmentStart.first + t * (curr.first - segmentStart.first)
                val sampleY = segmentStart.second + t * (curr.second - segmentStart.second)
                result.add(Pair(sampleX, sampleY))

                segmentStart = Pair(sampleX, sampleY)
                remaining -= needed
                accumulated = 0.0
            }
            accumulated += remaining
        }

        // Add goal if not too close to last sample
        val last = result.last()
        val goal = path.last()
        val distToGoal = sqrt(
            (goal.first - last.first).let { it * it } +
            (goal.second - last.second).let { it * it }
        )
        if (distToGoal > 0.1) {
            result.add(goal)
        }

        NavLog.d(TAG, "Path sampling: ${path.size} points → ${result.size} points @ ${intervalMeters}m intervals")
        return result
    }

    /**
     * Smooth the path by adding intermediate points at sharp turns
     * Helps robot navigate corners more smoothly
     *
     * @param waypoints The simplified waypoints
     * @param minTurnRadius Minimum turn radius in meters
     * @return Smoothed waypoints
     */
    fun smoothCorners(
        waypoints: List<Waypoint>,
        minTurnRadius: Double = 0.5
    ): List<Waypoint> {
        if (waypoints.size <= 2) return waypoints

        val result = mutableListOf<Waypoint>()
        result.add(waypoints.first())

        for (i in 1 until waypoints.size - 1) {
            val prev = waypoints[i - 1]
            val curr = waypoints[i]
            val next = waypoints[i + 1]

            // Calculate turn angle
            val angle1 = atan2(curr.y - prev.y, curr.x - prev.x)
            val angle2 = atan2(next.y - curr.y, next.x - curr.x)
            var turnAngle = angle2 - angle1

            // Normalize to [-π, π]
            while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI
            while (turnAngle < -Math.PI) turnAngle += 2 * Math.PI

            // Sharp turn? Add smoothing points
            if (abs(turnAngle) > Math.PI / 4) { // > 45°
                // Add point slightly before corner
                val distBefore = minOf(
                    minTurnRadius,
                    sqrt((curr.x - prev.x) * (curr.x - prev.x) + (curr.y - prev.y) * (curr.y - prev.y)) * 0.3
                )
                val beforeX = curr.x - distBefore * kotlin.math.cos(angle1)
                val beforeY = curr.y - distBefore * kotlin.math.sin(angle1)
                result.add(Waypoint(beforeX, beforeY, angle1))

                // Add the corner point
                result.add(curr)

                // Add point slightly after corner
                val distAfter = minOf(
                    minTurnRadius,
                    sqrt((next.x - curr.x) * (next.x - curr.x) + (next.y - curr.y) * (next.y - curr.y)) * 0.3
                )
                val afterX = curr.x + distAfter * kotlin.math.cos(angle2)
                val afterY = curr.y + distAfter * kotlin.math.sin(angle2)
                result.add(Waypoint(afterX, afterY, angle2))
            } else {
                result.add(curr)
            }
        }

        result.add(waypoints.last())

        if (result.size > waypoints.size) {
            NavLog.d(TAG, "Corner smoothing: ${waypoints.size} → ${result.size} waypoints")
        }

        return result
    }
}
