package de.labland.vergil.navigation

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

/**
 * A barrier the planner lays into its grid while the robot is blocked, so the
 * next route has to go around instead of through.
 */
sealed class Barrier {

    /**
     * A straight bar across the route.
     *
     * @property x centre, world metres
     * @property y centre, world metres
     * @property dirX direction of the bar itself (not of the route), normalised
     * @property dirY direction of the bar itself, normalised
     * @property lengthMeters length of the bar, without any safety margin
     * @property thicknessMeters thickness of the bar, without any safety margin;
     *   the grid draws it as an odd number of cells, see [RoutePlanner.lay]
     */
    data class Line(
        val x: Double,
        val y: Double,
        val dirX: Double,
        val dirY: Double,
        val lengthMeters: Double,
        val thicknessMeters: Double,
    ) : Barrier()

    /**
     * An arc that bulges in the drive direction.
     *
     * @property x centre of the arc's circle, world metres
     * @property y centre of the arc's circle, world metres
     * @property dirX drive direction, normalised
     * @property dirY drive direction, normalised
     * @property radiusMeters radius of the circle
     * @property spanDegrees how much of the circle is drawn, centred on the drive direction
     * @property thicknessMeters thickness of the drawn arc
     */
    data class Arc(
        val x: Double,
        val y: Double,
        val dirX: Double,
        val dirY: Double,
        val radiusMeters: Double,
        val spanDegrees: Double,
        val thicknessMeters: Double,
    ) : Barrier()
}

/**
 * Where a barrier lies when the robot is blocked.
 *
 * The line is the first answer: a bar across the route ahead that closes the
 * aisle, so the next route takes another one. The arc is the escalation when
 * the lines together leave no way, moving closer to the robot with every stage.
 *
 * Neither carries the safety margin: a barrier lies in the grid as large as
 * asked, one setting for one size (Sebastian, 2026-11-15).
 */
object Barriers {

    /** Spacing of the points the route is sampled at. */
    const val SAMPLE_METERS = 0.5

    /** The robot keeps at least this distance from the line's rectangle. */
    const val ROBOT_CLEARANCE_METERS = 0.40

    /**
     * A position this close to the route counts as on it, for [reached].
     * Wider than the robot's sway and the corners the handover cuts, narrower
     * than the detour round a block that its own navigation takes.
     */
    const val ON_ROUTE_METERS = 0.5

    /** Distance of the first arc's circle centre ahead of the robot. */
    const val ARC_FIRST_DISTANCE_METERS = 0.60

    /** No arc comes closer than this. */
    const val ARC_MIN_DISTANCE_METERS = 0.35

    /** Each further stage moves the arc this much closer. */
    const val ARC_STEP_METERS = 0.05

    const val ARC_RADIUS_METERS = 0.6
    const val ARC_SPAN_DEGREES = 200.0
    const val ARC_THICKNESS_METERS = 0.15

    /** The last stage that is tried. */
    const val MAX_ARC_STAGE = 5

    /**
     * Lays a line across the route ahead of where the robot got on it.
     *
     * Samples the route, takes the sample nearest [reached] and walks forward
     * to the first sample where the line keeps [ROBOT_CLEARANCE_METERS] from
     * the robot. The line stands across the leg that arrives at that sample.
     *
     * The planner moves the robot as a point on the map inflated by the safety
     * margin. To close an aisle, the line has to span its free band, the
     * aisle's width less twice the margin; a shorter one leaves a gap at an
     * end that the point slips through.
     *
     * @param route the route as world points, robot first
     * @param robotX where the robot stands now; the line keeps its distance
     * @param lengthMeters length of the line in the grid
     * @param thicknessMeters thickness of the line in the grid
     * @param reached where along the route the robot got, see [reached]; the
     *   robot's own position when it never left the route
     * @return the line, or `null` when the route ends before the clearance
     */
    fun line(
        route: List<Pair<Double, Double>>,
        robotX: Double,
        robotY: Double,
        lengthMeters: Double,
        thicknessMeters: Double,
        reached: Pair<Double, Double> = robotX to robotY,
    ): Barrier.Line? {
        val samples = PathSimplifier.samplePathAtInterval(route, SAMPLE_METERS)
        if (samples.size < 2) return null

        val nearest = nearestIndex(samples, reached.first, reached.second)

        for (k in nearest + 1 until samples.size) {
            val dx = samples[k].first - samples[k - 1].first
            val dy = samples[k].second - samples[k - 1].second
            val d = hypot(dx, dy)
            if (d < 1e-6) continue
            val lineDirX = -dy / d
            val lineDirY = dx / d
            val line = Barrier.Line(samples[k].first, samples[k].second, lineDirX, lineDirY, lengthMeters, thicknessMeters)
            if (distanceToLine(line, robotX, robotY) >= ROBOT_CLEARANCE_METERS) return line
        }
        return null
    }

