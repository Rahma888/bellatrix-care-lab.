package de.labland.vergil.navigation

import kotlin.math.hypot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The check that matters runs against the real office map. A planner that
 * works on a 10x4 toy map says nothing about whether it finds its way through
 * a 56 meter hall full of furniture.
 */
class RoutePlannerTest {

    private companion object {
        // Read and inflate the map once per test run. Inflation costs several
        // seconds on 1120x600 cells, so doing it per test would make the suite
        // a minute long, and then nobody runs it any more.
        val bytes: ByteArray by lazy {
            checkNotNull(RoutePlannerTest::class.java.getResourceAsStream("/labland.pgm")).readBytes()
        }
        val sharedGrid: OccupancyGrid by lazy {
            PgmMap.parse(bytes, inflateRadiusMeters = PgmMap.DEFAULT_ROBOT_RADIUS_METERS)
        }
    }

    private fun realGrid() = sharedGrid

    // POIs from place.json of the same robot.
    private val couch = -3.685 to 1.775
    private val restroom = 22.924 to -0.279
    private val kitchen = 28.620 to -1.269
    private val entrance = -7.388 to -7.896

    @Test
    fun `a path is found across the hall`() {
        val planner = RoutePlanner(realGrid())
        val route = assertNotNull(
            planner.plan(couch.first, couch.second, kitchen.first, kitchen.second),
            "there has to be a path from the couch to the kitchen",
        )

        assertTrue(route.waypoints.size >= 2)
        assertTrue(route.lengthMeters > 30.0, "straight line is about 32 m, path was ${route.lengthMeters} m")
        assertTrue(route.lengthMeters < 80.0, "it is not that far: ${route.lengthMeters} m")
    }

    @Test
    fun `the route ends at the goal`() {
        val planner = RoutePlanner(realGrid())
        val route = assertNotNull(planner.plan(couch.first, couch.second, restroom.first, restroom.second))
        val goal = assertNotNull(route.goal)

        val distance = hypot(goal.x - restroom.first, goal.y - restroom.second)
        assertTrue(distance < 1.0, "route ends $distance m beside the goal")
    }

    @Test
    fun `no waypoint sits inside an obstacle`() {
        // The actual safety test: simplification must not create a shortcut
        // through a wall.
        val grid = realGrid()
        val planner = RoutePlanner(grid)
        val route = assertNotNull(planner.plan(entrance.first, entrance.second, kitchen.first, kitchen.second))

        for (wp in route.waypoints) {
            val cell = assertNotNull(grid.worldToGrid(wp.x, wp.y), "waypoint outside the map")
            assertTrue(
                grid.isPassable(cell.first, cell.second),
                "waypoint (${wp.x}, ${wp.y}) sits inside an obstacle",
            )
        }
    }

    @Test
    fun `waypoints have line of sight between them`() {
        // A waypoint can sit in the clear while the segment leading to it runs
        // through a wall. That is exactly what the robot would then attempt.
        val grid = realGrid()
        val planner = RoutePlanner(grid)
        val pathfinder = GridPathfinder(grid)
        val route = assertNotNull(planner.plan(couch.first, couch.second, kitchen.first, kitchen.second))

        route.waypoints.zipWithNext { a, b ->
            val ca = assertNotNull(grid.worldToGrid(a.x, a.y))
            val cb = assertNotNull(grid.worldToGrid(b.x, b.y))
            assertTrue(
                pathfinder.isLineClear(ca.first, ca.second, cb.first, cb.second),
                "segment from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) runs through an obstacle",
            )
        }
    }

    @Test
    fun `many cells become few waypoints`() {
        val planner = RoutePlanner(realGrid())
        val route = assertNotNull(planner.plan(couch.first, couch.second, kitchen.first, kitchen.second))

        assertTrue(
            route.waypoints.size < route.gridPath.size / 10,
            "too little simplified: ${route.gridPath.size} cells to ${route.waypoints.size} waypoints",
        )
        assertTrue(
            route.waypoints.size <= 40,
            "nobody drives that many waypoints: ${route.waypoints.size}",
        )
    }

