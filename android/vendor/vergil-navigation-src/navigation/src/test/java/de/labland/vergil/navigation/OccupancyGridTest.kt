package de.labland.vergil.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * These tests pin down the coordinate conversion. It is the trickiest part of
 * the whole module: the Y axis is mirrored, because a PGM image counts top to
 * bottom and the robot world bottom to top. A sign error here reliably sends
 * the robot into the wrong half of the hall without anything crashing.
 */
class OccupancyGridTest {

    private fun freeGrid(
        width: Int = 20,
        height: Int = 10,
        resolution: Double = 0.05,
        originX: Double = 0.0,
        originY: Double = 0.0,
    ) = OccupancyGrid(width, height, resolution, originX, originY).apply {
        for (y in 0 until height) for (x in 0 until width) setCell(x, y, OccupancyGrid.PASSABLE)
    }

    @Test
    fun `a fresh grid is completely blocked`() {
        // Intent: unknown ground counts as impassable, not as free.
        val grid = OccupancyGrid(4, 4, 0.05, 0.0, 0.0)
        assertFalse(grid.isPassable(2, 2))
        assertEquals(16, grid.getStats().blockedCells)
    }

    @Test
    fun `world and grid coordinates are inverse to each other`() {
        val grid = freeGrid(width = 100, height = 60, resolution = 0.05, originX = -2.0, originY = -1.5)
        val (gx, gy) = assertNotNull(grid.worldToGrid(0.4, 0.25))
        val (wx, wy) = assertNotNull(grid.gridToWorld(gx, gy))
        assertEquals(0.4, wx, 0.05)
        assertEquals(0.25, wy, 0.05)
    }

    @Test
    fun `the Y axis is mirrored`() {
        // A larger world Y has to produce a SMALLER image row.
        val grid = freeGrid(width = 100, height = 60)
        val lower = assertNotNull(grid.worldToGrid(1.0, 0.5))
        val upper = assertNotNull(grid.worldToGrid(1.0, 1.5))
        assertTrue(upper.second < lower.second, "a larger world Y has to sit higher in the image")
        assertEquals(lower.first, upper.first, "the same world X must not change the column")
    }

    @Test
    fun `points outside the map return null instead of a white lie`() {
        val grid = freeGrid(width = 20, height = 10)
        assertNull(grid.worldToGrid(-5.0, 0.1))
        assertNull(grid.gridToWorld(999, 0))
    }

    @Test
    fun `outside the map counts as blocked`() {
        val grid = freeGrid()
        assertFalse(grid.isPassable(-1, 0))
        assertFalse(grid.isPassable(0, -1))
        assertEquals(OccupancyGrid.BLOCKED, grid.getCell(999, 999))
    }

    @Test
    fun `a temporary block covers a circle and can be taken back`() {
        val grid = freeGrid(width = 40, height = 40)
        grid.addTemporaryBlock(20, 20, radiusPixels = 3)

        assertFalse(grid.isPassable(20, 20))
        assertFalse(grid.isPassable(22, 20))
        assertTrue(grid.isPassable(20, 30), "outside the radius has to stay free")

        grid.clearTemporaryBlocks()
        assertTrue(grid.isPassable(20, 20))
        assertEquals(0, grid.getTemporaryBlockCount())
    }

    @Test
    fun `a temporary block does not change the map itself`() {
        // Important for the avoidance logic: it has to be able to tell a wall
        // from a person currently standing in the way.
        val grid = freeGrid(width = 40, height = 40)
        grid.addTemporaryBlock(20, 20, radiusPixels = 3)
        assertFalse(grid.isKnownMapObstacle(20, 20, checkRadius = 1))
    }

    @Test
    fun `inflation lays a safety margin around obstacles`() {
        val grid = freeGrid(width = 40, height = 40)
        grid.setCell(20, 20, OccupancyGrid.BLOCKED)

        assertTrue(grid.isPassable(22, 20))
        grid.inflateObstacles(radiusPixels = 3)
        assertFalse(grid.isPassable(22, 20), "the margin has to block the neighbour")
        assertTrue(grid.isPassable(30, 20), "far away stays free")
    }

