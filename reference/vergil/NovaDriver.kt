package de.labland.vergil.ral

import android.content.Context
import com.ainirobot.coreservice.client.ApiListener
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.StatusListener
import com.ainirobot.coreservice.client.actionbean.FaceTrackBean
import com.ainirobot.coreservice.client.actionbean.Pose
import com.ainirobot.coreservice.client.ashmem.ShareMemoryApi
import com.ainirobot.coreservice.client.listener.ActionListener
import com.ainirobot.coreservice.client.listener.CommandListener
import com.ainirobot.coreservice.client.listener.TextListener
import com.ainirobot.coreservice.client.module.ModuleCallbackApi
import com.ainirobot.coreservice.client.person.PersonApi
import com.ainirobot.coreservice.client.person.PersonListener
import com.ainirobot.coreservice.client.speech.SkillApi
import com.ainirobot.coreservice.client.speech.entity.TTSEntity
import java.io.FileInputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.coroutines.resume

/**
 * RAL driver for Orionstar robots running RobotOS classic (robotservice.jar).
 * First target robot: GreetingBot Nova.
 *
 * Signatures verified against robotservice.jar from RobotSample 11.6
 * (goForward/goBackward: reqId, speed m/s, distance m; turnLeft/turnRight:
 * reqId, speed deg/s, angle deg; moveHead: reqId, hMode, vMode, hAngle,
 * vAngle).
 */
/** Range of the silhouette query, in meters. */
private const val PERSON_RANGE_METERS = 5.0

/**
 * Milliseconds the focus keeps looking for a person it has lost sight of.
 *
 * A technical bound, so it stays in the code (`AGENTS.md`, "Was über die Deployables hinweg zusammengehört"). Somebody who turns
 * away for a moment should not cost the robot its attention; somebody who has
 * left should not keep it staring after them. Everything the operation is
 * allowed to decide sits in `settings.turnToGuest` and in the greeting
 * distance next to it.
 */
private const val FOCUS_LOST_MILLIS = 3_000L

/**
 * Navigation codes from `Definition`, spelled out. The SDK's own texts are
 * misleading: 1018/1019 are called "local path search failed/succeed" there,
 * but simply mean the start and the end of an avoidance manoeuvre.
 */
/** Definition.STATUS_NAVI_AVOID: the chassis is swerving around something. */
private const val STATUS_NAVI_AVOID = 1018

/** Definition.STATUS_NAVI_AVOID_END: it got past, the path is clear again. */
private const val STATUS_NAVI_AVOID_END = 1019

private val NAVI_CODES = mapOf(
    STATUS_NAVI_AVOID to "avoiding an obstacle",
    1019 to "avoidance done, path clear again", // STATUS_NAVI_AVOID_END
    1020 to "goal considered outside the map or too dangerous", // STATUS_NAVI_OUT_MAP
    1025 to "no path to the goal found", // STATUS_NAVI_GLOBAL_PATH_FAILED
    -113 to "already at the goal", // ERROR_IN_DESTINATION
    -109 to "SDK time limit for this leg elapsed", // see ERROR_NAVIGATION_TIMEOUT
)

/** Definition.ACTION_RESPONSE_ALREADY_RUN: an action is already running. */
private const val ACTION_RESPONSE_ALREADY_RUN = -1

/** Definition.RESULT_OK: the action finished regularly. */
private const val RESULT_OK = 1

/** Definition.ACTION_RESPONSE_STOP_SUCCESS: the action was cancelled. */
private const val ACTION_RESPONSE_STOP_SUCCESS = 3

/**
 * Status codes after which replanning makes sense: the robot cannot get past
 * this spot, but another path might work.
 *
 * 1020 deliberately does not belong here. The code is called "goal outside the
 * map" and sounds final, but on the Nova it arrives in the middle of drives
 * that then finish cleanly (test day 2026-08-12, `docs/orionstar/geraetewissen.md`).
 * Treated as a blockade it would choke a working drive and on top of that
 * stamp an invented obstacle into our map. If the robot really cannot get
 * through, the timeout catches it: later, but correctly.
 */
private val BLOCKED_STATUS = setOf(
    1025, // STATUS_NAVI_GLOBAL_PATH_FAILED
)

/** Definition.ERROR_IN_DESTINATION: the robot is already at the goal. */
private const val ERROR_IN_DESTINATION = -113

/**
 * The navigation ran into the SDK's own time limit.
 *
 * Read off the device, not from a header: on the LuckiBot the SDK reports
 * errorCode -109 with the text "Timeout" once the timeout handed to
 * `startNavigation` has elapsed.
 *
 * It has to count as a blockade, exactly like our own time limit. Both mean
 * the same thing, "the robot did not get there", and which of the two fires
 * first is a matter of a few seconds: we grant the SDK's limit plus
 * [TIMEOUT_GRACE_MS]. On 2026-08-13 that decided whether the same situation
 * led to a replan or killed the whole drive.
 */
private const val ERROR_NAVIGATION_TIMEOUT = -109

/**
 * Wait between cancelling and restarting a navigation, per repeated attempt.
 * `stopNavigation` acts asynchronously; without a pause the new order still
 * reaches the old action and is rejected with -1, which happened on the
 * CarryBot on every second tap.
 *
 * The single fixed value of 400 ms that used to stand here was ten times too
 * generous, and unlike expected it sits on the hot path: the log of the
 * LuckiBot from 2026-08-13 shows that the SDK refuses a new goal during a
 * running navigation without a single exception, so every handover pays this
 * wait. In the same log the stopped navigation confirms with status 3 after 20
 * to 40 ms.
 *
 * Escalating instead of one number, because those milliseconds were measured
 * on one robot and the CarryBot once needed considerably longer. The short
 * value carries the normal case, the long one stays as a safety net.
 */
private val NAVI_RESTART_DELAYS_MS = longArrayOf(150L, 400L)

/**
 * How often a leg is started before we call the navigation stuck.
 *
 * The first attempt goes out without clearing, the later ones stop first. One
 * refusal is therefore normal and no reason to kill the whole drive, which is
 * what it used to be.
 */
