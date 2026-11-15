package de.labland.vergil.navigation

import java.io.DataInputStream
import java.io.EOFException
import java.io.InputStream

/**
 * Reads the map format of the Orionstar robots into an [OccupancyGrid].
 *
 * It is a binary PGM (P5) with a trailer that no PGM viewer knows about:
 *
 * ```
 * P5\n                       magic
 * <width> <height>\n         image size in pixels
 * 255\n                      maximum grey value
 * <width*height bytes>       one byte per pixel
 * <16 bytes>                 resolution (double) + origin X, Y (float each)
 * ```
 *
 * Those last 16 bytes are the reason we read the file ourselves: without
 * resolution and origin the image is just a heap of pixels, and only with them
 * does it become a map in which a world coordinate denotes a place. The
 * numbers are little endian, as written by the robot.
 *
 * Grey values per the Orionstar SDK: 255 passable, 0 wall, 150 not scanned,
 * 5 detected obstacle. Everything except 255 counts as blocked, because
 * unknown ground is not free ground.
 */
object PgmMap {

    private const val TAG = "PgmMap"

    const val PGM_PASS = 0xFF
    const val TRAILER_BYTES = 16

    /**
     * Upper bound for the image area.
     *
     * The number is measured against memory, not against gut feeling:
     * [OccupancyGrid] holds two Int arrays per pixel, so 8 bytes, plus one
     * byte for the raw data. Twelve million pixels are therefore about 110 MB,
     * at the limit of what an Android heap of 256 MB tolerates. A higher bound
     * would make the check worthless: its whole point is to produce a message
     * instead of a memory error, and an `OutOfMemoryError` is not a
     * [ParseException].
     *
     * For comparison: the office map has 672,000 pixels, and at 5 cm per pixel
     * the bound corresponds to an area of roughly 600 by 500 meters.
     */
    const val MAX_PIXELS = 12_000_000L

    /**
     * Safety distance around obstacles in meters: the radius of the Nova.
     *
     * Only the default. What is actually used is the setting of the same name
     * on `VergilNavigator`, so this number can be tried out at the device
     * instead of through a new APK.
     *
     * 0.32 since 2026-09-01, down from the 0.40 inherited from Bauhaus. That
     * number was never measured for this robot, and it cost more than it
     * looked: on the office map of that day it cut the robot off from seven of
     * its nine destinations, while the manufacturer's own navigation drove the
     * same route without trouble.
     *
     * Careful with the grid: at 5 cm per pixel there is no 0.32 m. It is
     * rounded up to 7 pixels, so 0.35 m takes effect. Rounding down would put
     * the margin below the robot's own radius, which is the one direction this
     * number must never be wrong in.
     */
    const val DEFAULT_ROBOT_RADIUS_METERS = 0.32

    class ParseException(message: String) : Exception(message)

