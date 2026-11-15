You are working in the Bellatrix Care Lab repo. Build the robot navigation described in `PLAN-NAV.md` in the repo
root: the app plans its own route with LabLand's Vergil planner and drives it waypoint by waypoint, behind the same
`robotGo` the pages use today. The presentation is on Tuesday 17 November, the device test on Monday.

Read first, completely: `PLAN-NAV.md`. Then `android/src/de/labland/bellatrix/RobotBridge.java`, `WebActivity.java`
(the bridge methods), `js/places.js`, `android/build.ps1`, `android/vendor/SOURCES.md`.

Reference, when the plan is not enough: `reference/vergil/README.md` says which functions of the Kotlin original
to read (`NovaDriver.kt`, `VergilNavigator.kt`), and `reference/vergil/NavProbe.java` shows the planner called from
Java 8, compiled and run on 15 November.

Rules:
- The jars in `android/vendor` stay as they are. If the planner seems wrong, stop and report it.
- The JS contract stays: `robotGo`, `robotStop`, `robotNav`, `robotPlaces`, `robotState` and every field of
  `navJson()`. New fields and the new `robotNavMode` are fine.
- Today's place navigation stays unchanged as mode `place`.
- This repo's build rules hold: `javac --release 8`, static nested classes only, no lambdas, no inner or anonymous
  classes.
- Every number from the table in `PLAN-NAV.md` becomes a named constant with a one-line reason.
- Where the plan does not fit the code, decide yourself, note it and go on. Ask before anything that changes the JS
  contract or moves the robot in a way the plan does not describe.
- Build with `android/build.ps1` and run the tests in `tests/`.

At the end, report: what changed, file by file; the build and test results; every question you decided yourself
(question, answer, reason); and write the device test sheet `TEST-NAV.md` in French, as the plan describes.