private const val START_ATTEMPTS = 3

/**
 * Poll interval of the leg watcher.
 *
 * At the robot's roughly 0.5 m/s that is about 12 cm of travel, fine enough
 * for a handover radius in the decimetre range. Not shorter on purpose: the
 * track recording already queries the pose twice a second, and both run at the
 * same time during a drive. Every query is a binder call into a service that
 * has proven fragile enough on these robots not to be asked four times as
 * often for a precision nobody needs.
 */
private const val LEG_POLL_MS = 250L

/**
 * Movement below this counts as standing still.
 *
 * Measured against the last position that counted as moved, not against the
 * previous poll, so creeping forward at a centimetre a second does not keep
 * resetting the clock. Ten centimetres is above the noise of the pose query
 * and well below anything that deserves to be called progress.
 */
private const val STALL_MOVE_METERS = 0.10

/**
 * Standing still this long ends the leg.
 *
 * The one measurement that made this necessary: on 2026-08-13 a drive of seven
 * minutes spent over four of them waiting on legs that were already decided.
 * Every blocked leg ran the full time limit, thirty seconds, five times over.
 *
 * Eight seconds because the robot legitimately stands still at the start of a
 * leg: a differential drive turns on the spot first, and a half turn at 45
 * degrees a second takes four. Below that the detector would fire on a robot
 * that is doing exactly what it was told.
 */
private const val STALL_PATIENCE_MS = 8_000L

/**
 * Swerving this long without an end ends the leg.
 *
 * The stall watch does not catch this one: while avoiding, the robot moves,
 * it just does not get anywhere. Fifteen avoidance manoeuvres on 2026-08-13
 * sort cleanly into two groups. Ten ended by themselves, nine of them within
 * ten seconds and the longest after 18.8. Two never ended at all and ran into
 * the SDK's own limit at 28 and 29 seconds.
 *
 * Twelve seconds keeps nine of the ten and halves the cost of the hopeless
 * ones. The tenth costs a replan we would not have needed, which is cheap now
 * that a replan is cheap.
 */
private const val AVOID_PATIENCE_MS = 12_000L

/**
 * Both patiences grow to this share of the leg's own time limit.
 *
 * A waypoint on a route is granted ten seconds and needs no more than eight of
 * standing around to be settled. The retreat is granted two minutes for the
 * whole way back, and cutting that short after eight seconds because someone
 * stepped in front of the robot would throw away the last resort over nothing.
 */
private const val PATIENCE_SHARE_OF_LIMIT = 8L

/**
 * Share of a leg the robot has to have covered before the handover may fire.
 *
 * Guards against a handover radius that is larger than the leg itself. Without
 * it a generous slider setting turns every short leg into a no-op, and short
 * legs are exactly what a route around an obstacle consists of.
 */
private const val HANDOVER_LEG_FRACTION = 0.5

/** Grace on top of the SDK timeout before we give up ourselves. */
private const val TIMEOUT_GRACE_MS = 5_000L

/**
 * Patience per obstacle query. Short on purpose: a full sweep is two dozen of
 * these in a row, and a single sector that stays silent must not hold up the
 * whole picture.
 */
private const val OBSTACLE_CHECK_TIMEOUT_MS = 3_000L

class NovaDriver(private val context: Context) : Ral {

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    override val connectionState = _connectionState.asStateFlow()

    private val _events = MutableSharedFlow<RalEvent>(extraBufferCapacity = 128)
    override val events = _events.asSharedFlow()

    private val _navStatus = MutableStateFlow(NavStatus())
    override val navStatus = _navStatus.asStateFlow()

    private val _batteryPercent = MutableStateFlow(-1)
    override val batteryPercent = _batteryPercent.asStateFlow()

    private val _emergencyStop = MutableStateFlow<Boolean?>(null)
    override val emergencyStop = _emergencyStop.asStateFlow()

    /**
     * Held in a field on purpose: the listener is a binder stub, and the
     * CoreService keeps only a weak reference to it. A local object would work
     * for a while and then quietly stop reporting.
     */
    private var emergencyListener: StatusListener? = null

    /** The synchronous SDK getters are binder calls, never on the UI thread. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val reqId = AtomicInteger(1)

    /** Whether a focus follow is running, so it is neither started nor stopped twice. */
    private val facing = AtomicBoolean(false)

    private val skillApi = SkillApi()

    /**
     * SkillApi binds to the CoreService asynchronously. Before that its
     * methods throw NPEs (the internal binder is null), and on robots without
     * a classic speech service it stays unconnected for good.
     */
    @Volatile
    private var skillConnected = false

    private val pollingStarted = java.util.concurrent.atomic.AtomicBoolean(false)

    /** Already reported that the pose query fails? See `currentPose`. */
    @Volatile
    private var poseFailureReported = false

    private fun log(source: String, message: String) {
        // Twice: into the app UI and to logcat (`adb logcat -s VergilRal`), so
        // that errors can be read without looking at the robot display.
        android.util.Log.i("VergilRal", "[$source] $message")
        _events.tryEmit(RalEvent.Log(source, message))
    }

    override fun connect() = guard("core") {
        // `connectServer` does not report `handleApiConnected` a second time
        // when the service is already connected. A second call therefore
        // leaves us in CONNECTING forever: yellow status line, battery -1, no
        // persons, TTS refused, even though driving still works because
        // RobotApi is a singleton. Exactly that happened on the CarryBot when
        // the activity was recreated while switching with the RobotOS UI. So:
        // detect an existing connection and only re-register.
        if (RobotApi.getInstance().isApiConnectedService) {
            log("core", "CoreService was already connected, renewing registrations")
            onCoreConnected()
            return@guard
        }

        _connectionState.value = ConnectionState.CONNECTING
        log("core", "connectServer …")

        RobotApi.getInstance().connectServer(context, object : ApiListener {
            override fun handleApiConnected() {
                log("core", "CoreService connected")
                onCoreConnected()
            }

            override fun handleApiDisabled() {
                log("core", "API DISABLED, start the app from the display icon!")
                _connectionState.value = ConnectionState.DISABLED
            }

            override fun handleApiDisconnected() {
                log("core", "CoreService disconnected")
                _connectionState.value = ConnectionState.DISCONNECTED
            }
        })
    }

