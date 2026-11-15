package de.labland.vergil.navigation

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Path planning on synthesised miniature maps. Every test describes a store
 * situation that occurs in real operation: a wall with a gap, a blocked aisle,
 * a goal inside a shelf.
 */
class GridPathfinderTest {

    /**
     * Builds a grid from a text map. `.` is free, `#` blocked. Row 0 of the
     * drawing is image row 0, so the top.
     */
    private fun gridOf(vararg rows: String): OccupancyGrid {
        val height = rows.size
        val width = rows[0].length
        require(rows.all { it.length == width }) { "all rows must have the same length" }
        val grid = OccupancyGrid(width, height, resolution = 0.05, originX = 0.0, originY = 0.0)
        for (y in 0 until height) {
            for (x in 0 until width) {
                grid.setCell(x, y, if (rows[y][x] == '#') OccupancyGrid.BLOCKED else OccupancyGrid.PASSABLE)
            }
        }
        return grid
    }

    /** Converts a grid cell into the world coordinates of its centre. */
    private fun world(grid: OccupancyGrid, x: Int, y: Int): Pair<Double, Double> =
        assertNotNull(grid.gridToWorld(x, y))

    private fun findPath(grid: OccupancyGrid, from: Pair<Int, Int>, to: Pair<Int, Int>) =
        GridPathfinder(grid).let { pf ->
            val (sx, sy) = world(grid, from.first, from.second)
            val (gx, gy) = world(grid, to.first, to.second)
            pf.findPath(sx, sy, gx, gy)
        }

    @Test
    fun `open space yields a path`() {
        val grid = gridOf(
            "..........",
            "..........",
            "..........",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 3))
        assertTrue(path.gridPath.isNotEmpty())
        assertEquals(0 to 0, path.gridPath.first())
        assertEquals(9 to 3, path.gridPath.last())
    }

    @Test
    fun `the path touches no blocked cell`() {
        val grid = gridOf(
            "..........",
            "####.#####",
            "..........",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 3))
        for ((x, y) in path.gridPath) {
            assertTrue(grid.isPassable(x, y), "path runs through blocked cell ($x, $y)")
        }
    }

    @Test
    fun `the path takes the only gap`() {
        // A wall across the store with exactly one gap at x=4.
        val grid = gridOf(
            "..........",
            "####.#####",
            "..........",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 3))
        assertTrue(path.gridPath.contains(4 to 1), "the path has to lead through the gap")
    }

    @Test
    fun `without a gap there is no path`() {
        val grid = gridOf(
            "..........",
            "##########",
            "..........",
        )
        assertNull(findPath(grid, 0 to 0, 9 to 2))
    }

    @Test
    fun `every step is a step to a neighbour`() {
        // A jump across several cells would be a planning error that the robot
        // would execute as a straight drive through a wall.
        val grid = gridOf(
            "..........",
            "..####....",
            "..........",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 3))
        path.gridPath.zipWithNext { a, b ->
            assertTrue(
                abs(a.first - b.first) <= 1 && abs(a.second - b.second) <= 1,
                "jump from $a to $b",
            )
        }
    }

    @Test
    fun `grid path and world path have the same length`() {
        val grid = gridOf(
            "..........",
            "..........",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 2))
        assertEquals(path.gridPath.size, path.worldPath.size)
    }

    @Test
    fun `a blocked goal is pulled to the nearest free cell`() {
        // The case from the store: the POI sits inside the shelf because it
        // was set on the edge during surveying. Giving up would be the worst
        // answer, the robot is supposed to drive in front of it.
        val grid = gridOf(
            "..........",
            "..........",
            "....##....",
            "..........",
        )
        val path = assertNotNull(findPath(grid, 0 to 0, 4 to 2))
        assertTrue(grid.isPassable(path.gridPath.last().first, path.gridPath.last().second))
    }

    @Test
    fun `a blocked start stays the start of the path`() {
        // When the robot stands inside the safety margin, the path still has
        // to begin at the robot, otherwise it turns towards a point next to
        // itself.
        val grid = gridOf(
            "..........",
            "..........",
            "..........",
        )
        grid.addTemporaryBlock(0, 0, radiusPixels = 1)
        val path = assertNotNull(findPath(grid, 0 to 0, 9 to 2))
        assertEquals(0 to 0, path.gridPath.first())
    }

    @Test
    fun `a temporary block forces a different path`() {
        val grid = gridOf(
            "..........",
            "..........",
            "..........",
            "..........",
        )
        val direct = assertNotNull(findPath(grid, 0 to 1, 9 to 1))
        // Do not pin this to a specific cell: at equal cost the choice of A*
        // is arbitrary. Instead block a cell that the found path demonstrably
        // uses.
        val (bx, by) = direct.gridPath[direct.gridPath.size / 2]

        grid.addTemporaryBlock(bx, by, radiusPixels = 1)
        val detour = assertNotNull(findPath(grid, 0 to 1, 9 to 1))
        assertTrue(detour.gridPath.none { it == (bx to by) }, "the block was ignored")
    }

    @Test
    fun `diagonals do not cut corners`() {
        // Two diagonally placed walls must not be crossed diagonally, because
        // the robot is wider than a point.
        val grid = gridOf(
            "....",
            ".#..",
            "..#.",
            "....",
        )
        val path = assertNotNull(findPath(grid, 0 to 1, 3 to 2))
        val cuts = path.gridPath.zipWithNext().any { (a, b) ->
            a.first != b.first && a.second != b.second &&
                !grid.isPassable(a.first, b.second) && !grid.isPassable(b.first, a.second)
        }
        assertTrue(!cuts, "path cuts a corner between two obstacles")
    }

    @Test
    fun `line of sight detects a wall in between`() {
        val grid = gridOf(
            "..........",
            "####.#####",
            "..........",
        )
        val pf = GridPathfinder(grid)
        assertTrue(pf.isLineClear(4, 0, 4, 2), "through the gap has to be clear")
        assertTrue(!pf.isLineClear(0, 0, 0, 2), "through the wall must not be clear")
    }
}
