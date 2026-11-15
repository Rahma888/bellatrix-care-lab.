package de.labland.vergil.navigation

import java.util.PriorityQueue
import kotlin.math.sqrt

/**
 * GridPathfinder: A* Pathfinding on OccupancyGrid
 *
 * Finds optimal paths through the grid while avoiding obstacles.
 * Uses 8-directional movement (including diagonals).
 *
 * Key features:
 * - Works on pixel-level grid (NOT location-based)
 * - Automatically avoids walls, shelves, no-go zones
 * - Supports diagonal movement with corner-cutting prevention
 * - Returns world coordinates (meters) for robot navigation
 */
class GridPathfinder(private val grid: OccupancyGrid) {

    companion object {
        private const val TAG = "GridPathfinder"

        // 8-directional movement: (dx, dy, cost)
        // Cardinal directions cost 1.0, diagonals cost √2 ≈ 1.414
        private val DIRECTIONS = arrayOf(
            Triple(-1, 0, 1.0),   // Left
            Triple(1, 0, 1.0),    // Right
            Triple(0, -1, 1.0),   // Up
            Triple(0, 1, 1.0),    // Down
            Triple(-1, -1, 1.414), // Top-Left
            Triple(1, -1, 1.414),  // Top-Right
            Triple(-1, 1, 1.414),  // Bottom-Left
            Triple(1, 1, 1.414)    // Bottom-Right
        )
    }

    /**
     * A* Node for priority queue
     */
    private data class AStarNode(
        val x: Int,
        val y: Int,
        val gCost: Double,  // Cost from start
        val fCost: Double,  // gCost + heuristic
        val parent: AStarNode?
    ) : Comparable<AStarNode> {
        override fun compareTo(other: AStarNode): Int = fCost.compareTo(other.fCost)
    }

    /**
     * Path result containing both grid and world coordinates
     */
    data class PathResult(
        val gridPath: List<Pair<Int, Int>>,       // Path in grid coordinates
        val worldPath: List<Pair<Double, Double>>, // Path in world coordinates (meters)
        val totalCost: Double,                     // Total path cost
        val nodesExplored: Int                     // Number of nodes explored (for debugging)
    )