    /**
     * The point of [route] farthest along that the robot got while it was on
     * the route.
     *
     * This is where it met what blocked it. The robot's own navigation does
     * not stop there: it turns and looks for a way round, through another
     * aisle if need be, until the leg runs out. Where the robot stands then
     * says nothing about the obstacle; on 2026-11-15 a line laid from there
     * lay a metre before or past it (drive 47).
     *
     * @param route the route as world points, robot first
     * @param driven the robot's positions since it set off on [route], in order
     * @return the point on the route, or `null` when no position came within
     *   [ON_ROUTE_METERS] of it
     */
    fun reached(route: List<Pair<Double, Double>>, driven: List<Pair<Double, Double>>): Pair<Double, Double>? {
        var best: Pair<Double, Double>? = null
        var bestAlong = Double.NEGATIVE_INFINITY
        for ((px, py) in driven) {
            val (along, point, distance) = nearestOnRoute(route, px, py) ?: continue
            if (distance <= ON_ROUTE_METERS && along > bestAlong) {
                bestAlong = along
                best = point
            }
        }
        return best
    }

    /** How far along [route] the point nearest (px, py) lies, that point, and its distance. */
    private fun nearestOnRoute(route: List<Pair<Double, Double>>, px: Double, py: Double): Triple<Double, Pair<Double, Double>, Double>? {
        var best: Triple<Double, Pair<Double, Double>, Double>? = null
        var start = 0.0
        for (i in 1 until route.size) {
            val (ax, ay) = route[i - 1]
            val (bx, by) = route[i]
            val dx = bx - ax
            val dy = by - ay
            val lengthSquared = dx * dx + dy * dy
            val t = if (lengthSquared < 1e-12) 0.0 else (((px - ax) * dx + (py - ay) * dy) / lengthSquared).coerceIn(0.0, 1.0)
            val qx = ax + t * dx
            val qy = ay + t * dy
            val distance = hypot(px - qx, py - qy)
            if (best == null || distance < best.third) best = Triple(start + t * kotlin.math.sqrt(lengthSquared), qx to qy, distance)
            start += kotlin.math.sqrt(lengthSquared)
        }
        return best
    }

    /**
     * The arc of the given escalation stage.
     *
     * Bulges along the route's first leg ahead of the robot, or towards the
     * goal when the route has no two distinct points. Stage 1 sits
     * [ARC_FIRST_DISTANCE_METERS] ahead; every further stage is
     * [ARC_STEP_METERS] closer, never closer than [ARC_MIN_DISTANCE_METERS].
     */
    fun arc(
        route: List<Pair<Double, Double>>,
        robotX: Double,
        robotY: Double,
        goalX: Double,
        goalY: Double,
        stage: Int,
    ): Barrier.Arc {
        val samples = PathSimplifier.samplePathAtInterval(route, SAMPLE_METERS)
        var dirX = goalX - robotX
        var dirY = goalY - robotY
        if (samples.size >= 2) {
            val i0 = nearestIndex(samples, robotX, robotY)
            // At the last sample there is no next one: use the leg that arrived.
            val (a, b) = if (i0 + 1 < samples.size) samples[i0] to samples[i0 + 1] else samples[i0 - 1] to samples[i0]
            if (hypot(b.first - a.first, b.second - a.second) > 1e-6) {
                dirX = b.first - a.first
                dirY = b.second - a.second
            }
        }
        val norm = hypot(dirX, dirY)
        if (norm < 1e-9) {
            dirX = 1.0
            dirY = 0.0
        } else {
            dirX /= norm
            dirY /= norm
        }

        val distance = max(ARC_MIN_DISTANCE_METERS, ARC_FIRST_DISTANCE_METERS - (stage - 1) * ARC_STEP_METERS)
        return Barrier.Arc(
            x = robotX + distance * dirX,
            y = robotY + distance * dirY,
            dirX = dirX,
            dirY = dirY,
            radiusMeters = ARC_RADIUS_METERS,
            spanDegrees = ARC_SPAN_DEGREES,
            thicknessMeters = ARC_THICKNESS_METERS,
        )
    }

    private fun nearestIndex(samples: List<Pair<Double, Double>>, x: Double, y: Double): Int {
        var best = 0
        var bestDistance = Double.MAX_VALUE
        for ((i, p) in samples.withIndex()) {
            val d = hypot(p.first - x, p.second - y)
            if (d < bestDistance) {
                bestDistance = d
                best = i
            }
        }
        return best
    }

    /** Distance from a point to the line's rectangle; zero inside. */
    internal fun distanceToLine(line: Barrier.Line, px: Double, py: Double): Double {
        val rx = px - line.x
        val ry = py - line.y
        val along = abs(rx * line.dirX + ry * line.dirY) - line.lengthMeters / 2
        val across = abs(-rx * line.dirY + ry * line.dirX) - line.thicknessMeters / 2
        return hypot(max(along, 0.0), max(across, 0.0))
    }
}
