# Vergil reference

The Kotlin original that `PLAN-NAV.md` ports to Java. Taken unchanged from the Vergil repo, branch `master`,
commit `e371cab`. Read only what the plan points to; the rest of these files is Vergil's own business
(speech, persons, the rotating scan, Vergil's screens).

| File | Read | What it shows |
|---|---|---|
| `NovaDriver.kt` | `readMapPgm`, line 762 | the map through `ShareMemoryApi`, released in `finally` |
| | `driveTo`, line 794, and `startAndAwait`, line 827 | one leg: up to three starts, the listener, which code means what |
| | `startLegWatcher`, line 1014 | handover, standstill, endless avoiding |
| | `NAVI_CODES` and `BLOCKED_STATUS`, lines 72 and 101 | the codes and why 1020 never ends a leg |
| | constants, lines 140 to 222 | every number with the measurement behind it |
| `VergilNavigator.kt` | `driveTo`, line 862, and `driveLoop`, line 973 | plan, legs, block, plan again, the heading of each point |
| | `legTimeoutMs`, line 1257, and `blockadeSpot`, line 1272 | the leg's time limit, where a block goes |
| | constants from line 1429 | `LEG_BASE_SECONDS`, `BLOCKADE_RADIUS_METERS` and their reasons |
| | **skip** `scanSurroundings`, `measureAndEscape`, `escapeStep`, `retreat` | not part of the plan |
| `Ral.kt` | `DriveResult`, line 55 | the four ends of a leg: Arrived, Blocked, Cancelled, Failed |
| `NavProbe.java` | all | the planner called from Java 8 with this repo's build rules; compiled with `javac --release 8`, run on the desktop and dexed with this repo's `d8` on 15 November |
| `navigation-stand.md` | "Was am Gerät gemessen wurde" | in German: what the SDK really does, the codes table, what held Vergil up |
| `geraetewissen.md` | "Karte und Punkte", "Bewegung" | in German: what LabLand knows about the Orionstar robots |

`NavProbe.java` runs against the office map that comes with the planner's tests. From the repo root, in
PowerShell or cmd (the quotes keep PowerShell from reading `;` as the end of the command):

```
javac --release 8 -cp "android/vendor/vergil-navigation.jar;android/vendor/kotlin-stdlib-2.0.20.jar" -d build-navprobe reference/vergil/NavProbe.java
java -cp "build-navprobe;android/vendor/vergil-navigation.jar;android/vendor/kotlin-stdlib-2.0.20.jar" NavProbe android/vendor/vergil-navigation-src/navigation/src/test/resources/labland.pgm
```

It prints the map size, a route of 15 waypoints over 34.7 m, "after block: no route" (the block closes the
corridor on that map) and "after clear: route".

The planner's own source, tests and build files are in `android/vendor/vergil-navigation-src/`.
Rebuilding the jar needs a JDK 17: `gradlew :navigation:test :navigation:jar` there.
