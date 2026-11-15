package de.labland.vergil.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Against the real map of the LuckiBot from the LabLand office
 * (`Labland-0803102702`, 1120x600 pixels), plus synthesised files for the
 * special cases. A synthetic file alone would miss exactly the error that
 * matters: a misread trailer, which puts every world coordinate off by meters.
 */
class PgmMapTest {

    private fun realMap(): ByteArray =
        checkNotNull(javaClass.getResourceAsStream("/labland.pgm")) {
            "test map labland.pgm missing in src/test/resources"
        }.readBytes()

    @Test
    fun `a real robot map is read`() {
        val grid = PgmMap.parse(realMap(), inflateRadiusMeters = null)

        assertEquals(1120, grid.width)
        assertEquals(600, grid.height)
        assertEquals(0.05, grid.resolution, 1e-9, "Orionstar maps at 5 cm per pixel")
    }

    @Test
    fun `the file size adds up exactly`() {
        // Header + image data + 16 trailer bytes. If anything is left over, we
        // have misunderstood the format.
        val bytes = realMap()
        val header = "P5\n1120 600\n255\n".length
        assertEquals(header + 1120 * 600 + PgmMap.TRAILER_BYTES, bytes.size)
    }

    @Test
    fun `known POIs sit on passable ground`() {
        // Coordinates from place.json of the same robot. These points were
        // driven to in operation, so they have to be free in the grid. Checked
        // without the safety margin, which rightly closes points close to a
        // wall.
        val grid = PgmMap.parse(realMap(), inflateRadiusMeters = null)
        val pois = mapOf(
            "restroom" to (22.924 to -0.279),
            "kitchen" to (28.620 to -1.269),
            "couch" to (-3.685 to 1.775),
            "hall entrance" to (-7.388 to -7.896),
        )
        for ((name, xy) in pois) {
            val (x, y) = xy
            val cell = assertNotNull(grid.worldToGrid(x, y), "$name lies outside the map")
            assertTrue(grid.isPassable(cell.first, cell.second), "$name lies on blocked ground")
        }
    }

    @Test
    fun `the safety margin blocks additional area`() {
        val raw = PgmMap.parse(realMap(), inflateRadiusMeters = null).getStats()
        val withMargin = PgmMap.parse(realMap(), inflateRadiusMeters = 0.40).getStats()

        assertTrue(
            withMargin.blockedCells > raw.blockedCells,
            "a 40 cm margin has to block cells (raw ${raw.blockedCells}, with margin ${withMargin.blockedCells})",
        )
        assertTrue(
            withMargin.passableCells > 0,
            "the margin must not wall up the entire map",
        )
    }

    @Test
    fun `a margin that lands between pixels is not rounded down`() {
        // 0.35 / 0.05 is not 7.0 in binary but 6.999…, and truncating made a
        // 30 cm margin out of a requested 35 cm one. Rounding a safety distance
        // down is the wrong direction, so the pixel next to the boundary has to
        // be blocked and the one behind it must not be.
        val bytes = buildPgm(31, 31, 0.05, 0f, 0f, { x, y -> if (x == 15 && y == 15) 0 else 255 })
        val grid = PgmMap.parse(bytes, inflateRadiusMeters = 0.35)

        assertTrue(
            !grid.isPassable(22, 15),
            "7 pixels from the obstacle is within a 35 cm margin and has to be blocked",
        )
        assertTrue(
            grid.isPassable(23, 15),
            "8 pixels is beyond the margin and must stay passable",
        )
    }

