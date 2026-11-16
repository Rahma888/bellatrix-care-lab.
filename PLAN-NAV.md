# Plan NAV: Bellatrix plans its own route (the Vergil planner)

Written on 15 November 2026 for the presentation on Tuesday 17 November. Device test on Monday 16 November.
Source of the planner and of every number below: LabLand's Vergil robot app (repo `vergil`, branch `master`,
commit `e371cab`), driving on the LuckiBot until August 2026 and on the GreetingBot Nova since.

## Why

Today `RobotBridge.go(place)` hands the place name to the robot's own navigation (`startNavigation(id, place, …)`).
When the robot stops short, the bridge stops, waits and starts **the same order** again until 5 minutes are over.
When the robot's planner cannot get past something that is not on its map, every retry fails the same way.

Vergil had the same problem and solved it like this:

1. Read the robot's map (PGM) before every drive.
2. Plan the route in the app: A\* on a 5 cm grid, every obstacle grown by 0.32 m.
3. Give the robot only the next waypoint (`startNavigation` on a `Pose`) and hand over to the following one while
   it is still rolling.
4. When a leg gets stuck: block that spot in the app's copy of the map and plan again.

Step 2 comes ready made as a jar. Steps 1, 3 and 4 are ported to Java in `RobotBridge`'s style.

## What stays as it is

- **The pages and the JS contract:** `robotGo`, `robotStop`, `robotNav`, `robotPlaces`, `robotState`, and every
  field of `navJson()` (`state`, `place`, `reason`, `since`, `attempt`, `waitedS`, `code`, `codeText`).
  `js/places.js` only gets two reason texts and a switch (piece 6).
- **Everything else in `RobotBridge`:** connection, polling, emergency stop, suspend and recovery, relocalisation,
  the refusals at the start of `go()`.
- **Today's place navigation**, unchanged, as mode `place`. It is the fallback for Tuesday: one switch away.

## Pieces

### 1. Two jars in `android/vendor`

| File | What | Size | SHA-256 |
|---|---|---|---|
| `vergil-navigation.jar` | the planner: `PgmMap`, `OccupancyGrid`, `GridPathfinder`, `PathSimplifier`, `RoutePlanner`, `NavLog`. Kotlin sources of Vergil `robot/navigation` at `e371cab`, unchanged, compiled to Java 8 class files. Source, tests and build files in `android/vendor/vergil-navigation-src/` | 53,513 bytes | `f931c57b3e209f76d500b3c829e13978516e500781693f99218291951fb96910` |
| `kotlin-stdlib-2.0.20.jar` | the Kotlin runtime the planner needs. `org.jetbrains.kotlin:kotlin-stdlib:2.0.20` from Maven Central, Apache 2.0 | 1,747,659 bytes | `fb169596659a518357c4b2c16f43dc75ab1c4980565ed4b4a317a050e5e39006` |

- `android/build.ps1`: add both to `$Vendor`. They then go to the `javac` classpath and to `d8`, like
  `robotservice.jar`.
- `android/build.ps1`: after `d8`, fail the build if `classes2.dex` exists. `aapt add` packs only `classes.dex`,
  and a second file would be missing from the APK without any error. Measured on 15 November: the head APK's jars
  (robotservice, gson, the four TFLite jars) are 10,126 method references, with planner and Kotlin 22,047. The
  limit is 65,536.
- `android/vendor/SOURCES.md`: one row per jar with the values above.

**Already checked on 15 November** with this repo's own `android.jar`, `robotservice.jar` and `d8` (build-tools
34.0.0): `javac --release 8` compiles a Java caller against the jar. `d8 --release --min-api 26` dexes that caller
with robotservice, gson, TFLite, planner and Kotlin without a warning. On the desktop the caller planned a route on
Vergil's office map (1120 × 600 cells, 15 waypoints, 34.7 m) and around a blocked spot. The caller is
`reference/vergil/NavProbe.java`. On a robot the jar has not run inside Bellatrix yet.

### 2. Calling the planner from Java