    /** Everything to be done once a CoreService connection exists. */
    private fun onCoreConnected() {
        _connectionState.value = ConnectionState.CONNECTED
        registerModuleCallback()
        registerEmergencyListener()
        connectSkillApi()
        registerPersonListener()
        startPolling()
    }

    /**
     * Watches the emergency stop.
     *
     * The SDK documents neither the payload of `STATUS_EMERGENCY` nor the
     * answer of `getEmergencyStatus`, so every raw text goes into the log and
     * [parseEmergencyStop] only accepts what it recognises. An answer we cannot
     * read leaves the state at `null`, which reads as "do not know" everywhere
     * and never as "released".
     *
     * The query at the start belongs with it: an app that starts while the
     * button is already pressed would otherwise learn about it only at the
     * moment somebody releases it.
     */
    private fun registerEmergencyListener() {
        val listener = object : StatusListener() {
            override fun onStatusUpdate(type: String?, data: String?) {
                log("estop", "$type: $data")
                parseEmergencyStop(data)?.let { pressed ->
                    if (_emergencyStop.value != pressed) {
                        log("estop", if (pressed) "EMERGENCY STOP pressed" else "emergency stop released")
                    }
                    _emergencyStop.value = pressed
                }
            }
        }
        emergencyListener = listener
        guard("estop") {
            RobotApi.getInstance().registerStatusListener(Definition.STATUS_EMERGENCY, listener)
            log("estop", "listener on ${Definition.STATUS_EMERGENCY} registered")
        }
        guard("estop") {
            RobotApi.getInstance().getEmergencyStatus(
                reqId.getAndIncrement(),
                object : CommandListener() {
                    override fun onResult(result: Int, message: String?) {
                        log("estop", "getEmergencyStatus result=$result $message")
                        parseEmergencyStop(message)?.let { _emergencyStop.value = it }
                    }
                },
            )
        }
    }

    private fun registerModuleCallback() {
        RobotApi.getInstance().setCallback(object : ModuleCallbackApi() {
            override fun onSendRequest(reqId: Int, reqType: String?, reqText: String?, reqParam: String?): Boolean {
                log("speech", "onSendRequest type=$reqType text=$reqText")
                return true
            }

            override fun onHWReport(function: Int, type: String?, message: String?) {
                log("hw", "onHWReport fn=$function type=$type msg=$message")
            }

            override fun onSuspend() {
                log("core", "SUSPENDED, RobotOS has taken over")
                _connectionState.value = ConnectionState.SUSPENDED
                _events.tryEmit(RalEvent.Suspended)
            }

            override fun onRecovery() {
                log("core", "RECOVERY, control is back")
                _connectionState.value = ConnectionState.CONNECTED
                _events.tryEmit(RalEvent.Recovered)
            }
        })
    }

    private fun connectSkillApi() {
        skillApi.addApiEventListener(object : ApiListener {
            override fun handleApiConnected() {
                skillConnected = true
                log("tts", "SkillApi connected")
            }

            override fun handleApiDisabled() {
                skillConnected = false
                log("tts", "SkillApi disabled")
            }

            override fun handleApiDisconnected() {
                skillConnected = false
                log("tts", "SkillApi disconnected")
            }
        })
        skillApi.connectApi(context)
    }

    private fun registerPersonListener() {
        PersonApi.getInstance().registerPersonListener(object : PersonListener() {
            override fun personChanged() = pollPersons()
        })
        log("person", "PersonListener registered")
    }

    /**
     * The `personChanged` callback alone is not enough, it fires unreliably.
     * Bauhaus therefore polls actively, and specifically `getAllBodyList(range)`:
     * `getAllPersons()` needs face recognition and finds nobody who turns their
     * back to the robot, while the silhouette list works independently of the
     * viewing direction. The range is a mandatory argument, without it an empty
     * list comes back.
     */
    private fun pollPersons() = guard("person") {
        val bodies = PersonApi.getInstance().getAllBodyList(PERSON_RANGE_METERS)
        _events.tryEmit(
            RalEvent.PersonsChanged(
                count = bodies?.size ?: 0,
                nearestDistanceMeters = bodies?.minOfOrNull { it.distance.toDouble() },
            )
        )
    }

    /** Poll battery and persons cyclically while the connection is up. */
    private fun startPolling() {
        // Only one loop per driver, otherwise several run in parallel after
        // every repeated connect() and query the robot multiple times per
        // second.
        if (!pollingStarted.compareAndSet(false, true)) return
        scope.launch {
            while (isActive) {
                guard("battery") {
                    val level = RobotApi.getInstance().batteryLevel
                    if (level != _batteryPercent.value) _batteryPercent.value = level
                }
                pollPersons()
                delay(1_000)
            }
        }
    }

