You built the route navigation of `PLAN-NAV.md`. `PLAN-NAV-UPDATE-1.md` in the repo root changes one thing in it:
where the 0.6 m block circle goes when a leg comes back Blocked. Today it goes 0.9 m from the robot's pose, but by
then the robot's own navigation has often driven the robot away from the obstacle, so the circle misses it.

Read first, completely: `PLAN-NAV-UPDATE-1.md`. Then `reference/vergil/BlockSpot.java` and
`reference/vergil/BlockSpotCheck.java`. `reference/vergil/Barriers.kt` is the Kotlin original; read only `reached`
and `nearestOnRoute` in it.

Rules, as for `PLAN-NAV.md`:
- The jars in `android/vendor` stay as they are.
- The JS contract stays: `robotGo`, `robotStop`, `robotNav`, `robotPlaces`, `robotState`, `robotNavMode` and every
  field of `navJson()`.
- Mode `place` stays unchanged.
- `javac --release 8`, static nested classes only, no lambdas, no inner or anonymous classes.
- Copy `BlockSpot.java` unchanged. If it seems wrong, stop and report it.
- Where the update does not fit your code, decide yourself, note it and go on.
- Build with `android/build.ps1`, run the tests in `tests/` and `BlockSpotCheck` as the update describes.

At the end, report: what changed, file by file; the build and test results and the output of `BlockSpotCheck`;
every question you decided yourself (question, answer, reason); and the new point in `TEST-NAV.md`, in French.