```java
OccupancyGrid grid = PgmMap.INSTANCE.parse(pgmBytes, Double.valueOf(PgmMap.DEFAULT_ROBOT_RADIUS_METERS)); // 0.32
RoutePlanner planner = new RoutePlanner(grid);
RoutePlanner.Route route = planner.plan(startX, startY, goalX, goalY, Double.valueOf(10.0)); // null: no path
List<PathSimplifier.Waypoint> points = route.getWaypoints();   // getX(), getY(), getHeading() in radians
planner.block(x, y, 0.6);      // a blocked circle, valid until clearObstacles()
planner.clearObstacles();
```

- `points.get(0)` is the robot's own position. Drive from index 1. No point after it means "already there".
- A Kotlin `object` is reached through `INSTANCE`. Kotlin's default arguments do not exist in Java: pass every one.
- `PgmMap.parse` throws `PgmMap.ParseException` on a broken file, but Kotlin does not declare it. `javac` refuses
  `catch (PgmMap.ParseException e)` ("never thrown"), so catch `Exception`.
- Parsing and inflating took 84 ms on the desktop. Reading, parsing and inflating together took 209 ms on the Nova
  (780 × 1120 cells). Never on the UI thread.
- Optional: `NavLog.INSTANCE.setSink(new RouteLog())`, where `RouteLog` is a static nested class implementing
  `NavLogSink` and writing to logcat under `RobotRoute`. Without it the planner stays silent.

### 3. Reading the map (port of `NovaDriver.readMapPgm`)

```java
ShareMemoryApi api = null;
try {
    String name = RobotApi.getInstance().getMapName();
    if (name == null || name.isEmpty()) return null;
    api = ShareMemoryApi.getInstance();
    ParcelFileDescriptor pfd = api.getMapPgmPFD(name);
    if (pfd == null) return null;
    // read every byte of new FileInputStream(pfd.getFileDescriptor()), close the stream
} catch (Throwable t) {
    return null;                                   // and log it
} finally {
    try { if (api != null) api.releaseGetMapPgmPFD(); } catch (Throwable t) { /* log */ }
}
```

- **Always release**, also after an error. Otherwise the shared memory stays taken and the next call gets nothing.
- **Read it again before every drive**, never keep a copy. The blocks of the last drive are gone that way, and a
  map corrected in the Orionstar tool arrives: editing a map does not change its name, so nothing else would tell.