    @Test
    fun `planning stays fast enough for operation`() {
        // The robot replans while driving. If that takes seconds, it stands in
        // the aisle meanwhile. The bound is deliberately generous, since the
        // robot computes slower than the development machine, but it should
        // fire if somebody accidentally makes the search quadratic.
        val planner = RoutePlanner(realGrid())
        planner.plan(couch.first, couch.second, restroom.first, restroom.second) // warm up

        val started = System.currentTimeMillis()
        repeat(5) { planner.plan(entrance.first, entrance.second, kitchen.first, kitchen.second) }
        val perRun = (System.currentTimeMillis() - started) / 5

        println("Planning across the hall: $perRun ms per run")
        assertTrue(perRun < 1000, "planning takes $perRun ms, too slow for continuous replanning")
    }

    @Test
    fun `a goal outside the map yields no path`() {
        val planner = RoutePlanner(realGrid())
        assertNull(planner.plan(couch.first, couch.second, 500.0, 500.0))
    }

    @Test
    fun `a blocked aisle forces a different path`() {
        val grid = realGrid()
        val planner = RoutePlanner(grid)
        val before = assertNotNull(planner.plan(couch.first, couch.second, kitchen.first, kitchen.second))

        // Block the middle of the route, the way a parked pallet would.
        val middle = before.waypoints[before.waypoints.size / 2]
        // The grid is shared between all tests, since loading the real map
        // costs seconds. Without finally the block would survive a failed
        // assertion and make unrelated tests fail, and then the real defect is
        // no longer recognisable.
        try {
            planner.block(middle.x, middle.y, radiusMeters = 1.0)

            val after = planner.plan(couch.first, couch.second, kitchen.first, kitchen.second)
            if (after != null) {
                val nearObstacle = after.waypoints.any {
                    hypot(it.x - middle.x, it.y - middle.y) < 0.5
                }
                assertTrue(!nearObstacle, "the new route still runs through the obstacle")
            }
        } finally {
            planner.clearObstacles()
        }
        assertNotNull(
            planner.plan(couch.first, couch.second, kitchen.first, kitchen.second),
            "after clearing, the old path has to be back",
        )
    }

    @Test
    fun `subdivision keeps the maximum spacing`() {
        val planner = RoutePlanner(realGrid())
        val coarse = assertNotNull(planner.plan(couch.first, couch.second, kitchen.first, kitchen.second))
        val fine = assertNotNull(
            planner.plan(couch.first, couch.second, kitchen.first, kitchen.second, maxLegMeters = 1.5),
        )

        assertTrue(fine.waypoints.size > coarse.waypoints.size, "points have to have been added")
        // A single leg may stay longer when the intermediate point was
        // discarded at a corner, because safety comes before regularity. The
        // normal case still has to hold.
        val lengths = fine.waypoints.zipWithNext { a, b -> hypot(b.x - a.x, b.y - a.y) }
        val tooLong = lengths.count { it > 1.5 + 1e-6 }
        assertTrue(
            tooLong <= lengths.size / 10,
            "$tooLong of ${lengths.size} legs longer than 1.5 m",
        )
    }

    @Test
    fun `subdivision leaves the route clear`() {
        // Intermediate points sit on the connecting line of a leg that was
        // already clear, and that has to hold after splitting it too.
        val grid = realGrid()
        val planner = RoutePlanner(grid)
        val pathfinder = GridPathfinder(grid)
        val route = assertNotNull(
            planner.plan(entrance.first, entrance.second, kitchen.first, kitchen.second, maxLegMeters = 1.0),
        )

        for (wp in route.waypoints) {
            val cell = assertNotNull(grid.worldToGrid(wp.x, wp.y))
            assertTrue(grid.isPassable(cell.first, cell.second), "intermediate point sits inside an obstacle")
        }
        route.waypoints.zipWithNext { a, b ->
            val ca = assertNotNull(grid.worldToGrid(a.x, a.y))
            val cb = assertNotNull(grid.worldToGrid(b.x, b.y))
            assertTrue(pathfinder.isLineClear(ca.first, ca.second, cb.first, cb.second))
        }
    }

    @Test
    fun `subdivision does not change start and end`() {
        val planner = RoutePlanner(realGrid())
        val coarse = assertNotNull(planner.plan(couch.first, couch.second, restroom.first, restroom.second))
        val fine = assertNotNull(
            planner.plan(couch.first, couch.second, restroom.first, restroom.second, maxLegMeters = 1.0),
        )

        assertEquals(coarse.waypoints.first().x, fine.waypoints.first().x, 1e-9)
        assertEquals(coarse.waypoints.last().x, fine.waypoints.last().x, 1e-9)
        assertEquals(coarse.waypoints.last().y, fine.waypoints.last().y, 1e-9)
    }
}