    @Test
    fun `inflation leaves the original map untouched`() {
        val grid = freeGrid(width = 40, height = 40)
        grid.setCell(20, 20, OccupancyGrid.BLOCKED)
        grid.inflateObstacles(radiusPixels = 3)

        assertEquals(OccupancyGrid.BLOCKED, grid.getOriginalCell(20, 20))
        assertEquals(OccupancyGrid.PASSABLE, grid.getOriginalCell(22, 20))
    }

    @Test
    fun `inflation only takes effect once`() {
        // Inflating twice would double the margin and close passages that are
        // in truth wide enough.
        val grid = freeGrid(width = 40, height = 40)
        grid.setCell(20, 20, OccupancyGrid.BLOCKED)
        grid.inflateObstacles(radiusPixels = 3)
        val afterFirst = grid.getStats().blockedCells

        grid.inflateObstacles(radiusPixels = 3)
        assertEquals(afterFirst, grid.getStats().blockedCells)
    }

    @Test
    fun `the margin is a circle, not a square`() {
        // The fast version builds the circle from precomputed row widths. If
        // that accidentally becomes a square, it blocks about 40 percent too
        // much in every corner and makes passages impassable that are not.
        val grid = freeGrid(width = 41, height = 41)
        grid.setCell(20, 20, OccupancyGrid.BLOCKED)
        grid.inflateObstacles(radiusPixels = 5)

        assertFalse(grid.isPassable(25, 20), "exactly 5 cells away has to be blocked")
        assertFalse(grid.isPassable(20, 25))
        assertTrue(grid.isPassable(24, 24), "the corner of the bounding square lies outside the circle")
        assertTrue(grid.isPassable(26, 20), "6 cells away is outside the radius")
    }

    @Test
    fun `obstacles without a free neighbour cost no work and change nothing`() {
        // Interior cells of a large blocked area are skipped. The result still
        // has to be right: the margin sits on the outside.
        val grid = OccupancyGrid(30, 30, 0.05, 0.0, 0.0)
        for (y in 0 until 30) for (x in 0 until 30) {
            grid.setCell(x, y, if (x in 10..19 && y in 10..19) OccupancyGrid.BLOCKED else OccupancyGrid.PASSABLE)
        }
        grid.inflateObstacles(radiusPixels = 3)

        assertFalse(grid.isPassable(15, 15), "the inside stays blocked")
        assertFalse(grid.isPassable(15, 8), "two cells above the block is inside the margin")
        assertTrue(grid.isPassable(15, 5), "five cells above is free")
    }

    @Test
    fun `inflation stays fast enough for the robot`() {
        // On a LuckiBot the original version took 56 seconds. The development
        // machine is roughly ten times faster than the device, and the bound
        // is measured accordingly.
        val grid = OccupancyGrid(1120, 600, 0.05, 0.0, 0.0)
        for (y in 0 until 600) for (x in 0 until 1120) {
            val wall = x % 137 < 3 || y % 91 < 3
            grid.setCell(x, y, if (wall) OccupancyGrid.BLOCKED else OccupancyGrid.PASSABLE)
        }

        val started = System.currentTimeMillis()
        grid.inflateObstacles(radiusPixels = 8)
        val elapsed = System.currentTimeMillis() - started

        println("Inflation 1120x600, radius 8: $elapsed ms")
        assertTrue(elapsed < 600, "inflation takes $elapsed ms, on the robot that would be a minute")
    }

    /**
     * A grid that is blocked everywhere, with the robot standing in the middle
     * of it. That is the situation the carving exists for: an aged map that
     * shows a wall where the sensor now measures a way through.
     */
    private fun blockedGrid() = OccupancyGrid(200, 200, 0.05, -5.0, -5.0)