    /**
     * Protective shell around every SDK call: with a disconnected service the
     * jar throws raw NPEs instead of error codes. Uncaught in a click handler
     * that takes the whole app down, which on the device costs a complete test
     * round. Errors belong in the log, not in a crash.
     */
    private inline fun guard(source: String, block: () -> Unit) {
        try {
            block()
        } catch (e: Throwable) {
            log(source, "ERROR ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun commandListener(op: String) = object : CommandListener() {
        override fun onResult(result: Int, message: String?) = log(op, "result=$result $message")
        override fun onError(errorCode: Int, errorString: String?) = log(op, "ERROR $errorCode $errorString")
        override fun onStatusUpdate(status: Int, data: String?) = log(op, "status=$status $data")
    }

    private fun actionListener(op: String) = object : ActionListener() {
        override fun onResult(status: Int, response: String?) = log(op, "result=$status $response")
        override fun onError(errorCode: Int, errorString: String?) = log(op, "ERROR $errorCode $errorString")
        override fun onStatusUpdate(status: Int, data: String?) = log(op, "status=$status $data")
    }

    /**
     * Our own listener for POI navigation. It spells the codes out but does
     * not intervene: 1020 and 1025 arrive as a status, not as an error, and on
     * the Nova navigation kept running despite repeated 1020. An automatic
     * abort would choke working drives there.
     */
    private fun navigationListener(poiName: String) = object : ActionListener() {
        override fun onResult(status: Int, response: String?) =
            log("navi", "\"$poiName\": result=$status $response")

        override fun onError(errorCode: Int, errorString: String?) {
            val plainText = when (errorCode) {
                ACTION_RESPONSE_ALREADY_RUN -> "another action is still running"
                else -> NAVI_CODES[errorCode] ?: errorString
            }
            log("navi", "\"$poiName\" rejected ($errorCode): $plainText")
        }

        override fun onStatusUpdate(status: Int, data: String?) {
            val plainText = NAVI_CODES[status]
            if (plainText != null) {
                log("navi", "\"$poiName\" ($status): $plainText")
            } else {
                log("navi", "\"$poiName\" status=$status $data")
            }
        }
    }

    override fun moveForward(meters: Float, speedMps: Float, avoidObstacle: Boolean) = guard("motion") {
        val id = reqId.getAndIncrement()
        log("motion", "goForward($meters m, $speedMps m/s, avoidObstacle=$avoidObstacle) req=$id")
        RobotApi.getInstance().goForward(id, speedMps, meters, avoidObstacle, commandListener("goForward"))
    }

    override fun moveBackward(meters: Float, speedMps: Float) = guard("motion") {
        val id = reqId.getAndIncrement()
        log("motion", "goBackward($meters m, $speedMps m/s) req=$id")
        RobotApi.getInstance().goBackward(id, speedMps, meters, commandListener("goBackward"))
    }

    override fun turnLeft(degrees: Float, speedDps: Float) = guard("motion") {
        val id = reqId.getAndIncrement()
        log("motion", "turnLeft($degrees°, $speedDps°/s) req=$id")
        RobotApi.getInstance().turnLeft(id, speedDps, degrees, commandListener("turnLeft"))
    }

    override fun turnRight(degrees: Float, speedDps: Float) = guard("motion") {
        val id = reqId.getAndIncrement()
        log("motion", "turnRight($degrees°, $speedDps°/s) req=$id")
        RobotApi.getInstance().turnRight(id, speedDps, degrees, commandListener("turnRight"))
    }

    override fun stop() = guard("motion") {
        val id = reqId.getAndIncrement()
        log("motion", "stopMove req=$id")
        RobotApi.getInstance().stopMove(id, commandListener("stopMove"))
    }

    override fun moveHead(yawDelta: Int, pitchDelta: Int) = guard("head") {
        val id = reqId.getAndIncrement()
        // The SDK counts the vertical axis the other way round than our
        // interface: positive lowers the head. Verified on the device, flipped
        // here so that "positive is up" holds for all callers.
        val sdkPitch = -pitchDelta
        log("head", "moveHead(relative, yaw=$yawDelta, pitch=$pitchDelta → SDK $sdkPitch) req=$id")
        RobotApi.getInstance().moveHead(id, "relative", "relative", yawDelta, sdkPitch, commandListener("moveHead"))
    }

    /**
     * Faces the nearest person through the SDK's own tracking.
     *
     * `allowMoveBody = true` is what makes this a turn of the whole robot
     * rather than of the head alone; it does not let it drive. The call that
     * would drive is `startBodyFollowAction`, and it is deliberately not used
     * here.
     *
     * `startFaceTrack` and not `startFocusFollow`, although the older name
     * describes the job better: the whole focus follow family is deprecated in
     * the jar, and `FaceTrackBean` carries the identical four fields
     * (`personId`, `lostTimer`, `maxDistance`, `allowMoveBody`). It is the same
     * call with a newer name.
     *
     * Device test point: the id comes out of `getAllBodyList()`, which reads
     * silhouettes and needs no face. Whether a call named face track accepts
     * that numbering is documented nowhere. Two fallbacks if it does not, in
     * this order: the deprecated `startFocusFollow` takes the same arguments,
     * and failing that every person in the list carries an `angle`, which
     * makes the turn [turnLeft] and [turnRight].
     */
    override fun faceNearestPerson(maxDistanceMeters: Double) = guard("focus") {
        if (facing.get()) {
            log("focus", "already facing somebody, left alone")
            return@guard
        }
        val nearest = PersonApi.getInstance()
            .getAllBodyList(maxDistanceMeters)
            ?.minByOrNull { it.distance }
        if (nearest == null) {
            log("focus", "nobody within $maxDistanceMeters m")
            return@guard
        }
        val id = reqId.getAndIncrement()
        facing.set(true)
        log(
            "focus",
            "startFaceTrack(person=${nearest.id}, ${nearest.distance} m, " +
                "${nearest.angle}°, max=$maxDistanceMeters m) req=$id",
        )
        val bean = FaceTrackBean().apply {
            reqId = id
            personId = nearest.id
            lostTimer = FOCUS_LOST_MILLIS
            maxDistance = maxDistanceMeters.toFloat()
            isAllowMoveBody = true
        }
        RobotApi.getInstance().startFaceTrack(id, bean, focusListener())
    }

    override fun stopFacing() = guard("focus") {
        if (!facing.getAndSet(false)) return@guard
        val id = reqId.getAndIncrement()
        log("focus", "stopFaceTrack req=$id")
        RobotApi.getInstance().stopFaceTrack(id)
    }

    /**
     * Clears the flag on the way out, whichever way the action ends.
     *
     * Without it a focus that ran into its own lost timer would leave the
     * driver believing it is still facing somebody, and the next guest would
     * be ignored until the app restarted.
     */
    private fun focusListener() = object : ActionListener() {
        override fun onResult(status: Int, response: String?) {
            facing.set(false)
            log("focus", "result=$status $response")
        }

        override fun onError(errorCode: Int, errorString: String?) {
            facing.set(false)
            log("focus", "ERROR $errorCode $errorString")
        }

        override fun onStatusUpdate(status: Int, data: String?) = log("focus", "status=$status $data")
    }

    override fun refreshNavStatus() {
        scope.launch {
            guard("navi") {
                val api = RobotApi.getInstance()
                val pose = api.currentPose
                val places = api.placeList
                val status = NavStatus(
                    mapName = api.getMapName(),
                    estimated = api.isRobotEstimate(),
                    navigationReady = api.isNavigationReady,
                    x = pose?.x,
                    y = pose?.y,
                    theta = pose?.theta,
                    pois = places.orEmpty().mapNotNull { pose ->
                        pose.name?.let { Poi(it, pose.x.toDouble(), pose.y.toDouble(), pose.theta.toDouble()) }
                    },
                )
                _navStatus.value = status
                log(
                    "navi",
                    "map=${status.mapName} localised=${status.estimated} " +
                        "naviReady=${status.navigationReady} POIs=${status.pois.size}",
                )
                if (status.pois.isNotEmpty()) {
                    log("navi", "POIs: ${status.pois.joinToString(", ") { it.name }}")
                }
            }
        }
    }

    override fun navigateTo(poiName: String) {
        scope.launch {
            guard("navi") {
                // While a navigation is still running the SDK rejects every
                // new order with -1. So clear first, wait briefly, then start.
                RobotApi.getInstance().stopNavigation(reqId.getAndIncrement())
            }
            // The generous value: this is a single POI drive started by hand,
            // there is nothing here that has to be seamless, and unlike the
            // waypoint loop nobody retries on a refusal.
            delay(NAVI_RESTART_DELAYS_MS.last())
            guard("navi") {
                val id = reqId.getAndIncrement()
                log("navi", "startNavigation(\"$poiName\", tolerance 0.5 m, timeout 60 s) req=$id")
                RobotApi.getInstance()
                    .startNavigation(id, poiName, 0.5, 60_000L, navigationListener(poiName))
            }
        }
    }

    override fun cancelNavigation() = guard("navi") {
        val id = reqId.getAndIncrement()
        log("navi", "stopNavigation req=$id")
        RobotApi.getInstance().stopNavigation(id)
    }

    override fun savePoiHere(name: String) = guard("navi") {
        val id = reqId.getAndIncrement()
        // The localisation is logged along with it: that is exactly where the
        // contradiction sat in the Bauhaus case, ERROR_NOT_ESTIMATE despite
        // estimate=true.
        val estimated = RobotApi.getInstance().isRobotEstimate()
        log("navi", "setLocation(\"$name\") req=$id, isRobotEstimate()=$estimated")
        RobotApi.getInstance().setLocation(id, name, commandListener("setLocation"))
    }

    override fun removePoi(name: String) = guard("navi") {
        val id = reqId.getAndIncrement()
        log("navi", "removeLocation(\"$name\") req=$id")
        // Careful: on both robots the SDK answers with result=1 (RESULT_OK)
        // and the text "HWService not registered", and deletes nothing. The
        // failure cannot be seen from the return value, so we check the list
        // ourselves afterwards.
        RobotApi.getInstance().removeLocation(
            id,
            name,
            object : CommandListener() {
                override fun onResult(result: Int, message: String?) {
                    log("removeLocation", "result=$result $message")
                    scope.launch {
                        delay(500)
                        guard("navi") {
                            val stillThere = RobotApi.getInstance().placeList
                                ?.any { it.name == name } == true
                            log(
                                "navi",
                                if (stillThere) "\"$name\" was NOT deleted, it is still in the list"
                                else "\"$name\" has disappeared from the list",
                            )
                        }
                    }
                }

                override fun onError(errorCode: Int, errorString: String?) =
                    log("removeLocation", "ERROR $errorCode $errorString")

                override fun onStatusUpdate(status: Int, data: String?) =
                    log("removeLocation", "status=$status $data")
            },
        )
    }

    override suspend fun currentPose(): RobotPose? = withContext(Dispatchers.IO) {
        // A single binder call, no log. Runs twice per second during a drive,
        // see the reasoning on the interface.
        runCatching {
            RobotApi.getInstance().currentPose?.let {
                poseFailureReported = false
                // Write the pose into the status as well: the map view draws
                // the robot marker from it. Without this line the marker would
                // stand at the start point for the whole drive, because nobody
                // else tracks the position; the big status query only runs on a
                // button press. Costs nothing, the data is already here.
                _navStatus.value = _navStatus.value.copy(x = it.x, y = it.y, theta = it.theta)
                RobotPose(it.x.toDouble(), it.y.toDouble(), it.theta.toDouble())
            }
        }.getOrElse { e ->
            // Report only on the transition. With a disconnected service the
            // call fails twice per second and would flood the very log it is
            // meant to spare, of all moments during the fault.
            if (!poseFailureReported) {
                poseFailureReported = true
                log("navi", "ERROR currentPose ${e.javaClass.simpleName}: ${e.message}")
            }
            null
        }
    }

    override suspend fun readMapPgm(mapName: String?): ByteArray? = withContext(Dispatchers.IO) {
        // The whole body sits inside the try: `mapName` and
        // `ShareMemoryApi.getInstance()` are already SDK calls that throw raw
        // NPEs with a disconnected service. Left outside the try they would
        // have taken the caller with them, and that one only catches
        // ParseException.
        var api: ShareMemoryApi? = null
        try {
            val name = mapName ?: RobotApi.getInstance().mapName
            if (name.isNullOrBlank()) {
                log("map", "ERROR no map loaded")
                return@withContext null
            }
            api = ShareMemoryApi.getInstance()
            val pfd = api.getMapPgmPFD(name)
            if (pfd == null) {
                log("map", "ERROR robot hands out no map file for \"$name\"")
                return@withContext null
            }
            val bytes = FileInputStream(pfd.fileDescriptor).use { it.readBytes() }
            log("map", "\"$name\" read, ${bytes.size / 1024} KB")
            bytes
        } catch (e: Throwable) {
            log("map", "ERROR ${e.javaClass.simpleName}: ${e.message}")
            null
        } finally {
            // Has to happen always, otherwise the shared memory stays occupied
            // and the next call gets nothing at all.
            runCatching { api?.releaseGetMapPgmPFD() }
        }
    }

    override suspend fun driveTo(
        x: Double,
        y: Double,
        theta: Double,
        toleranceMeters: Double,
        timeoutMs: Long,
        handoverRadiusMeters: Double,
    ): DriveResult {
        // Deliberately no `stopNavigation` up front any more. Clearing before
        // every leg is precisely what brakes the robot between two waypoints,
        // and after a handover the previous navigation is supposed to keep
        // running. So the new order goes out first, and we only clear when the
        // SDK really refuses it. Which of the two cases occurs can be read
        // from the log, and it decides how smooth a handover can get at all.
        repeat(START_ATTEMPTS) { attempt ->
            if (attempt > 0) {
                guard("navi") { RobotApi.getInstance().stopNavigation(reqId.getAndIncrement()) }
                delay(NAVI_RESTART_DELAYS_MS[(attempt - 1).coerceAtMost(NAVI_RESTART_DELAYS_MS.lastIndex)])
            }
            val result = startAndAwait(x, y, theta, toleranceMeters, timeoutMs, handoverRadiusMeters)
            if (result != null) return result
            log("navi", "navigation still busy, attempt ${attempt + 1} of $START_ATTEMPTS")
        }
        return DriveResult.Failed("navigation stayed busy")
    }

    /**
     * One start attempt for a leg.
     *
     * `null` means only that the SDK refused because an action is still
     * running. That is a retry, not a result, and deliberately not part of
     * [DriveResult]: the path planner has no business with it.
     */
    private suspend fun startAndAwait(
        x: Double,
        y: Double,
        theta: Double,
        toleranceMeters: Double,
        timeoutMs: Long,
        handoverRadiusMeters: Double,
    ): DriveResult? {
        val id = reqId.getAndIncrement()
        log("navi", "driving to (${fmt(x)}, ${fmt(y)}) req=$id")

        return try {
            withTimeout(timeoutMs + TIMEOUT_GRACE_MS) {
                suspendCancellableCoroutine { continuation ->
                    // The SDK calls the listener several times; only the first
                    // answer counts, every further one would blow up the
                    // coroutine.
                    val done = java.util.concurrent.atomic.AtomicBoolean(false)
                    var watcher: kotlinx.coroutines.Job? = null

                    // When the current avoidance manoeuvre began, 0 while none
                    // is running. Written from the SDK callback and read from
                    // the watcher, which is why it is atomic: the callback must
                    // not suspend, so the patience cannot be waited out there.
                    val avoidingSince = java.util.concurrent.atomic.AtomicLong(0L)

                    fun finish(result: DriveResult?) {
                        if (done.compareAndSet(false, true)) {
                            watcher?.cancel()
                            continuation.resume(result) {}
                        }
                    }

                    continuation.invokeOnCancellation {
                        watcher?.cancel()
                        guard("navi") { RobotApi.getInstance().stopNavigation(reqId.getAndIncrement()) }
                    }

                    val listener = object : ActionListener() {
                        override fun onResult(status: Int, response: String?) {
                            log("navi", "drive finished: status=$status $response")
                            finish(
                                when (status) {
                                    RESULT_OK -> DriveResult.Arrived
                                    ACTION_RESPONSE_STOP_SUCCESS -> DriveResult.Cancelled
                                    else -> DriveResult.Failed("status=$status $response")
                                },
                            )
                        }

                        override fun onError(errorCode: Int, errorString: String?) {
                            val plainText = when (errorCode) {
                                ACTION_RESPONSE_ALREADY_RUN -> "another action is still running"
                                else -> NAVI_CODES[errorCode] ?: errorString
                            }
                            log("navi", "drive rejected ($errorCode): $plainText")
                            finish(
                                when (errorCode) {
                                    // Not an outcome but a "try again": the
                                    // previous navigation is still winding
                                    // down. The caller clears and repeats.
                                    ACTION_RESPONSE_ALREADY_RUN -> null

                                    // "Already at the goal" is the rejection of
                                    // an order that is already fulfilled, which
                                    // for the path planner is a success.
                                    // Counted as a failure the whole drive dies
                                    // on a leg the robot has long since
                                    // finished, and that happens after every
                                    // replan close to the next waypoint.
                                    ERROR_IN_DESTINATION -> DriveResult.Arrived

                                    // Same answer as for our own time limit
                                    // further down, and it has to be: whoever
                                    // treats this as a failure ends the drive
                                    // at the first obstacle the robot cannot
                                    // get past on its own, instead of blocking
                                    // the spot and planning around it.
                                    ERROR_NAVIGATION_TIMEOUT -> DriveResult.Blocked("SDK timeout")

                                    else -> DriveResult.Failed("$errorCode $plainText")
                                },
                            )
                        }

                        override fun onStatusUpdate(status: Int, data: String?) {
                            val plainText = NAVI_CODES[status]
                            if (plainText != null) log("navi", "($status) $plainText")
                            if (status == STATUS_NAVI_AVOID) {
                                // Only the first one of a series starts the
                                // clock. The chassis repeats the status while
                                // it keeps swerving, and restarting the clock
                                // each time would mean it never runs out.
                                avoidingSince.compareAndSet(0L, System.currentTimeMillis())
                                // Fetch the position and report it, so the map
                                // can show where the robot kept swerving. The
                                // pose query suspends, the callback must not,
                                // hence the detour through the scope.
                                scope.launch {
                                    currentPose()?.let { _events.tryEmit(RalEvent.ObstacleSeen(it.x, it.y)) }
                                }
                            }
                            if (status == STATUS_NAVI_AVOID_END) avoidingSince.set(0L)
                            if (status in BLOCKED_STATUS) {
                                // The status only ends our waiting; the
                                // navigation inside the SDK keeps running.
                                // Without this halt the robot drives on during
                                // our replanning and the new route starts at a
                                // position it has already left.
                                guard("navi") {
                                    RobotApi.getInstance().stopNavigation(reqId.getAndIncrement())
                                }
                                finish(DriveResult.Blocked(plainText ?: "status $status"))
                            }
                        }
                    }

                    // No guard: it would swallow the NPE of a disconnected
                    // service, and then nobody here waits for an answer that
                    // never comes, until the timeout fires and a hard failure
                    // passes as "blocked".
                    runCatching {
                        RobotApi.getInstance().startNavigation(
                            id,
                            Pose(x.toFloat(), y.toFloat(), theta.toFloat()),
                            toleranceMeters,
                            timeoutMs,
                            listener,
                        )
                    }.onFailure { e ->
                        log("navi", "ERROR startNavigation ${e.javaClass.simpleName}: ${e.message}")
                        finish(DriveResult.Failed("startNavigation: ${e.javaClass.simpleName}"))
                    }.onSuccess {
                        // Only after the start, never before: a watcher that
                        // fires first would report the leg as done while the
                        // order is still going out, and leave behind a
                        // navigation nobody waits for.
                        //
                        // Started for every leg, including the last one, which
                        // has no handover. It watches for two more things now,
                        // and being stuck at the goal is no better than being
                        // stuck on the way to it.
                        if (!done.get()) {
                            watcher = startLegWatcher(
                                x, y, handoverRadiusMeters, timeoutMs, avoidingSince, ::finish,
                            )
                            // The listener may have answered in between; then
                            // `finish` saw no watcher yet and cancelled none.
                            if (done.get()) watcher?.cancel()
                        }
                    }
                }
            }
        } catch (e: TimeoutCancellationException) {
            log("navi", "drive to (${fmt(x)}, ${fmt(y)}) timed out")
            guard("navi") { RobotApi.getInstance().stopNavigation(reqId.getAndIncrement()) }
            DriveResult.Blocked("timeout")
        }
    }

    /**
     * Watches a running leg and ends it early, for three different reasons.
     *
     * **Handover.** Reports the leg as done a little before the goal, without
     * stopping the navigation. That is the whole trick of the smooth drive:
     * every navigation ends by braking to a standstill and turning onto the
     * goal heading. Whoever waits for it collects one halt per waypoint, and
     * around a pillar there are several. So we let go of the leg early and hand
     * the next waypoint over while the robot is still rolling.
     *
     * **Standstill.** Reports the leg as blocked once the robot has stopped
     * getting anywhere. This is what the time limit used to do, only it did it
     * after thirty seconds, by which time the outcome had been settled for
     * twenty five of them.
     *
     * **Endless avoidance.** Reports the leg as blocked while the robot is
     * still moving but only sideways. The standstill watch cannot see this one.
     *
     * The handover deliberately resumes regularly instead of cancelling: a
     * cancellation would run `invokeOnCancellation` and stop exactly the
     * navigation that is supposed to carry on. The other two do stop it, since
     * there the robot is meant to hold still while we replan.
     *
     * Runs in the driver's scope because there is no scope inside the
     * continuation. It cannot outlive the leg, `finish` and the cancellation
     * handler both end it.
     */
    private fun startLegWatcher(
        x: Double,
        y: Double,
        radiusMeters: Double,
        timeoutMs: Long,
        avoidingSince: java.util.concurrent.atomic.AtomicLong,
        finish: (DriveResult?) -> Unit,
    ) = scope.launch {
        // Patience grows with the time the leg was granted. A waypoint on a
        // route gets ten seconds and deserves no more than eight of standing
        // around; the retreat gets two minutes for the whole way back, and
        // ending that after eight seconds because somebody stepped in front of
        // the robot would throw away the last resort over nothing.
        val stallPatienceMs = maxOf(STALL_PATIENCE_MS, timeoutMs / PATIENCE_SHARE_OF_LIMIT)
        val avoidPatienceMs = maxOf(AVOID_PATIENCE_MS, timeoutMs / PATIENCE_SHARE_OF_LIMIT)
        // Cap the radius against the leg actually lying ahead. A replanned
        // route starts at the robot, so its first waypoints are barely a metre
        // away, and a radius larger than that hands over on the very first
        // poll, without the robot having moved a centimetre. On 2026-08-13
        // that swallowed three waypoints of an evasive route in 855 ms:
        // precisely the short sideways steps that lead around the obstacle. It
        // then drove at the waypoint behind them, straight back into the
        // blocked direction.
        //
        // Half the leg is the rule. The robot has to have covered the first
        // half of a leg before we let go of it, however generously the slider
        // is set.
        val legMeters = currentPose()?.let { kotlin.math.hypot(x - it.x, y - it.y) }
        val effective = if (legMeters == null) radiusMeters
        else minOf(radiusMeters, legMeters * HANDOVER_LEG_FRACTION)

        if (legMeters != null && effective < radiusMeters) {
            log("navi", "handover radius ${fmt(effective)} m, capped for a ${fmt(legMeters)} m leg")
        }

        // The last position that counted as movement, and when it was reached.
        // Compared against that rather than against the previous poll, so that
        // creeping along at a centimetre a second does not keep the clock alive
        // for ever.
        var lastMovedAt = System.currentTimeMillis()
        var lastMovedPose: RobotPose? = null

        while (isActive) {
            delay(LEG_POLL_MS)
            val pose = currentPose() ?: continue
            val now = System.currentTimeMillis()

            val movedMeters = lastMovedPose?.let {
                kotlin.math.hypot(pose.x - it.x, pose.y - it.y)
            }
            if (movedMeters == null || movedMeters >= STALL_MOVE_METERS) {
                lastMovedPose = pose
                lastMovedAt = now
            } else if (now - lastMovedAt >= stallPatienceMs) {
                log("navi", "stuck: no progress for ${(now - lastMovedAt) / 1000} s")
                guard("navi") { RobotApi.getInstance().stopNavigation(reqId.getAndIncrement()) }
                finish(DriveResult.Blocked("stuck"))
                return@launch
            }

            val avoidStarted = avoidingSince.get()
            if (avoidStarted != 0L && now - avoidStarted >= avoidPatienceMs) {
                log("navi", "avoiding for ${(now - avoidStarted) / 1000} s without getting past")
                guard("navi") { RobotApi.getInstance().stopNavigation(reqId.getAndIncrement()) }
                finish(DriveResult.Blocked("avoidance went nowhere"))
                return@launch
            }

            if (effective > 0.0) {
                val left = kotlin.math.hypot(x - pose.x, y - pose.y)
                if (left <= effective) {
                    log("navi", "handover ${fmt(left)} m before the waypoint, navigation keeps running")
                    finish(DriveResult.Arrived)
                    return@launch
                }
            }
        }
    }

    override suspend fun checkObstacle(
        startAngleDeg: Double,
        endAngleDeg: Double,
        distanceMeters: Double,
    ): ObstacleCheck {
        val id = reqId.getAndIncrement()
        val sector = "${fmt(startAngleDeg)}°..${fmt(endAngleDeg)}° / ${fmt(distanceMeters)} m"

        // A guard rather than a silent correction. On 2026-08-13 a sector with
        // a start angle of -7.5 degrees answered "blocked" in an empty hall,
        // every time, while every sector inside 0 to 360 answered correctly.
        // Whoever asks like that again gets a wrong measurement that looks
        // exactly like a real obstacle, and the only way out of that is this
        // line in the log.
        if (startAngleDeg < 0.0 || endAngleDeg > 360.0 || endAngleDeg <= startAngleDeg) {
            log("obstacle", "[$sector] WARNING outside 0..360, the SDK answers \"blocked\" to this")
        }

        fun answer(blocked: Boolean?, result: Int?, message: String?) =
            ObstacleCheck(startAngleDeg, endAngleDeg, distanceMeters, blocked, result, message)

        return try {
            withTimeout(OBSTACLE_CHECK_TIMEOUT_MS) {
                suspendCancellableCoroutine { continuation ->
                    val done = java.util.concurrent.atomic.AtomicBoolean(false)
                    fun finish(check: ObstacleCheck) {
                        if (done.compareAndSet(false, true)) continuation.resume(check)
                    }

                    val listener = object : CommandListener() {
                        override fun onResult(result: Int, message: String?) {
                            // Verbatim, every single one. This is the whole
                            // point of the first device run: nobody knows yet
                            // what the SDK answers here, and the log is the
                            // only place the answer can be read off.
                            log("obstacle", "[$sector] result=$result message=$message")
                            finish(answer(interpretObstacleAnswer(result, message), result, message))
                        }

                        override fun onError(errorCode: Int, errorString: String?) {
                            log("obstacle", "[$sector] ERROR $errorCode $errorString")
                            finish(answer(null, errorCode, errorString))
                        }

                        override fun onStatusUpdate(status: Int, data: String?) {
                            log("obstacle", "[$sector] status=$status $data")
                        }
                    }

                    runCatching {
                        RobotApi.getInstance()
                            .checkIfHasObstacle(id, startAngleDeg, endAngleDeg, distanceMeters, listener)
                    }.onFailure { e ->
                        log("obstacle", "ERROR checkIfHasObstacle ${e.javaClass.simpleName}: ${e.message}")
                        finish(answer(null, null, e.javaClass.simpleName))
                    }
                }
            }
        } catch (e: TimeoutCancellationException) {
            log("obstacle", "[$sector] no answer")
            answer(null, null, "timeout")
        }
    }

    /**
     * Turns the raw answer into "blocked yes or no", or into `null` when it is
     * not understood.
     *
     * The format is confirmed on the device (LuckiBot, 2026-08-13): the answer
     * arrives as `result=1` with the message `true` or `false`, and a full
     * sweep of 24 sectors takes about 800 ms. The first two branches below
     * carry that case.
     *
     * The rest stays as a fallback for the other robots, where nothing has been
     * measured yet. Neither the result code nor the message format is
     * documented anywhere, so a different firmware may well answer with a
     * distance instead of a boolean.
     */
    private fun interpretObstacleAnswer(result: Int, message: String?): Boolean? {
        val text = message?.trim().orEmpty()

        if (text.equals("true", ignoreCase = true)) return true
        if (text.equals("false", ignoreCase = true)) return false

        // A distance to the nearest obstacle in the sector. Zero or a negative
        // number is how such APIs usually spell "nothing there".
        val distanceKey = Regex("\"?(obs(?:tacle)?_distance)\"?\\s*[:=]\\s*(-?[0-9]*\\.?[0-9]+)")
        distanceKey.find(text)?.groupValues?.get(2)?.toDoubleOrNull()?.let { return it > 0.0 }

        // A bare number as the whole answer, read the same way.
        text.toDoubleOrNull()?.let { return it > 0.0 }

        if (text.contains("true", ignoreCase = true)) return true
        if (text.contains("false", ignoreCase = true)) return false

        return null
    }

    private fun fmt(v: Double) = String.format(java.util.Locale.ROOT, "%.2f", v)

    override fun say(text: String, ttsParams: Map<String, String>) = guard("tts") {
        if (!skillConnected) {
            log("tts", "ERROR SkillApi not connected, no classic speech service on this robot?")
            return@guard
        }
        val sid = "vergil-${System.currentTimeMillis()}"
        val entity = if (ttsParams.isEmpty()) {
            TTSEntity(sid, text)
        } else {
            TTSEntity(sid, text, HashMap(ttsParams))
        }
        log("tts", "playText(sid=$sid, params=$ttsParams) status=${skillApi.ttsPlayStatus} \"$text\"")
        skillApi.playText(entity, object : TextListener() {
            override fun onStart() = log("tts", "speech started")
            override fun onStop() = log("tts", "speech stopped")
            override fun onComplete() = log("tts", "speech complete")
            override fun onError() = log("tts", "ERROR during speech")
        })
    }
}
