package de.labland.vergil

import de.labland.vergil.navigation.NavLog
import de.labland.vergil.navigation.OccupancyGrid
import de.labland.vergil.navigation.PathSimplifier
import de.labland.vergil.navigation.PgmMap
import de.labland.vergil.navigation.RoutePlanner
import de.labland.vergil.ral.DriveResult
import de.labland.vergil.ral.Ral
import de.labland.vergil.ral.RobotPose
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * Drives a route that we planned ourselves.
 *
 * The difference to the robot's own navigation: there one names a distant goal
 * and leaves the route choice to the manufacturer. Here we plan the path on
 * the occupancy grid ourselves and hand the robot only the next waypoint, a
 * short, straight, demonstrably clear segment. That is the precondition for
 * enforcing our own rules later: prefer aisles, avoid areas, drive around
 * waiting customers.
 *
 * If the robot gets stuck on the way, we block the spot in our map and replan.
 * That is the core of the Bauhaus idea, boiled down to the essentials.
 *
 * Note on language: identifiers and comments are English, but the strings in
 * [message] stay German. They appear on the robot display and are read by the
 * operator, and the device test archive (`docs/archiv/geraetetests-2026.md`)
 * quotes them verbatim.
 */
class VergilNavigator(private val ral: Ral) {

    sealed class State {
        data object Empty : State()
        data class MapLoaded(val grid: OccupancyGrid) : State()
        data class Planned(val grid: OccupancyGrid, val route: RoutePlanner.Route) : State()
        data class Driving(
            val grid: OccupancyGrid,
            val route: RoutePlanner.Route,
            val waypoint: Int,
        ) : State()
    }

    private val _state = MutableStateFlow<State>(State.Empty)
    val state = _state.asStateFlow()

    private val _message = MutableStateFlow("")
    val message = _message.asStateFlow()

    /**
     * How the last order ended.
     *
     * The message text is written for a human on the diagnostics screen and
     * changes whenever a wording improves. A skill that has to tell "arrived"
     * from "gave up" needs something it can branch on, so it gets this.
     */
    sealed class Outcome {
        data object Idle : Outcome()
        data object Running : Outcome()
        data object Arrived : Outcome()
        data class Failed(val reason: String) : Outcome()
    }

    private val _outcome = MutableStateFlow<Outcome>(Outcome.Idle)
    val outcome = _outcome.asStateFlow()

    /**
     * The track actually driven, sampled every [TRACK_SAMPLE_MS].
     *
     * Its purpose is a single question: does the robot drive our waypoints, or
     * does it pick its own way between them? Laid over the planned route on
     * the map that can be seen in a second, and captured as a screenshot.
     */
    private val _track = MutableStateFlow<List<Pair<Double, Double>>>(emptyList())
    val track = _track.asStateFlow()

    /** Settings, adjustable on the device. See the "Karte" tab. */
    private val _settings = MutableStateFlow(Settings())
    val settings = _settings.asStateFlow()

    /**
     * Where the robot's own avoidance kicked in, collected over the drive.
     *
     * Together with the blocked areas this answers the question a failed
     * replan otherwise only answers in the log: did we block the obstacle, or
     * did we block ourselves?
     */
    private val _obstacleSightings = MutableStateFlow<List<Pair<Double, Double>>>(emptyList())
    val obstacleSightings = _obstacleSightings.asStateFlow()

    /**
     * The routes of earlier attempts within one drive.
     *
     * Drawn faded under the current one. Without them a replan is invisible:
     * the new route simply replaces the old one on screen, and what the robot
     * tried in between cannot be reconstructed afterwards.
     */
    private val _previousRoutes = MutableStateFlow<List<RoutePlanner.Route>>(emptyList())
    val previousRoutes = _previousRoutes.asStateFlow()

    /** The areas we blocked for ourselves, for the map. */
    private val _blockedAreas = MutableStateFlow<List<OccupancyGrid.BlockedArea>>(emptyList())
    val blockedAreas = _blockedAreas.asStateFlow()

    /**
     * One direction of the scan, probed at several ranges.
     *
     * A single range answers "is anything there", which is too little to plan
     * with: one metre of clearance is not room to turn in, let alone to drive a
     * new route through. Several ranges turn the yes-or-no into a depth, and
     * that is the number a way out is chosen by.
     *
     * @param clearMeters furthest probed range that still came back clear, 0.0
     *   if even the nearest one was blocked.
     * @param blockedAtMeters nearest range that reported an obstacle, `null` if
     *   none of them did.
     */
    data class ScanSector(
        val startAngleDeg: Double,
        val endAngleDeg: Double,
        val clearMeters: Double,
        val blockedAtMeters: Double?,
    )

    /**
     * Result of the last scan, and the robot pose it was taken from.
     *
     * The pose belongs with it: the sectors are relative to the heading the
     * scan started at, and drawn from a position the robot has since left they
     * would point somewhere wrong.
     */
    data class Surroundings(
        val sectors: List<ScanSector>,
        val x: Double,
        val y: Double,
        val theta: Double,
    )

    private val _surroundings = MutableStateFlow<Surroundings?>(null)
    val surroundings = _surroundings.asStateFlow()

    /**
     * How a measured direction becomes free ground.
     *
     * Public, and gathered in one place, because the map draws exactly this. A
     * picture that shows a wider wedge than the planner carves is worse than no
     * picture at all: it would invite trusting ground nothing ever looked at.
     */
    object Carve {
        /**
         * Opening angle the forward probe is assumed to look at.
         *
         * Deliberately not the 45 degrees of a scan step. The step is how far
         * the robot turns between measurements, not how much a measurement
         * covers. How much it covers the SDK never said, and the device says it
         * is narrow: an object wide enough to hide 70 to 90 degrees of the
         * surroundings showed up as a sliver, and moved a little to the side it
         * vanished altogether.
         *
         * Thirty is an estimate on the safe side of that. Too small only means
         * carving less than we could have. Too large means calling ground free
         * that nothing ever looked at, and that is the one error this whole
         * mechanism must not make.
         */
        const val CONE_DEGREES = 30.0

        /**
         * How far short of the measured clearance a carve stops.
         *
         * One probe step. The measurement says "clear at 2.75 m, blocked at
         * 3.0" and we take the nearer of the two, so a boundary read one step
         * too generously does not become free ground.
         */
        const val MARGIN_METERS = 0.25

        /**
         * Below this depth a carve is not worth having.
         *
         * Half a metre of free lane is not somewhere to drive, it is somewhere
         * to edition. Carving it would weaken the map without opening a way.
         */
        const val MIN_METERS = 1.0

        /**
         * Narrowest a carved lane may be, near the robot.
         *
         * A 30 degree cone is 26 cm across at half a metre, less than the robot
         * is wide. Without a floor the carve opens a lane the robot does not fit
         * through, and the planner takes it.
         */
        const val MIN_HALF_WIDTH_METERS = 0.3

        /** What this direction actually frees, `0.0` where that is not worth it. */
        fun depthOf(sector: ScanSector): Double {
            val depth = sector.clearMeters - MARGIN_METERS
            return if (depth >= MIN_METERS) depth else 0.0
        }
    }