    @Test
    fun `a carved wedge makes blocked ground passable`() {
        val grid = blockedGrid()
        val cone = Math.toRadians(15.0)

        // Looking east, clear out to two metres.
        grid.clearWedge(0.0, 0.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)

        val (x, y) = assertNotNull(grid.worldToGrid(1.5, 0.0))
        assertTrue(grid.isPassable(x, y), "the middle of the measured cone has to be free")
    }

    @Test
    fun `a carved wedge stops where the measurement stopped`() {
        val grid = blockedGrid()
        val cone = Math.toRadians(15.0)

        grid.clearWedge(0.0, 0.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)

        // Half a metre beyond the measured clearance nothing was looked at, and
        // unlooked-at ground stays blocked. This is the property the whole
        // mechanism hangs on.
        val (x, y) = assertNotNull(grid.worldToGrid(2.5, 0.0))
        assertFalse(grid.isPassable(x, y), "beyond the measurement nothing may be freed")
    }

    @Test
    fun `a carved wedge stays inside its opening angle`() {
        val grid = blockedGrid()
        val cone = Math.toRadians(15.0)

        grid.clearWedge(0.0, 0.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)

        // 45 degrees off the measured direction, at the same distance: this is
        // the neighbouring sector's business, not ours.
        val angle = Math.toRadians(45.0)
        val (x, y) = assertNotNull(
            grid.worldToGrid(2.0 * kotlin.math.cos(angle), 2.0 * kotlin.math.sin(angle)),
        )
        assertFalse(grid.isPassable(x, y), "sideways past the cone nothing may be freed")
    }

    @Test
    fun `close to the robot a carved lane is at least as wide as the robot`() {
        val grid = blockedGrid()
        // A cone this narrow is 9 cm across at half a metre. Without the floor
        // the planner would be handed a lane the robot does not fit through.
        val cone = Math.toRadians(5.0)

        grid.clearWedge(0.0, 0.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)

        val (x, y) = assertNotNull(grid.worldToGrid(0.5, 0.25))
        assertTrue(grid.isPassable(x, y), "25 cm sideways at half a metre has to be free")
    }

    @Test
    fun `a measurement outranks our own stamp, and a newer one outranks it back`() {
        val grid = freeGrid(width = 200, height = 200)
        val cone = Math.toRadians(15.0)
        val (x, y) = assertNotNull(grid.worldToGrid(1.5, 1.0))

        // The situation on 2026-08-13: a failed leg stamped a blockade, then
        // the next one, and the robot ended up walled in by its own phantoms.
        grid.addTemporaryBlock(x, y, radiusPixels = 12)
        assertFalse(grid.isPassable(x, y))

        // Measured free: the stamp has to go, not merely be outvoted.
        grid.clearWedge(1.0, 1.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)
        assertTrue(grid.isPassable(x, y), "a measurement has to beat our own stamp")

        // And measured blocked afterwards, it is blocked again. Whatever was
        // measured last wins, in both directions.
        grid.blockWedge(1.0, 1.0, 0.0, cone, 0.4, 1.0)
        assertFalse(grid.isPassable(x, y), "the newer measurement has to win")
    }

    @Test
    fun `clearing the temporary blocks forgets the measurement as well`() {
        val grid = blockedGrid()
        val cone = Math.toRadians(15.0)
        grid.clearWedge(0.0, 0.0, 0.0, cone, 0.0, 2.0, minHalfWidthMeters = 0.3)

        val (x, y) = assertNotNull(grid.worldToGrid(1.5, 0.0))
        assertTrue(grid.isPassable(x, y))

        // Both are knowledge from this one drive and both age at the same rate.
        // Keeping half of the picture would be worse than keeping none.
        grid.clearTemporaryBlocks()
        assertFalse(grid.isPassable(x, y), "the retreat wants a clean sheet")
    }

    @Test
    fun `an empty wedge changes nothing`() {
        val grid = blockedGrid()
        val cone = Math.toRadians(15.0)
        // Reversed bounds. Happens as soon as the clearance is smaller than the
        // safety margin subtracted from it.
        assertEquals(0, grid.clearWedge(0.0, 0.0, 0.0, cone, 2.0, 1.0))
    }
}
