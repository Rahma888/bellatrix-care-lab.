package de.labland.vergil.navigation


/**
 * OccupancyGrid: 2D Grid representation of the robot's map
 *
 * Each cell represents a small area (typically 5cm x 5cm based on PGM resolution).
 * Cell values:
 *   0 = PASSABLE (free space, robot can drive here)
 *   1 = BLOCKED (wall, shelf, no-go zone, obstacle)
 *
 * Coordinate System:
 *   - Grid coordinates: (gridX, gridY) in pixels, origin top-left
 *   - World coordinates: (worldX, worldY) in meters, robot's coordinate system
 *
 * The grid is extracted from the robot's PGM map file which contains:
 *   0xFF (255) = PASS (white) - drivable
 *   0x00 (0)   = BLOCK (black) - walls, shelves, no-go zones
 *   0x96 (150) = UNDETECT (gray) - not scanned, treated as blocked for safety
 *   0x05 (5)   = OBSTACLE - detected obstacle, blocked
 */
class OccupancyGrid(
    val width: Int,
    val height: Int,
    val resolution: Double,  // meters per pixel (e.g., 0.05 = 5cm per pixel)
    val originX: Double,     // world X coordinate of grid origin (meters)
    val originY: Double      // world Y coordinate of grid origin (meters)
) {
    companion object {
        private const val TAG = "OccupancyGrid"

        // Cell values
        const val PASSABLE = 0
        const val BLOCKED = 1

        // PGM pixel values (from OrionStar SDK)
        const val PGM_PASS = 0xFF      // 255 - white, drivable
        const val PGM_BLOCK = 0x00     // 0 - black, wall/no-go
        const val PGM_UNDETECT = 0x96  // 150 - gray, not scanned
        const val PGM_OBSTACLE = 0x05  // 5 - detected obstacle
    }

    // The actual grid data: grid[y][x]
    // Using IntArray for memory efficiency
    private val grid: Array<IntArray> = Array(height) { IntArray(width) { BLOCKED } }

    // Original grid data (before inflation) - used to check if obstacle is from map
    private val originalGrid: Array<IntArray> = Array(height) { IntArray(width) { BLOCKED } }

    // Track if grid has been inflated
    private var isInflated = false

    // Temporary blocks (for dynamic obstacles during navigation)
    private val temporaryBlocks = mutableSetOf<Pair<Int, Int>>()

    /**
     * One stamped blocked area, as it was ordered: centre and radius.
     *
     * Kept next to the cell set purely so the map can draw what the robot has
     * blocked for itself. Drawing the cells would mean handing over more than
     * a thousand pairs per frame, while the stamps are a handful and say the
     * same thing: where we assumed an obstacle, and how generously.
     */
    data class BlockedArea(val gridX: Int, val gridY: Int, val radiusPixels: Int)

    private val stampedAreas = mutableListOf<BlockedArea>()

    /** Snapshot of the stamped areas, for the diagnostics view. */
    val blockedAreas: List<BlockedArea> get() = synchronized(stampedAreas) { stampedAreas.toList() }

    /**
     * Set cell value at grid coordinates
     * Also stores in originalGrid for later comparison
     */
    fun setCell(gridX: Int, gridY: Int, value: Int) {
        if (isValidGridCoordinate(gridX, gridY)) {
            grid[gridY][gridX] = value
            originalGrid[gridY][gridX] = value
        }
    }

    /**
     * Get cell value at grid coordinates
     */
    fun getCell(gridX: Int, gridY: Int): Int {
        return if (isValidGridCoordinate(gridX, gridY)) {
            grid[gridY][gridX]
        } else {
            BLOCKED // Out of bounds = blocked
        }
    }

    /**
     * Cells a measurement has declared free, against what the map says.
     *
     * The only way a cell ever becomes passable again. Everything else in here
     * can add blocked area and nothing could ever take any away, so with an
     * aged map the picture could only get worse over a drive. These cells are
     * the door out of that, and they are deliberately narrow: only what the
     * sensor really looked at belongs in here, never a direction it merely
     * failed to see anything in.
     */
    private val clearedCells = mutableSetOf<Pair<Int, Int>>()

    /**
     * Check if a cell is passable (can be driven on)
     * Also considers temporary blocks and cleared cells
     */
    fun isPassable(gridX: Int, gridY: Int): Boolean {
        if (!isValidGridCoordinate(gridX, gridY)) return false
        if (Pair(gridX, gridY) in temporaryBlocks) return false
        // A fresh measurement beats the recorded map. That is the whole point:
        // the map says what was there when it was made, the measurement says
        // what is there now.
        if (Pair(gridX, gridY) in clearedCells) return true
        return grid[gridY][gridX] == PASSABLE
    }

    /**
     * Check if grid coordinate is within bounds
     */
    fun isValidGridCoordinate(gridX: Int, gridY: Int): Boolean {
        return gridX >= 0 && gridX < width && gridY >= 0 && gridY < height
    }

    /**
     * Convert world coordinates (meters) to grid coordinates (pixels)
     *
     * Formula from OrionStar SDK (MapppUtils.pose2PixelByRoverMap):
     *   gridX = (worldX - originX) / resolution
     *   gridY = height - ((worldY - originY) / resolution)
     */
    fun worldToGrid(worldX: Double, worldY: Double): Pair<Int, Int>? {
        val gridX = ((worldX - originX) / resolution).toInt()
        val gridY = (height - ((worldY - originY) / resolution)).toInt()

        return if (isValidGridCoordinate(gridX, gridY)) {
            Pair(gridX, gridY)
        } else {
            NavLog.w(TAG, "World coords ($worldX, $worldY) outside grid bounds → ($gridX, $gridY)")
            null
        }
    }

    /**
     * Convert grid coordinates (pixels) to world coordinates (meters)
     *
     * Inverse of worldToGrid
     */
    fun gridToWorld(gridX: Int, gridY: Int): Pair<Double, Double>? {
        if (!isValidGridCoordinate(gridX, gridY)) return null

        val worldX = (gridX * resolution) + originX
        val worldY = ((height - gridY) * resolution) + originY

        return Pair(worldX, worldY)
    }

    /**
     * Add temporary block around a position (for dynamic obstacles)
     *
     * @param gridX center X
     * @param gridY center Y
     * @param radiusPixels radius in pixels to block
     */
    fun addTemporaryBlock(gridX: Int, gridY: Int, radiusPixels: Int) {
        synchronized(stampedAreas) { stampedAreas.add(BlockedArea(gridX, gridY, radiusPixels)) }
        val radiusSq = radiusPixels * radiusPixels
        var addedCount = 0
        for (dx in -radiusPixels..radiusPixels) {
            for (dy in -radiusPixels..radiusPixels) {
                if (dx * dx + dy * dy <= radiusSq) {
                    val x = gridX + dx
                    val y = gridY + dy
                    if (isValidGridCoordinate(x, y)) {
                        temporaryBlocks.add(Pair(x, y))
                        addedCount++
                    }
                }
            }
        }
        NavLog.i(TAG, "🚧 Added temporary block at ($gridX, $gridY) radius=$radiusPixels px → $addedCount cells blocked (total: ${temporaryBlocks.size})")
    }

    /**
     * Add a temporary LINE block perpendicular to the path direction.
     * This blocks a corridor without encircling the robot.
     *
     * The line is drawn PERPENDICULAR to the path direction, centered at the block point.
     * This creates a "wall" that A* must navigate around.
     *
     * @param centerWorldX Center X in world coordinates (meters)
     * @param centerWorldY Center Y in world coordinates (meters)
     * @param lineDirX Line direction X (normalized) - the direction the line extends
     * @param lineDirY Line direction Y (normalized)
     * @param lengthMeters Total length of line (meters) - default 2m (wider than corridor)
     * @param thicknessPixels Thickness in pixels (safety margin) - default 3 (~15cm)
     */
    fun addTemporaryLine(
        centerWorldX: Double,
        centerWorldY: Double,
        lineDirX: Double,
        lineDirY: Double,
        lengthMeters: Double = 2.0,
        thicknessPixels: Int = 3
    ) {
        // Perpendicular to line direction (for thickness)
        val thickDirX = -lineDirY
        val thickDirY = lineDirX

        val halfLength = lengthMeters / 2.0
        val numSteps = (lengthMeters / resolution).toInt()

        var addedCount = 0

        // Draw line from -halfLength to +halfLength along line direction
        for (i in 0..numSteps) {
            // Position along line
            val t = -halfLength + (i.toDouble() / numSteps) * lengthMeters
            val worldX = centerWorldX + t * lineDirX
            val worldY = centerWorldY + t * lineDirY

            // Add thickness perpendicular to line direction
            for (thick in -thicknessPixels..thicknessPixels) {
                val offsetWorldX = worldX + thick * resolution * thickDirX
                val offsetWorldY = worldY + thick * resolution * thickDirY

                val gridCoords = worldToGrid(offsetWorldX, offsetWorldY) ?: continue

                if (isValidGridCoordinate(gridCoords.first, gridCoords.second)) {
                    temporaryBlocks.add(Pair(gridCoords.first, gridCoords.second))
                    addedCount++
                }
            }
        }

        NavLog.i(TAG, "🚧 Added temporary LINE: center=(${String.format(java.util.Locale.ROOT, "%.2f", centerWorldX)}, " +
                  "${String.format(java.util.Locale.ROOT, "%.2f", centerWorldY)}), dir=(${String.format(java.util.Locale.ROOT, "%.2f", lineDirX)}, ${String.format(java.util.Locale.ROOT, "%.2f", lineDirY)}), " +
                  "length=${lengthMeters}m, thickness=${thicknessPixels}px → $addedCount cells blocked (total: ${temporaryBlocks.size})")
    }

    /**
     * Add a temporary arc (half-circle) blocking obstacle.
     *
     * The arc curves AWAY from the robot (towards the obstacle).
     * As the arc moves closer to the robot, its ends wrap around to block side paths.
     *
     * @param centerWorldX Center X of the arc in world coordinates
     * @param centerWorldY Center Y of the arc in world coordinates
     * @param pathDirX Direction towards obstacle (normalized) - arc curves in this direction
     * @param pathDirY Direction towards obstacle (normalized)
     * @param radiusMeters Radius of the arc (how far forward it curves)
     * @param arcSpanDegrees How wide the arc spans (180 = half circle)
     * @param thicknessPixels Thickness of the arc line
     */
    fun addTemporaryArc(
        centerWorldX: Double,
        centerWorldY: Double,
        pathDirX: Double,
        pathDirY: Double,
        radiusMeters: Double = 1.0,
        arcSpanDegrees: Double = 180.0,
        thicknessPixels: Int = 3
    ) {
        // The arc is centered at (centerWorldX, centerWorldY)
        // It curves in the pathDir direction (towards the obstacle)
        // The ends of the arc extend perpendicular to pathDir

        // Calculate the base angle (direction towards obstacle)
        val baseAngle = kotlin.math.atan2(pathDirY, pathDirX)

        // Arc spans from (baseAngle - halfSpan) to (baseAngle + halfSpan)
        val halfSpanRad = Math.toRadians(arcSpanDegrees / 2.0)
        val startAngle = baseAngle - halfSpanRad
        val endAngle = baseAngle + halfSpanRad

        // Number of points along the arc (more points = smoother arc)
        val numPoints = (arcSpanDegrees / 2.0).toInt().coerceAtLeast(20)

        var addedCount = 0

        for (i in 0..numPoints) {
            // Current angle along the arc
            val t = i.toDouble() / numPoints
            val angle = startAngle + t * (endAngle - startAngle)

            // Point on the arc
            val arcX = centerWorldX + radiusMeters * kotlin.math.cos(angle)
            val arcY = centerWorldY + radiusMeters * kotlin.math.sin(angle)

            // Add thickness (perpendicular to the arc at this point = radial direction)
            for (thick in -thicknessPixels..thicknessPixels) {
                val thickOffset = thick * resolution
                val thickX = arcX + thickOffset * kotlin.math.cos(angle)
                val thickY = arcY + thickOffset * kotlin.math.sin(angle)

                val gridCoords = worldToGrid(thickX, thickY) ?: continue

                if (isValidGridCoordinate(gridCoords.first, gridCoords.second)) {
                    temporaryBlocks.add(Pair(gridCoords.first, gridCoords.second))
                    addedCount++
                }
            }
        }

        NavLog.i(TAG, "🚧 Added temporary ARC: center=(${String.format(java.util.Locale.ROOT, "%.2f", centerWorldX)}, " +
                  "${String.format(java.util.Locale.ROOT, "%.2f", centerWorldY)}), radius=${String.format(java.util.Locale.ROOT, "%.2f", radiusMeters)}m, " +
                  "span=${arcSpanDegrees}°, thickness=${thicknessPixels}px → $addedCount cells blocked (total: ${temporaryBlocks.size})")
    }

    /**
     * Declares a measured wedge free, against what the map says.
     *
     * The wedge is what one probe of the rotating scan looked at: a cone from
     * the robot outwards, out to a distance that came back clear. Two things
     * about it are deliberately narrow.
     *
     * Its opening angle is the sensor's, not the scan step's. Eight steps of 45
     * degrees do not mean 45 degrees were measured each time, they mean one
     * direction was measured eight times. Carving the full step would free
     * ground nobody looked at, and that is the one mistake this whole mechanism
     * must not make.
     *
     * Its depth stops short of the measured clearance, [OccupancyGrid] does not
     * decide by how much. Thin things, tripod legs, chair legs, are seen by the
     * lidar only now and then: measured on 2026-08-13, one direction with three
     * tripods in it came back clear in six of eleven scans and blocked in five,
     * at anything between 1.25 and 2.25 m. With something solid in the same
     * spot, four of four agreed to the centimetre.
     *
     * @param minHalfWidthMeters the wedge is never narrower than this. Close in
     *   a cone is thinner than the robot, and a lane it does not fit through is
     *   no use to anyone.
     * @return how many cells this freed that were not free before.
     */
    fun clearWedge(
        centerWorldX: Double,
        centerWorldY: Double,
        centerAngleRad: Double,
        halfAngleRad: Double,
        fromMeters: Double,
        toMeters: Double,
        minHalfWidthMeters: Double = 0.0,
    ): Int {
        var freed = 0
        forEachWedgeCell(
            centerWorldX, centerWorldY, centerAngleRad, halfAngleRad,
            fromMeters, toMeters, minHalfWidthMeters,
        ) { x, y ->
            val cell = Pair(x, y)
            // Our own stamps have to go, not merely be outvoted: isPassable
            // asks about them first, and rightly so, everywhere else a stamp is
            // the newer knowledge. Here it is the older one.
            temporaryBlocks.remove(cell)
            if (clearedCells.add(cell)) freed++
        }
        NavLog.i(
            TAG,
            "✂️ Cleared wedge at ${fmt(centerWorldX)},${fmt(centerWorldY)} " +
                "towards ${fmt(Math.toDegrees(centerAngleRad))}° ±${fmt(Math.toDegrees(halfAngleRad))}°, " +
                "${fmt(fromMeters)}..${fmt(toMeters)} m → $freed cells freed",
        )
        return freed
    }

    /**
     * Stamps a measured wedge as blocked, against what the map says.
     *
     * The counterpart of [clearWedge] and the more trustworthy half of the
     * measurement: the sensor reports an obstacle only when it sees one, so a
     * "blocked" that is wrong costs a detour, while a "free" that is wrong
     * costs an attempt to drive through something.
     *
     * @return how many cells this blocked that were not blocked before.
     */
    fun blockWedge(
        centerWorldX: Double,
        centerWorldY: Double,
        centerAngleRad: Double,
        halfAngleRad: Double,
        fromMeters: Double,
        toMeters: Double,
        minHalfWidthMeters: Double = 0.0,
    ): Int {
        var added = 0
        forEachWedgeCell(
            centerWorldX, centerWorldY, centerAngleRad, halfAngleRad,
            fromMeters, toMeters, minHalfWidthMeters,
        ) { x, y ->
            val cell = Pair(x, y)
            // An older measurement that called this free is overruled, for the
            // same reason the other way round: whatever was measured last wins.
            clearedCells.remove(cell)
            if (temporaryBlocks.add(cell)) added++
        }
        NavLog.i(
            TAG,
            "🚧 Blocked wedge at ${fmt(centerWorldX)},${fmt(centerWorldY)} " +
                "towards ${fmt(Math.toDegrees(centerAngleRad))}°, " +
                "${fmt(fromMeters)}..${fmt(toMeters)} m → $added cells blocked",
        )
        return added
    }

    /**
     * Walks the cells of a cone, from near to far, ring by ring.
     *
     * Steps of half a cell in both directions, so no cell is skipped between
     * two rings and none between two rays of the same ring. Duplicates are
     * cheap, both callers collect into a set.
     */
    private inline fun forEachWedgeCell(
        centerWorldX: Double,
        centerWorldY: Double,
        centerAngleRad: Double,
        halfAngleRad: Double,
        fromMeters: Double,
        toMeters: Double,
        minHalfWidthMeters: Double,
        action: (Int, Int) -> Unit,
    ) {
        if (toMeters <= fromMeters) return
        val step = resolution / 2.0
        var r = fromMeters
        while (r <= toMeters + 1e-9) {
            // A ring of radius zero has no circumference to walk along, and
            // every angle on it lands on the same cell. The floor keeps the
            // arithmetic finite and costs nothing: half a cell out from the
            // centre is still the centre cell.
            val rr = kotlin.math.max(r, resolution)
            val halfWidth = kotlin.math.max(rr * kotlin.math.tan(halfAngleRad), minHalfWidthMeters)
            val halfSpan = kotlin.math.min(kotlin.math.atan2(halfWidth, rr), Math.PI)
            val arcStep = kotlin.math.min(step / rr, halfSpan).coerceAtLeast(1e-3)

            var a = -halfSpan
            while (a <= halfSpan + 1e-9) {
                val angle = centerAngleRad + a
                val worldX = centerWorldX + r * kotlin.math.cos(angle)
                val worldY = centerWorldY + r * kotlin.math.sin(angle)
                // Converted here rather than through worldToGrid: that one logs
                // a warning per miss, and a wedge that pokes over the map edge
                // would write thousands of them.
                val gridX = ((worldX - originX) / resolution).toInt()
                val gridY = (height - ((worldY - originY) / resolution)).toInt()
                if (isValidGridCoordinate(gridX, gridY)) action(gridX, gridY)
                a += arcStep
            }
            r += step
        }
    }

    private fun fmt(value: Double): String = String.format(java.util.Locale.ROOT, "%.2f", value)

    /**
     * Clear all temporary blocks (call when starting new navigation)
     *
     * Drops the measured free cells along with them. Both are knowledge from
     * this one drive, both age at the same rate, and whoever wipes the one
     * wants a clean sheet rather than half of the previous picture.
     */
    fun clearTemporaryBlocks() {
        val count = temporaryBlocks.size
        val freed = clearedCells.size
        temporaryBlocks.clear()
        clearedCells.clear()
        synchronized(stampedAreas) { stampedAreas.clear() }
        NavLog.i(TAG, "🧹 Cleared $count temporary blocks and $freed measured free cells")
    }

    /**
     * Get the number of temporary blocks currently set
     */
    fun getTemporaryBlockCount(): Int = temporaryBlocks.size

    /**
     * Get original cell value (before inflation)
     * Used to check if an obstacle is a known map obstacle (wall, furniture)
     */
    fun getOriginalCell(gridX: Int, gridY: Int): Int {
        return if (isValidGridCoordinate(gridX, gridY)) {
            originalGrid[gridY][gridX]
        } else {
            BLOCKED
        }
    }

    /**
     * Check if position has a known obstacle from the original map (wall, furniture, etc.)
     * This checks the original grid BEFORE inflation, so it only returns true for
     * actual obstacles drawn in the map, not the safety margin around them.
     *
     * @param gridX grid X coordinate
     * @param gridY grid Y coordinate
     * @param checkRadius radius in pixels to check around the position
     */
    fun isKnownMapObstacle(gridX: Int, gridY: Int, checkRadius: Int = 3): Boolean {
        for (dx in -checkRadius..checkRadius) {
            for (dy in -checkRadius..checkRadius) {
                if (getOriginalCell(gridX + dx, gridY + dy) == BLOCKED) {
                    return true
                }
            }
        }
        return false
    }

    /**
     * Inflate all obstacles by a given radius.
     * This creates a safety margin around all obstacles for wider robots.
     *
     * IMPORTANT: Call this ONCE after loading the grid, before any pathfinding!
     *
     * @param radiusPixels radius in pixels (e.g., robot half-width / resolution)
     */
    fun inflateObstacles(radiusPixels: Int) {
        if (isInflated) {
            NavLog.w(TAG, "⚠️ Grid already inflated, skipping")
            return
        }

        NavLog.i(TAG, "🔄 Inflating obstacles by $radiusPixels pixels (≈${String.format(java.util.Locale.ROOT, "%.2f", radiusPixels * resolution)}m)...")
        val startTime = System.currentTimeMillis()

        // Two tricks, without which this takes 56 seconds on the robot. It goes
        // unnoticed on the development machine; measured on a LuckiBot with
        // 1120x600 cells:
        //
        // 1. Only inflate boundary cells. An obstacle cell surrounded by
        //    obstacles on all sides adds nothing, its margin falls entirely
        //    inside already blocked ground. On large unscanned areas that is
        //    the lion's share of all cells.
        // 2. Write directly instead of collecting. The original version put a
        //    Pair into a HashSet for every touched cell, hundreds of millions
        //    of objects that all have to be collected again.
        val radiusSq = radiusPixels * radiusPixels

        // Precompute the circular mask once: the permitted dx per row.
        val spanForDy = IntArray(2 * radiusPixels + 1) { i ->
            val dy = i - radiusPixels
            kotlin.math.sqrt((radiusSq - dy * dy).toDouble().coerceAtLeast(0.0)).toInt()
        }

        var inflatedCount = 0
        for (y in 0 until height) {
            val row = originalGrid[y]
            for (x in 0 until width) {
                if (row[x] != BLOCKED) continue
                if (!isBoundaryCell(x, y)) continue

                for (i in spanForDy.indices) {
                    val ny = y + i - radiusPixels
                    if (ny < 0 || ny >= height) continue
                    val span = spanForDy[i]
                    val from = (x - span).coerceAtLeast(0)
                    val to = (x + span).coerceAtMost(width - 1)
                    val targetRow = grid[ny]
                    for (nx in from..to) {
                        if (targetRow[nx] == PASSABLE) {
                            targetRow[nx] = BLOCKED
                            inflatedCount++
                        }
                    }
                }
            }
        }

        isInflated = true
        val elapsed = System.currentTimeMillis() - startTime
        NavLog.i(TAG, "✅ Obstacle inflation complete: $inflatedCount new cells blocked in ${elapsed}ms")
    }

    /**
     * Does this obstacle cell border on free ground anywhere? Only such cells
     * can block anything new with their safety margin. The map edge counts as
     * closed: everything outside is blocked anyway.
     */
    private fun isBoundaryCell(x: Int, y: Int): Boolean {
        for (dy in -1..1) {
            val ny = y + dy
            if (ny < 0 || ny >= height) continue
            val row = originalGrid[ny]
            for (dx in -1..1) {
                val nx = x + dx
                if (nx < 0 || nx >= width) continue
                if (row[nx] == PASSABLE) return true
            }
        }
        return false
    }

    /**
     * Get statistics about the grid (for debugging)
     */
    fun getStats(): GridStats {
        var passableCount = 0
        var blockedCount = 0

        for (y in 0 until height) {
            for (x in 0 until width) {
                if (grid[y][x] == PASSABLE) passableCount++ else blockedCount++
            }
        }

        return GridStats(
            width = width,
            height = height,
            resolution = resolution,
            originX = originX,
            originY = originY,
            totalCells = width * height,
            passableCells = passableCount,
            blockedCells = blockedCount,
            temporaryBlocks = temporaryBlocks.size
        )
    }

    data class GridStats(
        val width: Int,
        val height: Int,
        val resolution: Double,
        val originX: Double,
        val originY: Double,
        val totalCells: Int,
        val passableCells: Int,
        val blockedCells: Int,
        val temporaryBlocks: Int
    ) {
        val passablePercent: Double get() = (passableCells.toDouble() / totalCells) * 100
        val worldWidth: Double get() = width * resolution
        val worldHeight: Double get() = height * resolution

        override fun toString(): String {
            return """
                |OccupancyGrid Stats:
                |  Size: ${width}x${height} pixels (${String.format(java.util.Locale.ROOT, "%.1f", worldWidth)}m x ${String.format(java.util.Locale.ROOT, "%.1f", worldHeight)}m)
                |  Resolution: ${String.format(java.util.Locale.ROOT, "%.3f", resolution)} m/pixel (${String.format(java.util.Locale.ROOT, "%.1f", resolution * 100)} cm/pixel)
                |  Origin: (${String.format(java.util.Locale.ROOT, "%.2f", originX)}, ${String.format(java.util.Locale.ROOT, "%.2f", originY)}) meters
                |  Cells: $totalCells total, $passableCells passable (${String.format(java.util.Locale.ROOT, "%.1f", passablePercent)}%), $blockedCells blocked
                |  Temporary blocks: $temporaryBlocks
            """.trimMargin()
        }
    }
}