- **No map, or a map that does not parse:** this one drive runs in mode `place` (today's code). Log it and put
  `route: no map, robot navigation` into `codeText`, so the Navigation test panel shows it.

### 4. Driving a route (port of `VergilNavigator.driveLoop`, `NovaDriver.driveTo`, `startLegWatcher`)

**Threading.** One drive is one dedicated thread running a plain sequential loop. The SDK listeners only write
into volatile or atomic fields of their leg, and the loop looks at them every 250 ms. Why: the logic is sequential
(plan, leg, leg, block, plan again), and as a chain of `postDelayed` tasks nobody can see any more which answer
belongs to which leg. The thread checks the drive's token before every SDK call and every wait, so `stop()`, the
emergency stop and a newer drive end it the way they end a drive today. The repo's build rules hold: a static
nested `Runnable` and static nested listeners, no lambdas, no inner or anonymous classes.

**`go(place)` in mode `route`:** the same refusals as today, then the goal is the place's `Pose` from
`getPlaceList()` (x, y and theta), state `moving`, start the drive thread.

**The drive:**

```
read the map (piece 3) and parse it; planner = new RoutePlanner(grid)
replans = 0
repeat:
    end if the token changed, or after 5 minutes ("blocked")
    pose = getCurrentPose()
    route = plan(pose, goal, maxLeg 10 m)
    if no route and blocks exist: clearObstacles() and plan once more      (see "Deviation" below)
    if still no route: failed, reason "no-route"
    for each point from index 1:
        last = (it is the final point)
        theta = last ? goal theta : heading of the point BEFORE it   (the direction the robot arrives in)
        result = leg(point, theta, tolerance 0.3 m, timeout, handover = last ? 0 : 1.2 m)
        Arrived   -> next point
        Blocked   -> block a circle of 0.6 m at BlockSpot.centre (PLAN-NAV-UPDATE-1.md: where the robot met the
                     obstacle on the route; the old rule only as the fallback); replans++;
                     more than 6 -> failed, reason "blocked"; else reason "replanning", plan again
        Cancelled -> a stop nobody here asked for: failed, reason "stopped"
        Failed    -> stopNavigation, failed, with the SDK code
    all points done: arrived
```

`timeout` of a leg = 6 s + 4 s per metre of the leg, at most 30 s.

**One leg:**

```
up to 3 starts; before the 2nd and 3rd: stopNavigation, then wait 150 ms, then 400 ms
    startNavigation(id, new Pose((float) x, (float) y, (float) theta), tolerance, timeout, listener)
each leg has its own listener object, and the first answer of the leg counts, from the listener or from the
watch below. Everything later is ignored: after a handover the old leg's listener still answers 3 when the next
start stops it, and that must not end the new leg.
listener:
    onResult 1                  -> Arrived
    onResult 3                  -> Cancelled (the stop's own answer)
    onResult other              -> Failed
    onError -1 or -6            -> busy: the next start
    onError -113                -> Arrived (already at the goal)
    onError -109                -> Blocked (the SDK's own time limit)
    onError other               -> Failed
    onStatusUpdate 1018         -> avoiding since now (only if not set yet); reason "avoiding"
    onStatusUpdate 1019         -> avoiding over
    onStatusUpdate 1025         -> stopNavigation, Blocked
    onStatusUpdate 1020         -> log only, never end a leg on it
watch every 250 ms:
    handover  radius = min(handover, half the leg's length measured at the leg's start);
              closer than that to the point -> Arrived, WITHOUT stopNavigation (the next start takes over)
    standstill less than 0.10 m from the last pose that counted as moving, for 8 s -> stopNavigation, Blocked
    avoiding  1018 without 1019 for 12 s -> stopNavigation, Blocked
    time      timeout + 5 s since the start -> stopNavigation, Blocked
3 busy answers in a row -> Failed "busy"
```

The handover is why the robot does not stop at every waypoint: every navigation ends by braking and turning onto
its goal heading. Because the SDK refuses a new goal while one runs, the next start answers `-1` and goes through
the stop and 150 ms path, which is quick (`stopNavigation` confirms in 20 to 40 ms).

**Suspend and recovery.** While `suspended`, the drive thread waits and ignores the answers of the interrupted leg.
After `onRecovery` it waits 1.5 s (`RESUME_DELAY_MS`) and plans again from the fresh pose. That does not count as
a replan. The 5 minutes keep running.

**Deviation from Vergil, on purpose.** Vergil `master` turns on the spot after three failed attempts, measures the
surroundings and steps aside (the "rotating scan", about 20 s standing still each time). That is left out here.
Instead, when the blocks leave no route, they are all dropped and the plan is made once more. Without that, blocks
can pile up around a robot that has not moved, and then the robot has walled itself in (Vergil, 13 August). Vergil's
newer method (lines across the route, arcs in front of the robot) is not tested on a robot yet and is not part of
this plan.

### 5. `navJson()` in mode `route`

- `state`: as today (`idle`, `moving`, `arrived`, `failed`).
- `reason` while moving: `""`, `avoiding`, `replanning` (new), `waiting` (between starts), `suspended`.
- `reason` at the end: as today (`blocked`, `stopped`, `emergency`, `disconnected`), plus `no-route` (new).
- `attempt`: replans + 1. `code` and `codeText`: the last SDK code, as today.
- New fields: `mode` (`route` or `place`), `leg` and `legs` (for example 3 of 15). Old readers ignore them.

### 6. The switch and the texts (`js/places.js`, `WebActivity`)

- A new bridge method `robotNavMode(mode)` sets `route` or `place`. `stateJson()` reports `navMode`.
- The Navigation test panel gets the switch "Route planned by Bellatrix / Robot's own navigation". It is saved in
  localStorage `bellatrix-nav-mode` and sent to the bridge when a page starts and whenever it changes.
  Default `route`. A drive that is running keeps its mode.
- The panel shows `leg` / `legs` of the running drive and the mode of each logged drive.
- `REASONS` gets `replanning` ("Blocked: planning a way around.") and `no-route` ("No way on the map: closed door
  or obstacle."), in English, French and German like the existing texts.

### 7. Log

Tag `RobotRoute`, one line each: map read (name, bytes, ms), plan (points, metres, ms), start and end of every leg
(index, result, why), every block (x, y), every replan, the end of the drive. Place names only, never a resident.

## The numbers

Each one a named constant with a one-line reason in the code. All of them come from Vergil, measured on the robots.

| What | Value | Why |
|---|---|---|
| Inflate obstacles | 0.32 m | the planner sees the robot as a point; grown obstacles turn "the point fits" into "the robot fits" |
| Longest leg | 10 m | longer straights get intermediate points |
| Tolerance | 0.3 m | how close counts as reached |
| Handover | 1.2 m, at most half the leg | without the cap, the short legs of a new route around an obstacle counted as reached before the robot had moved (3 points in 855 ms, 13 August) |
| Leg timeout | 6 s + 4 s/m, at most 30 s | a fixed 30 s spent 4 of 7 minutes of a drive waiting on legs already decided |
| Standstill | less than 0.10 m in 8 s | the robot first turns on the spot, a half turn takes 4 s |
| Avoiding | 12 s from the first 1018 | of 10 avoidance moves that ended by themselves, 9 ended within 10 s |
| Block | circle of 0.6 m at `BlockSpot.centre`, see `PLAN-NAV-UPDATE-1.md` | where the robot met the obstacle, not where its own navigation has taken it by the end of the leg |
| On the route (update 1) | 0.5 m | above the robot's sway and the cut corners of the handover, below a detour round a block |
| Centre past reached (update 1) | 0.6 m | the circle begins where the robot met the obstacle |
| Clearance to the robot (update 1) | 0.9 m | the old lookahead: 0.9 > 0.6 keeps the robot's own cell free; also the fallback, 0.9 m from the robot towards the point |
| Step (update 1) | 0.05 m | one cell of the planner's grid |
| Replans | at most 6 | |
| Drive limit | 5 min | today's `GLOBAL_LIMIT_MS` |
| Starts per leg | 3, after `stopNavigation` 150 ms then 400 ms | the SDK answers `-1` to any new goal while a navigation runs |
| Watch | every 250 ms | |
| Speed | the SDK's default, about 0.7 m/s | Vergil `master` passes none either |

## What the SDK really does (measured, do not find it out again)

- `startNavigation` never takes a new goal while a navigation runs: always `-1`.
- `1018` and `1019` are the start and end of an avoidance move, not a failure. `1020` ("outside the map") comes in
  the middle of drives that end well. `1025` really means no path. `-109` is the SDK's own time limit: a blockage,
  not a failure. `-113` means already at the goal: a success.
- After moving by hand (`goForward`, `turnLeft`), every goal is refused with `1020`. Start from a clean position.
- Not localised: almost everything is refused. On the charging pile RobotOS keeps control (`onSuspend`).
- `getCurrentPose`, `getPlaceList` and `getMapPgmPFD` are binder calls: drive thread or worker thread only.
- `startNavigation(Pose)` and `getMapPgmPFD` ran on ROM V10.5 (LuckiBot), V11.2 (CarryBot) and V12.1 (Nova), not on
  this LuckiBot Pro yet. That is the first point of the device test.

Background, in German: `reference/vergil/navigation-stand.md` (how a drive runs, the codes table, what held Vergil
up) and `reference/vergil/geraetewissen.md` (installing, adb, map, movement).

## Not in this plan

- The rotating scan and the step aside (see "Deviation").
- Going back after giving up: the pages already send the robot back to base.
- Vergil's newer lines and arcs.
- A speed setting.

## Device test on Monday

Write it as `TEST-NAV.md`, in French like the other test sheets:

1. Install. Log with the robot's time zone (the adb shell is set to UTC+8 by the manufacturer):
   `adb -s 192.168.69.103:5555 shell 'TZ=$(getprop persist.sys.timezone) logcat -s RobotBridge:V RobotRoute:V'`
2. Navigation test panel, mode `route`, one place. The log must show the map read (bytes) and the plan (points).
   If the map cannot be read, mode `place` is the way for Tuesday.
3. Every place of the presentation once: `arrived`. Watch whether the robot rolls on through the waypoints.
4. A box in the corridor: `replanning`, then it arrives another way, or ends with `blocked` / `no-route` within the
   limits.
5. STOP during a drive, then the emergency stop during a drive: the robot stands at once, the panel says why.
6. Mode `place`, one drive: today's behaviour, unchanged.
7. The whole presentation route twice in a row.

## At the end of the work

- What changed, file by file, and the result of `android/build.ps1` and of the tests in `tests/`.
- Every question decided alone: question, answer, reason.
- `TEST-NAV.md`.
