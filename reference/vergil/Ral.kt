package de.labland.vergil.ral

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,

    /** CoreService refuses the API: the app was not started from the display icon. */
    DISABLED,

    /** RobotOS took over the device (onSuspend). All calls are void until onRecovery. */
    SUSPENDED,
}

/** A named point of the robot map, with world coordinates. */
data class Poi(
    val name: String,
    val x: Double,
    val y: Double,
    val theta: Double,
)

/** Position and heading of the robot. [theta] in radians. */
data class RobotPose(
    val x: Double,
    val y: Double,
    val theta: Double,
)

/**
 * Snapshot of the navigation state. `estimated` is the localisation ("does the
 * robot know where it stands?"). Without it the SDK refuses most navigation
 * and POI calls.
 */
data class NavStatus(
    val mapName: String? = null,
    val estimated: Boolean = false,
    val navigationReady: Boolean = false,
    val x: Float? = null,
    val y: Float? = null,
    val theta: Float? = null,
    val pois: List<Poi> = emptyList(),
)

/**
 * Outcome of a drive to a coordinate.
 *
 * Deliberately coarse: the path planner only needs to tell apart whether to
 * continue, replan or give up. The exact SDK code belongs in the log, not in
 * the control flow.
 */
sealed class DriveResult {
    /** Arrived at the goal. */
    data object Arrived : DriveResult()

    /** Something was in the way. Replanning makes sense. */
    data class Blocked(val reason: String) : DriveResult()

    /** Drive cancelled, by us or from outside. */
    data object Cancelled : DriveResult()

    /** Went wrong, and not because of an obstacle. */
    data class Failed(val reason: String) : DriveResult()
}

/**
 * Answer to a directional obstacle query.
 *
 * Deliberately carries the raw answer as well. The SDK documents neither the
 * result code nor the format of the message, and until the first device run
 * tells us what actually arrives, [blocked] is a guess and [result] plus
 * [message] are the evidence.
 *
 * @param startAngleDeg sector start, robot relative, 0 is straight ahead.
 * @param blocked `true` obstacle, `false` clear, `null` answer not understood.
 */
data class ObstacleCheck(
    val startAngleDeg: Double,
    val endAngleDeg: Double,
    val distanceMeters: Double,
    val blocked: Boolean?,
    val result: Int?,
    val message: String?,
)

sealed class RalEvent {
    /** Raw log of an SDK call or callback, for the diagnostics UI. */
    data class Log(val source: String, val message: String) : RalEvent()

    /** Silhouette detection: people in view, distance of the nearest one. */
    data class PersonsChanged(val count: Int, val nearestDistanceMeters: Double?) : RalEvent()

    /**
     * The robot's own obstacle avoidance has started, with the position where
     * it happened.
     *
     * Not the position of the obstacle: the SDK does not tell us that. It is
     * the spot where the robot began to swerve, and the obstacle is somewhere
     * ahead of it. Enough to see on the map where it kept getting stuck.
     */
    data class ObstacleSeen(val x: Double, val y: Double) : RalEvent()

    data object Suspended : RalEvent()
    data object Recovered : RalEvent()
}

/**
 * Robot Abstraction Layer (ADR-0003): one API for motion, head, speech and
 * person detection. Runs in-process, cut so it can become a service. The app
 * knows only this interface; device calls live in the drivers.
 *
 * M0 scope: connection, raw motion, head, TTS, person events. Navigation, maps
 * and further subsystems arrive with M1.
 */
interface Ral {
    val connectionState: StateFlow<ConnectionState>
    val events: SharedFlow<RalEvent>
    val navStatus: StateFlow<NavStatus>

    /**
     * Battery level in percent, -1 while unknown. Comes from the robot, not
     * from Android's BatteryManager, which returns a fixed value on the Nova.
     */
    val batteryPercent: StateFlow<Int>

    /**
     * Is the emergency stop pressed? `null` while the robot has not said.
     *
     * Its own state and not an event, because whoever wants to drive has to be
     * able to ask beforehand. Pressing it stops the chassis on its own; what it
     * does not do is end our order, so without this the waypoint loop simply
     * carries on once the button is released. That was the finding of the
     * device run on 2026-08-14.
     */
    val emergencyStop: StateFlow<Boolean?>

    /** Connects to the robot system. Requires a start from the display icon. */
    fun connect()

    /**
     * Raw forward drive. [avoidObstacle] switches on the obstacle avoidance of
     * the chassis; without it the robot drives straight ahead and pushes away
     * whatever is in the way.
     */
    fun moveForward(meters: Float, speedMps: Float = 0.3f, avoidObstacle: Boolean = true)
    /** Raw reverse drive. The SDK offers no obstacle avoidance here. */
    fun moveBackward(meters: Float, speedMps: Float = 0.3f)
    fun turnLeft(degrees: Float, speedDps: Float = 30f)
    fun turnRight(degrees: Float, speedDps: Float = 30f)

    /** Immediate stop. */
    fun stop()

    /** Move the head relatively (degrees; positive is left resp. up). */
    fun moveHead(yawDelta: Int, pitchDelta: Int)