    /**
     * @param inflateRadiusMeters safety margin laid around every obstacle
     *   after reading. `null` leaves the map raw, which only makes sense for
     *   tests and display, never for planning.
     */
    fun parse(
        input: InputStream,
        inflateRadiusMeters: Double? = DEFAULT_ROBOT_RADIUS_METERS,
    ): OccupancyGrid {
        val stream = DataInputStream(input.buffered())

        val magic = readHeaderToken(stream)
        if (magic != "P5") throw ParseException("Not a P5 PGM file but \"$magic\"")

        val width = readHeaderToken(stream).toIntOrNull()
            ?: throw ParseException("Width not readable")
        val height = readHeaderToken(stream).toIntOrNull()
            ?: throw ParseException("Height not readable")
        val maxval = readHeaderToken(stream).toIntOrNull()
            ?: throw ParseException("Maximum grey value not readable")

        if (width <= 0 || height <= 0) throw ParseException("Nonsensical size ${width}x$height")

        // A 16 bit PGM has two bytes per pixel. Unchecked we would read it byte
        // by byte and get a grid of noise, passable and blocked wildly mixed,
        // without anything failing.
        if (maxval != 255) {
            throw ParseException("Only 8 bit greyscale is read, file reports maximum value $maxval")
        }

        // Compute as Long: 50000x50000 overflows an Int into a negative value,
        // and ByteArray then throws a NegativeArraySizeException that nobody
        // catches. A broken map has to come out as "not readable", not as a
        // crash.
        val pixelCount = width.toLong() * height.toLong()
        if (pixelCount > MAX_PIXELS) {
            throw ParseException("Map is implausibly large: ${width}x$height pixels")
        }

        val pixels = ByteArray(pixelCount.toInt())
        try {
            stream.readFully(pixels)
        } catch (e: EOFException) {
            throw ParseException("File ends in the middle of the image data")
        }

        val trailer = ByteArray(TRAILER_BYTES)
        try {
            stream.readFully(trailer)
        } catch (e: EOFException) {
            throw ParseException(
                "The 16 bytes with resolution and origin are missing, " +
                    "probably an ordinary PGM instead of a robot map",
            )
        }

        val resolution = littleEndianDouble(trailer, 0)
        val originX = littleEndianFloat(trailer, 8).toDouble()
        val originY = littleEndianFloat(trailer, 12).toDouble()

        // `isFinite` first: NaN is neither <= 0 nor > 1, because every
        // comparison with NaN is false. Without this check broken trailer
        // bytes slip through, and afterwards every coordinate conversion
        // silently returns nonsense, which disguises itself as "no path".
        if (!resolution.isFinite() || resolution <= 0.0 || resolution > 1.0) {
            throw ParseException("Implausible resolution $resolution m/pixel")
        }
        if (!originX.isFinite() || !originY.isFinite()) {
            throw ParseException("Implausible map origin ($originX, $originY)")
        }

        val grid = OccupancyGrid(width, height, resolution, originX, originY)
        for (i in pixels.indices) {
            val value = pixels[i].toInt() and 0xFF
            grid.setCell(
                i % width,
                i / width,
                if (value == PGM_PASS) OccupancyGrid.PASSABLE else OccupancyGrid.BLOCKED,
            )
        }

        NavLog.i(
            TAG,
            "Map read: ${width}x$height pixels, ${fmt(resolution)} m/pixel, " +
                "origin (${fmt(originX)}, ${fmt(originY)})",
        )

        inflateRadiusMeters?.let { radius ->
            // Round up, do not truncate, for the same reason as in
            // `RoutePlanner.block`: 0.35 / 0.05 is not 7 in binary but 6.999…,
            // and `toInt` made a 30 cm margin out of a requested 35 cm one.
            // Rounding a safety distance down is the wrong direction, and here
            // it decided whether a route exists at all: on the office map of
            // 2026-09-01 the difference between 6 and 8 pixels was the
            // difference between seven reachable destinations and none.
            val radiusPixels = kotlin.math.ceil(radius / resolution).toInt()
            if (radiusPixels > 0) grid.inflateObstacles(radiusPixels)
        }

        return grid
    }

    fun parse(bytes: ByteArray, inflateRadiusMeters: Double? = DEFAULT_ROBOT_RADIUS_METERS) =
        parse(bytes.inputStream(), inflateRadiusMeters)

    /**
     * Reads one header token. PGM allows arbitrary whitespace between the
     * fields and `#` comment lines. Both occur once the file has been through
     * some other tool.
     */
    private fun readHeaderToken(stream: DataInputStream): String {
        val token = StringBuilder()
        while (true) {
            val b = stream.read()
            if (b == -1) {
                if (token.isNotEmpty()) return token.toString()
                throw ParseException("File ends inside the header")
            }
            val c = b.toChar()
            when {
                c == '#' -> {
                    while (true) {
                        val skip = stream.read()
                        if (skip == -1 || skip == '\n'.code) break
                    }
                    if (token.isNotEmpty()) return token.toString()
                }
                c.isWhitespace() -> if (token.isNotEmpty()) return token.toString()
                else -> token.append(c)
            }
        }
    }

    private fun littleEndianDouble(bytes: ByteArray, offset: Int): Double {
        var value = 0L
        for (i in 0 until 8) value = value or ((bytes[offset + i].toLong() and 0xFF) shl (8 * i))
        return Double.fromBits(value)
    }

    private fun littleEndianFloat(bytes: ByteArray, offset: Int): Float {
        var value = 0
        for (i in 0 until 4) value = value or ((bytes[offset + i].toInt() and 0xFF) shl (8 * i))
        return Float.fromBits(value)
    }

    private fun fmt(v: Double) = String.format(java.util.Locale.ROOT, "%.3f", v)
}