    /**
     * Find path from start to goal using world coordinates (meters)
     *
     * @param startX Start X in meters
     * @param startY Start Y in meters
     * @param goalX Goal X in meters
     * @param goalY Goal Y in meters
     * @return PathResult or null if no path found
     */
    fun findPath(
        startX: Double, startY: Double,
        goalX: Double, goalY: Double
    ): PathResult? {
        NavLog.i(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        NavLog.i(TAG, "Finding path: (${String.format(java.util.Locale.ROOT, "%.2f", startX)}, ${String.format(java.util.Locale.ROOT, "%.2f", startY)}) → (${String.format(java.util.Locale.ROOT, "%.2f", goalX)}, ${String.format(java.util.Locale.ROOT, "%.2f", goalY)})")

        // Convert to grid coordinates
        val startGrid = grid.worldToGrid(startX, startY)
        val goalGrid = grid.worldToGrid(goalX, goalY)

        if (startGrid == null) {
            NavLog.e(TAG, "❌ Start position outside grid bounds")
            return null
        }
        if (goalGrid == null) {
            NavLog.e(TAG, "❌ Goal position outside grid bounds")
            return null
        }

        NavLog.d(TAG, "Grid coords: Start(${startGrid.first}, ${startGrid.second}) → Goal(${goalGrid.first}, ${goalGrid.second})")

        // Check if start is passable
        if (!grid.isPassable(startGrid.first, startGrid.second)) {
            NavLog.w(TAG, "⚠️ Start position is blocked - trying to find nearest passable cell")
            val nearestStart = findNearestPassable(startGrid.first, startGrid.second)
            if (nearestStart == null) {
                NavLog.e(TAG, "❌ No passable cell near start")
                return null
            }
            NavLog.d(TAG, "Using nearest passable start: (${nearestStart.first}, ${nearestStart.second})")

            // Find path from nearest passable to goal
            val pathFromNearest = findPathGrid(nearestStart, goalGrid)
            if (pathFromNearest == null) {
                return null
            }

            // IMPORTANT: Prepend the original blocked position to the path!
            // This way the robot will first move from its blocked position to the nearest passable,
            // then follow the rest of the path.
            // Convert original start to world coordinates and add to path
            val originalStartWorld = grid.gridToWorld(startGrid.first, startGrid.second)
            if (originalStartWorld != null) {
                val newGridPath = mutableListOf(startGrid) + pathFromNearest.gridPath
                val newWorldPath = mutableListOf(originalStartWorld) + pathFromNearest.worldPath
                NavLog.d(TAG, "Prepended blocked start to path: ${newGridPath.size} points total")
                return PathResult(
                    gridPath = newGridPath,
                    worldPath = newWorldPath,
                    totalCost = pathFromNearest.totalCost + heuristic(startGrid, nearestStart),
                    nodesExplored = pathFromNearest.nodesExplored
                )
            }

            return pathFromNearest
        }

        // Check if goal is passable
        if (!grid.isPassable(goalGrid.first, goalGrid.second)) {
            NavLog.w(TAG, "⚠️ Goal position is blocked - trying to find nearest passable cell")
            val nearestGoal = findNearestPassable(goalGrid.first, goalGrid.second)
            if (nearestGoal == null) {
                NavLog.e(TAG, "❌ No passable cell near goal")
                return null
            }
            NavLog.d(TAG, "Using nearest passable goal: (${nearestGoal.first}, ${nearestGoal.second})")
            return findPathGrid(startGrid, nearestGoal)
        }

        return findPathGrid(startGrid, goalGrid)
    }

    /**
     * Find path using grid coordinates
     */
    private fun findPathGrid(start: Pair<Int, Int>, goal: Pair<Int, Int>): PathResult? {
        val startTime = System.currentTimeMillis()

        val openSet = PriorityQueue<AStarNode>()
        val closedSet = mutableSetOf<Pair<Int, Int>>()
        val gScores = mutableMapOf<Pair<Int, Int>, Double>()

        val startNode = AStarNode(
            x = start.first,
            y = start.second,
            gCost = 0.0,
            fCost = heuristic(start, goal),
            parent = null
        )

        openSet.add(startNode)
        gScores[start] = 0.0

        var nodesExplored = 0

        while (openSet.isNotEmpty()) {
            val current = openSet.poll()
            val currentPos = Pair(current.x, current.y)

            // Already processed?
            if (currentPos in closedSet) continue
            closedSet.add(currentPos)
            nodesExplored++

            // Goal reached?
            if (current.x == goal.first && current.y == goal.second) {
                val elapsed = System.currentTimeMillis() - startTime
                NavLog.i(TAG, "✅ Path found! Explored $nodesExplored nodes in ${elapsed}ms")

                val gridPath = reconstructPath(current)
                val worldPath = gridPath.mapNotNull { (gx, gy) ->
                    grid.gridToWorld(gx, gy)
                }

                NavLog.i(TAG, "Path: ${gridPath.size} grid points → ${worldPath.size} world points")
                NavLog.i(TAG, "Total cost: ${String.format(java.util.Locale.ROOT, "%.2f", current.gCost)} (≈ ${String.format(java.util.Locale.ROOT, "%.2f", current.gCost * grid.resolution)}m)")
                NavLog.i(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

                return PathResult(
                    gridPath = gridPath,
                    worldPath = worldPath,
                    totalCost = current.gCost,
                    nodesExplored = nodesExplored
                )
            }

            // Explore neighbors
            for ((dx, dy, moveCost) in DIRECTIONS) {
                val nx = current.x + dx
                val ny = current.y + dy
                val neighborPos = Pair(nx, ny)

                // Skip if already explored
                if (neighborPos in closedSet) continue

                // Skip if not passable
                if (!grid.isPassable(nx, ny)) continue

                // Prevent corner-cutting for diagonal moves
                if (dx != 0 && dy != 0) {
                    // Both adjacent cells must be passable for diagonal
                    if (!grid.isPassable(current.x + dx, current.y) ||
                        !grid.isPassable(current.x, current.y + dy)) {
                        continue
                    }
                }

                val tentativeG = current.gCost + moveCost

                // Is this a better path?
                if (tentativeG < (gScores[neighborPos] ?: Double.MAX_VALUE)) {
                    gScores[neighborPos] = tentativeG

                    val newNode = AStarNode(
                        x = nx,
                        y = ny,
                        gCost = tentativeG,
                        fCost = tentativeG + heuristic(neighborPos, goal),
                        parent = current
                    )
                    openSet.add(newNode)
                }
            }
        }

        // No path found
        val elapsed = System.currentTimeMillis() - startTime
        NavLog.e(TAG, "❌ No path found! Explored $nodesExplored nodes in ${elapsed}ms")
        NavLog.i(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        return null
    }

    /**
     * Heuristic function: Euclidean distance
     */
    private fun heuristic(from: Pair<Int, Int>, to: Pair<Int, Int>): Double {
        val dx = (to.first - from.first).toDouble()
        val dy = (to.second - from.second).toDouble()
        return sqrt(dx * dx + dy * dy)
    }

    /**
     * Reconstruct path from goal node back to start
     */
    private fun reconstructPath(endNode: AStarNode): List<Pair<Int, Int>> {
        val path = mutableListOf<Pair<Int, Int>>()
        var node: AStarNode? = endNode

        while (node != null) {
            path.add(0, Pair(node.x, node.y))
            node = node.parent
        }

        return path
    }

    /**
     * Find nearest passable cell to a blocked position
     * Uses true BFS (breadth-first search) to find the ACTUALLY nearest passable cell
     * in all directions equally.
     *
     * Previous implementation had a bug: it searched in a fixed order (top-left first)
     * which meant it would always find cells in that direction first, even if they
     * were further away in Euclidean distance.
     */
    private fun findNearestPassable(x: Int, y: Int, maxRadius: Int = 20): Pair<Int, Int>? {
        // Use BFS to find truly nearest passable cell
        val visited = mutableSetOf<Pair<Int, Int>>()
        val queue = java.util.ArrayDeque<Pair<Int, Int>>()

        // Start from the blocked position
        queue.add(Pair(x, y))
        visited.add(Pair(x, y))

        // 8-directional neighbors for true distance
        val directions = listOf(
            Pair(-1, -1), Pair(-1, 0), Pair(-1, 1),
            Pair(0, -1),              Pair(0, 1),
            Pair(1, -1),  Pair(1, 0), Pair(1, 1)
        )

        while (queue.isNotEmpty()) {
            val (cx, cy) = queue.poll()

            // Check distance limit
            val dist = kotlin.math.max(kotlin.math.abs(cx - x), kotlin.math.abs(cy - y))
            if (dist > maxRadius) continue

            // If this cell is passable and not the starting point, return it
            if (grid.isPassable(cx, cy) && (cx != x || cy != y)) {
                return Pair(cx, cy)
            }

            // Add neighbors to queue
            for ((dx, dy) in directions) {
                val nx = cx + dx
                val ny = cy + dy
                val neighbor = Pair(nx, ny)

                if (neighbor !in visited && grid.isValidGridCoordinate(nx, ny)) {
                    visited.add(neighbor)
                    queue.add(neighbor)
                }
            }
        }

        return null
    }

    /**
     * Check if a direct line between two points is clear (no obstacles)
     * Used for path simplification
     */
    fun isLineClear(x1: Int, y1: Int, x2: Int, y2: Int): Boolean {
        // Bresenham's line algorithm
        var x = x1
        var y = y1
        val dx = kotlin.math.abs(x2 - x1)
        val dy = kotlin.math.abs(y2 - y1)
        val sx = if (x1 < x2) 1 else -1
        val sy = if (y1 < y2) 1 else -1
        var err = dx - dy

        while (true) {
            if (!grid.isPassable(x, y)) return false
            if (x == x2 && y == y2) break

            val e2 = 2 * err
            if (e2 > -dy) {
                err -= dy
                x += sx
            }
            if (e2 < dx) {
                err += dx
                y += sy
            }
        }
        return true
    }
}
