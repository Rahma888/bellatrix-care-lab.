package de.labland.vergil.navigation

/**
 * Logging seam of the path planner.
 *
 * The module is deliberately free of Android so that its tests run on the
 * development machine. `android.util.Log` would rule that out, hence this
 * seam: on the robot the app installs a redirect to logcat, in tests it stays
 * silent or records along.
 */
fun interface NavLogSink {
    fun log(level: NavLogLevel, tag: String, message: String)
}

enum class NavLogLevel { DEBUG, INFO, WARN, ERROR }

object NavLog {
    /** Default: silent. Whoever wants to see something hooks in. */
    @Volatile
    var sink: NavLogSink = NavLogSink { _, _, _ -> }

    fun d(tag: String, message: String) = sink.log(NavLogLevel.DEBUG, tag, message)
    fun i(tag: String, message: String) = sink.log(NavLogLevel.INFO, tag, message)
    fun w(tag: String, message: String) = sink.log(NavLogLevel.WARN, tag, message)
    fun e(tag: String, message: String) = sink.log(NavLogLevel.ERROR, tag, message)
}