    /**
     * @param maxLegMeters maximum length of a leg. Make it small if the robot
     *   treats our intermediate goals like distant ones. Test day 2026-08-13
     *   showed that it does not: the track lay on the route even over long
     *   legs, so the subdivision only produced halts without any benefit.
     * @param toleranceMeters how close a waypoint counts as reached.
     * @param timeLimitSeconds give up per waypoint.
     * @param handoverRadiusMeters how far ahead of an intermediate waypoint the
     *   next one is handed over. `0.0` waits for the real arrival, which is the
     *   behaviour before 2026-08-13 and gives one halt per waypoint.
     */
    data class Settings(
        val maxLegMeters: Double = 10.0,
        val toleranceMeters: Double = 0.3,
        val timeLimitSeconds: Int = 30,
        // 1.2 since 2026-08-13, up from 0.8. The cap against half the leg
        // length carries the short legs of an evasive route anyway, so a
        // generous setting only takes effect where there is room for it, and
        // there it is what keeps the robot rolling.
        val handoverRadiusMeters: Double = 1.2,
        val homePoiName: String = "Standby-Punkt",

        /**
         * Safety margin laid around every obstacle when the map is read.
         *
         * The planner treats the robot as a single point on the grid, so a
         * chain of free cells says nothing about whether a robot fits through
         * it. Growing the obstacles by the robot's radius is what turns "the
         * point fits" into "the robot fits", and without it the search would
         * happily plan through a five centimetre crack.
         *
         * A setting since 2026-09-01, and it belongs here more than any of the
         * others: it is the one number that decides whether a route exists at
         * all. At 40 cm the office map of that day cut the robot off from seven
         * of its nine destinations, and every attempt to tell that from a real
         * obstacle needed a new APK.
         *
         * Takes effect on the next map load, see [setSettings].
         */
        val safetyMarginMeters: Double = PgmMap.DEFAULT_ROBOT_RADIUS_METERS,
        // Three metres. A single metre of depth is not enough to plan a way out
        // with, and a direction that is blocked up close is settled by the
        // first probe anyway, so the range costs only where it is free.
        val scanDistanceMeters: Double = 3.0,

        // Measured on 2026-08-13 over 22 scans from one spot, at every setting
        // from 50 to 500 ms: the pause makes no difference at all. The spread
        // at half a second was the same as at a twentieth. The 250 ms it
        // started at came from an experiment that turned out to be confounded,
        // where the only query that answered was also the only one with a
        // start angle of 0.
        //
        // A hundred is what is left, a margin over the fastest setting that
        // showed nothing untoward. Still a slider, because the next robot may
        // well differ.
        val probeGapMs: Long = 100L,
    )

    /** Drop the recorded track before every new attempt, or they overlap. */
    fun clearTrack() {
        _track.value = emptyList()
        _obstacleSightings.value = emptyList()
        _previousRoutes.value = emptyList()
    }

    fun setSettings(new: Settings) {
        // The margin is not a knob like the others. It is laid into the grid
        // while the map is read, so an already inflated map carries the old
        // one for good. Dropping it here is what makes the slider mean
        // something: the next order reads the map again, and `startEscort`
        // does that by itself.
        //
        // Only for this one setting. Every tap on every slider comes through
        // here, and re-reading 870,000 cells because somebody nudged the probe
        // pause would be a fine way to make the screen feel broken.
        val marginChanged = new.safetyMarginMeters != _settings.value.safetyMarginMeters
        _settings.value = new
        if (marginChanged) {
            planner = null
            _blockedAreas.value = emptyList()
            _state.value = State.Empty
            _message.value = "Aufschlag geändert — Karte wird neu gelesen"
        }
    }

    @Volatile
    private var cancelled = false

    private var planner: RoutePlanner? = null

    val grid: OccupancyGrid? get() = planner?.grid

