# Plan NAV, update 1: the block goes where the robot met the obstacle

Written on 16 November 2026, for the route navigation built from `PLAN-NAV.md`. It changes one thing: where the
0.6 m block circle goes when a leg comes back Blocked. Everything else in `PLAN-NAV.md` stays as it is.

Source: Vergil `master`, commit `6364a07`, `Barriers.reached` (fixed on 15 November, after `PLAN-NAV.md` was
written from `e371cab`).

## Why

`startNavigation` hands the leg to the robot's own navigation, and that one does not stop in front of an
obstacle. It turns, looks for its own way round, through another corridor if need be, and keeps driving until our
watch ends the leg (standstill, avoiding, time). The pose at that moment says where the robot's own navigation
took it, not where the obstacle is.

Vergil, drive 47 on 15 November: twice the robot turned in front of a box and drove round a block, 1.4 m and 2.6 m
beside the route when the leg ended. The blocks laid from that pose lay 1.3 m before and 1.0 m past the box. A
block that misses the box leaves the next route free to lead through the same box again.

Bellatrix has the same rule: 0.9 m from the robot's pose towards the waypoint. On the same two blockades of drive 47
that circle lands 1.52 m and 1.74 m from the box, so the box stays free on the map. With the rule below it lands
0.26 m and 0.15 m from the box. `reference/vergil/BlockSpotCheck.java` computes both.

## The rule

1. **reached:** the point of the route, counted only up to the blocked waypoint, that lies farthest along and that
   a recorded pose came within 0.5 m of. That is where the robot met what blocked it.
2. **The centre** of the circle lies 0.6 m further along the route than reached. If that point is closer than
   0.9 m to where the robot stands now, walk on along the route in 5 cm steps until it is not.
3. **Fallback, the old rule unchanged** (0.9 m from the robot towards the waypoint, at the waypoint if closer): when
   no pose came within 0.5 m of the route, or when the route ends before a point keeps the 0.9 m.

A robot that stayed on the route gets its block about where it got it before, 0.9 m ahead of it. The one
difference: when the waypoint was closer than 0.9 m, the old rule stopped at the waypoint, the new one goes on
along the route.

## What to build

### 1. `BlockSpot.java`

`reference/vergil/BlockSpot.java` implements the rule: plain Java 8 without Android, static methods and one static
nested class, package `de.labland.bellatrix`. Copy it to `android/src/de/labland/bellatrix/BlockSpot.java` and keep
the code as it is. If the build does not pick up a new file in that folder by itself, add it where `build.ps1`
lists the sources.

```java
BlockSpot.Spot spot = BlockSpot.centre(route, blocked, driven, pose.x, pose.y);
planner.block(spot.x, spot.y, BLOCK_RADIUS_METERS);   // 0.6, as before
```

- `route`: the waypoints of the route being driven as `double[] {x, y}`, `points.get(0)` (the robot) first.
- `blocked`: the index in `route` of the waypoint whose leg came back Blocked, the index of the loop
  "for each point from index 1".
- `driven`: the poses of piece 2, the pose at the blockade last.
- `pose`: where the robot stands now, the pose the drive reads after Blocked today.
- `spot.fromRoute`, `spot.anchorX`, `spot.anchorY`: what the circle was laid from, for the log.

`BlockSpot.centre` replaces the drive's own computation of the block spot. The old rule lives on inside it as
`aheadOfRobot`, so there is one copy of it, not two.

### 2. Record the poses of the route

- One list of `double[] {x, y}` per route. Empty it every time a new route is planned: at the start, after every
  Blocked, after `clearObstacles()` and after a recovery. A pose from an earlier route can lie next to the new one
  and would count as progress on it.
- Add every pose the 250 ms watch reads, in order. A 5 minute drive is 1200 poses at most, which is nothing.
- After Blocked, add the pose the drive reads for the block, then call `BlockSpot.centre`.
- The list belongs to the drive. If the watch runs on another thread than the drive loop, hand it over the way
  the other leg fields are handed over today.

### 3. Log

One line per block, under `RobotRoute` as today:

```
block (14.10, 4.25) from route at (13.63, 3.90), robot at (11.66, 3.21)
block (2.64, -1.36) from robot at (2.00, -2.00)
```

### 4. `PLAN-NAV.md`

In "The drive", the `Blocked ->` line now says: block a circle of 0.6 m at `BlockSpot.centre`
(`PLAN-NAV-UPDATE-1.md`). In "The numbers", the row "Block" points here and the rows below join the table.

## The numbers

The new ones are named constants with their reasons in `BlockSpot.java`.

| What | Value | Why |
|---|---|---|
| On the route | 0.5 m | above the robot's sway and the corners the handover cuts (up to 0.47 m on drive 47), below a detour round a block (1.4 and 2.6 m) |
| Centre past reached | 0.6 m | the circle begins where the robot met the obstacle; on drive 47 the box lay 0.3 m and 0.7 m past reached |
| Clearance to the robot | 0.9 m | the old lookahead, same reason: 0.9 > 0.6 keeps the robot's own cell free |
| Step | 0.05 m | one cell of the planner's grid |
| Circle | 0.6 m | unchanged |

Why 0.6 m and not the old 0.9 m past reached: the 0.9 m was measured from the robot and kept its own cell free. Now
the circle is measured from reached, and the clearance to the robot is checked on its own. With 0.9 m past reached
the circle on drive 47 lay 0.54 m from the first box, just at its edge; with 0.6 m it lies 0.26 m from it.

## Check on the desktop

From the repo root, like `NavProbe`:

```
javac --release 8 -d build-blockspot reference/vergil/BlockSpot.java reference/vergil/BlockSpotCheck.java
java -cp build-blockspot BlockSpotCheck
```

Checked on 16 November with JDK 17 and `--release 8`, it prints:

```
ok  drive 47, first blockade: circle at (14.10, 4.25), 0.26 m from the obstacle (old rule (12.49, 3.56), 1.52 m)
ok  drive 47, third blockade: circle at (13.51, 1.69), 0.15 m from the obstacle (old rule (13.69, -0.15), 1.74 m)
ok  on the route: (3.90, 0.00) from the route
ok  off the route: (3.60, 0.00) from the route
ok  never on the route: (2.64, -1.36) from the robot
ok  bending route: (2.60, 0.00) from the route
ok  route too short: (0.50, 0.00) from the robot
ok  reached: (3.00, 0.00)
all passed
```

After copying, run it once more against the copy that goes into the APK:

```
javac --release 8 -d build-blockspot android/src/de/labland/bellatrix/BlockSpot.java reference/vergil/BlockSpotCheck.java
java -cp build-blockspot BlockSpotCheck
```

If `tests/` can run Java, the same cases may go there as well.

The two drive 47 cases are real data: route, poses and the boxes as Sebastian marked them on the map. The other
cases are built by hand: on the route, off it, never on it, a pose beside a later part of a bending route, and a
route that ends too early.

## Device test

Add one point after point 4 of `TEST-NAV.md`, in French like the rest:

- **A box the robot cannot pass**, across a narrow corridor, so its own navigation turns away. Expected: the log
  shows `block … from route at …`, and after `replanning` the robot takes another way and does not drive back to
  the same box. The block's centre lies 0.6 m to about 1 m past the `at` point.

Point 4 as it stands (a box in the corridor) is run again as well.

## Not in this update

- Vergil's lines and arcs: still not part of the plan.
- The setting for the line's thickness and the gap fix in `OccupancyGrid.addTemporaryLine`, both of 15 November:
  they concern Vergil's lines only. `planner.block` draws a filled circle and has no gap.