    /** Builds a minimal map in the robot format. */
    private fun buildPgm(
        width: Int,
        height: Int,
        resolution: Double,
        originX: Float,
        originY: Float,
        pixel: (Int, Int) -> Int,
        header: String = "P5\n$width $height\n255\n",
        trailer: Boolean = true,
    ): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        out.write(header.toByteArray(Charsets.US_ASCII))
        for (y in 0 until height) for (x in 0 until width) out.write(pixel(x, y))
        if (trailer) {
            val bits = resolution.toRawBits()
            for (i in 0 until 8) out.write(((bits shr (8 * i)) and 0xFF).toInt())
            for (v in listOf(originX, originY)) {
                val fb = v.toRawBits()
                for (i in 0 until 4) out.write((fb shr (8 * i)) and 0xFF)
            }
        }
        return out.toByteArray()
    }

    @Test
    fun `resolution and origin come little endian out of the trailer`() {
        val bytes = buildPgm(4, 3, 0.05, -1.25f, 2.5f, { _, _ -> 255 })
        val grid = PgmMap.parse(bytes, inflateRadiusMeters = null)

        assertEquals(0.05, grid.resolution, 1e-12)
        assertEquals(-1.25, grid.originX, 1e-6)
        assertEquals(2.5, grid.originY, 1e-6)
    }

    @Test
    fun `only pure white is passable`() {
        // 150 = not scanned, 5 = detected obstacle, 0 = wall.
        val values = listOf(255, 150, 5, 0)
        val bytes = buildPgm(4, 1, 0.05, 0f, 0f, { x, _ -> values[x] })
        val grid = PgmMap.parse(bytes, inflateRadiusMeters = null)

        assertTrue(grid.isPassable(0, 0), "255 has to be passable")
        assertTrue(!grid.isPassable(1, 0), "not scanned must not be passable")
        assertTrue(!grid.isPassable(2, 0), "an obstacle must not be passable")
        assertTrue(!grid.isPassable(3, 0), "a wall must not be passable")
    }

    @Test
    fun `comments and repeated whitespace in the header do no harm`() {
        val bytes = buildPgm(
            2, 2, 0.05, 0f, 0f, { _, _ -> 255 },
            header = "P5\n# touched by some image tool\n2   2\n255\n",
        )
        val grid = PgmMap.parse(bytes, inflateRadiusMeters = null)
        assertEquals(2, grid.width)
        assertEquals(2, grid.height)
    }

    @Test
    fun `an ordinary PGM without a trailer is rejected`() {
        // Important: fail loudly rather than compute on with resolution 0 and
        // send the robot to a place that does not exist.
        val bytes = buildPgm(2, 2, 0.05, 0f, 0f, { _, _ -> 255 }, trailer = false)
        val error = assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
        assertTrue("resolution" in error.message!! || "16 bytes" in error.message!!)
    }

    @Test
    fun `a file with the wrong magic is rejected`() {
        val bytes = "P2\n2 2\n255\n".toByteArray()
        assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
    }

    /*
     * The following four cases check the same promise from four directions: a
     * broken map has to come out as a ParseException. The caller catches that
     * one exception and shows "map not readable"; anything else takes the app
     * down on the robot.
     */

    @Test
    fun `absurd image dimensions yield a message instead of a crash`() {
        // 50000 x 50000 overflows the Int product into a negative value, and
        // ByteArray then throws NegativeArraySizeException instead of
        // ParseException.
        val bytes = "P5\n50000 50000\n255\n".toByteArray(Charsets.US_ASCII)
        val error = assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
        assertTrue("large" in error.message!!, "message was: ${error.message}")
    }

    @Test
    fun `a resolution of NaN is rejected`() {
        // Every comparison with NaN is false, so a check for <= 0 or > 1 lets
        // NaN through, and afterwards every conversion silently returns
        // nonsense. That masquerades as "no path".
        val bytes = buildPgm(2, 2, Double.NaN, 0f, 0f, { _, _ -> 255 })
        assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
    }

    @Test
    fun `an infinite origin is rejected`() {
        val bytes = buildPgm(2, 2, 0.05, Float.POSITIVE_INFINITY, 0f, { _, _ -> 255 })
        assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
    }

    @Test
    fun `a 16 bit PGM is rejected instead of read as noise`() {
        // Two bytes per pixel read byte by byte gives a grid of randomly
        // passable and blocked cells, without anything reporting that the map
        // could never have been right.
        val bytes = buildPgm(
            2, 2, 0.05, 0f, 0f, { _, _ -> 255 },
            header = "P5\n2 2\n65535\n",
        )
        val error = assertFailsWith<PgmMap.ParseException> { PgmMap.parse(bytes) }
        assertTrue("8 bit" in error.message!!, "message was: ${error.message}")
    }
}