    /**
     * Its own lifecycle, deliberately not the one of the UI.
     *
     * Starting a drive from a screen's `rememberCoroutineScope` means that
     * whoever switches tabs during the drive to look at the log cancels the
     * drive, silently, while the message still shows "Wegpunkt 3 von 7". The
     * robot belongs to the app, not to a screen.
     */
    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default +
            // Without a handler every unexpected error in a job takes the app
            // down, which on the robot means the screen is gone in the middle
            // of a test. Better a message that can be written down.
            CoroutineExceptionHandler { _, e ->
                android.util.Log.e("VergilNav", "job crashed", e)
                _message.value = "Fehler: ${e.javaClass.simpleName} ${e.message.orEmpty()}"
                _outcome.value = Outcome.Failed(_message.value)
            },
    )

    /**
     * Is a drive or a map operation currently running?
     *
     * `@Volatile`, because [stop] reads the field outside the lock. Today both
     * calls come from the UI thread, but as soon as an emergency stop comes
     * from an event (an obvious candidate: the robot's `onSuspend`), it might
     * otherwise read a stale value and miss the running job. That is precisely
     * the defect [stop] is meant to fix.
     */
    @Volatile
    private var job: Job? = null

    /**
     * The orders of the last [stop], on their way to the robot.
     *
     * Both are binder calls into the robot's core service, and on 2026-11-13
     * `stopNavigation` did not come back on the Nova. Called from the tap on
     * "Anhalten", it held the UI thread, and Android 9 then held back every
     * touch on the robot, the pull-down included, until it was switched off.
     * So they go out off the caller's thread, and a new job waits for them in
     * [start]: a stop that reached the robot after "Weiterfahren" would cancel
     * the drive the guest just asked for.
     */
    @Volatile
    private var stopping: Job? = null

    /**
     * Starts a job and refuses while one is running.
     *
     * Without this lock a second tap on FAHREN starts a second drive loop on
     * the same robot. Both begin every leg with `stopNavigation` and thereby
     * choke each other: the robot stutters, and the mission dies with the
     * misleading message "von außen gestoppt". On a touchscreen the double tap
     * is not a corner case.
     */
    private fun start(what: String, block: suspend () -> Unit) {
        synchronized(this) {
            if (job?.isActive == true) {
                _message.value = "$what: es läuft noch etwas"
                return
            }
            // A new order is a new intent, so the stop flag has to go. It used
            // to be reset only by `driveTo`, which left every other job dead
            // after a single press of STOPP: on 2026-08-13 the sweep answered
            // "abgebrochen" straight away and nothing else happened.
            cancelled = false
            _outcome.value = Outcome.Running
            val stopFirst = stopping
            job = scope.launch {
                stopFirst?.join()
                block()
                // Only when the block did not report an outcome of its own. A
                // cancelled job never gets here; `stop` reports for it.
                if (_outcome.value is Outcome.Running) _outcome.value = Outcome.Idle
            }
        }
    }

    /** FAHREN. Keeps running even when the screen changes. */
    fun startDrive(goalX: Double, goalY: Double, goalTheta: Double) {
        if (refuseWhileStopped("Fahren")) return
        start("Fahren") {
            val arrived = driveTo(goalX, goalY, goalTheta)
            _outcome.value = if (arrived) Outcome.Arrived else Outcome.Failed(_message.value)
        }
    }

    /**
     * Escort: the same drive as [startDrive], under the guest's name.
     *
     * It used to fetch the map first when there was none. That is [driveTo]'s
     * job since 2026-09-01, and there it happens before every drive rather than
     * only the first, which is the whole point.
     */
    fun startEscort(goalX: Double, goalY: Double, goalTheta: Double) {
        if (refuseWhileStopped("Begleiten")) return
        start("Begleiten") {
            val arrived = driveTo(goalX, goalY, goalTheta)
            _outcome.value = if (arrived) Outcome.Arrived else Outcome.Failed(_message.value)
        }
    }

    /**
     * Refuses an order while the emergency stop is pressed.
     *
     * Only the orders that move the robot. Loading a map or looking at the
     * diagnostics has to keep working, that is precisely what somebody does
     * while the button is down.
     */
    private fun refuseWhileStopped(what: String): Boolean {
        if (ral.emergencyStop.value != true) return false
        _message.value = "$what: der Not-Halt ist gedrückt"
        _outcome.value = Outcome.Failed(_message.value)
        return true
    }

    fun startMapLoad() = start("Karte laden") { loadMap() }

    fun startPlanning(goalX: Double, goalY: Double) = start("Planen") { plan(goalX, goalY) }

    /** Drehscan. The robot turns on the spot, see [scanSurroundings]. */
    fun startScan() = start("Drehscan") { scanSurroundings() }

    /** Drehscan, and this time the result goes into the map. See [applyScan]. */
    fun startScanAndApply() = start("Freiräumen") {
        scanSurroundings()
        if (!cancelled) applyLastScan()
    }

    /**
     * Feeds the last scan into the planning grid.
     *
     * Everything up to here was measurement without consequence. This is where
     * it gains one, and it is the point where being wrong costs something, so
     * the two directions are treated differently on purpose:
     *
     * Free is carved narrowly. Only the cone the sensor actually looks at,
     * never the full 45 degree step, and stopping [CLEAR_MARGIN_METERS] short
     * of the measured clearance.
     *
     * Blocked is stamped generously. Half a metre of depth behind the reported
     * distance, because an obstacle is a body and not a surface, and because a
     * stamp too many costs a detour while one too few costs a collision.
     *
     * The chassis avoidance stays underneath all of it. A carve that turns out
     * wrong does not end in a crash but in a swerve, then a timeout, then a
     * block at that spot, which is the loop that already works.
     */
    private fun applyLastScan(): Int {
        val planner = this.planner ?: run {
            _message.value = "Erst die Karte laden"
            return 0
        }
        val scan = _surroundings.value ?: run {
            _message.value = "Noch kein Drehscan gemacht"
            return 0
        }

        val half = Math.toRadians(Carve.CONE_DEGREES / 2.0)
        var freed = 0
        var blocked = 0

        for (sector in scan.sectors) {
            // The sector angles are relative to the heading the scan began at.
            val centre = scan.theta +
                Math.toRadians((sector.startAngleDeg + sector.endAngleDeg) / 2.0)

            // Carved from the robot outwards, starting at zero. "Nothing within
            // half a metre" says the half metre is free as well, and it is the
            // robot's own cell that lies in there: with that one blocked the
            // planning fails on its first step, before any route exists to be
            // wrong about.
            val depth = Carve.depthOf(sector)
            if (depth > 0.0) {
                freed += planner.clearWedge(
                    scan.x, scan.y, centre, half, 0.0, depth, Carve.MIN_HALF_WIDTH_METERS,
                )
            }

            // Second, so that where the two overlap the block editions. Within
            // one scan that cannot happen, a direction is either clear to some
            // distance or blocked at one, but across two scans of the same spot
            // it can.
            sector.blockedAtMeters?.let { at ->
                blocked += planner.blockWedge(
                    scan.x, scan.y, centre, half, at, at + BLOCK_DEPTH_METERS,
                )
            }
        }

        _blockedAreas.value = planner.grid.blockedAreas
        NavLog.i(TAG, "Scan applied: $freed cells freed, $blocked cells blocked")
        _message.value = "Gemessen: $freed Zellen frei, $blocked Zellen gesperrt"
        return freed
    }

    /**
     * Turns on the spot and asks at every step what lies straight ahead.
     *
     * The detour through the rotation is not a design choice but the sensor.
     * The lidar sits low at the front and sees maybe 90 to 120 degrees, so
     * behind the robot there is nothing to measure, and an answer of "clear"
     * from back there means "not measured", never "free".
     *
     * On top of that the SDK's angular argument turns out to be no help at all.
     * Measured on 2026-08-13 over dozens of sweeps: only a query starting at 0
     * degrees ever answered "obstacle", whatever stood where. In front, to the
     * side, two objects at once, always the same. The call means exactly one
     * thing, "is something straight ahead", and it does that reliably.
     *
     * So we take the one answer it gives, and point the robot in eight
     * directions to get it eight times. That takes around twenty seconds, which
     * is affordable for something that only ever runs when the robot is stuck.
     *
     * Still a measurement, nothing more. Nothing here touches the grid or a
     * route yet.
     */
    suspend fun scanSurroundings() {
        val start = ral.currentPose()
        if (start == null) {
            _message.value = "Roboter weiß nicht, wo er steht — erst Status laden"
            return
        }

        val step = 360.0 / SCAN_STEPS
        val sectors = mutableListOf<ScanSector>()

        // Probed from near to far. Physically an obstacle inside one metre is
        // inside two as well, so the first "blocked" ends the direction and the
        // remaining probes are skipped. That is not only correct, it is what
        // keeps the depth affordable: in a cluttered spot most directions are
        // settled by the first probe.
        val ranges = scanRanges(_settings.value.scanDistanceMeters)
        val probeGap = _settings.value.probeGapMs
        var probeCount = 0

        for (i in 0 until SCAN_STEPS) {
            if (cancelled) {
                _message.value = "Drehscan abgebrochen"
                return
            }

            // The heading actually reached, not the one we asked for. A turn
            // overshoots or falls short, and a sector drawn at the commanded
            // angle would quietly lie about where the robot was looking.
            val here = ral.currentPose() ?: start
            val facing = normalizeDegrees(Math.toDegrees(here.theta - start.theta))

            // Walked from near to far, not halved.
            //
            // Nested intervals were cheaper and wrong in the one way that
            // matters. Measured over 22 scans from one spot on 2026-08-13, one
            // direction jumped between "clear to three metres" and "blocked at
            // 1.25 m" while seven others stayed put. Its first probe sits at
            // 1.75 m, the middle of the range, and something marginal editions
            // there: read as clear, the search moves outward and reports three
            // metres without ever looking at what is nearer. A flicker at one
            // range thus becomes the maximally wrong answer, and it did so in
            // the very direction that was supposed to be the way out.
            //
            // Walking cannot do that. It only ever reports a clearance it has
            // measured, and a wrong reading makes it stop too early, which is
            // the harmless direction to be wrong in.
            //
            // The same 22 scans showed the pause between probes makes no
            // difference at all, at 500 ms the spread was the same as at 50, so
            // walking at a short pause now costs about what halving at a long
            // one used to.
            var clear = 0.0
            var blockedAt: Double? = null
            var probes = 0

            for (range in ranges) {
                if (probes > 0) delay(probeGap)
                val ahead = ral.checkObstacle(0.0, PROBE_WIDTH_DEGREES, range)
                probes++

                if (ahead.blocked == true) {
                    blockedAt = range
                    break
                }
                // An answer we do not understand ends the direction rather than
                // being counted as clear.
                if (ahead.blocked == null) break
                clear = range
            }

            probeCount += probes

            sectors += ScanSector(
                startAngleDeg = facing - step / 2.0,
                endAngleDeg = facing + step / 2.0,
                clearMeters = clear,
                blockedAtMeters = blockedAt,
            )

            _message.value = "Drehscan: ${sectors.size} von $SCAN_STEPS"
            _surroundings.value = Surroundings(sectors.toList(), start.x, start.y, start.theta)

            // Turn to an absolute heading, not by an increment. Turning by 45
            // degrees eight times leaves the robot 15 to 20 degrees short of
            // where it started, because every single turn falls a little
            // shy and the shortfalls add up. Against a target derived from the
            // starting heading, each step corrects the one before it.
            //
            // After the eighth measurement the target is a full circle on, so
            // the robot ends up facing the way it began instead of askew.
            turnTo(start.theta + Math.toRadians(step * (i + 1)))
        }

        val pattern = sectors.joinToString(" ") {
            if (it.blockedAtMeters != null) "${it.clearMeters}|${it.blockedAtMeters}" else "${it.clearMeters}+"
        }
        NavLog.i(
            TAG,
            // The starting heading belongs in the line. Sectors are relative to
            // it, and it drifts by a few degrees per scan, so without it two
            // scans cannot honestly be compared: sector 3 of one does not point
            // where sector 3 of the next does. That confounded the comparison
            // of 22 scans on 2026-08-13.
            "Rotating scan ${SCAN_STEPS}x${step.toInt()} from " +
                "${"%.1f".format(Math.toDegrees(start.theta))} deg, ${ranges.size} ranges " +
                "${ranges.first()}..${ranges.last()} m, $probeCount probes, gap ${probeGap}ms: $pattern",
        )

        val blocked = sectors.filter { it.blockedAtMeters != null }
        val furthest = sectors.maxOfOrNull { it.clearMeters } ?: 0.0

        _message.value = if (blocked.isEmpty()) {
            "Drehscan: rundum frei bis ${"%.1f".format(furthest)} m"
        } else {
            val where = blocked.joinToString(", ") {
                "${direction((it.startAngleDeg + it.endAngleDeg) / 2.0)} (${"%.1f".format(it.blockedAtMeters)} m)"
            }
            "Drehscan: blockiert $where"
        }
    }

    /**
     * The ranges of one direction, from near to far, in ascending order.
     *
     * Fine on purpose. Coarse steps do not merely round the depth, they throw
     * it away at the near end: with one metre as the first step, an obstacle at
     * 95 cm leaves a clearance of zero, and a direction the robot could turn in
     * looks like a wall against its nose.
     *
     * The count costs nothing since the search halves the interval rather than
     * walking it. The slider caps the far end.
     */
    private fun scanRanges(maxMeters: Double): List<Double> {
        val ranges = mutableListOf<Double>()
        var r = SCAN_RANGE_NEAREST_METERS
        while (r <= maxMeters + 1e-9) {
            ranges += kotlin.math.round(r * 100.0) / 100.0
            r += SCAN_RANGE_STEP_METERS
        }
        // The slider must never mean less than it says: if its value does not
        // land on a step, it becomes the last one itself.
        if (ranges.isEmpty() || ranges.last() < maxMeters - 1e-9) ranges += maxMeters
        return ranges
    }

    /**
     * Turns on the spot until the robot is facing [targetTheta], in radians.
     *
     * Absolute rather than relative, so that the shortfall of one turn does not
     * survive into the next. [Ral.turnLeft] also returns immediately, so
     * without waiting for the pose all eight probes would go out during the
     * first rotation and every one of them would measure the same direction.
     *
     * Two attempts: the turn, and one correction of what it fell short by. A
     * third would be chasing an accuracy the chassis does not have, and it
     * costs nothing here because each sector is recorded at the heading really
     * reached rather than the one aimed at.
     */
    private suspend fun turnTo(targetTheta: Double) {
        repeat(TURN_ATTEMPTS) { attempt ->
            val now = ral.currentPose() ?: return
            val missingDeg = Math.toDegrees(normalizeRadians(targetTheta - now.theta))
            if (kotlin.math.abs(missingDeg) <= TURN_TOLERANCE_DEGREES) {
                if (attempt > 0) NavLog.i(TAG, "Heading corrected to within ${"%.1f".format(missingDeg)} deg")
                return
            }

            if (missingDeg > 0) ral.turnLeft(missingDeg.toFloat(), SCAN_TURN_SPEED_DPS)
            else ral.turnRight((-missingDeg).toFloat(), SCAN_TURN_SPEED_DPS)

            val deadline = System.currentTimeMillis() + TURN_TIMEOUT_MS
            while (System.currentTimeMillis() < deadline) {
                delay(TURN_POLL_MS)
                if (cancelled) return
                val p = ral.currentPose() ?: continue
                if (kotlin.math.abs(Math.toDegrees(normalizeRadians(targetTheta - p.theta)))
                    <= TURN_TOLERANCE_DEGREES
                ) {
                    break
                }
            }
            // Let the chassis come to rest. A sensor reading taken while still
            // swinging belongs to no direction in particular.
            delay(SCAN_SETTLE_MS)
        }
    }

    /** To (-180, 180]. */
    private fun normalizeDegrees(deg: Double): Double {
        var d = deg % 360.0
        if (d > 180.0) d -= 360.0
        if (d <= -180.0) d += 360.0
        return d
    }

    /** To (-pi, pi]. */
    private fun normalizeRadians(rad: Double): Double {
        var r = rad % (2 * Math.PI)
        if (r > Math.PI) r -= 2 * Math.PI
        if (r <= -Math.PI) r += 2 * Math.PI
        return r
    }

    /**
     * Sector angle to a direction anyone can check standing next to the robot.
     *
     * German, like everything the operator reads on the display. Eight buckets
     * of 45 degrees: finer would suggest a precision that a 15 degree sector
     * does not have.
     */
    private fun direction(angleDeg: Double): String {
        val a = ((angleDeg % 360.0) + 360.0) % 360.0
        return when {
            a < 22.5 || a >= 337.5 -> "vorn"
            a < 67.5 -> "vorn links"
            a < 112.5 -> "links"
            a < 157.5 -> "hinten links"
            a < 202.5 -> "hinten"
            a < 247.5 -> "hinten rechts"
            a < 292.5 -> "rechts"
            else -> "vorn rechts"
        }
    }

    init {
        // The path planner logs through a seam of its own so that it stays
        // testable without Android. On the device we hook it up to logcat.
        NavLog.sink = de.labland.vergil.navigation.NavLogSink { _, tag, message ->
            android.util.Log.i("VergilNav", "[$tag] $message")
        }

        // Mirror the display messages into logcat. Without this the whole
        // course of a drive is missing from the log: the retreat on 2026-08-13
        // could only be recognised by a thousand cells suddenly being dropped.
        scope.launch {
            _message.collect { if (it.isNotBlank()) android.util.Log.i("VergilNav", "[msg] $it") }
        }

        // The emergency stop halts the chassis, it does not end our order. So
        // on the device on 2026-08-14 the robot stood still while the button
        // was down and set off again the moment it was released, towards a
        // destination nobody was walking to any more. A press is a decision,
        // and it ends the drive.
        scope.launch {
            ral.emergencyStop.collect { pressed ->
                if (pressed == true && job?.isActive == true) {
                    NavLog.i(TAG, "Emergency stop pressed, cancelling the running order")
                    cancelWith("Not-Halt gedrückt")
                }
            }
        }

        scope.launch {
            ral.events.collect { event ->
                if (event is de.labland.vergil.ral.RalEvent.ObstacleSeen) {
                    val soFar = _obstacleSightings.value
                    // Thin out: the chassis reports the same obstacle several
                    // times a second while it swerves, and a hundred markers on
                    // the same spot say nothing more than one does.
                    val near = soFar.any {
                        kotlin.math.hypot(event.x - it.first, event.y - it.second) < SIGHTING_MERGE_METERS
                    }
                    if (!near) _obstacleSightings.value = soFar + (event.x to event.y)
                }
            }
        }
    }

    /**
     * Fetches the occupancy map from the robot and lays the safety margin. On
     * the device this takes a few seconds, the map has over 600,000 cells.
     */
    suspend fun loadMap(): Boolean {
        _message.value = "Karte wird geladen …"
        val bytes = ral.readMapPgm()
        if (bytes == null) {
            _message.value = "Roboter gibt keine Karte heraus"
            return false
        }
        val margin = _settings.value.safetyMarginMeters
        return try {
            val grid = withContext(Dispatchers.Default) { PgmMap.parse(bytes, margin) }
            planner = RoutePlanner(grid)
            _state.value = State.MapLoaded(grid)
            val stats = grid.getStats()
            // The margin belongs in this line, and specifically the value that
            // took effect rather than the one that was asked for. On a 5 cm
            // grid there is no 32 cm margin: it becomes 35, because rounding a
            // safety distance down is the wrong direction. Whoever reads
            // "0.32" on the slider and "0.35 m" here can tell the two apart,
            // and on 2026-09-01 exactly those 3 cm were the difference between
            // a route and none.
            val effective = kotlin.math.ceil(margin / grid.resolution) * grid.resolution
            _message.value = "Karte: ${grid.width}×${grid.height} Zellen, " +
                "${"%.0f".format(stats.passablePercent)} % befahrbar, " +
                "Aufschlag ${"%.2f".format(effective)} m"
            true
        } catch (e: PgmMap.ParseException) {
            _message.value = "Karte nicht lesbar: ${e.message}"
            false
        } catch (e: OutOfMemoryError) {
            // The parser rejects implausible dimensions beforehand; this is
            // the second line of defence. A memory error is not an exception
            // and would otherwise end the app, on the robot in mid-test.
            _message.value = "Karte zu groß für den Speicher"
            false
        }
    }

    /** Plans without driving, so the path can be looked at first. */
    suspend fun plan(goalX: Double, goalY: Double): RoutePlanner.Route? {
        val planner = this.planner ?: run {
            _message.value = "Erst die Karte laden"
            return null
        }
        // Fetch the position fresh and wait for it. When replanning after a
        // blockade the robot no longer editions where it stood at the last
        // status query, and with the old position the new route would begin
        // somewhere behind it, making the first leg run backwards.
        val pose = ral.currentPose()
        if (pose == null) {
            _message.value = "Roboter weiß nicht, wo er steht — erst Status laden"
            return null
        }

        val max = _settings.value.maxLegMeters.takeIf { it > 0.0 }
        val route = withContext(Dispatchers.Default) { planner.plan(pose.x, pose.y, goalX, goalY, max) }
        if (route == null) {
            _message.value = "Kein Weg dorthin"
            return null
        }
        _state.value = State.Planned(planner.grid, route)
        _message.value = "Route: ${route.waypoints.size} Wegpunkte, " +
            "${"%.1f".format(route.lengthMeters)} m"
        return route
    }

    /**
     * Plans and drives. On a blockade the spot is blocked in our map and the
     * route replanned, at most [maxReplans] times. At some point the way is
     * genuinely closed, and then the robot should say so instead of trying on.
     */
    suspend fun driveTo(
        goalX: Double,
        goalY: Double,
        goalTheta: Double,
        // Six rather than three since 2026-08-13, for two reasons that pull the
        // same way. A blocked leg is decided in seconds now instead of half a
        // minute, so an attempt costs a fraction of what it did. And every
        // second failure buys a measurement and a step, so the later attempts
        // are no longer the same attempt repeated: they start from somewhere
        // else, with a map that has been corrected in between.
        maxReplans: Int = 6,
    ): Boolean {
        cancelled = false
        _track.value = emptyList()
        _obstacleSightings.value = emptyList()
        _previousRoutes.value = emptyList()
        _blockedAreas.value = emptyList()

        // Read the map from the robot again, before every single drive.
        //
        // Two things fall out of this at once. The stamps of the last drive are
        // gone, which used to happen only in `retreat` and therefore never
        // after a cancelled one: the grid could only get more blocked, since
        // every rotating scan stamps its wedges and the next drive inherited
        // them. And a map that changed on the robot arrives. That second one
        // cost an evening on 2026-09-01: the map had been corrected in the
        // Orionstar tool, the app kept planning on the copy it had read hours
        // earlier, and nothing about it looked wrong. Watching for a change is
        // not possible either, because editing a map does not change its name.
        //
        // Affordable: read, parse and inflate together took 209 ms on the Nova
        // for 780x1120 cells, measured in the log of that evening. Against a
        // drive of half a minute that is nothing.
        if (!loadMap()) return false

        // Has to be taken before the first metre: this is where the robot goes
        // back to if nothing works out.
        val startPose = ral.currentPose()

        val recording = CoroutineScope(currentCoroutineContext()).launch {
            while (isActive) {
                delay(TRACK_SAMPLE_MS)
                // Only the pose, not the whole status: the big status query
                // writes two lines to the log and at two queries per second
                // would push every driving event out of the 200 line log.
                val p = ral.currentPose() ?: continue
                val soFar = _track.value
                val last = soFar.lastOrNull()
                // Record real movement only, otherwise the list grows while
                // standing still and plasters over the map.
                if (last == null || kotlin.math.hypot(p.x - last.first, p.y - last.second) > 0.05) {
                    _track.value = soFar + (p.x to p.y)
                }
            }
        }
        try {
            val arrived = driveLoop(goalX, goalY, goalTheta, maxReplans)
            // Not after a STOPP. Whoever hits the emergency stop wants the
            // robot to edition still, not to set off on a journey of its own.
            if (!arrived && !cancelled) retreat(startPose)
            return arrived
        } finally {
            recording.cancel()
        }
    }

    /**
     * Last resort when no route works out any more: back to where the drive
     * began, and if even that fails, to the home POI.
     *
     * Without this the robot stays standing wherever it got stuck, in the
     * middle of an aisle, in front of the obstacle it could not get past. In a
     * REWE store that is not a failed drive but a blocked aisle.
     */
    private suspend fun retreat(start: RobotPose?) {
        // First forget our own obstacles. They are precisely what led into the
        // dead end: on 2026-08-13 four stamped areas piled up around a robot
        // that had not moved between them. Retreating with that map means
        // planning around one's own phantoms.
        planner?.clearObstacles()
        // Deliberately not cleared on the map: the circles are the evidence of
        // what went wrong here, and they are the reason for the retreat.

        val home = _settings.value.homePoiName

        if (start != null) {
            _message.value = "Kein Weg. Zurück zum Startpunkt …"
            // One single order, deliberately not our waypoint loop. That one
            // has just shown that it cannot solve this situation, and the
            // robot's own planner has the advantage of knowing nothing about
            // our grid. The way back is also one it demonstrably drove once.
            val back = ral.driveTo(
                start.x,
                start.y,
                start.theta,
                RETREAT_TOLERANCE_METERS,
                RETREAT_TIMEOUT_MS,
            )
            if (back is DriveResult.Arrived) {
                _message.value = "Zurück am Startpunkt"
                return
            }
            if (cancelled) return
        }

        // Fire and forget: there is nothing left after this, and the POI
        // navigation reports only into the log.
        _message.value = "Auch der Rückweg blockiert. Fahre zu \"$home\""
        ral.navigateTo(home)
    }

    private suspend fun driveLoop(
        goalX: Double,
        goalY: Double,
        goalTheta: Double,
        maxReplans: Int,
    ): Boolean {

        var attempt = 0
        var scans = 0
        var failedSinceScan = 0
        var lastRoute: RoutePlanner.Route? = null

        // Measure, correct the map, and take a step into whatever came back
        // freest. Returns false when there is nothing left to try, so the
        // caller can stop rather than run out its remaining attempts against a
        // map that has not changed.
        suspend fun measureAndEscape(): Boolean {
            failedSinceScan = 0
            scans++
            _message.value = "Kommt nicht weiter — messe die Umgebung"
            scanSurroundings()
            if (cancelled) return false
            val freed = applyLastScan()
            val moved = escapeStep(goalX, goalY)
            return freed > 0 || moved
        }

        while (attempt <= maxReplans) {
            if (cancelled) {
                _message.value = "Abgebrochen"
                return false
            }

            // Fetch per attempt instead of remembering it once at the start.
            // The fallback is not reachable today, since `start` does not
            // allow "Karte laden" during a drive and nothing else resets the
            // planner. It editions here anyway: were that lock ever to go, two
            // grids would arise, planning would use the new one and the
            // obstacles would land in the old one, so the same real obstacle
            // would produce the same route every time.
            val planner = this.planner ?: run {
                _message.value = "Karte ist weg"
                return false
            }

            // No route at all is not a different situation from a route that
            // fails, it is the same one seen a step earlier: the map says the
            // way is closed. Giving up here without ever looking was what made
            // the robot turn round at a spot where the way out lay behind it,
            // drawn as a wall.
            val route = plan(goalX, goalY)
            if (route == null) {
                if (scans >= MAX_SCANS_PER_DRIVE || !measureAndEscape()) return false
                attempt++
                continue
            }

            // Keep what the previous attempt tried. Otherwise a replan is
            // invisible: the new route replaces the old one on screen, and
            // afterwards nobody can tell what the robot attempted in between.
            lastRoute?.let { _previousRoutes.value = _previousRoutes.value + it }
            lastRoute = route

            // The first waypoint is our own position, nobody drives to that.
            val drivePoints = route.waypoints.drop(1)
            if (drivePoints.isEmpty()) {
                _message.value = "Steht schon am Ziel"
                return true
            }

            var blocked = false
            for ((i, wp) in drivePoints.withIndex()) {
                if (cancelled) {
                    ral.cancelNavigation()
                    _message.value = "Abgebrochen"
                    return false
                }
                // Belt and braces next to the listener in `init`: whether the
                // status arrives at all is a promise of the SDK, and a leg that
                // starts here sends the robot off for the next thirty seconds.
                if (ral.emergencyStop.value == true) {
                    ral.cancelNavigation()
                    _message.value = "Not-Halt gedrückt"
                    return false
                }

                _state.value = State.Driving(planner.grid, route, i + 1)
                _message.value = "Wegpunkt ${i + 1} von ${drivePoints.size}"

                val last = i == drivePoints.lastIndex

                // At the last point the planned goal heading, on the way the
                // heading the robot arrives with. `route.waypoints[i]` is the
                // predecessor of `wp`, so its heading is exactly the direction
                // of travel into this waypoint.
                //
                // The obvious choice would be the outgoing direction of the
                // waypoint itself. It looks right and costs a halt: the robot
                // rolls in on the incoming heading, the two differ by a few
                // degrees because it stops up to a tolerance beside the point,
                // and it corrects those degrees from a standstill. That was
                // the little turning back and forth on test day 2026-08-13.
                // Those few degrees are better handled by the next leg while
                // driving.
                val theta = if (last) goalTheta else route.waypoints[i].heading

                val s = _settings.value

                // No handover at the last point: there the robot is supposed
                // to arrive properly instead of stopping a radius short of the
                // goal.
                val handover = if (last) 0.0 else s.handoverRadiusMeters

                // Measured against the leg rather than fixed. A flat limit is
                // wrong at both ends: on a ten metre leg it cuts an honest
                // drive short, and on the eighty centimetre legs a route around
                // an obstacle consists of it editions around for half a minute
                // after everything has long been decided.
                val previous = route.waypoints[i]
                val legMeters = kotlin.math.hypot(wp.x - previous.x, wp.y - previous.y)

                when (
                    val result = ral.driveTo(
                        wp.x,
                        wp.y,
                        theta,
                        s.toleranceMeters,
                        legTimeoutMs(legMeters, s.timeLimitSeconds),
                        handover,
                    )
                ) {
                    is DriveResult.Arrived -> Unit

                    is DriveResult.Blocked -> {
                        val (bx, by) = blockadeSpot(wp)
                        planner.block(bx, by, BLOCKADE_RADIUS_METERS)
                        _blockedAreas.value = planner.grid.blockedAreas
                        _message.value = "Blockiert (${result.reason}) — plane neu"
                        blocked = true
                        break
                    }

                    is DriveResult.Cancelled -> {
                        _message.value = "Fahrt wurde von außen gestoppt"
                        return false
                    }

                    is DriveResult.Failed -> {
                        // Halt explicitly. Since the handover a leg no longer
                        // clears before it starts, so on a failure a running
                        // navigation could otherwise keep the robot rolling
                        // with nobody watching it any more.
                        ral.cancelNavigation()
                        _message.value = "Fahrt fehlgeschlagen: ${result.reason}"
                        return false
                    }
                }
            }

            if (!blocked) {
                _state.value = State.Planned(planner.grid, route)
                _message.value = "Angekommen"
                return true
            }
            attempt++
            failedSinceScan++

            // Not only at the very end. Waiting until every replan is used up
            // means the robot first drives the same wrong corner three times
            // over, on a map that will not have changed in between. Two
            // failures are enough evidence that this is not bad luck.
            if (failedSinceScan >= SCAN_AFTER_FAILED_ATTEMPTS && scans < MAX_SCANS_PER_DRIVE) {
                if (!measureAndEscape()) return false
            }
        }

        _message.value = "Nach $maxReplans Neuplanungen kein Weg gefunden"
        return false
    }

    /**
     * Drives one step into the direction the last scan found freest.
     *
     * Freeing cells in the grid is not enough on its own, and the map from the
     * evening of 2026-08-13 shows why: the measurement opened a corridor that
     * pointed almost straight at the goal, and the planner still chose the
     * detour the other way. A carved wedge reaches as far as the sensor sees,
     * some two and a half metres, and beyond that lies the same aged map. A
     * route needs a way through, and two and a half metres of it are not one.
     *
     * A step is. From a position two metres further on, the next scan measures
     * ground the previous one could not see, and the robot feels its way
     * forward instead of proving over and over that from here nothing works.
     *
     * Deliberately driven with [Ral.moveForward] rather than a navigation
     * order. The point of the step is to go where the map says it is
     * impossible, and asking the robot's own planner for that is asking the
     * wrong authority. The chassis avoidance stays switched on, so the step is
     * blind about the map but not about the world.
     */
    private suspend fun escapeStep(goalX: Double, goalY: Double): Boolean {
        val scan = _surroundings.value ?: return false
        val start = ral.currentPose() ?: return false
        val toGoal = kotlin.math.hypot(goalX - start.x, goalY - start.y)

        var bestGain = Double.NEGATIVE_INFINITY
        var bestHeading = 0.0
        var bestStep = 0.0
        var bestLabel = ""

        for (sector in scan.sectors) {
            val depth = Carve.depthOf(sector)
            if (depth <= 0.0) continue

            val middle = (sector.startAngleDeg + sector.endAngleDeg) / 2.0
            val heading = scan.theta + Math.toRadians(middle)
            val step = kotlin.math.min(depth, ESCAPE_STEP_METERS)
            val x = start.x + step * kotlin.math.cos(heading)
            val y = start.y + step * kotlin.math.sin(heading)

            // How much closer to the goal this step gets us, as the crow flies.
            // A negative value is allowed to win when nothing better is on
            // offer: stepping away from the goal to get out of a corner still
            // beats standing in the corner.
            val gain = toGoal - kotlin.math.hypot(goalX - x, goalY - y)
            if (gain > bestGain) {
                bestGain = gain
                bestHeading = heading
                bestStep = step
                bestLabel = direction(middle)
            }
        }

        if (bestStep <= 0.0) {
            _message.value = "Rundum nichts Freies gemessen"
            return false
        }

        NavLog.i(
            TAG,
            "Escape step ${"%.2f".format(bestStep)} m towards " +
                "${"%.1f".format(Math.toDegrees(bestHeading))} deg, " +
                "${"%.2f".format(bestGain)} m closer to the goal",
        )
        _message.value = "Weiche aus: ${"%.1f".format(bestStep)} m nach $bestLabel"

        turnTo(bestHeading)
        if (cancelled) return false
        ral.moveForward(bestStep.toFloat(), ESCAPE_SPEED_MPS)

        val deadline = System.currentTimeMillis() + ESCAPE_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            delay(ESCAPE_POLL_MS)
            if (cancelled) {
                ral.stop()
                return false
            }
            val pose = ral.currentPose() ?: continue
            if (kotlin.math.hypot(pose.x - start.x, pose.y - start.y)
                >= bestStep - ESCAPE_TOLERANCE_METERS
            ) {
                NavLog.i(TAG, "Escape step done")
                return true
            }
        }

        // Out of time. Whatever was covered still counts: the next plan starts
        // from somewhere else, which is the whole purpose of the step.
        ral.stop()
        val covered = ral.currentPose()
            ?.let { kotlin.math.hypot(it.x - start.x, it.y - start.y) } ?: 0.0
        NavLog.i(TAG, "Escape step stopped after ${"%.2f".format(covered)} m")
        return covered > ESCAPE_TOLERANCE_METERS
    }

    /**
     * Time limit for one leg, from its length.
     *
     * The slider is the ceiling, not the value. A leg gets what it plausibly
     * needs, [LEG_BASE_SECONDS] for starting off, turning on the spot and
     * stopping, plus [LEG_SECONDS_PER_METER] for the distance. That is around
     * 0.25 m/s, half of what the robot manages on a clear stretch, so an honest
     * leg has room to spare and a hopeless one is over quickly.
     */
    private fun legTimeoutMs(legMeters: Double, capSeconds: Int): Long {
        val seconds = LEG_BASE_SECONDS + legMeters * LEG_SECONDS_PER_METER
        return (kotlin.math.min(seconds, capSeconds.toDouble()) * 1000).toLong()
    }

    /**
     * Where the obstacle probably editions: just ahead of the robot, not at the
     * waypoint.
     *
     * On a timeout the robot editions somewhere along the leg and whatever holds
     * it up is directly in front of it, so at two meters of leg length the
     * waypoint can be two meters off. A block at the far end lets the replan
     * route around the free waypoint and still lead straight through the real
     * obstacle, and then every attempt fails at the same spot.
     */
    private suspend fun blockadeSpot(wp: PathSimplifier.Waypoint): Pair<Double, Double> {
        val pose = ral.currentPose() ?: return wp.x to wp.y
        val dx = wp.x - pose.x
        val dy = wp.y - pose.y
        val distance = kotlin.math.hypot(dx, dy)
        if (distance < 1e-6) return wp.x to wp.y
        val fraction = (BLOCKADE_LOOKAHEAD_METERS / distance).coerceAtMost(1.0)
        return pose.x + dx * fraction to pose.y + dy * fraction
    }

    /**
     * Emergency stop: halts the robot, ends the running job, and says so.
     *
     * All three parts are needed. Without the cancel flag and the cancelled
     * job the waypoint loop drives to the next point, so the robot sets off
     * again from standstill. And without the message here, "Wegpunkt 3 von 7"
     * would stay on screen: the cancellation almost always hits the coroutine
     * inside `driveTo`, that is at a suspension point from which none of the
     * branches that would otherwise set "Abgebrochen" ever run. Whoever
     * presses the emergency stop has to see on screen that it took effect.
     *
     * Returns at once and never waits for the robot, see [stopping].
     */
    fun stop() = cancelWith("Abgebrochen")

    private fun cancelWith(reason: String) {
        cancelled = true
        synchronized(this) { job?.cancel() }
        stopping = scope.launch(Dispatchers.IO) {
            ral.stop()
            ral.cancelNavigation()
        }
        _message.value = reason
        _outcome.value = Outcome.Failed(reason)
        // Back to the planned path: the route stays visible, but no waypoint
        // is highlighted as "currently being driven" any more.
        _state.value = when (val s = _state.value) {
            is State.Driving -> State.Planned(s.grid, s.route)
            else -> s
        }
    }

    /** Forget the blocks from an earlier drive. */
    fun clearRememberedObstacles() {
        planner?.clearObstacles()
        _blockedAreas.value = emptyList()
        _message.value = "Gemerkte Hindernisse gelöscht"
    }

    private companion object {
        /** Sampling rate of the driven track. */
        const val TRACK_SAMPLE_MS = 500L

        /**
         * Sightings closer together than this count as the same obstacle. The
         * chassis reports its swerving several times a second, and a hundred
         * markers on one spot say no more than a single one does.
         */
        const val SIGHTING_MERGE_METERS = 0.4

        /** How close counts as back at the start. This is a retreat, not a docking manoeuvre. */
        const val RETREAT_TOLERANCE_METERS = 0.5

        /** Time for the whole way back in one piece, not per leg. */
        const val RETREAT_TIMEOUT_MS = 120_000L

        /**
         * Stops of the rotating scan. Eight gives 45 degrees per step.
         *
         * Bounded by the turning, not by the query: every step costs a rotation
         * plus its settling time. Sixteen steps would double the time for a
         * resolution the sensor's own opening angle does not deliver anyway.
         */
        const val SCAN_STEPS = 8

        /**
         * End angle of the forward probe.
         *
         * Only the start angle of 0 matters, that is the one the SDK answers
         * at all. The end angle is passed because the signature demands one,
         * and 45 is the value that demonstrably worked on the device.
         */
        const val PROBE_WIDTH_DEGREES = 45.0

        /**
         * Nearest range a direction is probed at.
         *
         * Below this the answer stops being useful: the robot is 60 cm wide, so
         * anything inside half a metre of its centre is as good as touching it.
         */
        const val SCAN_RANGE_NEAREST_METERS = 0.5

        /**
         * Resolution of the depth.
         *
         * 25 cm is fine enough to tell a gap the robot fits through from one it
         * does not, and thanks to the nested intervals it costs no more probes
         * than a coarse grid would.
         */
        const val SCAN_RANGE_STEP_METERS = 0.25


        /**
         * How deep behind the measured distance an obstacle is stamped.
         *
         * The sensor reports a surface, the robot has to drive around a body.
         * Half a metre is what a person, a roll container or a pallet takes up,
         * and stamping too deeply costs a detour rather than a collision.
         */
        const val BLOCK_DEPTH_METERS = 0.5

        /** Turning speed of the scan. Brisk enough that the depth costs no extra time. */
        const val SCAN_TURN_SPEED_DPS = 45f

        /**
         * Patience per step before the turn is accepted as it is.
         *
         * A 45 degree turn takes about a second. The eight seconds that used to
         * edition here were paid in full whenever the robot turned reluctantly
         * because something stood right next to it, which is exactly the
         * situation the scan exists for: on 2026-08-13 a single step took 9.6
         * seconds instead of 2.3.
         */
        const val TURN_TIMEOUT_MS = 3_500L

        /** The turn, plus one correction of what it fell short by. */
        const val TURN_ATTEMPTS = 2

        /**
         * Close enough to the target heading.
         *
         * Wide on purpose. The chassis falls some 2.5 to 3 degrees short of
         * every turn, so a tolerance of 3 sat right on that boundary and
         * corrected on a coin flip, which is the twitching visible on the
         * device. Correcting buys nothing anyway: every sector is recorded at
         * the heading really reached, and since the targets are absolute the
         * shortfall does not accumulate.
         */
        const val TURN_TOLERANCE_DEGREES = 6.0

        /** How often the pose is checked while turning. */
        const val TURN_POLL_MS = 200L

        /** Rest after a turn, before the next measurement. */
        const val SCAN_SETTLE_MS = 300L


        /** Tag of the navigator's own log lines. */
        const val TAG = "VergilNavigator"

        /**
         * Time a leg gets regardless of its length.
         *
         * Covers starting off, the turn on the spot a differential drive makes
         * before it rolls, and braking at the end. A half turn at 45 degrees a
         * second alone is four of them.
         */
        const val LEG_BASE_SECONDS = 6.0

        /** Time per metre on top of that. Roughly 0.25 m/s, half the robot's pace. */
        const val LEG_SECONDS_PER_METER = 4.0

        /**
         * Failed attempts before the robot stops planning and starts looking.
         *
         * One failure is bad luck, a person walking past. Several in a row on a
         * map that has not changed in between are a statement about the map,
         * and every further replan repeats the same mistake at the same corner.
         *
         * Two was too eager. On the drive back on 2026-08-14 the robot went
         * into the twenty second turn at a spot it would have got past on its
         * own, and a replan that costs seconds is far cheaper than a scan that
         * costs half a minute. Three is the compromise: still early enough that
         * the robot is not driving the same corner five times, late enough that
         * a busy corridor does not stop it every time.
         */
        const val SCAN_AFTER_FAILED_ATTEMPTS = 3

        /**
         * How often one drive may measure and step.
         *
         * Each round costs some twenty seconds of turning plus the step. Three
         * of them carry the robot around seven metres past what the map claims
         * to know, which is the scale of the errors seen so far. Beyond that
         * the map is not stale, it is wrong, and driving on blindly gets
         * further from the goal rather than closer.
         */
        const val MAX_SCANS_PER_DRIVE = 3

        /**
         * Longest single step into a measured free direction.
         *
         * The measurement reaches to about 2.75 m. Stepping all of it would put
         * the robot on the last centimetre the sensor ever looked at. A metre
         * and a half leaves room and is still a real move: from there the next
         * scan sees ground the last one could not.
         */
        const val ESCAPE_STEP_METERS = 1.5

        /** Walking pace. This is a step into ground the map calls impossible. */
        const val ESCAPE_SPEED_MPS = 0.25f

        /** Close enough to the step's end. It is a direction, not a destination. */
        const val ESCAPE_TOLERANCE_METERS = 0.25

        /** Six seconds of driving at a quarter metre a second, plus the turn. */
        const val ESCAPE_TIMEOUT_MS = 15_000L

        /** How often the step is checked for having arrived. */
        const val ESCAPE_POLL_MS = 250L

        /** How generously a blockade is blocked in our own map. */
        const val BLOCKADE_RADIUS_METERS = 0.6

        /**
         * Distance ahead of the robot at which a blockade is assumed.
         *
         * Must be larger than [BLOCKADE_RADIUS_METERS], otherwise our own cell
         * falls inside the blocked circle and the next planning starts from a
         * point it considers impassable itself. The distance here is therefore
         * the radius plus a safety allowance, written out as a sum so that a
         * later change to either number cannot silently break the condition.
         */
        const val BLOCKADE_LOOKAHEAD_METERS = BLOCKADE_RADIUS_METERS + 0.3
    }
}