    /**
     * Turns towards the person nearest to the robot and keeps facing them.
     *
     * Faces, never follows: the chassis turns on the spot and the robot stays
     * where it is. The counterpart in the SDK that drives after somebody is a
     * different call, and on a concierge standing at a counter it would be a
     * bug, not a feature.
     *
     * Which person that is stays in the driver. The app knows only that
     * somebody has walked up ([RalEvent.PersonsChanged]), and the person ids
     * the SDK hands out are a device detail that has no business above the RAL
     * (ADR-0003).
     *
     * Ends by itself once nobody is left in view. Call [stopFacing] when the
     * robot should let go earlier, and always before anything else moves it:
     * a facing turn and a drive are two orders to the same chassis.
     *
     * @param maxDistanceMeters nobody further away than this is looked for.
     */
    fun faceNearestPerson(maxDistanceMeters: Double)

    /** Ends the facing from [faceNearestPerson]. Harmless when none is running. */
    fun stopFacing()

    /**
     * Speak text through the device TTS. The Orionstar TTS synthesises in the
     * cloud; [ttsParams] overrides the device setting per utterance (keys like
     * `lan`, `type`, `vol`, `spd`, see the TTS request in logcat).
     */
    fun say(text: String, ttsParams: Map<String, String> = emptyMap())

    // --- Navigation (M0.5 test scope) -------------------------------------

    /**
     * Re-reads map, localisation, current pose and POI list.
     *
     * Meant for display, not for control: the call returns immediately and
     * writes the result into [navStatus] at some point. Whoever needs the
     * position now takes [currentPose].
     */
    fun refreshNavStatus()

    /**
     * Fetches only the current pose and waits for it.
     *
     * Deliberately next to [refreshNavStatus]: the big status query makes five
     * binder calls and writes two lines to the log. Executed twice per second
     * during a drive, that flushes every real driving event out of the
     * diagnostics log, in exactly the test the track was built for.
     *
     * @return `null` when the robot is not localised or the service does not
     *   answer.
     */
    suspend fun currentPose(): RobotPose?

    /** Drives to a named POI of the current map. */
    fun navigateTo(poiName: String)

    /** Cancels a running navigation. */
    fun cancelNavigation()

    /**
     * Saves the current position as a POI.
     *
     * Test point: in the Bauhaus project this failed reproducibly on V11.x
     * with `ERROR_NOT_ESTIMATE`, even though `isRobotEstimate()` returned true
     * at the same time and navigation worked. Whether V12.1 fixes that decides
     * whether we can manage POIs through the SDK or need our own system.
     */
    fun savePoiHere(name: String)

    /** Removes a POI of the current map. */
    fun removePoi(name: String)

    // --- Own path planning (M1) -------------------------------------------

    /**
     * Reads the robot's occupancy map as raw PGM bytes.
     *
     * Deliberately uninterpreted: the interpretation belongs in the navigation
     * module, which stays free of SDK and Android (ADR-0009). The RAL only
     * fetches the data.
     *
     * @param mapName `null` means the currently loaded map.
     * @return file content, or `null` when the robot hands out no map.
     */
    suspend fun readMapPgm(mapName: String? = null): ByteArray?

    /**
     * Drives to a coordinate of the current map and waits until it is over.
     *
     * This is the building block for our own path planning: it splits a route
     * into waypoints and drives them one by one, instead of naming a distant
     * goal and leaving the route choice to the robot's planner.
     *
     * @param theta desired heading at the goal, in radians.
     * @param toleranceMeters how close counts as arrived.
     * @param timeoutMs give up when the robot is not there by then.
     * @param handoverRadiusMeters report [DriveResult.Arrived] this far ahead
     *   of the goal and leave the navigation running, so that the caller can
     *   hand over the next waypoint while the robot is still moving. `0.0`
     *   waits for the real arrival, which every navigation ends with a full
     *   stop. Only ever pass a value for intermediate waypoints: at the last
     *   one the robot would halt a radius short of the goal.
     */
    suspend fun driveTo(
        x: Double,
        y: Double,
        theta: Double,
        toleranceMeters: Double = 0.3,
        timeoutMs: Long = 60_000L,
        handoverRadiusMeters: Double = 0.0,
    ): DriveResult

    /**
     * Asks whether something is in the way inside an angular sector.
     *
     * The counterpart to the map: the map says what was there when it was
     * recorded, this says what is there now. Our own grid can only ever add
     * blocked area, never take any away, so over a drive its picture only gets
     * worse. This is the only door through which a cell can become free again.
     *
     * Angles are robot relative in degrees, 0 straight ahead, counted the same
     * way as [turnLeft], so positive is to the left. That, like the meaning of
     * the answer, is an assumption from the SDK signature and not documented.
     * Which is why [ObstacleCheck] hands the raw answer out as well.
     */
    suspend fun checkObstacle(
        startAngleDeg: Double,
        endAngleDeg: Double,
        distanceMeters: Double,
    ): ObstacleCheck
}
